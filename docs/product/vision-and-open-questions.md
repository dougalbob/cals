# Vision & Open Questions — the "grill me" document

| Field | Value |
|---|---|
| **Status** | 🟡 **LIVE DISCOVERY** — nothing in here is a commitment. It is the working list of things we do not yet know |
| **Started** | 2026-10-02 |
| **Owner** | @dougalbob |
| **Purpose** | Get to a shared understanding of what cals should *become* before deciding what to rebuild and in what order |
| **Related** | [`../architecture/frontend-strategy.md`](../architecture/frontend-strategy.md), [`../architecture/local-development.md`](../architecture/local-development.md) |

**How to use this document.** Answer in any order, in any level of detail — including "don't know yet" and "that's not important". The questions are ordered by how much they change the plan, not by how interesting they are. Section A–C are the ones that block Phase 11; the rest can be answered as we go. Anything settled moves to the [Decisions](#decisions-so-far) section at the bottom with a date.

---

## A. Who uses it, and how (highest impact)

The app already supports multiple users — every request carries an email from Cloudflare, and an account is auto-created on first visit (`internal/handlers/users.go`). There is even a `GET /api/users` endpoint whose comment says *"for viewing others' data"*, but no screen uses it.

You mentioned your wife has daily water targets. That single detail changes the shape of the app a lot.

1. **Is she a user of cals, or is the water target just something you'd like tracked for both of you?**
2. **If she uses it: does she log her own food and water, or do you log everything and she reads it?**
   - *Why it matters:* separate logins → per-user data everywhere (already supported), plus a user switcher and "viewing someone else's day" screens. One logger → a simpler model where one person operates two diaries.
3. **Should you be able to see each other's days side by side**, or is it strictly private per person?
4. **Does she use an iPhone, Android, or a desktop browser?** (This decides how much the PWA matters, and whether widgets/notifications are realistic.)
5. **Is anyone else likely to join** (family, a friend), or is "2 people, one household" the ceiling?
6. **One Cloudflare Access policy for both of you, or separate?** Access is what gates the app today; a second user may need adding to the policy.

## B. Water

Worth knowing what exists today, because it is a mess of two half-built things:

- The `users` table has `daily_water_goal_ml`, and the Settings screen can edit it.
- The Diary screen has a "Water 0 / 2000 ml" line — but **the consumed figure is hard-coded to 0**. The element is never updated by any code. It has never worked.
- There is a `water_entries` table in the schema with **no handlers and no endpoints at all** — dead schema.
- Separately, the `drinks` table ships a default "Water" drink (0 kcal), so water can also be logged as a drink.

So: three representations of water, none of them complete.

7. **Should water be its own thing, or just a drink with 0 calories?**
   - *My recommendation:* its own small feature — a dedicated water card on the Diary, logged in one tap, with a per-user daily target. Calorie-wise it is irrelevant (0 kcal), so it does not belong in the calorie maths at all.
8. **What unit does she think in — ml, glasses, pints?** And what sizes are the usual ones (250 ml glass? 500 ml bottle?)
9. **Should water be a target (fill to 100%) or a limit?** Any reminder if she's behind by evening?
10. **Does it need to appear in the weekly/monthly stats**, or is it purely a daily nudge?
11. If water becomes its own feature, **is the default "Water" drink removed** to avoid two ways of logging the same thing?

## C. Drinks and alcohol

The good news: drinks are already a first-class feature — `drinks` (a reusable template with name, icon, volume, calories) and `drink_entries` (per-day log). Defaults seeded per user are coffee, water, beer and milk, and calories are **fixed per drink** rather than calculated from volume and ABV.

That model already matches the "sensible median" idea you described. What's missing is the arithmetic: **`bank.go` counts only food, so drink calories are excluded from the bank** even though the diary ring includes them. That is the inconsistency I flagged; your answer resolves it — drinks should count.

12. **Which drinks actually get logged in your house?** (Real examples help: 175 ml glass of red, 330 ml bottle of lager, pint, G&T, spirits measure, zero-alcohol beer.)
13. **Median approach — confirm the principle:** one sensible calorie number per drink type and typical size, editable by you, with no ABV maths and no per-100 ml calculations. **Do you want typical sizes as presets** (e.g. "Glass of wine (175 ml) ≈ 133 kcal", "Bottle of beer (330 ml) ≈ 140 kcal", "Pint of lager (568 ml) ≈ 240 kcal")?
14. **Are you interested in alcohol units (UK 14 units/week), or is the calorie figure enough?**
15. **Should the app flag heavy drinking weeks** or is that nagging you don't want?
16. **Should a drink attach to a meal** (wine with dinner), or stay in the separate Drinks section? Today it is separate, which loses the context.
17. **Zero-calorie drinks** (water, black coffee, diet mixers) — do they need to appear in the calorie ring at all, or only in a separate fluid/water view?

## D. The calorie bank

The bank is the most distinctive feature of cals. It runs from a `bank_start_date` (configurable) and compounds: budget minus consumed, carried forward forever, with today's ring sized to goal + bank.

18. **Does it ever reset?** Currently it rolls on indefinitely from the start date, so the balance can grow unbounded. Would a monthly or quarterly reset make it more meaningful?
19. **Should exercise credit the bank?** Google Fit steps are already synced but have no effect on the maths. "Eat back your steps" is a real feature decision (and a common source of drift).
20. **Should the bank be per-user, or shared as a household?** (Relevant if you both use it.)
21. **What should happen on a day with no logging at all** — treat it as zero consumed (bank inflates, as it does now) or as "no data"?
22. **Do you ever want to see the bank as an average** ("you've been under by 250 kcal/day for a fortnight") rather than a running total?

## E. Daily logging ergonomics

This is where a rebuild earns its keep, so it is worth being specific about the friction.

23. **What do you log most days that takes the most taps today?** (Porridge, coffee, a habitual breakfast?)
24. **Would "same as yesterday", favourites, or recently-logged shortcuts help?** Any of those would be a headline feature of the rebuild.
25. **Are the four meal slots right** (breakfast, lunch, dinner, snacks)? Anything you log that fits none of them?
26. **Do you ever log recipes by portion weight?** (Already supported — is it used?)
27. **How often do you log away from home** — pub, restaurant, takeaway — where you are estimating rather than weighing? How do you handle it today?
28. **Barcode scanning** — would that be a genuinely useful addition, or is your food repertoire stable enough that it isn't?

## F. Nutrition targets

29. **Are the current traffic-light rules right?** (Protein g/kg bodyweight, fibre 30 g, fat <35%, carbs 45–65%.)
30. **Do you want more than macros + fibre** — salt, sugar, saturated fat, iron? (This means either a better data source or manual entry; FatSecret supplies a limited set today.)
31. **Is the 7-day rolling window the right default**, or do you want to compare against a 28-day trend?
32. **Should targets change with activity** (steps, training) or stay static?

## G. Recipes, Mealie and external data

33. **Is Mealie the long-term home for recipes**, with cals importing one-way? Or would you rather recipes lived only in cals and Mealie disappeared?
34. **Would you want changes made in cals pushed back to Mealie?** (Currently imports only, text ingredients only, no food matching.)
35. **FatSecret is currently IP-whitelisted and only used for food search.** Keep it long-term, or is the local food database enough for your regular foods?
36. **Would you like a proper food database import** (e.g. UK McCance & Widdowson / CoFID) rather than relying on a commercial API?

## H. Devices, form factor and deployment

37. **Phone-first, or desk-first?** The current design is mobile-first; is that right for the rebuild?
38. **Do you need offline logging?** (Food on a plane, no signal.) This is a significant scope decision for a PWA.
39. **Notifications/reminders** — logging reminders, water nudges, weekly summary — wanted or unwanted?
40. **Anything you'd want on a watch or via a shortcut/Siri?**
41. **Do you keep any other trackers** (Apple Health, a smart scale, Strava)? Would integrating help, or is it complexity you don't need?
42. **How is `appdata/cals` backed up today?** (Unraid, presumably — but worth confirming there is a copy, before we make any structural change.)

## I. The rebuild itself — what does "done" look like

43. **What is the single most annoying thing about cals today?** If we fixed only that, would the rebuild still be worth it?
44. **What must never change or be lost?** (My assumption: the bank, your history, the recipe math. Tell me if that's wrong.)
45. **Do you want the app to look the same in the rebuild, or is this a chance to redesign?** (Visual redesign is a much bigger job than a technical rebuild and should be a separate decision.)
46. **What did you like about the Go rebuild on your other project?** Was it the *backend* structure, the *frontend* approach, or the *way it was managed* (phases, reviews, docs)? This directly affects scope — if the Go code itself felt better afterwards, we should talk about whether cals' backend needs the same treatment, which is a bigger project than a frontend rebuild.
47. **Timescale expectation** — is this "a few weeks of evenings", "a background project over months", or "when it's done"? (The phased plan can be paced to match.)
48. **How much do you want to be involved** in reviewing/verifying each phase, versus "show me when it looks finished"?

---

## Decisions so far

| # | Date | Decision | Source |
|---|---|---|---|
| 1 | 2026-10-02 | Drink calories **should** count towards the calorie bank (fixes the current food-only behaviour in `bank.go`) | Owner |
| 2 | 2026-10-02 | Alcohol calories use a **sensible median per drink type**, not a full ABV/beverage database | Owner |
| 3 | 2026-10-02 | Water is a **special case to be tracked in its own right** (wife has daily targets), not merely a drink | Owner |
| 4 | 2026-10-02 | Local development uses a **`DEV_MODE` environment variable** plus a **copy of the data** in `appdata/cals-dev`, so the real data is never touched | Owner |
| 5 | 2026-10-02 | `ai_contextual_docs/context.txt` is **legacy** and is no longer the source of truth; `docs/` is | Owner |

All five are captured in the code/docs where they belong. None of them commit you to a rebuild.

---

## What I'd want answered first

If you only answer four things, these change the most: **A2/A3** (does your wife have her own login and diary?), **B7** (is water its own feature?), **C13** (confirm the drink presets/median approach), and **I46** (what "impressed you" about the other Go rebuild — frontend, backend, or method).
