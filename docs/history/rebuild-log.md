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
