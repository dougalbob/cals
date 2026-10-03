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
