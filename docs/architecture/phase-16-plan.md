# Phase 16 — Cutover: audit, estimate and staged plan

| Field | Value |
|---|---|
| **Status** | 🟡 **PROPOSED — audited and estimated 2026-10-05 against the code; not started.** Implementation waits for the owner's answers in §6 and for his explicit approval of the cutover. |
| **Written** | 2026-10-05 |
| **Owner** | @dougalbob |
| **Purpose** | Retarget and retest installability at `/`, make React the default, handle the existing `/next/` install deliberately — in reversible steps, with no legacy deletion and no Cloudflare change |
| **Related** | [`frontend-strategy.md`](frontend-strategy.md) §7 (the phase table), [`phase-15-plan.md`](phase-15-plan.md) §3.3 and §6 (what `/next/` shipped), [`admin-roles.md`](admin-roles.md) §9 (the deferred PWA bypass note), [`../CURRENT_STATE.md`](../CURRENT_STATE.md) (status), [`testing.md`](testing.md), [`unraid-image-release.md`](unraid-image-release.md) |

> **Authorisation boundaries for this phase (owner, 2026-10-05).**
> - **No appdata operation, no Unraid template change, and no Cloudflare Access, bypass, Tunnel, DNS or authentication change** is authorised.
> - **The legacy UI must not be deleted, and the cutover must not be performed, without explicit owner approval.**
> - Phase 16 is a serving-path and build-config change only: **no schema, migration, API contract or data change anywhere in it.**

---

## 1. What Phase 16 owns

1. **Retarget and retest installability at `/`.** The React manifest, icons and service worker move from `/next/` to the root, and the install flow is verified where the household actually reaches the app.
2. **Make React the default.** `/` serves the React shell; the legacy vanilla UI is demoted to a lifeboat path rather than deleted.
3. **Handle the existing `/next/` install deliberately.** Decide — and document — what happens to a home-screen app installed from `/next/`, to its worker registration, and to `/next/` bookmarks and deep links.
4. **Keep the exit criteria Phase 15 recorded:** a `/` PWA launches the React app, its worker is scoped correctly, caches nothing and offers no offline promise.

Phase 16 is **not** the deletion of the legacy code — that is a separately gated cleanup (§5, stage 16.4) and the phase's own exit criterion in [`frontend-strategy.md`](frontend-strategy.md).

---

## 2. Verified starting point (audit, 2026-10-05, at rc34)

Everything below was checked against the code on this branch, not taken from a handoff.

### 2.1 Build and PWA config — one constant controls the mount point

`web/frontend/vite.config.ts` derives **everything** from one value:

```
const appBase = goBuild || previewBuild ? '/next/' : '/'
```

It drives Vite's `base`, the manifest's `id`, `start_url` and `scope`, and both icon URLs. The production Go build (`npm run build:go`, used by the Dockerfile) and the fixture preview (`VITE_PREVIEW=1`) both select `/next/`; a plain `npm run build` already targets `/`. The router basename already derives from `import.meta.env.BASE_URL` (`src/router.tsx:47`), so **no application code needs changing for the path move** — this is genuinely a configuration change plus the serving work below.

The worker is `src/sw.ts` via `vite-plugin-pwa` (`injectManifest`, `injectRegister: 'inline'`): a registered but **inert** worker with no fetch handler and no cache. Icons live at `web/frontend/public/pwa/{icon-192.png,icon-512.png,app-icon.svg}`.

### 2.2 Go serving — React is mounted at exactly one path

`cmd/server/main.go`:

- `GET /next` → redirect to `/next/`; `GET /next/` → `nextFrontendHandler("web/dist")` (`cmd/server/frontend.go`).
- The handler special-cases the real PWA files (`manifest.webmanifest`, `sw.js`, `pwa/`, `workbox-*`), serves `assets/*` as immutable, 404s missing file-like URLs, and serves `index.html` with `no-store` for extension-less paths.
- Root `/` is a catch-all that serves `web/templates/index.html` for anything not under `/api/` — including, today, `POST`s to most paths.
- `/public/*` and `/static/*` are served without a cals JWT; every `/api/*` route passes through `withAuth`.
- `cmd/server/frontend_test.go` covers the handler in six subtests; `scripts/smoke-app-routes.sh` asserts `GET /` (legacy shell) and `GET /next/` + `/next/diary` (React shell), and runs inside the Docker validation workflow against a disposable database.

### 2.3 The legacy UI can move paths without a code change

