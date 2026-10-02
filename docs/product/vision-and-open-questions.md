# Vision & Open Questions — the "grill me" document

| Field | Value |
|---|---|
| **Status** | 🟡 **LIVE DISCOVERY** — the working list of things we do not yet know. Answers are recorded in [Decisions so far](#decisions-so-far) |
| **Started** | 2026-10-02 |
| **Owner** | @dougalbob |
| **Purpose** | Get to a shared understanding of what cals should *become* before deciding what to rebuild and in what order |
| **Related** | [`../architecture/frontend-strategy.md`](../architecture/frontend-strategy.md), [`../architecture/local-development.md`](../architecture/local-development.md) |

**How to use this.** Answer in any order, in any level of detail — including "don't know yet" and "that's not important". Sections marked ✅ are settled; the rest are open. Anything answered moves to [Decisions so far](#decisions-so-far) with a date.

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

- **Does either of you ever need to see the other's day?** For example, you checking whether she hit her water goal, or a shared household view. The backend has an unused `GET /api/users` endpoint commented *"for viewing others' data"*, so it was once intended. If the answer is yes, that is a new screen; if no, the endpoint should probably be removed or locked down rather than left exposed.
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

**Still open**

- **Units:** ml, glasses, or pints? What are her usual sizes (a 250 ml glass, a 500 ml bottle)?
- **Logging:** one tap for a standard glass, or a small size chooser?
- **Target:** per-person (already per-user in the schema) — does hers differ from the 2000 ml default?
- **Reminders** if she is behind, or purely a visual target to fill?
- Does water belong in the weekly/monthly stats, or is it a daily nudge only?

## C. Drinks and alcohol — ✅ answered

**Answered (2026-10-02): drinks are user-defined**, with each drink's own calorie and typical-volume values. No ABV maths or beverage database. The owner has also confirmed that **drink calories count towards the calorie bank**; this is a settled product decision, although the current Go bank calculation still needs the Phase 12 code fix and regression test.

### Headline Diary interaction: quick drinks

The Diary must retain a fast, familiar quick-add interaction like the current build: a quick drink selector for **Tea, Coffee and Water**, with a direct add action. Those choices must use the signed-in user's drink definitions, including that user's volume and calorie values; do not hard-code nutrition values into the UI. The existing decision against invented default drinks remains in force. Whether Tea, Coffee and Water should be provisioned as editable starter templates for brand-new users, or shown after the user creates them, remains an implementation detail to settle before Phase 12.

**Implications**

- Do not auto-create generic drink defaults for new users. Preserve existing saved drinks; users can define drinks with a name, icon, typical volume and calories.
- The quick selector is a required Diary feature, not a passive drinks summary. It must make Tea, Coffee and Water quick to add using user-specific drink definitions.
- Drink calories count in the daily total **and** the cumulative calorie bank. The current `internal/handlers/bank.go` still sums only food diary entries; Phase 12 must correct this with a regression test before the new Diary is accepted.
- Adding or configuring a drink must stay quick enough to do mid-evening.

**Still open**

- Should a drink optionally attach to a **meal** (wine with dinner), or stay in its own section? It is separate today.
- Do you want **alcohol units** (UK 14/week) tracked, or is the calorie figure sufficient?
- Should **0 kcal drinks** (water, black coffee) appear in the calorie ring at all, or only in the water/fluids view?

## D. The calorie bank

The bank is the most distinctive feature of cals. It runs from a `bank_start_date` (configurable) and compounds: budget minus consumed, carried forward, with today's ring sized to goal + bank. **Drink calories are confirmed as consumption and must reduce the bank, just like food calories.** The current implementation does not yet do that; Phase 12 owns the fix and regression test.

1. **Does it ever reset?** Right now it rolls on indefinitely, so the balance can grow unbounded. Would a monthly or quarterly reset make it more meaningful?
2. **Should exercise credit the bank?** Google Fit steps are already synced but have no effect on the maths. "Eat back your steps" is a real decision, and a common source of drift.
3. **Should the bank be per-user, or shared as a household?**
4. **What should a day with no logging at all count as** — zero consumed (bank inflates, as now), or "no data"?
5. **Would an average be more useful than a running total** — e.g. "you've been under by 250 kcal/day for a fortnight"?

## E. Daily logging ergonomics

This is where a rebuild earns its keep, so it is worth being specific about the friction.

6. **What do you (or your wife) log most days that takes the most taps today?** A habitual breakfast, coffee, the same lunch?
7. **Would "same as yesterday", favourites, or recently-logged shortcuts help?** Any of these would be a headline feature of the rebuild.
8. **Are the four meal slots right** (breakfast, lunch, dinner, snacks)? Is there anything logged that fits none of them?
9. **Do you ever log recipes by portion weight?** (Already supported — is it actually used?)
10. **How often do you log away from home** — pub, restaurant, takeaway — where you're estimating rather than weighing? How is that handled today?
11. **Barcode scanning** — genuinely useful, or is the food repertoire stable enough that it isn't?

## F. Nutrition targets

12. **Are the current traffic-light rules right?** (Protein g/kg bodyweight, fibre 30 g, fat <35%, carbs 45–65%.)
13. **Do you want more than macros and fibre** — salt, sugar, saturated fat, iron? That means either a richer data source or manual entry; FatSecret supplies a limited set today.
14. **Is the 7-day rolling window right**, or would a 28-day trend be more useful?
15. **Should targets change with activity** (steps, training), or stay static?

## G. Recipes, Mealie and external data

16. **Is Mealie the long-term home for recipes**, with cals importing one-way? Or would you rather recipes lived only in cals?
17. **Would you want changes made in cals pushed back to Mealie?** (Today: imports only, text ingredients only, no food matching.)
18. **FatSecret is IP-whitelisted and used only for food search.** Keep it long-term, or is the local food database enough for your regular foods?
19. **Would a proper UK food database import** (e.g. McCance & Widdowson / CoFID) be more useful than a commercial API?

## H. Devices, form factor and deployment

20. **Phone-first, or desk-first?** The current design is mobile-first; is that right?
21. **Do you need offline logging?** (No signal, on a train.) A significant scope decision for a PWA.
22. **Notifications and reminders** — logging nudges, water nudges, a weekly summary — wanted or unwanted?
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
| 1 | 2026-10-02 | Drink calories **count** towards the calorie bank (owner-confirmed; current food-only bank calculation is scheduled for correction with a Phase 12 regression test) | Owner |
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

Decisions 1–3 and 6–11 guide feature behaviour and delivery. Decision 10 is the user-facing success criterion; decision 11 authorizes the foundation phase, not an unreviewed production cutover.

---

## Where to go next

Core identity and the main direction for drinks are settled; water units/target details and a few drink-template choices remain open. The highest-value open questions now are:

1. **Cross-viewing** (section A) — should either of you see the other's day? It decides whether a "household" screen exists, and whether the unused `GET /api/users` endpoint stays.
2. **Bank semantics** (section D, questions 1–4) — reset behaviour, exercise credit, and what an unlogged day counts as. Drink inclusion is settled; these remaining questions still affect the maths.
3. **Logging friction** (section E, questions 6–8) — what actually takes the most taps for the primary user.
4. **Quick-drink setup** — whether new users should get editable Tea/Coffee/Water starter templates, or create their own before those options appear in the selector.
