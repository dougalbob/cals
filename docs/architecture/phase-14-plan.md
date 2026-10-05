# Phase 14 — Metrics + Nutrition: proposed content and slicing

| Field | Value |
|---|---|
| **Status** | 🟢 **APPROVED for slices 14.1–14.3** — the owner settled Q1–Q5 on 2026-10-05, recorded as [decisions 91–95](../product/vision-and-open-questions.md#phase-14-planning-pass--decisions-9195-2026-10-05). **14.1 and 14.2 are built, published as `v2.0.0-dev-rc27` and signed off on Unraid on 2026-10-05**; **14.3 is ready to build**. **Q6–Q11 (§6) are still open** and gate 14.4–14.6. Implementation status lives in [`../CURRENT_STATE.md`](../CURRENT_STATE.md) |
| **Written** | 2026-10-05 (proposed and approved the same day) |
| **Owner** | @dougalbob |
| **Purpose** | Turn the Phase 14 line in the plan into concrete, individually shippable slices, and surface every design decision that has to be made before or during them |
| **Related** | [`frontend-strategy.md`](frontend-strategy.md) §7 (the phase table), [`../product/vision-and-open-questions.md`](../product/vision-and-open-questions.md) (decisions 42, 44, 46, 47, 66–71, 87), [`../product/metrics-evidence.md`](../product/metrics-evidence.md) (research on charts, trends and measurement cadence), [`testing.md`](testing.md) |

> Q1–Q5 were settled by the owner on 2026-10-05 and are recorded as
> [decisions 91–95](../product/vision-and-open-questions.md#phase-14-planning-pass--decisions-9195-2026-10-05);
> §6 below keeps the question and the answer together so the reasoning stays readable. Q6–Q11 are still
> open and must be answered before slices 14.4–14.6 start; they get promoted into the same numbered log
> when they are.

---

## 1. What Phase 14 owns — and what it deliberately does not

Phase 14 is **Metrics + Nutrition**. From the plan and the decision log it owns:

| Item | Source |
|---|---|
| The **windowed bank** — the last N completed days becomes the bank *everywhere* (tile, `today_available`, ring), 14 days by default | decision 66, revising 44 |
| **Unlogged days excluded** from the bank | decision 42 (a change to today's behaviour) |
| The **body-map** measurement picker | decision 67 |
| **Charts pan their window** rather than compressing history | decision 69 |
| **30-day pannable weigh-in chart with a trend line** | decision 70 |
| **Daily-goal-vs-consumed chart** with green / amber / red bands | decision 71 |
| A **weekly report** in place of general notifications | decision 46 |
| **Tracked-nutrients settings + missing-data audit** | decision 47 (see Q10 — recommendation is to move this to Phase 15) |
| The deferred **RFC3339 date fix** on the metrics endpoints | [known issue, deferred](../product/vision-and-open-questions.md#known-issue-deferred--rfc3339-dates-on-the-metrics-endpoints-2026-10-03) — "pick this up at the start of the metrics phase" |

Explicitly **not** Phase 14 (it stays where the plan puts it):

- **Settings screen, bank-window control, weigh-in trend-window control, ring ± limits, themes, PWA install**
  — Phase 15. Phase 14 ships the *maths* with hard defaults (14-day bank window, 7-day trend average) and the
  columns to store them; the owner sees the new numbers before any control exists (decision 66's sequencing
  rule, decisions 93 and 95).
- **Cutover, the `/` route, making React the default, deleting the legacy UI** — Phase 16. Phase 14 review
  links must say **`/next/`** (e.g. `https://<your cals host>/next/metrics`).
- **Body-measurement raw / %-from-baseline charts, weight-trend ETA and forecast cones** — still research in
  [`../product/metrics-evidence.md`](../product/metrics-evidence.md). `metrics-evidence.md` §5 states plainly that
  target-weight ETA "is a research question, not a Phase 14 acceptance criterion". Phase 14 draws a
  *historical* trend only and never extrapolates a date.
- **The Issues bell and the measurement reminder (decision 87)** — no channel is approved; the reminder is not
  built and stays unbuilt.
- **Steps crediting the bank** — decision 48 says no.

---

## 2. Verified starting point

Everything below was read out of the code on 2026-10-05 at `cals-dev` tip `5645ba9`, not taken from a handoff.

**The bank today** (`internal/handlers/bank.go`) counts *every calendar day* between `bank_start_date` and the
as-of date, so an unlogged day contributes a full day's budget:

```go
SELECT CAST(julianday(date(?)) - julianday(date(?)) AS INTEGER)   // dayCount
totalBudget := dayCount * dailyGoal
bankBalance := totalBudget - int(totalConsumed)
```

It already includes `drink_entries` and already uses `date(date)` comparisons. So decision 66 is a change of
window **and** decision 42 is a change of rule, in the same function.

**`GET /api/stats/*` is not consistent with it** (`internal/handlers/stats.go`):

- `HandleGetCalorieStats` sums `diary_entries` only — **no drinks** — so a daily-consumed chart built on it
  today would disagree with the ring on the same screen.
- `HandleGetBankStats` is cumulative from `bank_start_date` and food-only.
- Both cap `days` at 90 and both are anchored at `date('now')`, so **neither can page backwards** — which is
  exactly what decision 69's panning needs.

**The date-format issue is live and has already bitten once.** `internal/handlers/weight.go`,
`measurements.go` and `fitness.go` select the bare `date` column, and because it is declared `DATE`,
`mattn/go-sqlite3` hands back `2026-10-05T00:00:00Z`. The legacy Metrics screen compares that against a plain
date at `web/static/js/components/metrics.js:74`:

```js
const today = new Date().toISOString().split('T')[0]
const todayEntry = entries.find(e => e.date === today)   // never matches
```

so **the V1 weight box never pre-fills today's weigh-in** — it silently falls back to the last known value.
Other places in the same file (`:274`, `:281`, `:602`) already call `.split('T')[0]`, so normalising the wire
format to `YYYY-MM-DD` fixes line 74 and leaves the rest working. Worth doing in the first slice rather than
carrying it.

**Measurements cannot be edited.** Routes are `GET`, `POST`, `DELETE /api/measurements/{id}` — there is no
update endpoint (verified: no `PUT` handler exists). Worse, `POST /api/measurements` does
`DELETE FROM measurement_entries WHERE user_id = ? AND date = ?` before inserting, so **posting one body part
wipes every other part recorded that day**. And `GET /api/measurements` is `LIMIT 20`, so "the last value for
this part" cannot be answered from it once history passes 20 rows.

**Target weight can be neither read nor set.** `models.User` carries `TargetWeightKG` and V1 draws a target
line from it (`web/static/js/components/metrics.js:209-213`), but `grep -rn "target_weight" --include=*.go .`
finds the name in only two places: the `ALTER TABLE users ADD COLUMN target_weight_kg REAL` migration and the
struct field. **No query selects it and no handler writes it** — `GetOrCreateUser`'s `SELECT` omits the column,
so `GET /api/users/me` always leaves it out (`omitempty` on a nil pointer) and React's Metrics screen shows
"Target: Not set" permanently, whatever is in the database. The `weight_goals` table is the same story:
created at `internal/database/migrations.go:250` and referenced by no Go code at all. If the weigh-in chart is
to show a target line, Phase 14 has to close this.

**The React Metrics screen is still the spike** (`web/frontend/src/routes/MetricsRoute.tsx`, 200 lines): a
90-day weight line, 14-day calorie bars, 30-day bank line, four traffic lights and a 6-row measurements
table, drawn by two hand-written SVG components in `src/components/charts.tsx` that auto-fit their axes and
cannot pan.

**V1 parity that Phase 14 does not have to close** (recorded so it is not mistaken for Phase 14 scope):
V1's Nutrition tab renders status cards, a macro donut, protein and fibre sections with their own trend
charts and a daily table (`web/static/js/components/nutrition.js`), and it can *edit* nutrition settings via
`PUT /api/nutrition/settings`. React shows the four traffic lights read-only inside Metrics and has no editor.

**Housekeeping checked while writing this:**

- The open item "audit the legacy `getUsers()` caller" is **closed by inspection**: the method is
  `API.listUsers()` at `web/static/js/api.js:60`, and `grep -rn "listUsers" web/` finds **no callers** anywhere
  in the legacy UI. Making `GET /api/users` Admin-only breaks nothing in V1.
- This workspace is a clean clone at `5645ba9`, which is the current tip of `origin/cals-dev`; PRs #59 and #60
  are merged and tag `v2.0.0-dev-rc26` exists (published 2026-10-04 18:25 UTC). The earlier session's "local
  `HEAD` is `38ce871` with uncommitted work" note does not apply here.
- Checks actually run on this tree while writing: `npm test` — **25 files, 198 tests, all passing**;
  `npm run build:go` — typecheck clean, one 508 kB JS chunk (147 kB gzipped);
  `node scripts/check-doc-links.mjs` — **21 files, no broken links or anchors** (including this document).
  The Go suite was not run this turn; `scripts/verify-go-in-sandbox.sh` is the route for it.

---

## 3. Proposed slicing

Phase 14 as written is far too large for one pull request — it touches crown-jewel maths, three handlers, an
additive migration, a charting decision and two new screens' worth of UI. The plan requires each phase to be
"independently shippable"; the same should hold inside the phase. **Six slices, each its own PR and its own
`rc` checkpoint, each with an Arena-preview approval before merge**, following the rc19 → rc21 → rc22 rhythm.

### 14.1 — Metrics backend foundations *(no owner-visible change)*

The cheapest slice and the one everything else stands on.

1. Select `date(date) AS day` and normalise with the existing `isoDate` helper in `weight.go`,
   `measurements.go` and `fitness.go`, so their JSON carries `YYYY-MM-DD`. Fixes the V1 pre-fill bug above.
2. Add `from` / `to` (ISO, inclusive, bounded span — reuse `GET /api/calendar`'s 400-day cap) to
   `GET /api/weight`, `GET /api/stats/calories` and `GET /api/stats/bank`. **Keep `days` working** so V1 and
   the current React screen do not change behaviour.
3. Add `drink_entries` to `HandleGetCalorieStats`, with a regression test that fails before the change —
   the same pattern `bank.go` already uses.
4. Handler contract tests pinning the wire date format and the drink inclusion.

*Additive API only, no schema change, no migration, no appdata operation.*

**Built 2026-10-05** — and four things came out of building it that the plan did not predict:

- **Two small additions beyond the three planned items.** Drinks were added to `GET /api/stats/bank` as
  well as `GET /api/stats/calories` (shipping one and not the other would have published a known
  inconsistency), and `GET /api/steps` gained the same `from`/`to` parameters so every series endpoint
  shares one contract.
- **`days` now means exactly N days everywhere.** `GET /api/weight` and `GET /api/steps` filtered on
  `date >= today − N days`, which is N + 1 calendar days, while the stats endpoints produced N. They
  agree now; `TestWeightDaysMeansExactlyThatManyDays` pins it.
- **One planned fix was not a fix.** `users.bank_start_date` in `HandleGetBankStats` is read through a
  `COALESCE`, and `sqlite3_column_decltype` is NULL for an expression, so the driver was already
  returning plain text — verified against a real server. The `isoDate` there is defensive, and the
  handler comment now says so rather than claiming a repair that never happened.
- **Two RFC3339 leaks are still open by choice:** `GET /api/users/me`'s `bank_start_date` and
  `GET /api/bank`'s `start_date`. Both were verified still returning `2026-10-05T00:00:00Z`. The legacy
  UI tolerates them and React does not display them; changing the wire shape is the open question in
  the [deferred-issue section](../product/vision-and-open-questions.md#known-issue-deferred--rfc3339-dates-on-the-metrics-endpoints-2026-10-03),
  not a slice-14.1 change.

Verified on a real server, not just in unit tests: a logged day of 500 kcal food plus a 150 kcal drink
reports **650** from `GET /api/stats/calories`, every date in the weight, measurement and steps payloads
is plain `YYYY-MM-DD`, a `from`/`to` window returns exactly the days asked for, a future `to` is clamped
to today, and the six malformed-range cases all answer `400`.

### 14.2 — The windowed bank *(decisions 66 and 42; crown-jewel maths)*

The one slice that changes numbers the household looks at every day.

1. Rewrite the window in `HandleGetBank`: for the as-of date, sum over the previous **N completed calendar
   days** (as-of excluded — today is always in progress), bounded below by `bank_start_date`, taking
   `goal − consumed` **only for days that have logging** (decision 42), over food **and** drinks.
2. Additive response fields so the figure is auditable and labelable: the window length, the window's first
   day, how many days counted and how many were excluded as unlogged. The existing `bank_balance`,
   `today_available` and `start_date` fields stay.
3. Additive migration for `users.bank_window_days` (default 14), read by the calculation and settable through
   `PUT /api/users/me` — **no UI**, per decision 93.
4. **Make the two mirrors agree in the same PR.** `internal/handlers/calendar.go` currently re-implements the
   old cumulative rule for each day's closing balance, and `HandleGetBankStats` is food-only and cumulative.
   Shipping the new rule in `/api/bank` alone would put Today, Diary and the Calendar on different numbers —
   precisely the class of bug the calendar's RFC3339 incident came from.
5. Every surface that prints the figure gets its window label: Banked/Deficit tile, ring accessible label,
   Diary header, Calendar cells — "Last 14 days", or "All time" when that preset is in force.
6. Regression tests in `internal/handlers/bank_test.go` for: the window boundary; a window shorter than the
   history; a window reaching past `bank_start_date`; unlogged days inside the window; food + drink
   inclusion; the All-time preset; `today_available` moving with the window; and Calendar agreeing with
   `/api/bank` for the same date.

⚠️ **Expect the household's numbers to move, twice over.** A windowed figure is smaller than a
since-day-one figure, and decision 42 removes the free day's budget that unlogged days currently add. The
owner's wife's deficit will change by more than the window alone explains. This is the reason 14.2 is its own
checkpoint with its own preview: the numbers should be looked at before anything is built on top of them.
See **Q1** — one line of the existing documentation is wrong about this.

**Built 2026-10-05** (PR #62, shipped in `v2.0.0-dev-rc27`; the owner road-tested the changed figures on Unraid on 2026-10-05 — "all looks good"). Five things building it taught, recorded here because 14.3 and the rest of the phase build on them:

- **One helper, three surfaces.** `GET /api/bank`, the Calendar's per-day closing balance and `GET /api/stats/bank` now all call one `computeBankWindow`. The Calendar had re-implemented the old cumulative rule and the stats endpoint was food-only and cumulative; shipping the new rule in one place would have put Today, Diary and the Calendar on three different figures — exactly the class of bug the RFC3339 incident came from. Any future change to the bank goes through the same helper.
- **One rounding rule.** Half away from zero, applied once per window, replaced the Calendar's round-half-up and the bank's truncation. The two only disagreed on some values, so nothing had ever surfaced it.
- **A "logged day" is any entry in either ledger.** A day with only a logged glass of water contributes a full day's budget — the literal reading of decision 42. The owner was shown the alternative (only calorie-bearing entries count) and asked **not** to narrow it: the household logs water most days, and that is the reading that matches decision 42's wording ("a day with no logging at all").
- **The numbers move twice over.** A window is smaller than a since-day-one accumulation, *and* an unlogged day no longer adds a day's budget — so the deficit change is larger than the window alone explains. That is why the slice was its own checkpoint and why the owner read the real figures on both accounts before 14.3.
- **Prove the tests fail without the change.** The new window tests were run against a simulated pre-slice calculation: the window tests report the old figures (e.g. 2500 where the windowed rule says 1000) and the Calendar reports 1870 where the windowed rule says 370. A test that passes before and after is evidence of nothing.

Two RFC3339 leaks remain open by choice (`GET /api/users/me`'s `bank_start_date` and `GET /api/bank`'s `start_date`), because the wire-format question is untouched by this phase. `web/static/**` still prints the figure without its window label, as the legacy UI is frozen to critical fixes.

### 14.3 — Metrics charts *(decisions 69, 70, 71)*

1. A shared **panning window hook**: drag on a phone (with `navigator.vibrate` where supported, never a
   dependency), click-and-hold on a laptop, moving the *data window* and re-fetching through 14.1's `from`/`to`.
   The visible range rides in the URL so reload and deep links work, as the Calendar already does.
2. **Weigh-in chart** (decisions 70 and 95): 30-day window, raw points kept as points, a **7-day moving
   average over weigh-ins** labelled with its method, and a y-axis with sensible fixed padding so a 0.4 kg
   wobble does not read as a crisis. No forecast, no ETA, no plateau claim. Additive migration for
   `users.weight_trend_days` (default 7), settable through `PUT /api/users/me` with **no UI** until Phase 15
   exposes it — the owner expects to want 10 or 14 there (decision 95).
3. **Goal-vs-consumed chart** (decision 71): one bar per day against a horizontal goal line — green below,
   amber for the first 10% over, red beyond. Built on 14.1's drink-inclusive stats so it cannot disagree with
   the ring above it.
4. The charting approach is settled by decision 94: the existing SVG components, plus the pan hook.

*Frontend plus the read-only endpoints from 14.1. No schema change.*

**Ready 2026-10-05.** Decisions 69, 70, 71, 94 and 95 are all settled and nothing gates the slice; three implementation notes were recorded when the plan was brought in line after rc27's sign-off:

- **Read the trend window from `GET /api/users/me`, do not hard-code 7.** 14.3 adds the additive `users.weight_trend_days` column (default 7), readable and writable through `PUT /api/users/me` with no UI — the same column-now-control-later pattern as 14.2's bank window (decision 93). The chart must use the value the user record returns, not the literal 7, or the Phase 15 control would appear to do nothing.
- **The trend is drawn only where it has at least three weigh-ins to average, and it is labelled with its method.** Points stay points; the moving average is taken over weigh-ins rather than calendar days (decision 95); it carries a visible "n-weigh-in moving average" label; and there is no forecast, ETA or plateau claim anywhere.
- **The other Metrics surfaces keep their windows.** The pan moves the chart window only: the 30-day bank line and the measurements table are unchanged, and only the weigh-in and goal-vs-consumed charts share the pannable window.

### 14.4 — Body-map measurements *(decision 67)*

The biggest UI addition, and the only slice that must write.

1. **Backend, first:** a per-part update path so committing one measurement cannot wipe the others recorded
   that day (**Q6**), and a "latest non-null value per part" lookup that is not defeated by the 20-row limit.
   Additive migration for the per-user outline preference (**Q7**).
2. **The map:** an SVG outline with a tap point per part, large invisible hit areas (44 px rule — the same
   technique `RecipeTags` already uses), labelled and keyboard-focusable.
3. **The pop-up:** last recorded value for that part, overtype or step (**Q9**), save icon, plus decision 67's
   two confirmations — unsaved-cancel ("You have an unsaved measurement. Discard it?") and unchanged-save
   ("Measurement hasn't changed — is this correct?").
4. Lives on Metrics; the existing table stays underneath as history.

### 14.5 — Nutrition view *(parity, without decision 47's settings)*

A proper Nutrition screen matching what V1 already does — macro status, protein and fibre against their
goals, the daily table — reading the endpoints that exist (`/api/nutrition/daily`, `/api/nutrition/weekly`,
`/api/nutrition/settings`). Built so that nutrients enabled later appear automatically, which is what the
weekly-report note in the vision document recommends. **Decision 47's user-selectable nutrients and
missing-data audit are recommended for Phase 15, where the Settings screen exists** — see Q10.

Also in this slice, if the owner wants the target line: make `target_weight_kg` both **read** (it is currently
in no query) and **writable** through `PUT /api/users/me` — see §2.

### 14.6 — Weekly report *(decision 46)*

An in-app report card in Metrics for a chosen week: calories against goal, how the bank moved, water, weight
change, the traffic lights, best and worst days, and **which days were excluded as unlogged** so decision 42's
exclusions are never quietly unexplained. In-app only — no email, no push.

**Suggested order:** 14.1 → 14.2 → 14.3 → 14.4 → 14.5 → 14.6. 14.5 and 14.6 are the two that could be dropped
or pushed back if the owner wants to reach Phase 15/16 sooner; 14.1 and 14.2 cannot be, because the charts and
the report both read their numbers.

---

## 4. Guardrails carried into every slice

- **Additive migrations only**; never drop or rewrite user data (`AGENTS.md` §4).
- **No appdata operation of any kind.** `/mnt/user/appdata/cals-dev-v2` is live household data. Take the usual
  backup before any Force Update, as always.
- **Legacy UI freeze** — `web/static/**` gets critical fixes only. The one exception here is 14.1's date
  normalisation, which *fixes* a V1 bug rather than changing its behaviour.
- **The bank is crown-jewel maths**: never changed incidentally, and tests land in the same PR.
- **Recipes-are-definitions / diary-rows-are-records** is untouched by this phase, but 14.2 must not re-read
  any definition to recompute a saved row.
- **Every slice gets an owner preview in Arena before merge**, and review instructions must name
  **`/next/`** — the React app is not at `/`.
- Standard definition of done: `npm run lint && npm run typecheck && npm test && npm run build:go`;
  `scripts/verify-go-in-sandbox.sh` then `go vet ./... && go test ./...`; `node scripts/check-doc-links.mjs`;
  the Playwright suite at the tag.

---

## 5. Verification and acceptance, per slice

| Slice | Automated | Owner acceptance |
|---|---|---|
| 14.1 | Go handler tests for date format, range params, drink inclusion; V1 metrics screen still renders | None needed — no visible change. Confirm `GET /api/weight` JSON dates read `YYYY-MM-DD` |
| 14.2 | The seven bank regression tests plus a Calendar-vs-`/api/bank` agreement test | **Read the new bank figure on his and his wife's account at `/next/` and confirm it looks right** before anything builds on it — ✅ **done: owner signed off on Unraid 2026-10-05 ("all looks good")** |
| 14.3 | Chart component tests (bands, trend, axis padding); Playwright drag-to-pan at 360×640 | Charts at `/next/metrics` on a phone: can you reach last year by dragging, and does the trend look honest? (ready to build; no question gates it) |
| 14.4 | Go tests that committing one part preserves the others; component tests for both confirmations | Tap every point on the map at phone size, including a part never measured |
| 14.5 | Component tests for the nutrition sections | Compare `/next/nutrition` with the V1 Nutrition tab side by side |
| 14.6 | Report maths tests, including excluded-day labelling | Does the report card answer "how did last week go"? |

---

## 6. Decisions

Q1–Q5 gated slices 14.1–14.3 and were settled by the owner on 2026-10-05; each is recorded as a numbered
decision in [`../product/vision-and-open-questions.md`](../product/vision-and-open-questions.md#phase-14-planning-pass--decisions-9195-2026-10-05).
Q6–Q11 are still open and gate 14.4–14.6.

### Settled — decisions 91–95 (2026-10-05)

**Q1 — Does "All time" reproduce today's exact numbers?** The decision log said both "“All time” reproduces
today's cumulative behaviour, so nothing is lost" (decision 66) and that excluding unlogged days "is a change
from today's behaviour … and lands in Phase 14" (decision 42). For anyone who skips days, both cannot be true.
**✅ Settled — decision 91: all time excludes unlogged days too.** One rule at every window length, and
decision 66's "nothing is lost" line is corrected. Two rules for the same figure is how the tile and the ring
came to disagree in the first place.

**Q2 — Is the window 14 calendar days or 14 logged days?** (Flagged as a design point in decision 66's own
notes.) **✅ Settled — decision 92: calendar days.** The previous 14 calendar days before the as-of date, with
decision 42 deciding which of them count. It matches how a person talks about a fortnight, and it makes the
"12 days counted of 14" label meaningful.

**Q3 — Does the window live in the database now?** Decision 66's notes ask for an additive per-user column
defaulting to 14, while its sequencing rule says the *control* is Phase 15.
**✅ Settled — decision 93: add `users.bank_window_days` in 14.2**, defaulted to 14, readable and writable
through `PUT /api/users/me` but with **no UI** — so the maths is testable and the owner can try a different
window in preview, and Phase 15 only has to draw the control.

**Q4 — Hand-written SVG charts, or Chart.js?** The plan names `react-chartjs-2` as the recommendation but
records the choice as still open.
**✅ Settled — decision 94: keep the existing hand-written SVG components and add a pan hook.**
(*A "pan hook" is just a small, shared piece of code that handles the drag: it remembers which stretch of
dates the chart is showing, moves it when you drag, and asks the server for that stretch. "Hook" is React
vocabulary, not a product feature — from the outside it is simply "the chart drags".*)
The requirement is panning the *data window* (fetch a different range), not zooming a viewport, so a chart
library's zoom plugin buys less than it looks; the production bundle is already **508 kB JS / 147 kB gzipped** as one chunk (measured
2026-10-05 with `npm run build:go`, which already warns that it is over Vite's 500 kB limit) and it serves a
phone; and the two components in place are already unit-tested. Decision 71's amber band and 70's trend line
are both straightforward in SVG. This was the one genuinely open technical choice in the phase; the owner accepted the
recommendation, which also closes the Chart.js-versus-Recharts question recorded as open in
[`frontend-strategy.md`](frontend-strategy.md) §11.

**Q5 — Which trend line on the weigh-in chart?** Decision 70 left the style to the implementation discussion.
**✅ Settled — decision 95: a 7-day moving average taken over weigh-ins rather than calendar days**
(nobody logs daily, so a calendar window can come up empty), drawn only where there are at least three points,
and labelled with its method. `metrics-evidence.md` §4 supports smoothing as a technique while explicitly
warning against calling it "true weight" or inferring a plateau.

**The owner's addition, recorded now so it is not lost:** 7 days is a starting value, not a settled one —
**10 or 14 days are the likely alternatives** — so the averaging window becomes a **per-user setting in the
Phase 15 Settings/profile work**, beside the bank window (decision 93) and the ring limits. Phase 14
therefore follows the same column-now-control-later pattern: `users.weight_trend_days` defaults to 7 in 14.3,
is readable and writable through `PUT /api/users/me`, and gets no UI until Phase 15.

### Still open

Needed before 14.4:

**Q6 — Where does a body-map save write to?** (a) a new per-part update endpoint patching the latest entry's
own date, or (b) the existing `POST`, writing today's row and resending every part to keep.
*Recommendation:* **(a)** — it preserves history and the recorded date, and it is the only option that makes
"correct last month's waist" possible without inventing a new measurement.

**Q7 — Does the outline preference get its column now?** The body map needs a shape, but the per-user outline
preference is currently written into Phase 15.
*Recommendation:* pull the single additive column into 14.4 as a narrow, tested exception — without it the map
either cannot differ per person or has to store the choice in the browser, which the plan rules out.

**Q8 — Bust on the female outline, chest on the male?** *Recommendation:* yes, as the decision 67 notes
suggest — it keeps both columns meaningful and asks nobody to choose between them.

**Q9 — Stepper increment, 0.5 cm or 1 cm?** *Recommendation:* **0.5 cm**, with the field still accepting a
typed 0.1 cm value.

Needed before 14.5 / 14.6:

**Q10 — Does decision 47 (tracked nutrients + missing-data audit) stay in Phase 14?** It is currently listed
there, but its UI is "a Settings sheet of checkboxes" and Settings is Phase 15.
*Recommendation:* **move it to Phase 15** and build 14.5 so enabled nutrients appear automatically. Otherwise
Phase 14 builds a settings sheet that Phase 15 immediately replaces.

**Q11 — Weekly report shape: a fixed "last week" card, or a date-range picker?**
*Recommendation:* a week picker defaulting to the current week with the previous one a tap away — the same
segmented-control pattern the Calendar already uses.

---

## 7. Rough size

Re-based 2026-10-05 after 14.1 and 14.2 landed and were signed off:

| Slice | Size | Notes |
|---|---|---|
| 14.1 | Small | Three handlers, tests. No UI. **Built** — two small additions beyond the plan and one planned "fix" that was not a fix (§14.1) |
| 14.2 | **Medium-large** | Small diff, high risk. Most of the effort is tests and the two mirrors. **Built and signed off** — the two mirrors were the substance, plus one rounding rule and the logged-day rule (§14.2) |
| 14.3 | Medium | Two charts plus the shared pan hook and one additive column. Decision 94 keeps the hand-written SVG components, so the Chart.js path is closed and the bundle does not grow a chart library |
| 14.4 | **Large** | New SVG surface, new endpoint, migration, accessibility |
| 14.5 | Medium | Mostly porting a screen V1 already has |
| 14.6 | Small-medium | Presentation over data the other slices already produce |

Phase 14 is realistically **several working sessions**, not one; two of the six slices are done. Nothing
in it needs a decision about cutover, and nothing in it moves the household off `/`.
