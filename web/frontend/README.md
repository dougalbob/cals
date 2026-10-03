# cals React frontend — Phase 11 foundation and UI spike

**Status: 🟡 Phase 11 foundation and Phase 12 Diary are implemented; Phase 13 has four merged
slices (recipe catalogue, portion logging, tap-to-filter tags, archive/restore — published through
`v2.0.0-dev-rc14`) and a fifth — decision 40, `+ Add recipe` on each Diary meal card — implemented
on the working branch and awaiting publication.** The first — a photo-led Recipes catalogue with search, per-user favourites, shared
structured tags, known-Food key foods, facet filters and optional total time in minutes — was
owner-reviewed in the Arena preview. The second — named gram-backed food measures (serving/grams
mode in Add and Edit) and recipe-to-Diary portion logging with each user's remembered usual — is
implemented, owner-reviewed and published in the `v2.0.0-dev-rc11` development checkpoint. The third
makes the recipe tags themselves the filter (tap a tag to narrow the list, tap another to narrow it
further); it was owner-reviewed in the Arena preview and merged as PR #30, published as
`v2.0.0-dev-rc12`. The fourth (decision 59) lets a recipe be archived and restored without touching
Diary history; it was owner-reviewed in the Arena preview and published as `v2.0.0-dev-rc14`. Full recipe authoring (name, ingredients, method, image) remains later work. The legacy Mealie importer is
not being pursued or ported to React. The Diary/Metrics/Foods screens began as a spike and remain a
work-in-progress; the existing vanilla UI is still the default. The Go app serves the React shell only
under the temporary `/next/` path. Nothing is cut over by this phase. UI/UX improvement is a headline
acceptance gate for the later screen phases; see
[`../../docs/architecture/frontend-strategy.md`](../../docs/architecture/frontend-strategy.md).

Background and the full proposal: [`../../docs/architecture/frontend-strategy.md`](../../docs/architecture/frontend-strategy.md).

---

## What's implemented

| Screen | Route | Notes |
|---|---|---|
| Today | `/` | Summary landing: calorie ring, four meal tiles, merged fluids card |
| Diary | `/diary` and `/diary/:date` | Calorie ring (consumed vs goal + bank), banked/deficit tile, food/drink split, four meal sections with **edit weight / delete**, drinks summary, add-food modal with debounced search, 📅 button opening the calendar on this week, **+ Add recipe** that opens a recipe picker and the portion sheet with the current meal/date preselected (decision 40) |
| Calendar | `/calendar`, `/calendar/month/:yyyy-mm`, `/calendar/week/:yyyy-mm-dd` | Month grid (compact cells, calorie bar, hydration pip, bank figure, today highlight) and week cards (larger phone-friendly layout with per-meal kcal, hydration ml and bank), toggled by a Month/Week segmented control; arrows page by month/week, Today jumps back; tapping any day opens `/diary/:date` (decision 49 follow-up). The fluids card is now labelled **💧 Hydration** rather than "Water", since tea/coffee/squash etc. contribute to the daily target. |

