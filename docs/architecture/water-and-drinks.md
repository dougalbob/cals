# Water and Drinks — one source of truth

| Field | Value |
|---|---|
| **Status** | 🟢 **ADOPTED — Phase 12 implemented** (schema, `internal/handlers/{bank,drinks,water}.go`, React Diary) |
| **Updated** | 2026-10-02 |
| **Decision owner** | @dougalbob |
| **Related** | [`frontend-strategy.md`](./frontend-strategy.md) (§7 Phase 12), [`../product/vision-and-open-questions.md`](../product/vision-and-open-questions.md) (decisions 1, 3, 7, 8, 14–17), [`../AGENTS.md`](../../AGENTS.md) |

## The model

Water and drinks share one ledger: **`drink_entries`**.

| Concept | Where it lives | Notes |
|---|---|---|
| A user's drinks | `drinks` | name, icon, typical `volume_ml`, `calories`, and **`counts_toward_water`** |
| A logged drink | `drink_entries` | snapshots `volume_ml` and `calories` at the moment it was logged |
| Daily water total | derived: `SUM(drink_entries.volume_ml)` where the drink has `counts_toward_water = 1` | `GET /api/water?date=` |
| Water target | `users.daily_water_goal_ml` | per-user, editable in Settings (default 2000 ml) |
| Calorie bank | `diary_entries.calories` + `drink_entries.calories` | decision 1 — drinks count |

Consequences of this design:

1. **There is no second water ledger.** The legacy `water_entries` table had no handlers and
   never held data; it is dropped by the migration **only when it is empty**, and kept (with a
   log line) if it does contain rows, per the additive-migration rule. It is never read.
2. **The Diary's water figure cannot drift from the log**, unlike the old hard-coded
   `0 / 2000 ml` in the legacy UI.
3. **Editing a drink does not rewrite history.** Entries snapshot the values they were logged
   with (the same behaviour diary entries already had). Fix a typo in a drink's calories and
   yesterday's total stays as it was.
4. **A volume override is a first-class log.** `POST /api/drinks/entries` accepts an optional
   `volume_ml`; calories scale from the drink's per-millilitre value and are rounded. This is
   what makes "a 500 ml bottle instead of the usual 250 ml glass" one tap.
5. **Opening a drink to log it is one tap**: `POST /api/drinks/entries {drink_id, date}` uses
   the drink's own volume and calories.

## API

| Endpoint | Behaviour |
|---|---|
| `GET /api/drinks` | The user's own drinks, including `counts_toward_water`. **No defaults are created** — an empty list is a valid answer (decision 8) |
| `POST /api/drinks` · `PUT /api/drinks/{id}` | Create/update a drink; name and a positive `volume_ml` required; the water flag round-trips |
| `GET /api/drinks/entries?date=` | That day's drink entries, newest-stable order (`created_at`, `id`) |
| `POST /api/drinks/entries` | `{drink_id, date, volume_ml?}`. The drink must belong to the caller (`404` otherwise, previously unchecked) |
| `DELETE /api/drinks/entries/{id}` | Remove a mistap; the water total and bank recompute on the next read |
| `GET /api/water?date=` | `{date, consumed_ml, target_ml, entries[]}` — water is **derived** from the flagged drink entries |

## Migration (additive)

| Change | Why |
|---|---|
| `drinks.counts_toward_water INTEGER NOT NULL DEFAULT 0` | The single water flag |
| `drink_entries.volume_ml`, `drink_entries.calories` | Entry snapshots; backfilled from the drink for existing rows |
| `UPDATE drinks SET counts_toward_water = 1 WHERE lower(trim(name)) = 'water'` | Existing water drinks keep working without anyone re-configuring them |
| `DROP TABLE water_entries` **only when empty** | Removes the dead table without ever discarding data |

No user data is rewritten or deleted, and nothing needs to be re-entered after the upgrade.

## Bank fix (decision 1)

`internal/handlers/bank.go` summed only `diary_entries` while the Diary's ring included drink
calories, so "banked" and "today" disagreed. The bank now adds `drink_entries.calories` over the
same window. Covered by `internal/handlers/bank_test.go`:

- drinks and food both reduce the bank (regression test);
- a drink before `bank_start_date` is ignored;
- food-only figures are unchanged (no behaviour change beyond the fix).

## Owner decisions that shaped this (2026-10-02)

| Question | Answer |
|---|---|
| Water units and logging | **ml, with a one-tap standard glass** plus an "other amount" option. The glass is the user's own water drink's volume |
| Water target | **Keep 2000 ml for both users**; it stays a per-user editable field (`daily_water_goal_ml`) |
| Starter Tea/Coffee/Water drinks | **Not provisioned.** The quick selector shows the user's own drinks, and prompts them to add one when they have none. Existing drinks (including any "Water" drink) are preserved and untouched |
| Bank reset | **Manual.** There is no automatic reset; the existing `bank_start_date` setting is the "start fresh from today" control and setting it to today resets the running balance to zero without touching history |

These are recorded in the vision document as decisions 15–17.

## Verification

- Go: `go build ./...`, `go vet ./...`, `go test ./...` — includes new bank regression, water,
  drinks-handler and migration tests.
- Frontend: `npm run lint && npm run typecheck && npm test` (24 tests) and `npm run build:preview`.
- Manual (Arena sandbox, real server): create drinks, mark one as water, log entries with and
  without a volume override, read `/api/water` and `/api/bank` back; `water_entries` gone on a
  fresh database; the legacy `0 / 2000 ml` line now renders the derived figure.
