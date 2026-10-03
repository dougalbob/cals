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
| **V2 `cals-dev-v2`** — the React rebuild's container | 8151 | **Live and Cloudflare-routed: this is the app the household sees.** Installed from the `cals-dev-v2.xml` Unraid template; appdata `/mnt/user/appdata/cals-dev-v2` holds **live household data**. The newest published checkpoint is **`v2.0.0-dev-rc11`**, but the container only changes when the owner **Force Update**s in Unraid — check the running version in the app footer or `GET /api/version` rather than assuming |
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
| **13 — Foods + Recipes** | 🟡 In progress — three slices | **Slice 1** (catalogue, per-user favourites, detail, structured tags, facet filters) owner-reviewed. **Slice 2** (named gram-backed food measures; recipe-to-Diary portions with the remembered usual; decisions 29–32) owner-reviewed, merged (PR #28), published as **rc11**. **Slice 3** (tap-to-filter recipe tags, decision 41) implemented on `arena/01a101f3-cals` (**PR #30**), **awaiting the owner's preview review** |
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
| 1 | **Preview review of Phase 13 slice 3** (tap-to-filter recipe tags) at phone size | Arena preview (fixture API), then `/next/` on `8152` |
| 2 | **Force Update V2 to `rc11`** and phone-size review of the servings/portions slice | Unraid → `cals-dev-v2` → Force Update |
| 3 | **Phase 12 acceptance review** — Home and Diary, both identities, phone size | `http://<unraid-lan-ip>:8152/next/` |
| 4 | **"Lets publish"** for this session's work (merges PR #30 to `cals-dev`, tags `rc12`) | — |

---

## 4. Next work, in order

1. **Decision 40 — `+ Add recipe` on each Diary meal card**, opening the portion sheet with that meal preselected. Queued; not implemented.
2. **Full recipe authoring** (name, ingredients, method, image) — the largest remaining Phase 13 item.
3. **Phase 14** — rolling bank window for the ring (food + drink, completed days only), tracked-nutrients settings and the weekly report.
4. **Phase 15** — per-user ring limits/lookback, admin swap-user, themes, PWA.

---

## 5. Open questions that change what gets built

Full list and numbering in [`product/vision-and-open-questions.md`](product/vision-and-open-questions.md). The ones
that actually block upcoming work:

| Question | Why it matters | Section |
|---|---|---|
| Should steps/exercise credit the bank? (deferred by the owner, 2026-10-03) | Changes Phase 14's rolling maths and the ring | D |
| What takes the most taps in a normal day? | Decides whether "copy yesterday", favourites or saved meals get built | E |
| Are the four meal slots right? | Diary layout; adding a fifth slot is cheap now, awkward later | E |
| Barcode scanning — wanted? | Decides whether a scanner appears in Foods/Diary at all | E |
| Offline logging — wanted? | Decides how much of Phase 15's PWA work is real | H |
| Backup of `appdata/cals` confirmed? | Before any structural change to the database | H |

Answered on 2026-10-03 and now settled: unlogged days are **excluded** from the bank (a future
"Issues" bell will flag them instead), the bank stays **per person**, the ring window becomes
**user-definable** (with "since day 1" as the no-window option), cross-viewing is solved by an
**admin role with a swap-user control** rather than a household view, notifications are **none** but
a **weekly report is wanted**, and **tracked nutrients become user-selectable checkboxes with a
missing-data audit**. Details: decisions 42–47.

---

## 6. Housekeeping done recently

- **Documentation restructure (2026-10-03):** status is now here and nowhere else; `rebuild-kickoff.md` is commands and guardrails only; dated history moved to [`history/rebuild-log.md`](history/rebuild-log.md).
- **Documentation review fixes (2026-10-03), in the same PR:** "17 tables" corrected to **20** in the three places it appeared (re-verified by running the real server in-sandbox); the kickoff's sync check no longer claims `docs/architecture/` holds five documents; the vision document no longer says `GET /api/diary` lacks serving metadata (decision 29 closed that gap).
