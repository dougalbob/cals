# Frontend Strategy — React + TypeScript + Vite + Tailwind CSS

| Field | Value |
|---|---|
| **Status** | 🟡 **PROPOSED overall; Phase 11 authorized on 2026-10-02.** The React spike exists at [`web/frontend/`](../../web/frontend/README.md); Phase 11 is building the safe foundation, while later screen migrations and production cutover remain phase-gated |
| **Date raised** | 2026-10-02 |
| **Decision owner** | @dougalbob |
| **Scope** | `web/**` (presentation layer) plus the static-file serving block in `cmd/server/main.go` |
| **Explicitly out of scope** | `internal/**`, the SQLite schema, all `/api/*` request/response contracts, Cloudflare Zero Trust auth, Docker/Unraid deployment topology |
| **Related** | [`git-workflow.md`](./git-workflow.md), [`local-development.md`](./local-development.md), [`../product/vision-and-open-questions.md`](../product/vision-and-open-questions.md) |

---

## 1. TL;DR

**Recommendation: yes — but as a phased frontend-only migration, never a big-bang rewrite.**

Adopt **React 19 + TypeScript + Vite (8) + Tailwind CSS (v4)**, with **React Router** for navigation and **TanStack Query v5** for server state. Keep the Go backend exactly as it is: the same handlers, the same SQLite database, the same `/api/*` endpoints, the same Cloudflare Access middleware, the same single-container Docker deployment. We only replace how the UI is rendered and built.

This is a *frontend rebuild of a Go application*, not a rewrite of the Go application. The API contract is the seam that makes this safe: every screen can be migrated one at a time, and the old vanilla-JS UI can keep serving traffic until the new one has fully replaced it.

### Headline product requirement: materially improve the UI and daily experience

**UI/UX improvement is a headline requirement for cals and the central user-facing reason for this rebuild.** This is not successful merely because React, TypeScript, tests or a new bundle exist. Each migrated screen must make real daily use feel better—especially the primary user's phone-based food and drink logging—and must be reviewed in a working mobile-sized preview against the current app. Preserve familiar, useful patterns (including the quick drink selector) unless the replacement is demonstrably clearer or faster. Do not cut over on functional parity alone; a phase's PR should say what user experience improved and include a preview or screenshots for review.

Phase 11 is intentionally foundational and may make no visible UI change. That is acceptable only because it enables the UI work; it does not waive the visible-improvement acceptance gate for Diary and later screen phases.

---

## 2. Where cals is today

| Layer | Current state |
|---|---|
| Backend | Go 1.22, `net/http` `ServeMux`, ~5,000 lines across `internal/**`, SQLite (WAL), CGO build |
| Frontend | ~4,500 lines of vanilla JS + CSS + a 431-line `index.html` shell, no build step, no package manager |
| Structure | Global objects (`App`, `API`, `Modal`, `Recipes`, `Metrics`, `Foods`, `Search`, `Nutrition`, `ImageCrop`) and direct DOM manipulation |
| Serving | Go serves `web/templates/index.html` as SPA fallback; `/static/*` served with `no-cache` for `.js`; PWA assets in `web/public` |
| Auth | Cloudflare Zero Trust JWT (`CF_TEAM_DOMAIN`, `CF_POLICY_AUD`) on every protected route |
| Deploy | Single Docker image, Unraid, `cals-counter` container, version stamped in 3 files by `update-version.sh` |
| Product surface | 6 views: Diary, Metrics, Foods, Recipes, Nutrition, Settings |
| Maintenance | AI-assisted (GitHub Copilot branches, Arena sessions); documentation now lives in `docs/` (the old `ai_contextual_docs/context.txt` is legacy and unmaintained) |

The project is genuinely working and in daily use. Any proposal that puts it at risk needs a strong justification, so the justification below is deliberately conservative.

---

## 3. The proposed stack

Versions are what was current at the time of writing (October 2026). Pin exact versions in `package.json` at implementation time and record them here.