`web/templates/index.html` is a single page whose views are toggled in JS. There is **no client-side URL routing** anywhere in `web/static/js/**` (no `pushState`, no hash routing), and every asset reference is absolute (`/static/...`, `/public/...`). The same shell therefore works from any path — which is what makes the unlinked `/legacy/` lifeboat in §5 possible.

Two consequences worth knowing:

- Its update button (`applyUpdate()`, `web/static/js/app.js:122`) unregisters **every** service worker and deletes **every** cache, then reloads `/?update=…`. After cutover that reload lands on React, not the legacy UI (a known, acceptable limitation of a lifeboat).
- Its PWA manifest (`web/public/manifest.json`) has `start_url: "/"` and no `id`, so its derived id is `/`.

### 2.4 Two PWAs, two identities, two worker scopes

| | Legacy (root today) | React (rc34) |
|---|---|---|
| Manifest | `/public/manifest.json` — start_url `/`, name "Cals - Calorie Tracker" | `/next/manifest.webmanifest` — start_url, scope and id `/next/`, name "cals — calorie diary" |
| Worker | `/public/sw.js` — scope `/public/`, fetch handler, caches `/static/css/style.css` | `/next/sw.js` — scope `/next/`, **no fetch handler**, no cache |
| Chromium installability | **Not met:** Chromium requires a worker that controls the page and the manifest's `start_url`, and `/public/sw.js` has scope `/public/` — it does not control `/`. The legacy app is at most an **Add to Home screen shortcut** on Android (iOS A2HS does not require a worker) | Manifest, icons and scope are right, but Chromium also requires a **fetch handler**, which the inert worker deliberately lacks — so Android Chrome withholds the **Install app** prompt and offers only a shortcut. iOS A2HS works |

**This is the audit's one substantive gap:** Phase 15 delivered installability at the asset level, but on Android it is not the real install experience until the worker has a fetch handler. A **network-only, pass-through fetch handler** (no caching, no offline fallback) would satisfy the criterion without adding offline capability or contradicting decision 53 — but it puts the worker in the path of every same-origin request, so it is a decision, not an implementation detail (§6, Q2).

The `/next/` install question is otherwise cheap: **no phone install has been reported**, the owner has not installed the React PWA yet, and any `/next/` registration that does exist is **inert** — it cannot cache, intercept or break anything. Nor could `/next/` ever have produced a real Android WebAPK (the same missing fetch handler applies): the residue is an Android shortcut that simply opens `/next/` (and will follow the redirect to `/`), or an iOS home-screen app that launches standalone and lands on React, where removing and re-adding refreshes its icon and name.

### 2.5 The flip side: any legacy `/` shortcut or iOS home-screen app will become React

The legacy app has been the household's daily UI, but it is **not Chromium-installable** (§2.4), so there is probably no real WebAPK at `/`: what a phone may hold is an Android **shortcut** or an iOS home-screen app. Either simply opens `/` — which will render React after cutover — and the old `/public/sw.js` registration survives harmlessly until the app unregisters it. There is no WebAPK identity to migrate; the check is only that the old entry point still opens the app. This should be tested explicitly, not left to chance.

### 2.6 Preview, tests, CI, template and docs

- `web/frontend/serve-preview.mjs` emulates the `/next/` mount (redirects extension-less paths into `/next/`, serves only under `/next/`, answers `/next/sw.js` with `Service-Worker-Allowed: /next/`). The whole Playwright suite runs against it, and `e2e/pwa.spec.ts` pins `/next/` manifest, scope, icons and worker behaviour.
- `cals-dev-v2.xml`'s WebUI link is `http://[IP]:[PORT:8151]/next/`, and its Overview says React is "currently served under /next/ during the migration".
- `update-version.sh` still bumps the legacy `web/public/sw.js` alongside `main.go` and `app.js`.
- `/next/` appears ≈75 times across 12 files (CURRENT_STATE 10, unraid-image-release 20, phase-15-plan 14, web/frontend/README 10, phase-14-plan 6, frontend-strategy 4, AGENTS 2, testing 2, dev-identity-switch 2, cals-dev-v2.xml 2, rebuild-kickoff 1, docs/README 1).
- `docs/architecture/testing.md` documents the `/next/` manifest/worker spec that will move.

### 2.7 What Phase 16 must not touch

Bank maths, the API contract, the database, `ADMIN_EMAILS`/`STANDARD_EMAILS`, `DEV_MODE`/`DEV_IDENTITY_SWITCH`, appdata, the Unraid template, Cloudflare, and — until 16.4's separate approval — the legacy code itself.

---