The shared `CalorieRing` outer arc is anchored at 12 o'clock in both directions: a bank **surplus
sweeps clockwise** in green, a **deficit sweeps anticlockwise** in red (owner decision 28,
2026-10-03). It uses a reflected SVG transform rather than a negative `stroke-dashoffset` — the
latter cannot render a full circle at the ±2,000 kcal limits — and both directions are pinned by
`src/components/CalorieRing.test.tsx`.
| My drinks | `/drinks` | Catalog picker, glass size, usual milk/sugar. Feeds the Today 2×2. Not a fifth tab |
| Metrics | `/metrics` | Weight (stones & lb + kg), 30-day change, target, waist; 90-day weight trend; 14-day calorie bars with goal line; 30-day bank line; 7-day nutrition traffic lights; measurements table |
| Foods | `/foods` | Debounced search over local foods, plus the "my foods" list (`is_edited = true`); create, edit and delete custom foods with named gram-backed measures (`1 bag` = 25 g) beside FatSecret's own options |
| Recipes | `/recipes` and `/recipes/:id` | Photo-led catalogue with search, per-user favourites, occasion/dish/key-food filters — and **tap-to-filter tags**: tapping a tag on a card narrows the list, each further tag narrows it again (every selected tag must match), and the selection rides in `?tags=` so it survives reload, back and a trip into a recipe. Detail also logs a portion to the diary: whole-recipe fractions (¼, ½, ¾, all) or direct grams, with a live gram + kcal readout, the date and meal, and the user's remembered usual prefill. Shared tags and optional total minutes can be edited below recipe ingredients; a tag on the detail page opens the catalogue filtered by it. **Archive/restore (decision 59):** the detail page ends with *Retire this recipe → Archive recipe* (inline two-step confirm; there is no Delete). Archived recipes leave the list, and a heart **Favourites** toggle and an archive-box **Archived** toggle share one row in the filter card (Archived is disabled at 0 and its tooltip carries the count), and Archived reveals them in a separate *Archived recipes* section whose cards show an *Archived* badge and a **Restore** button instead of the favourite heart. An archived recipe still opens by link, shows an *archived* banner with **Restore recipe**, and cannot be added to the Diary until restored |

Under the hood: React 19, React Router (URL is state — the selected date is in the route), TanStack
Query (one query key per resource, mutations invalidate), Tailwind v4 with the existing
`themes.css` palette ported into an `@theme` block, TypeScript strict.

## What's deliberately missing

Full recipe content authoring (name, ingredients and method), image upload, Google Fit, settings,
themes, the PWA/service worker, per-user food measures (measures are shared per food for now), and
most remaining mutations. The existing Mealie search/import is legacy-only and is intentionally not
part of the React migration; see the product decisions. The React Diary supports adding, **editing the
logged weight** and deleting entries. Editing rescales the entry's own saved nutrition
(`src/lib/diary.ts`, unit-tested) rather than re-reading the food or recipe definition, which mirrors
the legacy flow and keeps past days truthful. The production migration phases cover the remaining work
(see the strategy doc: phases 11–16).

## Running it

### In an Arena session — one command, run it first

```bash
./scripts/serve-frontend-preview.sh          # fast path: pre-built bundle + fixtures
./scripts/serve-frontend-preview.sh --dev    # Vite dev server, with HMR
```

**Run this as the first action of a session.** Arena recycles the sandbox between turns: the running
process does not survive and `node_modules/` is not snapshotted.

The default path is deliberately **dependency-free**. The app is served from the pre-built
`preview/` directory by [`serve-preview.mjs`](serve-preview.mjs), a plain Node HTTP server (no npm
packages) that also mounts the fixture API on the same origin. That directory is **not** in the
sandbox's snapshot-exclusion list, so it survives between turns — so restarting the preview takes
about **120 ms** and works even with `node_modules` deleted:

```
$ rm -rf node_modules && ./scripts/serve-frontend-preview.sh
Serving the pre-built preview on 0.0.0.0:5173 (no dependencies required)…
ready in 121 ms
```

Rebuild it only when the frontend source changes: `npm run build:preview` (needs Vite, i.e.
`npm ci` if dependencies are missing).

**Safety:** re-running the script is idempotent. If a healthy preview is already on the port it exits
without doing anything; if the port is held by a stale preview it clears it and takes over; if an
unknown process holds the port it reports the PID and exits rather than killing it.

> **Preview showing "This preview has expired"?** This is a sandbox-lifetime issue, not an
> application error. Preview URLs are bound to the sandbox instance
> (`https://<port>-<sandbox-id>.e2b.app`), and a new sandbox means a new URL — so a tab or bookmark
> from an earlier turn reports *Expired* however healthy the server is. Use the **Restart** button
> (it now works, because restarting needs no dependencies), or ask for the preview at the start of a
> turn and open it from the Arena process panel rather than refreshing an old tab.