| Concern | Choice | Version at time of writing | Why |
|---|---|---|---|
| UI library | **React** | 19.3.x | Largest ecosystem; React Compiler 1.0 is stable so manual `useMemo`/`useCallback` choreography mostly disappears |
| Language | **TypeScript** | 5.x (strict) | The API has ~55 endpoints and many nullable fields (e.g. `serving_grams`, `target_weight_kg`); types are where most historical bugs came from |
| Build tool | **Vite** | 8.x | Dev server with HMR, Rolldown-based production builds; requires Node 20.19+/22.12+ |
| Styling | **Tailwind CSS** | 4.3.x | CSS-first config via `@theme`; maps almost 1:1 onto the existing `themes.css` custom properties |
| Routing | **React Router** | 7.18 LTS or 8.x | URL becomes the source of truth for the current date/view (fixes refresh + back-button behaviour on mobile) |
| Server state | **TanStack Query** | 5.x | Caching, retries, optimistic updates for diary/weight entry without hand-rolled fetch bookkeeping |
| Forms & validation | **React Hook Form + Zod** (proposed addition) | latest | The app is form-heavy (weight, measurements, recipe builder, settings); Zod schemas double as runtime API response guards |
| Charts | **react-chartjs-2** (proposed addition) | latest | Keeps the existing Chart.js 4 look and behaviour; Recharts is the alternative if we want a fully React-native chart API |
| PWA | **vite-plugin-pwa** (Workbox) (proposed addition) | latest | Replaces the hand-written `sw.js` caching rules |
| Unit/component tests | **Vitest + React Testing Library + MSW** | Vitest 5.x | Fast, Vite-native, and MSW lets components be tested against the real API shapes |
| E2E tests | **Playwright** | latest | Cover only the critical flows: log food, log weight, build a recipe |
| Lint/format | **ESLint + Prettier** (Biome is a valid single-tool alternative) | latest | Cheap, deterministic checks that AI agents can run |
| Package manager | **npm** (pnpm optional) | — | npm ships with Node; one less thing to install on the Unraid/dev box |
| Runtime for builds | **Node 22 LTS** (`.nvmrc` + `node:22-alpine` build stage) | — | Node never ships to production — it is a build-time dependency only |

### Deliberately *not* proposed

No Next.js, no SSR, no React Server Components, no Redux, no GraphQL, no component library (MUI/Ant/shadcn). Reasons in §8.

---

### 3.1 What must be preserved (added 2026-10-02)

The rebuild is frontend-only, but these existing behaviours and explicit product requirements are load-bearing and must survive it:

1. **Identity comes from outside the app.** Cloudflare Access (email rule) passes the email; the app auto-creates and shows that person's data. **There is no login page, and the rebuild must not add one.**
2. **Two real users**, each with their own diary, goals and water target. Your wife is the primary user today, so her flows — daily food logging and the water target, on a phone — should lead the phase priorities.
3. **No generic seeded opinions.** New users currently get Coffee/Water/Beer/Milk created automatically; per decision 8, the rebuild should not invent arbitrary drinks (or anything else) on someone's behalf.
4. **The Diary needs familiar quick drinks.** The quick-add selector must make **Tea, Coffee and Water** easy to add, using the signed-in user's drink records and their configured calories/volume—not hard-coded nutrition assumptions. Whether those three are provisioned as editable starter records for new users remains to be decided before Phase 12.
5. **The UI itself must improve.** Every screen phase must demonstrate a user-visible improvement, with the primary user's mobile workflow leading review; technical parity alone does not pass.

`DEV_MODE` ([`local-development.md`](./local-development.md)) exists so both users' screens can be developed locally against a copy of the data.

## 4. Why this stack (the honest case)

