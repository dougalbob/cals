# Phase 15 — Settings + PWA: implementation slices and acceptance

| Field | Value |
|---|---|
| **Status** | 🟡 **IN PROGRESS** — Settings and `/next/` installability are built and the owner-approved preview is ready to publish; tracked-nutrient settings remain deferred pending decision 47 |
| **Written** | 2026-10-05 |
| **Owner** | @dougalbob |
| **Purpose** | Deliver independently reviewable Settings and PWA increments, with the temporary `/next/` path handled explicitly |
| **Related** | [`frontend-strategy.md`](frontend-strategy.md) §7, [`../product/vision-and-open-questions.md`](../product/vision-and-open-questions.md) decisions 27, 47, 53, 66, 93, 95, 97 and 106; [`testing.md`](testing.md) |

> **Phase 14 is complete in the development line.** Phase 15 can now expose the user controls for preferences whose storage and calculations already landed in Phase 14. The last reported Unraid road-test remains tracked separately in [`../CURRENT_STATE.md`](../CURRENT_STATE.md); Phase 15 must not modify live appdata.

---

## 1. What Phase 15 owns

Phase 15 gives the React app a real Settings destination and makes the app installable as a PWA **before** Phase 16 cutover. It owns:

- Existing profile controls: display name, daily calorie goal, daily hydration goal, weight unit and bank start date.
- The already-persisted bank window (decision 66: 30 / 14 / 7 / All time plus a custom number of days; 14 by default).
- The already-persisted weigh-in trend window (decision 95: counted in weigh-ins, 7 by default, valid range 3–90).
- Per-user, independent positive-bank and deficit ring display limits (decision 27; 2,000 kcal each by default). These change only the arc scale, never bank arithmetic.
- The already-persisted body-outline preference (decision 97).
- The existing theme choices, and the haptics preference raised in decision 106. Theme and haptics are **device-local** presentation preferences, not account data; the user's goals and chart/ring preferences remain server-persisted.
- A link to My drinks, which is a separate page by decision 22.
- User-selectable tracked nutrients and the missing-data audit (decision 47), after the coverage behaviour and initial nutrient list are settled.
- PWA installability and a clean service worker only (decision 53). **No offline logging, queued writes, cached-data promise or push notifications.**

Admin/Standard roles and Swap user were pulled forward by decision 88 and are not Phase 15 work. Target weight remains on Metrics; the nutrition-threshold editor remains reachable from Nutrition.

## 2. Verified starting point

This records the baseline checked at `v2.0.0-dev-rc33` on 2026-10-05, before the Phase 15 implementation in §6:

- The React router has no Settings route. The frozen V1 Settings view has name, calorie goal, water goal, weight unit, bank start date and eight themes.
- `GET`/`PUT /api/users/me` already reads and writes the bank window, weigh-in trend window, body outline, target weight, name, calorie/water goals, weight unit and bank start date. The bank-window, trend-window and body-outline columns are additive and already exist. **The two ring limits do not yet have columns or API fields.**
- `CalorieRing` still uses one fixed ±2,000 kcal scale; Home and Diary are its two consumers. Haptics are invoked directly in navigation, chart panning and hydration/drink interactions, so a preference needs one shared gate.
- The React Go build already uses Vite base `/next/`. The existing `/public/manifest.json` belongs to the legacy page and starts at `/`; the legacy page registers `/public/sw.js`. The React build must not reuse those root-app settings.
- `nextFrontendHandler` serves `/next/assets/*` as files and sends other `/next/*` paths to the SPA shell. A generated manifest/service-worker file therefore needs an explicit file-serving path or it would incorrectly receive `index.html`.
- Decision 47 settles the goal (selectable nutrients, defaults of macros and fibre, and a missing-data audit), but the initial additional nutrient list, partial-coverage treatment and new nutrient thresholds are intentionally still open in the vision document. That work is a later slice, not a blocker to the Settings foundation.

## 3. Implementation slices

### 15.1 — Settings foundation and user preferences (built)

1. Add a phone-first React `/settings` route and a Settings item in the existing overflow navigation.
2. Persist the existing profile/goal fields and Phase 14 preferences through `PUT /api/users/me`; add additive user fields for independent ring limits, defaulting both to 2,000 kcal.
3. Make the Home and Diary rings read the selected positive and negative display caps from the user record. Leave all bank calculations unchanged.
4. Expose the bank presets plus a custom value, the 3–90 weigh-in average window, and the body-map outline. Explain that the bank window changes the bank everywhere, while the ring limits change presentation only.
5. Keep theme and haptics preferences local to the device; apply a saved theme before the first React paint. Provide a My drinks link and a version footer.
6. Cover persistence, validation, account switching and ring-scale behavior with Go, Vitest and phone-browser tests.

### 15.2 — Tracked nutrients and missing-data audit (deferred)

Build the decision-47 settings and audit only after the owner chooses the initial optional nutrients and how incomplete coverage should be presented. The vision document's starting recommendation is salt, sugars and saturated fat as the common optional values, with iron/calcium considered as data coverage permits; macros and fibre stay enabled by default. Do not treat missing data as zero or show a misleading traffic light. This slice may require additive food columns, API fields and an audit endpoint, so it needs its own plan and tests before implementation.

### 15.3 — PWA installability at `/next/` (built)