## 3. Cloudflare Access and phone installability — review of `admin-roles.md` §9

### What §9 says

§9 lists, under *Not built / open*: *"A Cloudflare Access application for the **PWA bypass** path, so the app can be installed on a phone. Deferred by the owner; it is a Zero Trust configuration change, not cals code."*

Read together with the code, §9 records a **deferred idea**, not a prerequisite. Nothing in this repository defines or requires a bypass. `/` (legacy) and `/next/` (React) are both served by the same container behind the same Cloudflare Access application today; the routes deliberately reachable without a cals JWT are `/health`, `/api/version`, `/public/*` and `/static/*` — plus the React shell and its hashed assets under `/next/*`, which carry no API data, are not linked from anywhere unauthenticated, and are behind Cloudflare Access in production.

### Can the PWA be tested with the current access rules? Yes — and nothing needs to change

The manifest, icons, worker, shell and assets are all **same-origin requests made by a signed-in browser**: they carry the `CF_Authorization` cookie like any other request, and installing and launching from the Cloudflare hostname are ordinary authenticated navigations. No bypass is needed to install, to launch, or to test.

Two practical caveats, neither of them an access-policy problem:

1. **Test through the Cloudflare hostname.** The LAN URL is plain HTTP — not a secure context — so a service worker cannot register and no install is possible there (and `/api/*` answers 401 without a JWT anyway). The phone test must run against the Cloudflare-routed hostname.
2. **On Android Chrome, expect a shortcut rather than the install prompt**, because the React worker has no fetch handler (§2.4). That is the worker question in §6 Q2; it is not fixed by any Cloudflare setting.

### What a bypass would actually expose (why the earlier advice stands)

A bypass policy covering `/next/*` (today) or `/*` (after cutover) would let **unauthenticated** requests reach the SPA shell, its JavaScript bundle and its icons. Household data would still be refused — `/api/*` remains behind the Go JWT middleware, which returns `401` without a valid token — so this is not a direct data leak. But it would:

- remove Cloudflare's outer gate (identity provider, MFA, device/IP rules, rate limiting, Access logging) for the app's entry point, leaving one lock instead of two;
- make any future routing or middleware mistake under that path directly reachable from the internet;
- not fix the Android install prompt, which is the only thing it is sometimes proposed for;
- become dead weight after cutover, when `/next/` no longer exists as an app path.

The deferred item in §9 stays deferred. If the standalone app's Access-session-expiry behaviour turns out to be painful in practice, that is a separate proposal with its own exposure statement — not a reason to add a bypass pre-emptively.

### Read-only checks before implementation (owner, no edits)

1. **Zero Trust → Access → Applications:** confirm the application covering the cals hostname includes the root path (domain with `/*` or no path), and note its policy.
2. **Access → Policies / bypass rules:** list what is currently bypassed (e.g. `/public/*`, `/health`) — for awareness only.
3. **Networks → Tunnels → public hostnames:** confirm the route maps the whole hostname to the origin service (`http://<host>:8151`) with no path scoping.
4. **Access session duration** (Zero Trust → Settings → Authentication): note it, so the phone test's re-authentication expectation is known.

If any check shows the root is *not* already covered by an Access application, stop and propose the minimal change for explicit approval before implementing.

### Phone install test steps (no access change)

1. On the phone, open the Cloudflare hostname while signed in, and reach the React app (`/next/settings` today; `/settings` after cutover).
2. Android: browser menu → **Add to Home screen** (a shortcut until Q2 is settled). iOS: **Share → Add to Home Screen**.
3. Launch it, confirm it opens the React app standalone with the right name/icon, and log or view one entry.
4. Let the Access session expire and note what re-authentication looks like from the standalone window.
5. Record the result in [`../CURRENT_STATE.md`](../CURRENT_STATE.md) — this is the outstanding "phone PWA installation untested" item.

---

## 4. Work inventory (what actually changes)

