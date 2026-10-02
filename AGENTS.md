# AGENTS.md — working rules for this repository

Instructions for AI agents (Arena sessions, GitHub Copilot, Claude Code, Codex, etc.) and humans contributing to **cals**.

## 0. Read this first

**`main` is live production code and must be treated as read-only.** It runs a personal calorie/nutrition tracker in daily use on a private Unraid server. Breaking `main` breaks a real user's data workflow.

### Hard rules

1. **NEVER push to `main`. Never force-push, never merge into it, never delete it.** Not even if a task seems simple or urgent.
2. **Work on your own branch only.** Arena sessions are pinned to `arena/<session-id>`; other agents should use `feat/*` or `fix/*`.
3. **Open pull requests against `cals-dev`, not `main`.** Only the repository owner promotes `cals-dev` to `main` in a deliberate release PR.
4. **Before starting work, sync:** `git fetch origin refs/heads/cals-dev:refs/remotes/origin/cals-dev && git merge origin/cals-dev`.
   **This is not optional.** Some Arena clones restrict the remote fetch refspec, so a plain
   `git fetch origin` may not create/update `origin/cals-dev`. Explicitly fetching the branch avoids
   that trap. If the integration branch is genuinely absent on GitHub, stop and ask the owner rather
   than creating another branch. If `ls docs/architecture/` does not show `rebuild-kickoff.md`, you
   have not synced.
5. **Never commit secrets.** `.env` files are git-ignored (`/app/data/.env` holds `CF_TEAM_DOMAIN`, `CF_POLICY_AUD`, `FATSECRET_*`, `MEALIE_*`). No credentials in code, docs, tests or commit messages.
6. **Never delete the repository root or `.git`.** No history rewrites.
7. **Never touch live appdata.** V2 (`/mnt/user/appdata/cals-dev-v2`) is the household's live data since 2026-10-02 even though it began as a copy; the V1 directory (`/mnt/user/appdata/cals`) is stale, and neither may be used as a development data directory. The only disposable data is the `cals-dev-identity` copy. See `docs/architecture/data-copy-warning.md`.

The local `pre-push` hook (`.githooks/pre-push`, installed with `./scripts/setup-git-hooks.sh`) blocks pushes to `main` as a backstop. Do not circumvent it with `--no-verify` or `ALLOW_MAIN_PUSH=1`.

## 1. What this project is

A personal calorie and nutrition tracking PWA.

| Layer | Tech |
|---|---|
| Backend | Go 1.22, `net/http`, SQLite (`mattn/go-sqlite3`, CGO), ~5k LOC in `internal/**` |
| Frontend | Production remains vanilla JS + CSS + `web/templates/index.html`; the React/TypeScript foundation under `web/frontend/` is authorized for Phase 11 and served only on a temporary `/next/` route — see `docs/architecture/frontend-strategy.md` |
| Auth | Cloudflare Zero Trust JWT middleware on every non-public route |
| Integrations | FatSecret (food search), Mealie (recipe import), Google Fit (steps) |
| Deploy | V1 remains on Unraid at host/container port `8150` (legacy Compose deployment — kept running as-is, never the install method for anything new); V2 is a prebuilt GHCR image installed from the `cals-dev-v2.xml` Unraid template at `8151:8151`, with its own appdata mounted at `/app/data` — see `docs/architecture/unraid-image-release.md`. **V2 is now the Cloudflare-routed app the household sees**, running on a database copy taken 2026-10-02: `/mnt/user/appdata/cals-dev-v2` holds live household data and must not be treated as disposable — read `docs/architecture/data-copy-warning.md` before copying, migrating or deleting anything |

**Documentation starts at [`docs/README.md`](docs/README.md)** — that is the index, and it is authoritative:

| Read this | For |
|---|---|
| [`docs/product/vision-and-open-questions.md`](docs/product/vision-and-open-questions.md) | What cals should become; every open question |
| [`docs/architecture/frontend-strategy.md`](docs/architecture/frontend-strategy.md) | The rebuild plan and its current status |
| [`docs/architecture/git-workflow.md`](docs/architecture/git-workflow.md) | Branches, releases, safety |
| [`docs/architecture/local-development.md`](docs/architecture/local-development.md) | `DEV_MODE` and the safe `appdata/cals-dev` data copy |
| [`docs/architecture/unraid-image-release.md`](docs/architecture/unraid-image-release.md) | **The only documented install method** (Unraid template), V2 GHCR prereleases, image publishing, port and appdata isolation |
| [`docs/architecture/rebuild-kickoff.md`](docs/architecture/rebuild-kickoff.md) | **Starting the rebuild — read this first** |

