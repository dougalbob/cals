# Git Workflow & Branch Strategy

| Field | Value |
|---|---|
| **Status** | 🟢 Adopted (branch topology) / 🟡 protection rules now *available* (repository is public) but not yet applied |
| **Date** | 2026-10-02 |
| **Decision owner** | @dougalbob |
| **Related** | [`frontend-strategy.md`](./frontend-strategy.md), [`../../AGENTS.md`](../../AGENTS.md) |

---

## 1. The situation this solves

`main` is **production code that is live and in use**. It is also old, and it is the branch every tool defaults to. That combination is how a working production app gets broken by an accidental push or an agent that merges its own work.

Goals, in priority order:

1. **`main` is never written to except by a deliberate release merge.**
2. Day-to-day and AI-agent work lands on an integration branch (`cals-dev`) and is reviewed before it reaches `main`.
3. Future Arena sessions, and any other AI assistant, know the rules automatically — without the owner having to re-explain them each time.

### Current repository state (verified 2026-10-02)

| Item | State |
|---|---|
| Default branch | `main` (production — treat as read-only) |
| Remote branches | `main`, `cals-dev`, `arena/01a0fc78-cals`, `arena/01a0fd8b-cals`, and the merged `copilot/*` branches |
| `main` tip | `d65812c` — "Merge pull request #2 from dougalbob/copilot/main" |
| `cals-dev` tip | `8695c7e` — "Merge pull request #6 from dougalbob/arena/01a0fd7b-cals" |
| Branch protection on `main` | **Still none applied**, but it is now *available*: the repository is public, so GitHub Free supports branch protection and rulesets (§4.1) |
| Integration branch `cals-dev` | Present on GitHub; every change reaches it through a PR |
| Repo visibility | **Public** (`dougalbob/cals`) — made public by the owner on 2026-10-02 as a prerequisite of the V2 image publication path (see [`unraid-image-release.md`](./unraid-image-release.md), Part 2 item 1). The repository holds the application source only; the database, appdata and `.env` never live in Git |
| Arena session branches | Named `arena/<session-id>` and fixed for the lifetime of the session; the Arena branch selector determines their starting ref |

---

## 2. Target branch topology

```
main            ← production. Release merges only. Never pushed to directly.
  ▲
  │  PR: "release: promote cals-dev to main"   (only after checks + a look at the diff)
  │
cals-dev        ← integration. The default target for all work.
  ▲
  │  PR from each piece of work
  │
arena/<session-id>   copilot/<topic>   feat/<topic>   fix/<topic>
```

Rules:

1. **All work happens on a topic branch.** Never commit to `main` locally and never `git push origin main`.
2. **Every change reaches `cals-dev` through a pull request**, even solo. A PR is a reviewable unit, a place for CI checks, and a rollback point.
3. **Only a release PR moves `cals-dev` into `main`**, and only after the change has run in your Unraid deployment without incident for a few days.
4. **`main` stays the GitHub default branch** for now — changing the default affects clones and deployment scripts. (Reconsider only if you deliberately want new clones to start on `cals-dev`.)

---

## 3. `cals-dev` setup (completed)