1. **The rebuild risk is confined to one layer.** The Go API, database, auth and deploy stay untouched. If the migration stalls halfway, the app still works — the old UI is still there.
2. **Typed contracts kill a whole bug class.** The version history in the (now legacy) `ai_contextual_docs/context.txt` shows repeated fixes for null/`NullFloat64` handling, state desync in the recipe editor, duplicate event handlers and date-format drift. TypeScript + a single source of truth for state removes most of that category rather than patching instances of it.
3. **Declarative state fixes the mobile UX complaints that keep coming back.** Diary refresh, bank recalculation, recipe picker, drinks popup — these are all "the DOM and the data got out of sync" problems. React's model makes that class of bug structurally hard.
4. **Ecosystem + AI-assistance coverage.** React + TypeScript has more training data, more Stack Overflow answers, more agent tooling and more Copilot/Arena competence than any other frontend stack. For a project maintained largely by AI agents in short sessions, that matters more than raw bundle size.
5. **A build step buys real leverage.** `tsc --noEmit`, `eslint`, `vitest`, `vite build` are deterministic checks an agent (or CI) can run and *fail on*, instead of eyeballing 647 lines of `app.js`.
6. **Prior art.** The same approach (Go API kept intact, frontend rebuilt with a typed SPA toolchain) has worked well on a comparable project.
7. **Long-term maintenance.** The frontend stops being bespoke and starts being conventional: any React developer — human or AI — can pick it up.

### The honest counter-argument

This is real work for a working app, and it introduces Node into the *build* toolchain where today there is none. If the pain is mainly "a few screens are janky", targeted fixes to the existing vanilla JS are cheaper. **The recommendation is conditional on wanting continued feature work** (recipe improvements, nutrition expansion, multi-user) — the rebuild pays for itself there, and does not if the app is effectively finished.

---

## 5. Target architecture

The diagram below is the **post-cutover target**. During Phase 11, the React bundle is served only under `/next/`; the existing vanilla app remains the default at `/` until a later, owner-reviewed cutover.

```
┌──────────────────────────────────────────────────────────────┐
│ Browser (PWA, mobile-first)                                  │
│  React 19 + TS + Tailwind v4                                 │
│   ├── React Router     → /diary/:date, /metrics, /foods, …   │
│   └── TanStack Query   → query keys: ['diary', date] …       │
└───────────────────────┬──────────────────────────────────────┘
                        │ same-origin fetch /api/... (CF Access cookie)
┌───────────────────────▼──────────────────────────────────────┐
│ Go server (unchanged)                                        │
│  ├── /api/*        → existing handlers (internal/**)         │
│  ├── /assets/*     → web/dist/assets (hashed, immutable)     │
│  ├── /public/*     → manifest, icons, sw.js                  │
│  └── /*            → web/dist/index.html  (SPA fallback)     │
│                                                              │
│  SQLite + Cloudflare Zero Trust + Docker/Unraid (unchanged)  │
└──────────────────────────────────────────────────────────────┘
```

Key implementation notes for the serving layer:

- **Build output** → `web/dist/` (git-ignored). Dev proxy: `vite` on `:5173` proxies `/api`, `/public`, `/health` to the Go server on `:8150`. The Vite dev server must bind `0.0.0.0` and set `server.allowedHosts` when run behind a proxy/preview host.
- **Caching becomes trivial.** Vite emits content-hashed asset filenames, so `/assets/*` can be served `Cache-Control: public, max-age=31536000, immutable` and `index.html` `no-store`. That replaces the current "never cache any `.js`" rule *and* the service-worker no-JS-cache workaround.
- **Temporary Phase 11 route:** `cmd/server/main.go` serves the React build under `/next/` with a deep-link fallback, immutable caching for hashed assets, and `no-store` for the shell. The existing `/` catch-all continues serving the vanilla UI. After a separately approved cutover, the React shell can take over `/`.
- **Version stamping.** `update-version.sh` currently edits `cmd/server/main.go`, `web/static/js/app.js` and `web/public/sw.js`. In the new world it should stamp `package.json` (and `vite.config.ts` via `define`) instead, and the front-end should read the version from `GET /api/version` rather than hard-coding it.
- **Cloudflare Access gotcha to design for up front.** When the CF Access session expires mid-use, requests come back as an HTML redirect/login page rather than JSON. The fetch layer must detect "expected JSON, got HTML/redirect" and force a full-page reload to re-auth, instead of throwing a confusing parse error.

---

## 6. Conventions for the new frontend (to be enforced, not suggested)