### Against the real Go server (the normal dev loop on your own machine)

```bash
# terminal 1
go run ./cmd/server                 # cals on :8150

# terminal 2
cd web/frontend
npm ci
VITE_API_TARGET=http://localhost:8150 npm run dev
```

Vite proxies `/api`, `/public` and `/health` to Go, so this is a true frontend-only rebuild — no
API contract changes needed.

### Against the fixture API (on your own machine, or for UI work without a DB)

```bash
cd web/frontend
npm ci                              # required first: node_modules is never snapshotted
npm run dev                          # http://localhost:5173
```

> **Note:** `node_modules/` is excluded from the Arena workspace snapshot, so a **new session must
> run `npm ci`** (244 packages; ~3 s in this sandbox) before `npm run dev` — otherwise Vite fails with
> `sh: 1: vite: not found`. `./scripts/serve-frontend-preview.sh` does this for you. Nothing else is
> needed: the fixture API has no external dependencies.

With no `VITE_API_TARGET`, a Vite plugin mounts `mock-api/` as same-origin `/api/*` routes.
Seeded data is generated relative to *today*, so the diary always looks live: 21 days of food
(coffee, porridge, chicken curry, Friday fish & chips, Saturday curry night, Sunday roast), 20 days
of drinks, ~120 days of weight with realistic noise, five measurement sets, and today deliberately
part-filled (dinner not logged yet).

**Mapped fixtures** (kept aligned with the Go handler contract): `/api/version`, `/api/users/me`,
`/api/foods/search`, `/api/foods/custom`, `/api/foods` (POST), `/api/foods/{id}` (PUT/DELETE),
`/api/recipes` (GET), `/api/recipes/{id}` (GET),
`/api/recipes/{id}/favourite` (PUT), `/api/recipes/{id}/metadata` (PUT),
`/api/recipes/{id}/archive` (PUT; `/api/recipes` hides archived unless `?include_archived=true`, and
`POST /api/diary` returns 409 for an archived recipe, as the Go server does),
`/api/diary` (GET/POST/PUT/DELETE), `/api/bank`,
`/api/drinks` (GET/POST/PUT/DELETE), `/api/drinks/entries` (GET/POST/DELETE), `/api/water`,
`/api/weight`, `/api/measurements`, `/api/stats/calories`, `/api/stats/bank`,
`/api/nutrition/settings`, and `/api/nutrition/weekly`. Diary creation stores the nutrition snapshot
sent by the client, matching Go; it deliberately does not calculate from the current food definition.

Food create/update/delete carry household measures the same way the Go handlers do, recipe responses
carry the signed-in user's `usual_grams`, and `POST /api/diary` honours `make_usual` — first log
becomes the usual, later amounts stay one-off. `GET /api/diary` entries carry the logged food's
`food_serving_name`, `food_serving_grams` and `food_servings[]` so Edit offers the same choices.

**Stubbed**: the Phase 13 operations not yet ported (core recipe create/update/delete and image
upload) return a clear `501` so the preview does not pretend those flows are implemented.

**Implemented 2026-10-03 (decision 40):** every Diary meal card has a **🍽 Add recipe** button
beside **+ Add food**. Tapping it opens a searchable recipe picker (non-archived recipes only, per
decision 59); selecting a recipe opens the existing portion sheet with the originating meal and the
Diary date already selected, so logging takes one fewer tap. Recipe logging otherwise keeps the
decision 29–32 behaviour (fractions, direct grams, no guessed quantity, remembered usual). Mealie
search/import is intentionally not implemented in this React frontend.

**Next planned slice:** the calendar for historic dates (decision 49 follow-up) — a month view opened
from the Diary date header with data-day markers, landing on `/diary/:date`.

Bank maths in `mock-api/handler.mjs` is transcribed from `internal/handlers/bank.go` on purpose —
the demo should show the same numbers the Go server would produce, including its quirks (see below).

## Checks

