# Testing and runtime checks

| Field | Value |
|---|---|
| **Status** | 🟢 **Adopted — how cals is tested, and what is deliberately not covered** |
| **Written** | 2026-10-04 (stabilisation pass before Phase 14) |
| **Purpose** | One place to answer: what runs on an ordinary PR, what runs at a milestone, how to run each check locally or in an Arena sandbox, and where a failure's evidence ends up |
| **Related** | [`../CURRENT_STATE.md`](../CURRENT_STATE.md) (what is deployed), [`rebuild-kickoff.md`](./rebuild-kickoff.md) (first commands), [`unraid-image-release.md`](./unraid-image-release.md) (the owner-run Unraid smoke test), [`data-copy-warning.md`](./data-copy-warning.md) (never point any of this at appdata) |

---

## 1. The layers

| Layer | Command | Runs… | Covers |
|---|---|---|---|
| **Vitest + jsdom** | `cd web/frontend && npm test` | every PR (inside the Docker build too) | Domain maths (bank, portions, servings, calendar dates, drink catalogue), API client behaviour, and screen rendering with user events against the fixture API — 195 tests over 25 files |
| **Frontend lint + typecheck** | `npm run lint && npm run typecheck && npm run build:go` | every PR | ESLint (app, browser suite and configs), strict `tsc`, and that the production `/next/` bundle still builds |
| **Go build, vet, test** | `go build ./... && go vet ./... && go test ./...` | every PR (`Go tests (validation)`) | Handlers against a real in-memory SQLite database, including the bank, recipe and calendar regressions |
| **Docker build** | `docker build` | every PR (`Docker build (validation)`) | The image the publish workflow builds, including the Node stage's lint/test/build |
| **Container runtime smoke** | part of `Docker build (validation)` | every PR | Starts the built image with a **disposable** database (no volume mounts), waits for `/health`, runs `scripts/smoke-app-routes.sh`, checks migrations created the expected tables, and checks a second container **without** `DEV_MODE` still answers `401` on protected routes |
| **Playwright browser suite** | `cd web/frontend && npm run test:e2e` | milestones only (`Playwright browser suite (milestone)`): release-candidate tags, or a PR labelled `run-e2e`. (The workflow also declares `workflow_dispatch`, but GitHub only allows a manual dispatch once the file is on the **default branch**; that branch is `main`, which is production and read-only — so the label or the tag is the route, never a push to `main`) | The built React bundle in a real Chromium at phone size — the journeys that live in layout and interaction rather than in jsdom |

The **Unraid install smoke test** is separate and owner-run; see
[`unraid-image-release.md`](./unraid-image-release.md). Nothing automated here goes near live
household data: the container smoke uses a database inside the container, and the browser suite runs
against in-process fixtures.

## 2. The browser suite

```
web/frontend/playwright.config.ts      phone project (Pixel 7) + @desktop smoke project
web/frontend/e2e/diary.spec.ts         logging a food; confirmation/cancel before deleting a populated
                                       meal entry; the Edit sheet's fixed actions on a short screen;
                                       rescaling one entry without touching the others; Cancel writing nothing
web/frontend/e2e/hydration.spec.ts     Today has no water controls; Diary has the glass and quick
                                       drinks; a glass moves the ml target; long-press deletes the
                                       latest glass; logging on a past date lands on that date;
                                       drink calories reach tomorrow's bank
web/frontend/e2e/recipes.spec.ts       the orange Own creation marker (catalogue + detail toggle),
                                       the URL-backed Own creation checkbox beside Dish type, tag/occasion
                                       filtering, and the portion sheet's actions on a small phone
web/frontend/e2e/recipes-catalogue.spec.ts  search, empty state, favourites, the archived view,
                                       restore
web/frontend/e2e/recipes-create.spec.ts    recipe creation (matched Foods, cooked yield, shared
                                       classification), photo selection/upload and upload-failure
                                       recovery, unobstructed fields and actions on a short phone
web/frontend/e2e/recipes-detail.spec.ts facts, ingredients, method, the Add tag form (meal
                                       occasions, the two-key-food limit, Cancel, total time),
                                       archive/restore and recipe-photo replacement
web/frontend/e2e/recipes-portion-sheet.spec.ts  remembered usual, fractions, direct grams,
                                       one-off vs make-this-my-usual, meal choice, Cancel
web/frontend/e2e/recipes-editor.spec.ts  Edit recipe: fixed name, measured vs calculated weight,
                                       validation, text ingredients, Cancel discarding edits
web/frontend/e2e/recipes-diary-handoff.spec.ts  the Diary meal picker: carried meal/date, logging
                                       return trip, archived recipe refusing to log
web/frontend/e2e/recipes-touch.spec.ts  every tick-box answers a real touch tap (box and text),
                                       rows resist selection/double-tap zoom, text fields stay
                                       selectable
web/frontend/e2e/navigation.spec.ts    the bottom nav's arrow and a real touch swipe reveal the
                                       last destinations
web/frontend/e2e/desktop-smoke.spec.ts thin desktop render pass (tagged @desktop)
web/frontend/e2e/support.ts            fixture reset + API/date helpers
web/frontend/e2e/summarise-results.mjs short failure list for the job log/summary
```