1. Add `vite-plugin-pwa` for the React build, with a React-specific manifest and a network-only service worker (no application-data caching).
2. In the production Go build, set `start_url` and `scope` to `/next/`; keep the legacy root manifest and worker untouched while the old UI remains the default.
3. Serve the generated manifest and worker files from `/next/` rather than falling through to `index.html`; use revalidating cache headers for the worker and manifest. Serve the same generated files in the fixture preview for review.
4. Add an install affordance/instructions that work across browsers, validate the manifest/worker paths at `/next/`, and run mobile Lighthouse/installability checks where the browser tooling permits.
5. Record the Phase 16 follow-up: switch the base, start URL and worker scope to `/`, clean up the legacy worker only as part of cutover, and keep `/next/` compatibility or explain re-installation during the transition.

## 4. Acceptance and guardrails

- Settings works at phone width, persists server preferences across refresh and account switches, and shows validation errors without losing unsaved input.
- Every user setting is stored per user through the API; only theme/haptics are browser-local. Admin acting as another user must edit the acting user's settings, exactly like other user data.
- Positive and negative ring limits are independently adjustable and described as presentation-only. The exact balance remains visible; only the arc saturation point changes.
- The window control labels “All time” clearly and warns that changing it changes the bank figure everywhere. The trend control says **weigh-ins**, not days.
- A React PWA launched from `/next/` opens the React app, not the legacy `/` UI. Its worker is scoped to `/next/`, does not cache API responses or queue writes, and does not take over the legacy app.
- Phase 16 retests install/launch at `/` and handles existing `/next/` installs deliberately.
- Migrations are additive. No data copy, reset, appdata access, or live-household operation.
- Standard checks: `npm run lint && npm run typecheck && npm test && npm run build:go`; Go vet/tests through `scripts/verify-go-in-sandbox.sh`; `node scripts/check-doc-links.mjs`; Playwright phone coverage for user-visible changes.
- Each slice gets an owner preview before merge. The Phase 15 Settings/PWA work must be reviewed at `/next/`; root cutover remains Phase 16.

---

## 5. Open owner decisions

Decision 47 remains the only known product design gate for Phase 15's tracked-nutrients slice:

1. Which optional nutrients should be offered initially (recommendation: salt, sugars and saturated fat; add iron/calcium only if useful coverage exists)?
2. When coverage is incomplete, should the light say “not enough data” until a reliable coverage threshold is met, rather than calculate from only the foods with values?
3. What thresholds should apply to newly enabled nutrient lights? The existing nutrition-target questions in the vision document remain open; do not invent medical guidance in the UI.

These questions do **not** block 15.1 or 15.3.

---

## 6. Implementation and preview review

**15.1 Settings foundation and 15.3 installability were built and published in rc34.** The Settings screen saves
profile and target values, the bank window, the independent surplus/deficit display limits, the weigh-in
trend window and body-outline choice to the acting user's account. The two new ring limits are additive
SQLite columns, both defaulting to 2,000 kcal; the ring scale remains presentation-only. Theme and
haptics remain device-local. The decision-47 nutrient controls and audit are not included.

The React manifest, icons and inert worker are scoped to `/next/`, separate from the legacy root app.
The worker has no fetch handler or cache behavior; there is no offline logging, queued write, API/data
cache or push notification. The install section explains browser- and iOS-specific installation and
sets the expectation that an internet connection is required. **Phase 16 must separately retarget and
retest installability at `/`.**

The owner reviewed the Arena preview on 2026-10-05, said it looked good and asked to publish this
increment. PR #76 merged into `cals-dev` as `40f1e171e21c7a77bdb7050a05d635d3a85fb504` and was
published as **`v2.0.0-dev-rc34`**. Publish run [37387169202](https://github.com/dougalbob/cals/actions/runs/37387169202)
passed the `cals-dev` ancestry guard, image build/push, prerelease and anonymous-pull checks; image
digest `sha256:1eba3145aa8adafdd6b03445a1082ff92ad77576f13a24b6450880acdb44e173`,
[prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc34). Final PR checks on
`6be0c20` passed: Docker/runtime [37386887916](https://github.com/dougalbob/cals/actions/runs/37386887916),
Go [37386887936](https://github.com/dougalbob/cals/actions/runs/37386887936) and Playwright
[37386887922](https://github.com/dougalbob/cals/actions/runs/37386887922), with **72/72** browser tests.
The tagged phone+desktop suite [37387169333](https://github.com/dougalbob/cals/actions/runs/37387169333)
also passed **72/72**.

Verification on the branch: 40 Vitest files / 311 tests; lint, typecheck, doc-link check, Go tests/vet,
`build:go` and `build:preview` passed. To clear the prior swipe failure without changing the visual
navigation design, the More/Back overlay buttons forward a finger-drag to the scroller and only suppress
the synthetic click when the swipe stays on the same page; the browser test verifies both directions.
The new Settings browser test, all three `/next/` PWA tests and both desktop smoke tests pass. The two
ring-limit fields are additive `users` columns defaulting to 2,000 kcal; no data copy, appdata operation
or template change. Vite emits a non-blocking `inlineDynamicImports` deprecation warning during the
PWA build.

**Unraid road-test target (still pending):** Force Update the existing `cals-dev-v2` container on port
`8151`, keeping its current image tag, `ghcr.io/dougalbob/cals-dev-v2:dev-latest` (now resolves to
rc34). One update carries rc28–rc34; no template or appdata change is required. Follow the accumulated
phone-size checklist in [`CURRENT_STATE.md`](../CURRENT_STATE.md) §3 item 10.
