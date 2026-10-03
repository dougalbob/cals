# Vision & Open Questions — the "grill me" document

| Field | Value |
|---|---|
| **Status** | 🟡 **LIVE DISCOVERY** — the working list of things we do not yet know. Answers are recorded in [Decisions so far](#decisions-so-far) |
| **Started** | 2026-10-02 |
| **Owner** | @dougalbob |
| **Purpose** | Get to a shared understanding of what cals should *become* before deciding what to rebuild and in what order |
| **Related** | [`../architecture/frontend-strategy.md`](../architecture/frontend-strategy.md), [`../architecture/local-development.md`](../architecture/local-development.md) |

**How to use this.** Answer in any order, in any level of detail — including "don't know yet" and "that's not important". Sections marked ✅ are settled; the rest are open. Anything answered is recorded in a dated decision table (decisions 1–17, 18–28, 29–41 and the [second pass](#second-discovery-pass--2026-10-03) 42–48). This document records *why*; **current status lives in [`CURRENT_STATE.md`](../CURRENT_STATE.md)** and the dated story in [`../history/rebuild-log.md`](../history/rebuild-log.md).

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

The owner approved separating the two stories shown by the Home and Diary rings: the **outer ring** visualizes the cumulative bank, while the **inner ring** continues to show today's calories against the daily goal. Until Phase 15 Settings, the display limits are fixed at +2,000 kcal and -2,000 kcal: +1,000 fills half green, -650 fills about one third red, and balances at or beyond either limit fill the outer ring completely. The exact balance remains visible even when the arc is capped; these boundaries affect presentation only, never the bank maths.

**Direction (decision 28, 2026-10-03):** both arcs begin at 12 o'clock, but a surplus grows **clockwise** (green) and a deficit grows **anticlockwise** (red), so the sign of the balance is visible from the shape alone rather than from colour alone. Implemented; it changes no figure and no maths.

Phase 15 will make the positive-bank cap and deficit magnitude independently adjustable per user, defaulting to 2,000 kcal each. Persist the settings through the user's API/schema so they follow the user across devices, not in browser-only storage. This is a narrow backend addition to the otherwise frontend-only rebuild.

The current grey arc at a large deficit is explained by the old outer ring dividing by `today_available`: once that value is negative, progress clamps to zero and the arc has no visible length. The fixed-range ring currently uses the signed cumulative `bank_balance` directly.

### Proposed lookback window — 2026-10-03 (settled as decision 44)

The owner has suggested that the outer ring represent a recent rolling balance rather than all time since `bank_start_date`, tentatively the last 30 completed days, with the lookback length adjustable per user — **settled on 2026-10-03 as decision 44: the window is user-definable, and “no window” means cumulative from day 1.** Recommendation: make this a separate **display metric for the ring**; do not change the cumulative bank or the calculation of today's available allowance. The Banked/Deficit tile should continue to show the exact cumulative balance, while the ring label states the selected period (for example, “Last 30 days”).

This is not already implemented: the existing `GET /api/stats/bank?days=30` returns 30 dated snapshots, but each snapshot is cumulative from `bank_start_date`, not a rolling-window total. It also currently omits drink calories. Schedule a tested rolling calculation and food+drink consistency with Phase 14 Metrics, then make the lookback per-user and editable with the ring limits in Phase 15 Settings. The 30-day default and exact settings range remain to be confirmed during that design.

1. ~~**Does it ever reset?**~~ **Answered (2026-10-02, decision 17): manual only.** No automatic reset; the existing `bank_start_date` setting in Settings is the "start fresh from today" control, and it resets the running balance without touching history.
2. **Should exercise credit the bank?** **Deferred by the owner (2026-10-03): not now.** Google Fit steps keep syncing and stay informational (Metrics), with no effect on the bank maths. Revisit as its own decision; "eat back your steps" is a common source of drift, and a future version could credit only steps above a daily floor.
3. ~~**Should the bank be per-user, or shared as a household?**~~ **Answered (2026-10-03, decision 43): per person, as now.** Each of you keeps your own bank, goals and history. Seeing the other person's numbers is handled by the admin role (decision 45), not by merging the banks.
4. ~~**What should a day with no logging at all count as**~~ **Answered (2026-10-03, decision 42): no data — the day is excluded from the bank.** It neither adds the daily budget nor removes consumption, so an unlogged day is a wash rather than an inflated bank. This is a change from today's behaviour (which counts it as zero consumed) and lands in Phase 14. Because the usual cause is human oversight, the owner wants a future **Issues** feature — a bell on Home that raises "you didn't log this day" and asks the user to resolve it — so the exclusion is visible rather than silent.
5. ~~**Would an average be more useful than a running total**~~ **Answered (2026-10-03, decision 44): keep the running total, and make the window user-definable.** The owner's earlier lookback idea (a rolling period, tentatively 30 days) is generalised: the ring shows a **user-selected window**, and if no window is chosen it shows the cumulative figure from day 1 to today. The Banked/Deficit tile continues to show the exact cumulative balance. Phase 14 computes the rolling metric; Phase 15 adds the setting.

## E. Daily logging ergonomics

This is where a rebuild earns its keep, so it is worth being specific about the friction.

6. **What do you (or your wife) log most days that takes the most taps today?** A habitual breakfast, coffee, the same lunch?
7. **Would "same as yesterday", favourites, or recently-logged shortcuts help?** Any of these would be a headline feature of the rebuild.
8. **Are the four meal slots right** (breakfast, lunch, dinner, snacks)? Is there anything logged that fits none of them?
9. **Recipe diary portions — answered 2026-10-03.** A user's usual amount is personal and may differ from another person's; offer a remembered usual weight per user and recipe (for example, 200 g), editable in grams, plus fractions of the whole cooked recipe for visually served dishes (for example, ¼ of a lasagne). All choices convert to grams; diary entries continue to store only grams and the nutrition snapshot. The per-user preference is separate from diary history. This resolves whether recipe logging should be weight-based or serving-based: support both, without assuming every user's portion is the recipe's `serves` value.
10. **How often do you log away from home** — pub, restaurant, takeaway — where you're estimating rather than weighing? How is that handled today?
11. **Barcode scanning** — genuinely useful, or is the food repertoire stable enough that it isn't?

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
21. **Do you need offline logging?** (No signal, on a train.) A significant scope decision for a PWA.
22. ~~**Notifications and reminders**~~ **Answered (2026-10-03, decision 46): none — but a weekly report is wanted.** No logging nudges, no water nagging, no push notifications. Instead the owner wants a **weekly report** (what the week's numbers looked like, how the bank moved). If it fits naturally in Phase 14's Metrics redesign, it lives there; otherwise it is its own small feature set. Note the deliberate contrast with decision 42's future **Issues** bell: that is an in-app, resolve-it item on Home, not a notification to your phone.
23. **Anything needed on a watch, or via Siri/shortcuts?**
24. **Do you keep any other trackers** (Apple Health, a smart scale, Strava)? Integration, or complexity you don't need?
25. **How is `appdata/cals` backed up today?** Worth confirming there is a copy before we make any structural change.

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

**Settled in the 2026-10-03 second pass (decisions 42–48):** unlogged days are excluded from the bank
(42); the bank stays per person (43); the ring window is user-definable with a since-day-1 default
(44); cross-viewing becomes an admin role with a swap-user control rather than a household view (45);
no notifications, but a weekly report is wanted (46); tracked nutrients become user-selectable with a
missing-data audit (47); and steps do **not** credit the bank for now (48).

**Highest-value questions still open**

1. **Logging friction** (section E, questions 6–8) — what actually takes the most taps for the primary
   user, and whether "copy yesterday", favourites or saved meals should be built. This is the biggest
   remaining product unknown and Phase 13/14 work is already close to it.
2. **Meal slots** (section E, question 8) — whether the four slots are right; adding a fifth later is
   awkward once the Diary is settled.
3. **Nutrient coverage rules** (decision 47 design) — which nutrient list to offer, and what a traffic
   light should do when the data behind it is only partly covered.
4. **Barcode scanning and offline logging** (section E question 11, section H question 21) — each one
   decides real work in Foods/Diary and Phase 15's PWA scope.
5. **A confirmed backup of the household's live data** (section H question 25) — worth checking before
   any structural change, and currently unverified.
6. **Timescale and involvement** (section I, questions 29–30) — a few weeks of evenings, or months;
   review each phase, or "show me when it looks finished".
7. **Traffic-light rules and the rolling window** (section F questions 12 and 14) — whether the current
   thresholds and the 7-day nutrition window are right, which decision 47's new nutrients make urgent.
8. **FatSecret and a UK food database** (section G, questions 18–19) — whether the commercial API stays
   long-term or CoFID/McCance & Widdowson is more useful; relevant to how well a nutrient audit can
   ever be filled.

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

**Phase 12 close-out (2026-10-03).** The Diary's logged-quantity **Edit** action is implemented: the
weight of a logged food or recipe can be corrected, with a live calorie preview, and the entry's own
saved calories/protein/carbs/fat/fibre are rescaled by the new-to-old ratio so the saved snapshot —
not a possibly-changed food definition — is what changes. Zero and negative weights are refused. No
schema or API change was needed (`PUT /api/diary/{id}` already existed).

### Next increment — Add recipe from a Diary meal card (owner request, 2026-10-03)

The Diary's four meal cards currently offer only **+ Add food**. The next queued slice (decision 40) adds **+ Add recipe**
beside it on the same row. The action opens the recipe chooser (shared catalogue, searchable), and the
portion sheet must open with **the meal card the action was started from already selected** — starting
it from Lunch pre-selects Lunch rather than falling back to a time-of-day guess. Meal, date, fractions,
grams and the remembered usual otherwise behave exactly as decided in 29–32, and the log still stores
grams plus the nutrition snapshot.

Design detail deliberately left open for that session: whether the chooser opens on the full catalogue
with search, or leads with the user's favourites and recently logged recipes. Decide it against the
phone-size preview rather than in advance.

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
- **The vocabulary is unchanged.** Only the existing structured tags became filters — meal occasion, dish type and up to two known-Food key foods (decisions 34–35). No free-text tags were introduced.

**Still open / for the owner's review**

- **Same-facet taps always AND.** Two meal-occasion tags (Lunch **and** Dinner) is a legitimate request that usually matches nothing, and is currently the same dead end as any other empty combination. If tapping tags within one facet should widen instead (“Lunch **or** Dinner”), that is a small change with a real behavioural consequence — worth deciding after using it.
- **Should the tap-to-filter idea spread?** The same tokens exist in the Diary and the Foods list. The Recipes catalogue is the natural first home; nothing else has been changed.
- **Touch target.** The chips over the photo stay small so they do not crowd the image; their tap area is expanded invisibly, but this is exactly the kind of thing to judge at phone size on the LAN dev container, not on a laptop.


## Second discovery pass — 2026-10-03

| # | Date | Decision | Source |
|---|---|---|---|
| 42 | 2026-10-03 | **An unlogged day is excluded from the bank** — it counts as “no data”, not as zero consumed, so a missed day neither banks the daily budget nor spends anything. Unlogged means no food, recipe or drink entries for that date; a day with any logging counts normally. Because the usual cause is oversight, the owner wants the exclusion to be **visible** rather than silent (see the [Issues bell](#the-issues-bell-proposed-future-feature)). | Owner |
| 43 | 2026-10-03 | **The bank stays per person.** No shared household bank; seeing the other person's numbers is handled by the admin role (decision 45), not by merging the maths. | Owner |
| 44 | 2026-10-03 | **The ring's window is user-definable**, generalising the earlier 30-day lookback idea: the user picks a rolling window, and **“no window” means the cumulative figure from day 1 to today**. The Banked/Deficit tile always shows the exact cumulative balance. Phase 14 computes the metric; Phase 15 adds the setting. | Owner |
| 45 | 2026-10-03 | **An admin role plus a “Swap user” control**, rather than a household view. The owner needs to browse the household's data because his own profile has almost none; the flag grants **full read/write** as the other user, with the app making it unmistakable that you are acting as someone else. `GET /api/users` stops being an exposed curiosity and becomes admin-only. | Owner |
| 46 | 2026-10-03 | **No notifications or reminders** — not for logging, not for water. Instead the owner wants a **weekly report**: an in-app recap of the week's numbers, ideally part of Phase 14's Metrics redesign and its own small feature set if it does not fit. | Owner |
| 47 | 2026-10-03 | **Tracked nutrients become user-selectable.** Macros and fibre stay on by default; further nutrients (for example saturated fat) are ticked on in a Settings sheet, and the app **audits the existing foods and reports which ones have no values for a newly enabled nutrient** so the gaps can be filled rather than silently ignored. The nutrient list and the audit's exact behaviour are Phase 14 design work (this is an additive API/schema exception, like the Phase 15 settings work). | Owner |
| 48 | 2026-10-03 | **Exercise does not credit the bank for now.** Steps keep syncing and stay informational; “eat back your steps” is deferred, not rejected, and revisiting it must be its own decision with tests. | Owner |

Decision 42 changes behaviour that exists today, so it is a Phase 14 correctness item, not just a
display preference: the rolling window and any cumulative figure must agree about which days count,
and both need tests for a fully unlogged day, a partially logged day, and today (which is always in
progress and is never excluded).

### Admin role and swap user (2026-10-03)

**The problem.** The owner has almost no data under his own profile, so he cannot tell how the app is
behaving without borrowing his wife's phone. His wife has no corresponding need to see his day.

**The shape of the answer.**

- An additive `users.is_admin` flag (default `0`), so no existing row changes meaning.
- The admin identity should come from configuration rather than a hard-coded email in the repository
  (the source tree is public). Recommended: an `ADMIN_EMAILS` list applied at startup, carried in the
  Unraid template like the other secrets/settings; alternatively a documented one-off SQL step. This
  is a decision for the implementation session.
- A **Swap user** control using the existing `/dev/identity` pattern, but production-appropriate:
  authenticated, admin-only, **server-side** (a cookie or header the API validates on every request —
  never a client-side claim), loopback restriction **not** applied (it must work through Cloudflare),
  and with a persistent, obvious banner such as “Viewing as Sarah — return to my account”.
- **Full read/write**, per the owner: entries written while swapped belong to the person being acted
  as, exactly as if they had logged them. There is no second data model.
- `GET /api/users` returns the user list **only to an admin**; for everyone else it stays
  unavailable. That removes the current "unused endpoint for viewing others' data" exposure.

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

No notifications (decision 46), but a report is wanted. Recommended shape: a **report card view** in
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
