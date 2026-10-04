# Rebuild Kickoff — read this first

| Field | Value |
|---|---|
| **Status** | 🟢 **ACTIVE — commands and guardrails only.** Phase status, what is deployed and what is next live in [`../CURRENT_STATE.md`](../CURRENT_STATE.md) and are deliberately **not** repeated here |
| **Written** | 2026-10-02 · restructured 2026-10-03 |
| **Purpose** | Tell the next agent (or the owner) exactly what to do first, without re-reading everything |
| **Related** | [`../CURRENT_STATE.md`](../CURRENT_STATE.md) (status), [`frontend-strategy.md`](./frontend-strategy.md) (the plan), [`git-workflow.md`](./git-workflow.md) (branches and releases), [`unraid-image-release.md`](./unraid-image-release.md) (publishing), [`../product/vision-and-open-questions.md`](../product/vision-and-open-questions.md) (decisions), [`../history/rebuild-log.md`](../history/rebuild-log.md) (what happened) |

---

## 0. Before anything else: get the work

**Anything merged to `cals-dev` is not on `main`.** The Arena branch selector can seed a session
from `cals-dev`, but do not assume the session branch or local remote-tracking refs are current. In
this repository's Arena clone, a plain `git fetch origin` did not fetch `cals-dev` because its fetch
refspec was restricted. Explicitly fetch and merge the integration branch before editing:

```bash
git fetch origin refs/heads/cals-dev:refs/remotes/origin/cals-dev && git merge origin/cals-dev
```

Then confirm you have it: `ls docs/architecture/` should include `rebuild-kickoff.md` and
`frontend-strategy.md`, and `ls web/frontend/` should show the React spike. If `rebuild-kickoff.md`
is missing altogether, you have not synced.

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
`web/frontend/`; needs `npm ci` first if `node_modules/` is missing). The preview's **Restart**
button works because the default path needs no dependencies.

## 2. You can build and run the real Go server

Despite there being no Go in the sandbox image, a toolchain can be obtained from PyPI (PyPI is
reachable; `go.dev` and the Go proxy are not):

```bash
./scripts/verify-go-in-sandbox.sh          # build only
./scripts/verify-go-in-sandbox.sh --run    # build and serve on :8150
```

This copies the repo to `/tmp/calstest` and builds with CGO. It has been verified: the server
starts, migrations create all **20** tables, and `/api/users/me` correctly returns `401` without a
Cloudflare JWT. Nothing in `/tmp` persists between turns. **Docker cannot run in the sandbox** —
the `Docker build (validation)` GitHub Actions workflow builds the image on every pull request *and
starts it against a disposable database to smoke its routes*; the publish workflow builds the exact
tagged commit.

## 2b. You can run the browser suite too

`web/frontend/e2e/` holds a Playwright suite that drives the built bundle in a real Chromium at phone
size. The browser is not downloadable from the sandbox (the CDNs are blocked), but the wrapper fetches
an equivalent build from the npm registry and re-provisions it in seconds:

```bash
./scripts/run-playwright-in-sandbox.sh                        # whole suite
./scripts/run-playwright-in-sandbox.sh e2e/diary.spec.ts      # one spec
./scripts/run-playwright-in-sandbox.sh --project=desktop      # the @desktop project only
```

It is hermetic (pre-built bundle + fixture API in one process — never household data) and the specs
are committed, so a new session runs them as they are. Added 2026-10-04; see
[`testing.md`](./testing.md) for what each layer covers, what survives between sessions, and what is
deliberately not covered.

## 3. The phases

Phases 11–16 are in [`frontend-strategy.md`](./frontend-strategy.md) §7; current phase status is in
[`../CURRENT_STATE.md`](../CURRENT_STATE.md) §2. Owner direction that shapes every phase:

- **UI improvement is a headline requirement.** The rebuild is about how the app feels and works,
  especially on a phone — not just replacing the frontend technology. Every screen phase must show a
  concrete improvement in a real preview and get owner review before merge/cutover.
