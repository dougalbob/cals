# The reminders bell — weigh-in, measurements and weekly-report nudges

| Field | Value |
|---|---|
| **Status** | 🟢 **Implemented.** The header bell, its three reminder types and the per-user report watermark are all built. Review and release status lives in [`../CURRENT_STATE.md`](../CURRENT_STATE.md) |
| **Date raised** | 2026-10-07 (decisions 121–122) |
| **Decision owner** | @dougalbob |
| **Scope** | `internal/handlers/reminders.go` (+ tests), `internal/database/migrations.go` (the `users.report_seen_through` column), `internal/models/models.go`, `cmd/server/main.go` (two routes), `web/frontend/src/components/RemindersBell.tsx`, `lib/reminders.ts`, `AppLayout.tsx`, `WeeklyReport.tsx`, `MetricsRoute.tsx` (`?open=` deep links and the 14-day staleness cue), `web/frontend/mock-api/` (fixture parity) |
| **Related** | [`../product/vision-and-open-questions.md`](../product/vision-and-open-questions.md) (decisions 42, 46, 87, 121–122), [`../product/metrics-evidence.md`](../product/metrics-evidence.md) §3 (cadence evidence), [`phase-14-plan.md`](./phase-14-plan.md) (the weekly report it advises on) |

---

## 1. What it is

A 🔔 in the app header, on every screen, with a badge count. Opening it lists what is currently
asking for the acting user's attention — and only that:

| Item | Due when | Clears when | Action |
|---|---|---|---|
| **Time to weigh in** | ≥ 3 days since the newest weigh-in, or never weighed (decision 122) | A weigh-in is logged | *Log weigh-in* → `/metrics?open=weigh-in` (the weigh-in sheet opens) |
| **Time for body measurements** | ≥ 14 days since the newest measurement session, or never measured (decision 122) | A measurement session is logged | *Add measurements* → `/metrics?open=measurements` (the body map scrolls into view) |
| **Weekly report ready** | The previous Monday–Sunday week has ended and the user has not viewed a report through its end | A completed report is displayed (server-side watermark) | *View report* → `/metrics?report=week&report_anchor=<Monday>` |

The nags act for **whose data is on screen**, including the Admin's "Viewing as" switch — each
account has its own data and its own watermark. In-app only: no push, no email (decision 46), and
this first slice deliberately excludes decision 42's unlogged-day issues.

## 2. Why the shapes differ

**The cadence nags are derived state.** `GET /api/reminders` recomputes them from `weight_entries`
and `measurement_entries` on every read, so logging the data *is* the dismissal — there is no
dismissal UI to build, no state to desynchronise, and nothing to expire. The owner was explicit:
the nags clear once the user has added that data for that window, and there is deliberately no
snooze (decision 121). A gap that has *reached* its window is due (weigh-in on day 3, measurements
on day 14); a future-dated newest entry is treated as not due.

**The weekly-report advisory needs memory.** "Ready" persists until the report is *read*, which data
alone cannot express, so `users.report_seen_through` (additive migration; NULL = nothing viewed)
holds a per-user watermark. It is **monotonic**: `POST /api/reminders/weekly-report-seen` moves it
forward (`max`), so re-reading an older report cannot resurrect the advisory. It is a watermark
rather than a per-week flag on purpose — viewing a custom range that ends later also counts, and a
single column answers every window. The server, not the device, holds it so the advisory clears on
every phone/tablet the household uses (the owner's choice over `localStorage`).

**What "viewed" means:** the `WeeklyReport` card posts the end date of any *completed* period it
displays (`range.to < today` — a completed Mon–Sun week from the ‹ paging, or a custom range). The
in-progress week never posts: a report is complete when its week has finished, which is also when
the advisory first appears (`lastCompletedWeek`: the previous Monday–Sunday, whatever today is).

## 3. API

```
GET  /api/reminders                        → { "items": [ ReminderItem, … ] }   (only active items)
POST /api/reminders/weekly-report-seen     → { "seen_through": "YYYY-MM-DD" }
     body: { "week_to": "YYYY-MM-DD" }     400 on malformed or future dates
```

`ReminderItem` (in `internal/models/models.go`) is fully normalised — every field always present,
explicit nulls where unused (the slice-14.4 convention):

```json
{ "type": "weigh_in" | "body_measurements" | "weekly_report",
  "last_date": "2026-10-02" | null, "days_since": 5 | null, "cadence_days": 3,
  "week_from": null, "week_to": null }
```

`cadence_days` is 3 / 14 / 0 (the report has no cadence); `week_from`/`week_to` name the completed
period for the report item. Both routes read the **acting** user (`auth.GetUserEmail`), like every
other data handler.

## 4. The frontend

- **`components/RemindersBell.tsx`** — header bell (badge = active count), a `Modal` sheet of items,
  and one action button each. `lib/reminders.ts` holds the copy and deep links as pure functions.
- **`MetricsRoute.tsx`** consumes `?open=`: `weigh-in` opens the weigh-in sheet (the URL is the
  state — the `report_*` convention — and closing clears it); `measurements` is a one-shot scroll to
  the body map, then the parameter cleans itself up. The staleness line's amber cue now fires at the
  same 14-day window (`MEASUREMENT_OVERDUE_DAYS`) with the copy "measurements are best taken every 2
  weeks" — the Metrics cue and the bell can never disagree (decision 122).
- **Invalidation:** logging a weigh-in or measurement (and editing/deleting a session) invalidates
  the `reminders` query, so the badge clears the moment the data lands. `WeeklyReport` invalidates it
  after posting the watermark.
- **The fixture API** (`web/frontend/mock-api/`) implements both endpoints with the same arithmetic
  and the same wire shape; `mock-api/reminders.test.mjs` pins the contract the Go tests pin on the
  server side, so the preview cannot lie about the bell.

## 5. Deliberately out of scope

- **Unlogged-day issues and the rest of decision 42's vision** — future items can extend the same
  list; nothing here pre-judges their resolve/dismiss semantics.
- **Push notifications and email** — decision 46.
- **Snooze/dismiss** — declined for the cadence nags (owner direction 2026-10-07); if revisited, it
  needs its own state and its own decision.
- **Configurable cadences** — 3 / 14 days are fixed constants shared by the Go handler and the
  fixture; a Settings control would move them to `users` like `weight_trend_days`.
- **The legacy vanilla UI** — the bell is React-only; `/legacy/` is a lifeboat, not a product
  surface.
