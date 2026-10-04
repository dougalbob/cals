# Frontend Strategy — React + TypeScript + Vite + Tailwind CSS

| Field | Value |
|---|---|
| **Status** | 🟡 **PROPOSED overall — the phased plan below is the plan.** *Current* status (which phases are implemented, what is running, what is awaiting review) lives in [`../CURRENT_STATE.md`](../CURRENT_STATE.md) and is deliberately not repeated here; the dated story is in [`../history/rebuild-log.md`](../history/rebuild-log.md) |
| **Date raised** | 2026-10-02 |
| **Decision owner** | @dougalbob |
| **Scope** | `web/**` (presentation layer) plus the static-file serving block in `cmd/server/main.go`; Phase 13 allows narrow, additive food-serving/recipe-metadata API support, user-scoped preferences for recipe favourites and each user's usual recipe portion, and focused recipe-image upload/storage changes using the existing authenticated route and schema |
| **Explicitly out of scope** | Broad `internal/**` or API redesign, major SQLite schema changes, Cloudflare Zero Trust auth, Docker/Unraid deployment topology. Targeted correctness fixes and documented additive response fields are allowed; diary rows remain gram/nutrition snapshots, with no new diary storage model |
| **Related** | [`git-workflow.md`](./git-workflow.md), [`local-development.md`](./local-development.md), [`../product/vision-and-open-questions.md`](../product/vision-and-open-questions.md) |

---

### How to read this document

