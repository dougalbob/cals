# V2 Container Publishing and Unraid Install

| Field | Value |
|---|---|
| **Status** | 🟢 **V2 is installed and live (2026-10-02): the `cals-dev-v2` container runs on Unraid and the Cloudflare route now points at port `8151`, so V2 is the app the household sees.** Development checkpoints `v2.0.0-dev-rc1` through `v2.0.0-dev-rc8` are published; `dev-latest` points to rc8 and is anonymously pullable (verified in CI). The owner still needs to Force Update the Unraid containers to review rc8 |
| **Updated** | 2026-10-03 |

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

Two GitHub Actions workflows in [`.github/workflows/`](../../.github/workflows), added in PR #7, implement the publishing half of this document. Both build the checked-in `Dockerfile`, so the frontend lint/tests/production build and the CGO Go build run on every execution — a green run is the evidence that the image actually builds.

| Workflow | File | Trigger | What it does | Token permissions |
|---|---|---|---|---|
| **Docker build (validation)** | `docker-validate.yml` | every pull request targeting `cals-dev` or `main` (plus manual dispatch) | `docker build` with no registry login, no push; writes the image id/size to the run summary | `contents: read` |
| **Publish V2 image (development)** | `publish-dev-image.yml` | pushing a Git tag matching `v*-dev*` (for example `v2.0.0-dev-rc1`) | guards that the tagged commit is on `cals-dev`, logs in to GHCR, builds, pushes the exact tag and moves `dev-latest`, creates the GitHub prerelease with the image digest in its notes, then logs out and verifies the image pulls **anonymously** (the test Unraid depends on) | `contents: write`, `packages: write` |

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

After it succeeds, make the GHCR package public if it is not already (see [GHCR visibility](#ghcr-visibility)), then apply the update to the `cals-dev-v2` container on Unraid (see [Installing V2 on Unraid](#installing-v2-on-unraid-template-method)).

**If publishing fails:** check the run log first — the guard step names the reason. A GHCR permission error usually means the repository's **Settings → Actions → General → Workflow permissions** do not allow write access; the workflow requests `packages: write` explicitly, but this is the setting to confirm. A failure after the image is pushed (for example, creating the prerelease) can be fixed and the workflow re-run without rebuilding anything by hand.

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
   - The WebUI link opens the React shell at `http://<unraid-host>:8151/next/`. **Expect an empty screen with "401" errors in the browser console when opening it over plain LAN HTTP**: `/next/` itself is public, but every `/api/*` route requires a Cloudflare Access JWT, and a LAN request has none. That is the design, not a broken container — data appears when the page is opened through Cloudflare (below), or in local development via `DEV_MODE`. Direct LAN access cannot substitute: `DEV_MODE` needs a loopback/private bind address, so it does not apply to the container.
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
3. Re-run the verification steps above (health, `/next/`, persistence).

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

The XML currently opens the React shell at `/next/`, where the Phase 11 foundation is served during migration. Update its `WebUI` path when the eventual V2 cutover changes the frontend's public route.

## Part 2 — publish the first V2 image (complete; rc8 is current)

The owner-directed sequence is: **finish the Phase 11 foundation PR first (done — PR #5 is merged into `cals-dev`); make the first GHCR image the next focused task.** Do not bundle image publishing into feature PRs.

Before starting Part 2, confirm you are on the current `cals-dev` using the explicit fetch instructions in [`git-workflow.md`](./git-workflow.md).

| # | Item | State |
|---|---|---|
| 1 | Repository public as the owner intended (raw template URL reachable); no appdata, `.env` contents or credentials exposed | ✅ 2026-10-02 |
| 2 | GitHub Actions validation + publishing workflow added (build-only PR check; publish from an approved tag on `cals-dev` using `GITHUB_TOKEN` with package-write permission) | ✅ 2026-10-02, PR #7 — see [Publishing workflow](#publishing-workflow-added-2026-10-02-part-2-pr); the validation check ran green on that PR |
| 3 | Development checkpoints publish `ghcr.io/dougalbob/cals-dev-v2:v2.0.0-dev-rcN` plus the moving `dev-latest` (`latest` **not** assigned) | ✅ 2026-10-03 — rc1 through rc8 published; `dev-latest` currently points at rc8. See the [release log](#release-log) |
| 4 | Corresponding GitHub prerelease for the Git tag created and verified | ✅ 2026-10-03 — [rc1](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc1), [rc2](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc2), [rc3](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc3), [rc4](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc4), [rc5](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc5), [rc6](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc6), [rc7](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc7) and [rc8](https://github.com/dougalbob/cals/releases/tag/v2.0.0-dev-rc8), each with source commit and image digest in its notes |
| 5 | GHCR package visible to anonymous pulls (what Unraid needs) | ✅ 2026-10-02 — **verified by CI, not assumed**: the rc2 run logged out of GHCR, deleted its local copy and pulled `dev-latest` as an unauthenticated stranger, successfully. The check now runs on every publish |
| 6 | Unraid smoke test from `cals-dev-v2.xml`: port `8151:8151`, isolated `/mnt/user/appdata/cals-dev-v2` mounted at `/app/data`, `.env` loading, health/`/next/`/restart persistence, no conflict with V1 on 8150, Cloudflare Tunnel route checked separately; then the owner copies the template into the Unraid Docker UI (DockerMan) and creates the `cals-dev-v2` container from it | ⬜ owner action |
| 7 | Record the exact source commit, Git tag, image tags/digest, build result and smoke-test result in the release log below | 🟡 commits, tags, digests and build results recorded; the Unraid smoke-test result is the owner's to add after item 6 |

The validation workflow must pass on the Part 2 PR before the first tag is published: that green run is the evidence that the image builds. It **passed on PR #7** ([run 37037874364](https://github.com/dougalbob/cals/actions/runs/37037874364), 2026-10-02), which closes the container build recorded as unverified in the Phase 11 handoff. Once PR #7 is merged, the remaining gates are the owner's: approve the tag, publish, make the package public, smoke-test on Unraid.

This first image is a **development smoke-test image**, not a completed UI redesign or authorization to cut over V1. The `/next/` frontend is still a foundation; keep the UI improvement and owner-review gate for later user-facing phases.

## Release log

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
