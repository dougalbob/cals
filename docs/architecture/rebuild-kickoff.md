# Rebuild Kickoff — read this first

| Field | Value |
|---|---|
| **Status** | 🟢 **ACTIVE** — the starting point for the migration. Expected to be retired once Phase 12 is under way |
| **Written** | 2026-10-02 |
| **Purpose** | Tell the next agent (or the owner) exactly what to do first, without re-reading everything |
| **Related** | [`frontend-strategy.md`](./frontend-strategy.md) (the plan), [`local-development.md`](./local-development.md) (DEV_MODE), [`../product/vision-and-open-questions.md`](../product/vision-and-open-questions.md) (decisions) |

---

## 0. Before anything else: get the work

**Anything merged to `cals-dev` is not on `main`.** A new Arena session's branch is created from
`main`, which does **not** contain the spike, the docs, or the scripts. So the very first command of
a migration session is:

```bash
git fetch origin && git merge origin/cals-dev
```

Then confirm you have it: `ls docs/architecture/` should show four documents, and
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
`web/frontend/`; needs `npm install` first).

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

## 3. The first PR: `DEV_MODE`

Recommended as the first piece of work, because everything else depends on it and it is small
(~40 lines plus config):

- Implement `DEV_MODE` exactly as specified in [`local-development.md`](./local-development.md),
  including its safety design: refuse to start if `DEV_MODE=true` is combined with a public bind,
  only honour the bypass for loopback/private requests, and log a loud startup banner.
- It unblocks running the real backend locally against **a copy** of the data in
  `appdata/cals-dev`, which is how the owner verifies each phase.
- `DEV_USER_EMAIL` matters more than usual: identity comes from Cloudflare Access and there is **no
  in-app login page**, so this is the only way to see a given person's screens locally.

If the owner prefers, this can be done as part of Phase 11 instead — but it should happen before any
frontend screen is tested against real data.

## 4. Then the phases

Phases 11–16 are in [`frontend-strategy.md`](./frontend-strategy.md) §7. Two adjustments from the
vision answers (2026-10-02):

- **The owner's wife is the primary user today.** Daily food logging and the water target, on a
  phone, are the flows that matter most — prioritise accordingly (Phase 12 Diary first).
- **Water is a new feature to build** (decision 7), not just a tweak: it appears as both a drink and
  a dedicated daily target, with **one source of truth** — a flag on `drinks` marking which count
  toward water, and a target derived from those. The unused `water_entries` table must be dropped or
  repurposed, never left as a second ledger.
- **The drinks/bank fix (decision 1) belongs in Phase 12**, not later: `bank.go` currently ignores
  drink calories while the diary ring includes them. Add a regression test.

## 5. Guardrails

| Rule | Why |
|---|---|
| Never push, merge or force-push `main` | It is live production; the pre-push hook blocks it |
| PRs target `cals-dev`, never `main` | The owner promotes deliberately |
| Never append to `ai_contextual_docs/context.txt` | It is legacy and frozen; `docs/` is the source of truth |
| Do not add an in-app login page | Identity comes from Cloudflare Access by design |
| Do not seed invented drinks/foods for new users | Decision 8 |
| Run `npm run typecheck && npm test && npm run build` before any frontend PR | Cheap, deterministic, catches regressions |
| Never change the bank, recipe or unit-conversion maths without tests | Those numbers are trusted |

## 6. Definition of done for a phase

- [ ] Committed on the session branch; nothing pushed to `main`
- [ ] `npm run typecheck && npm test && npm run build` pass (frontend) / `go build ./...` (backend)
- [ ] Verified against the real server locally where possible (`VITE_API_TARGET=http://localhost:8150`)
- [ ] `docs/` updated, and the vision document's decisions table amended if a question was answered
- [ ] PR opened against **`cals-dev`** with a summary and deployment notes

## 7. Open decisions that may affect the work

From [`../product/vision-and-open-questions.md`](../product/vision-and-open-questions.md) — worth
confirming with the owner before building the affected screen:

1. **Cross-viewing** — should either user be able to see the other's day? Decides whether a
   household view exists, and what to do with the unused `GET /api/users` endpoint.
2. **Bank semantics** — does the bank ever reset, should steps credit it, what does an unlogged day
   count as?
3. **Logging friction** — what takes the most taps for the primary user; would "same as yesterday"
   or favourites help?