It has two halves. **The plan** — §§1–11: the stack, why it was chosen, the target architecture,
the conventions, the phases and their exit criteria, the risks. **The phase records** — everything
from *“Today dashboard checkpoint”* onwards: what each phase actually shipped, and the design notes
that go with it (the ring scale, the sweep directions, the Phase 13 slices). Decisions are numbered
in [`../product/vision-and-open-questions.md`](../product/vision-and-open-questions.md), and current
status is in [`../CURRENT_STATE.md`](../CURRENT_STATE.md).

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
4. **The Diary needs familiar quick drinks.** The quick-add selector must make **Tea, Coffee and Water** easy to add, using the signed-in user's drink records and their configured calories/volume—not hard-coded nutrition assumptions. **Settled (decision 16): nothing is provisioned**; the selector lists the user's own drinks and prompts them to add one when they have none.
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
9. **A chart that shows a window of time must pan (decision 69, 2026-10-04).** Touch-drag with haptic feedback on a phone, click-and-hold and drag on a laptop; the rest of the series is reached by moving the chart, never by cramming more points into the same width. This implies range parameters on the stats endpoints (`from`/`to`, as `GET /api/calendar` already has) and the `date(date)` normalisation described in the [deferred RFC3339 issue](../product/vision-and-open-questions.md#known-issue-deferred--rfc3339-dates-on-the-metrics-endpoints-2026-10-03).

---

## 7. Migration plan (phased, each phase independently shippable)

The timeboxed spike is complete. The owner authorized **Phase 11 — Foundation** on 2026-10-02. The spike already demonstrates Diary, Metrics and Foods against fixtures; Phase 11 makes the foundation buildable and safely reachable without replacing the production UI. The go/no-go for each user-facing screen remains honest: if it is not clearly better than the current version, do not cut it over.

| Phase | Deliverable | Exit criteria |
|---|---|---|
| **11 — Foundation** | `web/frontend/` scaffold, Tailwind theme tokens, typed API client and query hooks for core endpoints, dev proxy, Go serving `web/dist` under a temporary `/next/` path, multi-stage Docker build, lint + typecheck + tests | New shell is reachable at `/next/` while the old UI remains the default; fixture and real-API dev loops work; typecheck, lint, tests and production build pass |
| **12 — Diary** | Diary view at `/diary/:date` with meal sections, a familiar quick-add selector for Tea/Coffee/Water, drinks, bank ring, date navigation, add/edit/delete food entries (optimistic), and explicit confirmation before deleting a populated meal entry (decision 85) | The primary phone-based logging flow is demonstrably easier than the current build; owner reviews the mobile preview; drink calories are included in the bank with a regression test; old diary stays reachable until approval |
| **13 — Foods + Recipes** | Custom foods list/create/edit/delete; recipe list/detail/create/edit, ingredient search and **uncropped image upload** during creation plus replacement on detail (decision 82); recipe→Diary flow; serving/grams choices; photo-led recipe browsing with favourites, structured classification and filters. **Cropping is deferred.** Include the shared orange **Own creation** recipe-origin marker in Edit and reuse the same field in the create flow. **Do not port the legacy Mealie import.** | Preserve cooked-weight concentration maths with unit tests. Foods support named gram-backed measures; Add/Edit starts in serving mode when reliable and keeps grams accessible. Recipe logging supports each user's remembered usual grams, whole-recipe fractions and direct gram editing; no guessed first quantity, remember the first successful log, and later changes are one-off unless explicitly made usual. All diary paths store grams and the existing nutrition snapshot. Recipes support multiple meal occasions plus a separate dish-type facet, up to two key foods selected only from known cals Foods, an orange shared origin marker, optional exact prep-to-plate minutes, and per-user favourites. Filter on these facets, including an **Own creation** checkbox beside the Dish type selector that stays synchronized with the `origin:own` URL/tag filter (decision 84). Photo upload is optional, directly previewed, limited to supported image formats, and replaceable; if upload fails after creation, leave the recipe saved and offer a safe retry instead of resubmission. No Goodness score in this phase; its method is future discovery |
| **14 — Metrics + Nutrition** | Weight + measurements + steps, charts (Chart.js via react-chartjs-2), nutrition analysis tab, Google Fit connect/disconnect, **the windowed bank (decision 66: the last N completed days, 14 by default — and that window is the bank everywhere, not just the ring)**, the tappable body-map measurement picker (decision 67), the 30-day pannable weigh-in chart with a trend line (decision 70) and the daily-goal-vs-consumed chart (decision 71) | The windowed balance covers completed days, includes food **and** drink calories, excludes unlogged days (decision 42), is labelled with its window, and drives the tile, `today_available` and the ring alike — with regression tests (`AGENTS.md`: the bank is crown-jewel maths). Windowed charts pan (decision 69) and stay readable at their default width; the body map commits a measurement without wiping the other parts recorded that day |
| **15 — Settings + PWA** | Settings, calorie/water targets, **per-user bank-ring display limits and the bank window** (decision 66: presets **30 / 14 / 7 / All time** plus a **custom** number of days, defaulting to 14), the **per-user body-outline preference** behind decision 67's body map, the **admin swap-user capability** (decision 45), themes, `vite-plugin-pwa` **installability only** (decision 53 — no offline logging, no write queue, no cached-data promise), remove legacy no-cache hacks | Ring limits and the window persist per user; the **window changes bank maths** (decision 66) while the ring's ± limits stay presentation-only; Lighthouse PWA pass on mobile; SW installs cleanly; admin role is server-validated |
| **16 — Cutover** | Delete `web/static/**`, `web/templates/index.html`, and old SW cache rules; make React the single SPA; update `docs/` (keep legacy `ai_contextual_docs/context.txt` frozen) | Total front-end LOC and file count drop sharply; no dead code left; owner approves the demonstrated UI improvement |

Indicative effort: **2–4 focused weeks** end-to-end, or ~6–10 weeks part-time. Phases 12–14 are the bulk of it. Treat every number here as an estimate to be re-based after the spike.

> **Ready to start?** Follow [`rebuild-kickoff.md`](./rebuild-kickoff.md) — it has the first
> commands, the `DEV_MODE` first PR, and the guardrails. The phases below are the plan; the kickoff
> doc is the starting point.

### 7.2 Phase 12 — Diary (implemented 2026-10-02)

Shipped on `cals-dev` and owner-approved after phone-size review on 2026-10-03 (PR #22, `v2.0.0-dev-rc8`):

**One source of truth for water.** `drinks.counts_toward_water` marks which drinks count;
`GET /api/water?date=` derives `consumed_ml` from those drink entries and returns the user's own
`daily_water_goal_ml`. The dead `water_entries` table is dropped when empty (kept, unused, if it
ever held rows). Drink entries snapshot their volume and calories, and `POST /api/drinks/entries`
accepts an optional `volume_ml` so "a 500 ml bottle rather than the usual glass" is still one
action. Details: [`water-and-drinks.md`](./water-and-drinks.md).

**Drink calories count towards the bank.** `internal/handlers/bank.go` now includes
`drink_entries`, with a regression test that would have failed before the change.

**The Diary's user-visible improvements** (the acceptance gate for this phase):

| Before | Now |
|---|---|
| Water showed a hard-coded `0 / 2000 ml` and never moved — the same dead value in both UIs | A water card shows real intake against the user's target, with a progress bar, one-tap glass (their own glass size) and an "other amount" entry |
| Drinks were logged from a popup list that included invented defaults (Beer/Milk) and could not be corrected | A quick-drinks row lists the user's own drinks, keeps Tea/Coffee/Water first when they exist, logs in one tap, and every logged drink is listed with its own delete button |
| "Banked" and the day's ring disagreed whenever a drink was logged | Both now use the same numbers, so the ring, the bank tile and the drink total agree |
| A logged food could only be deleted; correcting a portion meant deleting the row and adding it again | Every row has an **Edit** action: the logged weight can be corrected with a live calorie preview, rescaling that entry's own saved nutrition (see the close-out note below) |
| Deleting a food or recipe from a populated meal slot could happen with one tap | The delete action first asks for confirmation, names the entry and meal, and leaves it untouched on Cancel (decision 85) |
| A drink's calories were re-read live, so editing a definition rewrote past days | Entries keep the values they were logged with; corrections apply from then on |
| Drinks were fetched ad hoc per screen | Typed API client + TanStack Query keys; logging a drink refreshes diary, water, bank and the drink list together |

**Decisions settled here** (recorded in the vision document): water is logged in ml with a
one-tap glass (decision 15), the target stays 2000 ml per user and is editable (decision 15),
nothing is provisioned for new users (decision 16), and the bank has no automatic reset — the
existing `bank_start_date` setting is the manual "start fresh today" control (decision 17).

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
| Is the Go toolchain available in the sandbox? | **It can be, for verification.** By default there is no Go, and `go.dev`, `dl.google.com`, `proxy.golang.org`, apt and Docker are unreachable — which is why the spike ships a fixture API. **However**, a real toolchain can be obtained from the PyPI wheel `go-bin` (PyPI *is* reachable) and modules can be fetched from GitHub. `scripts/verify-go-in-sandbox.sh` does this in `/tmp` without touching the working tree; it builds `./cmd/server` with CGO, and the real server has been run in-sandbox — creating all 20 tables via migrations and returning `401` on protected routes (Cloudflare middleware working). Limits: the toolchain is Go 1.27 while the Dockerfile pins 1.22, nothing in `/tmp` persists between turns, and **Docker cannot run in the sandbox**, so `docker build` must still be verified on your own machine |
| What does it cost the client? | 374 kB JS (116 kB gzip) + 16 kB CSS (4.2 kB gzip) for three screens — one hashed, cacheable bundle versus ~4,500 lines of uncached vanilla JS today |
| Does a test story appear on day one? | **Yes.** The original spike had 14 tests; Phase 11 added typed-API/client coverage (20 tests at that checkpoint). The suite now has 93 tests across date maths (DST, leap days), stones/lbs conversion, API handling, the Diary/Home/Drinks/Foods screens, serving/portion maths and cooked-weight recipe maths (2026-10-03) |
| Does it typecheck strictly and build? | **Yes.** `tsc --noEmit` clean under `strict`, `noUnusedLocals`, `verbatimModuleSyntax`; production build in 628 ms |

Findings that affect the plan:

1. ~~**Pre-existing bug surfaced: the bank ignores drinks.**~~ **Fixed in Phase 12 (2026-10-02):** `internal/handlers/bank.go` now adds `drink_entries.calories` to the consumption window, with regression tests in `internal/handlers/bank_test.go`. See [`water-and-drinks.md`](./water-and-drinks.md).
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
5. ~~**Quick-drink provisioning:** should brand-new users receive editable Tea/Coffee/Water starter templates?~~ **Settled (2026-10-02, decision 16): no provisioning.** The quick selector shows the signed-in user's own drinks and points them at Settings when the list is empty.

## Today dashboard checkpoint — 2026-10-03

🟢 **Owner reviewed the Arena preview and authorized publication.** The new `/next/`
landing page is Today (the legacy root UI remains unchanged). Four meal tiles show
calories, icon, name and item count, linking to dated Diary meal anchors. The inner
calorie ring counts down the plain daily allowance; the outer ring retains existing
available/bank behaviour. The **Hydration** glass drains as water-counting drinks are
logged. Hydration and quick drinks share one responsive card, with a compact custom
amount action instead of duplicate water quick-add. Each drink shows its daily entry
count; long press opens confirmation before deleting the latest matching entry,
restoring its recorded ml/calories. The Diary uses the same fluids card. Phone layouts
stack water/drinks; wider layouts use a vertical divider. No backend or schema changes,
no data copy, no root cutover.

**Keep glass size and target distinct:** one tap logs the configured volume of the
user's Water drink — glass size is the per-tap amount, not the per-user daily hydration
target. The separate daily target is printed vertically across the glass at 90°; the
card reports how far over target the user is after they pass it. This presentation
work does not change the existing target-setting roadmap.

### Follow-up refinements — published in `v2.0.0-dev-rc18` (PR #42, 2026-10-03)

- Today resolves the current daily hydration target instead of briefly showing the
  default when a custom target is configured, and the four meal tiles now fill in
  proportion to each meal's share of today's logged calories. The fill sits behind
  the existing calorie, icon and label content.
- Month-grid opacity is based on the selected month, not the first date in its
  padded six-week range. In-month days remain fully visible even when the grid starts
  in the previous month; padded dates outside the month and future dates remain muted,
  and future dates remain non-clickable.
- Regressions are covered by frontend tests; the suite is at 169 tests. These are
  frontend-only refinements: no API or schema change, data copy, or template change.

The owner later confirmed that rc18 is running on Unraid and approved it (2026-10-04);
that review is closed. See [`CURRENT_STATE.md`](../CURRENT_STATE.md) for current
owner-review and release status.

## Owner-requested Diary and bank-ring follow-ups (2026-10-03)

These are sequenced recommendations from the owner's review, not changes to the bank calculation. They fit the rebuild, but belong at different points in it:

### Phase 12 close-out: edit the quantity of a logged food or recipe — implemented 2026-10-03

This was an **existing Phase 12 requirement**, not new scope: the phase table already promises add/edit/delete diary entries. The legacy UI had an edit-weight flow and the Go API already had `PUT /api/diary/{id}`, so it was a missing port rather than a reason to redesign the backend. **It is now implemented** (`web/frontend/src/routes/DiaryRoute.tsx`), and the port keeps to the agreed behaviour:

- Every logged row has an **Edit** action (44 px target, next to Delete) that opens a sheet showing the entry as logged, its derived kcal per 100 g and a weight input with a **live calorie preview**.
- On save, the entry's saved calories, protein, carbohydrate, fat and fibre are **scaled by the new-to-old quantity ratio** (`scaleEntryToGrams` in `web/frontend/src/lib/diary.ts`, unit-tested). The dairy-entry snapshot is preserved: no food or recipe definition is re-read, so editing a definition still cannot rewrite a past day. This matches the legacy vanilla-JS calculation exactly.
- Quantities are validated before anything is sent: **zero, negative and non-numeric weights keep Save disabled** and the helper returns `null`, so no invalid row can reach the API. The sheet also refuses to save an unchanged weight.
- On success the diary totals and the bank are both invalidated; no schema migration, API change or appdata work was needed.

The fixture API (`web/frontend/mock-api/handler.mjs`) has a matching `PUT /api/diary/{id}` and writes exactly the fields sent, like Go. The **Arena preview dies with the sandbox**: a preview started in one turn is gone in the next, and the tab reports "Expired". Re-run `./scripts/serve-frontend-preview.sh` at the start of a turn, or use the preview panel rather than refreshing an old tab.

### Phase 12 real-server correctness follow-ups — 2026-10-03

Reviewing the rc8 Diary flow against the Go handlers found two fixture/API mismatches that could make a successful user action look broken or silently save bad numbers. They are corrected before Phase 13:

- **Edit response header:** `HandleUpdateDiaryEntry` returned `{"success":true}` without `Content-Type`, so the real Go server labelled the body `text/plain`; the strict frontend client rejected it after the update had already committed. The handler now sets `application/json` and has a Go regression test asserting the header. The client still treats a 2xx `text/html` body as an Access login page and reloads, but accepts valid JSON despite a wrong label and treats an empty 2xx body as success. Client tests cover all three cases.
- **Food-add nutrition snapshot:** `HandleCreateDiaryEntry` stores the nutrition values sent by the client; it does not calculate them from `food_id` and `quantity_grams`. React's add flow was sending only those two fields, so a real Go server would store zero calories/macros. The fixture incorrectly recalculated nutrition and concealed the bug. The React flow now uses the tested `nutritionForGrams` helper and sends every snapshot value; the fixture stores those submitted values exactly like Go. A rendered diary test pins a 50 g add across calories and all macros.
- **Search fixture crash:** food search assumed every fixture had a `brand`; foods without one made the mock throw instead of returning results. The query now treats absent brands as empty, and the add-flow render test covers search through save.

A missing `net/http/httptest` import in the existing drinks-builder Go test file also prevented the Go test suite from compiling; the import is restored so the new handler regression can run in the full suite. No schema change, data migration, or appdata access was involved.

### Phase 12 dashboard follow-up: make the outer ring represent the bank

The observed grey-ring case has a concrete cause. The current outer ring draws `consumed / today_available`, where `today_available = daily_goal + bank_balance`. With a large deficit, `today_available` can be negative; `percentOf` clamps that progress to zero, so the colored arc has no length and the grey track remains visible—even though the stroke colour has been set to red.

The approved outer ring is a **display of the bank balance as it is calculated today — cumulative from `bank_start_date`** — not another daily-consumption ring. Decision 66 (2026-10-04) will change what that balance *means* (a windowed figure) without changing how the ring draws it. Until Phase 15 Settings, the ring uses fixed limits of +2,000 and -2,000 kcal:

- Positive balance fills clockwise in green from 12 o'clock: +1,000 is 50%; +2,000 or more is full green.
- Negative balance fills anticlockwise in red from the same 12 o'clock start: -650 is 32.5%; -2,000 or less is full red.
- Zero has no colored arc; the unfilled part stays neutral grey.
- Keep the exact bank figure visible beside the ring (so a capped -4,460 still reads -4,460), and expose the amount in the ring's accessible label. Color must not be the only signal.

Keep the inner ring tied to today's `daily_goal` and today's calories. Do not change `bank_balance`, calorie-bank maths, or history to implement a visual scale. The owner approved shipping this gauge now with fixed ±2,000 defaults; Phase 15 will wire independently adjustable values from Settings.

**Implementation status (2026-10-03):** The shared Home/Diary `CalorieRing` now uses this scale, labels the bank amount and percentage, and keeps the centre on today's goal. Component coverage pins +1,000 at 50%, -650 at 32.5%, and saturation at both limits, including a -4,460 deficit.

### Opposite sweep directions for surplus and deficit (2026-10-03)

The owner asked whether the surplus and deficit could grow in **opposite directions from the same 12 o'clock start** rather than both filling clockwise, so the sign of the balance is legible at a glance and not carried by colour alone. It can, and it is implemented in the same `CalorieRing`:

- **Surplus (green):** starts at 12 o'clock and sweeps **clockwise** — the ring's original direction, unchanged.
- **Deficit (red):** starts at 12 o'clock and sweeps **anticlockwise**, mirroring the geometry about the ring's vertical axis.
- The centre, the inner daily-goal ring, the ±2,000 kcal scale, the printed bank figure and all bank maths are unaffected. Both directions saturate at their limit, and the accessible label now states the sweep direction as well as the amount.

Implementation note for future work: the anticlockwise case **reflects the SVG geometry** (`translate(size 0) scale(-1 1)` before the 12 o'clock rotation) rather than using a negative `stroke-dashoffset`. A negative offset cannot render a *full* circle — at exactly 100% the whole dash falls into the gap and the ring would disappear at the limits it is meant to saturate at. The transform is produced by a small exported helper (`bankArcTransform`) so both directions stay pinned by component tests (`npm test`), and the rendered result was additionally rasterised and probed at 15° intervals during review: +1,000 occupies 12→6 o'clock clockwise, −650 occupies 12→3 o'clock anticlockwise, −4,460 fills the ring.

This is a presentation-only change: no schema, API, or data change, and it does not alter the Phase 14 rolling-balance metric or the Phase 15 per-user limits, which will simply reuse whichever direction the signed value takes.

### Phase 14 — the windowed bank (decision 66 supersedes the earlier “ring only” plan)

The owner proposed that the outer ring look back over a recent, adjustable period rather than
visualizing a balance accumulated since the bank start date, and on **2026-10-04 went further**:
after further research he decided that a deficit or credit accumulated from day 1 is the wrong figure
to steer by, so **the window is the bank everywhere** — the Banked/Deficit tile, `today_available`
(goal + bank) and the ring all read the last N completed days, with **14 days as the default** and
presets of 30 / 14 / 7 / All time plus a custom value in Phase 15 Settings. This is **not already
implemented**. `GET /api/stats/bank?days=30` returns a 30-day series, but each point is still a
cumulative snapshot from `bank_start_date`; it is not a rolling balance. The stats handler also
currently sums food entries without drinks, unlike the current `/api/bank` handler.

For an as-of date, calculate over the previous N **completed calendar days** (excluding the as-of
date, because today is always in progress), bounded below by `bank_start_date`; include both food and
drink calories; and let decision 42 exclude unlogged days inside the window, so budget accrues only
for days that have logging. Label every surface with its window (`Last 14 days`) so a windowed
balance can never be mistaken for an all-time one, and keep “All time” as an explicit preset that
reproduces today's numbers. Add tests for the window boundary, a window shorter than the history, a
window reaching past `bank_start_date`, unlogged days inside the window, food + drink inclusion, the
All-time preset, and `today_available` moving with the window. Ship the maths in Phase 14 with the
14-day default hard-coded and the setting in Phase 15, so the owner sees the new numbers before the
control exists. Full detail:
[decision 66](../product/vision-and-open-questions.md#the-windowed-bank-decision-66).

Phase 14 is the right home for the calculation, the API change and the tests because it already owns stats and charts. Use **14 days** as the default while the Phase 15 setting does not exist (decision 66 — this replaces the earlier 30-day placeholder).

### Phase 15 — make the ring limits and lookback user-adjustable

This fits naturally beside the planned Settings screen. Store the positive-bank cap and deficit magnitude as **separate per-user kcal preferences**, defaulting to 2,000 each, plus a per-user **bank window** defaulting to **14 days** with the presets **30 / 14 / 7 / All time** and a custom number of days (decision 66 — this replaces the earlier 30-day lookback default). Keep the positive and negative limits independent. Persist all three through the user's API/settings rather than browser local storage, so they follow the user across devices. The ring saturates at either limit using the selected window's balance. **Note the difference in kind:** the ± limits are presentation-only, but since decision 66 the window *is* the bank — changing it moves the Banked/Deficit figure and `today_available`, not just the ring. The same Settings screen also carries the per-user body-outline preference behind decision 67's body map.

This is a deliberately narrow exception to the current frontend-only migration boundary: it needs additive user fields, an SQLite migration, and `/api/users/me` read/update support. Keep that preference change isolated and tested; it must not alter calorie-bank calculations.

## Phase 13 — Foods + Recipes: owner decisions (2026-10-03)

**First increment implemented and owner-reviewed in the Arena preview (2026-10-03):** the shared recipe catalogue, per-user favourites, recipe detail, separate meal-occasion/dish-type facets, up to two known-Food key foods, optional total minutes, filters and the structured **Add tag** editor below ingredients.

**Second increment merged and published 2026-10-03:** known-Food serving choices in Add/Edit and recipe-to-Diary portion logging, following decisions 29–32 in the source [decision log](../product/vision-and-open-questions.md#phase-13-recipe-and-quantity-decisions--2026-10-03). Owner-reviewed in the Arena preview, merged as PR #28 and published as `v2.0.0-dev-rc11`. At that checkpoint, recipes still had no authoring of their own content (name, ingredients, method, image); only shared metadata and the portion flow changed. Safe in-place content editing and dependent-food recalculation were later published in `v2.0.0-dev-rc19` (see below). Recipe creation without a photo was added in rc24. Decision 82 later added uncropped photo upload and replacement to Phase 13, published in rc25; cropping remains deferred.

| Before | Now |
|---|---|
| A portion had to be converted into grams before it could be logged, even for a known “1 bag = 25 g” | Add/Edit opens with an explicit **serving / grams** mode: named gram-backed measures when the food has one, grams otherwise, with a one-tap switch and a live gram + kcal readout. Nothing is ever converted by guesswork |
| A custom food could carry one serving name (`serving_name` / `serving_grams`) and no more | A food can carry several named measures (`1 bag` 25 g, `1 slice` 12.5 g, …) beside FatSecret's own options; the food editor adds, edits and removes household measures while FatSecret rows are preserved and shown read-only |
| Logging a recipe meant deciding the grams yourself, every time | Recipe detail logs a portion: whole-recipe fractions (¼, ½, ¾, all), direct gram editing, the date and meal, and a live “grams = kcal” line taken from the cooked-weight concentration maths |
| Nothing remembered what a person actually eats, and a changed amount silently became the new habit | With no remembered amount nothing is preselected; the **first successful log becomes that user's usual**, later logs prefill it, and a different amount is one-off unless **“Make this my usual”** is ticked. The usual is per user and per recipe and never touches the shared recipe's `serves` |
| Diary Edit only knew the logged grams | A logged food's response carries its serving metadata, so Edit offers the same named choices as Add without changing what the row stores: grams plus its own nutrition snapshot |

**Third increment — the tags themselves filter the catalogue (owner request, 2026-10-03; decision 41
in the [decision log](../product/vision-and-open-questions.md#phase-13-recipe-and-quantity-decisions--2026-10-03)).**
Implemented and owner-reviewed in the Arena preview, merged as PR #30 and published as
`v2.0.0-dev-rc12`. The first increment put
tags on the cards and filters behind a collapsed panel; this one makes the tags the filter, which is
what the owner asked for: tap **Chicken** on a card and the list narrows to the chicken recipes, then
tap **Mushroom** on **Chicken & Mushroom Pie** and it narrows to the recipes carrying both. A recipe
must carry **every** selected tag (AND), because that is the flow described.

| Before | Now |
|---|---|
| Tags were decoration — reading one meant opening a panel and choosing from a dropdown to filter by it | Tapping a tag on a card filters the list in place, highlights the tag on the cards that still match, and **narrows further with each additional tag** |
| With several filters set there was no single place that showed them all | A **“Filtering by”** row shows every active tag as a removable chip with **Clear tags**, the results line reads “2 of 4 recipes match”, and an empty combination explains itself and offers a way back |
| The three facet dropdowns were the only filter controls, and a tag couldn't reach them | The selection is one model with two views: tapping a tag sets the matching dropdown, choosing a dropdown replaces that facet's tags, and a multi-valued facet labels itself **“Multiple — see tags”** instead of showing a misleading “Any” |
| A filter was lost on reload or when opening a recipe | The selection rides in the URL (`/recipes?tags=food:5,food:25`), so reload, the phone's back gesture and **← Back to recipes** all keep it; on a recipe page a tag opens the catalogue already narrowed by it |

Scope notes: this is a presentation-layer change with no API, schema or data change — tags were
already in the recipe payload (`internal/models/models.go`). The tag vocabulary is unchanged
(meal occasions, dish type, up to two known-Food key foods; no free-text tags, decision 35). The
matching rules and URL round-trip are unit-tested in `src/lib/recipeTags.test.ts`, and the
tap/add/remove/clear and detail-page flows in `src/routes/RecipesRoute.test.tsx`. The demo fixture
gained **Chicken & Mushroom Pie** (with a Mushrooms key food) so the owner's exact example is
reproducible in the preview.

**Decision 40 — `+ Add recipe` on each Diary meal card — implemented 2026-10-03 (rc15).** Each meal
card now has **+ Add food** and **🍽 Add recipe** side by side (two-column grid). Tapping Add recipe
opens a searchable recipe picker, and selecting one hands off to the existing `RecipePortionSheet`
with the originating meal and Diary date already preselected, so the user does not have to pick the
meal twice. Decisions 29–32 behaviour is preserved (fractions, direct grams, no guessed quantity,
remembered usual with first-log-becomes-usual), and no API/schema change was needed beyond the new
calendar endpoint below. The picker carries day context so on a past date the portion sheet logs to
that day.

**Decision 64 — that picker is now the Recipes tab — implemented, owner-accepted and published as `v2.0.0-dev-rc17` (2026-10-03).**
The in-house picker duplicated a worse version of the recipe box (one search box, no favourites, no
tag filters, no archived handling), so **🍽 Add recipe** now navigates to
`/recipes?add-to=<meal>&on=<date>` instead. The intent is URL state (see `src/lib/recipePick.ts`), so
it survives searching, filtering, reloading and a trip into the recipe's own detail page; in pick mode
each card gains a single **🍽 Add to Breakfast**-style action that opens the same
`RecipePortionSheet` with the meal and date already chosen, and *Done* returns to
`/diary/:date#<meal>`. Archived recipes remain unavailable until restored (decision 59); an
unrecognised meal slot in a hand-edited link is ignored rather than guessed.

**Calendar for historic dates (decision 49 follow-up) — implemented 2026-10-03 (rc15).** A new
`/calendar` route (bottom-nav tab 📅) offers Month and Week views toggled by a segmented control.
Month is a compact 6×7 Monday–Sunday grid with a per-day calorie progress bar (green up to the
goal, and once the goal is passed a proportional red tail for the overspend — decision 62), a 💧 pip
when the hydration target is met, a signed bank figure and a primary-blue ring on today. Week (the phone-friendly view the owner asked for) shows 7 stacked cards with weekday,
date, calories vs goal, a signed bank total, four meal rows with icons (`🌅 Breakfast 355 kcal`,
etc.) and a 💧 Hydration `x / y ml` line. Tapping any day hard-links to `/diary/:date`. State rides
in the URL (`/calendar/month/2026-10`, `/calendar/week/2026-10-05`) so reload and deep links work; a
📅 button in the Diary date header opens the calendar on today or the viewed date. The calendar stops
at today (decision 63): the forward arrow is disabled on the current month/week, a future URL is
clamped back to it, and days that have not happened are drawn but are not links.

The calendar is backed by a new additive read-only endpoint `GET /api/calendar?from=&to=` (max 400
days) which returns per-day food + drink totals, meal breakdowns, hydration ml from water-counting
drinks, goal and the end-of-day bank balance — mirrored from the existing bank maths so figures
agree with `GET /api/bank`. No schema migration. The Fluids card label was renamed from "Water" to
**💧 Hydration** because tea/coffee/squash etc. all contribute to the daily ml target (owner
request, 2026-10-03).

**Safe recipe editing and food correction — implemented, owner-tested and signed off in the Arena
preview on 2026-10-04; merged as PR #44 and published in `v2.0.0-dev-rc19`, included in rc22, rc23 and
rc24.** The owner reports rc24 is installed and new recipe creation works well. Uncropped photo
upload/replacement and decisions 83–85 were published in `v2.0.0-dev-rc25` (PR #56); Unraid phone
review is pending (see [`CURRENT_STATE.md`](../CURRENT_STATE.md)). Cropping is deferred. The React Recipes detail route now edits existing shared content
(description, known-Food ingredients and grams, text ingredients, serves, method and measured cooked
weight). Recipe names are read-only in both the React and legacy editors and are rejected if changed
at the API boundary (decision 58). `PUT /api/recipes/{id}` applies content and nutrition updates in
one transaction and never touches saved Diary rows, totals, bank values or statistics. Correcting a
food refreshes every dependent recipe definition—including archived recipes—in the same transaction
as food/measure updates; manual cooked weights are retained. Go and fixture regressions cover these
guarantees and atomic rollback. Go tests/vet, Vitest, typecheck and lint pass.

**Shared recipe-origin marker — implemented, owner-approved and published in `v2.0.0-dev-rc22`
(PR #50, decision 79).** Existing Edit recipe has an orange **Own creation** checkbox above **Key
foods (choose up to two)**, grouped with the structured tags. The additive `is_own_creation` field
defaults false, appears in recipe list/detail responses, and can be changed by optional metadata
updates without older clients clearing it. The create API accepts the same field, and the recipe
creation form saves it alongside the recipe content. The shared marker migration itself does not
touch recipe content or Diary snapshots; it runs at startup and needs no data copy or appdata
operation. Full recipe-edit guarantees remain in the [decision log](../product/vision-and-open-questions.md#adapting-an-existing-recipe--decisions-5558-2026-10-03);
current review and release status is tracked in [`CURRENT_STATE.md`](../CURRENT_STATE.md).

**Recipe creation and direct photo upload (decision 82).** The `/recipes/new` route authors a new name, description, matched cals Food ingredients/grams, optional text ingredients, serves, manual or calculated cooked yield, and method. The form shows a live nutrition estimate from matched Foods; text-only ingredients are excluded. Meal occasions, dish type, up to two key foods already in the ingredient list, Own creation, and optional exact total minutes are saved with the recipe. `POST /api/recipes` validates the content and classification and writes them in one transaction; the route preserves catalogue/Diary context and opens the detail page after creation.

A photo is optional: the create form accepts JPEG, PNG or WebP files up to 10 MiB, previews the selected original without cropping, then posts it as multipart data to the existing authenticated `POST /api/recipes/{id}/image` route after the recipe is saved. Existing recipe detail uses the same picker to replace its current photo. Because recipe creation and photo upload are separate requests, a failed photo upload must leave the recipe saved, navigate to that recipe, and clearly instruct the user to choose the photo again and retry—never ask them to submit the recipe again. The backend versions the files, maintains the original and thumbnail, and continues serving legacy numeric image filenames; no schema migration is needed. Crop UI and crop processing are explicitly deferred until road testing shows a need. This flow shipped in rc25; the owner's Unraid update/review is tracked in [`CURRENT_STATE.md`](../CURRENT_STATE.md).

**What this added to the API (all additive):** `food_servings` now holds household measures
(`fatsecret_serving_id IS NULL`) beside FatSecret rows, with create/update validating them and
replacing only household rows; `GET /api/diary` entries optionally carry `food_serving_name`,
`food_serving_grams` and `food_servings[]`; a new `recipe_user_portions (user_id, recipe_id, grams)`
table backs a nullable `usual_grams` on recipe responses, and `POST /api/diary` accepts
`make_usual` for recipe logs. A portion-writing failure is logged and never turns a saved diary entry
into an error. Diary storage is unchanged: grams plus the client's nutrition snapshot. Cooked-weight
concentration maths and its unit tests are untouched, and the fixture API mirrors all of it.

- **Visual direction:** use [`../product/recipeUX-example.jpg`](../product/recipeUX-example.jpg) as inspiration, not a pixel specification. Prioritize a prominent recipe photo, readable ingredient quantities and calories, a clear total and an obvious add action. Overlay a restrained row of tags near the lower-left of the photo; place the favourite heart at the upper-right. In the editor, provide a structured **Add tag** action after the ingredient list. Keep controls touch-friendly and avoid overcrowding phone layouts.
- **Recipe classification:** meal occasion (Breakfast, Lunch, Dinner, Snack, etc.) and dish type (Main, Side, etc.) are distinct facets, so a recipe can be both “Lunch” and “Main.” Meal occasion is multi-select. The current controlled lists stay deliberately small: Breakfast/Lunch/Dinner/Snack and Main/Side/Soup/Salad/Dessert. Do not add free-text tags or recreate Mealie's broad tagging feature set; recipe classification is shared metadata. These same tags are the catalogue's filter controls (decision 41): tapping one filters in place, additional taps require every tag to match (AND), and the selection is carried in `?tags=` so it survives navigation. The **Filter by recipe details** panel also exposes **Own creation** beside Dish type; it toggles the same `origin:own` tag and URL state rather than adding a second filter system (decision 84).
- **Key foods:** allow up to two key-food markers for recipe filtering, selected only from known cals Foods that belong to the recipe. Do not accept hand-typed food labels. This lets the same known food catalogue power ingredient selection and pantry-oriented search.
- **Time:** store an optional exact prep-to-plate duration in minutes. Do not generate “Quick” / “Low and slow” labels in Phase 13; user-configurable time ranges belong in a future Settings design.
- **Favourites:** a favourite belongs to the signed-in user, not the shared recipe. Use an outlined red heart when off and a filled red heart with a subtle shadow when on; expose its state accessibly.
- **Goodness rating:** out of scope for Phase 13. Keep nutrition factual; a score needs a separate future design for a transparent method and adequate nutrition data. Fat percentage alone is not a defensible rating.
- **Mealie:** the existing search/import code is legacy-only and is not being ported to the React Recipes view. It relies on parsing an external Mealie payload that may change and currently imports text ingredients without matching cals Foods. The legacy implementation is not a Phase 13 requirement; it may be lost when the legacy UI is removed unless separately reconsidered. Do not add Mealie parsing or sync work as part of this phase.

The existing per-user recipe usual-portion preference remains separate from shared recipe metadata; Diary entries continue to store gram and nutrition snapshots. Keep persistence additive and narrowly scoped, with API and fixture tests. The owner has reviewed and approved the first recipe metadata increment in the Arena preview; phase-wide phone-size review and final owner acceptance remain required before cutover.

### Phase 13 polish slice requirements — decisions 68, 72–78 (2026-10-04)

Three items from the owner's original seven-point road-test list do not belong to an existing phase,
so they were grouped into a small **Phase 13 polish slice**. The owner subsequently added two
follow-up requirements (decisions 74–75), then reduced the fill opacity (76), added a temporary
Arena-preview arrow workaround (77), and refined recipe-card badge sizes and touch targets (78). These
four deliverables are frontend-first; only the recipe count needs an additive API response field. The current status and order of work are in
[`CURRENT_STATE.md`](../CURRENT_STATE.md) §4.

| Item | Decision | Shape |
|---|---|---|
| **Fix the Recipes layering bug** — card tags paint over the menu as they scroll past it | 73 | The fixed bottom nav sets no `z-index` while the tags are `z-10`/`z-20`, so by the CSS painting order the tags win. Give app chrome an explicit layer above page content but below `Modal`'s `z-50`, and audit other fixed/sticky chrome. A live defect in the previously published build, fixed in rc21 |
| **Diary meal-card back fill with a percentage** | 68, 76, 81, 83 | Reuse the proportional fill from Today's meal tiles, with each meal's own accent at 5% color alpha and a padded white percentage label at the bar's upper-right corner; decision 83 keeps Diary at 5% while changing Today independently |
| **Today meal-card proportional fill** | 81, 83 | Keep the proportional width and increase only the fill color alpha to 25%; do not dim the full card or its text |
| **Recipe log-count badge** | 72, 74, 78 | Number only; `COUNT(*)` over `diary_entries(recipe_id, user_id)`, per signed-in user; no schema change, one additive response field, and no badge at zero. Use a 36 px circular badge with white 12 px digits on the app header's blue primary colour, still sized for three digits, at the image's top-left. That corner is clear on active cards; move the existing *Archived* pill to the top-right on archived cards, where no heart is shown |
| **Recipe-card Favourite touch target** | 78 | Put the 33 px white favourite badge and 18 px heart inside a transparent 66 × 66 px button target at the image's top-right. This doubles the visual badge diameter for taps without taking more visible photo space |
| **Five-visible-item swipeable bottom navigation** | 75, 77 | Show five slots at once; horizontal swipe with haptics where supported remains available. For the Arena preview, a fifth-slot arrow toggles the overflow window to reveal both Foods and Recipes, with a back arrow to return. This is a temporary development workaround; future Settings and Exercise pages remain out of scope |

### Follow-on UI refinements — decisions 83–85 (2026-10-04)

The later owner requests keep Today and Diary fill styling independent: **Today uses 25% color alpha, while Diary stays at 5%** (decision 83). Recipe details expose **Own creation** as a checkbox beside Dish type and preserve the existing tag/URL filter semantics (decision 84). Deleting a food or recipe from a populated Diary meal slot requires an explicit confirmation (decision 85). The exact scope is in the [product decision log](../product/vision-and-open-questions.md).

The badge's placement and archived-card collision, plus the small-print rule when a meal's share is only
a percent or two, are described in the [decision log](../product/vision-and-open-questions.md).
The slice needs the usual gates: preview at phone size, the concrete UX improvement described in the
PR, `npm run lint && npm run typecheck && npm test && npm run build:go` green, and owner review before
merge. The owner approved this slice in the Arena preview on 2026-10-04; it was published as
`v2.0.0-dev-rc21` (PR #48) and is included in rc22, rc23 and rc24. The owner reports rc24 installed;
decision-82 image upload/replacement shipped in rc25; the owner update and phone review are pending.
