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

- [ ] `go build ./...` passes
- [ ] `docker compose build` succeeds (for user-visible changes)
- [ ] Manually exercised the affected screen/endpoint
- [ ] Existing behaviour, data and migrations are unaffected

## Documentation

- [ ] `docs/` updated where behaviour, architecture or workflow changed
- [ ] `docs/` updated (and `docs/product/vision-and-open-questions.md` if a question was answered or raised)

## Risk / deployment notes

<!-- Any migration, cache-busting, env var or Cloudflare Access implication. "None" is a fine answer. -->
