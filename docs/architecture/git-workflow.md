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
