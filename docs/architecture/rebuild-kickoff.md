# Rebuild Kickoff — read this first

| Field | Value |
|---|---|
| **Status** | 🟢 **ACTIVE HANDOFF — Phase 11 PR #5 is merged into `cals-dev` (merge `714780d`); the focused task is now Part 2: publish the first V2 GHCR image, after which the owner installs V2 from the `cals-dev-v2.xml` Unraid template |
| **Written** | 2026-10-02 |
| **Purpose** | Tell the next agent (or the owner) exactly what to do first, without re-reading everything |
| **Related** | [`frontend-strategy.md`](./frontend-strategy.md) (the plan), [`local-development.md`](./local-development.md) (DEV_MODE), [`unraid-image-release.md`](./unraid-image-release.md) (next session's Part 2), [`../product/vision-and-open-questions.md`](../product/vision-and-open-questions.md) (decisions) |

---

## Current owner-directed handoff (2026-10-02)

1. **Done:** Phase 11 foundation PR #5 is merged into `cals-dev` (merge commit `714780d`; came from the Arena session branch, nothing merged to `main`). The owner explicitly authorized merging it before the Docker build could be run in the sandbox, so that build is recorded as **unverified** — Part 2's build-only CI check is the gate that must pass before the first image is published.
2. **Installation method (owner decision, 2026-10-02): Docker Compose is retired as an install path.** The `cals-dev-v2.xml` Unraid template + prebuilt GHCR image is the only documented install method; `docker-compose.yml` is kept solely as legacy tooling for the existing V1 server. Every document now reflects this — do not reintroduce Compose into installation instructions.
3. **Next session:** pick up **Part 2 — publish the first V2 image** from [`unraid-image-release.md`](./unraid-image-release.md). Part 2 targets `ghcr.io/dougalbob/cals-dev-v2`, publishes an exact `v2.0.0-dev-rc1`-style prerelease tag plus `dev-latest`, and smoke-tests the image on Unraid using [`../../cals-dev-v2.xml`](../../cals-dev-v2.xml). After the first successful publication, the owner copies `cals-dev-v2.xml` into the Unraid Docker UI (DockerMan) and creates the `cals-dev-v2` container from it as the source template. The package name `cals-dev-v2` is deliberately provisional — the owner plans to rename the package later; see the Naming section of `unraid-image-release.md`. This is a technical development image only; it does not complete the UI redesign or authorize a V1 cutover.

## 0. Before anything else: get the work

**Anything merged to `cals-dev` is not on `main`.** The Arena branch selector can seed a session
from `cals-dev`, but do not assume the session branch or local remote-tracking refs are current. In
this repository's Arena clone, a plain `git fetch origin` did not fetch `cals-dev` because its fetch
refspec was restricted. Explicitly fetch and merge the integration branch before editing:

```bash
git fetch origin refs/heads/cals-dev:refs/remotes/origin/cals-dev && git merge origin/cals-dev
```

Then confirm you have it: `ls docs/architecture/` should show five documents, and
`ls web/frontend/` should show the React spike.

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
starts, migrations create all 17 tables, `/api/users/me` correctly returns `401` without a
Cloudflare JWT. Nothing in `/tmp` persists between turns. **Docker cannot run in the sandbox** —
image builds must be checked by the owner.

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
- **Drink calories count towards the bank** (owner-confirmed). The current `bank.go` still ignores
  drink calories; implement the fix with a regression test in Phase 12.
- **Diary quick drinks:** preserve a fast, familiar quick-add selector for Tea, Coffee and Water,
  backed by per-user drink definitions (not hard-coded calories). Whether new users receive editable
  starter templates for these three remains to be confirmed before Phase 12; no generic defaults.

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

## 6. Definition of done for a phase

- [ ] Committed on the session branch; nothing pushed to `main`
- [ ] `npm run lint && npm run typecheck && npm test && npm run build && npm run build:go` pass (frontend) / `go build ./...` (backend)
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