⚠️ **`ai_contextual_docs/context.txt` is LEGACY.** It predates these conventions, its contents have drifted from the code, and it is **not** a specification. Do not rely on it and **do not append to it** — it is retained only as a historical record. When it disagrees with the code, the code wins.

## 2. Layout

```
cmd/server/main.go        entrypoint, routing table, version constant (AppVersion)
internal/auth/            Cloudflare Access JWT validation
internal/config/          env loading (defaults + /app/data/.env)
internal/database/        SQLite connection + schema migrations
internal/handlers/        HTTP handlers, one file per resource
internal/models/          all structs (the API contract lives here)
internal/fatsecret/       FatSecret OAuth2 client
internal/mealie/          Mealie API client
web/templates/index.html  SPA shell
web/static/js/            vanilla JS SPA (app.js, api.js, components/, utils/)
web/static/css/           style.css + themes.css (CSS custom properties = theme tokens)
web/public/               PWA assets: manifest.json, sw.js, icons (unprotected paths)
web/frontend/             React 19 + TS + Vite + Tailwind rebuild (Phase 11 foundation + Diary/Metrics/Foods spike);
                          production bundle served under temporary /next/ only — see its README
docs/                     documentation (see docs/README.md)
ai_contextual_docs/       LEGACY historic build log — read-only, not a source of truth
 docs/                     canonical documentation: product/ and architecture/
```

## 3. Run and build

```bash
# Local run (needs CGO + gcc for SQLite; Go 1.22+)
PORT=8150 DB_PATH=./cals.db CF_TEAM_DOMAIN=x CF_POLICY_AUD=y go run ./cmd/server

# Container image (local verification only — Compose is retired as an install method)
docker build -t cals-dev-v2:local .
docker run --rm -p 8150:8150 \
  -e CF_TEAM_DOMAIN=x -e CF_POLICY_AUD=y \
  -v $PWD/appdata:/app/data cals-dev-v2:local       # → http://localhost:8150

# Production deployment: Unraid pulls the prebuilt GHCR image via the
# cals-dev-v2.xml template — see docs/architecture/unraid-image-release.md
```

Container images are published only by the tag-triggered `Publish V2 image (development)` workflow —
never by hand, never from `main`, and never with `latest` for a development candidate. The
`Docker build (validation)` workflow builds the image on every pull request without pushing, which
is how the container build is verified if you cannot run Docker locally.

**Arena sessions — start the preview first.** The sandbox is recycled between turns (no surviving
processes; `node_modules/` is not snapshotted) and preview URLs are bound to the sandbox instance,
so a previously opened preview tab reports *Expired*. As the **first action of a session**, run:

```bash
./scripts/serve-frontend-preview.sh    # frontend spike on 0.0.0.0:5173 — no npm install needed
./scripts/serve-frontend-preview.sh --dev   # same, but with the Vite dev server and HMR
```

The default path serves the pre-built `web/frontend/preview/` bundle through
`web/frontend/serve-preview.mjs`, a dependency-free Node server with the fixture API in-process, so
it comes up in ~120 ms whatever state the sandbox is in and the preview's **Restart** button works.
Rebuild the bundle with `npm run build:preview` after changing frontend source (that step needs
Vite).

This sandbox has Node but **no Go toolchain installed**, so the Go server cannot be run here out
of the box. It *can* be obtained for verification purposes — `scripts/verify-go-in-sandbox.sh`
installs a Go toolchain from the PyPI wheel `go-bin` into `/tmp`, copies the repo to `/tmp/calstest`,
and builds `./cmd/server` with CGO (verified: the real server starts, creates all 17 tables, and
returns `401` on protected routes without a Cloudflare JWT). Caveats: nothing in `/tmp` persists
between turns, the toolchain is Go 1.27 rather than the Dockerfile's 1.22, and **Docker itself
cannot run in the sandbox**, so image builds must be verified on your own machine.