- **The owner's wife is the primary user today.** Daily food logging and the water target, on a
  phone, are the flows that matter most.
- **Water is both a drink and a dedicated daily target, with one source of truth** (decisions 7 and
  15–16); **no starter drinks are provisioned** — the quick selector shows the user's own drinks and
  points at Settings when there are none.
- **Drink calories count towards the bank** (decision 1; regression-tested in
  `internal/handlers/bank_test.go`).
- **The React UI stays under `/next/`** until the owner approves cutover. Parity is not success.

## 4. Guardrails

| Rule | Why |
|---|---|
| Never push, merge or force-push `main` | It is live production; the pre-push hook blocks it |
| PRs target `cals-dev`, never `main` | The owner promotes deliberately |
| Never append to `ai_contextual_docs/context.txt` | It is legacy and frozen; `docs/` is the source of truth |
| Do not add an in-app login page | Identity comes from Cloudflare Access by design |
| Do not seed invented drinks/foods/recipes for users | Decisions 8 and 16; users create their own |
| Never touch live appdata | `/mnt/user/appdata/cals-dev-v2` is live household data — read [`data-copy-warning.md`](./data-copy-warning.md) first |
| UI improvement is a headline requirement; preview user-facing work at phone size and state the concrete improvement in its PR | A framework migration/parity alone is not success |
| Run `npm run lint && npm run typecheck && npm test && npm run build:go` before any frontend PR | Cheap, deterministic, catches regressions |
| For layout, touch or interaction work, also run `./scripts/run-playwright-in-sandbox.sh` | jsdom cannot see a clipped button, a swipe or a tap being read as text selection |
| Add the `run-e2e` label to a PR whose change deserves the browser suite in CI | The suite is a milestone gate; the label is how a risky UI change gets it before the tag |
| Never change the bank, recipe or unit-conversion maths without tests | Those numbers are trusted |
| Publish images only from an approved tag on `cals-dev`, and never assign `latest` to a development candidate | The tag push is the human approval step; `latest` is reserved for a stable release promoted to `main` |
| Update [`../CURRENT_STATE.md`](../CURRENT_STATE.md) when status changes, and [`../history/rebuild-log.md`](../history/rebuild-log.md) when something lands | Status used to drift across four documents; it now lives in one place |

## 5. Definition of done for a phase

- [ ] Committed on the session branch; nothing pushed to `main`
- [ ] `npm run lint && npm run typecheck && npm test && npm run build:go` pass (frontend) / `go build ./...` (backend)
- [ ] For UI work: `./scripts/run-playwright-in-sandbox.sh` green, and the `run-e2e` label on the PR so CI proves it on the same commit
- [ ] `Docker build (validation)` check green on the PR for anything that changes the image (or `docker build` locally where Docker is available)
- [ ] Verified against the real server locally where possible (`VITE_API_TARGET=http://localhost:8150`)
- [ ] For user-facing work: previewed at phone size, the concrete UX improvement described in the PR, and owner review obtained before merge/cutover
- [ ] [`../CURRENT_STATE.md`](../CURRENT_STATE.md) updated if status changed; [`../history/rebuild-log.md`](../history/rebuild-log.md) given an entry
- [ ] Vision document's decisions table amended if a question was answered
- [ ] PR opened against **`cals-dev`** with a summary and deployment notes

## 6. Open decisions worth confirming before affected work

From [`../CURRENT_STATE.md`](../CURRENT_STATE.md) §5 and
[`../product/vision-and-open-questions.md`](../product/vision-and-open-questions.md):

1. **Steps/exercise and the bank** — the owner deferred this; it changes Phase 14's rolling maths.
2. **Logging friction** — what actually takes the most taps decides whether "copy yesterday",
   favourites or saved meals get built.
3. **Meal slots, barcode scanning and offline logging** — unanswered, and each one changes a screen.
4. **A backup of the household data confirmed** — worth checking before any structural change.
