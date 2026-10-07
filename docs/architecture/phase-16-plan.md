# Phase 16 — Cutover: audit, estimate and staged plan

| Field | Value |
|---|---|
| **Status** | 🟢 **Stage 16.2 was published as `v2.0.0-dev-rc35`; the latest candidate, `v2.0.0-dev-rc36`, also carries that root-route retarget and the Metrics follow-up. Neither candidate is installed; `cals-dev-v2` remains on rc34.** `/` serves React, `/legacy/` is the lifeboat, `/next/*` 308s onto the root, and the worker has the pass-through handler. The rc36 publish run and tagged 80/80 browser suite passed; no schema, data, appdata, template or Cloudflare change. The Cloudflare phone test after an owner Force Update remains outstanding; 16.4 (legacy deletion) still needs separate explicit approval. The owner delegated the §6 decisions on 2026-10-06 ("How you get there and what safety checks you employ … is up to you"); they are recorded in §6 with his stated goal — React at `/`, PWA support — as the requirement they serve. One audit claim was found to be out of date and is corrected in §2.4. |
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

> **Correction, 2026-10-06 (found while implementing 16.2).** The table row above
> and this paragraph overstate the problem. Chromium **removed** the
> service-worker-with-fetch-handler requirement for installing **from the
> browser menu** in Chrome 108 on mobile and 112 on desktop, and shipped a
> default offline page for sites that do not provide one — see
> [Revisiting Chrome's installability criteria](https://developer.chrome.com/blog/update-install-criteria).
> So rc34's inert worker did **not** reduce Android to a shortcut: a real
> WebAPK install was already available from the ⋮ menu.
>
> What still requires a fetch handler is the **automatic install prompt** —
> the `beforeinstallprompt` event. That matters here specifically, because
> cals has an in-app **Install app** button on Settings
> (`src/lib/pwaInstall.ts` → `SettingsRoute.tsx`) driven by exactly that event.
> Without a fetch handler the event never fires and the button is dead code on
> Android. **Q2's recommendation is therefore unchanged, but for this reason
> rather than the one originally given.** The `§3` caveat 2 wording ("expect a
> shortcut rather than the install prompt") should be read the same way.

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

Read together with the code, §9 records a **deferred idea**, not a prerequisite. Nothing in this repository defines or requires a bypass. On the last reported installed version (rc34), `/` is the legacy UI and `/next/` is React; the published rc36 candidate moves React to `/` and keeps the legacy UI at `/legacy/`. Both paths remain behind the same Cloudflare Access application. The routes deliberately reachable without a cals JWT are `/health`, `/api/version`, `/public/*` and `/static/*` — plus the React shell and its hashed assets, which carry no API data and are behind Cloudflare Access in production.

### Can the PWA be tested with the current access rules? Yes — and nothing needs to change

The manifest, icons, worker, shell and assets are all **same-origin requests made by a signed-in browser**: they carry the `CF_Authorization` cookie like any other request, and installing and launching from the Cloudflare hostname are ordinary authenticated navigations. No bypass is needed to install, to launch, or to test.

Two practical caveats, neither of them an access-policy problem:

1. **Test through the Cloudflare hostname.** The LAN URL is plain HTTP — not a secure context — so a service worker cannot register and no install is possible there (and `/api/*` answers 401 without a JWT anyway). The phone test must run against the Cloudflare-routed hostname.
2. **Android install flow:** rc36 includes Q2's network-only pass-through handler, which enables the Settings **Install app** flow without caching. Verify the real prompt on the phone after an owner-authorized Force Update; the browser-menu install is also available without a Cloudflare change.

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

1. After the owner chooses to Force Update to rc36, open the Cloudflare hostname while signed in and reach React at `/settings`.
2. On Android, test Settings → **Install app** (Q2's network-only handler supports the in-app prompt); record whether Chrome offers the install flow. On iOS, use **Share → Add to Home Screen**.
3. Launch the installed app, confirm it opens React at `/` standalone with the right name/icon, and log or view one entry.
4. Let the Access session expire and note what re-authentication looks like from the standalone window.
5. Record the result in [`../CURRENT_STATE.md`](../CURRENT_STATE.md) — phone PWA installation remains untested until this check is done.

---

## 4. Work inventory (what actually changes)

| Area | Change | Size |
|---|---|---|
| `web/frontend/vite.config.ts` | Production and preview base `/`; manifest `id`/`start_url`/`scope` `/`; icons at `/pwa/…`; keep one mount-point variable so the preview and Go build cannot drift | small (~20–40 lines) |
| `cmd/server/frontend.go`, `main.go` | Generalise `nextFrontendHandler` into a mountable SPA handler and mount it at `/`; serve the legacy shell at `/legacy/`; redirect `/next` and `/next/*` by **stripping the prefix** (`/next/diary/x` → `/diary/x`, query preserved) so bookmarks and old start URLs keep working; same cache/type rules as today | medium (~120–200 lines) |
| `src/` one-time cleanup | On React boot, unregister any `/public/sw.js` and `/next/` registration and delete legacy `cals-v*` caches, idempotently (no-op when absent) | small (~20–40 lines) |
| `src/sw.ts` (Q2, selected) | Network-only pass-through fetch handler, included in rc35/rc36 to drive the in-app Android install prompt; no caching, no offline fallback | small |
| `serve-preview.mjs` + `e2e/**` | Preview serves at `/` and mirrors the `/next/` redirect; re-base 72 specs onto `/`; rewrite `pwa.spec.ts` for root manifest/scope/icons/worker; add a redirect spec and a legacy-shell-alive spec | medium churn (~150–250 changed lines) |
| `cmd/server/frontend_test.go`, `scripts/smoke-app-routes.sh` | Root handler tests; smoke expectations become `/` React, `/legacy/` legacy, `/next/…` 308 | small |
| Docs + template note | The ≈75 `/next/` references; `update-version.sh` stays as-is while the legacy UI still exists | mechanical |
| Cloudflare / appdata / schema | **Nothing** | — |

**No migration, no new API fields, no route-shape change, no new screen.** The substance of this phase is which handler owns `/` — which is exactly why the risk is in verification, not in volume.

> **As built, 2026-10-06 — two rows came out smaller than estimated, one bigger.**
>
> - **`e2e/**` was one spec, not 72.** The audit expected 72 specs to be
>   re-based onto `/`. In fact 71 of them already used *relative* URLs
>   (`goto('/diary')`) and it was `serve-preview.mjs`'s redirect that put them
>   under `/next/`. Only `pwa.spec.ts` named `/next/` absolutely, so it is the
>   only spec that was rewritten. The 72-spec re-basing risk in §8 did not
>   materialise.
> - **The "legacy-shell-alive" browser spec became a Go test instead.** The
>   fixture preview server does not serve the legacy templates or its
>   `/static/`+`/public/` assets, so a browser spec there would have tested an
>   emulation rather than the code that ships. `legacyShellHandler` and the
>   `/legacy/` route are covered in `cmd/server/frontend_test.go`, and the smoke
>   script asserts `/legacy/` against the real server.
> - **The route table was extracted and is now tested.** Not in the original
>   inventory. `registerFrontendRoutes` puts the real `ServeMux` under test,
>   because a wrong pattern there is the outage this phase is most capable of
>   causing. This also caught a real behaviour change: the old catch-all
>   answered *every* method — including `POST` to paths with no handler — with
>   the legacy shell and a `200`. It is now `GET`-only and answers `405`.

---

## 5. Staged, reversible plan

### 16.1 — This audit and the decisions (complete; decisions settled 2026-10-06)

This document and the status correction in [`../CURRENT_STATE.md`](../CURRENT_STATE.md) were documentation-only. No code, deployment or configuration changed in 16.1. The owner delegated and settled §6 Q1–Q6 as decisions 110–115; that gate is closed.

### 16.2 — Retarget and review (built 2026-10-06, published as rc35; included in rc36)

Everything in §4 plus the test and doc sweep was delivered as a branch and an **Arena preview served at `/`** (the preview's fixture server was switched to the root mount so the review was faithful). The owner approved the preview and PR #79 published `v2.0.0-dev-rc35`; the current candidate rc36 includes that retarget and the approved Metrics follow-up (decisions 116–119). Neither candidate is installed: rc34 remains on the household's container. The exact rc36 source commit, tag, image digest and CI evidence are in the [release log](unraid-image-release.md#release-log).

- **Worker:** the pass-through handler is in, per Q2, with a browser test that a request still reaches the server and that Cache Storage stays empty.
- **`/next/` handling (policy A):** 308-strip redirect + the one-time in-app unregister, minus the Settings line — see the deviation note in §6. Policies B (keep `/next/` served in parallel for one release) and C (leave it forever) remain rejected: B keeps two installable scopes and two base builds alive for no benefit; C leaves a second scope and a stale manifest permanently.

**What was verified, and how.** Baseline first, then the same suites after the
change, so "nothing regressed" is a comparison rather than an assertion:

| Check | Baseline (before) | After 16.2 |
|---|---|---|
| `npm run lint` | clean | clean |
| `npm run typecheck` | clean | clean |
| `npm test` (Vitest) | 311 passed / 40 files | **320 passed / 41 files** |
| Playwright (phone + desktop) | 72 passed | **75 passed** |
| `go vet ./...` | clean | clean |
| `go test ./...` | all packages ok | all packages ok, **+ route-table, lifeboat and redirect tests** |
| `scripts/smoke-app-routes.sh` against the **real Go server** serving the **real `build:go` bundle** | n/a | **16/16** in dev-mode, **15/15** in production-like (`/api/*` still 401) |
| `node scripts/check-doc-links.mjs` | clean | clean |

The smoke run is the strongest check available in the sandbox and is worth
naming precisely: the production bundle was built with `npm run build:go`, the
real `cmd/server` binary was compiled and started against a **disposable**
database in `/tmp`, and the script asserted `/` React, `/diary` deep link,
`/manifest.webmanifest`, `/sw.js`, `/pwa/icon-192.png`, `/legacy/`, and the three
`/next` 308s. Household data was not touched at any point. Docker itself cannot
run here, so the image build is verified by the PR's `Docker build (validation)`
workflow — the `Dockerfile` needed no change, since it already copies both
`web/dist` and the whole `web/` tree.

**Not verified here:** the phone install test. It needs a real device over the
Cloudflare hostname, which is tracked in the remaining 16.3 phone check. rc36 (which includes rc35) is
published but not installed, so the household still runs rc34.

- **Exit:** the owner reviewed React at `/` at phone size, approved the preview and authorized publication; PR #79/rc35 closed the 16.2 preview gate. The owner Force Update to rc36 and the Cloudflare-hosted phone check remain.
- **Rollback:** rc36 is published but not installed. Keep rc34 pinned until the owner chooses to update; after an update, re-pin rc34 and restart for an exact rollback.

### 16.3 — Owner Force Update and Cloudflare phone test (owner-gated; rc36 already published)

Publication is complete: the immutable `v2.0.0-dev-rc36` tag points to `ac58e0cda39cbd9eae4d305c11d53a40bc710068` on `cals-dev`, and `dev-latest` moved with it. **This document does not authorize an Unraid update.** The household remains on rc34 unless and until the owner separately chooses to Force Update.

1. The owner decides whether and when to Force Update the existing `cals-dev-v2` container to the already-published rc36 candidate. Do not recreate or move the tag; no template, appdata or Cloudflare change is part of this step.
2. If the owner authorizes the update, verify over the Cloudflare hostname: `/` opens React, a deep link works, `/legacy/` still opens the old UI, `/next/…` redirects to the matching path, the footer reports rc36, and one write round-trips.
3. Run the phone test in §3: verify the Settings install flow and that the installed app opens React at `/`, including any legacy `/` shortcut or iOS home-screen entry (§2.5). Record the result in [`../CURRENT_STATE.md`](../CURRENT_STATE.md).
4. **Rollback at any point:** re-pin the container to `v2.0.0-dev-rc34` and restart. The phase changes no data, so rollback is exact; the legacy UI at `/legacy/` is a second, independent way back.

### 16.4 — Legacy retirement (separately approved, later)

Only after the owner confirms the cutover has bedded in. Delete `web/static/**`, `web/templates/index.html`, `web/public/**`, the `/legacy/` route, the legacy cache name, the legacy lines in `update-version.sh`, and the stale docs; refresh `cals-dev-v2.xml`'s WebUI link to `/` and its Overview text as a **separately approved template change** (not required before then — the `/next/` redirect keeps the existing link working). This is the phase's LOC-drop exit criterion; it is a deletion, so it gets its own explicit approval.

---

## 6. Decisions recorded before implementation

**All six were settled on 2026-10-06.** The owner delegated them rather than
answering one by one — *"How you get there and what safety checks you employ to
ensure a safe passage is up to you"* — and named the outcome he wanted: **the
React front end at `/` rather than `/next/`, and PWA support.** Each decision
below is the recommendation the audit already made, taken because it serves that
outcome. They are recorded as decisions 110–115 in
[`../product/vision-and-open-questions.md`](../product/vision-and-open-questions.md)
so the reasoning survives.

| # | Question | Recommendation | Decision, 2026-10-06 |
|---|---|---|---|
| **Q1** | Is there any `/next/` install on any device (phone or desktop) today? Either way, is "308-strip redirect + in-app cleanup + remove/reinstall guidance" an acceptable policy for one? | **Yes** — no install has been reported, and the residue can only be a shortcut or an iOS entry whose URL follows the redirect | **Policy A**, with one deviation: the 308-strip redirect and the in-app cleanup are built, but the permanent Settings line was **not** added — see the note below the table |
| **Q2** | Should the in-app **Install app** button work on Android? Leave rc34's worker inert (the browser-menu install remains available), or add a **network-only pass-through fetch handler** to trigger the in-app prompt? | **Add the pass-through handler** so the in-app Settings button works; it caches nothing and adds no offline promise | **Added**, for the corrected reason in §2.4. Nothing is cached and no offline promise is made |
| **Q3** | Keep the legacy UI served unlinked at `/legacy/` as the lifeboat until you approve deletion? | **Yes** — reversibility without a rebuild; deletion stays 16.4 | **Yes** — `/legacy/` is served and covered by a Go test and by the smoke script |
| **Q4** | If a phone has a legacy `/` shortcut or iOS home-screen app, is it fine that it simply opens React from now on, with the old worker and caches cleaned up once? | **Yes** — there is no WebAPK identity to migrate (the legacy worker's scope never controlled `/`); verify it on the phone | **Yes** — the one-time cleanup is built (`src/lib/legacyServiceWorker.ts`); the phone check stays in 16.3 |
| **Q5** | Anything in the §3 read-only Cloudflare checks you would rather run yourself — or any indication the root is not already covered by the Access application? | **Informational**; if the root is not covered, stop and propose the minimal change for approval | **Owner's to run** — they are Zero Trust dashboard checks, not code. Note the root is definitionally covered today: the household already reaches `/` daily through the Cloudflare hostname. Still to be confirmed, and **no** Cloudflare change is made or proposed |
| **Q6** | Redirect status for `/next/…`: permanent (308) or temporary (307/302) for one release? | **308** — deep links and the template's WebUI link keep working, and the old scope is genuinely retired | **308**, asserted in the Go route-table test, the browser suite and the smoke script |

### The one deviation from policy A: no permanent Settings line

Policy A's third element was a Settings line telling anyone holding an old
`/next/` install to remove and reinstall it. **It was not built**, deliberately:

- The population it addresses is empty. No `/next/` install has ever been
  reported, and the owner has not installed the PWA yet (§2.4).
- The failure mode it prevents is benign. An old shortcut or iOS home-screen
  entry pointing at `/next/` follows the 308 to `/` and works; only its icon and
  name stay stale until it is re-added.
- It cannot be targeted precisely. The 308 happens server-side, so by the time
  React runs the URL is already `/` and a fresh install is indistinguishable
  from an old one — the line would be permanent clutter telling new installs to
  reinstall themselves.

The guidance lives here and in the cutover checklist instead: **if an old cals
icon is found on a device after 16.3, remove it and install again from `/`.**

---

## 7. Estimate

| Stage | Agent effort | Owner effort | Notes |
|---|---|---|---|
| 16.1 audit + plan | done (this session, docs-only) | read + answer §6 | zero risk |
| 16.2 retarget + preview | **~1–1.5 focused sessions** | ~15 minutes at phone size in the preview | a serving-path change plus test/doc re-basing — a few hundred changed lines, **smaller than any Phase 14/15 slice**; the care is in the route/worker/redirect edges, not the volume |
| 16.3 owner Force Update + phone test | ~1 hour (owner-controlled update, evidence, any fix loop; no new publish) | ~1 phone session over Cloudflare | the only household-visible step; rc34 image-tag rollback available |
| 16.4 legacy retirement | ~0.5 session | approve deletion; optional template refresh | deletes code; no user-visible surface except a missing lifeboat |

**Current state:** the preview and publication gates are complete; rc36 is published but not installed. The remaining household-visible step is the owner's separately authorized Force Update and phone check. Legacy deletion (16.4) still needs its own explicit approval. No schema, migration, API, appdata, template or Cloudflare work is part of 16.3.

---

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| `/` is the household's front door — a routing mistake is an outage | Preview-first; the legacy shell stays served at `/legacy/`; image-tag rollback; the smoke script asserts `/`, `/legacy/`, `/next/…` and every API route before release |
| Existing devices carry a legacy `/public/sw.js` or an old `/next/` registration | The new worker caches nothing; the one-time cleanup unregisters both idempotently; neither can affect a React page (one is scope-limited to `/public/`, the other has no fetch handler) |
| The Android install prompt is absent after cutover | Q2's network-only handler is in rc36; verify Settings → **Install app** on a real phone. If the prompt does not appear, record the browser/device and investigate before claiming PWA acceptance |
| Cloudflare Access session expiry in a standalone window | Test it in 16.3; a narrow, separately approved change is only considered if the experience is genuinely bad |
| Test re-basing hides a regression (72 specs move paths) | Run the suite before and after; keep the PWA assertions explicit at the new root; add a `/next/` redirect spec and a legacy-alive spec |
| Doc drift (≈75 `/next/` references, template text, `update-version.sh`) | The sweep is part of 16.2; `node scripts/check-doc-links.mjs` and the review checklist cover the rest |
| Publishing moves `dev-latest` without updating the household | rc36 is already published and `dev-latest` moved; the owner-controlled Force Update remains separate. Do not recreate or move the rc36 tag |

---

## 9. Acceptance

- `/` serves the React shell; deep links (`/diary/:date`, `/metrics`, `/settings`) work on reload; the shell is `no-store` and hashed assets are immutable.
- `/next` and `/next/*` redirect by stripping the prefix, preserving path and query; `/next/` lands on `/`.
- `/legacy/` serves the unchanged legacy shell; `/public/*`, `/static/*` and every `/api/*` route behave exactly as before.
- The React manifest's `id`, `start_url` and `scope` are `/`, its icons resolve at `/pwa/…`, and its worker registers with scope `/`, caches nothing and promises no offline behaviour.
- The phone test runs through the Cloudflare hostname with **no Cloudflare or appdata change**, and its result is recorded — including any legacy `/` shortcut or home-screen entry.
- All suites green: Vitest, Go vet/tests (with new root-handler tests), Playwright (re-based plus new root/redirect/legacy specs), Docker validation, runtime smoke, doc links.
- **Rollback rehearsed and documented:** re-pin the previous image tag and restart; no data or schema impact.