```bash
npm run lint         # ESLint on the typed frontend
npm run typecheck     # tsc --noEmit, strict
npm test              # vitest: domain maths + screen render tests
npm run build         # tsc --noEmit && vite build → web/dist/ (default base)
npm run build:go      # production shell for the Go /next/ route → web/dist/
```

The tests exercise typed API behavior, domain maths and render the implemented screens against the
fixture API, including add/edit/delete diary flows, serving/grams mode and recipe portion logging
(93 tests total as of 2026-10-03).

## Phase 11 Go integration

`npm run build:go` writes the production bundle to the git-ignored `web/dist/` with `/next/` as its
asset and router base. The Go server serves that shell and client-side deep links at `/next/`, gives
hashed assets immutable caching, and uses `no-store` for the shell; `/` continues to serve the legacy
UI. Docker builds this bundle in a Node 22 stage and copies only the built files into the Go image.

In the Arena sandbox, the Go server was built and run against a temporary database; `/next/`, a Diary
deep link, the legacy root and a hashed asset all returned successfully with the expected cache
headers. `go test ./...` and `go vet ./...` pass. **Docker is unavailable in this sandbox**, so run
`docker build` on a machine with Docker before merging the Phase 11 PR.

## Findings from this spike

1. **The toolchain works in the Arena sandbox.** Node 22.22.3 and npm 10.9.8 are present, the npm
   registry is reachable, and installs take seconds (63 packages, ~16 s). Vite 8's dev server bound
   0.0.0.0:5173 and served the preview proxy with `allowedHosts: true` and no origin complaints.
2. **Go is *not* available in the sandbox.** No toolchain, and `go.dev`, `dl.google.com`,
   `proxy.golang.org`, apt and Docker are all unreachable — only GitHub and the npm registry are
   open. Hence the fixture API. On a normal dev machine (or the Unraid box) the real server is used
   via `VITE_API_TARGET`.
3. **Bundle cost is acceptable and honest:** 374 kB JS (116 kB gzip) + 16 kB CSS (4.2 kB gzip) for
   three screens. The current vanilla app ships roughly 4,500 lines of JS unminified over many
   requests with no caching; the spike is one cached, hashed bundle.
4. **A pre-existing inconsistency surfaced and the owner decision is now settled.** `internal/handlers/bank.go` sums only `diary_entries`, while the diary ring includes drink calories. The bank must include drinks; Phase 12 will implement that fix and add a regression test. The fixture currently reproduces the existing backend behaviour rather than hiding it.
5. **Version drift is real.** `cmd/server/main.go` said 1.7.0, `web/static/js/app.js` said 1.7.0,
   but `web/public/sw.js` still said 1.4.0. The spike reads the version from `GET /api/version`
   instead of hard-coding it in two places, which removes this class of drift. **Resolved
   2026-10-02:** all three were bumped to 2.0.0 on `cals-dev` for the V2 development line; `main`
   remains on 1.7.0.
6. **URL-is-state removes a whole class of bugs.** `/diary/2026-09-30` survives refresh, back and
   deep links; the current SPA keeps the date in a global and resets on reload.
7. **A testing story exists on day one.** `npm test` runs in ~2 s and already covers date maths
   (including DST and leap days), stones/lbs conversion, and the rendering of all three screens.

## Phase 11 and what follows

The owner has authorized Phase 11. It wires a typed API foundation and build into the Go app under
`/next/`, while leaving the existing UI as the default. Fixtures remain available for the Arena
preview and tests; `VITE_API_TARGET` provides the real-server loop. Phase 11 need not change the
visible screens, but it must leave the project ready for user-facing phases.

Phase 12 is the Diary: it must improve the primary user's phone-based workflow, preserve a quick
selector for Tea/Coffee/Water using per-user drink values, and include drink calories in the bank.
The latter two are requirements; whether starter drink records are auto-provisioned for new users
remains open. No phase should cut over based only on framework adoption or functional parity.
