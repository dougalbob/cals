# cals documentation

> ## 🚀 Starting the rebuild?
> Read **[architecture/rebuild-kickoff.md](architecture/rebuild-kickoff.md)** first. It has the exact
> first commands (including an explicit fetch of `cals-dev`, which may not be included by an Arena
> clone's default remote refspec), how to start the preview, and what to build first.


Project documentation for **cals**, a personal calorie and nutrition tracking application (Go + SQLite backend, PWA frontend, Cloudflare Zero Trust auth, Docker/Unraid deployment).

## Contents

| File | Status | What it is |
|---|---|---|
| [README.md](README.md) | — | This index, and the conventions below |
| [product/vision-and-open-questions.md](product/vision-and-open-questions.md) | 🟡 Live discovery | The "grill me" document: what cals should become, and every question still open. **Start here.** |
| [architecture/frontend-strategy.md](architecture/frontend-strategy.md) | 🟡 Proposed overall; Phase 13 first Recipes slice implemented | Phased React 19 + TypeScript + Vite + Tailwind rebuild; Foods/servings and recipe portions remain next, while UI/UX review and production cutover stay gated |
| [architecture/git-workflow.md](architecture/git-workflow.md) | 🟢 Adopted (repo now public; protection available but not yet applied) | Branch topology (`main` → `cals-dev` → topic/session branches), protecting production, Arena session linkage, release and rollback |
| [architecture/rebuild-kickoff.md](architecture/rebuild-kickoff.md) | 🟢 Active | **Start here for the rebuild** — first commands, first PR, guardrails, phase notes, and the current Part 2 handoff |
| [architecture/local-development.md](architecture/local-development.md) | 🟢 Adopted | `DEV_MODE` for local work without Cloudflare Access, guarded by safe bind/request checks and the `appdata/cals-dev` data-copy workflow |
| [architecture/water-and-drinks.md](architecture/water-and-drinks.md) | 🟢 Adopted | Water and drinks share one ledger (`drink_entries`): the `counts_toward_water` flag, the derived target, drink-entry snapshots, the bank fix, and the additive migration that removes the dead `water_entries` table |
| [architecture/drinks-builder.md](architecture/drinks-builder.md) | 🟡 Implemented, awaiting owner preview | My drinks page, catalog picker, 2×2 quick grid, tappable glass, vary-this-time milk/sugar — product decisions 21–26 |
| [architecture/dev-identity-switch.md](architecture/dev-identity-switch.md) | 🟢 Adopted | `DEV_IDENTITY_SWITCH` — pick either existing user from `/dev/identity` (or `?as=<email>`) on a LAN-only dev container; the host-networking recipe and its safety constraints |
| [architecture/data-copy-warning.md](architecture/data-copy-warning.md) | 🟢 Adopted | **Read before touching appdata**: since 2026-10-02 the Cloudflare-routed V2 runs on a data copy and now holds live household data — which database is which, and the rules for copies and backups |
| [architecture/unraid-image-release.md](architecture/unraid-image-release.md) | 🟢 Dev channel publishing live; Unraid smoke test pending | **The only documented install method**: `cals-dev-v2.xml` Unraid template + prebuilt GHCR image (Compose retired as an install path), the GitHub Actions build/publish workflows, port and appdata isolation |
| [../AGENTS.md](../AGENTS.md) | 🟢 Adopted | Working rules for AI agents and contributors — **read this before touching the repo** |
| [../web/frontend/README.md](../web/frontend/README.md) | 🟡 Phase 13 first Recipes metadata slice implemented; next slice planned | React foundation with fixtures; Recipes includes catalogue, per-user favourites, detail, structured tags and facet filters. Food servings and recipe portions remain next; served under temporary `/next/`, while the legacy UI remains the default |
| [../README.md](../README.md) | — | Configuration, environment variables, legacy Mealie integration (not pursued in the React rebuild) |
| [../ai_contextual_docs/context.txt](../ai_contextual_docs/context.txt) | 🔴 **Legacy** | Historic build log from before this convention existed. Superseded by the documents above; **do not append to it or rely on it** — it is known to have drifted from the code |

## Conventions

- One topic per document, grouped by folder: `product/` for *what and why*, `architecture/` for *how*.
- Every document starts with a status header: **🟡 Proposed / Live discovery** (direction or remaining work is still being decided; a spike or authorized phase may exist), **🟢 Adopted** (current practice), **🔴 Legacy/Deprecated** (superseded, kept for history).
- Proposals state the alternative options and why they were rejected, so future maintainers (and agents) do not relitigate them blindly.
- Decisions get a date and an owner. Open questions are listed explicitly rather than left implied.
- **The code is the final source of truth**: `internal/models/models.go` for the API contract, `internal/database/migrations.go` for the schema, and the route table in `cmd/server/main.go` for endpoints. Documentation that disagrees with the code is a bug in the documentation — fix it in the same PR.
