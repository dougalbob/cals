# Rebuild Kickoff — read this first

| Field | Value |
|---|---|
| **Status** | 🟢 **ACTIVE HANDOFF — Phase 12 close-out is merged on `cals-dev` (PR #22, merge `f6a6675`) and published as `v2.0.0-dev-rc8`; `dev-latest` points to it.** The first Phase 13 shared-Recipes metadata slice is implemented and owner-reviewed in the Arena preview. The second slice — known-Food serving choices and recipe-to-Diary portions (decisions 29–32) — was owner-reviewed in the Arena preview, merged (PR #28) and published as `v2.0.0-dev-rc11`; the owner's Force Update and phone-size review are pending. A third slice — **recipe tags filter the catalogue when tapped** (decision 41) — is implemented on the current session branch and awaiting preview review. The next slice is **+ Add recipe** on each Diary meal card with the meal preselected (decision 40). Full recipe authoring remains before any production cutover |
| **Written** | 2026-10-02 |
| **Purpose** | Tell the next agent (or the owner) exactly what to do first, without re-reading everything |
| **Related** | [`frontend-strategy.md`](./frontend-strategy.md) (the plan), [`local-development.md`](./local-development.md) (DEV_MODE), [`unraid-image-release.md`](./unraid-image-release.md) (Part 2 — publishing and install), [`../product/vision-and-open-questions.md`](../product/vision-and-open-questions.md) (decisions) |

---

## Current owner-directed handoff (2026-10-02)

1. **Done:** Phase 11 foundation PR #5 is merged into `cals-dev` (merge commit `714780d`; came from the Arena session branch, nothing merged to `main`). The owner explicitly authorized merging it before the Docker build could be run in the sandbox, so that build is recorded as **unverified** — the `Docker build (validation)` workflow added in Part 2 is the gate that now proves the image builds on every pull request.
2. **Installation method (owner decision, 2026-10-02): Docker Compose is retired as an install path.** The `cals-dev-v2.xml` Unraid template + prebuilt GHCR image is the only documented install method; `docker-compose.yml` is kept solely as legacy tooling for the existing V1 server. Every document reflects this — do not reintroduce Compose into installation instructions. PR #6 (merged as `8695c7e`) renamed the V2 development deployment to `cals-dev-v2` end to end and rewrote the install manual.
3. **Done — Part 2: publish the V2 development image** (see [`unraid-image-release.md`](./unraid-image-release.md)):
   - PR #7 added `.github/workflows/docker-validate.yml` (build-only PR check, never pushes) and `.github/workflows/publish-dev-image.yml` (publishes approved `v*-dev*` tags to GHCR and creates prereleases). The publish workflow verifies anonymous pulls, as Unraid does.
   - **Development checkpoints `v2.0.0-dev-rc1` through `v2.0.0-dev-rc8` are published** with prereleases and recorded digests; `dev-latest` now points to rc8. PR #22 (the Phase 12 close-out) adds the opposite bank-ring sweep directions and the Diary quantity-edit action, with no schema migration or data copy.
   - The V2 `cals-dev-v2` container remains installed and Cloudflare-routed on `8151`; publishing a tag does not update a running container, so the owner must Force Update to review rc8.
   - No `latest` image is produced from a development tag; stable publishing is still undesigned. The package name `cals-dev-v2` is deliberately provisional — see the Naming section of `unraid-image-release.md`. This is a technical development image only; it does not complete the UI redesign or authorize a V1 cutover.

### 2026-10-02 (later): V2 live and the DEV identity switch

- **V2 is installed and routed.** `cals-dev-v2` runs on Unraid and the Cloudflare route
  points at `8151`, so V2 is now the app the household sees. It was started from a
  database copy taken on the morning of 2026-10-02 — read
  [`data-copy-warning.md`](./data-copy-warning.md) before touching appdata. V1 on `8150` is
  stale and the two databases are diverging.
- **The DEV identity switch is implemented** (`DEV_IDENTITY_SWITCH`, requires `DEV_MODE`):
  pick any existing user at `/dev/identity` or with `?as=<email>`, remembered in a cookie;
  loopback/private peers only; never enabled on the Cloudflare container. Important navigation
  detail: the bare `http://<unraid-lan-ip>:8152/` URL opens the normal app, not the picker. Use
  `http://<unraid-lan-ip>:8152/dev/identity` (or the template's WebUI shortcut). A blank list
  means the mounted database has no users yet; the picker only lists existing accounts. The
  LAN-only dev container recipe and its ready-to-import template are in
  [`dev-identity-switch.md`](./dev-identity-switch.md) and `cals-dev-identity.xml`.
- **Phase 12 (Diary) is implemented** — drink calories in the bank (+ regression tests), one
  source of truth for water (a `counts_toward_water` flag on drinks, the dead `water_entries`
  table dropped when empty), the quick Tea/Coffee/Water selector from each user's own drinks,
  and a water card with one-tap glass and other-amount entry. Design and decisions:
  [`water-and-drinks.md`](./water-and-drinks.md) and
  [`frontend-strategy.md`](./frontend-strategy.md) §7.2.
- **Phase 12 is merged and published** as `v2.0.0-dev-rc8`: the logged-quantity **Edit** action
  and the opposite bank-ring sweep directions are both on `cals-dev` (PR #22). The remaining work
  is review, not code — Force Update and look at Home and Diary at phone size on the LAN-only dev
  container (`http://<unraid-lan-ip>:8152/next/`) as **both** identities. This Phase 12 review
  remains part of its UI acceptance gate, but Phase 13 implementation has since started: the first
  Recipes metadata increment is owner-reviewed in Arena; the second slice (known-Food serving
  choices and recipe-to-Diary portions with a remembered usual) is owner-reviewed, merged and
  published as `v2.0.0-dev-rc11`. The owner-authorized ring behavior is described in
  [`frontend-strategy.md`](./frontend-strategy.md).
- **Checkpoint `v2.0.0-dev-rc4` is published** (2026-10-02, [run 37066221932](https://github.com/dougalbob/cals/actions/runs/37066221932); digest `sha256:ea5e97aad9551a3e86188bba6296bdbf0fe5b31d01b74fd323ab72fee3919d25`; anonymous pull verified). The LAN dev container (`cals-dev-identity`) tracks `dev-latest`; the owner can Force Update it on `8152` now without changing its template variables or appdata. The new app-header **Switch user** link is included; `/dev/identity` remains available directly. The Cloudflare-routed `cals-dev-v2` container is not automatically updated. Recorded in the [release log](./unraid-image-release.md#release-log).

## 0. Before anything else: get the work

**Anything merged to `cals-dev` is not on `main`.** The Arena branch selector can seed a session
from `cals-dev`, but do not assume the session branch or local remote-tracking refs are current. In
this repository's Arena clone, a plain `git fetch origin` did not fetch `cals-dev` because its fetch
refspec was restricted. Explicitly fetch and merge the integration branch before editing:

```bash
git fetch origin refs/heads/cals-dev:refs/remotes/origin/cals-dev && git merge origin/cals-dev
```

Then confirm you have it: `ls docs/architecture/` should show `frontend-strategy.md`,
`rebuild-kickoff.md` and the rest of the architecture documents (nine at the time of writing), and
`ls web/frontend/` should show the React spike. If `docs/architecture/` is missing
`rebuild-kickoff.md` altogether, you have not synced.

**Never push to `main`.** All work goes to the session branch and PRs target **`cals-dev`**. See
[`git-workflow.md`](./git-workflow.md) and [`../../AGENTS.md`](../../AGENTS.md).

## 1. Start the preview immediately

Arena recycles the sandbox between turns, so the preview must be started in each session — and it is
worth doing first so the owner can watch progress:

```bash
./scripts/serve-frontend-preview.sh          # ~fast, no npm install needed
./scripts/serve-frontend-preview.sh --dev    # Vite + HMR if you are editing the frontend
```

Rebuild the served bundle after changing frontend source: `npm run build:preview` (in
`web/frontend/`; needs `npm ci` first if `node_modules/` is missing).

## 2. You can build and run the real Go server

Despite there being no Go in the sandbox image, a toolchain can be obtained from PyPI (PyPI is
reachable; `go.dev` and the Go proxy are not):

```bash
./scripts/verify-go-in-sandbox.sh          # build only
./scripts/verify-go-in-sandbox.sh --run    # build and serve on :8150
```

This copies the repo to `/tmp/calstest` and builds with CGO. It has been verified: the server
starts, migrations create all 20 tables, `/api/users/me` correctly returns `401` without a
Cloudflare JWT. Nothing in `/tmp` persists between turns. **Docker cannot run in the sandbox** —
the `Docker build (validation)` GitHub Actions workflow builds the image on every pull request, and
the publish workflow builds the exact tagged commit.

## 3. First standalone change: `DEV_MODE` (implemented in this branch)

The owner selected `DEV_MODE` as the first implementation slice. It enables testing against a copy
of the data in `appdata/cals-dev` without changing production authentication or schema. The change
adds:

- Config validation for `DEV_MODE`, `DEV_USER_EMAIL`, and a safe `BIND_ADDRESS` (loopback by
default; explicit binds must be loopback/private).
- A development auth middleware that supplies the selected email only to loopback/private socket
peers, never trusting proxy headers.
- A prominent startup warning with the database path and listener address, plus tests for the
safety boundary and identity behavior.

See [`local-development.md`](./local-development.md) for the runnable workflow, safety constraints,
and verification results. This is still a backend-only local-development exception; the production
Go API, database schema, and Cloudflare auth behavior are unchanged.

## 4. Then the phases

Phases 11–16 are in [`frontend-strategy.md`](./frontend-strategy.md) §7. Owner direction confirmed
on 2026-10-02:

- **Phase 11 is authorized.** Start with the foundation; keep the existing UI as the default and do
  not treat this approval as approval for an unreviewed cutover.
- **UI improvement is a headline requirement.** The rebuild is about how the app feels and works,
  especially on a phone—not just replacing the frontend technology. Phase 11 may be plumbing-only;
  every screen phase must show a concrete improvement in a real preview and get owner review before
  merge/cutover.
- **The owner's wife is the primary user today.** Daily food logging and the water target, on a
  phone, are the flows that matter most — prioritise accordingly (Phase 12 Diary first).
- **Water is a feature to build** (decision 7): it appears as both a drink and a dedicated daily
  target, with **one source of truth** — a flag on `drinks` marking which count toward water, and a
  target derived from those. The unused `water_entries` table must be dropped or repurposed, never
  left as a second ledger.
- **Drink calories count towards the bank** (owner-confirmed and implemented in Phase 12, with a
  regression test in `internal/handlers/bank_test.go`).
- **Diary quick drinks:** preserve a fast, familiar quick-add selector for Tea, Coffee and Water,
  backed by per-user drink definitions (not hard-coded calories). **No starter drinks are provisioned**
  (decision 16); when a user's list is empty, point them to Settings to create their own.

## 5. Guardrails

| Rule | Why |
|---|---|
| Never push, merge or force-push `main` | It is live production; the pre-push hook blocks it |
| PRs target `cals-dev`, never `main` | The owner promotes deliberately |
| Never append to `ai_contextual_docs/context.txt` | It is legacy and frozen; `docs/` is the source of truth |
| Do not add an in-app login page | Identity comes from Cloudflare Access by design |
| Do not seed invented drinks/foods for new users; quick-drink templates must use per-user values | Decisions 8 and 11; starter-template provisioning remains open |
| UI improvement is a headline requirement; preview user-facing work on mobile and state the concrete improvement in its PR | A framework migration/parity alone is not success |
| Run `npm run lint && npm run typecheck && npm test && npm run build` before any frontend PR | Cheap, deterministic, catches regressions |
| Never change the bank, recipe or unit-conversion maths without tests | Those numbers are trusted |
| Publish images only from an approved tag on `cals-dev`, and never assign `latest` to a development candidate | The tag push is the human approval step; `latest` is reserved for a stable release promoted to `main` (see [`unraid-image-release.md`](./unraid-image-release.md)) |

## 6. Definition of done for a phase

- [ ] Committed on the session branch; nothing pushed to `main`
- [ ] `npm run lint && npm run typecheck && npm test && npm run build && npm run build:go` pass (frontend) / `go build ./...` (backend)
- [ ] `Docker build (validation)` check green on the PR for anything that changes the image (or `docker build` locally where Docker is available)
- [ ] Verified against the real server locally where possible (`VITE_API_TARGET=http://localhost:8150`)
- [ ] For user-facing work: previewed at phone size, documented the concrete UX improvement, and obtained owner review before merge/cutover
- [ ] `docs/` updated, and the vision document's decisions table amended if a question was answered
- [ ] PR opened against **`cals-dev`** with a summary and deployment notes

## 7. Open decisions that may affect the work

From [`../product/vision-and-open-questions.md`](../product/vision-and-open-questions.md) — worth
confirming with the owner before building the affected screen:

1. **Cross-viewing** — should either user be able to see the other's day? Decides whether a
   household view exists, and what to do with the unused `GET /api/users` endpoint.
2. **Bank semantics** — does the bank ever reset, should steps credit it, and what does an unlogged
   day count as? Drink inclusion is settled: drinks count.
3. **Quick-drink templates** — should new users receive editable Tea/Coffee/Water starter entries,
   or create those definitions before they appear in the selector?
4. **Logging friction** — what takes the most taps for the primary user; would "same as yesterday"
   or favourites help?

## Dashboard publication handoff — 2026-10-03

Owner reviewed Today dashboard improvements in Arena and authorized the end-to-end
GitHub publication loop. The checkpoint adds the Today landing screen, dual ring,
four meal tiles and shared water/quick drinks with counters and confirmed long-press
delete. Legacy root is still the default; open `/next/` on Unraid to see this work.
No appdata copy or schema migration is required. Review both identities on the LAN dev container
as part of the Phase 12 UI acceptance gate; it no longer blocks the now-started Phase 13 development.
See frontend-strategy.md for the current Phase 13 handoff.

### Owner feedback — 2026-10-03

**Done (2026-10-03, the Phase 12 close-out PR): the Diary quantity-edit gap is closed.** Phase 12 already promised edit, the React view only deleted, and the existing Go `PUT /api/diary/{id}` endpoint plus legacy edit behavior provided the path. Every logged row now has an Edit action with a weight input and live calorie preview; saving rescales that entry's own saved nutrition and refreshes the diary and bank, and zero/negative weights are refused. No backend, schema or appdata change.

The owner approved the interim ring behavior: inner ring on today's goal, outer ring on a signed balance with fixed ±2,000 kcal limits until Phase 15, with the exact balance visible. The owner has since suggested a recent lookback for the outer ring (tentatively 30 completed days) rather than lifetime accumulation: Phase 14 should add a separate food-and-drink rolling metric without changing the cumulative bank, and Phase 15 should make the lookback and limits configurable per user. This is not yet implemented. See [`frontend-strategy.md`](./frontend-strategy.md#owner-requested-diary-and-bank-ring-follow-ups-2026-10-03) and [`vision-and-open-questions.md`](../product/vision-and-open-questions.md#proposed-lookback-window-2026-10-03).

**Owner decision (2026-10-03): opposite sweep directions on the bank ring.** A surplus should
start at 12 o'clock and grow **clockwise**; a deficit should start at the same point and grow
**anticlockwise**, so the sign reads instantly without relying on colour. This is visual only — the
bank figure, the ±2,000 kcal scale, the inner daily-goal ring and all bank maths are unchanged.
It is **implemented** in `web/frontend/src/components/CalorieRing.tsx` on the Phase 12 close-out
session branch (component tests pin both directions; the rendered ring was rasterised and probed at
15° intervals) and needs no schema, API or appdata change. Phase 14's rolling metric and Phase 15's
per-user limits inherit the same direction rule. Details:
[`frontend-strategy.md`](./frontend-strategy.md#opposite-sweep-directions-for-surplus-and-deficit-2026-10-03).

## Tap-to-filter recipe tags — 2026-10-03 (implemented, awaiting preview review)

**Owner request, recorded as decision 41.** The tags already shown on each recipe card — meal
occasion, dish type and known-Food key foods — are now the filters rather than decoration: tap
**Chicken** and the catalogue narrows to chicken recipes; tap **Mushroom** on the
**Chicken & Mushroom Pie** card in that list and it narrows again, because a recipe must carry
**every** selected tag (AND). A “Filtering by” row lists the active tags with per-tag removal and
**Clear tags**, the results line reads “2 of 4 recipes match”, and the three facet dropdowns stay in
step with the tapped tags as a second view of one selection.

Frontend-only: **no API, schema, appdata or migration change** — the tags were already in the recipe
payload. The selection rides in the URL (`/recipes?tags=…`), so it survives reload and Back, and a
tag on a recipe page opens the catalogue already filtered by it. Tests:
`src/lib/recipeTags.test.ts` (keys, AND matching, URL round-trip) and `src/routes/RecipesRoute.test.tsx`
(tap, narrow, remove, clear, empty state, dropdowns in step, detail-page flows). The demo fixture
gained a **Chicken & Mushroom Pie** recipe with a Mushrooms key food so this exact example is
reproducible; that is fixture data only, not a food or recipe created in anyone's database.

Remaining for this slice: the owner's phone-size preview review (the Arena preview, then `/next/` on
the LAN-only dev container). Decision 40 — **+ Add recipe** on each Diary meal card — is still the
queued next slice, and the open question of whether same-facet taps should widen (Lunch **or**
Dinner) rather than continue to AND is recorded in the decision log.
