# cals documentation

> ## 🚀 Starting a session? Read these three, in this order
> 1. **[CURRENT_STATE.md](CURRENT_STATE.md)** — where the project is *right now*: what is deployed, which
>    phase is in progress, what is waiting on the owner, and what to do next. **This is the only place
>    status lives**; if another document disagrees with it, that document is the bug.
> 2. **[architecture/rebuild-kickoff.md](architecture/rebuild-kickoff.md)** — the exact first commands
>    (including an explicit fetch of `cals-dev`, which may not be included by an Arena clone's default
>    remote refspec), how to start the preview, and the guardrails.
> 3. **[architecture/frontend-strategy.md](architecture/frontend-strategy.md)** — the plan and the phases.
>
> Then, as needed: **[product/vision-and-open-questions.md](product/vision-and-open-questions.md)** for
> every decision and open question, and **[history/rebuild-log.md](history/rebuild-log.md)** for what
> happened, when.


Project documentation for **cals**, a personal calorie and nutrition tracking application (Go + SQLite backend, PWA frontend, Cloudflare Zero Trust auth, Docker/Unraid deployment).

## Contents

| File | Status | What it is |
|---|---|---|
| [README.md](README.md) | — | This index, and the conventions below |
| [CURRENT_STATE.md](CURRENT_STATE.md) | 🟢 **Living — read first** | **Where the project is now**: deployments and ports, phase status, what is waiting on the owner, next work, and open questions that actually block it. Deliberately short and updated on every change |
| [history/rebuild-log.md](history/rebuild-log.md) | 🟢 Adopted — append-only record | Dated history, newest first: what landed, with links to the decisions, PRs and checkpoints. Keeps narrative out of the documents agents must read to work |
| [product/vision-and-open-questions.md](product/vision-and-open-questions.md) | 🟡 Live discovery | The "grill me" document: what cals should become, every answer recorded as a numbered, dated decision, and every question still open. **Start here for *why***; `CURRENT_STATE.md` is the *where* |
| [product/metrics-evidence.md](product/metrics-evidence.md) | 🟡 Working research | Evidence ledger and evolving design brief for metrics calculations and chart presentation: body-measurement raw/indexed views, weigh-in trend and ETA questions, and measurement cadence. Proposals are not automatically product decisions |
| [architecture/phase-14-plan.md](architecture/phase-14-plan.md) | 🟢 **All six slices built and published in rc27–rc33; rc34 is installed, with the accumulated phone road-test partly open.** A separate 2026-10-07 Metrics follow-up (decisions 116–119) is published as rc36 but not installed | Phase 14 (Metrics + Nutrition), its six slices and guardrails, plus the requested follow-up on measurement history, weigh-in entry and chart-point inspection |
| [architecture/phase-16-plan.md](architecture/phase-16-plan.md) | 🟢 **16.2 was published as rc35; its retarget is included in rc36, which also carries the Metrics follow-up. Neither candidate is installed; rc34 remains live.** The Cloudflare phone test remains; 16.4 legacy deletion needs separate owner approval | Phase 16 (cutover) audited against the code: mount point, Go handler and PWA identities, existing installs, Cloudflare checks, four reversible stages, and decisions 110–115 |
| [architecture/frontend-strategy.md](architecture/frontend-strategy.md) | 🟡 Proposed overall; see [CURRENT_STATE.md](CURRENT_STATE.md) for current implementation and review status | Phased React 19 + TypeScript + Vite + Tailwind rebuild; includes named food measures, remembered recipe portions, tag filtering, archive/restore, safe recipe/food updates and recipe authoring. Phase 13 includes uncropped photo upload/replacement; cropping is deferred (decision 82) |
| [architecture/git-workflow.md](architecture/git-workflow.md) | 🟢 Adopted (repo now public; protection available but not yet applied) | Branch topology (`main` → `cals-dev` → topic/session branches), protecting production, Arena session linkage, release and rollback |
| [architecture/rebuild-kickoff.md](architecture/rebuild-kickoff.md) | 🟢 Active | **Start here for the rebuild** — the first commands, how to start the preview and the Go server, the phases, the guardrails and the definition of done. Deliberately contains no status |
| [architecture/local-development.md](architecture/local-development.md) | 🟢 Adopted | `DEV_MODE` for local work without Cloudflare Access, guarded by safe bind/request checks and the `appdata/cals-dev` data-copy workflow |
| [architecture/water-and-drinks.md](architecture/water-and-drinks.md) | 🟢 Adopted | Water and drinks share one ledger (`drink_entries`): the `counts_toward_water` flag, the derived target, drink-entry snapshots, the bank fix, and the additive migration that removes the dead `water_entries` table |
| [architecture/drinks-builder.md](architecture/drinks-builder.md) | 🟡 Implemented, awaiting owner preview | My drinks page, catalog picker, 2×2 quick grid, tappable glass, vary-this-time milk/sugar — product decisions 21–26 |
| [architecture/dev-identity-switch.md](architecture/dev-identity-switch.md) | 🟢 Adopted | `DEV_IDENTITY_SWITCH` — pick either existing user from `/dev/identity` (or `?as=<email>`) on a LAN-only dev container; the host-networking recipe and its safety constraints |
| [architecture/admin-roles.md](architecture/admin-roles.md) | 🟢 Implemented, pending owner review | **Production** Admin/Standard roles: `ADMIN_EMAILS` / `STANDARD_EMAILS` in the appdata `.env`, reconciled into `users.is_admin` at start-up, the Admin-only account list, and the server-side acting-user switch with its "Viewing as …" banner |
| [architecture/data-copy-warning.md](architecture/data-copy-warning.md) | 🟢 Adopted | **Read before touching appdata**: since 2026-10-02 the Cloudflare-routed V2 runs on a data copy and now holds live household data — which database is which, and the rules for copies and backups |
| [architecture/testing.md](architecture/testing.md) | 🟢 Adopted | **How cals is tested**: the fast per-PR layers (Vitest, lint/typecheck, `go vet`/`go test`, and a Docker build that starts the image with a disposable database and smokes its routes) and the milestone browser suite (Playwright at phone size), how to run each one — including the Arena sandbox's browser workaround — and what is deliberately not covered |
| [architecture/unraid-image-release.md](architecture/unraid-image-release.md) | 🟢 Dev channel publishing live; **rc36 published, rc34 last installed** (owner Force Update 2026-10-05 — Settings checked; rc36 awaits an owner-authorized Force Update and phone review) | **The only documented install method**: `cals-dev-v2.xml` Unraid template + prebuilt GHCR image (Compose retired as an install path), the GitHub Actions build/publish workflows, port and appdata isolation |
| [../AGENTS.md](../AGENTS.md) | 🟢 Adopted | Working rules for AI agents and contributors — **read this before touching the repo** |
| [../web/frontend/README.md](../web/frontend/README.md) | 🟡 React frontend guide; see [CURRENT_STATE.md](CURRENT_STATE.md) for implementation/review status | React foundation with fixtures; Recipes catalogue, favourites, tags/filters, serving and portion flows, archive/restore, existing-recipe editing, dependent-food nutrition refresh, and recipe authoring with uncropped photo upload/replacement published in rc25 and the windowed bank in rc27; rc34 (Settings + PWA installability) remains the last reported Unraid install; rc36 is published but not installed. Cropping is deferred; Phase 16.2 retargeted to `/` in rc35 and is included in rc36, with the legacy UI kept as a lifeboat at `/legacy/` |
| [../README.md](../README.md) | — | Configuration, environment variables, legacy Mealie integration (not pursued in the React rebuild) |
| [../ai_contextual_docs/context.txt](../ai_contextual_docs/context.txt) | 🔴 **Legacy** | Historic build log from before this convention existed. Superseded by the documents above; **do not append to it or rely on it** — it is known to have drifted from the code |

