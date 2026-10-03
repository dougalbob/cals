# Current state — where the cals project is right now

| Field | Value |
|---|---|
| **Status** | 🟢 **ADOPTED — living document. This is the single source of truth for "where are we now".** |
| **Last reviewed** | 2026-10-03 (evening session) |
| **Owner** | @dougalbob |
| **Purpose** | Stop status drifting across four documents. Anything dated or narrative belongs in [`history/rebuild-log.md`](history/rebuild-log.md); this page describes **today only** and is updated whenever the state changes |
| **Related** | [`architecture/rebuild-kickoff.md`](architecture/rebuild-kickoff.md) (first commands), [`architecture/frontend-strategy.md`](architecture/frontend-strategy.md) (the plan), [`product/vision-and-open-questions.md`](product/vision-and-open-questions.md) (decisions and open questions), [`architecture/data-copy-warning.md`](architecture/data-copy-warning.md) (read before touching appdata) |

> **Starting a session?** Read this page, then [`architecture/rebuild-kickoff.md`](architecture/rebuild-kickoff.md)
> for the first commands and the guardrails. Do not rely on a dated handoff paragraph elsewhere —
> if this page and another document disagree, **this page wins** and the other document is the bug.

---

## 1. What is running, and where

| Thing | Port | State |
|---|---|---|
| **V2 `cals-dev-v2`** — the React rebuild's container | 8151 | **Live and Cloudflare-routed: this is the app the household sees.** Installed from the `cals-dev-v2.xml` Unraid template; appdata `/mnt/user/appdata/cals-dev-v2` holds **live household data**. The newest published checkpoint is **`v2.0.0-dev-rc17`** (2026-10-03: the owner's second round of road-test follow-ups — proportional over-goal day bars in the Calendar, a Calendar that cannot be paged past Today, and `🍽 Add recipe` handing over to the Recipes tab with the meal/date carried in; rc16 fixed the Calendar per-day calories and carried the calorie-wheel, hydration-glass and Quick-drinks changes; rc15 added decision 40 and the month/week Calendar; rc14 carried the last **additive schema migration**), but the container only changes when the owner **Force Update**s in Unraid. **Phase 12 owner acceptance is signed off** (2026-10-03). rc15's Calendar read 0 kcal on every day on a real database; fixed in rc16 (see §6). rc17 is **frontend only — no migration, no data copy, no template change**, so Force Update is safe once the backup is confirmed. Nothing past rc4 has been Force Updated, so the running image may be older than the newest checkpoint — check the in-app footer or `GET /api/version` rather than assuming |
| **V1 `cals-counter`** | 8150 | Legacy vanilla-JS app, still running but **stale**: it stopped receiving household entries when the Cloudflare route moved to 8151 |
| **`cals-dev-identity`** (dev only) | 8152, LAN only | Disposable copy used for the `DEV_IDENTITY_SWITCH` (`/dev/identity`, or the template's WebUI shortcut — the bare LAN URL opens the normal app). **The only container allowed to lose data** |

**The React UI is still only reachable under `/next/`** (`http://<unraid-lan-ip>:8152/next/` on the
LAN-only dev container). The legacy vanilla UI remains the default everywhere; nothing has been cut
over, and Phase 16 owns that.

Everything in this table is explained in [`unraid-image-release.md`](architecture/unraid-image-release.md)
and [`data-copy-warning.md`](architecture/data-copy-warning.md). **Rule of thumb: never delete, reset
or copy over an appdata directory without reading the warning document first.**

### How to tell which build you are looking at

- `GET /api/version` (and the in-app footer) reports the application version — **`2.0.0`** on the V2 line since decision 12; `main` stays on `1.7.0` until promotion.
- Docker image tags identify the checkpoint: `v2.0.0-dev-rcN` (newest: **rc17**, published 2026-10-03 — the calendar day bars, the calendar stopping at Today and the recipe-pick hand-off; rc16 carried the calendar 0 kcal fix and the calorie-wheel, hydration-glass and Quick-drinks changes). `dev-latest` follows the newest development tag; **`latest` is reserved for a future stable release and has never been published**.

---

## 2. Phase status

Phases 11–16 are defined in [`frontend-strategy.md`](architecture/frontend-strategy.md) §7.

| Phase | State | Notes |
|---|---|---|
| **11 — Foundation** | ✅ Merged (PR #5) | React 19 + TS + Vite + Tailwind shell at `/next/`, typed API client, fixture API, lint/typecheck/tests |
| **12 — Diary** | ✅ Owner-approved 2026-10-03 (PR #22, `v2.0.0-dev-rc8`) | Water/quick drinks, one ledger for fluids, drink calories in the bank, quantity Edit, dual ring, Hydration relabel (evening rc15 session). Phone-size acceptance signed off by the owner |
| **13 — Foods + Recipes** | 🟡 In progress — six slices built; all merged, published through `v2.0.0-dev-rc17` | **Slice 1** (catalogue, per-user favourites, detail, structured tags, facet filters) owner-reviewed. **Slice 2** (named gram-backed food measures; recipe-to-Diary portions with the remembered usual; decisions 29–32) owner-reviewed, merged (PR #28). **Slice 3** (tap-to-filter recipe tags, decision 41 — plus the docs restructure and decisions 42–54) owner-reviewed in Arena, **merged as PR #30** and published as **rc12**; the phone-size review of it on Unraid is still outstanding. **Slice 4** (recipe archive/restore, decision 59) merged as PR #34 and published as **rc14**; additive migration (`recipes.is_archived`, `archived_at`); phone review outstanding. **Slice 5** (decision 40, `+ Add recipe` on each Diary meal card) owner-approved in the Arena preview 2026-10-03, merged as PR #36 and published as **rc15**; phone review outstanding. **Slice 6** (decisions 62–64: proportional over-goal day bars, a Calendar that stops at Today, and `🍽 Add recipe` handing over to the Recipes tab with the meal/date carried as URL state) owner-accepted 2026-10-03, merged as PR #40 and published as **rc17**; phone review outstanding. The recipe-adaptation editor (decisions 55–58) and food-correction recalculation (decisions 60–61) remain — see §4 |
| **14 — Metrics + Nutrition** | ⬜ Not started | Owns the rolling-window bank metric for the ring (food + drink), the tracked-nutrients settings work (decision 47) and the weekly report |
| **15 — Settings + PWA** | ⬜ Not started | Per-user ring limits and lookback window, the admin "swap user" capability (decision 45), themes, PWA/offline behaviour |
| **16 — Cutover** | ⬜ Not started | Delete the legacy UI, make React the single SPA. Owner-approved UI improvement is the gate |

What exists in the React app today, screen by screen, is listed in
[`web/frontend/README.md`](../web/frontend/README.md) — that file is the detail; this table is the
summary.

---

## 3. Waiting on the owner

| # | What | Where |
|---|---|---|
| 1 | **Confirm the backup, then Force Update `cals-dev-v2` to `rc17`** (published 2026-10-03, digest `sha256:429a63c2…`) and review at phone size: an over-goal day in the **Calendar** draws a green bar with a proportional red tail instead of a full-width red line; the **Calendar stops at Today** (forward arrow disabled on the current month/week, future URLs clamped, days that have not happened are not links); **🍽 Add recipe** on a Diary meal card opens the **Recipes tab** and returns to `/diary/:date#<meal>` after logging. Still outstanding from rc12/rc14/rc15/rc16: tag filtering, recipe Archive/Restore, `+ Add recipe`, the fixed Calendar day figures, the calorie wheel, the hydration glass and the Quick-drinks dots. rc17 is **frontend only**: no schema migration, no data copy, no template change (rc14's additive migration still runs on the first rc14+ start — confirm the backup first, decision 54). | Unraid → `cals-dev-v2` → Force Update |
| 2 | ~~**Phase 12 acceptance review** — Home and Diary, both identities, phone size~~ **✅ Signed off 2026-10-03.** | (closed) |
| 3 | **Record the release-log smoke-test result** after the Force Update, so the log's last column is no longer ⬜ | `unraid-image-release.md` release log |
| 4 | **Answer the question decision 63 raised:** should Today be the last loggable day *everywhere*? The Calendar now clamps at Today, but the Diary's › arrow and `POST /api/diary` still accept tomorrow so a planned meal can be logged ahead of time. If the answer is “clamp it everywhere”, that is a small PR plus a `400` on future dates and a regression test | `docs/product/vision-and-open-questions.md` §I |

---

## 4. Next work, in order

1. ~~**Decision 40 — `+ Add recipe` on each Diary meal card**, opening the portion sheet with that meal preselected.~~ **Built 2026-10-03 (rc15); owner-approved in the Arena preview.** Each meal card now has `+ Add food` and `🍽 Add recipe` side by side; recipe logging keeps decisions 29–32 behaviour unchanged. **Follow-up built, owner-accepted and published 2026-10-03 as rc17 (decision 64):** the meal card now hands over to the Recipes tab instead of opening a modal picker, carrying the meal and date into the portion sheet.
2. ~~**The calendar for historic dates** (decision 49's follow-up) — a month view opened from the Diary's date header, tap a day and land on `/diary/:date`, with markers on days that have data.~~ **Built 2026-10-03 (rc15):** `/calendar` route with Month (compact 6×7 grid: calorie bar, hydration pip, signed bank figure, today ringed) and Week (larger phone-friendly cards with per-meal kcal, 💧 Hydration `x / y ml` and the bank), toggled by a Month/Week segmented control; URL-is-state for reload/deep-link; tapping any day hard-links to `/diary/:date`; a 📅 button in the Diary header opens it (Calendar joins the bottom nav). The new additive read-only endpoint `GET /api/calendar?from=&to=` returns per-day meal totals, hydration ml and the end-of-day bank balance; no schema migration. The Fluids card label is now **💧 Hydration** instead of "Water", since all water-counting drinks contribute (owner request, 2026-10-03).
3. **Adapting an existing recipe** (owner-raised 2026-10-03; decisions 55–58) — **planned, not built**: the React app has no recipe editor, so an existing recipe cannot currently be changed. Adapting means **editing it in place**, any household user may edit a shared recipe, and the name is fixed at creation. The hard rule: a recipe edit must never change the calories or macros recorded in historic diary data — a diary row keeps its own grams and nutrition snapshot, and only future logs see the new version. **Recipe archive/restore (decision 59) is built, merged and published as rc14** (household-wide; archived recipes hidden by default, restorable, never loggable, history untouched; `DELETE` now answers `409` for any logged recipe). **Still agreed but not built:** recalculating dependent recipe definitions when a food's nutrition is corrected, without touching saved Diary nutrition (decision 60). Food-name typo corrections are allowed to improve historic labels; decision 58's recipe-name rule is unchanged. These belong with the Phase 13 catalogue-editing work. The rest of Phase 13's authoring item — creating a recipe from scratch (ingredients, method, image) — follows. See [`product/vision-and-open-questions.md`](product/vision-and-open-questions.md#adapting-an-existing-recipe--decisions-5558-2026-10-03).
4. **Phase 14** — rolling bank window for the ring (food + drink, completed days only, unlogged days excluded), the weekly report, tracked-nutrients settings and the missing-data audit.
5. **Phase 15** — per-user ring limits/lookback, admin swap-user, themes, PWA install (no offline work: decision 53).

---

## 5. Open questions that change what gets built

Full list and numbering in [`product/vision-and-open-questions.md`](product/vision-and-open-questions.md). The ones
that actually block upcoming work:

| Question | Why it matters | Section |
|---|---|---|
| Away-from-home logging (pub/restaurant/takeaway) | The least precise data the app holds, and the last unanswered logging question | E |
| Nutrient list and coverage rules (decision 47) | Which nutrients to offer, and what a traffic light shows when data is partly covered | F |
| Traffic-light thresholds and the 7-day window | Made urgent by decision 47; the current rules have never been reviewed | F |
| FatSecret long-term, or a UK database (CoFID) | Decides how fillable a nutrient audit can ever be | G |
| Watch/Siri, other trackers | No requirement recorded either way | H |
| Timescale and how involved you want to be | Sizes the plan and the review gates | I |
| **What is the single most annoying thing about cals today?** | Asked at the start, never answered — the best prompt for work the plan hasn't anticipated | I |
| Record the backup's location and cadence | The backup exists (decision 54) but nobody has written down where it is | H |
| Should Today be the last loggable day **everywhere**? | The Calendar clamps at Today (decision 63) but the Diary's › arrow and `POST /api/diary` still accept tomorrow, so pre-logging a planned meal works | I |

**Settled on 2026-10-03 (decisions 42–54), so stop asking:** unlogged days are **excluded** from the
bank (a future "Issues" bell flags them instead); the bank stays **per person**; the ring window is
**user-definable** ("since day 1" when none is set); cross-viewing is an **admin role with a
swap-user control**, not a household view; **no notifications**, but a **weekly report** is wanted;
**tracked nutrients are user-selectable checkboxes** with a missing-data audit; steps do **not** credit
the bank for now; the logging flows need nothing new but a **calendar** is planned for reaching
historic dates; **no logging shortcuts**; the **four meal slots stay**; **no barcode scanning**;
**no offline capability**; and the household data **is backed up**.

Full reasoning and every open sub-question:
[`product/vision-and-open-questions.md`](product/vision-and-open-questions.md).

---

## 6. Housekeeping done recently

- **Published `v2.0.0-dev-rc17` — calendar polish, recipe-pick hand-off and a Go test gate (2026-10-03, PR #40, decisions 62–65).** Published by [run 37154091274](https://github.com/dougalbob/cals/actions/runs/37154091274) from `5d05f27`, digest `sha256:429a63c2…`; `dev-latest` moved with it.
 Three owner-raised papercuts and one CI hole, all frontend plus a workflow file — **no API change, no migration, no bank-maths change**: (62) a day over goal now draws a **green bar split at the goal with a proportional red tail** instead of a full-width red line, so 1,200 against a 1,000 goal reads ≈83% green / ≈17% red (`calorieBarSplit` in `src/lib/calendar.ts`); (63) the Calendar **cannot be advanced past Today** — the forward arrow is disabled on the current month/week, a future URL is clamped back, and days that have not happened are shown but not links; (64) **🍽 Add recipe on a Diary meal card now opens the Recipes tab** with the meal and date carried as URL state (`/recipes?add-to=dinner&on=2026-10-01`), where every card gains **🍽 Add to Dinner** and the portion sheet arrives pre-filled, returning to `/diary/:date#meal` after logging — decision 40's one-line modal picker is gone, and the recipe box's search, favourites, archived and tag filters are the picker; (65) a new **`Go tests (validation)`** workflow runs `go vet ./...` and `go test ./...` with CGO on every PR and on `cals-dev`, which is the first time anything has compiled the Go test files. Verified in-sandbox with `./scripts/verify-go-in-sandbox.sh`: `go build`, `go vet`, `go test ./...` green (the `rc16` calendar regression tests included); frontend 163 Vitest tests, lint and typecheck green.

- **Road-test fixes to the Today/Diary cards (2026-10-03, rc16):** the calorie wheel's two explanatory captions were folded into the wheel itself — `bank ±N` (bank balance **plus** what is left of today), the day's spend in large type, `daily ±N` — both small lines colour-coded by sign; `of 2,000 kcal` was dropped as the goal sits in the tile beside the wheel. The **inner ring** now mirrors the outer one: green countdown clockwise while under the goal, red **anticlockwise** growth once overspent (scaled against another full day, saturating at a complete ring). The hydration target is written **across the glass at 45°** over the water, so the `2,000 / 2,000 ml` caption is gone. The Quick-drinks milk/sugar control is now a bordered circular chip with an SVG three-dot icon — the old `···` glyphs were effectively invisible on Android. Frontend only; 135 Vitest tests, lint and typecheck green.

- **Calendar showed 0 kcal on every day — fixed (2026-10-03, rc16):** on the owner's container every calendar cell read `0 / 1,250 kcal` with an absurd bank figure (`+133,184,631 kcal`), while Home and Diary were correct. Cause: `diary_entries.date`, `drink_entries.date` and `users.bank_start_date` are declared `DATE`, so `mattn/go-sqlite3` converts them to `time.Time` and `database/sql` renders them as RFC3339 (`2026-09-07T00:00:00Z`) when scanned into a string. `internal/handlers/calendar.go` keyed its per-day map on that raw value, so no row ever matched a `YYYY-MM-DD` key; the same RFC3339 bank start date failed `time.Parse`, leaving a zero `time.Time` whose `Sub` saturates at ~292 years (106,752 days × 1,250 kcal). Every calendar query now selects and compares `date(date)` (as `HandleGetBank` already did) and dates are normalised with `isoDate`. Three Go regression tests added in `internal/handlers/calendar_test.go`. No schema or API-shape change. **The defect is live in the published `rc15` image**, so the Calendar is only worth reviewing once `rc16` is installed.

- **Phase 12 owner approval recorded (2026-10-03):** phone-size review of Home and Diary for both identities signed off, clearing the Phase 12 acceptance gate.

- **Decision 40 + Calendar + Hydration relabel (2026-10-03, rc15):** each Diary meal card now has **🍽 Add recipe** beside `+ Add food`; tapping it opens a searchable recipe picker and then the portion sheet with that meal and the viewed date preselected (decision 40, owner-approved in preview). A new `/calendar` route adds Month (compact grid, calorie bar, hydration pip, signed bank figure) and Week (large phone-friendly cards with Breakfast/Lunch/Dinner/Snacks kcal lines, 💧 Hydration `x / y ml`, signed bank), toggled by a segmented control; URL is state (`/calendar/month/YYYY-MM`, `/calendar/week/YYYY-MM-DD`) and every day is a link to `/diary/:date`. The Diary header has a 📅 button and Calendar is now a bottom-nav tab. The new additive read-only `GET /api/calendar?from=&to=` returns per-day meal totals, hydration ml and end-of-day bank balance; no schema migration. The Fluids card heading changed from "Water" to **💧 Hydration** (owner request), since other water-counting drinks contribute to the ml target. Additive Go handler (`internal/handlers/calendar.go`) + fixture implementation + 15 new tests (5 calendar-route render, 10 date-maths) for a total of 132 tests; lint/typecheck/build all pass. Merged as PR #36 and published as `v2.0.0-dev-rc15` — but its Calendar reads 0 kcal per day on a real database; see the fix above, shipping in rc16.

- **Published `v2.0.0-dev-rc14` (2026-10-03, PR #34):** recipe archive/restore, merged to `cals-dev` as `29bd7bb` and published by the tag-triggered workflow (run 37137097231; digest `sha256:be601ee0…`). **Additive schema migration** (two `recipes` columns) on first start.

- **Recipe archive/restore built (2026-10-03, PR #34):** decision 59 implemented end to end — additive migration, `PUT /api/recipes/{id}/archive`, `?include_archived=true` listing, `409` on logging an archived recipe or deleting a logged one, React *Show archived* / *Restore* / *Archive recipe*, and the legacy UI's Delete button replaced by Archive. Go and Vitest regression tests pin that history is byte-identical. **Takes effect on Force Update; the schema change is additive (two nullable/defaulted columns) so no appdata work.**
- **Archive/restore and food-correction policy agreed (2026-10-03):** decisions 59–61 record the owner's agreement to recipe archiving and dependent-recipe recalculation while preserving historic nutrition. Food typo corrections may improve historical labels. **Documentation only — no API, schema, migration or application code changed.** See the [decision log](product/vision-and-open-questions.md#retiring-recipes-and-correcting-foods--decisions-5961-2026-10-03).

- **Published `v2.0.0-dev-rc13` (2026-10-03, PR #32):** the recipe-adaptation requirement and decisions 55–58, merged to `cals-dev` as `9260e10` and published by the tag-triggered workflow (run 37132678548; digest `sha256:d28a8209…`). **Documentation-only — the image is functionally identical to rc12** and there is no migration or appdata work.

- **Recipe-adaptation requirement recorded (2026-10-03):** the owner raised the missing edit path for existing recipes and required that a recipe edit must never change historic diary calories. **Documentation only — no code changed.** Decisions 55–58 settle the shape (edit in place, any household user, names fixed at creation, frozen history) and the plan records the two findings verified against a real server: renaming a recipe relabels its historic diary rows (the name comes from a join), and `DELETE /api/recipes/{id}` fails with a foreign-key error for a recipe with history. See [`product/vision-and-open-questions.md`](product/vision-and-open-questions.md#adapting-an-existing-recipe--decisions-5558-2026-10-03).

- **Published `v2.0.0-dev-rc12` (2026-10-03, PR #30):** tag filtering, decisions 41–54 and the docs restructure, merged to `cals-dev` and published by the tag-triggered workflow (run 37130651708; digest `sha256:59631e65…`), with the release log updated. Frontend-only — no migration.

- **Second discovery pass completed (2026-10-03):** the remaining day-to-day questions are answered — logging flows need nothing new but a calendar for historic dates (49), no shortcuts (50), the four meal slots stay (51), no barcode scanning (52), no offline capability (53), and the household data is backed up (54). See §5 and the decision log.
- **Documentation restructure (2026-10-03):** status is now here and nowhere else; `rebuild-kickoff.md` is commands and guardrails only; dated history moved to [`history/rebuild-log.md`](history/rebuild-log.md).
- **Documentation review fixes (2026-10-03), in the same PR:** "17 tables" corrected to **20** in the three places it appeared (re-verified by running the real server in-sandbox); the kickoff's sync check no longer claims `docs/architecture/` holds five documents; the vision document no longer says `GET /api/diary` lacks serving metadata (decision 29 closed that gap).