| Area | Change | Size |
|---|---|---|
| `web/frontend/vite.config.ts` | Production and preview base `/`; manifest `id`/`start_url`/`scope` `/`; icons at `/pwa/…`; keep one mount-point variable so the preview and Go build cannot drift | small (~20–40 lines) |
| `cmd/server/frontend.go`, `main.go` | Generalise `nextFrontendHandler` into a mountable SPA handler and mount it at `/`; serve the legacy shell at `/legacy/`; redirect `/next` and `/next/*` by **stripping the prefix** (`/next/diary/x` → `/diary/x`, query preserved) so bookmarks and old start URLs keep working; same cache/type rules as today | medium (~120–200 lines) |
| `src/` one-time cleanup | On React boot, unregister any `/public/sw.js` and `/next/` registration and delete legacy `cals-v*` caches, idempotently (no-op when absent) | small (~20–40 lines) |
| `src/sw.ts` (optional, Q2) | Network-only pass-through fetch handler, if the owner wants Chromium's real install prompt; no caching, no offline fallback | small |
| `serve-preview.mjs` + `e2e/**` | Preview serves at `/` and mirrors the `/next/` redirect; re-base 72 specs onto `/`; rewrite `pwa.spec.ts` for root manifest/scope/icons/worker; add a redirect spec and a legacy-shell-alive spec | medium churn (~150–250 changed lines) |
| `cmd/server/frontend_test.go`, `scripts/smoke-app-routes.sh` | Root handler tests; smoke expectations become `/` React, `/legacy/` legacy, `/next/…` 308 | small |
| Docs + template note | The ≈75 `/next/` references; `update-version.sh` stays as-is while the legacy UI still exists | mechanical |
| Cloudflare / appdata / schema | **Nothing** | — |

**No migration, no new API fields, no route-shape change, no new screen.** The substance of this phase is which handler owns `/` — which is exactly why the risk is in verification, not in volume.

---

## 5. Staged, reversible plan

### 16.1 — This audit and the decisions (audit done, docs-only; decisions pending)

This document, plus the status correction in [`../CURRENT_STATE.md`](../CURRENT_STATE.md). No code, no deployment, no configuration. **Gate:** the owner answers §6 Q1–Q6; 16.2 does not start until he does.

### 16.2 — Retarget on the branch, preview only (no publish)