The owner created and pushed `cals-dev`; it is present on GitHub and currently points to `a9494cc` (the merge of PR #3). Do not create it again. Arena's branch selector can start a session from `cals-dev`, and each session branch remains fixed after it is created.

Some Arena clones restrict `remote.origin.fetch` to `main` and the current session branch. A plain `git fetch origin` may therefore leave `origin/cals-dev` unavailable locally even though it exists on GitHub. Use this explicit fetch before merging or creating a local topic branch:

```bash
git fetch origin refs/heads/cals-dev:refs/remotes/origin/cals-dev
git merge origin/cals-dev
```

---

## 4. Protecting `main` on GitHub

### 4.1 The plan limitation (historical — it no longer applies)

GitHub only offers protected branches and rulesets on **private** repositories for **GitHub Pro / Team / Enterprise Cloud / Enterprise Server**. On GitHub Free, protection works on public repositories only.

Until 2026-10-02 this repository was **private**, so protection could not be enforced at all and the convention-based layer in §4.3 was the only defence. **The owner made the repository public on 2026-10-02** as a prerequisite of the first V2 image publication ([`unraid-image-release.md`](./unraid-image-release.md), Part 2 item 1), which means:

- **Settings → Branches / Rules → Rulesets** now work on the current plan, and setting them is a **recommended owner action** (§4.2) — they are not applied yet.
- The source repository is public, so the audit obligation in [`unraid-image-release.md`](./unraid-image-release.md#ghcr-visibility) is continuous: no appdata, `.env` contents or credentials in the tree **or the history**. The application source is public; user data is not in Git at all.
- The pre-2026-10-02 guidance ("do not make the repository public just to get protection") is kept here only as history. It applied while protection was the only reason to go public; publication is now a deliberate prerequisite of the image release path, and the protection rules come with it.

Reference: [About protected branches — GitHub Docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) ("Protected branches are available in public repositories with GitHub Free … also … in public and private repositories with GitHub Pro, GitHub Team, GitHub Enterprise Cloud, and GitHub Enterprise Server.")

### 4.2 Recommended rule for `main` (available now)

**Settings → Branches → Add branch protection rule** (or **Settings → Rules → New ruleset**):

| Setting | Value | Why |
|---|---|---|
| Branch name pattern | `main` | — |
| Require a pull request before merging | ✅ | No direct pushes, ever |
| Required approvals | `0` (solo repo — you cannot approve your own PR) | The *PR* is the gate, not the review |
| Dismiss stale approvals | ✅ | — |
| Require status checks to pass | ✅ | `Docker build (validation)` runs on every PR now; front-end phases add `tsc`, lint, tests |
| Require conversation resolution | ✅ | — |
| Require linear history | ✅ (optional) | Keeps `main` history readable |
| Allow force pushes | ❌ | Non-negotiable |
| Allow deletions | ❌ | Non-negotiable |
| Do not allow bypassing the above settings | ✅ | Applies the rule to administrators too |

Optionally add a **second, lighter** rule for `cals-dev` (require a PR, block force pushes) so the integration branch is protected but never blocked by approvals.

The same settings can be applied from the command line (now permitted on the public repository):

```bash
gh api -X PUT repos/dougalbob/cals/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -f 'required_pull_request_reviews[required_approving_review_count]=0' \
  -f 'required_pull_request_reviews[dismiss_stale_reviews]=true' \
  -F 'enforce_admins=true' -F 'required_linear_history=true' \
  -F 'allow_force_pushes=false' -F 'allow_deletions=false'
```

### 4.3 The convention-based layer (keep it even after protection is applied)

Four layers, none of which require a paid plan. They are still useful: protection rules do not cover every clone, and the hooks/agents layer works offline.

1. **`AGENTS.md` at the repository root** (added) — every AI agent that reads the repo is told, in the repo itself, that `main` is production, that work goes to `cals-dev` via PR, and that direct pushes to `main` are forbidden. This is the "link to subsequent Arena sessions" you asked about.
2. **A local `pre-push` hook** (added, at `.githooks/pre-push`) — actually blocks `git push origin main` from any clone where it has been installed, unless `ALLOW_MAIN_PUSH=1` is set deliberately. Install it per clone:

   ```bash
   ./scripts/setup-git-hooks.sh
   ```

   Note it is a *guard-rail, not a wall*: hooks are client-side, so a clone without them (or a `--no-verify` push) still gets through.
3. **A pull request template** (added, `.github/pull_request_template.md`) — makes "base branch = `cals-dev`, not `main`" the first item on every PR.
4. **Off-GitHub backups of `main`** — cheap insurance for the branch you care most about:

   ```bash
   git bundle create ~/backups/cals-main-$(date +%F).bundle main
   ```

   Keep a copy on Unraid (`/mnt/user/appdata/cals/backups/`) and/or in a second remote. Tag releases (`git tag -a v1.7.0 -m "..."`) so a known-good `main` tip is always recoverable.

---

## 5. Day-to-day workflow

### Starting work

```bash
git fetch origin refs/heads/cals-dev:refs/remotes/origin/cals-dev
git switch -c feat/short-description origin/cals-dev
# work, commit
git push -u origin feat/short-description
gh pr create --base cals-dev --fill
```

### Arena sessions

- The session branch is `arena/<session-id>` and cannot be changed or renamed; Arena tracks the session by that name.
- Ask for the PR to target **`cals-dev`** and to sync with it first.
- The Arena branch is the PR **head/source** and `cals-dev` is the **base/target**. Merging that PR sends the changes directly to `cals-dev`; there is no intermediate merge into the Arena branch.
- **Bootstrap prompt to paste at the start of a session:**

  > Working on `dougalbob/cals` (Go + SQLite backend, web frontend).
  > 1. `git fetch origin refs/heads/cals-dev:refs/remotes/origin/cals-dev && git merge origin/cals-dev` before making changes.
  > 2. Never push, merge, or force-push `main` — it is live production.
  > 3. Open the PR against `cals-dev`, never `main`.
  > 4. Read `AGENTS.md` and `docs/README.md` first; update the relevant document under `docs/` as part of the work. (`ai_contextual_docs/context.txt` is legacy — do not rely on it or append to it.)

#### One PR per session, and never leave work only in the sandbox

A session gets one branch and one pull request. Merging that PR is the end of the session's mandate —
nothing new is started afterwards. That is our own deliberate rule (Arena has allowed a second PR from
the same branch, but the audit trail is cleaner without it), and what makes it necessary is that the
sandbox is not durable:

- **A workspace belongs to the session that made it.** The next session receives a fresh clone. It does
  not see the previous session's working tree, its stashes, its unpushed commits, or any file written
  outside the repository — a handoff note that says "read `/home/user/some-file`" is not a handoff.
- **GitHub access is not guaranteed for the life of a session.** It can fail part-way through and does not
  come back. A session that has pushed can be picked up by any later session from the branch; one that has
  not pushed cannot be recovered at all, whatever it wrote down.

So **commit and push as the work is done, not at the end.** The pushed branch *is* the handoff.

#### Adopting a previous session's unmerged work

If an earlier session left a branch ahead of `cals-dev` with no PR, or with a PR still open, the current
session folds that work into its own PR:

```bash
git fetch origin refs/heads/<old-branch>:refs/remotes/origin/<old-branch>
git cherry-pick <tip-sha>            # prefer this to merging the old branch
```

Cherry-picking keeps the current session's PR a clean sequence and leaves the old branch safe to delete.
Say so in the PR body — "adopts the work of branch `arena/<id>-cals` (PR #NN)" — and do not open a second
PR for it. A branch whose commits were never pushed is not adoptable: the work is gone and the slice is a
rebuild, which is the outcome everything above exists to prevent.

**Handoff note format**, for a session that must end with work unfinished. Name the branch, its tip SHA
and the next step — and only if the branch was actually pushed:

> Branch `arena/01a10bcd-cals` @ `aa6d6dc` (pushed). Three commits on top of `9496e8a`: the 14.3 charts.
> Next: fetch the branch, open a PR against `cals-dev` with the `run-e2e` label.

### “Lets publish” — the owner's end-to-end delivery directive

Owner decision 20 (2026-10-03): when the owner says **“Lets publish”** (or “Lets cut a release”), the
session is authorized to run the whole GitHub delivery loop for the reviewed work **without asking
again at each step**:

1. Sync first: `git fetch origin refs/heads/cals-dev:refs/remotes/origin/cals-dev && git merge origin/cals-dev`.
2. Make sure the work is committed on the session branch and the acceptance gate is satisfied — for UI
   work the owner's preview review plus the PR description of the concrete UX improvement.
3. Push the session branch, open the PR **against `cals-dev`**, and wait for its checks:
   `docker-validate.yml` (Docker build **and** the container runtime smoke against a disposable
   database) and `go-validate.yml` (`go vet` + `go test`). A PR that changes layout or interaction also
   takes the milestone browser suite — add the **`run-e2e`** label to the PR, which starts
   `web-e2e.yml` and keeps running it on later pushes; see
   [`testing.md`](./testing.md#3-ci-behaviour-and-why-failures-are-diagnosable).
4. Merge the PR with a merge commit (the topology in §2 — `main` is never involved).
5. Fast-forward the local branch to the merge commit on `cals-dev`, then tag that exact commit:
   `git tag -a v2.0.0-dev-rcN -m "<checkpoint summary>" <merge-sha>` and `git push origin v2.0.0-dev-rcN`.
   The tag is the approval step. Two workflows start from it: `publish-dev-image.yml` builds, pushes the
   exact tag and `dev-latest`, creates the GitHub prerelease and verifies an anonymous pull; and
   `web-e2e.yml` runs the milestone browser suite against that same commit. **Confirm both appear in
   the run list** — the tag is the first time the browser suite is triggered that way, so if it does
   not appear, say so rather than assuming it passed.
6. Record the result: add the row to the [release log](./unraid-image-release.md#release-log) with the
   run links and image digest, note what the checkpoint contains, confirm no schema migration or
   appdata operation happened (or say exactly what did), and link the browser run.
7. Tell the owner what to Force Update on Unraid and what to review, screen by screen and at phone size.

**What “Lets publish” does *not* authorize:** pushing or merging `main`, promoting to stable, changing
live appdata, moving `latest`, or skipping checks. Publishing a development checkpoint does not update
a running Unraid container; the owner's Force Update is what applies it. If a check fails, fix it and
report — do not tag around it. A red browser run on the tag does **not** unpublish the image that is
already in GHCR: report the failure with its uploaded traces/screenshots and fix forward in the next
checkpoint.

#### Before you start the loop — the pre-publish checklist

The owner asked (2026-10-04) that documentation be finished **before** the loop begins, so that
“Lets publish” is mechanical and nothing has to be written up under time pressure. Run this checklist
against the exact commit that will be tagged.

**The loop never touches `main`.** Every step — sync, push, PR, merge, tag — happens on the session
branch or on **`cals-dev`**, which is the destination for the merge and the branch releases are cut
from. `main` is live production and read-only: it is never a PR base for this work and is never merged
into. The only thing that ever touches `main` is a repository owner's deliberate promotion, which is
not part of this loop and is not authorized by “Lets publish”.

1. **Implementation/status docs land in the feature PR; tag-generated evidence is recorded as soon as it exists.** `docs/CURRENT_STATE.md` (“Last reviewed”, §1 deployments, §2 phase status, §3 waiting-on-owner, §4 next work, §6 housekeeping), [`docs/history/rebuild-log.md`](../history/rebuild-log.md) (a dated entry), `testing.md` if the checks changed, and `web/frontend/README.md` if the screens changed belong in the feature PR. Prepare the release-log row there when practical; run IDs, digest and prerelease link are filled only after the tagged workflow completes, in a focused docs-only follow-up PR if they cannot be recorded before the feature PR merges (as with rc23's follow-up PR #53).
2. **No stale claims.** Anything now merged or published must stop reading “unmerged”, “not yet” or
   “pending”; anything the PR does *not* change must keep saying so. Test totals, workflow names and
   image tags quoted in prose are checked against reality, and `node scripts/check-doc-links.mjs`
   reports no broken relative links or heading anchors.
3. **The checks are green on that commit** — the PR's Docker, Go and (where applicable) browser runs,
   plus `cd web/frontend && npm run lint && npm run typecheck && npm test` for frontend work. Show the
   links; do not tag a commit whose evidence is a sandbox-only run for work the CI gates can prove.
4. **Nothing is claimed before it exists.** Run IDs, digests and “passed” statements are written only
   after the run has finished and been read.
5. **The owner-review note is written out** — which screens to look at, on what device, what changed,
   and what to expect. If a fix is not in the image being tagged, say so explicitly rather than leaving
   it to be discovered.
6. **Superseded PRs are settled** — anything this PR replaces is closed as included, with a comment, so
   the owner is not asked to merge two versions of the same docs.

### Releases (`cals-dev` → `main`)

1. Confirm the Unraid deployment has been running the `cals-dev` build cleanly.
2. Open the release PR: `gh pr create --base main --head cals-dev --title "release: <summary>"`.
3. Review the *whole* diff (`gh pr diff`) — this is the last gate before production.
4. Merge (squash or merge commit, whichever you prefer — keep it consistent).
5. Tag it: `git tag -a vX.Y.Z -m "..." && git push origin vX.Y.Z`.
6. Deploy it. Compose is retired as an installation method, so:
   - **V2 line (going forward):** publish the image per [`unraid-image-release.md`](./unraid-image-release.md) and apply the update to the `cals-dev-v2` Unraid container — no server-side build. Development checkpoints are tagged `vX.Y.Z-dev-rcN` on `cals-dev` and publish to `dev-latest`; a stable `vX.Y.Z` tag does **not** publish from that workflow, so stable publishing is still the owner's manual step/procedure until a stable workflow exists.
   - **Legacy V1 server (only if it is still in use):** it predates the template method and is rebuilt manually on the Unraid box from its existing checkout (`docker compose build && docker compose up -d` there, using the kept-for-legacy `docker-compose.yml`). New installs never use Compose.

### Rollback

- Fastest: redeploy the previous tag/commit (`git checkout vX.Y.Z` → rebuild the image, or for V2 roll the GHCR tag back and re-apply the Unraid container update), or `git revert -m 1 <merge-sha>` on `main` via a PR.
- `main` has no protection rules applied yet (they are available — §4.2), so it is still protected only by convention. Always know the last-good tag before merging a release.

---

## 6. Housekeeping checklist for the owner

- [x] Create and push `cals-dev` (completed; current tip `8695c7e`)
- [ ] Point the Arena PR (and any future PRs) at `cals-dev`
- [ ] Run `./scripts/setup-git-hooks.sh` in every clone you push from
- [ ] **Apply the `main` protection rule in §4.2** — the repository is public, so protection now works on the current plan; add the lighter `cals-dev` rule too
- [ ] Note that going public (2026-10-02) also means the source is world-readable: keep credentials, appdata and `.env` out of the tree and history
- [ ] Set up the `git bundle` backup for `main` and tag the current release (`v1.7.0`)
- [ ] Optional: delete the merged `copilot/*` branches
- [ ] Keep `main` as the default branch; revisit only if you deliberately want new clones to land on `cals-dev`
