# Vision & Open Questions — the "grill me" document

| Field | Value |
|---|---|
| **Status** | 🟡 **LIVE DISCOVERY** — the working list of things we do not yet know. Answers are recorded in [Decisions so far](#decisions-so-far) |
| **Started** | 2026-10-02 |
| **Owner** | @dougalbob |
| **Purpose** | Get to a shared understanding of what cals should *become* before deciding what to rebuild and in what order |
| **Related** | [`../architecture/frontend-strategy.md`](../architecture/frontend-strategy.md), [`../architecture/local-development.md`](../architecture/local-development.md), [`metrics-evidence.md`](metrics-evidence.md) (working research for Phase 14 Metrics) |

**How to use this.** Answer in any order, in any level of detail — including "don't know yet" and "that's not important". Sections marked ✅ are settled; the rest are open. Anything answered is recorded in one of the dated decision tables at the end of this document (currently decisions 1–88). This document records *why*; **current status lives in [`CURRENT_STATE.md`](../CURRENT_STATE.md)** and the dated story in [`../history/rebuild-log.md`](../history/rebuild-log.md).

---

## A. Who uses it, and how — ✅ answered

**Answered (2026-10-02).** Two users: **your wife and you** (you'll start using it at some point).

Identity works like this: **Cloudflare Access with an email rule**. The device is signed into Google, Cloudflare passes the email to the app, and the app shows that person's data. **There is no in-app login page**, and the rebuild must not introduce one.

That is already how the backend behaves — `users` is keyed by email and an account is auto-created on first request — so this is a "preserve, don't invent" requirement rather than new work.

**Confirmed implications**

- Each person has their own diary, goals, water target and view. Per-user data is already supported server-side and must stay that way.
- **Your wife is the primary user today.** Her daily flows — logging food and hitting her water target, on her phone — are therefore the flows that matter most. That should drive the priority order in Phases 12–13.
- `DEV_MODE` must be able to **pretend to be either person**, or her screens can't be tested locally. See [`local-development.md`](../architecture/local-development.md).
  **Done (2026-10-02):** the opt-in `DEV_IDENTITY_SWITCH` (requires `DEV_MODE`) lets either existing user be picked from `/dev/identity` or `?as=<email>` on the LAN-only dev container — see [`dev-identity-switch.md`](../architecture/dev-identity-switch.md).

**Still open**

- ~~**Does either of you ever need to see the other's day?**~~ **Answered (2026-10-03, decision 45): not as a household view — via an admin role.** The owner needs to see the household data far more than his wife needs to see his: he has almost no data under his own profile, so he "cannot tell how the app is performing unless I borrow my wife's phone". The answer is therefore an **admin flag on the owner's user record plus a "Swap user" control with full read/write access**, not a read-only household screen. That also settles the unused `GET /api/users` endpoint: it becomes the authenticated user list behind the admin capability rather than an exposed curiosity. See the [admin role section](#admin-role-and-swap-user-2026-10-03) for the design and its guardrails.
- **What would she want that isn't in the app today?** She is the real user — worth asking her directly rather than guessing on her behalf.

## B. Water — ✅ answered ("both"), with one design decision to settle

**Answered (2026-10-02): both.** Water is logged as a drink *and* shown as a dedicated daily target alongside the calorie ring.

**Current state, restated because it is genuinely messy** — there are three half-built representations:

| Where | State |
|---|---|
| Diary screen | Shows "Water 0 / 2000 ml" — **hard-coded to 0**, never updated by any code. Has never worked |
| `water_entries` table | Exists in the schema, with **no handlers and no endpoints** — dead |
| `drinks` table | Ships a 0 kcal "Water" drink, so water can also be logged as a drink |

**The design decision that matters:** if water is both a drink and a target, there must be exactly **one** source of truth, or the two will drift — which is precisely how the current hard-coded `0 ml` bug came about. Proposed model:

- `drinks` gains a flag (e.g. `counts_toward_water`) so Water, Squash and Tea can all contribute.
- The **water target is derived from drink entries** carrying that flag — one number, one place.
- The unused `water_entries` table is then either dropped or repurposed as that same store. It must not become a second ledger.

**Answered (2026-10-02):** water is shown and logged in **ml** with a **one-tap glass** plus an
"other amount" entry; the glass size is the user's own water drink's volume. The **target stays
2000 ml for both users**, is per-person in the schema and remains editable in Settings.

**Still open**

- **Reminders** if she is behind, or purely a visual target to fill?
- Does water belong in the weekly/monthly stats, or is it a daily nudge only?

## C. Drinks and alcohol — ✅ answered

**Answered (2026-10-02): drinks are user-defined**, with each drink's own calorie and typical-volume values. No ABV maths or beverage database. The owner has also confirmed that **drink calories count towards the calorie bank**; this is a settled product decision, although the current Go bank calculation still needs the Phase 12 code fix and regression test.

### Headline Diary interaction: quick drinks

The Diary must retain a fast, familiar quick-add interaction like the current build: a quick drink selector for **Tea, Coffee and Water**, with a direct add action. Those choices must use the signed-in user's drink definitions, including that user's volume and calorie values; do not hard-code nutrition values into the UI. The existing decision against invented default drinks remains in force. Whether Tea, Coffee and Water should be provisioned as editable starter templates for brand-new users, or shown after the user creates them, remains an implementation detail to settle before Phase 12.

**Implications**

- Do not auto-create generic drink defaults for new users. Preserve existing saved drinks; users can define drinks with a name, icon, typical volume and calories. **Settled (2026-10-02, decision 16): nothing is provisioned** — the quick selector lists the user's own drinks and points to Settings when there are none. Existing drinks (including a drink named "Water", which the migration flags as counting towards water) are untouched.
- The quick selector is a required Diary feature, not a passive drinks summary. It must make Tea, Coffee and Water quick to add using user-specific drink definitions.
- Drink calories count in the daily total **and** the cumulative calorie bank. The current `internal/handlers/bank.go` still sums only food diary entries; Phase 12 must correct this with a regression test before the new Diary is accepted.
- Adding or configuring a drink must stay quick enough to do mid-evening.

**Still open**

- Should a drink optionally attach to a **meal** (wine with dinner), or stay in its own section? It is separate today.
- Do you want **alcohol units** (UK 14/week) tracked, or is the calorie figure sufficient?
- Should **0 kcal drinks** (water, black coffee) appear in the calorie ring at all, or only in the water/fluids view?

## D. The calorie bank

The bank is the most distinctive feature of cals. It runs from a `bank_start_date` (configurable) and compounds: budget minus consumed, carried forward, with today's available allowance currently sized to goal + bank. **Drink calories are confirmed as consumption and reduce the bank, just like food calories.**

### Bank-ring presentation (2026-10-03)

The owner approved separating the two stories shown by the Home and Diary rings: the **outer ring** visualizes the cumulative bank *(the windowed bank once decision 66 is implemented)*, while the **inner ring** continues to show today's calories against the daily goal. Until Phase 15 Settings, the display limits are fixed at +2,000 kcal and -2,000 kcal: +1,000 fills half green, -650 fills about one third red, and balances at or beyond either limit fill the outer ring completely. The exact balance remains visible even when the arc is capped; these boundaries affect presentation only, never the bank maths.

**Direction (decision 28, 2026-10-03):** both arcs begin at 12 o'clock, but a surplus grows **clockwise** (green) and a deficit grows **anticlockwise** (red), so the sign of the balance is visible from the shape alone rather than from colour alone. Implemented; it changes no figure and no maths.

Phase 15 will make the positive-bank cap and deficit magnitude independently adjustable per user, defaulting to 2,000 kcal each. Persist the settings through the user's API/schema so they follow the user across devices, not in browser-only storage. This is a narrow backend addition to the otherwise frontend-only rebuild.

The current grey arc at a large deficit is explained by the old outer ring dividing by `today_available`: once that value is negative, progress clamps to zero and the arc has no visible length. The fixed-range ring currently uses the signed cumulative `bank_balance` directly. Decision 66 changes what `bank_balance` *means* (a windowed figure rather than a day-1 accumulation) without changing how the ring draws it.

### Proposed lookback window — 2026-10-03, **replaced by decision 66 (2026-10-04)**

The owner has suggested that the outer ring represent a recent rolling balance rather than all time since `bank_start_date`, tentatively the last 30 completed days, with the lookback length adjustable per user — settled on 2026-10-03 as decision 44: the window is user-definable, and “no window” means cumulative from day 1.

> **⚠️ Decision 44 is superseded on two points by decision 66 (2026-10-04), after the owner's further
> research.** The original recommendation below — a separate display metric for the ring, with the
> cumulative day-1 figure kept everywhere else — **is no longer the plan**:
>
> 1. **The window is the bank, everywhere.** The Banked/Deficit tile, `today_available` (goal + bank)
>    and the ring all use the last N completed days. `bank_start_date` becomes the floor of the
>    window rather than its starting point. The owner's reasoning: a deficit or credit accumulated
>    since day 1 is not a meaningful figure to steer by.
> 2. **The default window is 14 days, not 30**, with presets of 30 / 14 / 7 / All time plus a custom
>    value in Settings.
>
> What decision 44 keeps: the window is **user-definable**, “All time” remains available as an
> explicit choice (it reproduces today's behaviour), the maths covers **completed days** and includes
> **both food and drink** calories, and Phase 14 computes it while Phase 15 adds the setting.

This is not already implemented: the existing `GET /api/stats/bank?days=30` returns 30 dated snapshots, but each snapshot is cumulative from `bank_start_date`, not a rolling-window total. It also currently omits drink calories. Schedule a tested rolling calculation and food+drink consistency with Phase 14 Metrics, then make the lookback per-user and editable with the ring limits in Phase 15 Settings. ~~The 30-day default and exact settings range remain to be confirmed during that design.~~ **Settled by decision 66: 14 days by default, presets 30/14/7/All time plus a custom number of days.**

1. ~~**Does it ever reset?**~~ **Answered (2026-10-02, decision 17): manual only.** No automatic reset; the existing `bank_start_date` setting in Settings is the "start fresh from today" control, and it resets the running balance without touching history.
2. **Should exercise credit the bank?** **Deferred by the owner (2026-10-03): not now.** Google Fit steps keep syncing and stay informational (Metrics), with no effect on the bank maths. Revisit as its own decision; "eat back your steps" is a common source of drift, and a future version could credit only steps above a daily floor.
3. ~~**Should the bank be per-user, or shared as a household?**~~ **Answered (2026-10-03, decision 43): per person, as now.** Each of you keeps your own bank, goals and history. Seeing the other person's numbers is handled by the admin role (decision 45), not by merging the banks.
4. ~~**What should a day with no logging at all count as**~~ **Answered (2026-10-03, decision 42): no data — the day is excluded from the bank.** It neither adds the daily budget nor removes consumption, so an unlogged day is a wash rather than an inflated bank. This is a change from today's behaviour (which counts it as zero consumed) and lands in Phase 14. Because the usual cause is human oversight, the owner wants a future **Issues** feature — a bell on Home that raises "you didn't log this day" and asks the user to resolve it — so the exclusion is visible rather than silent.
5. ~~**Would an average be more useful than a running total**~~ **Answered (2026-10-03, decision 44, revised 2026-10-04 by decision 66): keep the running total, but over a user-selected window — and that window is now the bank, everywhere.** The window is user-definable (**14 days by default**; presets 30 / 14 / 7 / All time plus a custom value), and “All time” reproduces today's day-1 accumulation. The Banked/Deficit tile, `today_available` and the ring all read the same windowed figure. Phase 14 computes it; Phase 15 adds the setting.

## E. Daily logging ergonomics

This is where a rebuild earns its keep, so it is worth being specific about the friction.

6. ~~**What do you (or your wife) log most days that takes the most taps today?**~~ **Answered (2026-10-03, decision 49): nothing else needs changing — only finding historic dates.** Aside from reaching an earlier day's entries, the owner is happy with the current logging flows. The Diary's date navigation is currently **‹ / › day-stepping** (`/diary/:date`), so a day three weeks back is twenty taps; the owner intends to solve it with a **calendar** (see [the calendar idea](#the-calendar-idea--diary-date-navigation-2026-10-03)). This is the last known logging-friction item.
7. ~~**Would "same as yesterday", favourites, or recently-logged shortcuts help?**~~ **Answered (2026-10-03, decision 50): none required.** No shortcut feature is to be built; the current flows are fast enough.
8. ~~**Are the four meal slots right**~~ **Answered (2026-10-03, decision 51): yes — breakfast, lunch, dinner and snacks stay exactly as they are.** No rename and no fifth slot.
9. **Recipe diary portions — answered 2026-10-03.** A user's usual amount is personal and may differ from another person's; offer a remembered usual weight per user and recipe (for example, 200 g), editable in grams, plus fractions of the whole cooked recipe for visually served dishes (for example, ¼ of a lasagne). All choices convert to grams; diary entries continue to store only grams and the nutrition snapshot. The per-user preference is separate from diary history. This resolves whether recipe logging should be weight-based or serving-based: support both, without assuming every user's portion is the recipe's `serves` value.
10. **How often do you log away from home** — pub, restaurant, takeaway — where you're estimating rather than weighing? How is that handled today? *(Still open. Worth an answer before the Diary is treated as finished, since takeaway food is already in the fixture data and "eating out" is where the least precise entries come from.)*
11. ~~**Barcode scanning**~~ **Answered (2026-10-03, decision 52): not now.** Not planned in the near future; it may be revisited **after a full stable release**, but it is not part of the rebuild. The food repertoire plus FatSecret search is enough.

### Phase 13 input: serving-based food quantities (owner request, 2026-10-03)

The owner wants to log a real-world unit such as **“1 bag of Hoops = 25 g”** instead of translating every portion into grams first. Foods already support an optional primary `serving_name` / `serving_grams`, and FatSecret foods may have multiple gram-backed `food_servings`. Diary entries store grams and a nutrition snapshot; `GET /api/diary` did not return serving metadata for Edit at the time of writing — that gap has since been closed (decision 29; the entry response now carries `food_serving_name`, `food_serving_grams` and `food_servings[]` without changing what the row stores).

**Agreed Add/Edit interaction (2026-10-03):** show an explicit serving/grams mode toggle. Start in serving mode when the food has a reliable serving choice; otherwise start in grams mode. Always allow switching to grams, convert every choice through grams, and show the resulting grams and live kcal. Never invent a unit or conversion. Add optional serving metadata to the diary response so Edit can offer the same choices without changing the diary storage model.

**Serving catalogue recommendation:** keep FatSecret's gram-backed options and support several additional named, gram-backed measures per food (for example, a household's regular “bag” or “slice”), rather than limiting users to one custom serving. Keep these measures attached to the food, not as ambiguous cross-food conversions such as a universal “mug”; this fits the existing shared food catalogue and lets the two household users select the same known measures. The existing `food_servings` table can represent multiple choices; `serving_name` / `serving_grams` can remain the preferred primary choice. Grams remain canonical. This expands the food editor/API, but should not require a diary-schema change.

**Agreed recipe-to-Diary direction (2026-10-03):** support both a per-user, per-recipe usual quantity in grams and fractions of the entire cooked recipe (e.g. ¼, ½, ¾, all), with direct gram editing always available. Remembering a usual quantity requires a small user-scoped recipe preference; it must not be stored in the shared recipe's `serves` field or in diary rows. Keep the recipe's `serves` value as recipe-level yield information, not as an assumption about a particular user's plate. Recipe servings and ingredient selections still convert to grams and preserve the logged nutrition snapshot.

**First-use and update behavior (owner choices, 2026-10-03):** if no usual amount is saved for a recipe, do not preselect a guessed quantity; let the user choose a whole-recipe fraction or enter grams. After the first successful log, remember that amount as their usual for this recipe. On later logs, prefill the saved usual; changing it for today's entry is one-off and must not overwrite the usual unless the user explicitly chooses **“Make this my usual.”** This supports occasional larger or smaller portions without losing the person's normal amount.

**Still open for Phase 13 design**

- If two people need different customary conversions for the same food, is a shared per-food list sufficient, or will genuinely personal per-user food measures be needed? Start with shared per-food choices; only add per-user overrides if testing exposes a real need.
- Validate on phone that the serving/grams toggle, multiple serving choices, whole-recipe fractions, and editable grams remain clear without crowding the Add/Edit sheets.

## F. Nutrition targets

12. **Are the current traffic-light rules right?** (Protein g/kg bodyweight, fibre 30 g, fat <35%, carbs 45–65%.)
13. ~~**Do you want more than macros and fibre**~~ **Answered (2026-10-03, decision 47): yes, the full set — but each nutrient is user-selectable.** Macros and fibre stay on by default; the user ticks further nutrients (for example **saturated fat**) in a Settings sheet, and the app then **audits the existing foods and reports the gaps** ("these 23 foods have no saturated-fat values") so the data can be filled in rather than silently missing. This is a settings-driven, incremental version of "a richer data source": nothing is turned on that the household's data cannot support. Full design, including the audit's exact behaviour and how partially-covered nutrients should affect the traffic lights, is recorded in [Tracked nutrients and the missing-data audit](#tracked-nutrients-and-the-missing-data-audit-2026-10-03).
14. **Is the 7-day rolling window right**, or would a 28-day trend be more useful?
15. **Should targets change with activity** (steps, training), or stay static?

## G. Recipes, Mealie and external data

16. ~~**Is Mealie the long-term home for recipes**, with cals importing one-way?~~ **Answered for the current rebuild (2026-10-03): Mealie import is not being pursued.** The existing search/import code is legacy-only and will not be ported into the React Recipes experience. Importing depends on parsing an external service's recipe payload, which could break if Mealie makes significant changes; imported ingredient lines are also text-only and are not matched to cals foods. The legacy feature may disappear when the old UI is removed unless it is separately reconsidered.
17. ~~**Would you want changes made in cals pushed back to Mealie?**~~ **Deferred:** no Mealie sync or write-back work is planned while the integration is not being pursued.
18. **FatSecret is IP-whitelisted and used only for food search.** Keep it long-term, or is the local food database enough for your regular foods?
19. **Would a proper UK food database import** (e.g. McCance & Widdowson / CoFID) be more useful than a commercial API?

## H. Devices, form factor and deployment

20. **Phone-first, or desk-first?** The current design is mobile-first; is that right?
21. ~~**Do you need offline logging?**~~ **Answered (2026-10-03, decision 53): no.** Neither offline logging nor an offline read requirement is needed — logging happens where there is a connection. Phase 15's PWA work therefore covers **installability and a clean service worker only**: no write queue, no sync-conflict handling, and no cached-data promise. That removes the riskiest part of the phase.
22. ~~**General notifications and reminders**~~ **Answered (decision 46): none for logging or water; a weekly report is wanted.** No general logging nudges, no water nagging, and no push notifications. Decision 87 later adds a narrow future reminder for body measurements after more than four weeks without an entry; its delivery channel and repeat behavior remain open. The weekly report (what the week's numbers looked like, how the bank moved) belongs in Phase 14 if it fits naturally, otherwise it is its own small feature set. Note the deliberate contrast with decision 42's future **Issues** bell: that is an in-app, resolve-it item on Home, not a notification to your phone.
23. **Anything needed on a watch, or via Siri/shortcuts?** *(Still open — no requirement recorded either way.)*
24. **Do you keep any other trackers** (Apple Health, a smart scale, Strava)? Integration, or complexity you don't need? *(Still open — note Google Fit steps already sync and, per decision 48, do not affect the bank.)*
25. ~~**How is `appdata/cals` backed up today?**~~ **Answered (2026-10-03, decision 54): it is backed up.** The owner confirms a backup of the household's live data exists, which satisfies the "check before a structural change" rule in [`data-copy-warning.md`](../architecture/data-copy-warning.md). Recording the **location and cadence** in that document is still worth doing so a future session does not have to ask.

## I. The rebuild itself

26. **What is the single most annoying thing about cals today?** If only that were fixed, would the rebuild still be worth it?
27. **What must never change or be lost?** (My assumption: the bank, your history, the recipe maths. Tell me if that's wrong.)
28. **Visual direction** — **settled in principle:** materially improve the UI and day-to-day experience; UI improvement is a headline requirement, not an optional benefit of changing frameworks. How much to preserve the existing visual language versus redesign remains open, and each screen should be judged in a real mobile preview before cutover.
29. **Timescale** — "a few weeks of evenings", "a background project over months", or "when it's done"?
30. **How involved do you want to be** in reviewing each phase, versus "show me when it looks finished"?

---

## Decisions so far

| # | Date | Decision | Source |
|---|---|---|---|
| 1 | 2026-10-02 | Drink calories **count** towards the calorie bank (implemented in Phase 12 with a regression test) | Owner |
| 2 | 2026-10-02 | Alcohol calories use a **sensible median per drink type**, not a full ABV/beverage database | Owner |
| 3 | 2026-10-02 | Water is a **special case with its own target**, not merely a drink | Owner |
| 4 | 2026-10-02 | Local development uses a **`DEV_MODE` environment variable** plus a **copy of the data** in `appdata/cals-dev` | Owner |
| 5 | 2026-10-02 | `ai_contextual_docs/context.txt` is **legacy**; `docs/` is the source of truth | Owner |
| 6 | 2026-10-02 | Two users (wife + owner), identified by **Cloudflare Access email rule**; **no in-app login page** | Owner |
| 7 | 2026-10-02 | Water is **both**: logged as a drink *and* shown as a dedicated daily target — with a single source of truth | Owner |
| 8 | 2026-10-02 | Drinks are **user-defined with their own calorie figures**; no generic seeded presets or ABV maths. The Diary must provide a familiar quick selector for **Tea, Coffee and Water**, backed by the user's drink definitions; starter-template provisioning remains to be settled before Phase 12 | Owner |
| 9 | 2026-10-02 | What impressed on the other Go rebuild was **the frontend and how it felt** — so the **Go backend does not need rewriting**; the frontend-only strategy stands | Owner |
| 10 | 2026-10-02 | **UI/UX improvement is a headline product requirement.** A framework migration or functional parity alone is not success; the new screens must feel materially better for real daily use, especially on a phone | Owner |
| 11 | 2026-10-02 | **Phase 11 is authorized.** Keep later phases and production cutover gated by phase-level review; no big-bang rewrite | Owner |
| 12 | 2026-10-02 | **The V2 development line reports application version `2.0.0`** (bumped from `1.7.0` in `main.go`, `app.js` and `sw.js`), so the app itself shows that it is the version-2 code from `cals-dev`; `main` stays on `1.7.0` until promotion, and each development image is identified by its tag (`v2.0.0-dev-rcN`) | Owner (Arena session, PR #8) |
| 13 | 2026-10-02 | **The DEV identity switch is adopted**: `DEV_IDENTITY_SWITCH=true` (requires `DEV_MODE=true`) lets a developer pick any **existing** user from `/dev/identity` or `?as=<email>`, remembered in a cookie, on loopback/private peers only. Never enabled on the Cloudflare-routed container; LAN-only dev container uses host networking, `BIND_ADDRESS` = Unraid LAN IP, `PORT=8152` and its own data copy | Owner (Arena session) |
| 14 | 2026-10-02 | **Data copy warning recorded** ([`data-copy-warning.md`](../architecture/data-copy-warning.md)): V2 is installed and Cloudflare-routed on `8151`, running on a database copied the morning of 2026-10-02, so the household's new data now lands in `/mnt/user/appdata/cals-dev-v2` and diverges from V1. That appdata is **live data, not disposable**; only the `cals-dev-identity` dev copy may be broken | Owner (Arena session) |
| 15 | 2026-10-02 | **Water is logged in ml with a one-tap glass** (size = the user's own water drink) plus an "other amount" entry; the target stays **2000 ml for both users** and remains per-user and editable | Owner |
| 16 | 2026-10-02 | **No starter drinks are provisioned** for new or existing users. The quick Tea/Coffee/Water selector uses each user's own drink records and prompts them to create one when the list is empty; the migration marks existing drinks literally named "Water" as counting towards water | Owner |
| 17 | 2026-10-02 | **The calorie bank has no automatic reset.** `bank_start_date` (already editable in Settings) is the manual "start fresh from today" control; history is never rewritten | Owner |

Decisions 1–3 and 6–11 guide feature behaviour and delivery. Decision 10 is the user-facing success criterion; decision 11 authorizes the foundation phase, not an unreviewed production cutover.

---

## Where to go next

**Where the project actually is right now lives in [`CURRENT_STATE.md`](../CURRENT_STATE.md)** — phase
status is deliberately not repeated here, and the dated story is in
[`../history/rebuild-log.md`](../history/rebuild-log.md). This document is the *record of answers*:
sections A–I are the questionnaire, and the decision tables at the end are the results.

**Settled in the 2026-10-03 second and third passes (decisions 42–54):** unlogged days are excluded
from the bank (42); the bank stays per person (43); the bank window is user-definable (44) and —
since [decision 66](#bank-window-metrics-charts-and-app-polish--decisions-6673-2026-10-04) on
2026-10-04 — **that window is the bank everywhere**, defaulting to 14 days with "All time" as a
preset; cross-viewing becomes an admin role with a swap-user control rather than a
household view (45); no general logging/water reminders but a weekly report is wanted (46), with the narrow measurement-reminder exception in decision 87; tracked nutrients become
user-selectable with a missing-data audit (47); steps do **not** credit the bank for now (48); nothing
else needs fixing in the logging flows, but a **calendar** is planned for reaching historic dates
(49); **no logging shortcuts** are wanted (50); the **four meal slots stay** (51); **no barcode
scanning** for now (52); **no offline capability** is required (53); and the household data **is
backed up** (54).

**Highest-value questions still open**

1. **Away-from-home logging** (section E, question 10) — pub, restaurant and takeaway, where portions
   are estimated rather than weighed. It is the least precise data the app holds and the last
   unanswered logging question.
2. **Nutrient coverage rules** (decision 47 design) — which nutrient list to offer, and what a traffic
   light should do when the data behind it is only partly covered.
3. **Traffic-light rules and the rolling window** (section F questions 12 and 14) — whether the current
   thresholds are right, and whether the 7-day nutrition window should be longer; decision 47's new
   nutrients make this urgent.
4. **FatSecret and a UK food database** (section G, questions 18–19) — whether the commercial API stays
   long-term or CoFID/McCance & Widdowson is more useful, which decides how fillable a nutrient audit
   can ever be.
5. **Watch/Siri and other trackers** (section H questions 23–24) — no requirement recorded either way.
6. **Timescale and involvement** (section I, questions 29–30) — a few weeks of evenings or months;
   review each phase, or "show me when it looks finished".
7. **Question 26 — the single most annoying thing today** — asked at the start and never answered; now
   that the logging flow questions are settled, it is the best remaining prompt for finding work the
   plan has not anticipated.
8. **Record the backup's location and cadence** (decision 54) — the backup exists, but nobody has
   written down where it is.

## Dashboard decisions — 2026-10-03

| # | Date | Decision | Source |
|---|---|---|---|
| 18 | 2026-10-03 | Prefer a Today summary landing page rather than immediately exposing itemised meals. Four meal tiles link to the corresponding Diary section; an inner ring counts down the daily allowance independently of the bank. Water glass starts full and drains. | Owner, preview reviewed |
| 19 | 2026-10-03 | Merge water and quick drinks into one responsive card; remove duplicate standard-water add button, retain compact custom amount. Quick drink badges count daily entries; long press asks confirmation before removing the latest entry. | Owner |
| 20 | 2026-10-03 | “Let's publish” authorizes the end-to-end GitHub delivery loop: PR/checks, merge to cals-dev, development tag, image publication and verification that Unraid can Force Update. Not promotion to main or changing live data. | Owner |
| 21 | 2026-10-03 | Quick drinks: **one tap logs your usual**; a chevron on the tile opens milk/sugar for this log only. Long-press still deletes. Juice/beer/etc. have no chevron. | Owner |
| 22 | 2026-10-03 | Drink setup lives on a **My drinks** page (a profile, not a Settings section and not a fifth bottom-nav tab). Linked from the fluids card and from Settings. | Owner |
| 23 | 2026-10-03 | **The water glass is the unit tap.** Water is not duplicated in the 2×2. “+ other amount” stays. | Owner |
| 24 | 2026-10-03 | Vary sheet: milk = **none / with milk**; sugar = **0 / 1 / 2 / sweetener**. Sensible UK medians, not a beverage database. | Owner |
| 25 | 2026-10-03 | Catalog types (everyday four first, no scroll): **Coffee, Tea, Milk, Juice**, then Cappuccino, Latte, Hot chocolate, Squash, Soft drink, Beer, Wine. Nothing auto-inserted into `drinks` (decision 16 still holds). | Owner |
| 26 | 2026-10-03 | Quick drinks render as an **equal-width 2×2**. More than four: vertical scroll-snap with haptic. | Owner |
| 27 | 2026-10-03 | The calorie ring uses the **cumulative bank balance** on the outer ring, with fixed ±2,000 kcal visual limits until Phase 15; the inner ring remains today's calories against the daily goal. The exact bank value remains visible, and the gauge does not change bank maths. Phase 15 adds independent per-user limits. | Owner |
| 28 | 2026-10-03 | On the outer ring, a **surplus grows clockwise in green and a deficit grows anticlockwise in red, both starting at 12 o'clock** — the direction itself carries the sign, so colour is not the only signal. Implemented in the Phase 12 close-out PR; presentation only, no change to the bank figure, scale or maths. | Owner |

Decision 27 replaces only the outer-ring behavior in decision 18; the Today landing page and inner-ring daily-goal countdown remain. Decision 28 refines decision 27's presentation (arc start and sweep direction) without touching its scale or limits, and applies equally to Phase 14's rolling metric and Phase 15's per-user limits.

## Phase 13 recipe and quantity decisions — 2026-10-03

| # | Date | Decision | Source |
|---|---|---|---|
| 29 | 2026-10-03 | Food Add/Edit uses an explicit **serving / grams** mode. Start in serving mode when a reliable serving exists; otherwise start in grams. Grams remain available and canonical; never invent a conversion. | Owner |
| 30 | 2026-10-03 | For flexibility, support multiple named gram-backed units per food alongside FatSecret's units. Reuse the existing per-food serving structures; keep custom choices attached to a food rather than creating universal household conversions (such as one generic “mug”). | Agent recommendation; owner delegated the unit-model choice |
| 31 | 2026-10-03 | Recipe logging supports both a remembered **usual grams per user and recipe** and fractions of the whole cooked recipe, with direct gram editing. Keep `serves` as recipe yield information, not an assumption about an individual user's portion; diary rows remain gram/nutrition snapshots. | Owner |
| 32 | 2026-10-03 | On first recipe log, do not guess or preselect a quantity. Let the user choose a fraction or grams; remember the first successful logged amount as their usual. Later quantity changes are one-off unless the user explicitly chooses **“Make this my usual.”** | Owner |
| 33 | 2026-10-03 | The existing Mealie search/import integration is **legacy-only** and is not being ported into Phase 13's React Recipes experience. It depends on parsing an external payload and imports text-only ingredients without cals food matching; it may disappear when the legacy UI is removed unless separately reconsidered. No Mealie sync/write-back work is planned. | Owner |
| 34 | 2026-10-03 | Recipe classification uses separate structured facets for **meal occasion** and **dish type** (for example, Lunch and Main are not alternatives). A recipe can have multiple meal occasions, such as Lunch and Snack. These are shared recipe metadata, not user-specific settings. | Owner |
| 35 | 2026-10-03 | A recipe can mark up to two **key foods** for filtering, chosen from known cals Foods rather than free-text labels. Key foods must represent foods in the recipe; text labels cannot be entered manually. | Owner |
| 36 | 2026-10-03 | Store optional **prep-to-plate total time** as an exact number of minutes. Defer labels such as “Quick” or “Low and slow” until user-defined time ranges are designed in a future phase. | Owner |
| 37 | 2026-10-03 | **Recipe favourites are per-user**, because recipes are shared but preference is personal. The favourite control uses an outlined red heart when off and a filled red heart when on. | Owner |
| 38 | 2026-10-03 | A calculated **Goodness rating is not part of Phase 13**. Revisit it as a separate future design question with a transparent method and suitable nutrition data; fat percentage alone is not a sufficient basis for the score. | Owner |
| 39 | 2026-10-03 | Use `docs/product/recipeUX-example.jpg` as a **strong visual direction, not a rigid specification**: a prominent recipe photo, legible ingredient quantities and calories, a clear total, and an obvious add action. Recipe tags sit thoughtfully over the photo near the lower left; the favourite heart is at the upper right. | Owner |
| 40 | 2026-10-03 | **Next Phase 13 slice (owner request):** every Diary meal card gains a **+ Add recipe** action beside **+ Add food**, on the same row, so a recipe can be logged without leaving the meal. Starting it from a meal card pre-selects that meal in the portion sheet (for example, **+ Add recipe** on Lunch opens the sheet with Lunch chosen). Decisions 29–32 are unchanged: fractions of the whole cooked recipe, direct gram editing, no guessed first quantity, and the remembered usual. | Owner |
| 41 | 2026-10-03 | **Recipe tags become filters (owner request):** the tags already shown on a recipe card — meal occasion, dish type and known-Food key foods — are tappable. Tapping one filters the catalogue to the recipes carrying it; tapping a second tag **narrows further, requiring every selected tag** (AND), which is the Chicken → Chicken & Mushroom Pie → Mushroom flow the owner described. Selected tags stay visible as a “Filtering by” row with per-tag removal and **Clear tags**; the facet dropdowns remain in step with the tapped tags as two views of one selection. The selection lives in the URL (`/recipes?tags=…`), so it survives a reload and a trip into a recipe. On a recipe detail page a tag opens the catalogue already narrowed by it. The tag vocabulary itself does not change: still meal occasion, dish type and up to two known-Food key foods — no free-text tags (decision 35 stands). | Owner |

> **Authorized Phase 13 safety slices (2026-10-04):** the React app now edits existing shared recipes
> in place with a fixed name and saved Diary snapshots; correcting food nutrition also refreshes every
> dependent recipe definition transactionally, including archived recipes. The implementation and
> regression tests were accepted by the owner in the Arena preview on 2026-10-04 and published as
> `v2.0.0-dev-rc19` after PR #44 passed validation; these changes are included in rc22, rc23 and
> rc24. The owner reports rc24 installed and new recipe creation working well. Decision 82's optional,
> uncropped photo upload/replacement and decisions 83–85 (Today/Diary fill alpha 25%/5%, Own creation
> recipe-details filter checkbox, and Diary meal-entry delete confirmation) were published in
> `v2.0.0-dev-rc25` (PR #56). The owner signed off all published RC candidates through rc25 on
> 2026-10-04, closing Phase 13 acceptance. The last reported Unraid installation is now **rc27**
> (installed and signed off on 2026-10-05), so every published checkpoint is installed; cropping
> remains deferred. Current status is tracked in
> [`CURRENT_STATE.md`](../CURRENT_STATE.md). See
> [Adapting an existing recipe](#adapting-an-existing-recipe--decisions-5558-2026-10-03) and
> [Retiring recipes and correcting foods](#retiring-recipes-and-correcting-foods--decisions-5961-2026-10-03).

**Phase 12 close-out (2026-10-03).** The Diary's logged-quantity **Edit** action is implemented: the
weight of a logged food or recipe can be corrected, with a live calorie preview, and the entry's own
saved calories/protein/carbs/fat/fibre are rescaled by the new-to-old ratio so the saved snapshot —
not a possibly-changed food definition — is what changes. Zero and negative weights are refused. No
schema or API change was needed (`PUT /api/diary/{id}` already existed).

### Implemented — Add recipe from a Diary meal card (owner request, 2026-10-03)

Decision 40 shipped in rc15: every Diary meal card gained **+ Add recipe** beside **+ Add food**, with
the originating meal carried into the existing recipe portion sheet. The sheet keeps the date, meal,
fractions, direct gram editing and remembered-usual behaviour from decisions 29–32; diary rows still
store grams and their nutrition snapshot.

The owner then answered the chooser question in decision 64: use the **Recipes catalogue**, not a
separate modal picker, so its search, favourites, archived handling and tag filters remain available.
The rc17 follow-up passes meal and date in the URL (`/recipes?add-to=<meal>&on=<date>`), lets the user
log from the matching recipe card, and returns to the originating Diary day after logging. Current
implementation/release status is in [`CURRENT_STATE.md`](../CURRENT_STATE.md).

### Implemented — tags filter the list in place (owner request, 2026-10-03)

**Decision 41.** Before this slice the tags on a recipe card were decoration: they told you what a
recipe was, and filtering meant opening a collapsed panel and choosing from three dropdowns, one
facet at a time. Now the tags themselves are the filter, which is the behaviour the owner described:

| Step | What happens |
|---|---|
| Open Recipes | Every recipe is listed, exactly as before |
| See a recipe tagged **Chicken** and wonder what else is chicken | Tap the tag on the card — the list narrows to recipes carrying it, and the tag highlights on every card that still matches |
| In that list, open **Chicken & Mushroom Pie** and want both | Tap **Mushroom** on that card — the list narrows again, because a recipe must carry **every** selected tag to stay visible |
| Change your mind | Tap a highlighted tag again, remove one tag in the “Filtering by” row, or press **Clear tags** |

And the small details that make it hold together:

- **The selection is visible.** A “Filtering by” row lists the active tags as chips, each removable, with a plain-language note that every tag has to match. The results line says “2 of 4 recipes match” rather than leaving the shorter list unexplained.
- **Nothing dead-ends.** If a combination matches nothing, the empty state says so and offers **Clear filters**; the filter row is still there to unpick one tag at a time.
- **The dropdowns did not go away.** Meal occasion, dish type and key food remain available for browsing, and they read the same selection the chips do — choosing a facet replaces that facet's tags, and tapped tags set the matching dropdown. The dropdown labels itself **“Multiple — see tags”** when a facet has more than one tapped value, so the two controls never silently disagree.
- **The filter is in the URL** (`/recipes?tags=food:5,food:25`). A reload, the phone's back gesture and a tap into a recipe all keep it, and the recipe page's **← Back to recipes** returns to the same filtered list. On the detail page the tags are tappable too: tapping **Mushroom** there opens the catalogue narrowed by it.
- **The vocabulary stays controlled.** The original structured tags are meal occasion, dish type and up to two known-Food key foods (decisions 34–35); decision 79 adds one controlled shared **Own creation** origin marker. No free-text tags were introduced.

**Still open / for the owner's review**

- **Same-facet taps always AND.** Two meal-occasion tags (Lunch **and** Dinner) is a legitimate request that usually matches nothing, and is currently the same dead end as any other empty combination. If tapping tags within one facet should widen instead (“Lunch **or** Dinner”), that is a small change with a real behavioural consequence — worth deciding after using it.
- **Should the tap-to-filter idea spread?** The same tokens exist in the Diary and the Foods list. The Recipes catalogue is the natural first home; nothing else has been changed.
- **Touch target.** The chips over the photo stay small so they do not crowd the image; their tap area is expanded invisibly, but this is exactly the kind of thing to judge at phone size on the LAN dev container, not on a laptop.


## Second discovery pass — 2026-10-03

| # | Date | Decision | Source |
|---|---|---|---|
| 42 | 2026-10-03 | **An unlogged day is excluded from the bank** — it counts as “no data”, not as zero consumed, so a missed day neither banks the daily budget nor spends anything. Unlogged means no food, recipe or drink entries for that date; a day with any logging counts normally. Because the usual cause is oversight, the owner wants the exclusion to be **visible** rather than silent (see the [Issues bell](#the-issues-bell-proposed-future-feature)). | Owner |
| 43 | 2026-10-03 | **The bank stays per person.** No shared household bank; seeing the other person's numbers is handled by the admin role (decision 45), not by merging the maths. | Owner |
| 44 | 2026-10-03 | **The ring's window is user-definable**, generalising the earlier 30-day lookback idea: the user picks a rolling window, and **“no window” means the cumulative figure from day 1 to today**. The Banked/Deficit tile always shows the exact cumulative balance. Phase 14 computes the metric; Phase 15 adds the setting. **Superseded in part by decision 66 (2026-10-04): the window is the bank everywhere, it defaults to 14 days, and “All time” is a preset rather than the absence of a window.** | Owner |
| 45 | 2026-10-03 | **An admin role plus a “Swap user” control**, rather than a household view. The owner needs to browse the household's data because his own profile has almost none; the flag grants **full read/write** as the other user, with the app making it unmistakable that you are acting as someone else. `GET /api/users` stops being an exposed curiosity and becomes admin-only. | Owner |
| 46 | 2026-10-03 | **No general notifications or reminders** — not for logging, not for water. Instead the owner wants a **weekly report**: an in-app recap of the week's numbers, ideally part of Phase 14's Metrics redesign and its own small feature set if it does not fit. **Decision 87 later adds a narrow exception for a future body-measurement reminder after more than four weeks; it does not authorize push notifications or general nudges.** | Owner; narrowly qualified by decision 87 |
| 47 | 2026-10-03 | **Tracked nutrients become user-selectable.** Macros and fibre stay on by default; further nutrients (for example saturated fat) are ticked on in a Settings sheet, and the app **audits the existing foods and reports which ones have no values for a newly enabled nutrient** so the gaps can be filled rather than silently ignored. The nutrient list and the audit's exact behaviour are Phase 14 design work (this is an additive API/schema exception, like the Phase 15 settings work). | Owner |
| 48 | 2026-10-03 | **Exercise does not credit the bank for now.** Steps keep syncing and stay informational; “eat back your steps” is deferred, not rejected, and revisiting it must be its own decision with tests. | Owner |
| 49 | 2026-10-03 | **No further logging-ergonomics work is needed.** The owner is content with the current add/edit flows; the only friction left is **finding historic date entries**, which he intends to solve with a **calendar** (see [the calendar idea](#the-calendar-idea--diary-date-navigation-2026-10-03)) rather than by changing how things are logged. | Owner |
| 50 | 2026-10-03 | **No logging shortcuts.** "Same as yesterday", favourites/recents and saved meals are *not* required — the current flows are fast enough. This closes section E's shortcut question; do not build one speculatively. | Owner |
| 51 | 2026-10-03 | **The four meal slots stay as they are** — breakfast, lunch, dinner and snacks. No rename, no fifth slot, no "drinks" slot. | Owner |
| 52 | 2026-10-03 | **Barcode scanning is not planned.** It is not part of the rebuild and may be revisited after a full stable release; FatSecret search plus the local food catalogue is sufficient for now. | Owner |
| 53 | 2026-10-03 | **Offline capability is not required** — no offline logging, no queued writes, no offline read promise. Phase 15's PWA work is limited to installability and a clean service worker; do not build a sync queue. This removes the phase's largest technical risk. | Owner |
| 54 | 2026-10-03 | **The household's live appdata is backed up.** The owner confirms a backup exists, satisfying the pre-change check in [`data-copy-warning.md`](../architecture/data-copy-warning.md); the backup's **location and cadence** should still be recorded there so no future session has to ask. | Owner |

Decision 42 changes behaviour that exists today, so it is a Phase 14 correctness item, not just a
display preference: the rolling window and any cumulative figure must agree about which days count,
and both need tests for a fully unlogged day, a partially logged day, and today (which is always in
progress and is never excluded).

### Admin role and swap user (2026-10-03)

**The problem.** The owner has almost no data under his own profile, so he cannot tell how the app is
behaving without borrowing his wife's phone. His wife has no corresponding need to see his day.

**The shape of the answer.**

Cloudflare Access continues to authenticate each person; cals maps the verified Access email to that
user's own account. Both emails must remain allowed by the Cloudflare policy. The Admin role is a
separate application authorization that permits an explicit acting-user switch. With only the owner's
Cloudflare identity and no app switch, cals correctly shows the owner's own account, not his wife's
history. The app's DEV identity picker is not a production substitute.

- An additive `users.is_admin` flag (default `0`), so no existing row changes meaning. **Implemented
  2026-10-04.**
- The owner has now confirmed the assignment: **he is Admin; his wife is Standard** (decision 88). The
  admin identity comes from configuration rather than a hard-coded email in the public repository:
  `ADMIN_EMAILS` / `STANDARD_EMAILS` in the appdata `.env`, reconciled into `users.is_admin` at every
  start-up (decision 89). See [`admin-roles.md`](../architecture/admin-roles.md) for the mechanism and
  its operational rules.
- A **Swap user** control using the existing `/dev/identity` pattern, but production-appropriate:
  authenticated, admin-only, **server-side** (a cookie or header the API validates on every request —
  never a client-side claim), loopback restriction **not** applied (it must work through Cloudflare),
  and with a persistent, obvious banner such as “Viewing as Sarah — return to my account”.
- **Full read/write**, per the owner: entries written while swapped belong to the person being acted
  as, exactly as if they had logged them. There is no second data model.
- `GET /api/users` returns the user list **only to an admin**; for everyone else it stays
  unavailable. That removes the current "unused endpoint for viewing others' data" exposure.
  **Done 2026-10-04**: it answers `403` for a Standard user.

**Open for that design session**

- An audit trail: the diary schema has no "entered by" concept, and adding one is a storage change.
  For a two-person household, a log line plus honest diary timestamps is probably enough — worth
  confirming rather than assuming.
- Whether the non-admin user should ever be told that an admin edited their data (leaning: no, and
  not worth the complexity).
- Whether the admin can edit **settings** (targets, drink definitions) as the other user, or only
  diary data. Leaning: yes, settings too — it is the same "walk a mile in their shoes" need.
- How this relates to the LAN-only `DEV_IDENTITY_SWITCH` (decision 13): they stay separate features.
  DEV is a development convenience restricted to private peers; the admin role is a production
  capability tied to a real user record.

### The weekly report — 2026-10-03

No general notifications or logging/water reminders (decision 46; with the narrow measurement-
reminder exception in decision 87), but a report is wanted. Recommended shape: a **report card view** in
Metrics for a chosen week (the current week and the previous one at minimum), showing calories against
goal, how the bank moved, water, weight change, the nutrition traffic lights, the best and worst days,
and **which days were excluded as unlogged** (decision 42) so the numbers are never quietly
unexplained. Keep it in-app; there is no requirement for email or push.

Open: whether the report is a fixed "last week" card or a date-range view; whether it should be
shareable/printable; and whether it waits for the tracked-nutrients work (decision 47) before adding
non-macro lines. Recommendation: build it with today's nutrients, and let enabled nutrients appear
automatically.

### Tracked nutrients and the missing-data audit (2026-10-03)

**Owner's direction:** the full set of nutrients should be available, but the individual values must
be **user-selectable** — a Settings sheet of checkboxes starting from today's macros and fibre, with
"saturated fat" as the example of something ticked on later. When a nutrient is newly enabled, the app
should **audit the current foods and say what is missing** ("these 23 food items have no saturated-fat
values") rather than displaying a silently incomplete picture.

**Recommended design points**

- Keep `nutrition_settings` as the home for thresholds and add a per-user **enabled-nutrients** set
  (a small side table, or an ordered list on the settings row). Defaults: protein, carbs, fat, fibre
  on; salt, sugar, saturated fat, iron, calcium off.
- Add per-100 g values additively to `foods` for the new nutrients. FatSecret supplies a limited set,
  the local food editor can accept manual entry, and **nothing is inferred** — an absent value stays
  absent rather than becoming zero.
- The audit runs against **the foods the user actually logs**, not the whole catalogue: "23 of the
  40 foods you logged this month have no saturated-fat value" is actionable; "4,000 catalogue rows"
  is not. The same audit should be reachable from Settings and from the nutrient's own traffic light.
- Each gap should be resolvable three ways: fill the value in (opens the food editor), mark the food
  as "no data / don't ask again", or leave it — but the count stays visible.

**Open for the Phase 14 design session**

- The exact nutrient list. The owner asked for the full set, so the practical constraint is the data
  source: salt, sugar and saturated fat are commonly available, iron and calcium less so, and
  micronutrients rarely. Recommendation: offer what can be entered reliably and grow the list rather
  than showing lots of empty lines.
- **Coverage behaviour.** A traffic light computed from partially-covered data can mislead. Recommended
  rule: show a nutrient's traffic light only when the logged foods' coverage for that nutrient is
  above a threshold (for example 90% of what was eaten that week), and otherwise show "not enough
  data" with a link to the audit. This is exactly the sort of rule that needs the owner's eye.
- Traffic-light thresholds for the new nutrients (UK guidance suggests salt ≤ 6 g/day, free sugars
  ≤ 30 g/day, saturated fat < 10% of energy), which touches the still-open question about whether the
  current traffic-light rules are right at all (question 12).
- Whether enabling a nutrient should be blocked when coverage is hopeless, or always allowed with the
  caveat shown. Leaning: allow, warn, and keep the audit one tap away.

### The calendar idea — Diary date navigation (2026-10-03)

**Owner idea, recorded as decision 49's follow-up.** Finding a historic entry is the last real logging
friction: the React Diary navigates with **‹ / › one day at a time** (`/diary/:date`), so last
month's takeaway is twenty taps away. The owner's plan is a **calendar**: a month view you can open
from the Diary's date header, tap a day, and land on that date's diary. Looking back at a day's
entries, and correcting them, then becomes a couple of taps instead of a scroll through time.

**Recommended shape (to be confirmed against a phone-size preview)**

- A **month grid** opened from the Diary date header (and from Today, so "what did I eat on Tuesday?"
  works from the landing screen too). Tapping a day navigates to `/diary/:date`; the URL stays the
  source of truth, so Back still returns to where you were.
- **Markers on days that have data**, so the calendar answers "when did I last log?" as well as
  "take me there" — a filled dot for a day with entries, a banked/deficit hint if it can be shown
  without clutter.
- **No editing from the calendar.** It navigates; the Diary remains the place entries change. This
  keeps one editing surface and avoids a second way to alter history.
- Today stays one tap away, and the ‹ / › stepping stays as it is for yesterday/today corrections.

**Open for that design session**

- Whether the markers carry meaning beyond "has entries" (calories vs goal, water met, a bank
  indicator) or stay as a plain dot for legibility on a phone.
- Whether it is a bottom sheet (quick jump) or its own route (`/diary/calendar`); a sheet is likely
  better on a phone, but the URL should still reflect the chosen date.
- Whether it should also reach **another person's** day — no, per decision 45: that is the admin
  swap-user control, not the calendar.
- Whether the calendar is Phase 13 or Phase 14 work. It is small, self-contained and Diary-shaped, so
  it fits either; recommendation: fold it into the next Diary slice after decision 40's **+ Add
  recipe**, so the Diary is finished in one pass.

### The Issues bell (proposed future feature)

**Owner's idea (2026-10-03), prompted by decision 42:** because an unlogged day is usually oversight
rather than choice, the app should not silently exclude it. A **bell icon on Home** would open a small
list of things needing attention — starting with "Wednesday 1 October has no logging" — each with a
resolve action ("I didn't log that day" → stays excluded; "Add what I ate" → opens that date's diary).

This is a **new feature with real backend work** (an `issues` table and its own migrations and
handlers), so it is deliberately not scheduled into a phase yet. It also generalises well: the
missing-nutrient gaps from decision 47 are the obvious second issue type ("23 foods have no saturated
fat value"), which would give the audit a natural home. Other candidates worth considering when it is
designed: water not tracked for days, weight not entered for weeks, a recipe with no image.

**Open questions for that design session**

- Which conditions raise an issue, which of them resolve themselves, and how long an issue lives
  before it is dismissed automatically.
- Whether dismissing is per-issue or "never ask me about this again".
- Whether the bell is the *only* surfacing (a badge with a count) or whether Home also shows a small
  summary line.
- Whether raising an issue can change the bank maths (recommendation: **no** — issues are a
  workflow, the bank has one rule, decision 42).

## Adapting an existing recipe — decisions 55–58 (2026-10-03)

**The gap the owner raised.** Phase 13's React Recipes experience could list, filter, favourite and
log a recipe, and edit its tags/occasion metadata — but could not **change a recipe itself**. PR #44
adds a React content editor and enforces the fixed-name rule at the API boundary. It also recalculates
dependent recipe definitions when a food is corrected. These changes
were implemented and tested, exercised and approved by the owner in the Arena preview on 2026-10-04,
and published in `v2.0.0-dev-rc19` after PR #44 passed validation.

| # | Date | Decision | Source |
|---|---|---|---|
| 55 | 2026-10-03 | **Editing a recipe must never change recorded history.** A diary row is the record of what was eaten and keeps its own grams and nutrition snapshot; a recipe is a definition used by *future* logs. After an edit, every existing diary row — and therefore every day total, bank figure and statistic — must be **byte-identical**. No handler may re-read a food or recipe definition to recompute, correct or "repair" a saved diary entry. | Owner (requirement, confirmed 2026-10-03) |
| 56 | 2026-10-03 | **"Adapt" means editing the existing recipe in place**, not duplicating it into a private variant. There is no fork/copy concept in this slice: the shared catalogue entry changes for everyone from that point on, which matches recipes being household-shared. | Owner |
| 57 | 2026-10-03 | **Any household user may edit any shared recipe.** No creator-only lock. Favourites and each user's usual portion remain personal (decisions 31–32, 37). | Owner |
| 58 | 2026-10-03 | **Recipe names are fixed at creation and are not editable.** The owner declined a name-snapshot migration, and freezing the name removes the only way historic diary rows could be relabelled after the fact (the diary response reads the name through a join). A recipe is named when it is created; the field is read-only afterwards. | Owner |

### Why the guarantee holds — and how the implementation defends it

Verified on 2026-10-03 against the real handlers; the safeguards were implemented in the session branch, merged in PR #44 and published in `v2.0.0-dev-rc19`:

- `POST /api/diary` stores the client's nutrition snapshot; it does not derive it from the recipe.
- `PUT /api/diary/{id}` (the logged-quantity edit) writes exactly what it is sent; the client scales
  **the row's own saved snapshot** by the new-to-old gram ratio (`scaleEntryToGrams`). Neither side
  re-reads the food or recipe, so a changed definition cannot rewrite a past day.
- `GET /api/diary`, `/api/bank` and `/api/stats` sum the diary rows' stored values; none of them
  re-derives nutrition from a recipe.
- `PUT /api/recipes/{id}` now updates the recipe and both ingredient lists in one transaction,
  recalculates nutrition from current Foods, rejects a changed name, and leaves Diary rows, personal
  favourites/usual portions, and recipe metadata untouched. The React editor keeps the name read-only;
  the legacy editor does too, while still submitting the unchanged name.
- `PUT /api/foods/{id}` now updates the food, household measures, and every dependent recipe
  definition in the same transaction, including archived recipes. Manual cooked weights stay fixed;
  calculated weights continue to follow food-ingredient grams.
- Go regression tests verify the old rows, daily totals and both users' bank figures are unchanged,
  new logs use corrected recipe values, unrelated definitions stay unchanged, and both multi-row
  recipe edits and food-plus-dependent-recipe corrections roll back atomically on failure.

The fixed recipe name remains the policy for **all** recipes, including those not yet logged. A
food-name correction may update the label joined into old Diary rows (decision 61); the saved grams
and nutrition remain unchanged. Deleting a logged recipe is handled by decision 59: the API returns
`409` and directs the household to archive it instead.

### Implementation status (2026-10-04)

- **Existing-recipe editing:** implemented in the React detail flow and typed API; covers cals Food
  ingredients and grams, text ingredients, description, serves, method, and optional manual cooked
  weight. The update endpoint is atomic and enforces the fixed name at the server boundary. The
  legacy editor is compatible and read-only for existing names.
- **Food nutrition correction:** dependent recipe definitions are recalculated transactionally,
  including archived definitions, with manual cooked weights preserved. Saved Diary nutrition and
  totals are never rewritten; the current joined food label may reflect a corrected name.
- **Verification and acceptance:** Go tests, Vitest editor/mock-API regressions, typecheck, lint and
  `build:go` passed. The owner exercised both slices in the Arena preview and signed off on them on
  2026-10-04. PR #44 and the post-merge Go check passed; the changes were published in
  `v2.0.0-dev-rc19`; the changes are included in rc22, rc23, rc24 and rc25. On 2026-10-04 the owner signed off all published RC candidates; the last reported Unraid installation remains rc24.
- **Separate authoring scope (at rc24):** recipe creation without a photo was a distinct Phase 13
  slice, separate from the two authorized safety slices; it is implemented and published in
  `v2.0.0-dev-rc24` (PR #54). Decision 82 later expands Phase 13 to include uncropped photo upload
  and replacement, published in `v2.0.0-dev-rc25` (PR #56); cropping remains deferred. Current
  Unraid review status is in [`CURRENT_STATE.md`](../CURRENT_STATE.md).

## Retiring recipes and correcting foods — decisions 59–61 (2026-10-03)

The owner proposed archive/restore for recipes and accepted the recommendations to keep corrected
food nutrition and dependent recipe definitions consistent without changing any saved Diary nutrition.
He also challenged freezing food names: correcting **“Chickken” to “Chicken”** should improve the
label everywhere, including historical entries. Current implementation status lives in
[`../CURRENT_STATE.md`](../CURRENT_STATE.md) §4.

| # | Date | Decision | Source |
|---|---|---|---|
| 59 | 2026-10-03 | **Archive/restore replaces normal recipe deletion.** Add an archive flag through an additive migration; retain the recipe ID, ingredients and Diary references. Hide archived recipes from the catalogue by default, provide a **Show archived** toggle and **Restore** on archived cards. Hide them from new-entry recipe pickers and require restoration before new logging, including at the API boundary. Historical links still open the recipe with an archived indicator. Archiving is household-wide because recipes are shared; favourites and usual portions remain personal. Cover React, the API and the legacy interface so retirement cannot damage history or differ by client. | Owner proposal; owner accepted recommendations |
| 60 | 2026-10-03 | **Food nutrition corrections affect future logs only, including dependent recipes.** Recalculate affected recipe definitions when a food’s nutritional values change, preserving cooked-weight concentration maths. Never recalculate, repair or overwrite saved Diary nutrition as part of a catalogue edit. Diary quantity edits continue scaling the entry’s original snapshot. Add regression coverage for food edits, dependent recipe recalculation, archive/restore, both users’ history, day totals and the bank. | Owner accepted recommendations |
| 61 | 2026-10-03 | **Food-name corrections are allowed, including after logging.** Historical labels may follow a correction such as “Chickken” → “Chicken”; no food-name freeze or name-snapshot migration is required for this use case. A different food should be a new catalogue record, not a repurposed existing one. Saved grams and nutrition remain unchanged. This is a food-name policy, not a revision of decision 58’s recipe-name rule. | Owner clarification |

### Status (2026-10-04)

- **Decision 59 — built, owner-reviewed, merged (PR #34) and published as `v2.0.0-dev-rc14`.** Schema: `recipes.is_archived INTEGER NOT NULL
  DEFAULT 0` and `recipes.archived_at DATETIME` (additive; every existing recipe stays visible).
  API: `PUT /api/recipes/{id}/archive` with `{"is_archived": bool}` (idempotent; keeps the original
  `archived_at`; does not touch `updated_at`, favourites, usual portions or any Diary row);
  `GET /api/recipes` hides archived recipes unless `?include_archived=true`;
  `GET /api/recipes/{id}` always opens and reports `is_archived`; `POST /api/diary` returns `409` for
  an archived recipe so no client can log one by ID; `DELETE /api/recipes/{id}` returns `409` for any
  recipe the Diary references, archived or not. React: icon toggles on one row — heart **Favourites** and archive-box **Archived** (owner-requested, replacing the original checkboxes), *Archived recipes*
  section with **Restore** on each card, and an inline-confirmed **Archive recipe** on the detail page.
  Legacy UI: the Delete button became **Archive** (restoring is done from the React Recipes page).
  Regression tests: Go (`recipes_archive_test.go`, `migrations_test.go`) assert diary rows, day totals,
  the bank and the recipe label are identical across archive and restore; Vitest covers the UI.
- **Decisions 60–61 — implemented and published in `v2.0.0-dev-rc19` (2026-10-04); owner-approved in the Arena preview before publication.** These features are included in rc22, rc23 and rc24; the owner later reported rc24 installed on Unraid.
  Food nutrition correction and every dependent recipe refresh share one transaction; archived
  definitions are included, manually measured cooked weights are retained, and saved Diary nutrition
  and totals remain unchanged. A corrected food name may change its joined historic label only.
  Go and fixture regressions cover the calculations, history guarantees and transaction rollback.
- **Known edge, left as is:** the Mealie import duplicate-name check still matches an archived recipe,
  so importing a recipe whose name matches an archived one reports "already exists".

### Food-correction findings and implementation

Before this slice, `HandleUpdateFood` already updated `foods` and custom `food_servings` in one
transaction but left recipe totals stale. Recipe detail joined current food values for ingredient
calories, while the stored recipe totals could disagree; Diary responses and bank/statistics continued
to use saved Diary nutrition. Food and recipe names are joined at read time, so a corrected food name
can improve a historic label without changing calorie spend.

The current implementation extends the food-edit transaction to refresh every dependent recipe,
including archived ones. It uses current food nutrition, preserves manually measured cooked weights,
updates calculated weights only for non-manual recipes, and commits the food, measures and recipe
refreshes together. The React Foods view invalidates recipe queries after a food save; the fixture API
mirrors recalculation and the current-label join while leaving its Diary snapshots untouched.

Go regressions cover multiple dependent definitions, an archived recipe, an unrelated recipe,
manual-weight concentration, both household users' history, daily totals, bank figures, new logs using
corrected nutrition, and rollback when a dependent update fails. A separate recipe-editor regression
proves a failed ingredient insert cannot partially save content. Go tests/vet and frontend tests, typecheck, lint and `build:go` pass. The owner exercised both slices
in the Arena preview and signed off on them on 2026-10-04. PR #44 and the post-merge Go validation
passed; `v2.0.0-dev-rc19` was published with anonymous-pull verification. These changes are included
in rc24 and the latest checkpoint, rc25; the owner last reported rc24 installed on Unraid.

## Calendar clarity and the recipe pick hand-off — decisions 62–65 (2026-10-03)

**Status:** decisions 62–64 are **built, owner-accepted in-session and published as
`v2.0.0-dev-rc17`** (PR #40 merged to `cals-dev` as `5d05f27`, [publish run
37154091274](https://github.com/dougalbob/cals/actions/runs/37154091274)); the owner's phone-size
review happens on the container after the Force Update. Decision 65's workflow is live and went green
on its very first run. **One question is open:** whether today should be the last loggable day in the
whole app, or whether pre-logging a planned meal stays (see “What 63 deliberately left alone” below, and
`CURRENT_STATE.md` §3).

**Four papercuts from the owner's road test, plus the CI hole that let one of them through.** All of
it is frontend or workflow work: no API change, no migration, no movement in the bank maths.

| # | Date | Decision | Source |
|---|---|---|---|
| 62 | 2026-10-03 | **An overspent day in the Calendar is a green bar with a proportional red tail, not a solid red bar.** The bar splits where the goal was reached: green is the part the budget covered, red is the overspend (`1,200` against a `1,000` goal is ≈83% green, ≈17% red). Under or at goal the bar stays a plain green progress bar. The red segment can therefore never swallow the cell, because the household's worst day in nine months of V1 is about 30% over goal (a 23% tail). | Owner |
| 63 | 2026-10-03 | **The Calendar never advances past Today.** The forward arrow stops on the month or week containing today, a hand-typed or bookmarked future URL is pulled back to today's period, and days that have not happened are shown but inert — they are not links, because there is nothing logged to look at and nothing to correct. Going *back* is unchanged: the Calendar exists to reach historic days. | Owner |
| 64 | 2026-10-03 | **🍽 Add recipe on a Diary meal card opens the Recipes tab, not a modal picker**, and carries the meal and the diary date with it as URL state (`/recipes?add-to=dinner&on=2026-10-01`). The recipe box's search, favourites, archived toggle and tag filters become the picker; every card in pick mode gains one **🍽 Add to Dinner** action that opens the existing portion sheet with the meal and date already filled in, and *Done* returns to that date's diary scrolled to that meal. Decision 40's promise stands — the meal is chosen once, portions keep decisions 29–32 behaviour — but its throwaway one-line picker is replaced. Archived recipes are still never offered (decision 59). | Owner |
| 65 | 2026-10-03 | **CI runs the Go tests.** A `Go tests (validation)` workflow (`go vet ./...` and `go test ./...` with CGO, on `go.mod`'s Go version) gates every pull request into `cals-dev` or `main`, and re-checks `cals-dev` after each merge. Before this, no CI job ever compiled a `_test.go` file: `Docker build (validation)` runs only `go build ./cmd/server`, so a Go test that did not build, or a failing regression test, could not be caught. | Agent finding; owner asked for the gap to be closed |

### Why 62 mattered more than it looked

A full-width red line said "over" about every overspent day identically, and destroyed the one thing
a calendar grid is for: comparing days at a glance. The bar was simultaneously the goal meter and the
alarm, and the alarm won. Splitting it at the goal restores both readings — how much was eaten, and
how far past the line it went — with no new colour, no new number and no scale to learn. The
presentation is deliberately conservative about the ceiling: the owner's data tops out at ~30% over
goal, so the red tail stays a tail (decision 62 records that as the design constraint, not as a
validation rule — the maths is proportional at any value, and a 10× blowout simply reads as a
nearly-red bar).

### What 63 deliberately left alone

Two neighbours of the Calendar still accept tomorrow, and were left working as they are:

- The **Diary's own › arrow** still steps onto tomorrow, and `POST /api/diary` still takes a future
  date, so a planned meal can be logged ahead of time. Clamping the Calendar while leaving these open
  is consistent with what the owner asked for ("the calendar should not be permitted to advance beyond
  Today") but it is not a complete guarantee. **Open question:** should the whole app treat today as
  the last loggable day, or is pre-logging worth keeping?
- `GET /api/calendar?from=&to=` is a generic range endpoint and still answers for future days (as
  empty ones) — that is what lets the month grid draw a full six rows, including the days after today
  that it now shows inert.

### Decision 64: where the intent lives, and why

The intent is two query params rather than a store or a route, for the same reason the diary date and
the recipe tags are: it survives a reload, browser Back, changing filters, and a detour into a recipe
detail page — all of which the old modal destroyed by keeping everything in component state. It is
validated on the way in (`parseRecipePick` ignores an unknown meal slot rather than guessing one), and
it can only ever preselect an answer the user can still change in the sheet. The recipe detail page
inherits it too, so its **🍽 Add to Dinner** button and its "back to the filtered, still-armed list"
link behave as one flow rather than two.

### On the verification claim that started this

The previous session's handoff recorded that "the Go tests in `calendar_test.go` have never been
executed" because "there's no Go toolchain in this sandbox and the Go download hosts are blocked". The
second half is true of `go.dev`/`dl.google.com`/`proxy.golang.org`; the conclusion is not.
`scripts/verify-go-in-sandbox.sh` fetches a working toolchain from the PyPI `go-bin` wheel and
builds `./cmd/server` with CGO in about a minute; it is a build-only helper. After it creates the
scratch copy at `/tmp/calstest`, run `go vet ./...` and `go test ./...` there as separate commands. In
the current verification, the build, vet and full test suite all pass, including the three calendar
regression tests. Nothing had rotted in `_test.go` — but nothing had been checking that either, which
is what decision 65 fixes. Agents: "the sandbox has no Go" is not a reason to leave a backend change
unverified, and `AGENTS.md` §3 says so.

## Bank window, metrics charts and app polish — decisions 66–73 (2026-10-04)

Seven items the owner raised on 2026-10-04, while Phase 13's safety slices were being published as
`v2.0.0-dev-rc19`. Three (the Diary meal-card fill, the recipe log-count badge and the navigation
layering bug) do not belong to any phase that exists, so they form a **Phase 13 polish slice**; the
rest extend **Phase 14 (Metrics + Nutrition)** and **Phase 15 (Settings)**. Follow-up presentation and
navigation requirements were added as decisions 74–78; decision 76 supersedes the original fill opacity,
decision 77 adds a temporary Arena-preview arrow workaround, and decision 78 improves recipe-card badge
hit targets and image visibility. Decision 79's recipe-origin marker shipped in rc22; decisions 80–81
record the owner's subsequent Today hydration and meal-fill choices, also shipped in rc22. Current
implementation status and work order: [`../CURRENT_STATE.md`](../CURRENT_STATE.md) §4.

| # | Date | Decision | Source |
|---|---|---|---|
| 66 | 2026-10-04 | **The bank window replaces the day-1 accumulation everywhere — and it defaults to 14 days.** The owner's further research says a deficit or credit accumulated since `bank_start_date` is the wrong figure to steer by. The Banked/Deficit tile, `today_available` (goal + bank) and the ring all read the **last N completed days**; `bank_start_date` becomes the window's floor, not its starting point. Settings offers the presets **30 days, 14 days, 7 days, All time** plus a **custom number of days**. “All time” reproduces today's cumulative behaviour, so nothing is lost. ~~so nothing is lost~~ **Corrected by decision 91 (2026-10-05): “All time” removes the window's *length limit* but still excludes unlogged days, so for anyone who skips days it does not reproduce the pre-Phase-14 figure.** Revises decision 44, which had scoped the window to the ring only. | Owner (scope, presets and 14-day default confirmed 2026-10-04) |
| 67 | 2026-10-04 | **Measurements get a tappable body map.** An SVG human outline (gender aware, large enough that hitting a body part is never a problem) carries small red tap points; tapping one opens a pop-up showing that part's **last recorded measurement**, which can be overtyped or stepped with up/down buttons, then committed with a save icon. Cancel with an unsaved change warns first (toast or equivalent); saving an unchanged value asks “Measurement hasn't changed — is this correct?” The outline's shape comes from a **new per-user setting** (the owner's choice — `users` has no gender column today), so it is an additive migration alongside Phase 15's other per-user preferences. | Owner |
| 68 | 2026-10-04 | **The Diary's four meal cards get the Today-style proportional back fill**, with two differences: the fill uses **that card's own meal accent colour at 50% opacity** (not the shared primary), and the **percentage it represents is printed at the upper-right extreme of the bar** in white, with padding, sitting in the bar's top-right corner. Decision 76 later reduces the fill opacity to 25%. | Owner |
| 69 | 2026-10-04 | **General rule for Metrics charts: a windowed chart must pan.** Where a chart shows a window of time, the rest of the series is reached by dragging the chart — touch-drag with haptic feedback on a phone, click-and-hold and move left/right on a laptop — never by cramming more points into the same width. Applies to every chart below and to any future one. | Owner |
| 70 | 2026-10-04 | **The weigh-in chart shows a 30-day window and plots a trend line in the same chart.** Weight history will keep growing, so points must not be cramped: 30 days are visible, and earlier or later periods are reached by panning (decision 69). The chart style is explicitly to be discussed when it is built. | Owner |
| 71 | 2026-10-04 | **A daily-goal-vs-consumed chart.** Each day's consumed calories against a horizontal daily-goal line: **green below the goal**, and above it a **gradient — amber for the first 10% over the goal, red beyond 10%**. 30-day window, pannable (decision 69). | Owner |
| 72 | 2026-10-04 | **A recipe card badge showing how many times that user has added the recipe to their Diary.** The number alone — no other text on the badge. | Owner |
| 73 | 2026-10-04 | **Bug: the Recipes page's tags paint over the menu.** Scrolling the recipe list, the card tags pass over the menu instead of behind it. **The menu must be the topmost visible layer at all times.** Root cause verified in code (below); it was a live defect in the previously published build and is fixed in rc21. | Owner |

### Follow-up presentation and navigation requirements — decisions 74–78 (2026-10-04)

The owner added badge and navigation requirements to the Phase 13 polish slice, then clarified the fill opacity, added an Arena-preview navigation workaround, and refined recipe-card badge sizing and tap targets. See [`../CURRENT_STATE.md`](../CURRENT_STATE.md) §4 for implementation status.

| # | Date | Decision | Source |
|---|---|---|---|
| 74 | 2026-10-04 | **Recipe log-count badge styling and placement.** Use the app header's current blue primary colour for the circular badge, white digits, and enough diameter for three digits. Place it at the image's top-left. Active recipe cards leave that corner free; archived cards already show an *Archived* pill there, so avoid overlap by moving that pill to the top-right on archived cards (where no favourite heart is shown). | Owner (top-left preferred; non-overlap treatment follows code inspection) |
| 75 | 2026-10-04 | **Show five bottom-navigation destinations at a time and swipe to reveal the rest.** Use horizontal swipe to expose overflow entries (currently Recipes is the sixth item), with haptic feedback when supported. Design the navigation to accommodate future pages such as Settings and Exercise; adding those pages is not part of this polish slice. | Owner |
| 76 | 2026-10-04 | **Reduce the Diary meal-card fill opacity from 50% to 25%.** Keep each card's own meal-accent colour and retain the proportional fill and percentage label. This supersedes the opacity in decision 68; decision 81 later changes both Today and Diary fills to 5%. | Owner |
| 77 | 2026-10-04 | **Add a temporary Arena-preview arrow for navigation overflow.** The preview cannot reliably swipe the bottom menu, so replace the fifth visible slot (formerly Foods) with an arrow button. Pressing it scrolls the menu to reveal both Foods and Recipes; the arrow changes to a back control to return. Keep swipe and supported-device haptics, and do not add future Settings or Exercise pages. This is a development-only workaround, not a permanent product requirement. | Owner |
| 78 | 2026-10-04 | **Improve recipe-card tap targets and show more of the image.** Keep the visible Favourite badge, but reduce its circle and heart icon by 25%; place it in a transparent 66 × 66 px button hit area (twice the new 33 px badge diameter), above the recipe-image link. Reduce the recipe log-count circle from 48 px to 36 px and its numerals from 16 px to 12 px (25% each), while retaining legibility for three digits. | Owner |

### Recipe origin marker — decision 79 (2026-10-04)

The owner requested an orange option in the existing Edit recipe interface so a recipe can be marked
as **Own creation**, placed above **Key foods (choose up to two)** and grouped with its other tags.
This implementation follows the existing shared recipe-classification model: the marker is a
**shared recipe-level boolean**, not per-user authorship. Either household user may set or clear it;
Favourites and usual portions remain personal. The orange card tag also filters the catalogue. The
owner confirmed this shared interpretation and signed off in the Arena preview; it shipped in rc22.

| # | Date | Decision | Source |
|---|---|---|---|
| 79 | 2026-10-04 | Add a shared orange **Own creation** origin marker to recipe metadata. Support it in the existing Edit recipe flow now and reuse the same field in the future create-from-scratch UI; do not pull the broader recipe-creation or image upload/crop work into this slice. | Owner request; preview approved and shipped in rc22 |

### Today focus and meal-fill opacity — decisions 80–81 (2026-10-04)

The owner approved both changes in the Arena preview; they were merged in PR #50 and published in
`v2.0.0-dev-rc22`. They do not change drink-calorie accounting or Diary's hydration controls.

| # | Date | Decision | Source |
|---|---|---|---|
| 80 | 2026-10-04 | **Keep Today focused on calorie and meal summaries.** Remove its hydration and Quick drinks controls; keep them available on Diary. Drink calories still contribute to Today totals, the ring and the bank. | Owner request; preview approved and shipped in rc22 |
| 81 | 2026-10-04 | **Set proportional meal-fill color alpha to 5% on both Today and Diary.** Retain each fill's proportional width and the existing meal colors on Diary. Tailwind's slash-alpha color utility applies alpha to the fill color, not to the whole card or its text; this supersedes decision 76's 25% Diary fill. | Owner request; preview approved and shipped in rc22 |

### Recipe photo upload and crop deferral — decision 82 (2026-10-04)

| # | Date | Decision | Source |
|---|---|---|---|
| 82 | 2026-10-04 | **Include optional, uncropped recipe-photo upload in Phase 13.** Let the user choose and preview a photo during creation, then upload it for the newly saved recipe; provide an option to replace the photo on an existing recipe. If the separate photo request fails after recipe creation, keep the recipe, say clearly that it is already saved, and offer retry from its detail page rather than inviting duplicate recipe creation. **Defer cropping**: Unraid road testing has not shown an urgent need, so do not add crop controls or crop processing unless later testing demonstrates a need. | Owner request, 2026-10-04 |

The photo is an optional second request after `POST /api/recipes`, so it is not part of the recipe-content transaction. The create flow must therefore recover gracefully from an upload failure. Current implementation and test status are in [`../CURRENT_STATE.md`](../CURRENT_STATE.md).

### Follow-on UI refinements — decisions 83–85 (2026-10-04)

| # | Date | Decision | Source |
|---|---|---|---|
| 83 | 2026-10-04 | **Set the Today meal-card proportional fill to 25% color alpha. Keep Diary meal-slot fills at 5% alpha.** This supersedes decision 81 only for Today; the Diary styling remains at 5%. Change only the fill color alpha, not the opacity of the whole card or its text. | Owner request, 2026-10-04 |
| 84 | 2026-10-04 | Add an **Own creation** checkbox to **Filter by recipe details**, on the same row as the Dish type selector. Reduce the Dish type selector width as needed to fit the checkbox. The checkbox toggles the existing `origin:own` tag filter, stays synchronized with active-tag chips and the URL, and combines with other selected details using the existing AND behavior. | Owner request, 2026-10-04 |
| 85 | 2026-10-04 | Require explicit confirmation before deleting a food or recipe entry from a populated Diary meal slot. The delete icon opens a confirmation naming the entry and meal; Cancel leaves the entry untouched, and only the confirmation's Delete action removes it. | Owner request, 2026-10-04 |

Current implementation and verification status are in [`../CURRENT_STATE.md`](../CURRENT_STATE.md).

### Cross-cutting UX, measurement cadence and access roles — decisions 86–90 (2026-10-04)

The owner made three forward-looking requests. Decision 86 generalizes the light, inline two-step confirmation used for **Archive recipe** to destructive **Delete** or **Remove** actions where the layout has enough room; the ingredient Remove controls in the Edit recipe editor are one candidate. It is a confirmation pattern, not a request to add confirmations to every reversible toggle. Decision 87 sets an ideal body-measurement interval of 3–4 weeks and allows a future reminder after more than four weeks without a measurement. The reminder is not built, and its channel/repeat behavior are open. Decision 88 confirms the owner as Admin and his wife as Standard, and asks that the next session focus on the production role and in-app Swap user work before Phase 14 Metrics. Cloudflare Access remains authentication; both users stay allowed by its policy, and the Admin switch changes only cals' server-validated acting-user context. The detailed bootstrap/session mechanism remains for the implementation session.

| # | Date | Decision | Source |
|---|---|---|---|
| 86 | 2026-10-04 | Where there is sufficient UI space, destructive **Delete** and **Remove** actions should use the Recipes page's low-friction inline two-step confirmation pattern: the first action reveals an explicit confirm and cancel choice; the destructive action happens only after confirmation, and cancel leaves the item unchanged. Apply this selectively where the layout allows; an Edit recipe ingredient **Remove** control is a candidate. | Owner observation |
| 87 | 2026-10-04 | Body measurements should ideally be logged every **3–4 weeks**. Once more than four weeks have elapsed since the most recent measurement, a future reminders feature may prompt the user to update measurements. This is a narrow exception to decision 46's no-general-reminders direction; no reminder channel, recurrence, or push notification is authorized. | Owner request |
| 88 | 2026-10-04 | **Next-session priority: move production roles and in-app user switching ahead of Phase 14 Metrics.** The owner is **Admin** and his wife is **Standard**. Keep Cloudflare Access as the authentication provider and allow both identities in its access policy; an authenticated Admin must be able to deliberately switch cals' acting user to an existing household account with decision 45's full read/write behavior, an unmistakable persistent “viewing as” indicator, and a way to return to the Admin's own account. Standard users cannot switch. `DEV_MODE`/`DEV_IDENTITY_SWITCH` remain development-only and are not the production feature. The next session should resolve secure role bootstrap, server-side switch/session behavior, affected API authorization (including making `GET /api/users` Admin-only), and tests as part of the work. This records priority and role assignment, not a settled implementation mechanism. | Owner request |
| 89 | 2026-10-04 | **Roles are declared in the appdata `.env`, as `ADMIN_EMAILS` and `STANDARD_EMAILS` (comma-separated), and reconciled into `users.is_admin` at every start-up.** Config is the authority, the column is the runtime copy handlers read: a declared Admin is granted on boot, everyone else is set to Standard, and a brand-new account takes its declared role at creation. A malformed address — or one listed as both Admin and Standard — fails start-up rather than granting nothing silently; a configured address with no account is logged, never invented. `STANDARD_EMAILS` is documentation and a typo check, not a grant. Unset `ADMIN_EMAILS` leaves the database untouched, so the capability is opted into. The owner chose this over the `ADMIN=` / `USER=` sketch because `USER` is a standard shell variable that would silently override a `.env` line, and over a namespaced `CALS_`-prefixed name for consistency with the repo's unprefixed settings. | Owner request; shape recommended by the agent and accepted |
| 90 | 2026-10-04 | **The acting-user switch is a plain server-side cookie, honoured only for an Admin, and authorization always reads the *authenticated* identity.** `cals_acting_user` (HttpOnly, SameSite=Lax, 12 h) holds the target account id; `ActingUserMiddleware` rewrites whose data a request touches and never who is signed in, so every handler keeps working unchanged. The cookie is deliberately **not** signed: it is only honoured when the Cloudflare-verified identity holds the Admin role, so a cookie forged by a Standard user is ignored and cleared — signing would protect against nothing the JWT does not already protect. Because role checks read the authenticated identity, an Admin who is acting as the other person can still list accounts and swap back. Switching clears the whole query cache (all of it is account-scoped), logs the switch in both directions, and shows a persistent "Viewing as …" banner with a way back. Full read/write while swapped: rows written belong to the account being acted as, with no second data model. | Implementation session |

Decision 89 closes the bootstrap question decision 45 left open, and decision 90 records the acting-user switch mechanism. Both, with the start-up log and the operational rule (edit `.env`, restart), are in [`admin-roles.md`](../architecture/admin-roles.md). Implementation status lives in [`../CURRENT_STATE.md`](../CURRENT_STATE.md).

The evidence and open design questions for body-measurement charts, indexed views, weight trends/ETA, and reminder semantics are maintained in [`metrics-evidence.md`](metrics-evidence.md).

### The windowed bank (decision 66)

**What changes.** `GET /api/bank` stops accumulating from `bank_start_date` and instead sums the
previous N **completed calendar days** (the as-of date excluded, because today is always in
progress). Everything that reads the bank — the Banked/Deficit tile, the ring, the Diary header,
`today_available` and therefore the Calendar's end-of-day figures — shows the same windowed number.
`bank_start_date` still bounds it: a window can never reach back before the bank's start, and the
existing “start fresh today” control (decision 17) keeps working.

**What does not change.** Grams and nutrition snapshots, decision 42's exclusion of unlogged days,
decision 43's per-person bank, and decision 48 (steps never credit it). Within the window, budget
accrues only for days that have logging — a day with no entries contributes neither budget nor spend
(decision 42), so a fortnight with two unlogged days budgets 12 days, not 14.

> ~~**Design point to confirm when it is built:** whether “the last 14 days” means 14 *calendar* days or 14 *logged* days.~~
> **Settled by decision 92 (2026-10-05): calendar days.** The previous 14 calendar days before the as-of
> date, bounded below by `bank_start_date`; decision 42 then decides which of them contribute, so a
> “12 of 14 days counted” label is meaningful.

**Implementation notes, recorded now because this is crown-jewel maths** (`AGENTS.md` §4 — never
change the bank incidentally):

- Both ledgers are in scope: `diary_entries` **and** `drink_entries` (decision 1). `HandleGetBank`
  already sums both; `GET /api/stats/bank` does not, and must be made consistent.
- Use `date(date)` in the comparisons, as `HandleGetBank` and the fixed calendar handler do — the
  deferred RFC3339 problem in the section below bites exactly here.
- Additive migration for the per-user window, defaulting to 14. Persist it on the user record so it
  follows the person across devices, exactly like Phase 15's ring limits; not browser storage.
  **Decision 93 (2026-10-05) settles when: the column lands in the Phase 14 slice, exposed through
  `PUT /api/users/me` but with no UI — Phase 15 only draws the control.**
- Regression tests are part of the slice, not an afterthought: window boundary, a window shorter than
  the history, a window reaching past `bank_start_date`, unlogged days inside the window, food +
  drink inclusion, the “All time” preset reproducing today's numbers, and `today_available` moving
  with the window. `internal/handlers/bank_test.go` is the home.
- **The figure must be labelled with its window** (“Last 14 days”) wherever it appears, so a windowed
  balance can never be mistaken for an all-time one.
- Sequencing: Phase 14 implements the maths with the 14-day default hard-coded; Phase 15 adds the
  Settings control (presets + custom). Do not ship the maths and the setting in one unreviewed step —
  the owner should see the new numbers before the control exists.

### The body-map measurement picker (decision 67)

The parts that exist today (verified in `internal/database/migrations.go` and
`internal/models/models.go`): **bust, chest, waist, hips, upper arm, thigh, neck** — seven columns on
`measurement_entries`, all nullable. The outline needs a tap point per part that makes sense for the
chosen body shape.

**The interaction, as the owner described it:** tap a point → a small pop-up shows the last value
recorded for that part → overtype it or nudge it with up/down buttons → tap the save icon to commit.
Cancel is always available; cancelling after a change warns that there are unsaved values and asks
whether to cancel anyway; saving without having changed anything asks for confirmation. Proposed
wording (the owner left it to the implementation session):

- Unsaved cancel: **“You have an unsaved measurement. Discard it?”** — *Discard* / *Keep editing*.
- Unchanged save: **“Measurement hasn't changed — is this correct?”** — *Save anyway* / *Cancel*.

**Backend gaps to close in the same slice:**

- There is **no update endpoint** for a measurement: the routes are `GET`, `POST` and
  `DELETE /api/measurements/{id}`.
- `POST /api/measurements` **deletes the existing row for that date and re-inserts it**, so posting a
  single part would silently wipe every other part logged on the same day. The owner chose to decide
  the write target when this is built; the two candidates are (a) **patch the latest entry's own
  date**, which needs a per-part update endpoint (`PUT /api/measurements/{id}` or a part-level
  patch), or (b) **write to today's row** using the existing POST, which must then resend every part
  it wants to keep. Option (a) preserves history and the recorded date; option (b) needs no new
  endpoint but makes every correction a new measurement.
- “Last measurement for that part” means the newest entry where that column is non-null — not simply
  the newest entry, which may have been logged with only a waist value. `GET /api/measurements`
  currently returns the newest 20 rows, so a part last recorded a year ago would not be found; either
  raise the limit or add a per-part latest lookup.
- The **per-user outline preference** is an additive `users` column plus `GET`/`PUT /api/users/me`
  support — the same narrow, tested exception to the frontend-only boundary that Phase 15's ring
  limits and lookback window already require.

**Design points left open:** whether the female outline exposes **bust** and the male outline
**chest** (recommended — it keeps both columns meaningful and avoids asking a person to pick between
them), or whether both points appear on both outlines; where the outline sits (the Metrics screen
owns measurements, so it belongs there, with the existing table kept for history); whether the
up/down stepper is 0.5 cm or 1 cm; and how the pop-up behaves for a part never measured (recommended:
open empty with the save action creating the first value). Accessibility is not optional here: the
dots need labels and keyboard focus, and the 44 px touch-target rule means the invisible hit area is
larger than the visible dot — the same technique `RecipeTags` already uses.

### The Diary meal-card back fill (decision 68)

Today's four meal tiles fill in proportion to each meal's share of the day's logged calories
(`data-calorie-fill` in `HomeRoute.tsx`). They originally shipped at `bg-primary-light/50` in rc18;
decision 81 later set both pages to 5%, and decision 83 sets **Today alone back to 25%** while the
Diary remains at 5%. The Diary's four meal cards use the same proportional idea, with the owner's two
differences:

1. **The Diary fill colour is the card's own meal accent at 5% alpha** — decision 81 set both screens
   to 5%, and decision 83 changes Today alone to 25%; Diary stays at 5%. Decision 81 superseded
   decision 76's 25% opacity, which replaced decision 68's original 50%. Use `--color-meal-breakfast`,
   `--color-meal-lunch`, `--color-meal-dinner`, `--color-meal-snacks`, the same tokens that already
   drive each card's left border (`MEAL_ACCENT` in `DiaryRoute.tsx`). The fill sits *behind* the entries,
   totals and buttons, exactly as it does on Today.
2. **The percentage is printed at the upper-right extreme of the bar** — white text, padded, in the
   bar's top-right corner (e.g. `23%`).

Keep the percentage's definition identical to Today's: that meal's calories as a share of the day's
total logged **food** calories, so the four cards sum to 100% and the two screens never disagree.
Edge cases to design for: a day with nothing logged shows no fill and no label; a meal with a 1–2%
share produces a bar too narrow to hold its own label, so the label needs a rule (recommended: keep
it inside the card's top-right and let it sit over the unfilled area, still white with enough
contrast, rather than shrinking or clipping it); and the fill must not obscure the row text at any
width.

### Charts pan their window (decision 69) — the general rule

Any Metrics chart that shows a window of time must be draggable: **touch-drag with haptic feedback on
a phone; click-and-hold then move left/right on a laptop.** The default window stays readable, and
older or newer data is reached by moving the chart rather than by squeezing the points together.

Two consequences worth recording now:

- **The endpoints cannot do this yet.** `GET /api/weight?days=` and `GET /api/stats/calories?days=`
  always end at today (`date('now')`), and the calorie stats handler caps `days` at 90. Panning
  backwards needs a range parameter — `from`/`to`, as `GET /api/calendar?from=&to=` already does — or
  an `until` date. Whichever handler is touched must also adopt the `date(date)` fix described in the
  [deferred RFC3339 issue](#known-issue-deferred--rfc3339-dates-on-the-metrics-endpoints-2026-10-03).
- **Haptics are a nice-to-have, not a dependency.** `navigator.vibrate` is the only lever a PWA has
  and iOS Safari does not implement it, so the drag must feel right without it. The charting-library
  choice (§11 question 4 — Chart.js via `react-chartjs-2` versus Recharts) is still open; panning is
  materially easier with Chart.js's zoom/pan plugin, which is worth weighing when that question is
  finally answered.

### The weigh-in chart (decision 70)

A 30-day window by default, pannable in both directions (decision 69), with a **trend line plotted in
the same chart**. The owner explicitly left the chart style to the implementation discussion; the
candidates are a centred moving average, a least-squares regression line, or both together.
Recommendation: keep the raw points, add a smoothed trend, and let the owner judge it in a preview —
this is precisely the kind of thing that reads differently on a phone than on paper.

Two traps to design against: weigh-ins are sparse (nobody logs daily), so the trend must handle gaps
without inventing data; and a weight chart whose y-axis auto-fits a 30-day span will make a 0.4 kg
wobble look like a crisis, so the axis needs a sensible fixed padding or an explicit scale choice.

### Daily goal versus consumed (decision 71)

Bars for each day's consumed calories against a horizontal **daily-goal line**: green below the goal;
above it, a gradient that is **amber for the first 10% over the goal and red beyond that**. A 30-day
window, pannable (decision 69). This is decision 62's calendar bar taken one step further — the
calendar splits a day green/red at the goal, and this chart adds the amber band for the first 10% of
overspend.

Two implementation notes:

- **“Consumed” must include drink calories** (decision 1 — drinks count towards the bank), otherwise
  this chart will disagree with the ring on the same screen. `GET /api/stats/calories` currently sums
  `diary_entries` only, so the endpoint has to be extended; that is a real gap, not a detail.
- The 10% amber threshold is hard-coded for now. Making it a setting is possible but is not asked
  for; revisit only if the household finds the band wrong.

### The recipe log-count badge (decision 72)

A badge on the recipe image showing **how many times the signed-in user has added that recipe to
their Diary** — the number and nothing else.

- **No schema change.** `diary_entries` already carries `recipe_id` and `user_id`, so this is a
  `COUNT(*)` grouped by recipe. It arrives as an additive response field (for example `times_logged`)
  on `GET /api/recipes` and the recipe detail response.
- **It is per user, not household-wide** — recipes are shared but habits are personal, the same split
  as favourites (decision 37) and each user's usual portion (decision 31). An archived recipe still
  carries its count: the history is real.
- **Zero means no badge.** A recipe never logged has nothing to say.
- **Placement is now set by decision 74:** the owner prefers the upper-left corner. On active cards
  it is free (tags are lower-left and the favourite heart is upper-right). Archived cards already
  show an *Archived* pill upper-left; move that pill to the upper-right on archived cards, where no
  favourite heart is rendered, so the count remains visible without overlap.
- **Compact badge sizing (decision 78):** reduce the count circle from 48 px to 36 px and the digits
  from 16 px to 12 px, but retain enough room for three digits. The top-right favourite control uses a
  66 × 66 px transparent button target around a 33 px visual circle and 18 px heart; that larger
  clickable area overlays the image link without making the visible badge larger.

### The Recipes layering bug (decision 73)

Verified in the code on 2026-10-04, so the fix is not guesswork:

- The app's fixed bottom navigation (`web/frontend/src/AppLayout.tsx`) is
  `fixed bottom-0 left-0 right-0 bg-card border-t border-line safe-bottom` — **it sets no
  `z-index`**, and `src/styles.css` sets none either.
- The recipe cards' tags are positioned with `z-10` and the favourite button with `z-20`
  (`web/frontend/src/routes/RecipesRoute.tsx`).
- By the CSS painting order, a positioned element with `z-index: auto` (the nav) is painted **before**
  any positive-`z-index` descendant elsewhere in the tree (the tags), so the tags draw on top of the
  menu as they scroll past it. That is exactly what the owner sees.

**The fix** is to give the app chrome an explicit layer — the navigation above page content and below
`Modal`'s `z-50` — and to audit the other fixed/sticky chrome for the same omission. Frontend only:
no API, schema or data change. It is a live defect in the published build, so it heads the Phase 13
polish slice.

## Phase 14 planning pass — decisions 91–95 (2026-10-05)

Phase 14 (Metrics + Nutrition) was scoped into six individually shippable slices and the five questions
gating the first three were settled with the owner. The plan itself — slice contents, guardrails, verification
per slice and the remaining open questions — is in [`../architecture/phase-14-plan.md`](../architecture/phase-14-plan.md).

| # | Date | Decision | Source |
|---|---|---|---|
| 91 | 2026-10-05 | **"All time" excludes unlogged days too.** Decision 42's exclusion applies at every window length, so the bank has one rule rather than one rule per preset. This resolves the contradiction between decision 66's "“All time” reproduces today's cumulative behaviour, so nothing is lost" and decision 42's "a change from today's behaviour": for anyone who skips days, "All time" now returns a *lower* figure than the pre-Phase-14 cumulative one. Decision 66's "nothing is lost" is superseded on that point; the preset still removes the window's length limit. | Owner |
| 92 | 2026-10-05 | **The bank window counts calendar days, not logged days.** "Last 14 days" means the previous 14 calendar days before the as-of date, bounded below by `bank_start_date`; decision 42 then decides which of them contribute. Settles the design point decision 66's own notes left open, and makes a "12 of 14 days counted" label meaningful. | Owner |
| 93 | 2026-10-05 | **The bank window is stored per user in Phase 14, with no control until Phase 15.** Additive `users` column defaulting to **14**, readable and writable through `PUT /api/users/me`, and deliberately **not** surfaced in any UI — so the maths is testable and the owner can try a different window in preview, while Phase 15 only has to draw the control. Satisfies decision 66's sequencing rule ("do not ship the maths and the setting in one unreviewed step") and decision 66's note that the window persists on the user record rather than in browser storage. | Owner |
| 94 | 2026-10-05 | **Metrics charts stay on the existing hand-written SVG components plus a panning hook; no chart library.** Decision 69's requirement is panning the *data window* (fetch another range through the new `from`/`to` parameters), not zooming a viewport, so a library's zoom plugin buys less than it appears to; the two components in `src/components/charts.tsx` are already unit-tested; and the production bundle is already 508 kB JS / 147 kB gzipped as a single chunk, which Vite itself flags. This settles the Chart.js-versus-Recharts question recorded as open in [`../architecture/frontend-strategy.md`](../architecture/frontend-strategy.md) §11. | Owner (accepted the agent's recommendation) |
| 95 | 2026-10-05 | **The weigh-in trend is a moving average taken over weigh-ins, not calendar days, and its window becomes a per-user setting later.** Phase 14 ships a **7-day** average across the observations themselves (a calendar window comes up empty when nobody weighs in daily), drawn only where at least three points exist, labelled with its method, and never extrapolated into a date or a "plateau" (see [`metrics-evidence.md`](metrics-evidence.md) §4–5). The owner records now that 7 may prove wrong — **10 or 14 days are the likely alternatives** — so the window is a per-user preference to be exposed in the Phase 15 Settings/profile work beside the bank window (decision 93) and the ring limits, following the same "column now, control later" pattern. | Owner |

Decisions 91 and 92 mean **the household's bank figures will move when Phase 14 lands**, by more than the
window alone explains: a windowed figure is smaller than a since-day-one figure, and decision 42 also removes
the day's budget that unlogged days currently add. That is why the windowed bank is its own published
checkpoint with its own owner review before anything is built on top of it.

## Known issue, deferred — RFC3339 dates on the metrics endpoints (2026-10-03)

**Not a bug the household can see today. Pick this up at the start of the metrics phase.**

Columns declared `DATE`/`DATETIME` are converted to `time.Time` by `mattn/go-sqlite3` (it reads
`sqlite3_column_decltype`), and `database/sql` then renders that as RFC3339 when the scan
destination is a string. A row holding `2026-09-07` therefore comes back as
`2026-09-07T00:00:00Z`. This is what made the `rc15` calendar read `0 / 1,250 kcal` on every day with a
bank of `+133,184,631 kcal` — see the
[rebuild log entry](../history/rebuild-log.md) and the fix in `internal/handlers/calendar.go`
(shipping in `rc16`).

~~The same pattern is still live in three handlers that select the bare column and scan it into a
string, so their JSON carries `2026-09-07T00:00:00Z` rather than `2026-09-07`:~~
**✅ Fixed in Phase 14 slice 14.1 (2026-10-05).** All three now select `date(date) AS day` and normalise
with `isoDate`, pinned by `internal/handlers/stats_test.go`:

| Handler | Query |
|---|---|
| `internal/handlers/fitness.go` | ~~`SELECT date, steps FROM step_entries …`~~ now `SELECT date(date) AS day, steps …` |
| `internal/handlers/weight.go` | ~~`SELECT id, user_id, date, weight_kg, created_at FROM weight_entries …`~~ now `SELECT id, user_id, date(date) AS day, …` |
| `internal/handlers/measurements.go` | ~~`SELECT id, user_id, date, … FROM measurement_entries …`~~ now `SELECT id, user_id, date(date) AS day, …` |

That also repaired a **live V1 defect**: `web/static/js/components/metrics.js:74` compares the returned
date against a plain `YYYY-MM-DD`, so the weight box never pre-filled today's weigh-in.

`users.bank_start_date` has the same shape; the legacy UI already works around it with
`bank_start_date.split('T')[0]` (`web/static/js/app.js`).

**What was done:** select `date(date) AS day` (an expression has no declared type, so the driver
returns plain text) and compare with `date(date) >= date(?)`, as `HandleGetBank` and the fixed
calendar handler do; normalise anything scanned into a string with the `isoDate` helper in
`internal/handlers/calendar.go`.

**Still open:** whether `GET /api/users/me` should return a plain `YYYY-MM-DD` `bank_start_date`.
It still returns RFC3339 — verified 2026-10-05 against a real server: a direct
`SELECT bank_start_date` scans as `2026-10-05T00:00:00Z`, while `SELECT COALESCE(bank_start_date, …)`
scans as plain `2026-10-05` because `sqlite3_column_decltype` is NULL for an expression. The legacy UI
tolerates it with `split('T')[0]` and the React app does not display it, so it is cosmetic; changing it
would let the legacy UI drop that workaround. `GET /api/bank`'s `start_date` has the same shape.
