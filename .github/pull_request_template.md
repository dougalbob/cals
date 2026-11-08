<!--
Reminder: base branch must be `cals-dev`. `main` is production and only ever moves
via a release PR promoted by the owner. See docs/architecture/git-workflow.md.
-->

## Base branch check

- [ ] This PR targets **`cals-dev`** (not `main`)
- [ ] If this PR *is* a release PR (`cals-dev` → `main`), it was opened deliberately as such

## What changed

<!-- Short summary. Link the phase in docs/architecture/frontend-strategy.md if applicable. -->

## Why

<!-- The problem, or the user-visible improvement. -->

## How it was verified

- [ ] `go build ./...` passes (backend changes)
- [ ] `npm run lint && npm run typecheck && npm test && npm run build:go` passes (React frontend changes)
- [ ] `Docker build (validation)` check green (runs `docker build` on every PR; Docker cannot run in the Arena sandbox, so CI is the verification)
- [ ] Manually exercised the affected screen/endpoint
- [ ] For user-facing UI changes: describe the concrete UI/UX improvement and include a phone-sized preview or screenshots for owner review; if this is foundation-only Phase 11 work, say so and keep cutover gated
- [ ] Existing behaviour, data and migrations are unaffected

## Documentation

- [ ] `docs/` updated where behaviour, architecture or workflow changed
- [ ] `docs/` updated (and `docs/product/vision-and-open-questions.md` if a question was answered or raised)

## Risk / deployment notes

<!-- Any migration, cache-busting, env var or Cloudflare Access implication. "None" is a fine answer. -->