Everything in §4 plus the test and doc sweep, delivered as a branch and an **Arena preview served at `/`** (the preview's fixture server is switched to the root mount so the review is faithful). Nothing is published, so the household sees no change and `dev-latest` does not move.

- **Recommendation carried out here unless Q2 says otherwise:** the inert worker stays as-is if the owner prefers shortcut installs; otherwise the pass-through handler goes in with a test that a request still reaches the server and that no cache is created.
- **Recommended `/next/` handling (policy A):** 308-strip redirect + the one-time in-app unregister + a Settings line telling anyone with an old `/next/` install to remove and reinstall it. Policies B (keep `/next/` served in parallel for one release) and C (leave it forever) are rejected: B keeps two installable scopes and two base builds alive for no benefit; C leaves a second scope and a stale manifest permanently.
- **Exit:** owner reviews React at `/` at phone size in the preview; Vitest, Go vet/tests, Playwright, Docker validation, smoke script and doc-link checks green; **no publish**.
- **Rollback:** nothing to roll back — no published artifact and no deployed change.

### 16.3 — Cutover release and the Cloudflare phone test (owner-gated)

1. Owner approves the preview and the cutover explicitly.
2. Publish the agreed `v2.0.0-dev-rcNN` (the tag moves `dev-latest`; nothing reaches the household until a Force Update).
3. Owner Force Updates the existing `cals-dev-v2` container (image tag unchanged; **no template or appdata change**), then checks over the Cloudflare hostname: `/` opens React, a deep link works, `/legacy/` still opens the old UI, `/next/…` redirects to the matching path, the footer reports the new version, and one write round-trips.
4. The phone test in §3 runs — including any legacy `/` shortcut or iOS home-screen entry opening React (§2.5) — and its result is recorded.
5. **Rollback at any point:** re-pin the container to `v2.0.0-dev-rc34` and restart. The phase changes no data, so rollback is exact; the legacy UI at `/legacy/` is a second, independent way back.

### 16.4 — Legacy retirement (separately approved, later)

Only after the owner confirms the cutover has bedded in. Delete `web/static/**`, `web/templates/index.html`, `web/public/**`, the `/legacy/` route, the legacy cache name, the legacy lines in `update-version.sh`, and the stale docs; refresh `cals-dev-v2.xml`'s WebUI link to `/` and its Overview text as a **separately approved template change** (not required before then — the `/next/` redirect keeps the existing link working). This is the phase's LOC-drop exit criterion; it is a deletion, so it gets its own explicit approval.

---

## 6. Decisions needed before implementation

| # | Question | Recommendation |
|---|---|---|
| **Q1** | Is there any `/next/` install on any device (phone or desktop) today? Either way, is "308-strip redirect + in-app cleanup + remove/reinstall guidance" an acceptable policy for one? | **Yes** — no install has been reported, and the residue can only be a shortcut or an iOS entry whose URL follows the redirect |
| **Q2** | Android install prompt: accept shortcut-only installs (inert worker, exactly as shipped in rc34), or add a **network-only pass-through fetch handler** so Chrome offers the real install prompt? | **Add the pass-through handler** — it is what makes "installability" true on Android, caches nothing and does not weaken decision 53 |
| **Q3** | Keep the legacy UI served unlinked at `/legacy/` as the lifeboat until you approve deletion? | **Yes** — reversibility without a rebuild; deletion stays 16.4 |
| **Q4** | If a phone has a legacy `/` shortcut or iOS home-screen app, is it fine that it simply opens React from now on, with the old worker and caches cleaned up once? | **Yes** — there is no WebAPK identity to migrate (the legacy worker's scope never controlled `/`); verify it on the phone |
| **Q5** | Anything in the §3 read-only Cloudflare checks you would rather run yourself — or any indication the root is not already covered by the Access application? | **Informational**; if the root is not covered, stop and propose the minimal change for approval |
| **Q6** | Redirect status for `/next/…`: permanent (308) or temporary (307/302) for one release? | **308** — deep links and the template's WebUI link keep working, and the old scope is genuinely retired |

---

## 7. Estimate

| Stage | Agent effort | Owner effort | Notes |
|---|---|---|---|
| 16.1 audit + plan | done (this session, docs-only) | read + answer §6 | zero risk |
| 16.2 retarget + preview | **~1–1.5 focused sessions** | ~15 minutes at phone size in the preview | a serving-path change plus test/doc re-basing — a few hundred changed lines, **smaller than any Phase 14/15 slice**; the care is in the route/worker/redirect edges, not the volume |
| 16.3 cutover + phone test | ~1 hour (publish, evidence, any fix loop) | ~1 phone session over Cloudflare | the only household-visible step; image-tag rollback available |
| 16.4 legacy retirement | ~0.5 session | approve deletion; optional template refresh | deletes code; no user-visible surface except a missing lifeboat |

**Bottom line: ~2–3 focused agent sessions in total**, one preview review, one approval before the cutover, one later approval before deleting the legacy UI. No schema, migration, API, appdata, template or Cloudflare work in any of it.

---

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| `/` is the household's front door — a routing mistake is an outage | Preview-first; the legacy shell stays served at `/legacy/`; image-tag rollback; the smoke script asserts `/`, `/legacy/`, `/next/…` and every API route before release |
| Existing devices carry a legacy `/public/sw.js` or an old `/next/` registration | The new worker caches nothing; the one-time cleanup unregisters both idempotently; neither can affect a React page (one is scope-limited to `/public/`, the other has no fetch handler) |
| The Android install prompt is still absent after cutover | Q2 decides; if the answer is "accept", the Settings copy already sets the shortcut expectation and the phone test records it |
| Cloudflare Access session expiry in a standalone window | Test it in 16.3; a narrow, separately approved change is only considered if the experience is genuinely bad |
| Test re-basing hides a regression (72 specs move paths) | Run the suite before and after; keep the PWA assertions explicit at the new root; add a `/next/` redirect spec and a legacy-alive spec |
| Doc drift (≈75 `/next/` references, template text, `update-version.sh`) | The sweep is part of 16.2; `node scripts/check-doc-links.mjs` and the review checklist cover the rest |
| `dev-latest` moves at publish even if the household has not updated | Publish only after explicit cutover approval; the Force Update remains the owner's separate action |

---

## 9. Acceptance

- `/` serves the React shell; deep links (`/diary/:date`, `/metrics`, `/settings`) work on reload; the shell is `no-store` and hashed assets are immutable.
- `/next` and `/next/*` redirect by stripping the prefix, preserving path and query; `/next/` lands on `/`.
- `/legacy/` serves the unchanged legacy shell; `/public/*`, `/static/*` and every `/api/*` route behave exactly as before.
- The React manifest's `id`, `start_url` and `scope` are `/`, its icons resolve at `/pwa/…`, and its worker registers with scope `/`, caches nothing and promises no offline behaviour.
- The phone test runs through the Cloudflare hostname with **no Cloudflare or appdata change**, and its result is recorded — including any legacy `/` shortcut or home-screen entry.
- All suites green: Vitest, Go vet/tests (with new root-handler tests), Playwright (re-based plus new root/redirect/legacy specs), Docker validation, runtime smoke, doc links.
- **Rollback rehearsed and documented:** re-pin the previous image tag and restart; no data or schema impact.