Design rules, so the suite stays trustworthy:

- **Hermetic.** It serves the pre-built bundle with `web/frontend/serve-preview.mjs`, which mounts the
  fixture API (`web/frontend/mock-api/`) in the same process. No Go server, no SQLite, no Cloudflare
  Access, no household data.
- **Deterministic.** One worker (the fixture state is process-wide), `POST /api/_test/reset` before
  every spec, both the server and the browser pinned to UTC so "today" cannot differ between them.
- **Phone-first.** The default project is a Pixel 7 viewport with touch; specs that only make sense on
  a desktop are tagged `@desktop` and run in the second project.
- **Small, but the recipe area is deliberately thorough.** The owner asked for a top-to-bottom pass
  over the recipe pages and sheets after a phone oddity on the Add tag form, so that area is covered
  control by control; the rest of the suite stays a thin slice of the highest-value journeys.
- **Expected values come from the API**, not from memory: a spec reads `/api/recipes/:id` or
  `/api/diary` and asserts the screen against it, so a fixture change cannot silently weaken a test.
- **Real touch input for phone behaviour.** `touchTap` in `support.ts` centres an element and taps it
  with `page.touchscreen`, and the navigation swipe uses CDP touch events — a mouse click would prove
  nothing about either.
- **Evidence on failure.** Traces, screenshots and video are written for failures and uploaded as the
  `playwright-*` artifact even when the job fails; the JSON report is uploaded too.

### Running it

```bash
cd web/frontend
npm run test:e2e        # build the preview bundle, then run every project
npm run test:e2e:phone  # phone project only
npx playwright test e2e/diary.spec.ts --project=phone   # one spec
```

The first run on a new machine needs the browser: `npx playwright install --with-deps chromium`.

**In the Arena sandbox** the browser CDNs are blocked, so use the wrapper — it fetches a matching
Chromium from the npm registry instead and rebuilds the bundle first:

```bash
./scripts/run-playwright-in-sandbox.sh                       # whole suite
./scripts/run-playwright-in-sandbox.sh --project=phone e2e/diary.spec.ts
```

Point the suite at something else with `E2E_BASE_URL` (the specs use relative URLs, so any server
serving the app and `/api/*` works). Video is switched off in the sandbox because Playwright's
bundled ffmpeg comes from the blocked CDN; traces and screenshots still work.

### What survives between sessions

The **tests are part of the repository** — `web/frontend/e2e/`, `playwright.config.ts` and
`scripts/run-playwright-in-sandbox.sh` are committed on the branch (and on `cals-dev` once the PR
merges), so no session, developer or CI run has to write them again. The second question, whether
they can still be *run*, is answered by the environment rather than the repo:

| Thing | Lives in | Gone at the end of a session? |
|---|---|---|
| Specs, config, the sandbox bootstrap script | the repository | No — committed |
| The preview bundle the suite drives | `web/frontend/preview/` | No — rebuilt by `npm run build:preview`, which `test:e2e` and the wrapper both run |
| npm dependencies | `web/frontend/node_modules/` | Yes — `npm ci` (the wrapper does it when missing) |
| The Chromium binary and its libraries | `/tmp`, outside the repo | Yes — the wrapper re-*provisions* them (~5 s warm, ~1 min cold); nothing is re-written by hand |
| Failure traces, screenshots, reports | `web/frontend/test-results/`, `playwright-report/` | Yes, and they are git-ignored; CI attaches them to the run instead |

So a later session runs `./scripts/run-playwright-in-sandbox.sh` and gets the same suite; the only
thing that is ever rebuilt is the toolchain, never the tests.

