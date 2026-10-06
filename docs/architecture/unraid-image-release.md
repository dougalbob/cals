# V2 Container Publishing and Unraid Install

| Field | Value |
|---|---|
| **Status** | 🟢 **V2 is installed and live (2026-10-02): `cals-dev-v2` runs on Unraid and Cloudflare routes to port `8151`.** **Newest published: `v2.0.0-dev-rc35` (2026-10-06, [run 37501237100](https://github.com/dougalbob/cals/actions/runs/37501237100), PR #79 merge `b539637dfc63dd99186559c7e2fc5301b7eeaa59`, digest `sha256:ac864954feea19ff9c3218a0f7c09294e1db947f3e1df49bef1a779b68ca8b8e`, [prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc35)) — the Phase 16 cutover retarget: React at `/`, the legacy UI as a lifeboat at `/legacy/`, `/next/*` 308-ing onto the root, and the pass-through worker. `dev-latest` moved with it. ⬜ Not yet installed: it awaits the owner's Force Update and the cutover check. No schema migration, data copy, appdata operation or template change; rollback is exact (re-pin rc34). Development checkpoints through **`v2.0.0-dev-rc34`** are published and rc34 is the last reported installation. **rc34** (Phase 15, PR #76, merge `40f1e171e21c7a77bdb7050a05d635d3a85fb504`) is `dev-latest`; digest `sha256:1eba3145aa8adafdd6b03445a1082ff92ad77576f13a24b6450880acdb44e173`; [publish run 37387169202](https://github.com/dougalbob/cals/actions/runs/37387169202) passed the ancestry guard, image build/push, prerelease and anonymous-pull gates; [prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc34). The tagged browser suite [37387169333](https://github.com/dougalbob/cals/actions/runs/37387169333) passed **72/72**, including both More/Back swipe directions. The final PR checks passed too. rc34 adds Settings and `/next/` PWA installability plus two additive ring-limit columns defaulting to 2,000 kcal; no data copy, appdata operation or template change. **rc34 is the last reported Unraid installation:** the owner Force Updated `cals-dev-v2` on 2026-10-05 and checked the Settings work, which behaves as intended. The rest of the accumulated rc28–rc34 phone road-test is unconfirmed and **phone PWA installation is untested** ([`../CURRENT_STATE.md`](../CURRENT_STATE.md) §3 item 10). The navigation swipe failure from rc30–rc33 is fixed in rc34; cropping remains deferred. Phase 16's audit and staged plan are in [`phase-16-plan.md`](./phase-16-plan.md) — it needs **no** Cloudflare, appdata or template change. |
| **Updated** | 2026-10-05 |

> ⚠️ **Data copy warning — read [`data-copy-warning.md`](./data-copy-warning.md) before
> touching appdata.** V2 was started from a copy of the database taken on the morning of
> 2026-10-02, and it has been the household's live app since the Cloudflare route moved to
> `8151`. Data entered now goes to `/mnt/user/appdata/cals-dev-v2`, V1's database is
> diverging, and neither is a backup of the other. The database is **not** disposable.
| **Decision owner** | @dougalbob |
| **Related** | [`git-workflow.md`](./git-workflow.md), [`local-development.md`](./local-development.md), [`../../cals-dev-v2.xml`](../../cals-dev-v2.xml) |

## Goal

Install V2 on Unraid from a maintained container image, using a separate Unraid template and port so V1 can keep running during the trial. Unraid should **pull a prebuilt image**; it should not need a Git checkout or build the application on the server.

**Installation method (owner decision, 2026-10-02): the Unraid template is the only documented install path.** Docker Compose is retired as an installation method. The checked-in `docker-compose.yml` is kept in the repository solely as the legacy mechanism for the existing V1 server (container `cals-counter`, port 8150) — no new install, and no documentation in this repository, uses Compose.

## Naming: the V2 dev deployment is `cals-dev-v2` end to end

To avoid human confusion with the older version of the application (V1: container `cals-counter`, appdata `/mnt/user/appdata/cals`), the V2 **development** deployment uses one name everywhere a person sees it:

| Thing | Value |
|---|---|
| Template file | `cals-dev-v2.xml` (repository root) |
| Unraid container name | `cals-dev-v2` |
| Appdata (host) | `/mnt/user/appdata/cals-dev-v2`, mounted at `/app/data` |
| GHCR image (development channel) | `ghcr.io/dougalbob/cals-dev-v2:dev-latest` |
| Port | host `8151` → container `8151` (template sets `PORT=8151`) |

A second, **LAN-only** template runs the same image for development:
[`cals-dev-identity.xml`](../../cals-dev-identity.xml) creates `cals-dev-identity` with **host
networking**, `BIND_ADDRESS` = the Unraid LAN IP, `PORT=8152`, its own disposable
`/mnt/user/appdata/cals-dev-identity` data copy, and `DEV_MODE=true` +
`DEV_IDENTITY_SWITCH=true`. It is never routed through Cloudflare. See
[`dev-identity-switch.md`](./dev-identity-switch.md).

The development template tracks the moving `dev-latest` tag and pins the exact release candidate separately, for example `v2.0.0-dev-rc1`. The plain `latest` tag is reserved for a stable release after promotion to `main`. This keeps the template fixed while new development candidates are published, without making the word `latest` mean both development and stable.

**Versioning (owner decision, 2026-10-02): the V2 development line reports application version `2.0.0`.** `cmd/server/main.go` (`AppVersion`, shown by `GET /api/version` and in the app footer), `web/static/js/app.js` and `web/public/sw.js` were bumped from `1.7.0` (and `1.4.0` in `sw.js`) to `2.0.0` on `cals-dev`. The running app therefore identifies itself as the version-2 code from the dev branch at a glance — the same thing the image tags say — and the version drift recorded during the Phase 11 spike (three files, three different ideas of the version) is gone. `main` stays on `1.7.0` until the owner promotes `cals-dev`; each development image is identified precisely by its tag (`v2.0.0-dev-rcN`), while the app reports the version line rather than the individual checkpoint.

**Subsequent releases are development checkpoints on this same package.** Each checkpoint gets an exact tag (`v2.0.0-dev-rc2`, `v2.0.0-dev-rc3`, …) and moves `dev-latest`; the Unraid container is *updated*, never reinstalled, and its data stays in appdata.

**The name is intentionally provisional (owner, 2026-10-02).** `cals-dev-v2` is the "for now" development name — its job is to get a running container on Unraid and carry the development checkpoints. The owner's stated plan: use `cals-dev-v2` for now and rename the package later (to `cals-dev`, unless the owner settles on a different final name when the rename happens). When that rename happens it is cheap and well-contained:

1. Rename the GHCR package in the repository's package settings (afterwards the old name stops being pullable).
2. Update `Repository` and `Registry` in the template XML (and the file name / `TemplateURL` if the owner wants the file to match).
3. In Unraid, point the container at the new image — recreate the container from the updated template. **The appdata directory does not need to change**: the directory name does not have to match the image name, so no data migration is required.

## Git release, GitHub Release, and image tags are different

1. **Git branch:** `cals-dev` contains the integration source.
2. **Git tag / GitHub Release:** a tag such as `v2.0.0-dev-rc1` points at one exact commit on `cals-dev`. GitHub Releases are not restricted to `main`; mark this candidate as a prerelease. A GitHub Release is source/version metadata, not a built container image.
3. **Container image:** the [publish workflow](#publishing-workflow-added-2026-10-02-part-2-pr) builds the Docker image from that tag and pushes it to GHCR with both the exact version tag and `dev-latest`. These are registry tags assigned by the workflow; they are not automatically created from a GitHub Release.
4. **Unraid:** `cals-dev-v2.xml` references `ghcr.io/dougalbob/cals-dev-v2:dev-latest`. When the container is updated, Unraid pulls the image currently behind that tag. The XML does not need changing for each RC. Moving the tag does not automatically restart/update a running container; use Unraid's update/apply flow to pull it.

## Publishing workflow (added 2026-10-02, Part 2 PR)

Three GitHub Actions workflows in [`.github/workflows/`](../../.github/workflows) gate and implement
the publishing half of this document. `Docker build (validation)` builds the checked-in `Dockerfile`,
so the frontend lint/tests/production build and the CGO Go build run on every execution — a green run
is the evidence that the image actually builds. `Go tests (validation)` (decision 65) is the only
check that compiles and runs the Go test files; `go build` never touches `_test.go`.

| Workflow | File | Trigger | What it does | Token permissions |
|---|---|---|---|---|
| **Docker build (validation)** | `docker-validate.yml` | every pull request targeting `cals-dev` or `main` | `docker build` with no registry login, no push; writes the image id/size to the run summary | `contents: read` |
| **Go tests (validation)** | `go-validate.yml` | every pull request targeting `cals-dev` or `main`, every push to `cals-dev` | `go vet ./...` and `go test ./...` with `CGO_ENABLED=1` on the Go version from `go.mod` — the gate that catches a failing or non-compiling backend test | `contents: read` |
| **Playwright browser suite (milestone)** | `web-e2e.yml` | a `v*-dev*` tag, or a PR carrying the `run-e2e` label | builds the bundle and drives it in a real Chromium at phone size (62 tests on the current branch): Diary flows, the Today/Diary hydration split, the recipe area including no-photo creation, control by control, and the phone tap behaviour. Failure evidence (traces, screenshots, HTML report) is uploaded even when the job fails — see [`testing.md`](./testing.md) | `contents: read` |
| **Publish V2 image (development)** | `publish-dev-image.yml` | pushing a Git tag matching `v*-dev*` (for example `v2.0.0-dev-rc1`) | guards that the tagged commit is on `cals-dev`, logs in to GHCR, builds, pushes the exact tag and moves `dev-latest`, creates the GitHub prerelease with the image digest in its notes, then logs out and verifies the image pulls **anonymously** (the test Unraid depends on) | `contents: write`, `packages: write` |

**Why `main` appears in two of those triggers (kept deliberately, owner decision 2026-10-04).** The
`main` entry in `docker-validate.yml` and `go-validate.yml` exists so that a *deliberate* release PR
(`cals-dev` → `main`) would still be checked. It is not an invitation: `main` is production and
read-only, session work always targets `cals-dev`, and nothing in these workflows can merge or push
anything. The owner chose to keep the entries rather than strip them, so this is intentional and
should not be "tidied up" as if it were a mistake.

**Manual dispatch is not available yet.** All four workflows declare `workflow_dispatch`, but GitHub
only offers the *Run workflow* button (and `gh workflow run`) for a workflow that exists on the
repository's **default branch** — here `main`, which carries no `.github/` directory. Until then the
triggers in the table above are the only ones that fire; use a pull request (with the `run-e2e` label
for the browser suite) or a tag.

This is a **workflow-registration detail, not a plan**: nothing here is a reason to put files on
`main`. All development checkpoints — the PR that lands them and the tag that publishes them — happen
on **`cals-dev`**, which is the destination for the merge and the branch releases are cut from. `main`
is live production and read-only, is never a PR base for this work, and is never merged into; a
promotion to `main` would be a separate, deliberate owner decision and is not authorized by
“Lets publish”.

Nothing is published without a human action. The validation workflow never pushes, and the publish workflow only runs for a tag: **pushing the tag is the approval step.** The trigger deliberately matches development tags only (`v*-dev*`), so a stable `vX.Y.Z` tag — for example on `main` — does not publish from this pipeline. Stable publishing is still to be designed; plain `latest` remains reserved for a release promoted to `main`.

### Publishing a development checkpoint

```bash
git fetch origin refs/heads/cals-dev:refs/remotes/origin/cals-dev

# Tag a commit that is already on cals-dev, not a session branch and not main.
git tag -a v2.0.0-dev-rc1 -m "cals-dev-v2 first development checkpoint" <commit-on-cals-dev>
git push origin v2.0.0-dev-rc1
```

The workflow then, in order:

1. fails early if the tagged commit is not an ancestor of `origin/cals-dev` (the guard against building `main` by accident);
2. pushes `ghcr.io/dougalbob/cals-dev-v2:v2.0.0-dev-rc1` and moves `ghcr.io/dougalbob/cals-dev-v2:dev-latest`;
3. creates the GitHub **prerelease** for the tag, with the source commit and image digest in its notes.

**The same tag also starts the milestone browser suite** (`web-e2e.yml`), which runs the Playwright
journeys against the tagged commit — the same suite a PR runs when it carries the `run-e2e` label. It
is evidence, not a gate: the image is already in GHCR by then, and a red browser run does **not**
unpublish it. Treat it as the record that the phone journeys were exercised on exactly the commit
being deployed; if it fails, report it with the traces and screenshots the run attaches and fix
forward in the next checkpoint rather than re-tagging the same commit. See
[`testing.md`](./testing.md#3-ci-behaviour-and-why-failures-are-diagnosable).

After it succeeds, make the GHCR package public if it is not already (see [GHCR visibility](#ghcr-visibility)), then apply the update to the `cals-dev-v2` container on Unraid (see [Installing V2 on Unraid](#installing-v2-on-unraid-template-method)).

Before starting any of this, work through the
[pre-publish checklist](./git-workflow.md#before-you-start-the-loop--the-pre-publish-checklist) — most
of it is documentation, and it is deliberately done in the same PR rather than afterwards.

**If publishing fails:** check the run log first — the guard step names the reason. A GHCR permission error usually means the repository's **Settings → Actions → General → Workflow permissions** do not allow write access; the workflow requests `packages: write` explicitly, but this is the setting to confirm. A failure after the image is pushed (for example, creating the prerelease) can be fixed and the workflow re-run without rebuilding anything by hand. A job that is never acquired — the annotation reads *"The job was not acquired by Runner of type hosted even after multiple attempts"* after roughly 15 minutes in the queue — is GitHub infrastructure trouble, not a publish failure: nothing was built and no release exists, so delete and re-push the **identical** tag object (`git push origin :refs/tags/<tag>` then `git push origin <tag>`) to fire a fresh `push` event. Nothing changes — no commit, tag message or target, and no new tag or commit is created for it. That is what happened on 2026-10-05 before rc33 published; see the release log and [`../history/rebuild-log.md`](../history/rebuild-log.md).

The GitHub “Latest release” indicator and the Docker image tag `:latest` are independent. The first public V2 candidate should be verified on Unraid before stable promotion through the existing `cals-dev` → `main` release process.

## Installing V2 on Unraid (template method)

This is the documented installation. There is no Compose step and no source build on the server.

**Prerequisites**

1. The first image is published: `ghcr.io/dougalbob/cals-dev-v2:dev-latest` plus the exact RC tag, and the GHCR package is public (see [GHCR visibility](#ghcr-visibility) and the Part 2 checklist below).
2. `/mnt/user/appdata/cals-dev-v2/.env` exists with the required settings — at minimum `CF_TEAM_DOMAIN` and `CF_POLICY_AUD` (see the [Configuration](../../README.md#configuration) table in the README). The application loads `/app/data/.env` at startup; because the template mounts `/mnt/user/appdata/cals-dev-v2` at `/app/data`, it reads that file. Environment variables set directly in the template take precedence over values in `.env` (the template's `PORT=8151` is intentional).

**Steps**

1. **Get the template file.** Download `cals-dev-v2.xml` from the repository — raw URL: <https://raw.githubusercontent.com/dougalbob/cals/cals-dev/cals-dev-v2.xml>. The repository is public (2026-10-02), so the raw URL and the Community Applications options below work; the URL was verified on 2026-10-02. If it ever 404s, copy the file from a Git checkout instead.
2. **Make it available to Unraid.** Any one of:
   - Copy the file into the Community Applications custom templates directory on the server (`/boot/config/plugins/Community Applications/templates.custom/`) and refresh Community Applications.
   - Add the raw URL above as a custom repository in Community Applications; the `TemplateURL` inside the XML then also drives CA's template update checks.
   - Or skip both: create the container in the Unraid Docker UI from the values below (the file is the source of truth for those values).
3. **Create the container from the template.** The template pre-fills everything: container name `cals-dev-v2`, image `ghcr.io/dougalbob/cals-dev-v2:dev-latest`, bridge networking, port `8151:8151/tcp`, volume `/mnt/user/appdata/cals-dev-v2` → `/app/data` (rw), variables `PORT=8151` and `TZ=Europe/London`. Start the container.
4. **Verify**
   - `curl -s http://localhost:8151/health` (from an SSH session on Unraid) succeeds. This is the container-level check and needs nothing else.
   - The WebUI link opens the React shell. **On the installed rc34 that is `http://<unraid-host>:8151/next/`; from the Phase 16 cutover release onward it is `/`, with `/next/*` answering 308 onto the same path** (the template's `/next/` link keeps working either way — updating the XML is a separately approved change, stage 16.4). **Expect an empty screen with "401" errors in the browser console when opening it over plain LAN HTTP**: the shell itself is public, but every `/api/*` route requires a Cloudflare Access JWT, and a LAN request has none. That is the design, not a broken container — data appears when the page is opened through Cloudflare (below), or in local development via `DEV_MODE`. Direct LAN access cannot substitute: `DEV_MODE` needs a loopback/private bind address, so it does not apply to the container.
   - If V2 is reached through Cloudflare Tunnel, add/update the V2 origin/hostname to route to port `8151`; changing Docker's port mapping alone does not change the tunnel configuration. Then the full app works — the diary loads for the signed-in Cloudflare identity.
   - Data persists: restart the container and confirm the database in appdata survives.
   - V1 on `8150` is unaffected.
   - New here? The app auto-creates the user matching the Cloudflare email on first request, so a fresh V2 appdata shows an empty diary — that is expected, not a data-loss bug. V1's database is untouched because V2 has its own appdata directory.

**Reference values (for manual container creation)**

| Setting | Value |
|---|---|
| Image | `ghcr.io/dougalbob/cals-dev-v2:dev-latest` |
| Name | `cals-dev-v2` |
| Network mode | Bridge |
| Port | `8151:8151/tcp` |
| Volume | `/mnt/user/appdata/cals-dev-v2` → `/app/data` |
| Variables | `PORT=8151`, `TZ=Europe/London` |

## Updating V2

1. The publishing workflow moves `dev-latest` to the new candidate (and pushes the exact RC tag).
2. In Unraid, apply the container update for `cals-dev-v2` — Unraid pulls the image now behind `dev-latest` and restarts the container. No XML change is needed per RC; the template itself only changes when the XML changes (then refresh it via its `TemplateURL` / CA, or copy the new file over).
3. Re-run the verification steps above (health, the app shell, persistence). From the Phase 16 cutover release onward also check `/legacy/` still opens the old UI and that `/next/…` redirects onto the matching path.

## GHCR visibility

Container Registry package visibility is configured separately from the repository, and a package published outside a workflow (CLI, personal access token) starts private. **A package that a workflow publishes with `GITHUB_TOKEN`, linked to its repository, inherits that repository's access permissions — and this repository is public** (see [About permissions for GitHub Packages](https://docs.github.com/en/packages/learn-github-packages/about-permissions-for-github-packages): "If you publish a package that is linked to a repository, the package inherits its permissions from the linked repository by default"; "in the Container registry, public packages allow anonymous access"). The Dockerfile's `org.opencontainers.image.source` label is what links the package to this repository.

Because that inheritance is an assumption the Unraid install depends on, **every publish now ends by verifying an anonymous pull** — the workflow logs out of GHCR, deletes the local copy and pulls `dev-latest` the way a fresh Unraid container would. A failure fails the run with the exact page to fix:

<https://github.com/users/dougalbob/packages/container/cals-dev-v2/settings> → **Package settings → Danger Zone → Change visibility → Public**.

Only the owner can do that: GitHub does not grant `GITHUB_TOKEN` package administration, so the workflow can detect a private package but not repair one. Public GHCR images can be pulled with no authentication at all, which is what makes the template install work on a server that has no GitHub credentials. See [GitHub's package visibility documentation](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility) and [Container Registry documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

The source repository was made public on 2026-10-02 as a prerequisite of this publishing path (Part 2, item 1), so that audit is a continuing obligation: the tree **and Git history** must stay free of appdata, `.env` contents, credentials or other private data. The runtime `.env` belongs in Unraid appdata and must never be committed or included in a Docker build context; `.gitignore` and `.dockerignore` exclude `.env` files. Note that the application source is public but user data never is — data lives only in the Unraid appdata directory.

## V2 port and persistent configuration

- Keep V1 on `8150:8150`.
- The template sets `PORT=8151` inside the container and maps host port `8151` to container port `8151`. The Go server already reads `PORT`; its default remains `8150`, so a plain local image run (`docker run` without `PORT`) still listens on `8150`.
- Dockerfile `EXPOSE` is image metadata. The runtime `PORT` setting and Unraid's port mapping determine where the server actually listens.
- Keep V2's appdata separate from V1 while both are installed. Do not have both containers open the same SQLite database. Copy only the configuration values you need into the V2 `.env`; plan any database migration separately.
- The template container sits on Unraid's default bridge network. For integrations that are reached by container hostname (for example `MEALIE_BASE_URL=http://mealie:9000` on a shared network), use a routable address from the template container instead — typically `http://<unraid-host-ip>:9000` — or put both containers on a named Docker network via `ExtraParams` (`--network <name>`) if you deliberately want hostname resolution.

The XML opens the React shell at `/next/`. Phase 16 retargets the app to `/`, but the template does **not**
have to change with it: `/next/*` answers 308 onto the same path with the prefix stripped, so the existing
link keeps working. Refreshing the `WebUI` path to `/` and the Overview wording is stage **16.4**, and is a
**separately approved template change** — no template change is authorised or required before then.

## Part 2 — publish the first V2 image (complete; rc34 is current)

The owner-directed sequence is: **finish the Phase 11 foundation PR first (done — PR #5 is merged into `cals-dev`); make the first GHCR image the next focused task.** Do not bundle image publishing into feature PRs.

Before starting Part 2, confirm you are on the current `cals-dev` using the explicit fetch instructions in [`git-workflow.md`](./git-workflow.md).

**Latest development checkpoint:** PR #76 merged into `cals-dev` as `40f1e171e21c7a77bdb7050a05d635d3a85fb504` and was published as `v2.0.0-dev-rc34`. The existing Unraid target is still `cals-dev-v2` on port `8151`, using `ghcr.io/dougalbob/cals-dev-v2:dev-latest` (now rc34). Publish run [37387169202](https://github.com/dougalbob/cals/actions/runs/37387169202) passed the `cals-dev` ancestry guard, image build/push, prerelease and anonymous-pull gate; digest `sha256:1eba3145aa8adafdd6b03445a1082ff92ad77576f13a24b6450880acdb44e173`; [prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc34). Its tagged browser suite passed 72/72, including the More/Back swipe regression. Final PR Docker, Go and Playwright checks passed (runs 37386887916, 37386887936 and 37386887922). Phase 15 adds account-backed Settings, `/next/` PWA installability and two additive ring-limit columns defaulting to 2,000 kcal. **rc34 is the last reported Unraid installation** — the owner Force Updated on 2026-10-05 and checked Settings, which behaves as intended; **the rest of the accumulated rc28–rc34 phone review and the phone PWA install are unconfirmed** ([`CURRENT_STATE.md`](../CURRENT_STATE.md) §3 item 10). The update applied rc28's `users.weight_trend_days`, rc29's `users.body_outline`, and rc34's two ring-limit columns. No data copy, appdata operation or template change.

| # | Item | State |
|---|---|---|
| 1 | Repository public as the owner intended (raw template URL reachable); no appdata, `.env` contents or credentials exposed | ✅ 2026-10-02 |
| 2 | GitHub Actions validation + publishing workflow added (build-only PR check; publish from an approved tag on `cals-dev` using `GITHUB_TOKEN` with package-write permission) | ✅ 2026-10-02, PR #7 — see [Publishing workflow](#publishing-workflow-added-2026-10-02-part-2-pr); the validation check ran green on that PR |
| 3 | Development checkpoints publish `ghcr.io/dougalbob/cals-dev-v2:v2.0.0-dev-rcN` plus the moving `dev-latest` (`latest` **not** assigned) | ✅ 2026-10-05 — rc1 through **rc34** published; rc34 (PR #76) was built by run 37387169202 from merge commit `40f1e171` and moved `dev-latest` to digest `sha256:1eba3145…44e173`. It ships Phase 15 Settings + `/next/` PWA installability and the More/Back swipe fix. Two additive ring-limit columns default to 2,000 kcal; no data copy, appdata operation or template change. See the [release log](#release-log) |
| 4 | Corresponding GitHub prerelease for the Git tag created and verified | ✅ 2026-10-05 — every checkpoint from [rc1](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc1) through [rc34](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc34) has a prerelease carrying its source commit and image digest |
| 5 | GHCR package visible to anonymous pulls (what Unraid needs) | ✅ 2026-10-02 — **verified by CI, not assumed**: the rc2 run logged out of GHCR, deleted its local copy and pulled `dev-latest` as an unauthenticated stranger, successfully. The check now runs on every publish |
| 6 | Unraid install/smoke test from `cals-dev-v2.xml`: port `8151:8151`, isolated `/mnt/user/appdata/cals-dev-v2` mounted at `/app/data`, `.env` loading, health/`/next/`/restart persistence, no conflict with V1 on 8150, and Cloudflare Tunnel route checked separately | ✅ Initial V2 install and routing verified 2026-10-02; **rc34 is the last reported Unraid installation** — the owner Force Updated on 2026-10-05 and confirmed the Settings work behaves as intended. **The rest of the accumulated rc28–rc34 phone-size review, and the phone PWA install, are still unconfirmed** (see [`CURRENT_STATE.md`](../CURRENT_STATE.md) §3 item 10). The additive migrations run on startup; no data copy or appdata operation is required. Confirm the in-app footer after future updates |
| 7 | Record the exact source commit, Git tag, image tags/digest, build result and smoke-test result in the release log below | ✅ Exact source, tag, digest, prerelease and CI results are recorded through rc34. **rc34 is the last reported installation** (owner Force Update 2026-10-05; Settings checked). Beyond that, no item-by-item phone review of the rc28–rc34 changes is asserted, and the phone PWA install is untested (see [`CURRENT_STATE.md`](../CURRENT_STATE.md) §3) |

The validation workflow first passed on PR #7 ([run 37037874364](https://github.com/dougalbob/cals/actions/runs/37037874364), 2026-10-02), closing the container build recorded as unverified in the Phase 11 handoff. The owner-approved tag/publish and public-package gates have passed for rc1–rc25. PR #54's [Docker/runtime](https://github.com/dougalbob/cals/actions/runs/37206287261), [Go](https://github.com/dougalbob/cals/actions/runs/37206287234) and [browser](https://github.com/dougalbob/cals/actions/runs/37206287397) checks passed; post-merge Go run [37206413850](https://github.com/dougalbob/cals/actions/runs/37206413850) passed too. rc24's [publish workflow](https://github.com/dougalbob/cals/actions/runs/37206446238) and [tagged browser suite](https://github.com/dougalbob/cals/actions/runs/37206446239) passed (53 browser tests). For PR #56, [Docker/runtime](https://github.com/dougalbob/cals/actions/runs/37212805944), [Go](https://github.com/dougalbob/cals/actions/runs/37212805943) and [Playwright](https://github.com/dougalbob/cals/actions/runs/37212836489) checks passed; rc25's [publish workflow](https://github.com/dougalbob/cals/actions/runs/37212991108) passed the anonymous-pull gate, and the [tagged browser suite](https://github.com/dougalbob/cals/actions/runs/37212991110) passed 60 tests. The owner signed off all published RC candidates through rc25 on 2026-10-04, tested rc26, Force Updated to rc27 on 2026-10-05 ("all looks good"), and later the same day Force Updated to **rc34** and checked the Settings work (it behaves as intended). Beyond the owner's own road tests, no broader Unraid smoke result or item-by-item phone review of rc28–rc34 is asserted, and the phone PWA install is untested.

From PR #40 there is a second gate on every pull request: **`Go tests (validation)`** (`go vet ./...` +
`go test ./...` with CGO, decision 65). It is the only check that compiles the backend's `_test.go`
files — `Docker build (validation)` runs `go build ./cmd/server`, which does not — and it also re-checks
`cals-dev` after every merge. It ran green on PR #42 and on the post-merge `cals-dev` run
[37158561468](https://github.com/dougalbob/cals/actions/runs/37158561468), before rc18 was tagged.

This first image is a **development smoke-test image**, not a completed UI redesign or authorization to cut over V1. The `/next/` frontend is still a foundation; keep the UI improvement and owner-review gate for later user-facing phases.

## Release log

The owner signed off the published RC candidates through rc25 on 2026-10-04, tested rc26 on Unraid,
Force Updated to **rc27** and road-tested the windowed bank on both accounts on 2026-10-05
("all looks good"), then **Force Updated to rc34** later the same day and checked the Settings work,
which behaves as intended. **rc34 is the last reported installation; the rest of the accumulated
rc28–rc34 road-test and the phone PWA install are still unconfirmed.** PR #76 merged as
`40f1e171e21c7a77bdb7050a05d635d3a85fb504` and **rc34 is published and is `dev-latest`**. The
publish workflow passed the ancestry guard, image build/push, prerelease and anonymous-pull gate; its
tagged browser suite passed **72/72**, including the navigation swipe fix. PR #76's final Docker,
Go and Playwright checks passed as well. rc34 adds the two additive ring-limit columns; no data copy,
appdata operation or template change. The installed update applied rc28's `users.weight_trend_days`,
rc29's `users.body_outline` and rc34's ring-limit columns.
The exact RC evidence is in the table below. The rc33 runner-assignment incident and its recovery are
recorded in the historical rc33 row; older owner-review wording records the state at publication time.

| Tag | Published | Source commit | Image digest | GitHub prerelease | Unraid smoke test |
|---|---|---|---|---|---|
| `v2.0.0-dev-rc1` | 2026-10-02, [run 37039604171](https://github.com/dougalbob/cals/actions/runs/37039604171) | `51c15b0` on `cals-dev` (PR #8 merge; app version 2.0.0) | `sha256:f4c6c61930b6a7e509ffd578c77815f9d778bc6f46794ff379e5b355cdca06a7` | [v2.0.0-dev-rc1](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc1) (prerelease) | ⬜ owner |
| `v2.0.0-dev-rc2` | 2026-10-02, [run 37040148876](https://github.com/dougalbob/cals/actions/runs/37040148876) | `183059a` on `cals-dev` (PR #9 merge; adds the anonymous-pull gate) | `sha256:cab07b3427a41a3ea38adb987ec38e2184c4b00b8ca7393a29d269e96009e951` | [v2.0.0-dev-rc2](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc2) (prerelease) | ✅ V2 installed and Cloudflare-routed on `8151` on 2026-10-02 (on a database copied that morning — see [`data-copy-warning.md`](./data-copy-warning.md)) |
| `v2.0.0-dev-rc3` | 2026-10-02, [run 37047488711](https://github.com/dougalbob/cals/actions/runs/37047488711) | `2f6193a` on `cals-dev` (PR #12 merge; DEV identity switch + Phase 12 Diary) | `sha256:eb8ee80bb1faf3995db10d215bf6a1898d9d8db932b0a7b4e37121a268721692` | [v2.0.0-dev-rc3](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc3) (prerelease) | ⬜ owner — update `cals-dev-v2` and **review the Diary at phone size as both identities** |
| `v2.0.0-dev-rc4` | 2026-10-02, [run 37066221932](https://github.com/dougalbob/cals/actions/runs/37066221932) | `0716d67` on `cals-dev` (PR #14 Water glass selection + PR #15 DEV identity shortcut) | `sha256:ea5e97aad9551a3e86188bba6296bdbf0fe5b31d01b74fd323ab72fee3919d25` | [v2.0.0-dev-rc4](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc4) (prerelease) | ⬜ owner — Force Update `cals-dev-identity` on `8152`, then verify the app-header **Switch user** link and `/dev/identity` |
| `v2.0.0-dev-rc5` | 2026-10-03, [run 37076288897](https://github.com/dougalbob/cals/actions/runs/37076288897) | `30c2f327` on `cals-dev` (PR #17 Today dashboard checkpoint) | `sha256:661ca057c2ab3d3b3c79028a89cd54bb9fbeb4e9364a280ce0fecff9ce0058d7` | [v2.0.0-dev-rc5](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc5) (prerelease) | ⬜ owner — Force Update and review dashboard as both identities |
| `v2.0.0-dev-rc6` | 2026-10-03, [run 37082814035](https://github.com/dougalbob/cals/actions/runs/37082814035) | `fd427aa` on `cals-dev` (PR #19 My drinks builder and quick-drinks refinements) | `sha256:ac818a8d181487c9e57750e07ecd3d8169e0378f446fccafd7ecb605832c7839` | [v2.0.0-dev-rc6](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc6) (prerelease) | ⬜ owner — Force Update `cals-dev-v2` / `cals-dev-identity` |
| `v2.0.0-dev-rc7` | 2026-10-03, [run 37108058099](https://github.com/dougalbob/cals/actions/runs/37108058099) | `9202a4f` on `cals-dev` (PR #20 bank-based calorie ring) | `sha256:5f36771bc0bf260d9f26fa6d479627eac91d0789bc10e2dc6d1716667ec98bf9` | [v2.0.0-dev-rc7](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc7) (prerelease) | ⬜ owner — Force Update `cals-dev-v2` on `8151` and review the ring at phone size; no schema migration |
| `v2.0.0-dev-rc8` | 2026-10-03, [run 37110417233](https://github.com/dougalbob/cals/actions/runs/37110417233) | `f6a6675` on `cals-dev` (PR #22 Phase 12 close-out: opposite bank-ring sweep directions + Diary quantity edit) | `sha256:74a5094f079e558831b690f640536c9fc8af63d50b12bac930f3b1f6a95c72dc` | [v2.0.0-dev-rc8](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc8) (prerelease) | ⬜ owner — Force Update `cals-dev-v2` on `8151` and `cals-dev-identity` on `8152`, then review Home/Diary at phone size as **both** identities; no schema migration or data copy |
| `v2.0.0-dev-rc9` | 2026-10-03, [run 37114327989](https://github.com/dougalbob/cals/actions/runs/37114327989) | `0ae1b3c` on `cals-dev` (PR #24: Diary real-server correctness follow-ups + Phase 13 serving/portion decisions) | `sha256:fd58d5a1a89f695ff9f30e7a331a6984099a0d151daac555ee099c36d9e22f73` | [v2.0.0-dev-rc9](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc9) (prerelease) | ⬜ owner — Force Update `cals-dev-v2` on `8151` to review the Diary correctness fixes; no schema migration or data copy |
| `v2.0.0-dev-rc10` | 2026-10-03, [run 37122503399](https://github.com/dougalbob/cals/actions/runs/37122503399) | `94c502b` on `cals-dev` (PR #26: shared recipe metadata, per-user favourites and catalogue filters) | `sha256:d0b1ef9e54cd1915a2bb1a07c75d0728af6ec2d5b95815de6b7d4b11f297ccbd` | [v2.0.0-dev-rc10](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc10) (prerelease) | ⬜ owner — Force Update `cals-dev-v2` on `8151` to review Phase 13 Recipes; additive schema migration runs on startup, no appdata copy |
| `v2.0.0-dev-rc11` | 2026-10-03, [run 37125235067](https://github.com/dougalbob/cals/actions/runs/37125235067) | `6740af9` on `cals-dev` (PR #28: food serving choices and recipe-to-Diary portions) | `sha256:95ea95e40d09a2ae875eade049b907c6291ec7735bd196a9c35a7f34237e4d63` | [v2.0.0-dev-rc11](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc11) (prerelease) | ⬜ owner — Force Update `cals-dev-v2` on `8151` to review Phase 13 servings/portions; additive schema migration (`food_servings` household rows + `recipe_user_portions`) runs on startup, no appdata copy |
| `v2.0.0-dev-rc12` | 2026-10-03, [run 37130651708](https://github.com/dougalbob/cals/actions/runs/37130651708) | `ead2bf9` on `cals-dev` (PR #30: tap-to-filter recipe tags, decisions 41–54, docs restructure) | `sha256:59631e659d11cfd32423fa87d50ba35b93a578fbc0847d6ac51550ac9e7da928` | [v2.0.0-dev-rc12](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc12) (prerelease) | ⬜ owner — Force Update `cals-dev-v2` on `8151` and review the Recipes tag filter at phone size (also `/next/` on the LAN dev container `8152`); **no schema migration, no data copy, no appdata change** |
| `v2.0.0-dev-rc13` | 2026-10-03, [run 37132678548](https://github.com/dougalbob/cals/actions/runs/37132678548) | `9260e10` on `cals-dev` (PR #32: recipe-adaptation requirement and frozen history, decisions 55–58 — **documentation only**) | `sha256:d28a820975261cff158c6d7f89f652d4846cac7cc68bc707de3c13f1dbf48103` | [v2.0.0-dev-rc13](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc13) (prerelease) | ⬜ owner — Force Update `cals-dev-v2` on `8151` and review the Recipes tag filter at phone size (also `/next/` on `8152`); **documentation-only checkpoint: the image is functionally identical to rc12**; no schema migration, no data copy, no appdata change |
| `v2.0.0-dev-rc14` | 2026-10-03, [run 37137097231](https://github.com/dougalbob/cals/actions/runs/37137097231) | `29bd7bb` on `cals-dev` (PR #34: recipe archive/restore, decision 59) | `sha256:be601ee04bb8f57182a525931570cc7eba703cbafc3e4fd25bf2f193254233f5` | [v2.0.0-dev-rc14](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc14) (prerelease) | ⬜ owner — Force Update `cals-dev-v2` on `8151` (and `8152` for `/next/`) and review Recipes → Archive / Archived / Restore at phone size; **additive schema migration** (`recipes.is_archived`, `recipes.archived_at`) runs on first start — confirm the backup first; no data copy, no template change |
| `v2.0.0-dev-rc15` | 2026-10-03, [run 37143693979](https://github.com/dougalbob/cals/actions/runs/37143693979) | `be70776` on `cals-dev` (PR #36: decision 40 + Calendar month/week + Hydration relabel + `GET /api/calendar`) | `sha256:0755a3b6f9fddd15644eea6099a95d43dfe1bc7d8a68de665222023ec1bc17be` | [v2.0.0-dev-rc15](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc15) (prerelease) | ⬜ owner — confirm backup, then Force Update `cals-dev-v2` on `8151` (and `8152` for `/next/`) and review at phone size: **+ Add recipe** from each Diary meal opens the recipe picker + portion sheet with the meal preselected; Calendar (Month + Week, day cells link to `/diary/:date`, meal kcal lines, 💧 Hydration ml vs target, bank figure in week cards, 📅 tab/button in nav and Diary header); Fluids card labelled **Hydration** rather than Water. **No schema migration, no data copy, no template change** — rc15 adds one read-only endpoint (`GET /api/calendar`) and the Calendar React route; Phase 12 acceptance is signed off |
| `v2.0.0-dev-rc16` | 2026-10-03, [run 37147534800](https://github.com/dougalbob/cals/actions/runs/37147534800) | `dd2cbef` on `cals-dev` (PR #38: calendar per-day calories fix + owner road-test fixes) | `sha256:69ed52c0b7f409e13f5cff78fbce4a0040fd5b52ea59e72f1ccb25cfba8a175a` | [v2.0.0-dev-rc16](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc16) (prerelease) | ⬜ owner — Force Update `cals-dev-v2` on `8151` (and `8152` for `/next/`) and review at phone size: the **Calendar showing real per-day calories and bank figures** (rc15 showed `0 / goal` on every day), the **calorie wheel** with `bank` / spend / `daily` inside the ring and the inner ring sweeping anticlockwise in red when overspent, the **hydration glass** with the target written across it at 45°, and the **Quick-drinks milk/sugar dots** now visible on Android. **No schema migration, no data copy, no template change** |
| `v2.0.0-dev-rc17` | 2026-10-03, [run 37154091274](https://github.com/dougalbob/cals/actions/runs/37154091274) | `5d05f27` on `cals-dev` (PR #40: calendar day bars, calendar stops at Today, recipe pick via the Recipes tab, Go test workflow) | `sha256:429a63c2987d08571f31d0a8ad011b2545064c8bdc3018d28ecc7548bed70f74` | [v2.0.0-dev-rc17](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc17) (prerelease) | ⬜ owner — Force Update `cals-dev-v2` on `8151` (and `8152` for `/next/`) and review at phone size: an over-goal day in the **Calendar** now draws a green bar with a proportional red tail instead of a full-width red line; the Calendar **cannot be paged past Today** (forward arrow disabled on the current month/week, future URLs clamped back, days that have not happened are not links); **🍽 Add recipe** on a Diary meal card opens the **Recipes tab** with the meal and date carried in, and *Done* returns to `/diary/:date#<meal>`. **No schema migration, no data copy, no template change** — frontend only, plus one new CI workflow file (`.github/workflows/go-validate.yml`, no image content) |
| `v2.0.0-dev-rc18` | 2026-10-03, [run 37158593411](https://github.com/dougalbob/cals/actions/runs/37158593411) | `cd3c4d7` on `cals-dev` (PR #42 merge: hydration/meal-card/Calendar refinements) | `sha256:33b012aa2b80a0c71bd5c4acefa2874ba87d499cc5bec100b15e4b14170f036c` | [v2.0.0-dev-rc18](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc18) (prerelease) | ✅ Owner reports running on Unraid and approves (2026-10-04). Separate per-tap glass volume and daily target, over-target surplus, proportional Today meal fills, and Calendar month opacity reviewed. Frontend-only: **no API/schema change, migration, data copy or template change**; rc14's additive recipe-archive migration runs on first rc14+ start if previously unapplied |
| `v2.0.0-dev-rc19` | 2026-10-04, [run 37164183555](https://github.com/dougalbob/cals/actions/runs/37164183555) | `009a400` on `cals-dev` (PR #44: safe existing-recipe editing and transactional food-correction recalculation) | `sha256:6c0084319576ee8b92272945fdc3a71e6874d6d14dff7d5897a8cd34f0a6f8a2` | [v2.0.0-dev-rc19](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc19) (prerelease) | ⬜ owner — rc24 is reported installed. The owner approved the rc19 safety changes in the Arena preview; no separate Unraid phone review of those changes is recorded. The next requested review is rc25, now published (see [`CURRENT_STATE.md`](../CURRENT_STATE.md) §3). No schema migration or data copy in rc19 |
| `v2.0.0-dev-rc20` | 2026-10-04, [run 37165937734](https://github.com/dougalbob/cals/actions/runs/37165937734) | `4c96fa3` on `cals-dev` (PR #46: the owner's road-test list recorded as decisions 66–73 and the Phase 13 polish slice queued — **documentation only**) | `sha256:67d79b90c27d4fbb446ca33e7abc3076dbf7cb0e4ab33d0cf56f04be4d01b202` | [v2.0.0-dev-rc20](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc20) (prerelease) | ⬜ owner — rc20 was documentation-only and superseded by rc21, included through rc25. No separate update was needed for rc20; owner reports rc24 installed. No schema migration, data copy, appdata operation or template change |
| `v2.0.0-dev-rc21` | 2026-10-04, [run 37189572062](https://github.com/dougalbob/cals/actions/runs/37189572062) | `7523f14` on `cals-dev` (PR #48: Phase 13 polish, decisions 68, 72–78) | `sha256:a42aa40a3e4c06b82cdcaafc373583db60d1b9c1ca5ae6f4d4246fdc0a659ce8` | [v2.0.0-dev-rc21](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc21) (prerelease) | ⬜ owner — rc21's changes remain included in the rc25 line; the owner reports rc24 installed. The 5% meal fills were approved in the Arena preview; no complete Unraid review of the accumulated changes is asserted. No schema migration, data copy, appdata operation or template change in rc21 |
| `v2.0.0-dev-rc34` | 2026-10-05, [run 37387169202](https://github.com/dougalbob/cals/actions/runs/37387169202) | `40f1e171e21c7a77bdb7050a05d635d3a85fb504` on `cals-dev` (PR #76 merge: Phase 15 Settings + PWA installability at `/next/`, plus the More/Back overlay swipe fix; image tag `ghcr.io/dougalbob/cals-dev-v2:v2.0.0-dev-rc34`) | `sha256:1eba3145aa8adafdd6b03445a1082ff92ad77576f13a24b6450880acdb44e173` | [v2.0.0-dev-rc34](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc34) (prerelease) | ✅ **Installed 2026-10-05.** The owner Force Updated the existing `cals-dev-v2` container on `8151` (keeping `ghcr.io/dougalbob/cals-dev-v2:dev-latest`) and confirmed the **Settings** work behaves as intended — the first confirmed item of the accumulated rc28–rc34 road-test. **Still open:** the rest of the phone checklist and **PWA installation on a phone** ([`CURRENT_STATE.md`](../CURRENT_STATE.md) §3 item 10). Two additive `users` ring-limit columns default to 2,000 kcal; no data copy, appdata operation or template change. Tagged [browser suite](https://github.com/dougalbob/cals/actions/runs/37387169333) passed 72/72; the More/Back swipe failure is fixed. Phase 16 owns retargeting/retesting installability at `/`; its audit found **no Cloudflare change is needed** to test or install the PWA ([`phase-16-plan.md`](./phase-16-plan.md) §3) |
| `v2.0.0-dev-rc35` | 2026-10-06, [run 37501237100](https://github.com/dougalbob/cals/actions/runs/37501237100) | `b539637dfc63dd99186559c7e2fc5301b7eeaa59` on `cals-dev` (PR #79 merge: **Phase 16 stage 16.2 — the cutover retarget.** React is served at `/`, the legacy vanilla UI is an unlinked lifeboat at `/legacy/`, `/next` and `/next/*` answer **308** onto the same path with the prefix stripped and the query preserved, and the worker gains a network-only pass-through fetch handler; image tag `ghcr.io/dougalbob/cals-dev-v2:v2.0.0-dev-rc35`) | `sha256:ac864954feea19ff9c3218a0f7c09294e1db947f3e1df49bef1a779b68ca8b8e` | [v2.0.0-dev-rc35](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc35) (prerelease) | ⬜ owner — **Force Update `cals-dev-v2` on `8151`, then the cutover check over the Cloudflare hostname:** `/` opens React, a deep link such as `/diary/<date>` survives a reload, `/legacy/` still opens the old UI, `/next/…` lands on the matching path, the footer reports `2.0.0`, and one entry round-trips. **Then the phone test** (plan §3): install from `/`, launch it standalone, log an entry, and note what re-authentication looks like once the Access session expires. **No schema migration, no data copy, no appdata operation and no template change** — this release is serving-path and build-config only, so rollback is exact (re-pin `v2.0.0-dev-rc34` and restart), with `/legacy/` as a second, independent way back. The four **read-only** Zero Trust checks in [`phase-16-plan.md`](./phase-16-plan.md) §3 are still worth doing. Tagged [browser suite](https://github.com/dougalbob/cals/actions/runs/37501237025) passed |
| `v2.0.0-dev-rc33` | 2026-10-05, [run 37371578204](https://github.com/dougalbob/cals/actions/runs/37371578204) | `e6d4d3c531ceae421245b40879f1b1a58dd7e993` on `cals-dev` (PR #74 merge: Phase 14.6 — the **weekly report** card in Metrics (decision 46; decisions 107–109: a week picker opening on the current week so far, a free **Custom** `from`/`to` range, and best/worst days measured against the daily goal), with the `from`/`to` range added to `GET /api/nutrition/weekly` beside the unchanged `days` parameter; image tag `ghcr.io/dougalbob/cals-dev-v2:v2.0.0-dev-rc33`) | `sha256:46dec0bbfa4f811caf85c2b2d84378e88596b7d3b9a01ee1cdbeae56aedd66c1` | [v2.0.0-dev-rc33](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc33) (prerelease) | Superseded by rc34; rc33 is included in the accumulated rc28–rc34 Force Update (see [`CURRENT_STATE.md`](../CURRENT_STATE.md) §3 item 10). At rc33 publication the tagged browser suite returned 66/68, with the two known navigation failures; rc34 fixes the More/Back swipe and its tag suite passes 72/72. The earlier rc33 checks remain historical. |
| `v2.0.0-dev-rc32` | 2026-10-05, [run 37358754022](https://github.com/dougalbob/cals/actions/runs/37358754022) | `d5a996e22a4652e9cc0fec456b763a381266dda0` on `cals-dev` (PR #72 merge: decision 106's whole-number prefilled food-editor values, smoother metric range loading, 150 ms range throttle/final flush, request cancellation and reduced haptic frequency; image tag `ghcr.io/dougalbob/cals-dev-v2:v2.0.0-dev-rc32`) | `sha256:16334a2811579fd30a1342830a213dd04d6a0fb260c2be400f2a8ddea6b3c629` | [v2.0.0-dev-rc32](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc32) (prerelease) | ⬜ owner — Force Update `cals-dev-v2` on `8151` and review at phone size: in Foods, use **Save & edit** on a FatSecret food, confirm calories/protein/carbs/fat/fibre are whole numbers, then save without edits; in Metrics, drag through an uncached range, confirm both charts stay visible, the URL settles on the final range, and haptics are less frequent. Also complete the rc28–rc31 chart/body-map/Nutrition/road-test review. The owner approved the Arena preview on 2026-10-05. **No schema migration, data copy, appdata operation or template change in rc32**; the accumulated update from rc27 applies rc28's `users.weight_trend_days` and rc29's `users.body_outline` additive migrations. Tagged [browser suite](https://github.com/dougalbob/cals/actions/runs/37358754067) passed 64/66; two owner-deferred `e2e/navigation.spec.ts` tests failed again and uploaded artifacts. PR #72 does not change navigation code/spec |
| `v2.0.0-dev-rc31` | 2026-10-05, [run 37353202360](https://github.com/dougalbob/cals/actions/runs/37353202360) | `33f554c1f52264b4187c953a559ad3347cc94425` on `cals-dev` (PR #70 merge: the owner's road-test papercuts, decisions 102–105 — non-local FatSecret foods become selectable in the Diary and savable/editable from Foods, the quick-drink ⋯ returns to legacy Tea/Coffee rows, drink volumes no longer open with a leading zero, recipe photos gain a **Take photo** entry point (cropping still deferred), recipe authoring shows the summed cooked-weight hint and asks before removing an ingredient; image tag `ghcr.io/dougalbob/cals-dev-v2:v2.0.0-dev-rc31`) | `sha256:b86b3c860d02395ea4b6b5672ab402019843ef9e12a2513ea6ee022784054d8a` | [v2.0.0-dev-rc31](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc31) (prerelease) | ⬜ owner — Force Update `cals-dev-v2` on `8151` and road-test at phone size: search a food the household has never used (FatSecret) and log it from both the Diary and the Foods screen (decision 102); check the ⋯ is back on Tea and Coffee and that clearing the volume box no longer leaves a leading zero (decision 103); use **Take photo** on a recipe (decision 104); see the summed cooked-weight hint and be asked before an ingredient is removed (decision 105). One update also carries rc28's chart drag test, rc29's body map and rc30's Nutrition screen. The owner approved the Arena preview on 2026-10-05 ("all looks good"). **No schema migration, no data copy, appdata operation or template change.** The tag's [browser suite](https://github.com/dougalbob/cals/actions/runs/37353202025) passed 64 of 66 tests; the two failures are the pre-existing rc30 nav specs |
| `v2.0.0-dev-rc30` | 2026-10-05, [run 37346042746](https://github.com/dougalbob/cals/actions/runs/37346042746) | `1660342d6293b792bcd320c867b7081ad294b68b` on `cals-dev` (PR #69 merge: Phase 14.5 — the Nutrition screen with its 7-day macro donut, traffic-light status and editable goals; drink calories counted into the nutrition total with `GET /api/nutrition/weekly`; the target-weight editor; and the nav Back/More overlay change; image tag `ghcr.io/dougalbob/cals-dev-v2:v2.0.0-dev-rc30`) | `sha256:4d8d419b4e6afc5212ebd81853942e86b6ac0034791ffa3ebbaec6e46d610903` | [v2.0.0-dev-rc30](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc30) (prerelease) | ⬜ owner — Force Update `cals-dev-v2` on `8151` and road-test `/next/nutrition` at phone size alongside the pending rc28/rc29 checks; one update carries them all. **No schema migration, no data copy, appdata operation or template change.** The tag's [browser suite](https://github.com/dougalbob/cals/actions/runs/37346042700) failed 2 of 66 — both `e2e/navigation.spec.ts`: the › arrow spec still expects the pre-#69 `Show earlier navigation destinations` label (the button now reads **Back** / `Show main navigation`), and the swipe spec starts its touch under the new **More** overlay at the right edge, which swallows it. Diagnosed 2026-10-05; a nav follow-up is needed. Publication record landed late, in the rc31 evidence PR |
| `v2.0.0-dev-rc29` | 2026-10-05, [run 37327096123](https://github.com/dougalbob/cals/actions/runs/37327096123) | `3c54b824f7bfb8818a70f327b073e10b42e34a14` on `cals-dev` (PR #67 merge: Phase 14.4 — the body-map measurement picker, decisions 96–100, plus decision 101's route-level code splitting; image tag `ghcr.io/dougalbob/cals-dev-v2:v2.0.0-dev-rc29`) | `sha256:7f101181d96492b62a1f3c78cc94c4af5ca4552bc7ce8baa974ee95d6c8a2436` | [v2.0.0-dev-rc29](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc29) (prerelease) | ⬜ owner — Force Update `cals-dev-v2` on `8151` and road-test `/next/metrics` at phone size: choose the outline the first time (Female/Male), tap every point including a hollow never-measured one, step a value 0.5 cm and save, meet both confirmations, correct a past session from the history — and, since one update covers both, drag rc28's charts too (pull the weigh-in chart right, check the trend label, the goal chart's bands). The owner approved the Arena preview on 2026-10-05 ("looks good"). One **additive migration** (`users.body_outline`, nullable) runs on first start; the frontend is now code-split per route — no data copy, appdata operation or template change. The tag's [browser suite](https://github.com/dougalbob/cals/actions/runs/37327096209) passed 66 tests |
| `v2.0.0-dev-rc28` | 2026-10-05, [run 37312285484](https://github.com/dougalbob/cals/actions/runs/37312285484) | `e34e9a342c1706750594515349a7bcde871b32dc` on `cals-dev` (PR #65 merge: Phase 14.3 — the pannable weigh-in and goal-vs-consumed charts, decisions 69–71, 94, 95; image tag `ghcr.io/dougalbob/cals-dev-v2:v2.0.0-dev-rc28`) | `sha256:6d406d333f028febd77a1f0bf06d5bba68bbbbcfb04afe91caa6b7c179788a19` | [v2.0.0-dev-rc28](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc28) (prerelease) | ⬜ owner — Force Update `cals-dev-v2` on `8151` and drag the charts at phone size: pull the weigh-in chart right to reach older weigh-ins (the window is in the URL), check the dashed trend is labelled with its method and window, and confirm the goal chart's green/amber/red bands. The owner approved the Arena preview on 2026-10-05 ("looks good"). One **additive migration** (`users.weight_trend_days`, default 7) runs on first start — no data copy, appdata operation or template change. The tag's [browser suite](https://github.com/dougalbob/cals/actions/runs/37312285365) passed |
| `v2.0.0-dev-rc27` | 2026-10-05, [run 37296647260](https://github.com/dougalbob/cals/actions/runs/37296647260) | `3619859ebb55b53b74948afd645196898549c74e` on `cals-dev` (PR #62 merge: the windowed bank — Phase 14.2 — plus 14.1's metrics backend foundations; image tag `ghcr.io/dougalbob/cals-dev-v2:v2.0.0-dev-rc27`) | `sha256:bf36365a44e46e454878eb4ebf82770a45d3cb2f8c8d50e95f3c154b6d251130` | [v2.0.0-dev-rc27](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc27) (prerelease) | ✅ **Installed and signed off.** The owner Force Updated `cals-dev-v2` on `8151` on 2026-10-05 and read the new bank figure on **both** accounts via Swap user, reviewing Today / Diary / Calendar / Metrics at phone size: **"all looks good"**. The figure covers the **last 14 completed days** and **skips days with no logging at all** (a logged glass of water still counts as a logged day), which is why it reads differently from the old since-day-one total; every React surface labels its window. One additive migration (`users.bank_window_days`, default 14) ran on first start — no data copy, appdata operation or template change. Owner approved the Arena preview the same day. PR checks [Docker/runtime](https://github.com/dougalbob/cals/actions/runs/37292157541), [Go](https://github.com/dougalbob/cals/actions/runs/37292157536) and [browser](https://github.com/dougalbob/cals/actions/runs/37296373968) passed (60 browser tests); the tagged [browser run](https://github.com/dougalbob/cals/actions/runs/37296647285) also passed 60 tests |
| `v2.0.0-dev-rc26` | 2026-10-04, [run 37224234167](https://github.com/dougalbob/cals/actions/runs/37224234167) | `0b7e20abd0b87d8edb063da34df732f1dfbe96ba` on `cals-dev` (PR #59: Admin/Standard roles from `ADMIN_EMAILS` / `STANDARD_EMAILS`, the server-side acting-user switch, the "Viewing as …" banner, and an Admin-only `GET /api/users`; image tag `ghcr.io/dougalbob/cals-dev-v2:v2.0.0-dev-rc26`) | `sha256:10ef77f927660801efe3cc14244e00b5a5e164970fcaeeaab6d8c09cbc0e9851` | [v2.0.0-dev-rc26](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc26) (prerelease) | ✅ Owner approved the Arena preview before publication and added both `.env` lines to the live appdata; the owner then tested rc26 on Unraid and signed it off as working on 2026-10-05, which closed the earlier rc24/rc25 installation gap. **Superseded the same day by rc27**, now the last reported installation. PR checks [Docker/runtime](https://github.com/dougalbob/cals/actions/runs/37223867077) and [Go](https://github.com/dougalbob/cals/actions/runs/37223867039) passed; the PR browser suite was skipped (no `run-e2e` label) and the [tagged browser run](https://github.com/dougalbob/cals/actions/runs/37224234153) passed 60 tests. One additive migration (`users.is_admin`), no data copy, appdata operation or template change |
| `v2.0.0-dev-rc25` | 2026-10-04, [run 37212991108](https://github.com/dougalbob/cals/actions/runs/37212991108) | `1e38a777c1c234cccc1a711fdde5abbd8a9e36e5` on `cals-dev` (PR #56: recipe-photo upload/replacement and UI refinements, decisions 82–85; image tag `ghcr.io/dougalbob/cals-dev-v2:v2.0.0-dev-rc25`) | `sha256:814484b008cb5c915e15687208e0c1ab712f60c2c58bf35e32c855b8b6a2fc0d` | [v2.0.0-dev-rc25](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc25) (prerelease) | ✅ Owner sign-off: all published RC candidates through rc25 signed off on 2026-10-04, closing Phase 13 acceptance. At publication the last reported Unraid installation was rc24; rc25 was later covered by the rc26 and rc27 updates, with no item-by-item phone result separately documented. Tagged browser run [37212991110](https://github.com/dougalbob/cals/actions/runs/37212991110) passed 60 tests. No schema migration, data copy, appdata operation or template change |
| `v2.0.0-dev-rc24` | 2026-10-04, [run 37206446238](https://github.com/dougalbob/cals/actions/runs/37206446238) | `c5828b6f56edb60124cf982396945ebf7da5b663` on `cals-dev` (PR #54: no-photo recipe authoring and transactional `POST /api/recipes`) | `sha256:1d1f9c4047ea39624f60b460759f994ee39c3faac87c270bb42ca847fedd9e4` | [v2.0.0-dev-rc24](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc24) (prerelease) | ✅ Owner reported rc24 installed on `cals-dev-v2` and new recipe creation working well; it has since been superseded by rc25. Its tagged browser run [37206446239](https://github.com/dougalbob/cals/actions/runs/37206446239) passed 53 tests. No schema migration, data copy, appdata operation or template change |
| `v2.0.0-dev-rc23` | 2026-10-04, [run 37202837131](https://github.com/dougalbob/cals/actions/runs/37202837131) | `54eae293` on `cals-dev` (PR #52: stabilisation pass — Playwright browser suite, container runtime smoke, portion-sheet and phone tick-box fixes. **No schema or API change**) | `sha256:7dcc259c9c8e6d85c6be193d5446c10bcd1fb3cf7a168e92e0867b58c9d02444` | [v2.0.0-dev-rc23](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc23) (prerelease) | ✅ Owner sign-off covered all published RC candidates through rc25 on 2026-10-04; no full accumulated phone review is separately recorded. The last reported Unraid installation remains rc24, and rc25 deployment is unconfirmed (see [`CURRENT_STATE.md`](../CURRENT_STATE.md) §3). The tag's [browser run](https://github.com/dougalbob/cals/actions/runs/37202837122) passed 51 tests. No schema migration, data copy, appdata operation or template change |
| `v2.0.0-dev-rc22` | 2026-10-04, [run 37194090053](https://github.com/dougalbob/cals/actions/runs/37194090053) | `c022f059` on `cals-dev` (PR #50: recipe-origin marker, mobile Diary Edit-sheet fix, Today hydration removal and 5% meal fills) | `sha256:08a9f465e3d6c7b01d830bd95d68a2bbc629af26150e2ab16d1c79db71c09a12` | [v2.0.0-dev-rc22](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc22) (prerelease) | ✅ Owner sign-off covered all published RC candidates through rc25 on 2026-10-04; the last reported installation was later confirmed as rc26 on 2026-10-05, which supersedes this row. One additive default-false `recipes.is_own_creation` migration runs on startup; no data copy or template change |
## Not implemented yet

- ~~The first end-to-end Unraid run has not been verified.~~ **Verified (owner, 2026-10-02): V2 was installed from `cals-dev-v2.xml` and the Cloudflare route was moved to `8151`.** The anonymous-pull gate has passed on every publish since rc2; Docker still cannot run in the Arena sandbox, so the *image build* is verified by CI and the *container run* by the owner.
- Stable publishing is not implemented: there is no workflow for a `latest` image after promotion to `main`, and none for `cals-dev-v2.xml` updates.
- The publish workflow cannot fix package visibility itself: GitHub does not expose package administration to `GITHUB_TOKEN`. If the anonymous-pull check fails, only the owner (who has admin on the package) can flip it, and the failure message says exactly where.

### 2026-10-03 — rc5 dashboard checkpoint

Published **`v2.0.0-dev-rc5`**, source `30c2f327a5c60152cd1530992d2db381a58efa86`
(PR #17 merge on `cals-dev`). [Publish run 37076288897](https://github.com/dougalbob/cals/actions/runs/37076288897)
passed, including anonymous pull of `dev-latest`. Digest:
`sha256:661ca057c2ab3d3b3c79028a89cd54bb9fbeb4e9364a280ce0fecff9ce0058d7`.
[Prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc5).
Owner reviewed the Arena dashboard and authorized the full publication loop.
Force Update `cals-dev-identity` (8152), then open `/next/` to see Today, meal tiles,
dual ring and shared fluids card with daily counts/confirmed long-press deletion.
No data copy, template change or schema migration is needed. The legacy root UI
remains unchanged. Real-data Unraid smoke test is still the owner's to perform.

### 2026-10-03 — rc7 calorie-ring checkpoint

Published **`v2.0.0-dev-rc7`**, source `9202a4f4fba9bd0299535e5dd7b53f6ee4983f6e`
(PR #20 merge on `cals-dev`). [Publish run 37108058099](https://github.com/dougalbob/cals/actions/runs/37108058099)
passed, including the `cals-dev` ancestry guard, Docker build, GHCR push, prerelease creation
and anonymous pull of `dev-latest`. Digest:
`sha256:5f36771bc0bf260d9f26fa6d479627eac91d0789bc10e2dc6d1716667ec98bf9`.
[Prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc7).
The checkpoint adds the fixed ±2,000 kcal bank ring; inner daily-goal display remains
independent. No schema migration or data copy is required. The owner must Force Update
`cals-dev-v2` to review on real data; V1 and the legacy root UI are unchanged.

### 2026-10-03 — rc8 Phase 12 close-out checkpoint

Published **`v2.0.0-dev-rc8`**, source `f6a6675c72c277b17edceb414f3f6781f29f869e`
(PR #22 merge on `cals-dev`). [Publish run 37110417233](https://github.com/dougalbob/cals/actions/runs/37110417233)
passed, including the `cals-dev` ancestry guard, Docker build, GHCR push, prerelease creation
and anonymous pull of `dev-latest`. Digest:
`sha256:74a5094f079e558831b690f640536c9fc8af63d50b12bac930f3b1f6a95c72dc`.
[Prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc8).

The checkpoint contains two frontend-only changes: the bank ring now starts both directions at
12 o'clock, with a surplus sweeping clockwise in green and a deficit sweeping anticlockwise in
red (decision 28), and logged food/recipe rows gained the missing Phase 12 **Edit** action, which
rescales the entry's own saved nutrition with a live calorie preview. No backend, schema,
API-contract, data-copy or template change. The owner must Force Update `cals-dev-v2` (8151) and
`cals-dev-identity` (8152) to review on real data; V1 and the legacy root UI are unchanged.

### 2026-10-03 — rc9 Diary correctness and Phase 13 discovery checkpoint

Published **`v2.0.0-dev-rc9`**, source `0ae1b3cee4cb2bf23af0767c9c7142aa25bb30a1`
(PR #24 merge on `cals-dev`). [Publish run 37114327989](https://github.com/dougalbob/cals/actions/runs/37114327989)
passed, including the `cals-dev` ancestry guard, Docker build, GHCR push, prerelease creation and
anonymous pull of `dev-latest`. Digest:
`sha256:fd58d5a1a89f695ff9f30e7a331a6984099a0d151daac555ee099c36d9e22f73`.
[Prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc9).

This checkpoint fixes the Diary JSON response header and sends the complete nutrition snapshot on
food add, with Go/frontend regression tests. It also records the agreed Phase 13 food-serving and
recipe-portion behavior for the next implementation session. No schema migration, data copy or
appdata access. The owner may Force Update `cals-dev-v2` (8151) to review the update; no Unraid
update or live-data operation was performed by this session.

### 2026-10-03 — rc10 shared Recipes metadata checkpoint

Published **`v2.0.0-dev-rc10`**, source `94c502bfbb3ecb0adad64e08dfa51afda1959494`
(PR #26 merge on `cals-dev`). [Publish run 37122503399](https://github.com/dougalbob/cals/actions/runs/37122503399)
passed the `cals-dev` ancestry guard, Docker build, exact-tag and `dev-latest` pushes, prerelease
creation, and anonymous-pull check. Image digest:
`sha256:d0b1ef9e54cd1915a2bb1a07c75d0728af6ec2d5b95815de6b7d4b11f297ccbd`.
[Prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc10).

This release adds the first Phase 13 Recipes increment: shared meal occasions, dish type, up to two
known-Food key foods and optional total minutes; user-scoped favourites; the catalogue/detail UI and
facet filters. Its SQLite changes are additive and run automatically when the new image starts. No
appdata copy or manual data migration was performed. `dev-latest` now points to rc10; the owner can
Force Update `cals-dev-v2` on `8151` to review. This session did not access Unraid or live appdata.

### 2026-10-03 — rc11 Phase 13 servings and portions checkpoint

Published **`v2.0.0-dev-rc11`**, source `6740af986808b2476f0f46bcbffe856d810ec9b5`
(PR #28 merge on `cals-dev`). [Publish run 37125235067](https://github.com/dougalbob/cals/actions/runs/37125235067)
passed the `cals-dev` ancestry guard, Docker build, exact-tag and `dev-latest` pushes, prerelease
creation, and the anonymous-pull check. Image digest:
`sha256:95ea95e40d09a2ae875eade049b907c6291ec7735bd196a9c35a7f34237e4d63`.
[Prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc11).

This checkpoint is the second Phase 13 increment, following owner decisions 29–32. Foods can carry
several named gram-backed measures beside FatSecret's own (`fatsecret_serving_id IS NULL` marks the
household rows, which are replaced on edit while FatSecret rows are preserved), and Add/Edit opens with
an explicit serving/grams toggle that only offers serving mode when a real measure exists. Diary entry
responses now carry the logged food's serving metadata so Edit offers the same choices, while the rows
themselves still store grams plus their own nutrition snapshot. Recipe detail logs a portion: fractions
of the whole cooked recipe, direct gram editing, and a per-user remembered usual backed by the new
`recipe_user_portions` table — the first successful log becomes the usual, later amounts are one-off
unless **“Make this my usual”** is ticked. `POST /api/diary` accepts `make_usual`.

The SQLite changes are **additive** (`food_servings` household rows and `recipe_user_portions`) and run
automatically when the new image starts. No appdata copy, template change or manual data migration was
performed, and this session did not access Unraid or live appdata. Cooked-weight concentration maths and
its unit tests are unchanged. `dev-latest` now points to rc11; the owner should Force Update
`cals-dev-v2` on `8151` and review Foods (measures), Diary add/edit (serving/grams) and Recipes →
Add to diary (fractions, grams, remembered usual) at phone size as both identities.

The release was cut with the owner's **“Lets publish”** directive (owner decision 20, 2026-10-03); the
sequence is now written down in [`git-workflow.md`](./git-workflow.md#lets-publish--the-owners-end-to-end-delivery-directive)
so a later session does not have to rediscover it.

### 2026-10-03 — rc12 tap-to-filter recipe tags, decisions 41–54 and the docs restructure

Published **`v2.0.0-dev-rc12`**, source `ead2bf9a7d528f02171b8eeff6c63c5de024a0fd`
(PR #30 merge on `cals-dev`). [Publish run 37130651708](https://github.com/dougalbob/cals/actions/runs/37130651708)
passed the `cals-dev` ancestry guard, Docker build, exact-tag and `dev-latest` pushes, prerelease
creation, and the anonymous-pull check. Image digest:
`sha256:59631e659d11cfd32423fa87d50ba35b93a578fbc0847d6ac51550ac9e7da928`.
[Prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc12).

This checkpoint is Phase 13's third slice plus documentation work, and it is **frontend-only**:

- **Tap-to-filter recipe tags** (owner decision 41): tapping a tag on a recipe card filters the
  catalogue in place, and each further tag narrows it again because every selected tag must match
  (AND). A “Filtering by” row lists the active tags with per-tag removal and **Clear tags**, the
  results line reads “2 of 4 recipes match”, and the facet dropdowns stay in step with the tapped tags
  as one selection. The selection rides in the URL (`/recipes?tags=…`), so reload, Back and a trip
  into a recipe keep it; a tag on the recipe page opens the catalogue already filtered by it.
- **The documentation restructure**: status now lives only in
  [`../CURRENT_STATE.md`](../CURRENT_STATE.md), dated narrative in
  [`../history/rebuild-log.md`](../history/rebuild-log.md), and `rebuild-kickoff.md` is commands and
  guardrails only. This is why the release documentation did not have to change in four places.
- **Discovery decisions 42–54** recorded in the decision log: unlogged days excluded from the bank
  (42), per-person bank (43), user-definable ring window (44), an admin role with a swap-user control
  rather than a household view (45), no notifications but a weekly report (46), user-selectable
  tracked nutrients with a missing-data audit (47), no exercise credit for now (48), a planned
  **calendar** for reaching historic dates (49), no logging shortcuts (50), the four meal slots stay
  (51), no barcode scanning (52), no offline capability (53), and the household data is backed up (54).

**No API, schema, migration, template or appdata change** — the tags were already in the recipe
payload, so this image can be Force Updated over any earlier checkpoint with no data work. The session
did not access Unraid or live appdata. `dev-latest` now points to rc12; the owner should Force Update
`cals-dev-v2` on `8151` (and the LAN dev container on `8152` for `/next/`) and review the Recipes
catalogue at phone size.

### 2026-10-03 — rc13 recipe-adaptation plan checkpoint

Published **`v2.0.0-dev-rc13`**, source `9260e107293f3f5e80d0046998a7ea840c348f2d`
(PR #32 merge on `cals-dev`). [Publish run 37132678548](https://github.com/dougalbob/cals/actions/runs/37132678548)
passed the `cals-dev` ancestry guard, Docker build, exact-tag and `dev-latest` pushes, prerelease
creation and the anonymous-pull check. Image digest:
`sha256:d28a820975261cff158c6d7f89f652d4846cac7cc68bc707de3c13f1dbf48103`.
[Prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc13).

This is a **documentation-only checkpoint**, cut on the owner's **“Lets publish”** directive (decision
20). It records the gap the owner raised — there is no way to adapt an existing recipe — together with
the rule that makes the editor safe: **editing a recipe must never change the calories recorded in
historic diary data** (decisions 55–58 in the
[decision log](../product/vision-and-open-questions.md#adapting-an-existing-recipe--decisions-5558-2026-10-03)),
verified against the real Go handlers with the two edges written down (a rename relabels historic rows
through the join; deleting a recipe that history references fails on the foreign key).

Because the runtime image copies only the Go binary and `web/`, **rc13 is functionally identical to
rc12** — there is nothing new to review in it, and nothing that needs Force Updating on its own
account. `dev-latest` now points to rc13 so the moving tag tracks the current `cals-dev` state. The
owner's outstanding action is unchanged: Force Update `cals-dev-v2` on `8151` (and `/next/` on the LAN
container `8152`) and review the Phase 13 tag filter at phone size. No API, schema, migration, template
or appdata change; the session did not access Unraid or live appdata.

### 2026-10-03 — rc14 recipe archive/restore (decision 59)

Published **`v2.0.0-dev-rc14`**, source `29bd7bb3bc605821c0e723c20ffab091d5f87fe8`
(PR #34 merge on `cals-dev`). [Publish run 37137097231](https://github.com/dougalbob/cals/actions/runs/37137097231)
passed the `cals-dev` ancestry guard, Docker build, exact-tag and `dev-latest` pushes, prerelease
creation and the anonymous-pull check. Image digest:
`sha256:be601ee04bb8f57182a525931570cc7eba703cbafc3e4fd25bf2f193254233f5`.
[Prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc14). PR #34's build-only
Docker check also passed before the merge.

Phase 13's fourth slice, cut on the owner's **“Lets publish”** directive (decision 20) after he
reviewed it in the Arena preview:

- **Archive/restore** (decision 59): a recipe can be archived household-wide from its detail page and
  restored from the Recipes page or its own page; archived recipes are hidden from the list and cannot
  be logged until restored, and every recorded Diary row, day total, bank figure and recipe label is
  unchanged. Heart **Favourites** and archive-box **Archived** toggles share one row in the filter card.
- **API:** `PUT /api/recipes/{id}/archive`; `GET /api/recipes?include_archived=true`; `409` on logging
  an archived recipe and on deleting a recipe the Diary references (previously an opaque `500`).
- **Legacy UI:** its Delete button became Archive.

**Schema: additive migration.** `recipes` gains `is_archived INTEGER NOT NULL DEFAULT 0` and
`archived_at DATETIME`, applied automatically on first start of the new image; every existing recipe
stays visible. It was tested against a populated, re-migrated database in the sandbox. No appdata copy,
template change or manual data step was performed, and the session did not access Unraid or live
appdata. Because it is the first checkpoint since rc11 to change the schema, the owner should confirm
the backup (decision 54) before Force Updating `cals-dev-v2` on `8151`, then review Recipes at phone
size. `dev-latest` now points to rc14. Decision 60 (recalculating recipes after a food correction) is
not in this image.

### 2026-10-03 — rc16 calendar fix and the owner's road-test changes

Published **`v2.0.0-dev-rc16`**, source `dd2cbefee630478b0e0ca66a07bbf5f95eb723d1`
(PR #38 merge on `cals-dev`). [Publish run 37147534800](https://github.com/dougalbob/cals/actions/runs/37147534800)
passed the `cals-dev` ancestry guard, Docker build, exact-tag and `dev-latest` pushes, prerelease
creation and the anonymous-pull check. Image digest:
`sha256:69ed52c0b7f409e13f5cff78fbce4a0040fd5b52ea59e72f1ccb25cfba8a175a`.
[Prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc16). PR #38's build-only
Docker check also passed before the merge.

**The reason for this checkpoint:** rc15's Calendar rendered `0 / 1,250 kcal` on every day with a
bank of `+133,184,631 kcal` on the owner's live container, while Home and Diary were correct.
`mattn/go-sqlite3` converts columns declared `DATE` into `time.Time`, which `database/sql` renders
as RFC3339 when scanned into a string, so the handler's per-day map never matched a `YYYY-MM-DD`
key and the unparsable bank start date overflowed `time.Duration`. Every calendar query now selects
and compares `date(...)`, as `HandleGetBank` already did, with three Go regression tests.

Also in this image, from the owner's road test: the calorie wheel's two captions moved inside the
ring (`bank ±N` = balance plus what is left of today, the day's spend, `daily ±N`); the inner ring
now sweeps anticlockwise in red once the day is overspent, matching the outer ring's convention; the
hydration target is written across the glass at 45° so the `x / y ml` caption could go; and the
Quick-drinks milk/sugar control became a bordered chip with a drawn SVG icon after the old `·`
glyphs proved invisible on Android.

**No schema migration, no data copy, no template change** — the only backend change is the SQL
inside the existing read-only `GET /api/calendar`. The session did not touch Unraid or live appdata.
`dev-latest` now points to rc16.

### 2026-10-03 — rc17: calendar clarity, the recipe pick hand-off, and a Go test gate

Published **`v2.0.0-dev-rc17`**, source `5d05f2789a947e162d73074df944fe729da9080f` (PR #40 merge on
`cals-dev`). [Publish run 37154091274](https://github.com/dougalbob/cals/actions/runs/37154091274) passed the `cals-dev`
ancestry guard, Docker build, exact-tag and `dev-latest` pushes, prerelease creation and the
anonymous-pull check. Image digest: `sha256:429a63c2987d08571f31d0a8ad011b2545064c8bdc3018d28ecc7548bed70f74`.
[Prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc17). Before the merge, PR #40
went green on **both** validation workflows — the build-only Docker check and, for the first time,
`Go tests (validation)`.

**What is in it** (decisions 62–64, all frontend): a Calendar day over goal draws a green bar split at
the goal with a proportional red tail for the overspend instead of a full-width red line; the Calendar
cannot be paged past Today (forward arrow disabled on the current month/week, future anchors clamped,
days that have not happened are not links); and **🍽 Add recipe** on a Diary meal card hands over to the
Recipes tab carrying the meal and date as URL state, opening the portion sheet pre-filled and returning
to `/diary/:date#<meal>` after logging. Decision 40's modal picker is deleted, not kept alongside it.

**What is not in it:** no endpoint, schema or appdata change — `GET /api/calendar`, `POST /api/diary`
and the recipe handlers are untouched, so this is a safe Force Update with no migration on first start.
The Diary's own › arrow and the API still accept a future date (open question in
[`../product/vision-and-open-questions.md`](../product/vision-and-open-questions.md)); only the
Calendar clamps.

The session did not touch Unraid or live appdata. `dev-latest` now points to rc17.

### 2026-10-03 — rc18: hydration, meal-card and Calendar polish

Published **`v2.0.0-dev-rc18`**, source `cd3c4d770fd6067d8a4118c966f5404aa956ee29` (PR #42 merge on
`cals-dev`). [Publish run 37158593411](https://github.com/dougalbob/cals/actions/runs/37158593411)
passed the `cals-dev` ancestry guard, Docker build, exact-tag and `dev-latest` pushes, prerelease
creation and anonymous-pull verification. Image digest:
`sha256:33b012aa2b80a0c71bd5c4acefa2874ba87d499cc5bec100b15e4b14170f036c`.
[Prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc18).
PR #42 passed both validation workflows — [Docker](https://github.com/dougalbob/cals/actions/runs/37158443118)
and [Go vet/tests](https://github.com/dougalbob/cals/actions/runs/37158443251) — and the post-merge
`cals-dev` Go test run [37158561468](https://github.com/dougalbob/cals/actions/runs/37158561468) passed
before the tag was created.

**What changed:** Today reads the configured daily hydration target rather than briefly showing the
fallback when a custom target is set; the target is written vertically across the glass at 90°, while
the one-tap glass still logs its separate configured Water-drink volume. The card reports the exact
surplus after the target is exceeded. Today meal cards have proportional calorie fills behind their
existing content. Calendar month-cell opacity now compares against the selected month rather than the
first padded date, so in-month days stay clear even when the grid begins in the previous month; padded
out-of-month dates and future dates remain muted, and future dates remain non-clickable.

**No API or schema change, no migration, no data copy and no template change.** The frontend session
verified 169/169 tests, lint, typecheck, `build:go` and `build:preview`; it did not access Unraid or live
appdata. `dev-latest` now points to rc18; on 2026-10-04 the owner confirmed rc18 is running on Unraid
and approved it.

### 2026-10-04 — rc19: safe recipe editing and transactional food corrections

The owner exercised both authorized safety slices in the Arena preview and signed off before
publication. PR #44 ([checks](https://github.com/dougalbob/cals/pull/44)) merged to `cals-dev` as
`009a400028190c963fb917f3a1b2a162f5468e84`. The [PR Docker check](https://github.com/dougalbob/cals/actions/runs/37164039584)
and [PR Go vet/tests](https://github.com/dougalbob/cals/actions/runs/37164039583) passed; the
post-merge `cals-dev` Go test run [37164158570](https://github.com/dougalbob/cals/actions/runs/37164158570)
also passed. That exact merge commit was tagged `v2.0.0-dev-rc19`.

The [publish workflow](https://github.com/dougalbob/cals/actions/runs/37164183555) passed the
`cals-dev` ancestry guard, Docker build, exact-tag and `dev-latest` pushes, prerelease creation and
anonymous-pull check. Image digest:
`sha256:6c0084319576ee8b92272945fdc3a71e6874d6d14dff7d5897a8cd34f0a6f8a2`.
[Prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc19).

**What changed:** the React detail route edits an existing shared recipe, with the fixed-name rule
also enforced in the API and legacy editor. Recipe updates and food corrections are transactional;
food nutrition corrections recalculate every dependent recipe, including archived recipes, while
preserving manual cooked weights. Saved Diary grams, nutrition, totals and bank history are unchanged.
**No schema migration, appdata operation, data copy or template change.** The owner had not yet
Force Updated Unraid to rc19 when this checkpoint was recorded. That review was superseded by the
later checkpoints, rc22, rc23 and then rc24; the owner subsequently reported rc24 installed and recipe
creation working well. The current phone review is for the future photo-upload checkpoint.

### 2026-10-04 — rc21: Phase 13 polish (PR #48, decisions 68, 72–78)

The owner approved the Arena preview before publication. PR #48 passed [Docker validation](https://github.com/dougalbob/cals/actions/runs/37189445342)
and [Go vet/tests](https://github.com/dougalbob/cals/actions/runs/37189445347), then merged to `cals-dev`
as `7523f14c7c172bb9b01fb225202ef6a239401445`. [Publish run 37189572062](https://github.com/dougalbob/cals/actions/runs/37189572062)
passed the ancestry guard, image build/push, prerelease creation and anonymous-pull check. Digest:
`sha256:a42aa40a3e4c06b82cdcaafc373583db60d1b9c1ca5ae6f4d4246fdc0a659ce8`;
[prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc21).

This checkpoint includes the fixed Recipes navigation stacking, 25%-opacity proportional Diary meal
fills, additive per-user recipe-log counts, compact count/Favourite visuals with the transparent 66×66
Favourite target, archived-pill repositioning, and five-slot navigation with swipe/haptics and the
temporary overflow arrow. Frontend lint, typecheck, 178 Vitest tests, `build:go` and `build:preview`
passed; PR Docker and Go validation passed. **No schema migration, data copy, appdata operation or
template change.** No Unraid Force Update was performed during rc21 publication; rc21 was later
superseded by rc24, which the owner reports installed. See `CURRENT_STATE.md` §3 for the next phone review.

### 2026-10-04 — rc23: the stabilisation checkpoint (PR #52)

The owner directed a test-and-housekeeping pass before Phase 14 rather than a feature pass: test the app
as it stands, fix only confirmed problems, leave a record. PR #52 merged to `cals-dev` as
`54eae29342b03f7f6a78adce26d943cface915e4`. On the PR: [Docker validation](https://github.com/dougalbob/cals/actions/runs/37202741637)
(including the new disposable-database runtime smoke), [Go vet/tests](https://github.com/dougalbob/cals/actions/runs/37202741627)
and the [milestone browser suite](https://github.com/dougalbob/cals/actions/runs/37202741609). The
post-merge Go run [37202830447](https://github.com/dougalbob/cals/actions/runs/37202830447) passed too.

[Publish run 37202837131](https://github.com/dougalbob/cals/actions/runs/37202837131) passed the
`cals-dev` ancestry guard, Docker build, exact-tag and `dev-latest` pushes, prerelease creation and the
anonymous-pull check. Digest: `sha256:7dcc259c9c8e6d85c6be193d5446c10bcd1fb3cf7a168e92e0867b58c9d02444`;
[prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc23). **First checkpoint whose
tag also triggered the milestone browser suite** ([run 37202837122](https://github.com/dougalbob/cals/actions/runs/37202837122),
51 passed) — the record that the phone journeys were exercised on exactly the deployed commit.

What it adds: a Playwright browser suite (51 tests — Diary flows, the Today/Diary hydration split with
drink-calorie accounting, the origin marker and catalogue filters, and the whole recipe area control by
control) that runs at milestones; a container runtime smoke in CI that starts the built image with a
disposable database, checks its routes, schema and no-`DEV_MODE` auth path; the recipe portion sheet's
Cancel / Add to diary actions moved into the modal footer (they were 63 px below the fold at 360 px
wide); and the phone tick-box fix — `touch-action: manipulation` plus non-selectable labels — for the
reported Own creation / Meal occasion taps being read as text selection or double-tap zoom. **No API,
schema, migration, data copy, appdata operation or template change.** The owner later reported rc24
installed; the general rc23 phone checks beyond the reported successful recipe-creation flow are not
asserted as complete here.

### 2026-10-04 — rc22: recipe-origin marker and Diary/Today polish (PR #50)

The owner approved the Arena preview before publication. PR #50 passed [Docker validation](https://github.com/dougalbob/cals/actions/runs/37193901527) and [Go vet/tests](https://github.com/dougalbob/cals/actions/runs/37193901505), then merged to `cals-dev` as `c022f059ec46b26be5b5672b7c1096bbff44cd67`. The post-merge Go test run [37194061255](https://github.com/dougalbob/cals/actions/runs/37194061255) also passed. [Publish run 37194090053](https://github.com/dougalbob/cals/actions/runs/37194090053) passed the `cals-dev` ancestry guard, Docker build, exact-tag and `dev-latest` pushes, prerelease creation and anonymous-pull check. Digest: `sha256:08a9f465e3d6c7b01d830bd95d68a2bbc629af26150e2ab16d1c79db71c09a12`; [prerelease](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc22).

This checkpoint adds the orange shared **Own creation** recipe marker and catalogue filter, fixes the mobile Diary Edit sheet with a pinned action footer and locked background scrolling, removes hydration and Quick drinks from Today while keeping them on Diary, and uses 5% color alpha for Today and Diary meal fills. The additive `recipes.is_own_creation INTEGER NOT NULL DEFAULT 0` migration preserves existing recipes as unmarked and applies automatically on startup. Frontend lint, typecheck, all 177 Vitest tests, `build:go`, `build:preview`, PR Docker validation and PR/post-merge Go validation passed. No data copy, appdata operation or Unraid template change. The owner signed off on the Arena preview; rc22 was superseded by later checkpoints, including rc25. At the time of this rc22 release note, the last reported installation was rc24 and the rc25 update/review was pending. The owner later signed off all published RC candidates through rc25 on 2026-10-04, closing Phase 13 acceptance; rc25's Unraid installation remains unconfirmed (see `CURRENT_STATE.md` §3).