```
web/frontend/
  src/
    api/          # typed client, one module per resource (diary.ts, foods.ts, …)
    api/types.ts  # TS mirror of internal/models/models.go
    components/   # presentational, no data fetching
    features/     # diary/, metrics/, foods/, recipes/, nutrition/, settings/
    hooks/        # useDiary(date), useWeightEntries(), useUpdateUser()
    routes/       # React Router route objects
    lib/          # dates, units (stones/lbs ↔ kg), formatting — unit-tested
    theme/        # Tailwind @theme tokens ported from themes.css
  tests/          # Vitest + RTL + MSW
  e2e/            # Playwright
```

Hard rules:

1. **Server state lives in TanStack Query.** No `useEffect` data fetching; no duplicated copies of server data in component state.
2. **URL is state.** The selected date lives in the route (`/diary/2026-10-02`), not in a global `App.currentDate`.
3. **Every API response has a TS type** mirroring `internal/models/models.go`, and every mutation invalidates a named query key.
4. **Domain maths is extracted and unit-tested first** — bank balance (`bank.go`), cooked-weight concentration (`recipes.go`), macro percentages (`nutrition.go`), stones/lbs conversion. These are the crown jewels; the migration must not silently change them.
5. **No component library.** Tailwind + small local components; the current design language (CSS variables in `themes.css`, bottom nav, bottom-sheet modals, meal colours) is worth keeping.
6. **Mobile-first and accessible:** 44 px touch targets, `env(safe-area-inset-*)`, visible focus states, labelled inputs.
7. **Legacy UI freeze during migration.** `web/static/**` and `web/templates/index.html` receive critical bug fixes only, so the two UIs don't drift.
8. **UI quality is an acceptance gate.** For every user-facing phase, compare the live preview with the current build on a phone-sized viewport, describe the concrete UX improvement in the PR, and obtain owner review before merging/cutting over. Phase 11 infrastructure may be UI-neutral; later screen phases may not.

---

## 7. Migration plan (phased, each phase independently shippable)

The timeboxed spike is complete. The owner authorized **Phase 11 — Foundation** on 2026-10-02. The spike already demonstrates Diary, Metrics and Foods against fixtures; Phase 11 makes the foundation buildable and safely reachable without replacing the production UI. The go/no-go for each user-facing screen remains honest: if it is not clearly better than the current version, do not cut it over.

| Phase | Deliverable | Exit criteria |
|---|---|---|
| **11 — Foundation** | `web/frontend/` scaffold, Tailwind theme tokens, typed API client and query hooks for core endpoints, dev proxy, Go serving `web/dist` under a temporary `/next/` path, multi-stage Docker build, lint + typecheck + tests | New shell is reachable at `/next/` while the old UI remains the default; fixture and real-API dev loops work; typecheck, lint, tests and production build pass |
| **12 — Diary** | Diary view at `/diary/:date` with meal sections, a familiar quick-add selector for Tea/Coffee/Water, drinks, bank ring, date navigation, add/edit/delete food entries (optimistic) | The primary phone-based logging flow is demonstrably easier than the current build; owner reviews the mobile preview; drink calories are included in the bank with a regression test; old diary stays reachable until approval |
| **13 — Foods + Recipes** | Custom foods list/create/edit/delete, recipe list/create/edit, ingredient search, image upload with crop, recipe→diary flow | Recipe builder parity, including cooked-weight concentration maths with unit tests |
| **14 — Metrics + Nutrition** | Weight + measurements + steps, charts (Chart.js via react-chartjs-2), nutrition analysis tab, Google Fit connect/disconnect | Charts render identically; projections reproduce current numbers |
| **15 — Settings + PWA** | Settings, calorie/water targets, themes, `vite-plugin-pwa`, PWA install/offline behaviour, remove legacy no-cache hacks | Lighthouse PWA pass on mobile; SW installs cleanly |
| **16 — Cutover** | Delete `web/static/**`, `web/templates/index.html`, and old SW cache rules; make React the single SPA; update `docs/` (keep legacy `ai_contextual_docs/context.txt` frozen) | Total front-end LOC and file count drop sharply; no dead code left; owner approves the demonstrated UI improvement |

Indicative effort: **2–4 focused weeks** end-to-end, or ~6–10 weeks part-time. Phases 12–14 are the bulk of it. Treat every number here as an estimate to be re-based after the spike.