## 3. CI behaviour, and why failures are diagnosable

- Ordinary PRs keep the fast checks: frontend lint/typecheck/Vitest/build, Go vet/tests, the Docker
  build **and** the container runtime smoke.
- The Playwright suite is reserved for milestones (`v*-dev*` tags) or a PR that opts in with the
  `run-e2e` label — the way to prove a risky UI change before it reaches a release candidate. The
  workflow also declares `workflow_dispatch`, but GitHub only allows a manual dispatch once the file
  exists on the **default branch** — `main`, which is production and read-only, so that option is
  simply unavailable to us and is not worth pursuing. Use the label (or the tag). Opting a PR in also
  keeps the suite running on later pushes to that PR.
- **A failing browser run explains itself without the raw Actions log.** The `Failure summary` step
  turns Playwright's JSON report into a short list — project, file, test title, the first line of the
  error and the artifact paths — in the job log and the run summary, and the full `test-results/` and
  `playwright-report/` directories are uploaded with `if: always()`.
- **A failing container smoke explains itself too.** `scripts/smoke-app-routes.sh` prints one line per
  route and a failure detail block, and the job dumps the tail of both containers' logs on failure.
- Raw Actions log *downloads* have been unreliable from some environments (`results-receiver.actions.githubusercontent.com`
  has failed from the Arena sandbox). Rely on the run/job summary, the uploaded artifacts, and
  `gh api .../actions/runs/<id>/jobs` for step-level results.

### Publishing a checkpoint

Pushing a `v*-dev*` tag starts the publish workflow **and** the browser suite against the same commit,
so every development checkpoint carries a record that the phone journeys were exercised on exactly the
code being deployed. (First proven on `v2.0.0-dev-rc23`, 2026-10-04: `publish-dev-image.yml` run
37202837131 and `web-e2e.yml` run 37202837122, 51 passed; rc24's publish run 37206446238 and
`web-e2e.yml` run 37206446239 passed with 53.) The browser run is evidence rather than a gate — the image is already in GHCR by
the time it finishes, and a failure does not unpublish it (report it and fix forward instead). The
pre-publish checklist in
[`git-workflow.md`](./git-workflow.md#before-you-start-the-loop--the-pre-publish-checklist) covers the
rest: docs finished in the same PR, no stale claims, and the checks green on the commit being tagged.

## 4. What this deliberately does not cover

- **The real Go backend in a browser.** The Playwright suite runs against fixtures, so it cannot catch
  a handler/response-shape drift. The container runtime smoke checks the real routes and the schema,
  and the Go tests cover handler behaviour; a browser-over-real-server run is possible (`E2E_BASE_URL`)
  but is not part of CI.
- **The Unraid install, template, `.env` loading and Cloudflare routing.** Owner-run, documented in
  [`unraid-image-release.md`](./unraid-image-release.md).
- **Recipe-photo cropping.** Deliberately deferred by decision 82. Direct upload/replacement shipped in
  rc25 without cropping; the full 60-test Playwright suite includes create,
  upload-failure and replacement journeys, the Own creation detail filter on a phone, and Diary
  delete-confirmation flows. Playwright uses the fixture API; Go handler tests cover storage and
  validation, and the route remains behind the existing auth middleware.
- **Every combination of date, meal, unit and filter.** The unit tests carry that weight; the browser
  suite exists to catch what jsdom cannot see.
- **Android's own selection/copy popup.** Headless Chromium does not reproduce it, so
  `recipes-touch.spec.ts` pins the CSS that stops Android from offering it (`touch-action:
  manipulation`, `user-select: none` on label rows) rather than the popup itself. The phone re-test
  after the next release is what confirms it end to end.

## 5. Adding to the suite

1. Prefer a unit test unless the bug needs layout, scrolling, a real viewport or a real event.
2. Reset fixtures first (`await resetFixtures(request)`) and read expected values from the API rather
   than hard-coding numbers the fixture may change.
3. Use role/name locators from the app's real accessible names — no test IDs were added for this.
4. Assert at phone size (the default project). If a bug needs a short screen, set the viewport
   explicitly and say why in a comment, as `diary.spec.ts` does for the Edit sheet.
5. For anything a finger does — tapping, swiping, long-pressing — drive it through
   `page.touchscreen`/CDP instead of `click()`, or the test cannot see the bug you are chasing.
6. Keep it green: `npm run lint && npm run typecheck && npm test && npm run test:e2e`.
