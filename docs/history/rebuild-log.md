# Rebuild log — dated history (newest first)

| Field | Value |
|---|---|
| **Status** | 🟢 **ADOPTED — append-only record.** History only: it describes what happened, not what is true today |
| **Started** | 2026-10-03 |
| **Owner** | @dougalbob |
| **Purpose** | Keep dated narrative out of the documents agents must read to do work. Current status is in [`../CURRENT_STATE.md`](../CURRENT_STATE.md); the plan is in [`../architecture/frontend-strategy.md`](../architecture/frontend-strategy.md); the decisions are in [`../product/vision-and-open-questions.md`](../product/vision-and-open-questions.md) |
| **Related** | [`../architecture/unraid-image-release.md`](../architecture/unraid-image-release.md) (release log and image digests), [`../architecture/data-copy-warning.md`](../architecture/data-copy-warning.md) |

**How to use this.** Newest entry first, newest at the top. Add an entry when a change lands, a
session ends, or the owner makes a decision that had a story behind it. Keep entries short and point
at the decision numbers and PRs rather than restating the documents.

---

## 2026-10-05 — rc34 deployed, Settings checked; Phase 16 audited and staged (docs-only)

**rc34 is installed on Unraid.** The owner Force Updated the existing `cals-dev-v2` container and checked
the Settings work: **it behaves as intended.** That is the **only** part of the accumulated rc28–rc34
road-test confirmed complete — the rest of the phone checklist (weekly report, charts, body map, Foods
papercuts, ring limits, device-local theme/haptics) remains unconfirmed, and **PWA installation on a phone
is still untested**. The earlier rc27 windowed-bank sign-off stands; nothing else is claimed.

