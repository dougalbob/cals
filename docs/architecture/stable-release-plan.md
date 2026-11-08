# Stable release plan — making V2 the version on `main`

| Field | Value |
|---|---|
| **Status** | 🟡 **Proposed — the procedure and the workflow exist, but nothing has been released.** The owner decided D1–D2 on 2026-11-08; D3–D7 are still open (§8) |
| **Raised** | 2026-11-08 |
| **Decision owner** | @dougalbob |
| **Related** | [`git-workflow.md`](./git-workflow.md) (branches, release PRs), [`unraid-image-release.md`](./unraid-image-release.md) (development channel, Unraid template), [`data-copy-warning.md`](./data-copy-warning.md) (**read before any container or appdata step**), [`../CURRENT_STATE.md`](../CURRENT_STATE.md) (what is deployed today), workflow [`publish-stable-image.yml`](../../.github/workflows/publish-stable-image.yml) and its guard [`stable-release-guard.sh`](../../.github/scripts/stable-release-guard.sh) |

This page sets out how V2 gets onto `main` and how a **stable image** is published. It replaces the
old note that "stable publishing is the owner's manual step". **Status is not tracked here.**
[`CURRENT_STATE.md`](../CURRENT_STATE.md) records what has actually happened.

Three separate things are involved, and none of them sets off the next:

| Step | What it changes | Who | What it does *not* do |
|---|---|---|---|
| **Release PR** `cals-dev` → `main` | Source on `main` | Owner only | Publish an image or update Unraid |
| **Stable tag** `vX.Y.Z` on `main` | Adds `:vX.Y.Z` and `:latest` to an image that already exists, and creates a GitHub release | Owner pushes the tag; the workflow does the rest | Rebuild anything, move `dev-latest`, or update Unraid |
| **Unraid switch** | Which tag the `cals-dev-v2` container follows | Owner, in the Unraid UI | Touch appdata. The image is byte-identical to the RC already running |

---

## 1. Decisions made (owner, 2026-11-08)

