# V2 Container Publishing and Unraid Install

| Field | Value |
|---|---|
| **Status** | 🟡 Target deployment design agreed; publishing workflow and first image still pending |
| **Updated** | 2026-10-02 |
| **Decision owner** | @dougalbob |
| **Related** | [`git-workflow.md`](./git-workflow.md), [`local-development.md`](./local-development.md), [`../../cals-v2.xml`](../../cals-v2.xml) |

## Goal

Install V2 on Unraid from a maintained container image, using a separate Unraid template and port so V1 can keep running during the trial. Unraid should **pull a prebuilt image**; it should not need the Git checkout or build the application on the server.

The target image is `ghcr.io/dougalbob/cals-v2`. The development template uses the moving `dev-latest` image tag and pins the exact release candidate separately, for example `v2.0.0-dev-rc1`. Reserve the plain `latest` tag for a stable release after promotion to `main`. This keeps the V2 test template fixed while new development candidates are published, without making the word `latest` mean both development and stable.

## Git release, GitHub Release, and image tags are different

1. **Git branch:** `cals-dev` contains the integration source.
2. **Git tag / GitHub Release:** a tag such as `v2.0.0-dev-rc1` points at one exact commit on `cals-dev`. GitHub Releases are not restricted to `main`; mark this candidate as a prerelease. A GitHub Release is source/version metadata, not a built container image.
3. **Container image:** a GitHub Actions workflow must build the Docker image from that tag and push it to GHCR with both the exact version tag and `dev-latest`. These are registry tags and must be assigned by the workflow; they are not automatically created from a GitHub Release.
4. **Unraid:** `cals-v2.xml` references `ghcr.io/dougalbob/cals-v2:dev-latest`. When the container is updated, Unraid pulls the image currently behind that tag. The XML does not need changing for each RC. Moving the tag does not automatically restart/update a running container; use Unraid's update/apply flow to pull it.

The GitHub “Latest release” indicator and the Docker image tag `:latest` are independent. The first public V2 candidate should be verified on Unraid before stable promotion through the existing `cals-dev` → `main` release process.

## GHCR visibility

Making the Git repository public does **not** guarantee that a GHCR container package is public. Container Registry package visibility is configured separately, and a newly published package can default to private. The image includes `org.opencontainers.image.source` so GitHub can associate it with this repository, but after the first push check the package settings and explicitly make the package public. Public GHCR container images can be pulled anonymously. See [GitHub's package visibility and permissions documentation](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility) and [Container Registry documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

Before making the source repository public, audit the current tree **and Git history** for committed `.env` files, credentials, or other private data. The runtime `.env` belongs in Unraid appdata and must never be committed or included in a Docker build context; `.gitignore` and `.dockerignore` exclude `.env` files.

## Compose build versus Unraid template pull

The checked-in `docker-compose.yml` currently has `build:`, a local-source build configuration. Running that Compose file from a Git checkout builds on that machine. It remains the legacy/local Compose setup and maps port `8150:8150`.

The V2 Unraid template instead has a GHCR image reference and port mapping; it has no `build:` instruction. Once the publishing workflow exists, Unraid downloads the prebuilt image from GHCR. No `git pull`, GitHub CLI command, or Node/Go toolchain is needed on Unraid for normal installation/update.

## V2 port and persistent configuration

- Keep V1 on `8150:8150`.
- The V2 XML sets `PORT=8151` inside the container and maps host port `8151` to container port `8151`. The Go server already reads `PORT`; its existing default remains `8150`, so V1/local Compose behavior is not changed by the V2 template.
- Dockerfile `EXPOSE` is image metadata. The runtime `PORT` setting and Unraid port mapping determine where the server actually listens.
- The application loads `/app/data/.env` at startup. The XML mounts `/mnt/user/appdata/cals-v2` at `/app/data`, so V2 reads `/mnt/user/appdata/cals-v2/.env` without depending on Docker Compose's `env_file` behavior. Environment variables set directly in the Unraid template take precedence over values in `.env` (the template's `PORT=8151` is intentional).
- Keep V2's appdata separate from V1 while both are installed. Do not have both containers open the same SQLite database. Copy only the configuration values you need into the V2 `.env`; plan any database migration separately.
- If V2 is accessed through Cloudflare Tunnel, add/update the V2 origin/hostname to route to port `8151`; changing Docker's port mapping alone does not change the tunnel configuration.

The XML currently opens the React shell at `/next/`, where the Phase 11 foundation is served during migration. Update its `WebUI` path when the eventual V2 cutover changes the frontend's public route.

## Next-session handoff: Part 2 — publish the first V2 image

The owner-directed sequence is: **finish the Phase 11 foundation PR first; make the first GHCR image the next session's focused task.** Do not bundle image publishing into the Phase 11 PR.

Before starting Part 2, confirm that Phase 11 PR #5 has been merged into `cals-dev`. If it is still open because the Docker build/review gate is incomplete, stop and ask the owner to finish that gate rather than publishing from an unmerged session branch. Start from the current `cals-dev` using the explicit fetch instructions in [`git-workflow.md`](./git-workflow.md).

Part 2 checklist:

1. Read this document and [`cals-v2.xml`](../../cals-v2.xml); confirm the source repository is public as the owner intended. Do not expose appdata, `.env` contents, or credentials.
2. Add a GitHub Actions workflow that builds the Docker image from an approved version tag on `cals-dev`, using `GITHUB_TOKEN` with package-write permission. Check out and build the exact tagged commit; do not build `main` by accident.
3. Publish to **`ghcr.io/dougalbob/cals-v2`** with the immutable-by-convention candidate tag (initial example: `v2.0.0-dev-rc1`) and moving **`dev-latest`**. Do not assign plain `latest` to a development candidate; reserve it for a stable release after promotion to `main`.
4. Create the corresponding GitHub prerelease for the Git tag. GitHub Release metadata and the GHCR image are separate artifacts; verify both exist.
5. After the first push, explicitly set the GHCR package visibility to public if needed. A public source repository does not by itself guarantee a public container package.
6. Verify the published image can be pulled and run from `cals-v2.xml` on Unraid: host/container port `8151:8151`, isolated `/mnt/user/appdata/cals-v2` mounted at `/app/data`, and the V2 `.env` loading from that directory. Check health, `/next/`, restart/data persistence, and no conflict with V1 on 8150. Verify the Cloudflare Tunnel route separately if used.
7. Record the exact source commit, Git tag, image tags/digest, build result, and Unraid smoke-test result in the release notes/docs.

This first image is a **development smoke-test image**, not a completed UI redesign or authorization to cut over V1. The `/next/` frontend is still a foundation; keep the UI improvement and owner-review gate for later user-facing phases.

## Not implemented yet

- No GitHub Actions image-publishing workflow exists yet.
- No V2 image has been pushed to GHCR; `dev-latest` is a planned tag, not a currently pullable image.
- The package has not yet been created or made public.
- Docker build and first end-to-end Unraid pull/run remain to be verified.
