# Drinks builder and quick-drinks grid

| Field | Value |
|---|---|
| **Status** | 🟡 **Implemented, awaiting owner preview** — product decisions 21–26 |
| **Updated** | 2026-10-03 |
| **Decision owner** | @dougalbob |
| **Related** | [`water-and-drinks.md`](./water-and-drinks.md) (ledger), [`../product/vision-and-open-questions.md`](../product/vision-and-open-questions.md) (decisions 8, 16, 19, 21–26) |

This is the *setup and daily UX* for drinks. The ledger (one `drink_entries` table, water derived from `counts_toward_water`, calories snapshot on log) stays as adopted in [`water-and-drinks.md`](./water-and-drinks.md).

## Why not a 12-tile matrix in Settings

An earlier idea was a Settings panel of ~12 tiles (tea, coffee, cocoa, …) where the user ticks 8 and then tweaks calories. That conflates “what exists” with “what I drink”, and it puts a kitchen repertoire next to calorie-goal / bank-date controls.

The replacement is a **dedicated My drinks page** (a profile, not a setting) plus a **2×2 quick-add grid** on Today. Settings stays goals and bank.

Decision 16 still holds: **nothing is auto-inserted into `drinks`**. The catalog is a picker of templates. Choosing a type `POST`s a row for *that user only*.

## Per-user implementation (already true)

There is no extra “profile” table. Identity is Cloudflare email → `users` row. `GET /api/drinks` already returns only that user’s definitions. Two people in the household can pick different subsets, different usuals, different calories, and never see each other’s tiles.

| Piece | Where it lives |
|---|---|
| Catalog of types (Coffee, Tea, …) | Frontend constants — not in SQLite, not per-user |
| “I drink this” | A `drinks` row for that `user_id` |
| Usual volume / calories / milk / sugar | Columns on that row (calories baked from template + usual extras) |
| Today’s 2×2 | That user’s `drinks`, excluding Water |
| A logged mug | `drink_entries` snapshot (unchanged) |

Empty list remains valid. The card empty-state and the glass (if no Water drink) both point at My drinks.

## Daily UX — Today card

Left: water glass. Right: quick drinks. Same merged card as decision 19.

### Glass is the water button

Tapping the glass logs one unit of the user’s Water drink (`volume_ml` = glass size). “+ other amount” stays for odd sizes. Water is **not** a tile in the 2×2 — that was duplicating the glass.

If the user has no Water drink yet, the glass is inert and the card points them at My drinks to set a glass size.

### 2×2 grid, equal width, scroll the rest

- CSS two-column grid, each button `width: 100%` of its cell so they centre in the drinks half (the mobile papercut: `flex-wrap` chips of uneven width).
- At most two rows visible. More than four drinks: vertical scroll-snap, one row at a time, with a short haptic on snap where `navigator.vibrate` exists.
- Order: user `sort_order` (default = order added). Water filtered out.

### One tap vs vary

| Gesture | Effect |
|---|---|
| Tap the tile | Log that drink’s **usual** (baked calories and volume). One tap. |
| Chevron / ⋯ on the tile | Only on types that accept milk and/or sugar. Opens a small sheet for **this log only**. Does not change the usual. |
| Long-press | Unchanged: confirm, then delete the latest entry of that drink. |

Juice, milk-as-a-drink, squash, soft drink, beer, wine have no chevron — they cannot take milk or sugar, which is how the “orange juice problem” is solved. The type carries `accepts_milk` / `accepts_sugar`; the sheet is simply not offered. **The type decides even when a row's columns were never set** (decision 103): the additive extras migration defaulted every pre-existing row to 0, so `drinkExtras()` ORs the stored flags with the catalog type's rather than trusting `false` alone — otherwise legacy Tea and Coffee rows lose the button. Only the *accepts* pair is widened: the row's own usual milk/sugar (and its calories) are what the editor saves, and saving from *My drinks* persists the type's flags onto the row.

**Vary sheet (decision 24):** milk = none / with milk; sugar = 0 / 1 / 2 / sweetener. Prefills the user’s usual. Calories use household medians (same spirit as decision 2 — not a beverage database):

