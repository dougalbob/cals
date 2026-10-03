# Current state — where the cals project is right now

| Field | Value |
|---|---|
| **Status** | 🟢 **ADOPTED — living document. This is the single source of truth for "where are we now".** |
| **Last reviewed** | 2026-10-03 |
| **Owner** | @dougalbob |
| **Purpose** | Stop status drifting across four documents. Anything dated or narrative belongs in [`history/rebuild-log.md`](history/rebuild-log.md); this page describes **today only** and is updated whenever the state changes |
| **Related** | [`architecture/rebuild-kickoff.md`](architecture/rebuild-kickoff.md) (first commands), [`architecture/frontend-strategy.md`](architecture/frontend-strategy.md) (the plan), [`product/vision-and-open-questions.md`](product/vision-and-open-questions.md) (decisions and open questions), [`architecture/data-copy-warning.md`](architecture/data-copy-warning.md) (read before touching appdata) |

> **Starting a session?** Read this page, then [`architecture/rebuild-kickoff.md`](architecture/rebuild-kickoff.md)
> for the first commands and the guardrails. Do not rely on a dated handoff paragraph elsewhere —
> if this page and another document disagree, **this page wins** and the other document is the bug.

---

## 1. What is running, and where

| Thing | Port | State |
|---|---|---|
| **V2 `cals-dev-v2`** — the React rebuild's container | 8151 | **Live and Cloudflare-routed: this is the app the household sees.** Installed from the `cals-dev-v2.xml` Unraid template; appdata `/mnt/user/appdata/cals-dev-v2` holds **live household data**. The newest published checkpoint is **`v2.0.0-dev-rc12`** (2026-10-03: tap-to-filter recipe tags, decisions 41–54, docs restructure — **frontend-only, no migration**), but the container only changes when the owner **Force Update**s in Unraid. Nothing past rc4 has been Force Updated, so the running image may be older than the newest checkpoint — check the in-app footer or `GET /api/version` rather than assuming |
| **V1 `cals-counter`** | 8150 | Legacy vanilla-JS app, still running but **stale**: it stopped receiving household entries when the Cloudflare route moved to 8151 |
| **`cals-dev-identity`** (dev only) | 8152, LAN only | Disposable copy used for the `DEV_IDENTITY_SWITCH` (`/dev/identity`, or the template's WebUI shortcut — the bare LAN URL opens the normal app). **The only container allowed to lose data** |

**The React UI is still only reachable under `/next/`** (`http://<unraid-lan-ip>:8152/next/` on the
LAN-only dev container). The legacy vanilla UI remains the default everywhere; nothing has been cut
over, and Phase 16 owns that.

Everything in this table is explained in [`unraid-image-release.md`](architecture/unraid-image-release.md)
and [`data-copy-warning.md`](architecture/data-copy-warning.md). **Rule of thumb: never delete, reset
or copy over an appdata directory without reading the warning document first.**

### How to tell which build you are looking at

- `GET /api/version` (and the in-app footer) reports the application version — **`2.0.0`** on the V2 line since decision 12; `main` stays on `1.7.0` until promotion.
- Docker image tags identify the checkpoint: `v2.0.0-dev-rcN` (next: **rc12** when this session's work is published). `dev-latest` follows the newest development tag; **`latest` is reserved for a future stable release and has never been published**.

---

## 2. Phase status

Phases 11–16 are defined in [`frontend-strategy.md`](architecture/frontend-strategy.md) §7.

| Phase | State | Notes |
|---|---|---|
| **11 — Foundation** | ✅ Merged (PR #5) | React 19 + TS + Vite + Tailwind shell at `/next/`, typed API client, fixture API, lint/typecheck/tests |
| **12 — Diary** | ✅ Implemented, merged (PR #22, `v2.0.0-dev-rc8`) | Water/quick drinks, one ledger for fluids, drink calories in the bank, quantity Edit, dual ring. **Owner phone-size review on the LAN dev container (both identities) is still outstanding** — it is an acceptance gate, not a blocker for Phase 13 |
| **13 — Foods + Recipes** | 🟡 In progress — three slices merged | **Slice 1** (catalogue, per-user favourites, detail, structured tags, facet filters) owner-reviewed. **Slice 2** (named gram-backed food measures; recipe-to-Diary portions with the remembered usual; decisions 29–32) owner-reviewed, merged (PR #28). **Slice 3** (tap-to-filter recipe tags, decision 41 — plus the docs restructure and decisions 42–54) owner-reviewed in Arena, **merged as PR #30** and published as **rc12**; the phone-size review of it on Unraid is still outstanding |
| **14 — Metrics + Nutrition** | ⬜ Not started | Owns the rolling-window bank metric for the ring (food + drink), the tracked-nutrients settings work (decision 47) and the weekly report |
| **15 — Settings + PWA** | ⬜ Not started | Per-user ring limits and lookback window, the admin "swap user" capability (decision 45), themes, PWA/offline behaviour |
| **16 — Cutover** | ⬜ Not started | Delete the legacy UI, make React the single SPA. Owner-approved UI improvement is the gate |

What exists in the React app today, screen by screen, is listed in
[`web/frontend/README.md`](../web/frontend/README.md) — that file is the detail; this table is the
summary.

---

## 3. Waiting on the owner

| # | What | Where |
|---|---|---|
| 1 | **Force Update `cals-dev-v2` to `rc12`** and review the Recipes tag filter at phone size (also `/next/` on the LAN dev container `8152`). No migration or appdata work — this checkpoint is frontend-only | Unraid → `cals-dev-v2` → Force Update |
| 2 | **Phase 12 acceptance review** — Home and Diary, both identities, phone size (never completed) | `http://<unraid-lan-ip>:8152/next/` |
| 3 | **Record the release-log smoke-test result** after the Force Update, so the log's last column is no longer ⬜ | `unraid-image-release.md` release log |

---

## 4. Next work, in order

1. **Decision 40 — `+ Add recipe` on each Diary meal card**, opening the portion sheet with that meal preselected. Queued; not implemented.
2. **The calendar for historic dates** (decision 49's follow-up) — a month view opened from the Diary's date header, tap a day and land on `/diary/:date`, with markers on days that have data. Small and Diary-shaped, so it is the natural companion to the `+ Add recipe` slice.
3. **Full recipe authoring** (name, ingredients, method, image) — the largest remaining Phase 13 item.
4. **Phase 14** — rolling bank window for the ring (food + drink, completed days only, unlogged days excluded), the weekly report, tracked-nutrients settings and the missing-data audit.
5. **Phase 15** — per-user ring limits/lookback, admin swap-user, themes, PWA install (no offline work: decision 53).

---

## 5. Open questions that change what gets built

Full list and numbering in [`product/vision-and-open-questions.md`](product/vision-and-open-questions.md). The ones
that actually block upcoming work:

| Question | Why it matters | Section |
|---|---|---|
| Away-from-home logging (pub/restaurant/takeaway) | The least precise data the app holds, and the last unanswered logging question | E |
| Nutrient list and coverage rules (decision 47) | Which nutrients to offer, and what a traffic light shows when data is partly covered | F |
| Traffic-light thresholds and the 7-day window | Made urgent by decision 47; the current rules have never been reviewed | F |
| FatSecret long-term, or a UK database (CoFID) | Decides how fillable a nutrient audit can ever be | G |
| Watch/Siri, other trackers | No requirement recorded either way | H |
| Timescale and how involved you want to be | Sizes the plan and the review gates | I |
| **What is the single most annoying thing about cals today?** | Asked at the start, never answered — the best prompt for work the plan hasn't anticipated | I |
| Record the backup's location and cadence | The backup exists (decision 54) but nobody has written down where it is | H |

**Settled on 2026-10-03 (decisions 42–54), so stop asking:** unlogged days are **excluded** from the
bank (a future "Issues" bell flags them instead); the bank stays **per person**; the ring window is
**user-definable** ("since day 1" when none is set); cross-viewing is an **admin role with a
swap-user control**, not a household view; **no notifications**, but a **weekly report** is wanted;
**tracked nutrients are user-selectable checkboxes** with a missing-data audit; steps do **not** credit
the bank for now; the logging flows need nothing new but a **calendar** is planned for reaching
historic dates; **no logging shortcuts**; the **four meal slots stay**; **no barcode scanning**;
**no offline capability**; and the household data **is backed up**.

Full reasoning and every open sub-question:
[`product/vision-and-open-questions.md`](product/vision-and-open-questions.md).

---

## 6. Housekeeping done recently

- **Published `v2.0.0-dev-rc12` (2026-10-03, PR #30):** tag filtering, decisions 41–54 and the docs restructure, merged to `cals-dev` and published by the tag-triggered workflow (run 37130651708; digest `sha256:59631e65…`), with the release log updated. Frontend-only — no migration.

- **Second discovery pass completed (2026-10-03):** the remaining day-to-day questions are answered — logging flows need nothing new but a calendar for historic dates (49), no shortcuts (50), the four meal slots stay (51), no barcode scanning (52), no offline capability (53), and the household data is backed up (54). See §5 and the decision log.
- **Documentation restructure (2026-10-03):** status is now here and nowhere else; `rebuild-kickoff.md` is commands and guardrails only; dated history moved to [`history/rebuild-log.md`](history/rebuild-log.md).
- **Documentation review fixes (2026-10-03), in the same PR:** "17 tables" corrected to **20** in the three places it appeared (re-verified by running the real server in-sandbox); the kickoff's sync check no longer claims `docs/architecture/` holds five documents; the vision document no longer says `GET /api/diary` lacks serving metadata (decision 29 closed that gap).