[`../architecture/phase-16-plan.md`](../architecture/phase-16-plan.md) was written against
the code rather than a handoff. It records what Phase 16 actually has to change: one `appBase` constant in
`web/frontend/vite.config.ts` controls Vite's `base` and the manifest's `id`/`start_url`/`scope`; the Go
side mounts React at exactly one path (`nextFrontendHandler` with six subtests) while the root catch-all
serves the legacy shell; the legacy UI has no client-side routing and uses absolute asset URLs, so it can
be served unchanged from `/legacy/` as the lifeboat; the two PWAs have separate identities, and the React
worker's lack of a fetch handler means **Chromium withholds the Android install prompt** (a Phase 15 goal
not actually met on Android — a decision for the owner, not an access-policy problem); and the legacy
app was never Chromium-installable (its worker's scope is `/public/`, which does not control `/`), so a
legacy `/` shortcut or iOS home-screen app needs no identity migration — it will simply open React, with
the old `/public/sw.js` registration cleaned up once. The audit also inventories the test/doc/template
work: the preview server and 72 Playwright specs are `/next/`-based, the smoke script asserts `/` legacy
and `/next/` React, `cals-dev-v2.xml`'s WebUI points at `/next/`, and ≈75 `/next/` references sit in 12
files.

**Cloudflare review ([`../architecture/admin-roles.md`](../architecture/admin-roles.md)
§9):** the PWA can be installed, launched and tested with the **current** access rules — every manifest,
icon, worker and shell request is same-origin and carries the `CF_Authorization` cookie — and the phone
test must run over the Cloudflare HTTPS hostname (LAN HTTP cannot install). **No Access, bypass, Tunnel,
DNS or authentication change is needed, and none is proposed.** Extending a bypass to `/next/` (or `/`)
would expose the SPA shell and bundle unauthenticated and remove Cloudflare's outer policy for the app's
entry point while `/api/*` still refused household data without a JWT — the defence-in-depth loss the
earlier advice warned about, for no install benefit. The deferred item stays deferred.

The plan proposes four reversible stages — decisions/audit (this session), a branch-only retarget with an
Arena preview at `/` and **no publish**, the owner-approved cutover release plus the Cloudflare phone
test, and legacy deletion only after a **separate** approval — with a `/next/…` 308-strip redirect that
preserves deep links, an image-tag rollback, and no appdata, template, Cloudflare or schema change in any
of them. It estimates ~2–3 focused sessions, smaller than any Phase 14/15 slice, and lists six questions
(including the Android install prompt and the `/next/` install policy) for the owner to answer before
implementation. **No code, appdata, template or Cloudflare change was made** — documentation only;
`node scripts/check-doc-links.mjs` passes and the status pages were updated to match.

---

## 2026-10-05 — Phase 15 published as `v2.0.0-dev-rc34` (PR #76)

PR #76 merged into `cals-dev` as `40f1e171e21c7a77bdb7050a05d635d3a85fb504`, then was tagged and
published as `v2.0.0-dev-rc34`. The publish workflow [37387169202](https://github.com/dougalbob/cals/actions/runs/37387169202)
passed the `cals-dev` ancestry guard, image build/push, prerelease creation and anonymous-pull gate.
The image digest is `sha256:1eba3145aa8adafdd6b03445a1082ff92ad77576f13a24b6450880acdb44e173`; the
[GitHub prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc34) records the exact
source commit and image. **The tag target is an ancestor of `origin/cals-dev`; the publication guard
passed.**

The final PR checks passed on head `6be0c20`: Docker/runtime
[37386887916](https://github.com/dougalbob/cals/actions/runs/37386887916), Go
[37386887936](https://github.com/dougalbob/cals/actions/runs/37386887936) and Playwright
[37386887922](https://github.com/dougalbob/cals/actions/runs/37386887922) (**72/72**). The tagged
[phone+desktop browser run](https://github.com/dougalbob/cals/actions/runs/37387169333) also passed
**72/72**, including both swipes through the More/Back overlays that previously blocked the gesture.
The image publish job verified an anonymous pull of `dev-latest` for Unraid.

rc34 adds the Phase 15 Settings foundation and React PWA installability scoped to `/next/`; the legacy
root app remains untouched and Phase 16 still owns retargeting/retesting installability at `/`. The two
additive `users.bank_ring_surplus_limit_kcal` and `users.bank_ring_deficit_limit_kcal` columns default
to 2,000 kcal; there was no data copy, appdata operation or template change. The owner-approved
accumulated Force Update and phone review remain pending: rc27 is the last reported Unraid installation.
Force Update the existing `cals-dev-v2` container on port `8151`, keeping its current image tag
`ghcr.io/dougalbob/cals-dev-v2:dev-latest` (now rc34); one update carries rc28–rc34. No template or
appdata change is required. See [`CURRENT_STATE.md`](../CURRENT_STATE.md) §3 item 10 for the phone checklist.

---

## 2026-10-05 — Phase 15 Settings + PWA built; preview approved

The Settings foundation (15.1) and installability at `/next/` (15.3) are built as the next reviewable
increment. The owner reviewed the Arena preview, said it looked good and asked to publish. After PR #75 merged the rc33 publication record, the updated code-bearing head `fc6e461` passed Docker/runtime ([run 37386598852](https://github.com/dougalbob/cals/actions/runs/37386598852)), Go ([run 37386598895](https://github.com/dougalbob/cals/actions/runs/37386598895)) and Playwright ([run 37386598925](https://github.com/dougalbob/cals/actions/runs/37386598925), 72/72). The final PR head `6be0c20` also passed all checks — Docker/runtime [37386887916](https://github.com/dougalbob/cals/actions/runs/37386887916), Go [37386887936](https://github.com/dougalbob/cals/actions/runs/37386887936), Playwright [37386887922](https://github.com/dougalbob/cals/actions/runs/37386887922) (72/72) — before PR #76 was merged and published as rc34 (see the newest entry above).

Settings persists profile/targets, bank-window presets and custom values, independent surplus/deficit
ring display limits, the weigh-in trend window and body-outline preference to the acting user's account. The two ring
limits are additive user columns, each defaulting to 2,000 kcal; they only scale the outer arc and never
change bank arithmetic. Theme and haptics remain device-local. Decision-47 tracked-nutrient preferences
and the missing-data audit stay deferred until their open choices are settled.

The React PWA has its own manifest and icons, with `start_url` and worker scope `/next/`; it does not
reuse the legacy root app's assets. Its worker has no fetch handler or cache behavior: no offline logging,
queued writes, cached API/data promise or push notifications. The install guidance requires a connection.
**Phase 16 still has to retarget and retest installability at `/`.** The migration is additive; no data
copy, reset or appdata operation occurred.

Verification: 311 Vitest tests over 40 files, lint/typecheck/doc links, Go tests/vet, `build:go` and
`build:preview` passed. The full local phone+desktop Playwright suite and all three PR browser checks
pass: **72/72**. The previously deferred bottom-navigation swipe failure was fixed for this publication
loop by forwarding gestures started on the More/Back overlays to the scroller; the updated phone test
swipes through both overlays. The new Settings journey, all three PWA checks and both desktop smoke
tests pass. The PWA build emits a non-blocking `inlineDynamicImports` deprecation warning. The
tracked-nutrient slice (15.2) remains deferred pending decision 47.

---

## 2026-10-05 — Phase 14.6 published as `v2.0.0-dev-rc33`, after GitHub's Actions incident

PR #74 (the weekly report) was merged into `cals-dev` as `e6d4d3c531ceae421245b40879f1b1a58dd7e993` and
tagged `v2.0.0-dev-rc33`. The tag-triggered publish and browser runs never started: GitHub was mid-incident
([Actions — delays assigning GitHub-hosted runners](https://www.githubstatus.com/incidents/3q1yb5m7ltvb),
first reported 19:11 UTC), and three consecutive runs — 37364192851, 37366694356 and 37369971976 — were each
cancelled after the 15-minute runner-acquisition timeout with *"The job was not acquired by Runner of type
hosted even after multiple attempts"*. Nothing in the repository was at fault; the ancestry guard, image
build and browser suite never executed.

Recovery was deliberately **the same tag pushed again, not a new tag**. The annotated tag object (`a827fcf`,
pointing at `e6d4d3c`) was deleted and re-pushed byte-for-byte unchanged so the `push` event fired a fresh
run — no commit, tag message or target moved, and the tag's contents are identical to the first push. Run
[37371578204](https://github.com/dougalbob/cals/actions/runs/37371578204) acquired a runner at 20:44 UTC and
passed every gate: the `cals-dev` ancestry guard, the image build, the exact-tag and `dev-latest` pushes, the
prerelease and the anonymous-pull check. Digest
`sha256:46dec0bbfa4f811caf85c2b2d84378e88596b7d3b9a01ee1cdbeae56aedd66c1`; [prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc33).
`dev-latest` now points at rc33.

The tagged [browser suite](https://github.com/dougalbob/cals/actions/runs/37371578135) ran **68 tests and
passed 66**: both new `e2e/metrics-report.spec.ts` phone specs pass, and the only failures are the two
owner-deferred `e2e/navigation.spec.ts` tests that have been red since rc30 (`playwright-run-37371578135`
artifact attached). Nothing in PR #74 touches navigation.

Phase 14 is complete in code: all six slices are built and published (rc27→rc33). rc33 is the newest of the
five consecutive published checkpoints that await one accumulated Force Update, and rc27 remains the last
reported Unraid installation.

## 2026-10-05 — Phase 14.6 built: the weekly report (decisions 46, 107–109)

The last slice of Phase 14. Before anything was written the owner settled its three shape questions, now
recorded as [decisions 107–109](../product/vision-and-open-questions.md#the-weekly-report--decisions-107109-2026-10-05):

- **107 — one week at a time, with a free range one tap away.** The plan's recommendation was a week picker
  defaulting to the current week; the owner took that and added a **Custom** mode for any `from`/`to` pair the
  API allows. The report's window rides in the URL as `report`/`report_anchor`/`report_from`/`report_to`,
  because `from`/`to` on `/metrics` already belong to the pannable charts (decision 69) — so a deep-linked
  report cannot move somebody's chart, and the default view leaves the clean `/metrics` URL alone.
- **108 — it opens on the current week so far**, Monday through today, labelled "· so far", with the previous
  week one tap back. It matches the Calendar, which also refuses to look forward (decision 63).
- **109 — "best" and "worst" mean closest to and furthest from the daily goal**, either side, each labelled
  with its kcal and ± delta; not "lowest intake" and not "biggest blowout". Unlogged days are excluded from
  both, as from every other figure (decision 42).

The card in Metrics reports calories against `goal × logged days` (with the average over logged days and
over/under/on-goal counts), **how the bank moved**, water, weight change, the four nutrition traffic lights
for the range, the best and worst days, and **the days excluded as unlogged, named** — decision 42's rule made
visible rather than quiet, which is why the report was asked for. A day's bank movement comes from the
Calendar's closing balances, computed by the same `computeBankWindow` every other bank surface calls, so the
card cannot disagree with the tile; its range starts one day before the report's first day, because a closing
balance is the bank as of the *next* morning (slice 14.2's rule). The weigh-in change is carried forward from
the last weigh-in at each end of the period, never fabricated for a day without one.

`GET /api/nutrition/weekly` gained the same `from`/`to` contract slice 14.1 gave the metrics endpoints —
shared `resolveSeriesRange`, strict `400`s, 400-day cap, `to` clamped to today — while the legacy `days`
parameter keeps its exact old contract, so V1 and the Nutrition screen are untouched. The fixture API mirrors
that range path, cross-checked against its own `/api/stats/calories` rows so the Arena preview's numbers match
the app's. **No schema change, migration, data copy or appdata operation.**

Verified with `go vet ./...` and `go test ./...` (a new `nutrition_test.go`: exact window and contiguity,
drink-inclusive calories agreeing with the ring, clamping, six malformed ranges, the unchanged `days`
contract, and a range reaching before `bank_start_date`) — every new test run against a simulated pre-slice
handler and confirmed to fail there; the real Go server driven over HTTP on a fresh database (a 7-day window
returned exactly 7 days including a day before the bank start, 500 food + 180 drink reported as 500/180/0 on
their days with an average of 445 over the 4 logged days, `?days=7` unchanged, every malformed range a `400`,
a future `to` clamped); 305 Vitest tests (13 new report-maths, 4 new report-card, 3 new fixture-contract);
lint/typecheck/`build:go`; and the full Playwright suite — 68 tests, 66 passed, the two failures being the
known, owner-deferred `e2e/navigation.spec.ts` specs, with the slice's own two new phone tests passing. The
slice awaits the owner's Arena-preview review; on approval it is published as the next `rc` and joins the
accumulated Unraid road-test (CURRENT_STATE §3 items 10 and 12).

---

## 2026-10-05 — rc32 published: food-editor precision and metric panning polish (decision 106, PR #72)

The owner reviewed the Arena preview and asked to publish this frontend-only follow-up. PR #72 merged into
`cals-dev` as `d5a996e22a4652e9cc0fec456b763a381266dda0` and was tagged `v2.0.0-dev-rc32` at that exact
commit. [Publish run 37358754022](https://github.com/dougalbob/cals/actions/runs/37358754022) passed the
ancestry guard, image build/push, prerelease creation and anonymous-pull gate; it published digest
`sha256:16334a2811579fd30a1342830a213dd04d6a0fb260c2be400f2a8ddea6b3c629` and the
[prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc32).

Decision 106 rounds prefilled per-100 g calories, protein, carbs, fat and fibre to whole numbers in the food
editor; the Save & edit regression verifies an unchanged save stores those rounded values. Search and Diary
formatting remain untouched. The metric charts retain the previous window while the next range loads, throttle
URL/range commits to 150 ms with a final flush on release, forward AbortSignals to cancel superseded reads,
and tick haptics after at least five days of net movement. The haptics preference remains Phase 15.

Verification: frontend lint, typecheck, all 285 Vitest tests and `build:go` passed; both Metrics phone
Playwright tests passed locally. PR [Go](https://github.com/dougalbob/cals/actions/runs/37358288410) and
[Docker](https://github.com/dougalbob/cals/actions/runs/37358288558) checks passed, as did the post-merge
[Go run](https://github.com/dougalbob/cals/actions/runs/37358715115). The PR milestone browser check was
skipped as requested so the owner-deferred nav specs were not run at PR time. The tagged milestone
[browser run 37358754067](https://github.com/dougalbob/cals/actions/runs/37358754067) completed with **64
passed, 2 failed**: both failures are the known, owner-deferred `e2e/navigation.spec.ts` bottom-navigation
tests. The owner asked to leave the nav issue and spec untouched; the [run's uploaded Playwright artifacts](https://github.com/dougalbob/cals/actions/runs/37358754067)
contain traces/screenshots. No API/schema change, migration, data copy, appdata operation or template change
in rc32. The last reported Unraid installation remains rc27; Force Update to rc32 is pending.

---

## 2026-10-05 — rc31 published: the owner's road-test papercuts (PR #70, decisions 102–105)

The owner reviewed the papercuts slice in the Arena preview — **"all looks good"** — and asked for it to be
published, so PR #70 was merged into `cals-dev` as `33f554c1f52264b4187c953a559ad3347cc94425` and tagged
`v2.0.0-dev-rc31` at exactly that commit. [Publish run 37353202360](https://github.com/dougalbob/cals/actions/runs/37353202360)
passed the ancestry guard, built and pushed `ghcr.io/dougalbob/cals-dev-v2:v2.0.0-dev-rc31` plus `dev-latest`
(digest `sha256:b86b3c860d02395ea4b6b5672ab402019843ef9e12a2513ea6ee022784054d8a`), created the
[prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc31) and passed the anonymous-pull gate.
No schema migration, data copy, appdata operation or template change. The tagged
[browser suite 37353202025](https://github.com/dougalbob/cals/actions/runs/37353202025) passed **64 of 66**; the
two failures are rc30's pre-existing `e2e/navigation.spec.ts` specs.

**rc30's publication record, which never landed, is recorded here and in the release log in the same pass.**
`v2.0.0-dev-rc30` (Phase 14.5 — the Nutrition screen, drink calories in the nutrition total, the target-weight
editor and the nav Back/More change; PR #69) was published at `1660342d` on 2026-10-05, [publish run
37346042746](https://github.com/dougalbob/cals/actions/runs/37346042746) succeeded, digest
`sha256:4d8d419b4e6afc5212ebd81853942e86b6ac0034791ffa3ebbaec6e46d610903`, and its tagged [browser suite
37346042700](https://github.com/dougalbob/cals/actions/runs/37346042700) failed the same two nav tests. The nav
diagnosis (a stale `Show earlier navigation destinations` label in the arrow spec, and the new **More** overlay
swallowing a swipe that starts at the bar's right edge) is in [`CURRENT_STATE.md`](../CURRENT_STATE.md) §3 and the
decision log; fixing it is a small, unstarted nav follow-up.

**One Force Update now carries four checkpoints** — rc28's charts, rc29's body map, rc30's Nutrition screen and
rc31's papercuts. The Unraid road-test in CURRENT_STATE §3 item 10 is the remaining acceptance gate for all four.
The owner also confirmed two items should not be chased: crop stays deferred (decision 82) and the FatSecret
decimal-rounding complaint was withdrawn for a future session. The panned-charts flashing remains a diagnosed,
unstarted follow-up slice.

---

## 2026-10-05 — Owner road-test pass: non-local foods and mobile papercuts (decisions 102–105)

The owner reviewed the React app on a phone and sent a batch of issues. This session took the slice it could
finish well: **FatSecret (non-local) foods are no longer read-only, and six small mobile papercuts are
fixed** — decisions 102–105. Frontend only: no Go change, no schema migration, no data copy and no appdata
operation.

- **Diary:** picking a FatSecret result resolves `GET /api/foods/fs_<id>` (which caches the food and its
  FatSecret measures, exactly as the legacy Add sheet did) and only then opens the quantity sheet, with a
  "saving to your food list" row state and a saved-from-FatSecret note. Meal-entry food/recipe names wrap
  instead of truncating, so "Sliced white bread, thick toast" reads in full (decision 102).
- **Foods:** a FatSecret search result gains **Save & edit** — the food is cached, the list is refreshed and
  the editor opens with a provenance note so its per-100 g values and household measures can be corrected
  (decision 102).
- **Quick drinks:** the ⋯ button had disappeared from Tea and Coffee because the additive extras migration
  defaulted legacy rows to `accepts_milk = 0, accepts_sugar = 0` and the UI trusted those zeros; `drinkExtras()`
  now ORs the row's flags with the drink type's, and the drink editor's volume/calories fields no longer write a
  literal leading zero when cleared and retyped (decisions 103).
- **Recipes:** the photo picker gains a **Take photo** camera input beside the gallery picker; the manual
  cooked-weight box shows the sum of the food ingredients as a display-only hint; and removing a food or text
  ingredient asks first with the same two-button check as *Archive recipe* (decisions 104–105).
- **Chart panning:** the owner's report is recorded with a code-level diagnosis in the decision log (per-day
  `setSearchParams`, no keep-previous-data so ranges flash `Loading…`, per-day haptics, full-route re-render;
  visited ranges are cached, which is why it improves) and is planned as its own small follow-up slice.

Verification on this branch: `npm test` — 36 files, 282 tests, all passing (six new behavioural tests:
FatSecret pick-and-log in the Diary, Save & edit in Foods, a legacy Tea row's ⋯, the retyped drink volume, and
the recipe hint/confirmation/camera inputs); `npx tsc --noEmit`, `npm run lint --max-warnings 0` and
`npm run build:go` clean; the fixture API now mirrors the real `fs_` search/caching contract so those flows are
tested against the same shapes the Go server returns.

The browser suite **did** run in the sandbox this time, via `scripts/run-playwright-in-sandbox.sh` (the npm-fetched
Chromium): **64 passed, 2 failed**, the two failures being the pre-existing `e2e/navigation.spec.ts` ones inherited
from rc30 (see below). The suite earned its keep by catching a real layout bug in this slice: once a photo was
selected, the recipe-photo picker's action row (take / change / remove) was wider than its card at 412 px, and
Chromium's mobile emulation responded by shrinking the whole page to fit — a zoomed-out, cut-off form that also made
the click target land on the wrong element. The status line now sits above the buttons and the buttons wrap, pinned by
a new assertion in `e2e/recipes-create.spec.ts` that measures the row against its card with a photo selected. Two
specs were updated for intended behaviour: the photo input is addressed as **Choose recipe photo** (the camera input's
own label made the old substring match ambiguous) and the editor's remove-a-note check now taps **Yes, remove**.

**The two rc30 nav failures are diagnosed** (test-side and app-side, neither touched by this branch): the arrow test
still asks for `Show earlier navigation destinations`, but PR #69 renamed the overlay to `Show main navigation`
(visible text **Back**); and the swipe test's touch gesture starts at the far right of the nav, where the rc30 **More**
overlay (a 20%-wide button at `right-0`) swallows it, so the scroller never moves. The arrow itself works. Fixing the
overlay's swipe-through (or narrowing it) is a small follow-up for whoever picks up the nav.


The owner approved the Arena preview ("looks good") and the code-split fix, so PR #67 was merged into
`cals-dev` as `3c54b824f7bfb8818a70f327b073e10b42e34a14` and tagged `v2.0.0-dev-rc29` at exactly that
commit. [Publish run 37327096123](https://github.com/dougalbob/cals/actions/runs/37327096123) passed the
ancestry guard, built and pushed `ghcr.io/dougalbob/cals-dev-v2:v2.0.0-dev-rc29` plus `dev-latest`
(digest `sha256:7f101181d96492b62a1f3c78cc94c4af5ca4552bc7ce8baa974ee95d6c8a2436`), created the
[prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc29) and passed the
anonymous-pull gate; the tagged [browser suite 37327096209](https://github.com/dougalbob/cals/actions/runs/37327096209)
passed 66 tests. One additive migration (`users.body_outline`, nullable) and decision 101's route-level
code splitting ship in this image. The owner said he will have a proper road-test once it is published —
that Force Update (CURRENT_STATE §3 item 10) also covers rc28's pending chart drag test (item 8), since
one update carries both. Release details are recorded in the
[release log](../architecture/unraid-image-release.md#release-log); like rc28's, this publication record
lands in a focused docs-only follow-up PR per [`git-workflow.md`](../architecture/git-workflow.md) §5.

---

## 2026-10-05 — 14.4 preview approved; bundle audit and route-level code splitting (decision 101)

The owner reviewed the Phase 14.4 Arena preview — **"looks good"** — closing CURRENT_STATE §3 item 9's
preview half, and said he would road-test properly once the rc is published. Before publication he asked
whether the **529 kB bundle was metrics-specific**, since more metrics work is coming. A module-level audit
(rollup-plugin-visualizer on the production build) showed it was not: **~72% of the single chunk was fixed
framework overhead** — React + ReactDOM + scheduler ~48%, react-router v8 ~18%, @tanstack/react-query ~6% —
with every page sharing that one chunk; the 14.4 metrics code was ~38 kB, roughly **3.5% of the bundle**.
Future metrics additions grow only the small app-code slice, but the shared-chunk design meant every visit
paid for every page and Vite's >500 kB warning would keep firing.

Settled with the owner as **decision 101**: route-level code splitting, delivered inside PR #67 the same
day. Every route lazy-loads its own chunk (`web/frontend/src/router.tsx`, named-export adapters keep the
existing import style); Home stays eager as the landing page; one `<Suspense>` fallback wraps `<Outlet />`
in the app shell (`data-testid="route-loading"`). Result: **main chunk 529 → 339 kB, Metrics its own
28 kB chunk**, Vite's warning gone, and the shared vendor chunk caches once across navigations — so future
metrics growth stays inside the metrics chunk. No backend or Go-serving change: `cmd/server/frontend.go`
serves `assets/` from disk with immutable caching. Re-verified after the split: typecheck, lint,
**276 Vitest**, `build:go` + `build:preview`, full Playwright suite **66 passed** (56.2 s), doc-link
checker, and the live preview served the new chunks over HTTP. The owner chose to land this in PR #67
rather than a follow-up. The rc publication is the next step, then the owner's Unraid road-test.

---

## 2026-10-05 — Phase 14.4 built: the body-map measurement picker (decisions 96–100)

The session settled the four questions gating 14.4 with the owner — **decision 96** (the map's save merges
into today's row; corrections go through the new `PUT /api/measurements/{id}`, a third option beyond the
plan's (a)/(b)), **97** (the `users.body_outline` column lands in-slice with a one-time Female/Male picker),
**98** (Bust on the female outline, Chest on the male) and **99** (0.5 cm stepper, typed 0.1 values) — and
approved the extras bundle as **decision 100**: the staleness line with decision 87's amber cue, the pop-up's
previous-value context and live delta, the all-parts tappable history with two-step delete, the `from`/`to`
window on the list, `GET /api/measurements/latest`, and the wire-shape normalisation.

Before building, two defects were reproduced against a real server: the same-day wipe (posting hips deleted
the morning's waist) and the `sql.NullFloat64` wire shape that crashed the rc28 Metrics screen on any account
with measurements. Both are fixed and pinned — Go handler tests (7 new), 27 new Vitest tests, 4 new
Playwright phone tests, full suite 66 passed; lint, typecheck, `build:go`, `build:preview` and the
live-server curl pass all green. One additive migration, no data copy or appdata operation; the bundle grew
508 → 529 kB. The slice is open as PR #67 (Docker and Go checks green) and waits for the owner's Arena-preview approval (CURRENT_STATE §3 item 9), then
merges and publishes as the next rc.

---

## 2026-10-05 — rc28 published: the pannable metrics charts (PR #65, Phase 14.3)

The owner approved 14.3 in the Arena preview ("looks good") and said to publish, so the checkpoint ran the
documented loop: PR #65 merged to `cals-dev` as `e34e9a342c1706750594515349a7bcde871b32dc`, the annotated tag `v2.0.0-dev-rc28` pushed against
exactly that commit, and the publish workflow passed its ancestry guard, build/push, prerelease creation and
anonymous-pull check ([run 37312285484](https://github.com/dougalbob/cals/actions/runs/37312285484), digest `sha256:6d406d333f028febd77a1f0bf06d5bba68bbbbcfb04afe91caa6b7c179788a19`); the
tagged browser suite ([37312285365](https://github.com/dougalbob/cals/actions/runs/37312285365)) passed too. The
[prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc28) carries the digest.

**What it adds:** the weigh-in and goal-vs-consumed charts at `/next/metrics` pan one shared window (drag the
chart and the range rides in `?from=&to=`, re-fetching through 14.1's range parameters); the trend is a moving
average over the weigh-ins themselves, drawn from the third observation and labelled with its window read from
`GET /api/users/me`; the goal chart bands green/amber/red at 10% over goal; and the additive
`users.weight_trend_days` column (default 7, writable through `PUT /api/users/me`, no UI until Phase 15) lands with
it. No chart library (decision 94). One additive migration, no data copy, no appdata operation.

**One process note, recorded deliberately.** The release-evidence row above could only be written after the tag had
been built — the digest and run IDs come from that run — so it landed in a focused docs-only follow-up PR, exactly
as [`git-workflow.md`](../architecture/git-workflow.md) §5 prescribes and as PR #53, #57 and #63 did before it. That
is the single exception to `AGENTS.md` rule 7's "one PR per session", and both documents now say so. It is narrow
(release evidence only) and cannot strand work: its content is on GitHub from the moment the workflow finishes.

**Status:** rc28 is the newest published checkpoint and awaits the owner's Force Update and road-test on
`cals-dev-v2`; rc27 remains the last reported installation.

---

## 2026-10-05 — Phase 14.3 rebuilt: the pannable metrics charts (PR #65)

The 14.3 work lost with the previous session (see the entry below) was rebuilt from
[`phase-14-plan.md`](../architecture/phase-14-plan.md) §14.3 and landed in **PR #65**: the weigh-in and
goal-vs-consumed charts now pan one shared window, and the two additive pieces the slice promised — a
per-user trend window and the 3–90 validation that stops a value nothing could draw — are in.

**Built:** `usePanWindow` (drag the chart to move the *data window*, re-fetching through slice 14.1's
`from`/`to`; touch pans on movement with one optional `navigator.vibrate` tick per day, a mouse needs a
150 ms click-and-hold, the window rides in `?from=&to=` and clamps at today); a weigh-in chart that keeps
raw weigh-ins as points with a dashed moving average, drawn from the third observation and labelled with
its window, read from `GET /api/users/me`; a goal-vs-consumed chart with green/amber/red bands
(decision 71) on the drink-inclusive stats; and the additive `users.weight_trend_days` column (default 7,
`PUT /api/users/me` with no UI, values below 3 or above 90 are `400`s). The bank line and the
measurements table keep their fixed windows; decision 94 held — hand-written SVG, no chart library
(+5.5 kB raw, +2.3 kB gzip).

**Four things building it taught**, now recorded in the plan beside 14.2's lessons: the pan hook has to
be a React event prop rather than a ref callback (the compiler-aware `react-hooks/refs` rule rejects the
ref plumbing); the chart follows the finger like a map, so dragging right reveals older days and left is
the clamp; the trend's first value at three weigh-ins is a dot, not a line; and the weigh-in y-axis needs
a 2 kg minimum span so a small wobble cannot fill the plot.

**Evidence:** Go vet + tests green in the sandbox (new `users_test.go` covering the default, GET, PUT and
both rejected bounds); 248 Vitest tests over 32 files (20 new); lint, typecheck, `build:go` and
`build:preview` clean; the new `e2e/metrics.spec.ts` passes two real touch-drag tests locally at phone
size, and `run-e2e` was applied so CI runs the full browser suite on the PR. The owner's preview review
is the slice's acceptance gate.

---

## 2026-10-05 — One session, one PR: the rule and the 14.3 rebuild

The previous Arena session merged its PR (#64, the rc27 sign-off docs) and then carried on building Phase
14.3 on the same branch — as several sessions had done before, opening a second, follow-up PR (PR #63
followed #62; PR #55 followed #54). This time it could not: GitHub access failed mid-session and never
returned, so three finished 14.3 commits stayed local to a sandbox that is not shared with any other
session. The workspace was per-session, the handoff file it wrote lived in that sandbox, and the branch on
the remote still points at the pre-14.3 `9496e8a`. Nothing pushed, nothing recoverable.

The lesson is now a working rule, not folklore. [`AGENTS.md`](../../AGENTS.md) §0 rule 7 makes it a hard
rule — **one PR per session, a merged PR ends the session, and work is pushed as it is done** — and
[`git-workflow.md`](../architecture/git-workflow.md) §5 carries the detail: why the sandbox is not
durable, how to adopt a previous session's unmerged branch by cherry-picking it into the current PR, and
what a real handoff note contains (a pushed branch and a tip SHA, never a sandbox path).

Two things made the loss avoidable and are worth repeating. First, the durable medium is the remote: a
branch pushed before the merge would have been recoverable by any later session, and a cherry-pick onto a
fresh branch is minutes of work. Second, the sandbox is not a shared folder — the previous session's plan
("the next session will find the repo at `aa6d6dc` with the files on disk") was never true. What survives
between sessions is GitHub and the owner's chat transcript.

14.3 itself was never merged and is rebuilt from the approved plan
([`phase-14-plan.md`](../architecture/phase-14-plan.md) §14.3) in the session that recorded this rule.

---

## 2026-10-05 — rc27 installed and signed off; Phase 14.3 ready to build (docs pass)

The owner Force Updated `cals-dev-v2` to `v2.0.0-dev-rc27` on Unraid and road-tested it on 2026-10-05.
His verdict: **"all looks good"**. The household's real bank figures were read on both accounts (the
Admin Swap user reaches the second one), which the rc27 release note had left as the gate before 14.3.
That closes the Phase 14.1/14.2 acceptance gate, makes rc27 the last reported installation, and leaves
every published checkpoint installed and signed off.

A follow-up documentation pass recorded the sign-off and brought the plan in line with what was built:
14.2 is marked **built** in [`phase-14-plan.md`](../architecture/phase-14-plan.md) with the five things
building it taught (one helper shared by three surfaces; one rounding rule; the logged-day rule the owner
chose to keep; the numbers moving twice over and by more than the window explains; and proving the new
tests fail without the change). 14.3 is marked **ready** with three implementation notes
(`weight_trend_days` read from `GET /api/users/me` rather than a hard-coded 7; a trend drawn only where at
least three weigh-ins are available and labelled with its method; the 30-day bank line and measurements
table keeping their windows). §5's acceptance table and §7's estimates were re-based, and the stale
"not yet installed" and test-count claims were corrected (228 Vitest tests over 28 files at rc27). No code,
API, schema or appdata change — documentation only.

## 2026-10-05 — Phase 14 slices 14.1 + 14.2 published as rc27 (PR #62)

The owner approved the Arena preview, declined the optional narrowing of what counts as a logged day, and
said "Lets publish". PR #62 merged to `cals-dev` at `3619859ebb55b53b74948afd645196898549c74e`, and the
annotated tag `v2.0.0-dev-rc27` points at exactly that commit — 14.2's windowed bank plus 14.1's metrics
backend foundations, released together because the owner held 14.1's checkpoint deliberately.

[Publish run 37296647260](https://github.com/dougalbob/cals/actions/runs/37296647260) passed the ancestry
guard, built and pushed the exact tag and `dev-latest`, recorded digest
`sha256:bf36365a44e46e454878eb4ebf82770a45d3cb2f8c8d50e95f3c154b6d251130`, created the [GitHub
prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc27) and passed the anonymous-pull
gate. The tagged [Playwright suite 37296647285](https://github.com/dougalbob/cals/actions/runs/37296647285)
passed all 60 tests, and the PR's own [Docker/runtime](https://github.com/dougalbob/cals/actions/runs/37292157541),
[Go](https://github.com/dougalbob/cals/actions/runs/37292157536) and [browser](https://github.com/dougalbob/cals/actions/runs/37296373968)
checks were green as well (the PR carried the `run-e2e` label because the slice changes layout).

**One additive migration** (`users.bank_window_days`, existing accounts default to 14) runs on first start:
no data copy, appdata operation or template change. rc27 is `dev-latest` but **not yet installed**; the
last reported installation is **rc26**, which the owner tested on Unraid and signed off on the same day,
closing the rc24/rc25 installation-status gap along with it.

**What the owner is being asked to review on the updated container:** the new bank figure on both
accounts, on Today, Diary, Calendar and Metrics at phone size. Two things move at once — the window is
14 completed days rather than everything since the bank's start date, and a day with **no logging at all**
no longer adds a day's budget (a day with any entry, including a logged glass of water, still counts).
Cropping remains deferred, and Phase 14.3 waits on the owner's read of the real numbers.

## 2026-10-05 — Phase 14 slice 14.2 built: the windowed bank

**The bank stopped being a running total.** `GET /api/bank` now sums the previous N **completed
calendar days** — the as-of date is excluded, because today is always in progress — and decision 42
finally bites inside that window: a day with no logging contributes neither its budget nor its spend,
so a fortnight with two unlogged days budgets twelve days, not fourteen (decision 66, settled by
91–92). `bank_start_date` is now the window's floor rather than its starting point, and "All time"
removes only the length limit — it still excludes unlogged days (decision 91).

**The household's numbers move twice over**, which is exactly why the slice carries the checkpoint: a
window is smaller than an accumulation from day one, and an unlogged day no longer adds a free day's
budget. The owner reads the new figure on both accounts at `/next/` before anything builds on it.

**The figure is auditable and labelable.** Four additive response fields — `window_days`,
`window_start_date`, `days_counted`, `days_unlogged` — ship with it, and every React surface that
prints the balance now names its window ("Last 14 days" / "All time"): the Banked/Deficit tile, the
ring's accessible label, the Diary header, the Calendar legend and cell labels, and the Metrics bank
chart. The chart's `🏦 Calorie bank (30 days)` heading was left alone on purpose: 30 is the chart's own
range, not the bank's window.

**The window is per person, on the user record** (decision 93): an additive migration adds
`users.bank_window_days INTEGER NOT NULL DEFAULT 14`, read by the calculation and writable through
`PUT /api/users/me` (0 = all time; a negative value is a `400`). There is deliberately no control until
Phase 15.

**One rule, three surfaces.** The Calendar's per-day closing balance and `GET /api/stats/bank` were
cumulative and food-only; both now call the same `computeBankWindow` helper as `/api/bank`, so they
cannot drift. A single rounding rule (half away from zero, applied once per window) replaces the
Calendar's round-half-up and the bank's truncation, which could previously disagree by a calorie on
fractional grams.

**The one judgement call worth the owner's eye:** a day counts as logged when *either* ledger has an
entry for it, so a day whose only entry is a zero-calorie glass of water still contributes a full day's
budget. That is the literal reading of decision 42 ("a day with no logging at all"), and it matters here
because water is logged most days; the stricter reading — only a calorie-bearing entry counts as
logging — is a one-line change if the owner prefers it.

**Verification.** `go build ./...`, `go vet ./...` and `go test ./...`; 13 new bank/window tests plus
four updated Calendar/stats expectations, and the new tests were run against a simulated pre-slice
calculation to prove they fail without the change (the old rule reports 2500 where a two-day window over
five logged days says 1000, and 1870 where the Calendar says 370). A real Go server was driven over
HTTP: a three-day window over controlled data returns 1350 where the pre-slice rule returned a
since-day-one figure, changing the window moves it (2 days → 700, all time → 1950), a negative window is
a `400`, and every Calendar and `GET /api/stats/bank` row equals `GET /api/bank?date=<day + 1>`.
`npx vitest run` (28 files, 228 tests, including a new `bank-window.test.mjs` pinning the fixture API to
the Go rule), `npm run lint`, `npm run typecheck`, `npm run build:go`, `npm run build:preview` and
`node scripts/check-doc-links.mjs`, and the full Playwright browser suite (**60 tests passed**, phone and
desktop) — its hydration spec pins the invariant this slice must not break: a +94 kcal drink leaves
today's bank untouched and drops tomorrow's balance and `today_available` by exactly 94, which holds
because today sits inside tomorrow's window. `start_date` still returns its raw RFC3339 shape on purpose
— the wire-format question is untouched.

**State at the time of writing:** built on the Arena branch and reviewed at `/next/`; it was published
the same day as `v2.0.0-dev-rc27` — see the entry above — after which 14.3 and the Phase 15 window
control wait on the owner's read of the real figure.

---

## 2026-10-05 — Phase 14 slice 14.1 built: the metrics backend foundations

The first slice of the newly scoped Phase 14, and deliberately the one with **no owner-visible change**:
it is what the charts and the windowed bank stand on.

**The deferred RFC3339 date fix landed**, in `weight.go`, `measurements.go` and `fitness.go`. That turned
out to be a live defect rather than a theoretical one — `web/static/js/components/metrics.js:74` compares
the returned date against a plain `YYYY-MM-DD`, so **the V1 weight box never pre-filled today's
weigh-in** and quietly fell back to the last known value.

**The series endpoints gained a range.** `GET /api/weight`, `GET /api/stats/calories`,
`GET /api/stats/bank` and `GET /api/steps` all accept `from`/`to` (inclusive, 400-day cap, `400` on a
malformed range), which is what decision 69's panning needs; both stats endpoints used to be anchored at
`date('now')` with no way to ask for an earlier window. The legacy `days` parameter keeps its old,
deliberately lenient behaviour, so V1 and the current React screen are untouched — with one correction:
`days` now means exactly N days everywhere, where weight and steps previously returned N + 1 calendar
days.

**Drinks now count in both stats endpoints**, not just `/api/stats/calories`. Shipping one and not the
other would have published a known inconsistency; `GET /api/bank` has counted drinks since Phase 12.

One planned fix turned out not to be one, and is worth recording so nobody repeats the reasoning:
`HandleGetBankStats` reads `bank_start_date` through a `COALESCE`, and because
`sqlite3_column_decltype` is NULL for an expression the driver was **already** returning plain text.
A probe against a real server confirmed it — `SELECT bank_start_date` scans as
`2026-10-05T00:00:00Z` while `SELECT COALESCE(bank_start_date, …)` scans as `2026-10-05`. The
`isoDate` stayed as a guard against someone dropping the `COALESCE`, and the handler comment now says
that instead of claiming a repair that never happened. Two genuine leaks — `GET /api/users/me`'s
`bank_start_date` and `GET /api/bank`'s `start_date` — are left alone on purpose; changing the wire
shape is an open question, not a foundations slice.

**Verification, in three layers.** `go vet ./...` and `go test ./...` clean, with 12 new handler tests (17 cases
counting the validation subtests) in `internal/handlers/stats_test.go`; each was run against the
pre-slice handlers and **confirmed to fail** with the expected message rather than merely passing after the change. 210 Vitest tests,
including a new `mock-api/series-range.test.mjs` that pins the fixture to the same contract (it caught a
real divergence: the fixture capped `days` where Go falls back to the default). And a real server driven
over HTTP, where a day of 500 kcal food beside a 150 kcal drink reports **650** from
`GET /api/stats/calories`, every weight/measurement/steps date is plain `YYYY-MM-DD`, a `from`/`to`
window returns exactly the days asked for, a future `to` is clamped to today, and all six malformed
ranges answer `400`.

**No API field removed, no schema change, no migration, no image, no appdata operation.**

## 2026-10-05 — rc26 signed off; Phase 14 scoped into six slices (decisions 91–95)

Two things, and **no code changed**.

**rc26 is accepted.** The owner tested `v2.0.0-dev-rc26` on Unraid and signed it off as working, which closes
the production role and Swap-user acceptance gate that PR #59 left open and makes rc26 the last reported
installation. Decision 88's reprioritization is therefore finished: the Admin/Standard roles and the in-app
acting-user switch are in production use.

**Phase 14 was scoped rather than started.** Metrics + Nutrition as written in the plan was far too large for
one pull request — crown-jewel bank maths, three handlers, an additive migration, an open charting choice and
two screens of new UI — so it is now **six individually shippable slices**, each with its own PR, its own `rc`
checkpoint and its own owner preview, in
[`../architecture/phase-14-plan.md`](../architecture/phase-14-plan.md): backend foundations, the windowed
bank, the charts, the body map, the Nutrition screen and the weekly report.

The plan was written against the code rather than a handoff, and that surfaced four things nobody had
recorded:

- **The deferred RFC3339 date issue is already a live defect, not a theoretical one.** V1's weight box compares
  an RFC3339 date against a plain one (`web/static/js/components/metrics.js:74`), so it **never pre-fills
  today's weigh-in** and silently falls back to the last known value. Fixing the wire format repairs it.
- **Target weight can be neither read nor written.** `target_weight_kg` appears in Go only in the migration and
  the struct field: no query selects it and no handler writes it, so `GET /api/users/me` always omits it and
  Metrics' Target line is permanently "Not set" — while V1 draws a target line from a value that never
  arrives. The `weight_goals` table is referenced by no Go code at all.
- **Decisions 66 and 42 contradicted each other.** Decision 66 said "All time" reproduces today's cumulative
  behaviour "so nothing is lost"; decision 42 says excluding unlogged days is a change from today's behaviour.
  For anyone who skips days both cannot hold. Decision 91 resolves it in favour of one rule, and decision 66's
  line is corrected.
- **The production bundle is 508 kB JS / 147 kB gzipped as a single chunk**, which Vite itself flags — the
  number behind decision 94's refusal to add a chart library.

One open item closed by inspection: the "audit the legacy `getUsers()` caller" note referred to a method that
does not exist under that name. It is `API.listUsers()` at `web/static/js/api.js:60`, and `grep -rn "listUsers"
web/` finds **no callers** anywhere in the legacy UI — making `GET /api/users` Admin-only broke nothing.

The owner settled the five questions gating slices 14.1–14.3 the same day, recorded as
[decisions 91–95](../product/vision-and-open-questions.md#phase-14-planning-pass--decisions-9195-2026-10-05):
"All time" excludes unlogged days too (91); the window counts calendar days (92); the window is stored per
user now with no control until Phase 15 (93); Metrics charts keep the hand-written SVG components plus a
panning hook rather than adopting Chart.js or Recharts (94, which also closes the question recorded as open in
`frontend-strategy.md` §11); and the weigh-in trend is a 7-day moving average **over weigh-ins rather than
calendar days**, with the owner recording now that 7 may prove wrong and **10 or 14 are the likely
alternatives**, so it becomes a per-user setting in Phase 15 (95). Q6–Q11 — the body map's write target, the
outline preference, the bust/chest split, the stepper increment, whether decision 47 moves to Phase 15, and
the weekly report's shape — remain open and gate slices 14.4–14.6.

Verified with `npm test` (25 files, **198 tests, all passing**), `npm run build:go` (typecheck clean) and
`node scripts/check-doc-links.mjs`. **No API, schema, migration, image or appdata change** — documentation
only, following the rc13 and rc20 precedent.

## 2026-10-04 — Admin/Standard roles and the acting-user switch built (decisions 89 and 90)

The role work decision 88 pulled ahead of Phase 14 Metrics is implemented. Roles are **declared** in
the appdata `.env` as `ADMIN_EMAILS` / `STANDARD_EMAILS` and **reconciled** into the additive
`users.is_admin` column at every start-up (decision 89): a declared Admin is granted on boot and on
first sign-in, everyone else is set to Standard, and removing an address from `ADMIN_EMAILS` revokes
the role on the next restart. A malformed address — or one declared as both roles — refuses to start
the container rather than silently granting nothing; an unset `ADMIN_EMAILS` leaves the database
untouched, so the capability is opted into. `GET /api/users` became Admin-only: it had been answering
any authenticated request, which exposed both household email addresses for no product reason.

The switch itself (decision 90) separates two identities in the request context: the **authenticated**
identity (who Cloudflare vouched for, used for authorization) and the **acting** user (whose data the
request touches). `ActingUserMiddleware` rewrites only the second, so every handler, the bank maths
and every diary row keep working unchanged, while role checks reading the first let an Admin who is
viewing another account still list accounts and swap back. The `cals_acting_user` cookie is
deliberately not signed: it is honoured only when the JWT-verified identity holds the Admin role, so
a cookie forged by a Standard user is ignored and cleared. The UI adds a **Swap user** sheet for
Admins and a persistent amber **Viewing as …** banner with **Return to my account**, and clears the
whole query cache on a switch because every cached query is account-scoped.

`USER` was rejected as a `.env` key because the shell already exports it and real environment
variables win over `.env` values, so such a line would be read back as `root` and silently ignored.

Also in this session: the fixture API's placeholder email was replaced with `owner@example.com`, and
the owner used the existing `bank_start_date` control (`PUT /api/users/me`) rather than deleting
historic meals to correct a calorie deficit that appeared when drink calories began counting towards
the bank. That deficit is bounded properly by the 14-day windowed bank (decision 66, Phase 14), which
is why no checkpoint UI was added here. One additive migration; no data copy and no appdata
operation.

## 2026-10-04 — Production Admin roles and Swap user prioritized before Metrics (decision 88)

The owner clarified the next-session priority after noting that a Cloudflare login as himself maps to his own sparse cals account; it does not expose his wife's history. The owner is Admin and his wife is Standard. The next session should focus on the secure production role, acting-user switch, and the UI needed to switch back, ahead of Phase 14 Metrics. Cloudflare Access remains the authentication provider, and both identities must stay permitted by the Access policy. Direct LAN access to the production origin does not carry the Cloudflare JWT; use the Cloudflare hostname, including while on the LAN. `DEV_MODE` and the dev identity picker remain confined to the separate development copy.

Decision 45 already specifies full read/write while an Admin is switched into another existing user, a clear “viewing as” indicator, and an Admin-only `GET /api/users`; decision 88 confirms the role assignment and pulls the work forward. The current code has no production role or switch feature, and the existing dev picker is not a substitute. The secure Admin bootstrap and server-side switching/session details remain for the implementation session. The previously requested server-local backup/restore of the database and all recipe images remains outstanding; this documentation update does not implement either feature.

## 2026-10-04 — Phase 13 signed off; Metrics evidence research opened

The owner signed off all published release candidates through `v2.0.0-dev-rc25`; Phase 13 is now accepted. The latest published image is rc25, while the last reported household installation remains rc24 and a Force Update to rc25 is not confirmed. This closes the acceptance gate without claiming an unreported deployment or item-by-item phone-test result. No application code, schema, or appdata changed in this documentation pass.

The owner's Archive-button observation is recorded as decision 86: reuse the light, inline two-step confirmation for destructive Delete/Remove actions where the UI has room, including as a candidate for recipe ingredient removal. Decision 87 records the preferred 3–4 week measurement cadence and a future reminder after more than four weeks, as a narrow exception to the prior no-general-reminders decision.

Created [`product/metrics-evidence.md`](../product/metrics-evidence.md) as a continuing research brief. It captures the proposed raw-cm / indexed-percent body-measurement view, a possible matching weigh-in view, the target-weight ETA question, an evidence-based critique of unverified model claims, measurement protocol sources, reminder questions, and current API/data constraints. These chart designs and prediction methods remain proposals, not a finalized build specification.

## 2026-10-04 — Phase 13 photo upload and UI follow-ups published as rc25 (PR #56)

The recipe-photo upload/replacement and decisions 83–85 completed the Phase 13 follow-up. PR #56
merged to `cals-dev` at `1e38a777c1c234cccc1a711fdde5abbd8a9e36e5`; the annotated tag
`v2.0.0-dev-rc25` points to that merge commit. [Docker/runtime](https://github.com/dougalbob/cals/actions/runs/37212805944),
[Go](https://github.com/dougalbob/cals/actions/runs/37212805943) and [PR browser](https://github.com/dougalbob/cals/actions/runs/37212836489)
checks passed. [Publish run 37212991108](https://github.com/dougalbob/cals/actions/runs/37212991108) built and pushed the exact tag and `dev-latest`, recorded digest
`sha256:814484b008cb5c915e15687208e0c1ab712f60c2c58bf35e32c855b8b6a2fc0d`, created the
[GitHub prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc25), and passed the
anonymous-pull gate. The tagged [Playwright suite](https://github.com/dougalbob/cals/actions/runs/37212991110)
passed all 60 tests. No schema migration, data copy, appdata operation or template change. The owner
last reported rc24 installed; Force Update/review of rc25 on Unraid remains pending. Cropping remains
deferred. See the [release log](../architecture/unraid-image-release.md#release-log) and
[current status](../CURRENT_STATE.md).

## 2026-10-04 — Today, Recipes and Diary follow-ups (decisions 83–85)

The owner folded three UI refinements into the same branch as recipe-photo upload. Today meal-card fills
now use 25% color alpha while Diary meal-slot fills remain at 5% (decision 83). The recipe-details
filter adds an Own creation checkbox beside Dish type, reduces the selector width, and keeps the
existing `origin:own` URL/tag semantics (decision 84). Deleting a food or recipe from a populated Diary
meal slot now requires explicit confirmation; Cancel leaves the entry untouched (decision 85).

Regression coverage checks the two independent fill classes, URL-backed filter composition and
360 × 640 layout/touch behaviour, plus Diary delete/cancel flows in unit and browser tests. The combined
branch passed 195 frontend tests across 25 files, typecheck, lint, `build:go`, Go build/tests/vet and
all 60 Playwright tests (58 phone, 2 desktop). These changes remain unpublished; no schema migration
or live appdata operation was needed. See the [product decision log](../product/vision-and-open-questions.md) and [current status](../CURRENT_STATE.md).

## 2026-10-04 — Recipe-photo upload and replacement added to Phase 13 (decision 82)

The owner reports rc24 is installed on Unraid and recipe creation works well. Decision 82 adds optional,
uncropped photo selection and preview during recipe creation, upload after the recipe is saved, and
image replacement on existing recipe detail. Upload failure keeps the recipe and directs the user to
retry from detail instead of resubmitting and creating a duplicate. Cropping is explicitly deferred;
Unraid road testing has not shown an urgent need. No schema migration or live-appdata access.

The current branch implements the shared React picker, image validation, Go upload handling, and
fixture routes/tests. Go tests and vet, all 192 frontend tests, lint, typecheck and production build
passed. The full Playwright suite passed all 56 phone and desktop tests, including creation/upload,
failed-upload recovery and image replacement. This change is not yet published; the owner should
review it on a phone after a future checkpoint is built. See [decision 82](../product/vision-and-open-questions.md#recipe-photo-upload-and-crop-deferral--decision-82-2026-10-04)
and [current status](../CURRENT_STATE.md).

## 2026-10-04 — No-photo recipe authoring published in rc24 (PR #54)

The queued Phase 13 slice added `/recipes/new` and a catalogue action. The full-page form creates a
shared recipe with a fixed-at-creation name, description, matched cals Food ingredients and grams,
optional text ingredients, serves, manual or calculated cooked yield, instructions, a live nutrition
estimate, and the existing shared classification (meal occasions, dish type, up to two key foods,
Own creation and total prep-to-plate minutes). The catalogue/Diary query context survives entering,
cancelling and completing creation; success opens the new detail page. At rc24 publication, photo
upload/crop was a separate feature; decision 82 later extends Phase 13 to add upload while deferring crop.

`POST /api/recipes` now validates the recipe and classification, calculates nutrition from persisted
Foods, requires key foods to be among the recipe's Food ingredients, and commits recipe content,
ingredients and shared classification in one transaction. The fixture API mirrors creation and reset
removes created fixtures. No schema migration or live appdata operation was needed.

The 360 × 640 px phone review caught a real overlap: the sticky create-actions row covered the
Description field near the top of the long form. The creation actions now stay in normal form flow;
the browser test verifies fields are unobstructed initially and Cancel/Create remain visible above the
fixed navigation at the end of the form. The preview has no horizontal overflow at 360 px.

Validation on the Arena branch: `npm run lint`, `npm run typecheck`, `npm test` (180 tests / 22 files),
`npm run build`, `npm run build:go`; Go formatting, `go build ./...`, `go vet ./...`, `go test ./...`;
and 53 Playwright tests passed across phone and desktop. The owner approved the 360 × 640 px Arena
preview and authorized publication. PR #54 passed [Docker/runtime validation](https://github.com/dougalbob/cals/actions/runs/37206287261), [Go validation](https://github.com/dougalbob/cals/actions/runs/37206287234) and the [PR browser suite](https://github.com/dougalbob/cals/actions/runs/37206287397), then merged to `cals-dev` as `c5828b6f56edb60124cf982396945ebf7da5b663`; the post-merge Go run [37206413850](https://github.com/dougalbob/cals/actions/runs/37206413850) also passed. [Publish run 37206446238](https://github.com/dougalbob/cals/actions/runs/37206446238) published `v2.0.0-dev-rc24`, digest `sha256:1d1f9c4047ea39624f60b460759f994ee39c3faac87c270bb42ca847fedd9e4`, created the [GitHub prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc24), and passed the anonymous-pull check. The tag-triggered [milestone browser suite](https://github.com/dougalbob/cals/actions/runs/37206446239) passed 53 tests. No schema migration, data copy, appdata operation or template change in rc24; photo upload/crop was separate at publication time. The owner later reported rc24 installed and new recipe creation working well; no live appdata was accessed.

## 2026-10-04 — Published `v2.0.0-dev-rc23` (PR #52, stabilisation checkpoint)

The owner directed a test-and-housekeeping pass before Phase 14 — test the app as it stands, fix only
confirmed problems, leave a record — and then said “Lets publish”. PR #52 merged to `cals-dev` as
`54eae29342b03f7f6a78adce26d943cface915e4`. On the PR: [Docker validation](https://github.com/dougalbob/cals/actions/runs/37202741637)
(including the new disposable-database runtime smoke), [Go vet/tests](https://github.com/dougalbob/cals/actions/runs/37202741627)
and the [milestone browser suite](https://github.com/dougalbob/cals/actions/runs/37202741609); the
post-merge Go run [37202830447](https://github.com/dougalbob/cals/actions/runs/37202830447) passed.

[Publish run 37202837131](https://github.com/dougalbob/cals/actions/runs/37202837131) passed the
`cals-dev` ancestry guard, Docker build, exact-tag and `dev-latest` pushes, prerelease creation and the
anonymous-pull check. Digest: `sha256:7dcc259c9c8e6d85c6be193d5446c10bcd1fb3cf7a168e92e0867b58c9d02444`;
[prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc23). **The tag also triggered
the milestone browser run** ([37202837122](https://github.com/dougalbob/cals/actions/runs/37202837122),
51 passed) — the first time a checkpoint's own commit was browser-tested at deploy time.

The checkpoint contains: the Playwright browser suite (51 tests — Diary flows, the Today/Diary
hydration split with drink-calorie accounting, the origin marker and catalogue filters, and the recipe
area control by control including real touch taps); the container runtime smoke in CI; the recipe
portion sheet's Cancel / Add to diary moved into the modal footer; and the phone tick-box fix
(`touch-action: manipulation` plus non-selectable labels) for the reported Own creation / Meal occasion
taps. **No API, schema, migration, data copy, appdata operation or template change.** Force
The rc23 Force Update/review was superseded by rc24; the accumulated phone checks are now part of
the rc24 review in [`CURRENT_STATE.md`](../CURRENT_STATE.md) §3. The publication record itself landed
in the follow-up docs PR (#53), because a run's digest cannot be written before the run exists.

## 2026-10-04 — Phone tick-box taps: the recipe area gets a top-to-bottom browser pass

The owner reported that on the phone the **Own creation** tick-box sometimes ignored a tap, that the
**Meal occasion** boxes behaved oddly too, and that a tap sometimes started Android's copy-text helper
— and asked for a top-to-bottom test pass over the recipe pages and sheets to see what else fell out.
Still PR #52, unmerged and unpublished.

**The cause was browser interpretation of a slightly slow tap, not app logic.** Label rows carried
selectable text and no `touch-action`, so a long-ish press began a text selection — the release then
showed the copy/paste helper and never reached the control — and a tap shortly after another nearby
tap could be read as double-tap zoom and swallowed. A desktop mouse never triggers either, which is
exactly why the earlier checks passed. `src/styles.css` now sets `touch-action: manipulation` on
interactive controls and stops labels being selectable, while text fields stay selectable. The
bottom nav's touch swipe was the one thing this could plausibly break, so it is now pinned by its own
test.

**The recipe area is covered control by control** (`recipes-catalogue`, `recipes-detail`,
`recipes-portion-sheet`, `recipes-editor`, `recipes-diary-handoff`, `recipes-touch`, plus
`navigation.spec.ts`): search and the empty state, favourites, the archived view and restore; the
detail facts, ingredients, method and the Add tag form (meal occasions, the two-key-food limit,
Cancel, total time) and archive/restore; the portion sheet's remembered usual, fractions, direct
grams, the one-off versus make-this-my-usual split and meal choice; Edit recipe's fixed name,
measured-versus-calculated weight, validation, text ingredients and Cancel; the Diary meal picker's
carried meal and date; and real touch taps on every tick-box. Expected values are read from the API
rather than hard-coded, and everything a finger does is driven through `page.touchscreen`/CDP.

Two smaller findings were recorded rather than changed: the Serves field's `min="1"` means the
browser's own constraint message appears before the app's, leaving the app's wording unreachable (the
outcome is still correct — nothing saves), and the Archived view toggle stays pressed-but-disabled
once the last archived recipe is restored.

Evidence: 51/51 browser tests, 177 Vitest tests, lint and typecheck clean.

## 2026-10-04 — Stabilisation pass: a real-browser suite, a container runtime check, and the portion sheet's actions

The owner asked for the app to be tested as it stands before Phase 14 — fix what testing confirms,
record what remains, add no features. All of it lives on `arena/01a106a2-cals` as **PR #52, unmerged
and unpublished**; rc22 stays the latest checkpoint.

**A small Playwright suite** (`web/frontend/e2e/`, 17 tests) drives the built bundle in a real
Chromium at phone size: Diary logging with an API cross-check, rescaling one entry, Cancel writing
nothing, and the Edit quantity sheet's Cancel/Save pinned in view on a 412×560 screen with the page
behind it scroll-locked; Today carrying no water controls while drink calories still count; the Diary
glass, over-target copy, long-press delete, past-date logging and drink calories landing in tomorrow's
bank; the orange **Own creation** marker on exactly one card plus the tag/occasion filters; and the
portion sheet on a 360×640 phone. The suite serves the pre-built bundle with the fixture API in
process — no Go server, no database, never household data — resets fixtures before each spec, and pins
UTC in both the server and the browser. It runs at milestones (`v*-dev*` tags, or a PR
labelled `run-e2e`), never on ordinary PRs — the workflow also declares a manual dispatch, which
GitHub will not offer until the file is on the default branch (`main`, production and read-only: the
label or the tag is how a run is asked for, and nothing here puts files on `main`).

**The runtime gap closed as far as CI allows.** `docker-validate.yml` now starts the built image with a
disposable database (no volume mounts), waits for `/health`, exercises the real routes with
`scripts/smoke-app-routes.sh`, asserts the migrations created the expected tables, and checks a second
container without `DEV_MODE` still refuses the protected routes with `401`. Failures print a route
table and the containers' logs. Docker remains unavailable in the Arena sandbox, which is why this
lives in GitHub Actions; it is green on PR #52.

**One real bug found and fixed.** On a 360 px-wide phone the recipe portion sheet opened with **Cancel**
and **Add to diary** about 63 px below the fold (563 px sheet, 124 px of scroll overflow) — fine at
412×839, so the earlier phone work had missed it. `RecipePortionSheet` now hands the actions to
`Modal`'s fixed `footer`, outside the scrolling area; a Playwright test at 360×640 and a Vitest
structural assertion pin it. The fix is in no image yet. The diary Edit sheet's similar fix *is* in
rc22.

**Two follow-ups recorded rather than fixed.** The milestone workflow's artifact name used the PR ref
(`52/merge`), which Actions rejects because it contains a slash; the artifact is now named from the run
id, and a labelled PR re-runs the suite on later pushes. And raw Actions log downloads stay unreliable
from the Arena sandbox, so CI is built to be self-diagnosing instead: a short failure summary in the
run summary, and artifacts uploaded with `if: always()`.

Checks at the end of the pass: 17/17 Playwright in the sandbox (the same 17 pass in GitHub), 177 Vitest
tests, ESLint and `tsc` clean, `build:go`/`build:preview` clean, Go vet + tests green, and Docker
validation green in GitHub. How each layer works, and what is deliberately not covered, is written up
once in [`../architecture/testing.md`](../architecture/testing.md).

## 2026-10-04 — Published `v2.0.0-dev-rc22` (PR #50, decisions 79–81)

The owner approved the Arena preview before publication. PR #50 passed Docker and Go validation,
merged to `cals-dev` as `c022f059ec46b26be5b5672b7c1096bbff44cd67`, and passed post-merge Go tests.
[Publish run 37194090053](https://github.com/dougalbob/cals/actions/runs/37194090053) passed the
ancestry guard, image build/push, prerelease creation and anonymous-pull check. Digest:
`sha256:08a9f465e3d6c7b01d830bd95d68a2bbc629af26150e2ab16d1c79db71c09a12`;
[prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc22).

The checkpoint adds the shared orange **Own creation** marker (decision 79), fixes the mobile Diary
Edit sheet, removes hydration/Quick drinks controls from Today while keeping them on Diary (decision
80), and sets the proportional meal-fill color alpha to 5% on both pages (decision 81). Drink-entry
calories remain included in Today totals. The additive `recipes.is_own_creation INTEGER NOT NULL
DEFAULT 0` migration keeps existing recipes unmarked and applies at startup. Frontend lint, typecheck,
177 Vitest tests, `build:go`, `build:preview`, PR Docker validation, and PR/post-merge Go validation
passed. No data copy, appdata operation or Unraid template change. The owner signed off on the preview
and later reported rc24 installed with recipe creation working well. A complete phone re-test of rc22's
Diary Edit sheet is not separately reported; it remains on the accumulated review checklist in
[`CURRENT_STATE.md`](../CURRENT_STATE.md) §3.

## 2026-10-04 — Today hydration panel removed and meal fills set to 5% alpha

The Today page no longer renders the hydration/Quick drinks panel or carries its add/delete state,
mutations, water queries or confirmation modal; those controls remain on Diary. Today's drink-entry
query is intentionally retained for the Drinks tile and calorie-ring/bank totals. Both Today and Diary
meal fills now use Tailwind v4 slash-alpha background utilities at 5%. This is the correct way to fade
the fill without fading the card text: the generated CSS uses a 5% `color-mix(..., transparent)` color
(and a 5%-alpha fallback). Regression tests assert the panel is absent, drink calories still appear,
and both pages use `/5`. No API, schema or appdata change. Frontend lint, typecheck, all 177 tests,
`build:go` and `build:preview` pass; the latest preview bundle has been rebuilt. The branch remains
unmerged and unpublished.

## 2026-10-04 — Mobile Diary Edit quantity sheet fixed on the Arena session branch

The owner reported that, on mobile, the Diary's Edit food sheet could hide its **Cancel** and **Save**
actions until the page behind it was dragged. The shared modal now locks background-page scrolling,
keeps its title fixed, and gives its content an independent overscroll-contained scroll area. The Diary
Edit sheet's Cancel/Save actions live in a persistent, safe-area-aware footer, so they stay available
while its contents scroll. A regression test checks the action-footer/scroll-area separation and that
page scrolling is restored after closing. No nutrition or Diary-snapshot logic changed. Frontend lint,
typecheck, all 180 tests, `build:go` and `build:preview` pass. The owner still needs to re-test this on
a phone; the fix is unmerged and unpublished, and rc21 remains the latest release.

## 2026-10-04 — Shared recipe-origin marker added on the Arena session branch (decision 79)

The existing Edit recipe metadata form now has an orange **Own creation** checkbox above the key-food
choices, and the matching orange card tag filters the catalogue and persists in the tag URL. The
additive `is_own_creation` field defaults false; list/detail reads return it, the create API accepts
it, and metadata updates preserve it when omitted by older clients while allowing an explicit `false`
to clear it. This branch treats the origin marker as shared recipe metadata, following the existing
tag model. The field is ready for the future create-from-scratch UI to reuse; that UI and image
upload/crop remain separate work. Existing content-edit and Diary-snapshot safety paths were not
changed. No live appdata was accessed; the branch is not merged or released, so rc21 remains the
latest published checkpoint.

Go vet and the full Go test suite pass; frontend tests (180), lint, typecheck, `build:go` and
`build:preview` pass. See [decision 79](../product/vision-and-open-questions.md#recipe-origin-marker--decision-79-2026-10-04).

## 2026-10-04 — Published `v2.0.0-dev-rc21` (PR #48, decisions 68, 72–78)

PR #48 passed [Docker build validation](https://github.com/dougalbob/cals/actions/runs/37189445342)
and [Go vet/tests](https://github.com/dougalbob/cals/actions/runs/37189445347), then merged to
`cals-dev` as `7523f14c7c172bb9b01fb225202ef6a239401445`. The owner approved the Arena preview and
said “Let’s publish.” [Publish run 37189572062](https://github.com/dougalbob/cals/actions/runs/37189572062)
passed the ancestry guard, image build/push, prerelease creation and anonymous-pull check. Digest:
`sha256:a42aa40a3e4c06b82cdcaafc373583db60d1b9c1ca5ae6f4d4246fdc0a659ce8`;
[prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc21). The checkpoint contains
the layering fix, proportional 25%-opacity Diary fills, per-user recipe count, more tappable/compact
recipe badges and the five-slot bottom nav with the temporary Foods/Recipes arrow. **No schema
migration, data copy, appdata operation or template change.** The owner later reported rc24 installed; a complete Unraid phone review of the accumulated changes is not recorded (see [`CURRENT_STATE.md`](../CURRENT_STATE.md) §3).

## 2026-10-04 — Larger Favourite hit area and compact recipe-image badges (decision 78)

To make the Favourite easier to tap without hiding more of the photo, its visible circle shrinks from
44 px to 33 px and the heart from 24 px to 18 px, inside a transparent 66 × 66 px button hit area.
The per-user log-count badge shrinks from 48 px to 36 px, with numerals from 16 px to 12 px, retaining
room for three digits. Frontend lint, typecheck, all 178 Vitest tests, `build:go` and `build:preview`
pass. No data/schema change or release.

## 2026-10-04 — Arena-preview navigation arrow and softer Diary fills (decisions 76–77)

To work around the Arena preview not reliably forwarding horizontal swipes, the fifth bottom-nav slot
(now Foods) becomes a reversible arrow: it scrolls the menu to show both Foods and Recipes, with a back
arrow to return. Horizontal swipe and supported-device haptics remain available. The four Diary meal
fills were reduced from 50% to 25% opacity. Frontend lint, typecheck, all 178 Vitest tests,
`build:go` and `build:preview` pass. No release or data/schema change.

## 2026-10-04 — Phase 13 polish implemented on the Arena session branch (decisions 68, 72–75)

The session built all four items: fixed app-chrome layering; proportional, meal-accent Diary fills with
percentage labels; a signed-in-user recipe log-count badge; and a five-visible-item swipeable bottom
navigation with haptics where available. The badge uses one additive `times_logged` API field backed by
`COUNT(*)` on `diary_entries(recipe_id, user_id)` — no schema migration or data/appdata change. Frontend
lint, typecheck, 177 Vitest tests, `build:go` and `build:preview` passed; Go vet and the complete Go test
suite passed. The Arena preview is live for the owner's phone-size review; no release has been created.

## 2026-10-04 — Phase 13 polish queue extended (decisions 74–75, documentation only)

The owner specified the recipe log-count badge's blue primary fill, white digits, circular three-digit
size and preferred top-left position. Code inspection found that the top-left is clear on active
recipe cards but occupied by the *Archived* pill on archived cards; the queued treatment moves that
pill to the top-right, which has no heart in the archived state. The owner also requested a five-item
bottom navigation with horizontal swipe and haptic feedback to reveal overflow (currently Recipes),
ready for future Settings and Exercise destinations. **No app code was changed in this queue update.** See [decisions 74–75](../product/vision-and-open-questions.md).

## 2026-10-04 — Published `v2.0.0-dev-rc20` (PR #46, documentation only)

The owner said **"lets publish"**, so the delivery loop ran end to end. PR #46 passed both
validation workflows — [Go vet + tests](https://github.com/dougalbob/cals/actions/runs/37165813876)
(13 s) and [Docker build](https://github.com/dougalbob/cals/actions/runs/37165813898) (1 m 46 s) —
and merged to `cals-dev` as `4c96fa3`. That exact merge commit was tagged `v2.0.0-dev-rc20`;
[publish run 37165937734](https://github.com/dougalbob/cals/actions/runs/37165937734) passed the
ancestry guard, Docker build, exact-tag and `dev-latest` pushes, prerelease creation and the
anonymous-pull check. Digest
`sha256:67d79b90c27d4fbb446ca33e7abc3076dbf7cb0e4ab33d0cf56f04be4d01b202`;
[prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc20).

**The image is functionally identical to rc19** — this checkpoint carries documentation only, so
there is nothing new for the household to see and no Force Update is required on its own account.
The outstanding owner review is still rc19's. No schema migration, data copy, appdata operation or
template change.

## 2026-10-04 — The owner's seven-item road-test list recorded as decisions 66–73 (documentation only)

The owner sent a list of seven issues and ideas gathered while the Phase 13 slices were being built,
with the explicit instruction **not** to implement them in this session but to schedule them. Four
points were clarified with him before anything was written down, because they change the work rather
than describing it:

- the bank **window replaces the day-1 accumulation everywhere** — tile, `today_available` and ring —
  which revises decision 44's "window drives the ring only" (now **decision 66**);
- the window **defaults to 14 days**, with presets of 30 / 14 / 7 / All time plus a custom value;
- the body outline's shape comes from a **new per-user setting**, because `users` has no gender
  column today (**decision 67**);
- and which measurement row the body map writes to stays an **open design point** for the session
  that builds it, since `POST /api/measurements` deletes the whole row for a date and no update
  endpoint exists.

The remaining items: the Diary meal-card back fill with a percentage label (68), the rule that a
windowed chart must pan (69), the 30-day weigh-in chart with a trend line (70), the daily-goal-vs-
consumed chart with green/amber/red bands (71), the recipe log-count badge (72), and the Recipes
layering bug (73). Three of them fit no existing phase, so they are grouped as the **Phase 13 polish
slice**; the rest extend Phase 14 (Metrics) and Phase 15 (Settings). The layering bug's cause was
verified in the code first — the fixed bottom nav sets no `z-index` while the recipe-card tags are
`z-10`/`z-20`, so the tags paint over the menu.

**No code, schema, API, image or appdata change** — documentation only, following the rc13 precedent.

## 2026-10-04 — Published `v2.0.0-dev-rc19` (PR #44)

The owner exercised the two authorized Phase 13 safety slices in the Arena preview and signed off on
them before publication. PR #44's Docker and Go validation passed and merged to `cals-dev` as
`009a400028190c963fb917f3a1b2a162f5468e84`; the [post-merge Go run](https://github.com/dougalbob/cals/actions/runs/37164158570)
passed. The exact merge commit was tagged `v2.0.0-dev-rc19`; [publish run 37164183555](https://github.com/dougalbob/cals/actions/runs/37164183555)
passed the ancestry guard, build, image push, prerelease creation and anonymous-pull check. Digest:
`sha256:6c0084319576ee8b92272945fdc3a71e6874d6d14dff7d5897a8cd34f0a6f8a2`.

Recipe content can now be edited in place without rewriting saved Diary snapshots; food nutrition
corrections refresh every dependent recipe transactionally, including archived recipes, while
preserving manual cooked weights and leaving Diary totals untouched. Go, frontend, fixture and rollback
regressions passed; frontend typecheck, lint and production build passed. There is no schema migration,
appdata operation or live-Unraid change. At rc19 publication, creating recipes from scratch and
image upload/crop remained later work; no-photo authoring followed in rc24, and decision 82 later
added uncropped photo upload/replacement to Phase 13.

## 2026-10-03 — Published `v2.0.0-dev-rc18` (PR #42)

After reviewing the live Arena preview, the owner authorized the full **“Lets Publish”** loop. PR #42
passed both validation workflows — [Docker build](https://github.com/dougalbob/cals/actions/runs/37158443118)
and [Go vet/tests](https://github.com/dougalbob/cals/actions/runs/37158443251) — and merged to `cals-dev`
as `cd3c4d770fd6067d8a4118c966f5404aa956ee29`. The post-merge Go test run
[37158561468](https://github.com/dougalbob/cals/actions/runs/37158561468) passed before that exact merge
commit was tagged `v2.0.0-dev-rc18`. [Publish run 37158593411](https://github.com/dougalbob/cals/actions/runs/37158593411)
passed the ancestry guard, Docker build, exact-tag and `dev-latest` pushes, prerelease creation and
anonymous-pull check; digest `sha256:33b012aa2b80a0c71bd5c4acefa2874ba87d499cc5bec100b15e4b14170f036c`.
[Prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc18).

The frontend follow-up shows the configured daily hydration target and overage separately from the
Water drink's per-tap glass volume; the glass target is vertical at 90°. Today meal cards get
proportional calorie fills. Calendar in-month opacity now uses the selected month rather than the
first padded grid date; padded out-of-month cells stay muted, and future dates remain muted and
non-clickable. Regression coverage brings the frontend suite to 169/169. Lint, typecheck, `build:go`
and `build:preview` passed. **No API/schema change, migration, data copy or template change; the
hydration-target roadmap is unchanged.** The session did not touch Unraid or live appdata; Force Update
and the real-data smoke-test result remain the owner's actions.

## 2026-10-03 — Published `v2.0.0-dev-rc17` (PR #40)

The owner accepted the four items in-session and said **“Lets publish”** (decision 20), so the session
ran the whole loop: PR #40 checked green on *both* validation workflows — the build-only Docker check
and, for the first time, `Go tests (validation)` — merged to `cals-dev` as `5d05f27`, and that exact
commit was tagged `v2.0.0-dev-rc17`. The tag-triggered workflow
([run 37154091274](https://github.com/dougalbob/cals/actions/runs/37154091274)) passed the ancestry
guard, Docker build, exact-tag and `dev-latest` pushes, prerelease creation and the anonymous-pull
check; digest `sha256:429a63c2987d08571f31d0a8ad011b2545064c8bdc3018d28ecc7548bed70f74`.

**Frontend changes plus one new workflow file: no schema migration, no data copy, no template change**,
and no Unraid or live-appdata access by the session — the Force Update is the owner's step. The
release-record docs landed on `cals-dev` in the follow-up PR (#41), which is why the publish entry
predates it.

## 2026-10-03 — Calendar day bars, a calendar that stops at today, the recipe pick moves to the recipe box, and CI learns `go test`

The owner's next session of road-test notes, plus the loose end the previous session left behind.
Decisions **62–65**; all frontend and workflow files — no endpoint, schema or bank-maths change.

1. **Over-goal days split instead of shouting (decision 62).** The Calendar drew any day over goal as
   a full-width red bar, which hid how much had been eaten and made every overspent day look the
   same. `calorieBarSplit` (`src/lib/calendar.ts`) now breaks the bar where the goal was reached: the
   green part is what the budget covered, the red tail is the overspend — 1,200 against 1,000 is
   ≈83% / ≈17%. Under goal nothing changes. The owner's nine months of V1 data cap out at ~30% over
   goal, so the tail stays a tail.
2. **The Calendar cannot get to tomorrow (decision 63).** The › button disables on the month or week
   containing today, a hand-typed future anchor is clamped back to today's period, and days after
   today are rendered but are no longer links. Deliberately not changed: the Diary's own › and
   `POST /api/diary` still accept a future date, so pre-logging a planned meal still works — recorded
   as an open question rather than quietly clamped.
3. **`🍽 Add recipe` goes to the Recipes tab (decision 40 → 64).** The modal picker decision 40 shipped
   with duplicated a worse version of the recipe box. Tapping the meal-card button now opens
   `/recipes?add-to=<meal>&on=<date>`; the intent is URL state like everything else here, so it
   survives search, favourites, tag filters, a reload and a detour into the recipe's own page. In
   pick mode each card gains **🍽 Add to Breakfast**, the portion sheet opens with that meal and date
   already chosen, and *Done* lands on `/diary/:date#<meal>`. Archived recipes are still never offered
   (decision 59), and `parseRecipePick` ignores a malformed slot instead of guessing one.
4. **CI runs the Go tests (decision 65).** `.github/workflows/go-validate.yml`: `go vet ./...` and
   `go test ./...` with CGO on `go.mod`'s Go version, on every PR into `cals-dev`/`main` and on
   `cals-dev` itself. Nothing in CI had ever compiled a `_test.go` file — the Docker validation job
   only builds `./cmd/server`.
5. **The "no Go in the sandbox" claim was wrong.** The previous session's handoff said the Go tests
   could not be run here. `scripts/verify-go-in-sandbox.sh` installs a working toolchain from the
   PyPI `go-bin` wheel in about a minute; with it, `go build ./...`, `go vet ./...` and
   `go test ./...` all pass, including the three `rc16` calendar regression tests. The tests had not
   rotted — nothing had been checking them, which is what item 4 fixes. Frontend: **163** Vitest
   tests (up from 135: `calorieBarSplit`, the clamps, the inert future cells, the intent round trip,
   the pick-mode flows), lint and typecheck green.

## 2026-10-03 — Published `v2.0.0-dev-rc16` (PR #38)

The owner said **"Lets publish"** (decision 20) after reviewing the four road-test fixes in the Arena
preview, so PR #38 (checks green) was merged to `cals-dev` as `dd2cbef` and tagged `v2.0.0-dev-rc16`.
The tag-triggered workflow ([run 37147534800](https://github.com/dougalbob/cals/actions/runs/37147534800))
passed the ancestry guard, Docker build, exact-tag and `dev-latest` pushes, prerelease creation and the
anonymous-pull check; digest `sha256:69ed52c0b7f409e13f5cff78fbce4a0040fd5b52ea59e72f1ccb25cfba8a175a`.
This checkpoint carries the Calendar per-day calories fix (rc15 showed `0 / goal` on every day) and the
calorie-wheel, hydration-glass and Quick-drinks changes. **No schema migration, no data copy, no
template change**, and no Unraid or appdata access by the session. Details in the
[release log](../architecture/unraid-image-release.md#release-log).

## 2026-10-03 — Road-test fixes: calorie wheel labels, inner-ring sweep, glass target, Android dots

Four things the owner hit while road-testing, all frontend:

1. **The calorie wheel labels itself.** The two captions underneath
   (`Bank −394 kcal · 19.7% of ±2,000 kcal scale` and `177 kcal over today's allowance`) are gone.
   The hub now reads `bank ±N` (the bank balance **plus** what is left of today — the owner's
   definition of headroom in hand), the day's spend in large type, and `daily ±N` (today's own
   remainder). Both small lines are colour-coded green/red by sign and use a true minus sign. The
   `of 2,000 kcal` line was dropped at the owner's request: the goal is already in the tile beside
   the wheel. All of the removed wording survives in the SVG `aria-label`.
2. **The inner ring now follows the outer ring's convention.** Under the goal it still counts down
   clockwise in green; once the day is overspent it grows **anticlockwise in red** from 12 o'clock,
   scaled by how far the overspend has eaten into another whole day's goal and saturating at a full
   circle. `bankArcTransform` was generalised to `arcTransform` (the old name is kept as an alias).
3. **The hydration target is written across the glass** at 45°, drawn over the water with a white
   halo so it stays legible at any level, which let the redundant `2,000 / 2,000 ml` caption go. The
   glass is slightly larger (66×96) to carry the text.
4. **The milk/sugar button is visible on Android.** It was three `·` glyphs in light grey on a
   transparent background — crisp on a desktop monitor, near-invisible on a phone. It is now a
   bordered 32 px circular chip containing an SVG three-dot icon in full ink, and the drink name is
   padded clear of it.

Vitest 135/135, lint and typecheck green. The deferred RFC3339-date issue on the fitness, weight and
measurement endpoints was written up as a known issue for the metrics phase rather than fixed. Both
this and the calendar fix are queued for `v2.0.0-dev-rc16`.

## 2026-10-03 — Calendar read every day as 0 kcal: the SQLite `DATE` decltype trap

The owner tested the new calendar on the Unraid container and every day — past days included —
rendered `0 / 1,250 kcal` with `+133,184,631 kcal` in the bank line, while the same days were
correct on Home and in the Diary.

`mattn/go-sqlite3` inspects `sqlite3_column_decltype` and converts any column declared
`DATE`/`DATETIME`/`TIMESTAMP` into a `time.Time`; `database/sql` then formats that as RFC3339 when
the scan destination is a string. So `SELECT date FROM diary_entries` returns
`"2026-09-07T00:00:00Z"`, not `"2026-09-07"`. `internal/handlers/calendar.go` keyed its pre-filled
per-day map on the raw scanned value, so **no row ever matched a day** and every total stayed zero.
The same conversion applies to `users.bank_start_date` (the legacy UI already works around it with
`bank_start_date.split('T')[0]`), so `time.Parse("2006-01-02", …)` failed, left the zero
`time.Time`, and `bt.Sub(a)` saturated at the maximum `time.Duration` (~292 years) — 106,752 days ×
1,250 kcal − 255,369 kcal consumed is exactly the 133,184,631 the owner saw. `HandleGetBank` was
unaffected because it already wraps both sides in `date(...)`.

Fix: every calendar query now selects `date(date) AS day` (an expression has no declared type, so it
comes back as text) and compares `date(date) >= date(?)`; scanned values and the bank start date go
through a new `isoDate` helper; `daysBetweenInclusive` refuses a zero start instead of overflowing.
Three Go regression tests cover per-day totals, dates stored with a time component, and the
running-total seed. No schema change and no API-shape change. The defect **is** in the published
`rc15` image (it was found by road-testing that image), so the fix ships in `rc16`.

## 2026-10-03 — Published `v2.0.0-dev-rc14` (PR #34)

Owner said **"Lets publish"** (decision 20) after reviewing recipe archive/restore in the Arena
preview, so PR #34 (checks green) was merged to `cals-dev` as `29bd7bb` and tagged `v2.0.0-dev-rc14`.
The tag-triggered workflow ([run 37137097231](https://github.com/dougalbob/cals/actions/runs/37137097231))
passed the ancestry guard, Docker build, exact-tag and `dev-latest` pushes, prerelease creation and the
anonymous-pull check; digest `sha256:be601ee04bb8f57182a525931570cc7eba703cbafc3e4fd25bf2f193254233f5`.
Unlike rc12 and rc13 this checkpoint **changes the schema** (additive: `recipes.is_archived`,
`archived_at`), so the owner should confirm the backup before Force Updating. No appdata, template or
Unraid access by the session. Details in the
[release log](../architecture/unraid-image-release.md#release-log).

## 2026-10-03 — Phase 13 slice 4: recipes can be archived and restored (decision 59)

The owner left the choice of slice to the session. Archive/restore was picked because it closes the
one real rough edge found in the recipe path — deleting a logged recipe failed with an opaque
`500 FOREIGN KEY constraint failed` — it is small and self-contained, and it can be reviewed in the
preview. The food-correction recalculation (decision 60) was left as its own slice because it touches
recipe maths and has nothing to look at in a phone preview.

Built end to end: an additive migration (`recipes.is_archived`, `archived_at`),
`PUT /api/recipes/{id}/archive`, an opt-in `?include_archived=true` list (archived recipes are hidden
by default so the legacy UI and any picker are safe), a `409` when logging an archived recipe or
deleting a logged one, the React **Show archived** toggle, **Restore** on archived cards, an
inline-confirmed **Archive recipe** on the detail page, and the legacy UI's Delete button replaced by
Archive. Go and Vitest regression tests assert that diary rows, day totals, the bank and the recipe
label are identical across archive and restore. Verified in the sandbox against the real handlers and
a populated, re-migrated database. The owner reviewed it in the preview and asked for one change — the filter checkboxes became heart **Favourites** and archive-box **Archived** toggle buttons on one row — and it was then published as rc14 (see the entry above). Details and the two open choices are in the
[decision log](../product/vision-and-open-questions.md#retiring-recipes-and-correcting-foods--decisions-5961-2026-10-03).

## 2026-10-03 — Archive/restore and food corrections agreed (decisions 59–61)

The owner proposed retiring recipes by archiving rather than deleting them, with a **Show archived**
toggle and **Restore**, and accepted the recommendation that food nutrition corrections recalculate
related recipe definitions for future logging but never change saved Diary nutrition. He challenged
the food-name concern: **“Chickken” → “Chicken”** is a useful correction even on historic entries,
not a reason to freeze names. The theoretical hazard is repurposing a record as a different food;
that does not warrant restricting normal food-name corrections. The existing recipe-name decision
was not reopened.

Recorded as [decisions 59–61](../product/vision-and-open-questions.md#retiring-recipes-and-correcting-foods--decisions-5961-2026-10-03),
including API/legacy parity and regression requirements. The current code was inspected: food edits
leave saved recipe totals unchanged while recipe ingredient lines read current food calories, so the
catalogue can become inconsistent even though Diary nutrition stays safe. **Planning/documentation
only; no application code, migration, release or live appdata change.**

## 2026-10-03 — Published `v2.0.0-dev-rc13` (PR #32)

Owner said **"Lets publish"** (decision 20), so PR #32 — the recipe-adaptation requirement, decisions
55–58 — was merged to `cals-dev` as `9260e10` and the merge commit tagged `v2.0.0-dev-rc13`. The
tag-triggered workflow ([run 37132678548](https://github.com/dougalbob/cals/actions/runs/37132678548))
passed the `cals-dev` ancestry guard, Docker build, exact-tag and `dev-latest` pushes, prerelease
creation and the anonymous-pull check; digest
`sha256:d28a820975261cff158c6d7f89f652d4846cac7cc68bc707de3c13f1dbf48103`.

This is a **documentation-only** checkpoint — the runtime image copies only the Go binary and `web/`,
so rc13 is functionally identical to rc12. It exists so `dev-latest` and the release log track the
`cals-dev` state that now carries decisions 55–58. No API, schema, migration, template or appdata
change, and the session did not access Unraid or live appdata. The next Phase 13 work is the recipe
editor slice itself ([CURRENT_STATE.md](../CURRENT_STATE.md) §4), and the owner's outstanding
phone-size review of the rc12 tag filter is unchanged by this checkpoint.

## 2026-10-03 — Adapting a recipe must not rewrite history (decisions 55–58)

The owner raised the gap that Phase 13's React rebuild had not covered: **there is no way to adapt an
existing recipe**. The catalogue, filters, favourites, tags and recipe-to-Diary portion logging are
built, but the React app has no recipe editor at all, and the only editor in the repo is the legacy
vanilla-JS one that is not being ported. He attached a hard requirement to any fix: **once a recipe
can be edited, the change must not affect the calories recorded in historic diary data.**

**This session was planning only — no code changed.** The requirement was confirmed and recorded:

- **Decision 55** — editing a recipe applies to future logs only; a diary row keeps its own grams and
  nutrition snapshot and no handler may recompute or repair it from a definition.
- **Decision 56** — "adapt" means **editing the existing recipe in place**, not a private fork.
- **Decision 57** — any household user may edit any shared recipe.
- **Decision 58** — **names are fixed at creation** (the owner chose this over an additive migration
  to snapshot the name on diary rows), so a rename can never relabel historic entries.

The guarantee was then **verified against the real Go handlers** in a scratch sandbox database rather
than asserted: a recipe was created, a portion logged, the recipe edited and renamed, and a delete
attempted. The diary row and day totals were unchanged by the edit (150 kcal before and after, while
the recipe's own figures moved); the historic row's displayed name did follow the rename; and
`DELETE /api/recipes/{id}` failed with `FOREIGN KEY constraint failed` (500) because `diary_entries`
references the recipe — which the legacy UI currently surfaces verbatim as "Failed to delete: …".
Both edges are written into the plan, with the regression tests the implementation slice owes and two
open questions (rename before the first log; the delete policy) recorded in
[the decision log](../product/vision-and-open-questions.md#adapting-an-existing-recipe--decisions-5558-2026-10-03).
Status and ordering live in [`CURRENT_STATE.md`](../CURRENT_STATE.md) §4.

## 2026-10-03 — Published `v2.0.0-dev-rc12` (PR #30)

Owner said **"Lets publish"** (decision 20), so PR #30 was merged to `cals-dev` as `ead2bf9` and the
merge commit was tagged `v2.0.0-dev-rc12`. The tag-triggered workflow
([run 37130651708](https://github.com/dougalbob/cals/actions/runs/37130651708)) passed the `cals-dev`
ancestry guard, Docker build, exact-tag and `dev-latest` pushes, prerelease creation and the
anonymous-pull check; digest
`sha256:59631e659d11cfd32423fa87d50ba35b93a578fbc0847d6ac51550ac9e7da928`.

The checkpoint contains Phase 13 slice 3 (tap-to-filter recipe tags, decision 41), the documentation
restructure, and decisions 42–54 from the second and third discovery passes. **Frontend-only** — no
API, schema, migration, template or appdata change, so it can be Force Updated over any earlier
checkpoint with no data work. `dev-latest` moved to rc12; the owner's Force Update and phone-size
review are the remaining gates, and `rc11` (servings/portions) was never Force Updated either, so the
container may be on an older image than either checkpoint.

## 2026-10-03 — Second discovery pass completed (decisions 42–54)

The owner answered the remaining day-to-day questions, and the picture is now unusually clear:

- **Bank:** unlogged days are **excluded** (42), not counted as zero eaten; the bank stays **per
  person** (43); the ring's window becomes **user-definable** with "since day 1" as the default (44);
  and steps do **not** credit the bank for now (48). Because an excluded day is usually oversight, the
  owner wants a future **Issues bell** on Home (proposed feature, with its own design notes).
- **Household access:** cross-viewing is solved by an **admin role plus a Swap user control** with
  full read/write (45) — the owner needs it because his own profile has almost no data — which also
  makes `GET /api/users` admin-only instead of an exposed curiosity.
- **Nutrition:** **no notifications**, but a **weekly report** is wanted (46); tracked nutrients
  become **user-selectable checkboxes** with a **missing-data audit** ("these 23 foods have no
  saturated-fat values") over the foods actually logged (47).
- **Ergonomics:** the logging flows need nothing new except a **calendar** for reaching historic dates
  (49); **no shortcuts** are wanted (50); the **four meal slots stay** (51); **no barcode scanning**
  (52); **no offline capability** (53); and the household data **is backed up** (54).

Nothing here is scheduled work yet except where noted; each answer has a design section in
[`../product/vision-and-open-questions.md`](../product/vision-and-open-questions.md) recording the
recommended shape and the questions deliberately left open.

## 2026-10-03 — Phase 13 slice 3: recipe tags filter the catalogue (decision 41)

Owner request: tapping a recipe's tag should filter the list in place, and a second tag should narrow
it again ("Chicken… then Mushroom"). Implemented on session branch `arena/01a101f3-cals` (**PR #30**),
awaiting the owner's preview review. Frontend-only — no API, schema or appdata change. New
`src/lib/recipeTags.ts` (tag keys, AND matching, `?tags=` URL round-trip), tappable `RecipeTags`,
"Filtering by" row with per-tag removal, results line, escapable empty state, and the three facet
dropdowns kept in step with the tapped tags. The fixture gained **Chicken & Mushroom Pie** and a
Mushrooms food so the owner's exact example is reproducible in the preview. 107 tests passing.
Open question recorded with it: whether two taps *within* one facet should widen (Lunch **or** Dinner)
instead of continuing to AND.

## 2026-10-03 — Documentation restructure and a second round of discovery

The owner asked for the documentation to be restructured for new agent sessions, and took a second
pass at the open questions. Answers became decisions **42–47** (unlogged days excluded from the bank
plus a future "Issues" bell; bank stays per person; user-definable ring window with a since-day-1
option; an admin role with a swap-user control instead of a household view; no notifications but a
weekly report; user-selectable tracked nutrients with a missing-data audit). This restructure is its
result: status moved to [`CURRENT_STATE.md`](../CURRENT_STATE.md), `rebuild-kickoff.md` slimmed to
commands and guardrails, dated narrative moved here. The same session fixed three documentation-vs-code
drifts ("17 tables" → **20**, the kickoff's stale "five documents" check, and a vision note claiming
`GET /api/diary` has no serving metadata).

## 2026-10-03 — Phase 13 slice 2: food servings and recipe-to-Diary portions (decisions 29–32)

Owner-reviewed in the Arena preview, merged as **PR #28**, published as **`v2.0.0-dev-rc11`**.
Foods gained several named gram-backed measures beside FatSecret's own (`food_servings` rows with
`fatsecret_serving_id IS NULL`); Add/Edit gained an explicit **serving / grams** mode; recipe detail
gained a portion sheet with whole-recipe fractions, direct grams, a live gram + kcal readout and the
date/meal; a new `recipe_user_portions` table backs a nullable `usual_grams` on recipe responses and
`POST /api/diary` accepts `make_usual`. First successful log becomes the usual; later changes are
one-off unless explicitly made usual. Diary storage unchanged (grams + nutrition snapshot). Details:
[`../architecture/frontend-strategy.md`](../architecture/frontend-strategy.md) Phase 13.

## 2026-10-03 — Phase 12 close-out (PR #22, `v2.0.0-dev-rc8`)

Two follow-ups landed together. The Diary's logged-quantity **Edit** action was implemented (weight
input, live calorie preview, rescales the entry's own saved nutrition, refuses zero/negative) using
the existing `PUT /api/diary/{id}` — no schema change. And the owner's ring decision (28) was
implemented: a bank **surplus sweeps clockwise in green, a deficit anticlockwise in red**, both from
12 o'clock, via a reflected SVG transform rather than a negative dash offset (which cannot render a
full circle at the ±2,000 kcal limits). Component tests pin both directions.

## 2026-10-03 — Dashboard and publication loop (decisions 18–26)

Owner reviewed the Today dashboard in Arena and authorised the end-to-end GitHub delivery loop
("Lets publish", decision 20): PR → checks → merge to `cals-dev` → tag → image publication →
Unraid Force Update, without asking again at each step. The dashboard checkpoint added the Today
landing screen (dual ring, four meal tiles), merged the water and quick-drink cards, the 2×2 quick
drinks with counters and confirmed long-press delete, and the My drinks page with its catalog picker
([`../architecture/drinks-builder.md`](../architecture/drinks-builder.md)). Legacy root stayed the
default; `/next/` showed the work.

## 2026-10-02 (later) — V2 live, and the DEV identity switch (decisions 12–14)

V2 (`cals-dev-v2`) was installed and Cloudflare-routed on **8151** from a database copy taken that
morning — which makes that appdata **live household data**, not a disposable copy; the warning
document was written the same day. `DEV_IDENTITY_SWITCH` was implemented so either existing user can
be selected at `/dev/identity` (or `?as=<email>`) on the LAN-only dev container. Navigation detail
recorded at the time: the bare LAN URL opens the normal app, not the picker.

## 2026-10-02 — Phase 12 Diary implemented and merged (rc1–rc8)

Water and drinks became one ledger: `drinks.counts_toward_water`, a target derived from those drink
entries, the dead `water_entries` table dropped only when empty, and drink calories included in the
bank with a regression test that would have failed before. The Diary gained the quick Tea/Coffee/Water
selector backed by the user's own drinks (**no starter drinks are provisioned** — decision 16), and
the water card with a one-tap glass and "other amount". Design and API:
[`../architecture/water-and-drinks.md`](../architecture/water-and-drinks.md).

## 2026-10-02 — Foundation, delivery pipeline and discovery

- **Phase 11 foundation** merged (PR #5) after the owner authorised it (decisions 10–11): React 19 +
  TypeScript + Vite + Tailwind shell served under `/next/`, fixture API, Go serving `web/dist`,
  multi-stage Docker build.
- **Compose retired as an install path** (PR #6) in favour of the `cals-dev-v2.xml` Unraid template
  plus prebuilt GHCR images (PR #7); `v2.0.0-dev-rc1`–`rc4` published with the publish workflow
  verifying anonymous pulls.
- **The "grill me" discovery answers** (decisions 1–8): two users identified by Cloudflare Access
  email with **no in-app login**; water as both a drink and a dedicated target with **one source of
  truth**; drinks user-defined with their own calories (no ABV maths, no seeded presets); drink
  calories **count** towards the bank; and **UI/UX improvement as the headline requirement** of the
  rebuild, not a side effect of changing frameworks.