| Extra | kcal added |
|---|---|
| With milk (splash of semi-skimmed, ~30 ml) | +15 |
| Per teaspoon of sugar | +16 |
| Sweetener | 0 |

`POST /api/drinks/entries` today only accepts an optional `volume_ml` and *scales* calories. A vary-log is not a volume change, so the handler needs an additive calorie (or extras) override that still snapshots onto the entry. One-tap logs stay on the existing path.

## My drinks page

Not a fifth bottom-nav tab. Linked from:

- an edit control on the fluids card
- Settings (“My drinks”)
- empty states on the glass / grid

Layout, top to bottom:

1. **Glass size** — ml stepper. Creates or updates the user’s Water drink (`counts_toward_water = 1`). Not a catalog tile.
2. **Catalog** — types in this order so the everyday four are on screen without scrolling:

   | Order | Type | Default ml | Base kcal | Milk | Sugar | Counts toward water (default) |
   |---|---|---|---|---|---|---|
   | 1 | Coffee | 250 | 2 | yes | yes | yes |
   | 2 | Tea | 250 | 2 | yes | yes | yes |
   | 3 | Milk | 200 | 100 | no | no | no |
   | 4 | Juice | 200 | 90 | no | no | no |
   | 5 | Cappuccino | 240 | 80 | no (already milky) | yes | no |
   | 6 | Latte | 240 | 120 | no (already milky) | yes | no |
   | 7 | Hot chocolate | 250 | 150 | no | yes | no |
   | 8 | Squash | 250 | 20 | no | no | yes |
   | 9 | Soft drink | 330 | 140 | no | no | no |
   | 10 | Beer | 330 | 140 | no | no | no |
   | 11 | Wine | 175 | 160 | no | no | no |

3. Tapping a type selects it (creates the `drinks` row) and opens a tweak sheet: volume, usual milk/sugar where the type allows, resulting calories (editable), water flag. Deselecting removes it from the 2×2; historical `drink_entries` must **not** be cascade-deleted (today `DELETE /api/drinks/{id}` does delete entries — that needs a follow-up so history survives).

Base kcal figures are starting points the user is expected to edit. Cappuccino / latte / hot chocolate treat milk as inherent, so the vary sheet is sugar-only.

A later “custom” type (name + ml + kcal, no extras) is allowed; it is not in v1.

## Schema / API (additive, when built)

Proposed, not yet in code:

- `drinks.sort_order`
- `drinks.accepts_milk`, `drinks.accepts_sugar`
- `drinks.usual_milk` (0 none / 1 with), `drinks.usual_sugar` (0 / 1 / 2 / sweetener)
- `POST /api/drinks/entries` accepts an optional calorie override (or milk/sugar extras) so a vary-log snapshots the adjusted figure without pretending it was a different volume
- Stop cascade-deleting `drink_entries` when a definition is removed

Calories on the row remain “my usual”. Editing a definition still does not rewrite history.

## Rejected options

| Option | Why not |
|---|---|
| Tile matrix in Settings, tick 8 of 12, then tweak | Two-step, wrong place, feels like config not “my kitchen” |
| Confirm sheet on every tea/coffee tap | Extra tap on the most common daily action |
| Milk: none / splash / normal on the vary sheet | Owner chose the simpler none / with milk |
| Auto-seed Tea/Coffee/Water rows | Decision 16 |
| Fifth bottom-nav tab for drinks | Today / Diary / Metrics / Foods is already tight on a phone |
| Water tile in the 2×2 as well as the glass | Duplicate; glass is the unit tap |

## Implementation order

1. Card: equal-width 2×2, filter Water out of the grid, glass tap logs one unit, empty-state link. **Done.**
2. My drinks page + catalog picker + glass size, against `POST/PUT /api/drinks`. **Done.**
3. Vary chevron + calorie override on entries + `accepts_*` / `usual_*` columns. **Done.**
4. Scroll-snap + haptic for more than four drinks. **Done.**

Awaiting phone-size preview before “let’s publish”.