Notes:
- There is no volume mount for code: **code changes require a rebuild**.
- Env vars: `PORT`, `BIND_ADDRESS`, `LOG_LEVEL`, `DB_PATH`, `DEV_MODE`, `DEV_USER_EMAIL`, `FATSECRET_CLIENT_ID`, `FATSECRET_CLIENT_SECRET`, `CF_TEAM_DOMAIN`, `CF_POLICY_AUD`, `MEALIE_BASE_URL`, `MEALIE_API_KEY`, `GOOGLE_FIT_CLIENT_ID`, `GOOGLE_FIT_CLIENT_SECRET`.
- Version bumping: `./update-version.sh X.Y.Z` updates `cmd/server/main.go`, `web/static/js/app.js` and `web/public/sw.js`.
- Unprotected routes: `/health`, `/public/*`, `/api/version`. Everything else requires a valid Cloudflare Access JWT in production; guarded `DEV_MODE` is the local-development exception.
- `DEV_MODE` is only for local development against a copy of the data in `appdata/cals-dev`; never use it against production data or behind a public proxy/tunnel. It requires `DEV_USER_EMAIL`, defaults to a loopback bind, and rejects public/wildcard binds. See [`docs/architecture/local-development.md`](docs/architecture/local-development.md).

## 4. Conventions

- **Go:** standard library first; handlers in `internal/handlers/<resource>.go`; keep route registration centralised in `cmd/server/main.go`; new tables go through `internal/database/migrations.go` (additive migrations only — never drop or rewrite user data).
- **API:** JSON in/out; errors as `{"error": "..."}` with a correct status code; `404` for missing rows, `409` for conflicts (e.g. duplicate recipe name), `503` for unconfigured integrations.
- **DB:** dates as `YYYY-MM-DD` strings; nutrition stored per 100 g; weights in kg; portions in grams. Round only at the presentation layer.
- **Frontend (current):** the global objects (`App`, `API`, `Modal`, …) communicate through `web/static/js/api.js`; do not scatter raw `fetch` calls. Never cache JS or HTML in the service worker.
- **Frontend (new):** see §6 of `docs/architecture/frontend-strategy.md`.
- **UI improvement is a headline product requirement.** A new framework, a passing build, or functional parity alone is not success. User-facing phases must show a concrete improvement in the mobile-first daily experience and include a preview/screenshots for owner review before merge or cutover. Phase 11 may be foundation-only; it does not waive this later acceptance gate.
- **Quick drinks:** the Diary must retain a familiar quick-add selector for Tea, Coffee and Water, using user-specific drink records rather than hard-coded nutrition values. Drink calories must count toward the bank; see the product decisions and Phase 12 plan.
- **Domain maths is precious.** Bank/rolling balance, cooked-weight concentration, macro percentages, stones/lbs ↔ kg conversion and Google Fit step sync all have subtle, hard-won behaviour. Never change them incidentally; add tests if you touch them.

## 5. Documentation duties

- **`docs/` is the source of truth for documentation** (see [`docs/README.md`](docs/README.md)). Update the relevant document — or add one, following the folder conventions — for any architectural, product or workflow change.
- **Do not append to `ai_contextual_docs/context.txt`.** It is legacy and frozen; see the section above.
- Update [`docs/product/vision-and-open-questions.md`](docs/product/vision-and-open-questions.md) when a question is answered or a new one appears — record the answer in its *Decisions so far* table with a date.
- Mark documents with a status header: 🟡 Proposed / Live discovery, 🟢 Adopted, 🔴 Legacy. Never describe unbuilt work as if it exists.
- Where documentation and code disagree, the code wins and the documentation is the bug — fix it in the same PR.

## 6. Definition of done

- [ ] The change is committed on a topic/session branch — nothing pushed to `main`
- [ ] Appropriate build/verification run (`npm run lint && npm run typecheck && npm test && npm run build:go` for frontend; `go build ./...` for backend; for image-affecting changes the `Docker build (validation)` workflow runs `docker build` on the PR — Docker itself cannot run in the Arena sandbox)
- [ ] `docs/` updated (and `docs/product/vision-and-open-questions.md` if a question was answered or raised)
- [ ] For UI work, PR describes the concrete user experience improvement and includes a preview/screenshots for owner review; do not cut over on parity alone
- [ ] PR opened against **`cals-dev`** with a summary and any deployment notes
