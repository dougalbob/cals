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
| [architecture/frontend-strategy.md](architecture/frontend-strategy.md) | 🟡 Proposed overall; Phase 11 authorized | Phased React 19 + TypeScript + Vite + Tailwind rebuild, frontend-only; UI/UX improvement is a headline requirement and production cutover remains gated. Includes spike results |
| [architecture/git-workflow.md](architecture/git-workflow.md) | 🟢 Adopted | Branch topology (`main` → `cals-dev` → topic/session branches), protecting production, Arena session linkage, release and rollback |
| [architecture/rebuild-kickoff.md](architecture/rebuild-kickoff.md) | 🟢 Active | **Start here for the rebuild** — first commands, first PR, guardrails, phase notes |
| [architecture/local-development.md](architecture/local-development.md) | 🟢 Adopted | `DEV_MODE` for local work without Cloudflare Access, guarded by safe bind/request checks and the `appdata/cals-dev` data-copy workflow |
| [architecture/unraid-image-release.md](architecture/unraid-image-release.md) | 🟡 Target design agreed; workflow pending | **The only documented install method**: `cals-dev-v2.xml` Unraid template + prebuilt GHCR image (Compose retired as an install path), image publishing, port and appdata isolation |
| [../AGENTS.md](../AGENTS.md) | 🟢 Adopted | Working rules for AI agents and contributors — **read this before touching the repo** |
| [../web/frontend/README.md](../web/frontend/README.md) | 🟡 Phase 11 in progress | React Diary/Metrics/Foods foundation with fixtures; served under temporary `/next/`, while the legacy UI remains the default. UI/UX improvement is a headline gate for later screens |
| [../README.md](../README.md) | — | Configuration, environment variables, Mealie integration |
| [../ai_contextual_docs/context.txt](../ai_contextual_docs/context.txt) | 🔴 **Legacy** | Historic build log from before this convention existed. Superseded by the documents above; **do not append to it or rely on it** — it is known to have drifted from the code |

## Conventions

- One topic per document, grouped by folder: `product/` for *what and why*, `architecture/` for *how*.
- Every document starts with a status header: **🟡 Proposed / Live discovery** (direction or remaining work is still being decided; a spike or authorized phase may exist), **🟢 Adopted** (current practice), **🔴 Legacy/Deprecated** (superseded, kept for history).
- Proposals state the alternative options and why they were rejected, so future maintainers (and agents) do not relitigate them blindly.
- Decisions get a date and an owner. Open questions are listed explicitly rather than left implied.
- **The code is the final source of truth**: `internal/models/models.go` for the API contract, `internal/database/migrations.go` for the schema, and the route table in `cmd/server/main.go` for endpoints. Documentation that disagrees with the code is a bug in the documentation — fix it in the same PR.