> **Ready to start?** Follow [`rebuild-kickoff.md`](./rebuild-kickoff.md) — it has the first
> commands, the `DEV_MODE` first PR, and the guardrails. The phases below are the plan; the kickoff
> doc is the starting point.

### 7.1 Spike results — 2026-10-02

A working spike was built to de-risk the decision rather than argue it on paper:
[`web/frontend/`](../../web/frontend/README.md) implements the **Diary**, **Metrics** and **Foods**
screens on React 19.3 + TypeScript 5.9 + Vite 8.3 + Tailwind 4.3 + React Router 8.4 + TanStack
Query 5.104, with a fixture API that mirrors the Go handlers' response shapes so the UI can also be
pointed at the real server via `VITE_API_TARGET`.

Measured, not estimated:

| Question | Answer |
|---|---|
| Does the toolchain work in the Arena sandbox? | **Yes.** Node 22.22.3, npm 10.9.8, registry reachable, 63 packages installed in ~16 s, Vite dev server on `0.0.0.0:5173` with `allowedHosts: true` served the preview proxy cleanly |
| Is the Go toolchain available in the sandbox? | **It can be, for verification.** By default there is no Go, and `go.dev`, `dl.google.com`, `proxy.golang.org`, apt and Docker are unreachable — which is why the spike ships a fixture API. **However**, a real toolchain can be obtained from the PyPI wheel `go-bin` (PyPI *is* reachable) and modules can be fetched from GitHub. `scripts/verify-go-in-sandbox.sh` does this in `/tmp` without touching the working tree; it builds `./cmd/server` with CGO, and the real server has been run in-sandbox — creating all 17 tables via migrations and returning `401` on protected routes (Cloudflare middleware working). Limits: the toolchain is Go 1.27 while the Dockerfile pins 1.22, nothing in `/tmp` persists between turns, and **Docker cannot run in the sandbox**, so `docker build` must still be verified on your own machine |
| What does it cost the client? | 374 kB JS (116 kB gzip) + 16 kB CSS (4.2 kB gzip) for three screens — one hashed, cacheable bundle versus ~4,500 lines of uncached vanilla JS today |
| Does a test story appear on day one? | **Yes.** The original spike had 14 tests; Phase 11 adds typed-API/client coverage, bringing the current suite to 20 tests across date maths (DST, leap days), stones/lbs conversion, API handling and all three screens |
| Does it typecheck strictly and build? | **Yes.** `tsc --noEmit` clean under `strict`, `noUnusedLocals`, `verbatimModuleSyntax`; production build in 628 ms |

Findings that affect the plan:

1. **Pre-existing bug surfaced: the bank ignores drinks.** `internal/handlers/bank.go` sums only `diary_entries`,
   while the diary ring in `app.js` adds drink calories. "Banked" therefore omits drinks that "today"
   includes. The spike reproduces real behaviour rather than hiding it. **Owner decision is now settled: drinks count.** Phase 12 must include `drink_entries` in consumption and add a regression test; the fix is not part of the Phase 11 foundation.
2. **Version drift is real.** `main.go` and `app.js` said 1.7.0 while `sw.js` still said 1.4.0. The
   spike reads the version from `GET /api/version`, removing the duplicated constant. **Resolved
   2026-10-02:** all three files were bumped to 2.0.0 on `cals-dev` for the V2 development line
   (see [`unraid-image-release.md`](./unraid-image-release.md)); `main` remains on 1.7.0.
3. **Cloudflare Access needs explicit handling.** The session-expiry case (HTML login page instead of
   a JSON 401) is handled once, in `src/api/client.ts`, rather than per screen.
4. **`.dockerignore` added.** Without it, a locally-present `web/frontend/node_modules` would bloat
   every Docker build context. Worth keeping when the real frontend lands.

With those measured, the estimates above are unchanged but better supported; the spike is small
enough that a "no" decision costs a day, not a project.

---

## 8. Alternatives considered

