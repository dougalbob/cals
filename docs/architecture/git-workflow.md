# Git Workflow & Branch Strategy

| Field | Value |
|---|---|
| **Status** | 🟢 Adopted (branch topology) / 🟡 pending owner action (protection settings) |
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
| Remote branches | `main`, `cals-dev`, `arena/01a0fc78-cals`, and the merged `copilot/*` branches |
| `main` tip | `d65812c` — "Merge pull request #2 from dougalbob/copilot/main" |
| `cals-dev` tip | `a9494cc` — "Merge pull request #3 from dougalbob/arena/01a0fc78-cals" |
| Branch protection on `main` | **None.** The repo is private and on a plan where protection rules are not available (§4) |
| Integration branch `cals-dev` | **Created by the owner and present on GitHub** |
| Repo visibility | Private (`dougalbob/cals`) |
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

### 4.1 The plan limitation (important)

GitHub only offers protected branches and rulesets on **private** repositories for **GitHub Pro / Team / Enterprise Cloud / Enterprise Server**. On GitHub Free, protection works on public repositories only. This repository is private, so:

- The **Settings → Branches** / **Settings → Rules → Rulesets** pages will not enforce anything today.
- Any API call to set protection returns `403: Upgrade to GitHub Pro or make this repository public to enable this feature.`
- Do **not** make this repository public to work around it — it is personal health data.

Reference: [About protected branches — GitHub Docs](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) ("Protected branches are available in public repositories with GitHub Free … also … in public and private repositories with GitHub Pro, GitHub Team, GitHub Enterprise Cloud, and GitHub Enterprise Server.")

### 4.2 If you upgrade to GitHub Pro (or Team) — the recommended rule for `main`

**Settings → Branches → Add branch protection rule** (or **Settings → Rules → New ruleset**):

| Setting | Value | Why |
|---|---|---|
| Branch name pattern | `main` | — |
| Require a pull request before merging | ✅ | No direct pushes, ever |
| Required approvals | `0` (solo repo — you cannot approve your own PR) | The *PR* is the gate, not the review |
| Dismiss stale approvals | ✅ | — |
| Require status checks to pass | ✅ (*once checks exist*) | Front-end phases add `tsc`, lint, tests |
| Require conversation resolution | ✅ | — |
| Require linear history | ✅ (optional) | Keeps `main` history readable |
| Allow force pushes | ❌ | Non-negotiable |
| Allow deletions | ❌ | Non-negotiable |
| Do not allow bypassing the above settings | ✅ | Applies the rule to administrators too |

Optionally add a **second, lighter** rule for `cals-dev` (require a PR, block force pushes) so the integration branch is protected but never blocked by approvals.

The same settings can be applied from the command line once the plan allows it:

```bash
gh api -X PUT repos/dougalbob/cals/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -f 'required_pull_request_reviews[required_approving_review_count]=0' \
  -f 'required_pull_request_reviews[dismiss_stale_reviews]=true' \
  -F 'enforce_admins=true' -F 'required_linear_history=true' \
  -F 'allow_force_pushes=false' -F 'allow_deletions=false'
```

### 4.3 Until then — the free-plan mitigation stack

Four layers, none of which require a paid plan:

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
6. Rebuild/redeploy from `main` (`update-version.sh` then `docker compose build && docker compose up -d`).

### Rollback

- Fastest: redeploy the previous tag/commit (`git checkout vX.Y.Z` → rebuild), or `git revert -m 1 <merge-sha>` on `main` via a PR.
- Because `main` is protected only by convention right now, always know the last-good tag before merging a release.

---

## 6. Housekeeping checklist for the owner

- [x] Create and push `cals-dev` (completed; current tip `a9494cc`)
- [ ] Point the Arena PR (and any future PRs) at `cals-dev`
- [ ] Run `./scripts/setup-git-hooks.sh` in every clone you push from
- [ ] Decide on GitHub Pro/Team — it is the only way to get *enforced* protection on a private repo (§4.1)
- [ ] If upgrading: apply the `main` rule in §4.2, plus a lighter `cals-dev` rule
- [ ] Set up the `git bundle` backup for `main` and tag the current release (`v1.7.0`)
- [ ] Optional: delete the merged `copilot/*` branches
- [ ] Keep `main` as the default branch; revisit only if you deliberately want new clones to land on `cals-dev`
