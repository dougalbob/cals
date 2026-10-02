# cals documentation

Project documentation for **cals**, a personal calorie and nutrition tracking application (Go + SQLite backend, PWA frontend, Cloudflare Zero Trust auth, Docker/Unraid deployment).

## Contents

| Document | Status | What it covers |
|---|---|---|
| [architecture/frontend-strategy.md](architecture/frontend-strategy.md) | 🟡 Proposed | Proposal to rebuild the frontend as React 19 + TypeScript + Vite + Tailwind CSS v4, with React Router and TanStack Query — phased, frontend-only, Go API untouched |
| [architecture/git-workflow.md](architecture/git-workflow.md) | 🟢 Adopted | Branch topology (`main` → `cals-dev` → topic/session branches), protecting production, Arena session linkage, release and rollback procedure |
| [../web/frontend/README.md](../web/frontend/README.md) | 🟡 Spike | Working React 19 + TS + Vite + Tailwind spike (Diary, Metrics, Foods) with a fixture API that mirrors the Go handlers. Not wired into the app |
| [../AGENTS.md](../AGENTS.md) | 🟢 Adopted | Working rules for AI agents and contributors — **read this before touching the repo** |
| [../ai_contextual_docs/context.txt](../ai_contextual_docs/context.txt) | — | Living domain/context log: schema, endpoints, features, phase history, notes. The single source of truth for what cals *is* |
| [../README.md](../README.md) | — | Configuration, environment variables, Mealie integration |

## Conventions

- One topic per document under `docs/architecture/`, named with kebab-case.
- Every document starts with a status header: **🟡 Proposed** (nothing built, decision pending), **🟢 Adopted** (current practice), or **🔴 Superseded** (with a link to the replacement).
- Proposals state the alternative options and why they were rejected, so future maintainers (and agents) do not relitigate them blindly.
- Behaviour, workflow or architecture changes must be reflected here **and** appended to `ai_contextual_docs/context.txt` in the same PR.
- Keep facts verifiable: exact file paths, exact commands, versions with dates.