- **D1 — Same package, stable tags.** Stable releases use the existing GHCR package:
  `ghcr.io/dougalbob/cals-dev-v2:vX.Y.Z` (exact, never moved) and `:latest` (moving stable tag). No
  package rename for now. The existing container just changes its tag. It keeps the same name, the
  same port `8151` and the same appdata `/mnt/user/appdata/cals-dev-v2`. "dev" stays in the package
  name. The rename is still possible later and is described in
  [`unraid-image-release.md`](./unraid-image-release.md#naming-the-v2-dev-deployment-is-cals-dev-v2-end-to-end).
- **D2 — A stable release promotes a road-tested RC. Nothing is rebuilt.** The owner chose to add a
  stable-publish workflow. The design is that the workflow copies the **exact digest** of a
  published `vX.Y.Z-dev-rcN` to `:vX.Y.Z` and `:latest`. So the stable image is byte-for-byte what
  the household already runs. There is no new build, no drift in the `alpine:latest` or
  `golang`/`node` base images, and no second set of bytes to test.

## 2. How the stable workflow protects the release

[`publish-stable-image.yml`](../../.github/workflows/publish-stable-image.yml) runs only when a tag
matching `v[0-9]+.[0-9]+.[0-9]+` is pushed. It does not fire for `-dev-rcN` tags, which still go to
`Publish V2 image (development)`. Before anything is pushed, every check below must pass:

1. **The tag is exactly `vX.Y.Z` with X ≥ 2.** This rules out a V1-style tag such as `v1.9.0`.
2. **The tag is annotated and names its candidate** on a `Promotes: vX.Y.Z-dev-rcN` line. The owner
   states in the tag which RC they road-tested. The workflow does not guess.
3. **The tagged commit is on `main`**, which means the release PR has merged.
4. **`AppVersion` in `cmd/server/main.go` equals `X.Y.Z`.** `/api/version` then reports the version
   being released.
5. **The candidate's commit is an ancestor of the tagged commit.** This only holds if the release PR
   was merged with a **merge commit**. A squash or rebase merge rewrites the commits, and this check
   then fails safely.
6. **Nothing that goes into the image changed since the candidate.** Only `docs/`, `*.md`,
   `.github/`, `ai_contextual_docs/` and the two Unraid template XMLs may differ. `.dockerignore`
   keeps the XMLs out of the build. Anything else stops the release with the list of files. In that
   case, publish and road-test a new RC first.
7. **The candidate is the image that was published.** The digest recorded in the RC's GitHub
   prerelease must match what the registry serves for that tag today.
8. **The candidate's tagged browser suite passed** (`web-e2e.yml`).
9. **The stable tag is never moved.** If `:vX.Y.Z` already exists with a different digest, the run
   stops. Re-running after a transient failure is safe.

Checks 1–6 are plain Git and live in
[`stable-release-guard.sh`](../../.github/scripts/stable-release-guard.sh). You can run it locally
before tagging (see §4 step 3). The workflow then copies the digest with
`skopeo copy --all --preserve-digests`, which fails rather than re-encode, and checks the result. It
creates a normal (non-prerelease) GitHub release marked *Latest*. Finally it checks that `:latest`
pulls **anonymously**, the way Unraid pulls it.

Starting the workflow by hand (*Run workflow*, which GitHub only offers once the file is on `main`)
is a **dry run**. It applies every check to `main`'s tip and pushes nothing. Treat its first run as
the real test of the registry steps: Arena sandboxes cannot reach GHCR, so the digest comparison
has not run against the live registry yet.

## 3. Review of the `cals-dev` → `main` diff (2026-11-08)

`main` is still the V1 code (`d65812c`, app version `1.7.0`; the last V1 tag is `v1.9.0`). **`main`
is an ancestor of `cals-dev`**, so the release PR has no conflicts, and its merge commit's tree is
`cals-dev`'s tree. At review time `cals-dev` (`729ec15`, rc43) was 251 commits ahead: 308 files,
about +60.5k / −10.3k lines.

| Area | Files | What arrives on `main` |
|---|---|---|
| `web/` | 199 | The React 19 frontend under `web/frontend/`. The vanilla V1 frontend (`web/static`, `web/templates`, `web/public`) is deleted |
| `internal/` | 51 | Handlers for everything V2 added, and **additive** migrations only (`internal/database/migrations.go`) |
| `docs/`, `AGENTS.md`, `README.md` | 34 | The V2 documentation set and the agent rules |
| `.github/`, `scripts/`, `.githooks/` | 12 | The validation and publish workflows, the sandbox helpers and the `main` pre-push guard |
| `cmd/`, `Dockerfile`, `.dockerignore`, templates | ~8 | The root-route serving of React, the multi-stage image build and both Unraid templates |
| `docker-compose.yml` | 1 | Comment-only. It is still the legacy V1 rebuild recipe: it **builds from the checkout** and mounts `/mnt/user/appdata/cals` |

Hazards found:

- **H1 — the V1 Compose rebuild would put V2 onto the stale V1 database.** If the V1 server's
  checkout tracks `main`, then after promotion a routine `git pull && docker compose build && docker
  compose up -d` there would build **V2** and start it on `/mnt/user/appdata/cals`. V2's migrations
  would then run against the stale V1 database, and the V1 UI would disappear. The migrations are
  additive, but this still changes the V1 archive without anyone deciding to. **Until D5 is
  decided, do not pull or rebuild the V1 checkout after the release PR merges.**
- **H2 — linear-history protection would block the release.** [`git-workflow.md`](./git-workflow.md)
  §4.2 used to suggest "Require linear history" for `main`. That rules out the merge commit needed
  by check 5. The suggestion has been withdrawn there. The release PR must use **Create a merge
  commit**.
- **H3 — `main` has no protection rules yet.** Agents and the local pre-push hook respect the
  convention, but nothing enforces it on GitHub. It is worth applying §4.2 (without linear history)
  before the release PR. This is D6.
- **H4 — some features only switch on once the files are on `main`.** The manual dispatch of the
  browser suite and the stable dry run only appear after the release PR merges. This is expected,
  not a fault.
- **H5 — after the merge, the README and docs on `main` describe V2.** This is intended. The
  repository's default branch stays `main`.

## 4. Release procedure (owner-driven)

Steps marked 👤 are the owner's. An agent may prepare PRs and evidence, but never pushes to or
merges `main`, and pushes a stable tag only if the owner explicitly asks.

0. 👤 **Pre-flight.**
   - The RC to promote has run on Unraid without incident for a few days
     ([`git-workflow.md`](./git-workflow.md) §2 rule 3). rc43 was installed on 2026-11-08.
   - The appdata backup exists (decision 54). **Check, do not copy or restore.**
   - D5 (the V1 checkout) is decided, or the V1 checkout is simply left alone.
1. 👤 **Merge this plan's PR into `cals-dev`.** It adds the workflow, which does nothing until a
   stable tag exists on `main`.
2. 👤 **Release PR.** `gh pr create --base main --head cals-dev --title "release: cals 2.0.0 (V2)"`.
   Review the whole diff (`gh pr diff`) against §3, wait for the Docker and Go checks, then merge
   with **Create a merge commit**.
3. 👤 **Dry run.** Use *Actions → Publish V2 image (stable) → Run workflow* on `main` with
   `stable_tag = v2.0.0` and `promotes = v2.0.0-dev-rc43` (or whichever RC is installed). It must be
   green. To run the same Git checks locally:
   ```bash
   git fetch origin +refs/heads/main:refs/remotes/origin/main --tags
   STABLE_TAG=v2.0.0 PROMOTES=v2.0.0-dev-rc43 COMMIT=origin/main .github/scripts/stable-release-guard.sh
   ```
4. 👤 **Tag.**
   ```bash
   git fetch origin +refs/heads/main:refs/remotes/origin/main --tags
   git tag -a v2.0.0 -m "cals 2.0.0" -m "Promotes: v2.0.0-dev-rc43" origin/main
   git push origin v2.0.0
   ```
5. **Workflow.** `Publish V2 image (stable)` adds `:v2.0.0` and `:latest` to the RC's digest,
   creates the `v2.0.0` release and checks the anonymous pull. Check that the release's digest is
   the RC's digest (rc43: `sha256:a257dcd4…d476`).
6. 👤 **Switch Unraid to the stable channel.** Read [`data-copy-warning.md`](./data-copy-warning.md)
   first.
   - Docker tab → `cals-dev-v2` → **Edit**.
   - Before changing anything, check that the path is still `/mnt/user/appdata/cals-dev-v2` →
     `/app/data` and the port is `8151:8151`.
   - Change **Repository** from `…:dev-latest` to `ghcr.io/dougalbob/cals-dev-v2:latest`.
     Change nothing else.
   - Click **Apply**.

   The container is recreated with the **same appdata**. The image is the same bytes it was already
   running, so no migration runs. Then check `/health`, check that `/api/version` reports `2.0.0`,
   and open the app through Cloudflare on a phone.
7. **Record the evidence** in a docs-only PR to `cals-dev`: the release log, `CURRENT_STATE.md` and
   the rebuild log. The release PR itself stays owner-controlled.

## 5. After the first stable release

- **Development continues on `cals-dev`.** The next line bumps `AppVersion` (to `2.0.1` or `2.1.0`)
  and publishes `v2.1.0-dev-rcN` to `dev-latest`, exactly as now. A household container on `:latest`
  **no longer receives RCs automatically**. That is the point of having a stable channel.
- **Where RCs get road-tested** is open (D3). `cals-dev-identity` already follows `dev-latest` on
  its disposable data. Alternatively, the household container can be pointed at an exact RC tag for
  a trial and then back to `:latest`.
- **The next stable release** follows the same loop: release PR → tag `vX.Y.Z` with
  `Promotes: vX.Y.Z-dev-rcN` → switch only if the container is pinned to an exact tag.

## 6. Rollback

- **Image:** Edit the container's **Repository** to an earlier exact tag, such as
  `v2.0.0-dev-rc43`, `v2.0.0-dev-rc42` or a previous stable `vX.Y.Z`, and Apply. Migrations have been
  additive throughout V2, so an earlier image reads the newer database. **Never reset, replace or
  copy appdata to roll back.**
- **A bad stable release:** stable tags are never moved by hand. Pin the container to the previous
  exact tag, fix forward on `cals-dev` with a new RC, and release a new version.
- **Source:** the owner reverts the release merge on `main` through a PR (`git revert -m 1 <merge>`).
  This does not change any image.

## 7. Out of scope: separate decisions with backups and rollback first

None of this is part of the source promotion, and none of it happens without an explicit owner
decision:

- Retiring the V1 container `cals-counter` or archiving `/mnt/user/appdata/cals`.
- Deleting old tags or releases, such as `v1.9.0` or the RC prereleases. rc42/rc43 are the rollback
  images.
- Renaming the GHCR package.
- Removing `docker-compose.yml`.
- Rewriting Git history (never).

## 8. Open owner decisions

| # | Question | Options | Recommendation |
|---|---|---|---|
| D3 | Where are future RCs road-tested once the household is on `:latest`? | (a) `cals-dev-identity` on disposable data; (b) point the household container at the exact RC tag for a trial, then back to `:latest` | (b) for changes that need real data, (a) otherwise. Decide before the first post-2.0.0 RC |
| D4 | Should `cals-dev-v2.xml` default to `:latest`? | Change it in a later docs/template PR; or leave it on `dev-latest` | Change it after 2.0.0 ships, so fresh installs get stable. The existing container is switched by hand in §4 step 6 either way |
| D5 | What protects the V1 checkout (H1)? | (a) never pull it again and retire it later; (b) pin that checkout to `v1.9.0`; (c) replace `docker-compose.yml` on `cals-dev` with a refusing stub before the release PR | (a) or (b) now. (c) only with the V1 retirement decision |
| D6 | Apply `main` branch protection before the release PR? | Yes, with no linear history; or keep the convention only | Yes |
| D7 | When, and which RC? | rc43 after a few clean days, or a later RC | rc43 after a few days, unless more code lands first |