## Conventions

- One topic per document, grouped by folder: `product/` for *what and why*, `architecture/` for *how*, `history/` for *what happened when*.
- Every document starts with a status header: **🟡 Proposed / Live discovery** (direction or remaining work is still being decided; a spike or authorized phase may exist), **🟢 Adopted** (current practice), **🔴 Legacy/Deprecated** (superseded, kept for history).
- Proposals state the alternative options and why they were rejected, so future maintainers (and agents) do not relitigate them blindly.
- Decisions get a date and an owner. Open questions are listed explicitly rather than left implied.
- **Status lives in exactly one place** — [`CURRENT_STATE.md`](CURRENT_STATE.md). Do not copy phase status, "what is deployed" or "what is next" into other documents; link to it. When the state changes, update that page in the same PR.
- **Dated narrative belongs in [`history/rebuild-log.md`](history/rebuild-log.md)**, newest first — what landed, why, and what it was called at the time. Documents that agents must read to *do work* should describe the present, not the journey.
- **Cross-references are checked mechanically**: `node scripts/check-doc-links.mjs` walks every
  Markdown file and fails on a relative link that does not exist, a `#anchor` that no heading matches,
  or a link that escapes the repository. Run it before a publish; it is part of the
  [pre-publish checklist](architecture/git-workflow.md#before-you-start-the-loop--the-pre-publish-checklist).
- **The code is the final source of truth**: `internal/models/models.go` for the API contract, `internal/database/migrations.go` for the schema, and the route table in `cmd/server/main.go` for endpoints. Documentation that disagrees with the code is a bug in the documentation — fix it in the same PR.