| Option | Verdict | Reasoning |
|---|---|---|
| **Stay vanilla, add only a TS build step** | Viable fallback | Cheapest path, no framework churn — but keeps hand-rolled DOM state, which is the source of most current bugs. Choose this if the app is feature-complete. |
| **HTMX + Go templates** | Rejected | Excellent for CRUD-over-HTML and would remove the SPA entirely, but the app is interaction-heavy (charts, modals, optimistics adds, swipe nav, camera capture). Smaller AI/ecosystem coverage for agent-driven maintenance. |
| **Svelte / SvelteKit** | Rejected | Great DX and smaller bundles, but a much smaller corpus for AI assistance and a smaller hiring pool — the opposite of the stated goal. |
| **Next.js** | Rejected | SSR/RSC is unnecessary behind Cloudflare Access for a single-user-ish app, and it adds a Node runtime to a deployment that is currently one static Go binary. |
| **Vue 3** | Rejected | Perfectly capable; loses on ecosystem/AI coverage against React, with no compensating advantage here. |
| **Full Go rewrite (e.g. templ + Alpine)** | Rejected | Solves a problem cals doesn't have (it isn't a "no JS" app) and discards the design work already done. |
| **React Native / Flutter app** | Out of scope | The PWA already covers mobile install; a native app is a different project. |

---

## 9. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Migration stalls half-finished, leaving two UIs | Medium | Strangler pattern with a route/flag switch; legacy UI frozen except critical fixes; each phase ships on its own |
| Domain logic silently changes (bank maths, cooked weight, macro %) | Medium | Extract + unit-test the maths *before* porting the view; golden-number tests against the current implementation |
| Node toolchain complicates the Unraid/Docker deploy | Low | Multi-stage Dockerfile (`node:22-alpine` builder → Go build embeds/serves `web/dist`); no Node at runtime |
| Agents make broad, hard-to-review changes | Medium | Phase gates, PR-only workflow (see `git-workflow.md`), small diffs, lint/type/test gates |
| Cloudflare Access session expiry causes confusing failures | Medium | Explicit HTML-response detection + reload-to-reauth in the API client |
| Service worker serves stale assets after deploy | Medium | Hashed assets + `no-store` on `index.html`; drop the custom no-cache JS rules |
| Dev environment requires a modern Node | Low | Pin Node 22 LTS in `.nvmrc`; document Docker-only builds as the fallback |

---

## 10. Decision checklist — what "yes" commits us to

- [x] ~~Node 22 LTS available on the dev machine~~ — confirmed available (incl. in the Arena sandbox). Go and Docker are not installed in the sandbox by default, **but a Go toolchain can be obtained there** (see §7.1) for compiling and running the real server. Docker must still be verified locally, and real data requires your Cloudflare session
- [ ] Full cutover commitment: `web/**` will be rewritten and the legacy UI deleted. **Phase 11 approval does not pre-approve deleting the current UI**; cutover stays gated by owner review of the new experience.
- [x] ~~A timeboxed spike agreed before Phase 11~~ — done: see `web/frontend/` and §7.1
- [x] `docs/` is the single source of documentation truth; keep it current each phase (`ai_contextual_docs/context.txt` remains frozen)
- [x] The Go API, database schema, auth and deployment topology are **not** part of the frontend migration
- [x] Drink calories count toward the bank; Phase 12 will implement and test the agreed behavior
- [x] **Phase 11 is authorized.** The user-facing UI improvement requirement remains a gate for later screen PRs and cutover.

**What would change the recommendation:** if no further feature work is planned, or if mobile UX complaints can be traced to a handful of specific screens, targeted fixes remain a fallback. The stack choice is sound; the user-facing result—not the framework—is what must justify the work.

---

## 11. Open questions for the owner

1. The motivation is settled: the owner values how the other rebuild's frontend feels, and UI/UX improvement is a headline requirement for cals.
2. How much feature work is realistically planned over the next 6–12 months (recipes, nutrition, multi-user)?
3. Is a Node toolchain acceptable on the dev box, or should everything build inside Docker?
4. Do we keep Chart.js via `react-chartjs-2` (recommended, familiar) or move to Recharts? (The spike uses hand-rolled SVG purely to avoid a CDN dependency in the sandbox — not a recommendation.)
5. **Quick-drink provisioning:** should brand-new users receive editable Tea/Coffee/Water starter templates, or create those drink definitions themselves before they appear in the quick selector? The selector itself is required; this detail must be settled before Phase 12.
