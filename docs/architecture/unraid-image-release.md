# V2 Container Publishing and Unraid Install

| Field | Value |
|---|---|
| **Status** | 🟡 Target deployment design agreed; publishing workflow added (Part 2 PR, 2026-10-02); first image publication and Unraid smoke test pending |
| **Updated** | 2026-10-02 |
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

The development template tracks the moving `dev-latest` tag and pins the exact release candidate separately, for example `v2.0.0-dev-rc1`. The plain `latest` tag is reserved for a stable release after promotion to `main`. This keeps the template fixed while new development candidates are published, without making the word `latest` mean both development and stable.

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

Two GitHub Actions workflows in [`.github/workflows/`](../../.github/workflows) implement the publishing half of this document. Both build the checked-in `Dockerfile`, so the frontend lint/tests/production build and the CGO Go build run on every execution — a green run is the evidence that the image actually builds.

| Workflow | File | Trigger | What it does | Token permissions |
|---|---|---|---|---|
| **Docker build (validation)** | `docker-validate.yml` | every pull request targeting `cals-dev` or `main` (plus manual dispatch) | `docker build` with no registry login, no push; writes the image id/size to the run summary | `contents: read` |
| **Publish V2 image (development)** | `publish-dev-image.yml` | pushing a Git tag matching `v*-dev*` (for example `v2.0.0-dev-rc1`) | guards that the tagged commit is on `cals-dev`, logs in to GHCR, builds, pushes the exact tag and moves `dev-latest`, then creates the GitHub prerelease with the image digest in its notes | `contents: write`, `packages: write` |

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
   - The WebUI link opens the React shell at `http://<unraid-host>:8151/next/`.
   - `curl -s http://localhost:8151/health` (from an SSH session on Unraid) succeeds.
   - Data persists: restart the container and confirm the database in appdata survives.
   - V1 on `8150` is unaffected.
   - If V2 is reached through Cloudflare Tunnel, add/update the V2 origin/hostname to route to port `8151`; changing Docker's port mapping alone does not change the tunnel configuration.

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

Making the Git repository public does **not** guarantee that a GHCR container package is public. Container Registry package visibility is configured separately, and a newly published package can default to private. The image includes `org.opencontainers.image.source` so GitHub can associate it with this repository, but after the first push check the package settings and explicitly make the package public. Public GHCR container images can be pulled anonymously. See [GitHub's package visibility and permissions documentation](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility) and [Container Registry documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

The source repository was made public on 2026-10-02 as a prerequisite of this publishing path (Part 2, item 1), so that audit is a continuing obligation: the tree **and Git history** must stay free of appdata, `.env` contents, credentials or other private data. The runtime `.env` belongs in Unraid appdata and must never be committed or included in a Docker build context; `.gitignore` and `.dockerignore` exclude `.env` files. Note that the application source is public but user data never is — data lives only in the Unraid appdata directory.

## V2 port and persistent configuration

- Keep V1 on `8150:8150`.
- The template sets `PORT=8151` inside the container and maps host port `8151` to container port `8151`. The Go server already reads `PORT`; its default remains `8150`, so a plain local image run (`docker run` without `PORT`) still listens on `8150`.
- Dockerfile `EXPOSE` is image metadata. The runtime `PORT` setting and Unraid's port mapping determine where the server actually listens.
- Keep V2's appdata separate from V1 while both are installed. Do not have both containers open the same SQLite database. Copy only the configuration values you need into the V2 `.env`; plan any database migration separately.
- The template container sits on Unraid's default bridge network. For integrations that are reached by container hostname (for example `MEALIE_BASE_URL=http://mealie:9000` on a shared network), use a routable address from the template container instead — typically `http://<unraid-host-ip>:9000` — or put both containers on a named Docker network via `ExtraParams` (`--network <name>`) if you deliberately want hostname resolution.

The XML currently opens the React shell at `/next/`, where the Phase 11 foundation is served during migration. Update its `WebUI` path when the eventual V2 cutover changes the frontend's public route.

## Part 2 — publish the first V2 image (in progress)

The owner-directed sequence is: **finish the Phase 11 foundation PR first (done — PR #5 is merged into `cals-dev`); make the first GHCR image the next focused task.** Do not bundle image publishing into feature PRs.

Before starting Part 2, confirm you are on the current `cals-dev` using the explicit fetch instructions in [`git-workflow.md`](./git-workflow.md).

| # | Item | State |
|---|---|---|
| 1 | Repository public as the owner intended (raw template URL reachable); no appdata, `.env` contents or credentials exposed | ✅ 2026-10-02 |
| 2 | GitHub Actions validation + publishing workflow added (build-only PR check; publish from an approved tag on `cals-dev` using `GITHUB_TOKEN` with package-write permission) | ✅ 2026-10-02, Part 2 PR — see [Publishing workflow](#publishing-workflow-added-2026-10-02-part-2-pr) |
| 3 | First publication: `ghcr.io/dougalbob/cals-dev-v2:v2.0.0-dev-rc1` + moving `dev-latest` (`latest` **not** assigned) | ⬜ pending the owner-approved tag push |
| 4 | Corresponding GitHub prerelease for the Git tag created and verified | ⬜ pending (the publish workflow creates it) |
| 5 | GHCR package visibility set to public if needed | ⬜ owner action after the first push |
| 6 | Unraid smoke test from `cals-dev-v2.xml`: port `8151:8151`, isolated `/mnt/user/appdata/cals-dev-v2` mounted at `/app/data`, `.env` loading, health/`/next/`/restart persistence, no conflict with V1 on 8150, Cloudflare Tunnel route checked separately; then the owner copies the template into the Unraid Docker UI (DockerMan) and creates the `cals-dev-v2` container from it | ⬜ owner action |
| 7 | Record the exact source commit, Git tag, image tags/digest, build result and smoke-test result in the release log below | ⬜ |

The validation workflow must pass on the Part 2 PR before the first tag is published: that green run is the evidence that the image builds, and it stands in for the container build recorded as unverified in the Phase 11 handoff.

This first image is a **development smoke-test image**, not a completed UI redesign or authorization to cut over V1. The `/next/` frontend is still a foundation; keep the UI improvement and owner-review gate for later user-facing phases.

## Release log

| Tag | Published | Source commit | Image digest | GitHub prerelease | Unraid smoke test |
|---|---|---|---|---|---|
| `v2.0.0-dev-rc1` | *not published yet* | — | — | — | — |

## Not implemented yet

- No V2 image has been pushed to GHCR yet; `ghcr.io/dougalbob/cals-dev-v2:dev-latest` is a planned tag, not a currently pullable image.
- The GHCR package has not been created or made public yet — that happens on the first publish.
- The first end-to-end Unraid pull/run has not been verified. Docker cannot run in the Arena sandbox, so the first real proof is the owner's smoke test in item 6; the `Docker build (validation)` workflow verifies the image builds on every pull request from now on.
- Stable publishing is not implemented: there is no workflow for a `latest` image after promotion to `main`, and none for `cals-dev-v2.xml` updates.
- The application's reported version (`AppVersion` in `cmd/server/main.go`, currently `1.7.0`) does not match the `v2.0.0-dev-rc1` image tag. The tag identifies the checkpoint; whether `AppVersion` should follow the 2.x development line is an open owner decision. The first image carries the source's `1.7.0`.
