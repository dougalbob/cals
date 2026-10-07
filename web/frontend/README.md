# cals React frontend — app rebuild and UI notes

**Status: 🟢 Phase 15 (Settings + PWA installability) is published as `v2.0.0-dev-rc34` and installed
on Unraid**, where the owner checked the Settings work and confirmed it behaves as intended. **Phase 16
stage 16.2 — the move to `/` — was published as rc35 and is included in rc36; neither candidate is
installed**, so the household still runs rc34 at `/next/`. The owner-approved Metrics follow-up
(decisions 116–119) was merged as PR #81 and published as `v2.0.0-dev-rc36` on 2026-10-07. Phase 11's React shell, Phase 12's Diary, Phase 13's Foods + Recipes and Phase 14's
Metrics + Nutrition are all in the development line. Settings saves account-level targets and
preferences through `/api/users/me`, while themes and haptics stay on the device; the two bank-ring
display limits are independent and do not change bank arithmetic. **Phone PWA installation is still
untested** — it needs a real device over the Cloudflare hostname, which is a step of the cutover (16.3),
not of this branch. The audit in [`../../docs/architecture/phase-16-plan.md`](../../docs/architecture/phase-16-plan.md)
found that no Cloudflare change is needed to install or test. Its §2.4 claim that Chromium withholds the
Android install prompt without a fetch handler is **out of date** (menu install has not needed one since
Chrome 109/112); the fetch handler matters because it drives the in-app **Install app** button, and
16.2 adds one. Decision 47's tracked-nutrient controls and missing-data audit are deferred by the owner.

The Go production build and the fixture preview both mount React at **`/`**. One constant
(`APP_BASE` in [`vite.config.ts`](vite.config.ts)) drives Vite's base and the manifest's
`id`/`start_url`/`scope` and icon URLs, and `spaHandler("/", …)` in
[`../../cmd/server/frontend.go`](../../cmd/server/frontend.go) derives the matching worker scope, so the
preview bundle and the production bundle cannot drift. `/next/*` 308s onto the same path with the prefix
stripped, and the legacy vanilla app is served unchanged and unlinked at **`/legacy/`** as a lifeboat
until its deletion is separately approved. **Installation is not offline support:** there is no offline
logging, queued saving, API/data caching or cached-data promise.

The last reported Unraid installation is **`v2.0.0-dev-rc34`** (owner Force Update, 2026-10-05).
The rc35 root-route retarget and the rc36 Metrics follow-up are both published; the owner's separate
Force Update to rc36 and its phone review remain outstanding. Release and
acceptance status lives in [`../../docs/CURRENT_STATE.md`](../../docs/CURRENT_STATE.md); the cutover
plan is [`../../docs/architecture/phase-16-plan.md`](../../docs/architecture/phase-16-plan.md) and
Phase 15's plan is [`../../docs/architecture/phase-15-plan.md`](../../docs/architecture/phase-15-plan.md).
The broader frontend proposal is [`../../docs/architecture/frontend-strategy.md`](../../docs/architecture/frontend-strategy.md).

---

## What's implemented

| Screen | Route | Notes |
|---|---|---|
| Today | `/` | Summary landing: calorie ring, food/drink totals, and four meal tiles with proportional calorie fills. Hydration and Quick drinks are intentionally kept off Today to reduce clutter; drink calories still contribute to the Drinks tile, ring and bank. The fluid controls remain on Diary. Today meal fills use a 25% color alpha (decision 83); Diary stays at 5%. |
| Diary | `/diary` and `/diary/:date` | Calorie ring (consumed vs goal + bank), banked/deficit tile, food/drink split, four meal sections with **edit weight / delete (with confirmation)**, drinks summary, hydration/Quick drinks card, add-food modal with debounced search, 📅 button opening the calendar on this week, and **+ Add recipe** that hands over to the Recipes tab with the meal and viewed date carried in the URL (decision 40, refined by decision 64). Meal fills use 5% color alpha. The Edit quantity sheet keeps Cancel/Save pinned while its content scrolls (rc22); re-check it with the recipe portion sheet on a phone in the next accumulated checkpoint review |
| Calendar | `/calendar`, `/calendar/month/:yyyy-mm`, `/calendar/week/:yyyy-mm-dd` | Month grid (compact cells, calorie bar, hydration pip, bank figure, today highlight) and week cards (phone-friendly per-meal kcal, hydration ml and bank), toggled by a Month/Week segmented control; arrows page by month/week, Today jumps back, and tapping a day opens `/diary/:date` (decision 49 follow-up). Day cells are classified against the selected month, not the first padded grid date: dates inside the month stay fully visible, while padded dates outside it remain muted. Over-goal days have a green bar split at the goal with a proportional red tail (decision 62). The calendar stops at Today — the forward arrow is disabled on the current month/week, future URLs are clamped back, and future dates remain muted and non-clickable (decision 63). The shared card is labelled **💧 Hydration** rather than "Water", since tea/coffee/squash etc. contribute to the daily target. |
| My drinks | `/drinks` | Catalog picker, per-tap glass size, usual milk/sugar. Feeds the Diary Quick drinks selector. Not a fifth tab |
| Settings | `/settings` | Per-user profile, daily calorie/water targets, weight unit, bank start date and bank-window presets/custom days; independent ring display limits, weigh-in trend window and body-map outline. Eight theme choices and the haptics toggle are device-local. Links to My drinks/Nutrition, an install prompt/instructions and version footer are included. Tracked-nutrient settings remain deferred by decision 47. |
| Metrics | `/metrics` | Weight summary with current/target in stones & lb plus kg, 30-day change, and the last weigh-in date; pannable weigh-in chart with the labelled moving-average trend and pannable goal-vs-consumed chart (Phase 14.3). rc36 adds date-editable weigh-in capture in the account's preferred kg or separate Stones/pounds fields (never decimal stones), keeps kg entry and unit switching in the target editor, and briefly reveals chart-point date/weight without breaking panning; the mobile summary keeps values compact and the actions/date on a second row. The body map is 30% shorter with 44 px tap targets, and all-time measurement history is visible without changing the existing newest-20 or bounded-window query contracts; waist is read from the latest-per-part lookup; the **weekly report card** (Phase 14.6): a week picker (‹ ›, opening on the current week so far) with a **Custom** free date range, showing calories vs goal and the average over logged days, how the bank moved, water, weight change, the four traffic lights for the range, the best and worst day against the goal, and the days **excluded as unlogged** (decision 42) named; the window lives in `report_*` URL parameters so the charts' own `from`/`to` window is untouched. While a new date range loads, the last charts remain visible; URL/query commits are throttled during a drag, superseded reads are cancellable, and touch haptics tick every five days (a user setting remains Phase 15); 30-day bank line; 7-day nutrition traffic lights; **the body-map measurement picker (Phase 14.4, decision 67)**: a one-time Female/Male outline choice (decision 97, female shows Bust, male Chest — decision 98), red tap points with 44 px hit areas (filled = measured, hollow = never), a pop-up pre-filled with the last value, 0.5 cm stepper (decision 99), the unsaved-discard and unchanged-save confirmations (decision 67), saving into today's row by per-part merge (decision 96); a staleness line with an amber cue after four weeks (decision 87); and the all-parts history whose rows open for correction via `PUT /api/measurements/{id}` with a two-step delete |
| Nutrition | `/nutrition` | Existing rolling macro summary, split donut, protein/fibre charts, goals and daily table remain in place. This branch adds two clearly marked **prototype-only** panels after the existing Protein/Fibre charts and before the existing daily table: day-by-day macro-energy bars with counts against the current goals, and protein/fibre density per 1,000 food kcal alongside daily amounts. Tapping a date lazily loads that day's diary and shows foods and recipes in diary order with their recorded weight and saved kcal/protein/carbs/fat/fibre snapshots. A separate one-at-a-time macro rail compares each day against the user's saved target; fibre keeps its 30 g/day reference, with density shown only as added context. No API, schema, target-setting or nutrient-coverage behaviour changes. Phone review: [macro rails and day details](../../docs/product/nutrition-insights-360.png) · [fibre/density context](../../docs/product/nutrition-density-360.png). |
| Foods | `/foods` | Debounced search over local foods, plus the "my foods" list (`is_edited = true`); create, edit and delete custom foods with named gram-backed measures (`1 bag` = 25 g) beside FatSecret's own options. The editor rounds pre-filled per-100 g calories and nutrition to whole numbers, including imported FatSecret values; saving a food correction refreshes its dependent recipe definitions and invalidates recipe queries, while saved Diary nutrition stays unchanged |
| Recipes | `/recipes`, `/recipes/new` and `/recipes/:id` | **Create recipe** opens a full-page authoring form for the fixed name, description, matched cals Food ingredients and grams, optional text ingredients, serves, manual or calculated cooked yield, instructions, a live nutrition estimate and shared classification; a successful create opens its detail page and preserves the catalogue/Diary query context. Photo upload/replacement shipped in rc25; cropping is deferred. Photo-led catalogue with search, per-user favourites and recipe log-count badges, occasion/dish/key-food filters, including an **Own creation** checkbox beside Dish type — and **tap-to-filter tags**: tapping a tag on a card narrows the list, each further tag narrows it again (every selected tag must match), and the selection rides in `?tags=` so it survives reload, back and a trip into a recipe. Detail logs portions using whole-recipe fractions (¼, ½, ¾, all) or direct grams, with live gram + kcal feedback and the user's remembered usual. Shared tags and optional total minutes can be edited below ingredients; the orange **Own creation** checkbox above the key-food choices is a shared recipe-origin field whose tag filters the catalogue (decision 79). **Edit recipe** opens a content editor for description, known cals Food ingredients and grams, text ingredients, serves, method and manual cooked weight; the name is visibly fixed and is also enforced by the server. Definition edits change future logs only. A tag on detail opens the catalogue filtered by it. **Archive/restore (decision 59):** the detail page ends with *Retire this recipe → Archive recipe* (inline two-step confirm; there is no Delete). Archived recipes leave the list, and a heart **Favourites** toggle and an archive-box **Archived** toggle share one row in the filter card (Archived is disabled at 0 and its tooltip carries the count), and Archived reveals them in a separate *Archived recipes* section whose cards show an *Archived* badge and a **Restore** button instead of the favourite heart. An archived recipe still opens by link, shows an *archived* banner with **Restore recipe**, and cannot be added to the Diary until restored. Reached from a Diary meal card, the tab doubles as that meal's recipe picker (`?add-to=&on=`): a banner names the meal and day, each card gains **🍽 Add to Breakfast**-style action opening the portion sheet pre-filled with the carried meal and date, *Done* returns to `/diary/:date#<meal>`, and the intent survives the filters, a reload and a detour into a recipe (decision 64) |

The proportional fills use Tailwind v4's slash-alpha background-color utilities
(`bg-primary-light/25` on Today and, for example, `bg-meal-breakfast/5` on Diary). The compiled CSS
applies 25% alpha to Today’s fill and 5% to Diary’s fill color itself, leaving the card text fully
opaque; it does not lower opacity for the whole meal card.

The shared `CalorieRing` anchors every arc at 12 o'clock and shows its sign by sweep direction
(owner decision 28, 2026-10-03). The **outer** arc is the bank: a surplus sweeps clockwise in green,
a deficit anticlockwise in red, saturating at independent per-user display limits (2,000 kcal each by
default). The exact bank figure remains visible, and these caps never change bank arithmetic. The
**inner** arc is today's allowance and
follows the same convention (owner request, 2026-10-03): a green clockwise countdown while there is
allowance left, then red anticlockwise growth once the day is overspent, scaled against another full
day's goal. Both use a reflected SVG transform (`arcTransform`) rather than a negative
`stroke-dashoffset` — the latter cannot render a full circle at the limits — and both directions are
pinned by `src/components/CalorieRing.test.tsx`.

The wheel carries its own labels and has no captions underneath: `bank ±N` (the bank balance **plus**
what is left of today), the day's spend in large type, and `daily ±N`. The small lines are
colour-coded by sign; the full wording lives in the SVG `aria-label`. On Diary, the one-tap glass logs
the Water drink's configured volume; **glass size is the per-tap volume, not the per-user daily
hydration target**. That separate target is written vertically across the glass at 90° (over the water),
so the fluids card needs no `x / y ml` caption. When hydration goes over target, the card states the
exact surplus (for example, `Target (+250 ml) reached`).

**Admin roles and Swap user (decisions 45, 88–90).** The header shows the *acting* account and, for
an Admin, a **Swap user** button. The sheet lists the household accounts, marks the one being viewed
and labels the Admin's own account "Your own account". While acting as someone else, an amber
**Viewing as …** banner sits under the header with **Return to \<you\>** beside it — a `role="status"`
region, so it is announced and not carried by colour alone. Both the banner and the swap control stay
visible while swapped, because the way back is part of the feature. Every cached query is
account-scoped, so a switch clears the whole cache rather than invalidating a handful of keys. The
role itself comes from the server (`GET /api/session`), never from a client-side claim; see
[`docs/architecture/admin-roles.md`](../../docs/architecture/admin-roles.md).

Under the hood: React 19, React Router (URL is state — the selected date is in the route), TanStack
Query (one query key per resource, mutations invalidate), Tailwind v4 with the existing
`themes.css` palette ported into an `@theme` block, TypeScript strict.

## What's deliberately missing

Recipe cropping, Google Fit, the decision-47 tracked-nutrient settings/missing-data audit, offline
logging, queued writes, and per-user food measures (measures are shared per food for now) remain
unimplemented or deferred. The PWA does **not** promise offline use; its worker at `/sw.js` has a
network-only pass-through fetch handler and no data cache. Recipe authoring is available at `/recipes/new`; uncropped photo
selection/upload and replacement on existing recipe detail shipped in rc25 (they are not part of
rc24). Existing recipes can also be edited safely in place, and food corrections refresh dependent
recipe definitions without rewriting Diary snapshots. The existing Mealie search/import is
legacy-only and is intentionally not part of the React migration; see the product decisions. The React
Diary supports adding, **editing the logged weight** and deleting entries; deleting a food or recipe
from a populated meal slot requires explicit confirmation. Editing rescales the entry's
own saved nutrition (`src/lib/diary.ts`, unit-tested) rather than re-reading the food or recipe
definition, which mirrors the legacy flow and keeps past days truthful. The production migration phases
cover the remaining work (see the strategy doc: phases 11–16).

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
packages) that also mounts the fixture API on the same origin. Open **`/`** in the preview; the server
also mirrors the production `/next/*` → root 308, so an old review link behaves as it does against Go.
The bundle, manifest, icons and worker all use the production root paths. The directory is **not** in the
sandbox's snapshot-exclusion list, so it survives between turns — restarting the preview takes about
**120 ms** and works even with `node_modules` deleted:

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
`/api/foods/search`, `/api/foods/custom`, `/api/foods` (POST), `/api/foods/{id}` (GET/PUT/DELETE),
`/api/recipes` (GET/POST create), `/api/recipes/{id}` (GET/PUT content),
`/api/recipes/{id}/favourite` (PUT), `/api/recipes/{id}/metadata` (PUT),
`/api/recipes/{id}/archive` (PUT; `/api/recipes` hides archived unless `?include_archived=true`, and
`POST /api/diary` returns 409 for an archived recipe, as the Go server does),
`/api/diary` (GET/POST/PUT/DELETE), `/api/bank`,
`/api/drinks` (GET/POST/PUT/DELETE), `/api/drinks/entries` (GET/POST/DELETE), `/api/water`,
`/api/weight` and `/api/weight/latest` (all-time latest weigh-in), `/api/measurements` (newest 20,
bounded range, or `?all=true`; POST merges the submitted parts), `/api/measurements/latest` (latest value
per body part), `/api/measurements/{id}` (PUT/DELETE), `/api/stats/calories`, `/api/stats/bank`,
`/api/nutrition/settings`, and `/api/nutrition/weekly`. Diary creation stores the nutrition snapshot
sent by the client, matching Go; it deliberately does not calculate from the current food definition.

Food create/update/delete carry household measures the same way the Go handlers do, recipe responses
carry the signed-in user's `usual_grams`, and `POST /api/diary` honours `make_usual` — first log
becomes the usual, later amounts stay one-off. `GET /api/diary` entries carry the logged food's
`food_serving_name`, `food_serving_grams` and `food_servings[]` so Edit offers the same choices.

**Not ported / unsupported:** permanently deleting recipes and recipe-photo cropping; recipe
retirement uses archive/restore instead. Uncropped image upload/replacement is implemented on this
branch. `POST /api/recipes` creates a recipe in both the Go handler and fixture API, and existing
content updates are mirrored there too.

**Implemented 2026-10-03 (decision 40, superseded in shape by decision 64):** every Diary meal card
has a **🍽 Add recipe** button beside **+ Add food**. It first opened a searchable recipe picker inside
a modal; the owner asked for the recipe box instead, because it already has the search, favourites,
archived handling and tag filters a picker would duplicate. Tapping it now navigates to
`/recipes?add-to=<meal>&on=<date>` — the intent is URL state, so it survives filters, reload, back and
a trip into the recipe's own page — and each card gains **🍽 Add to Breakfast**-style action that opens
the existing portion sheet with the originating meal and Diary date already selected. *Done* returns to
`/diary/:date#<meal>`. Non-archived recipes only (decision 59). Recipe logging otherwise keeps the
decision 29–32 behaviour (fractions, direct grams, no guessed quantity, remembered usual). Mealie
search/import is intentionally not implemented in this React frontend.

**Recipe creation and photo upload (decision 82):** `/recipes/new` authors recipe content and shared
classification using local cals Food records for nutrition; optional text ingredients stay separate
from the estimate. The typed `POST /api/recipes` writes content and classification atomically, and
query context is preserved through cancel and success. An optional JPEG, PNG or WebP photo (up to
10 MiB) is previewed and uploaded only after creation; an existing recipe's image can be replaced
from detail. If that second request fails, the saved recipe remains open with clear retry guidance,
so the user is not asked to create it again. Upload/replacement shipped in rc25; cropping is deferred. Current status is in [`../../docs/CURRENT_STATE.md`](../../docs/CURRENT_STATE.md).

Bank maths in `mock-api/handler.mjs` is transcribed from `internal/handlers/bank.go` on purpose —
the demo should show the same numbers the Go server would produce, including its quirks (see below).

## Checks

```bash
npm run lint         # ESLint on the typed frontend
npm run typecheck     # tsc --noEmit, strict
npm test              # vitest: domain maths + screen render tests
npm run build         # tsc --noEmit && vite build → web/dist/ (default base)
npm run build:go      # production shell for the Go server at / → web/dist/
npm run test:e2e      # Playwright browser suite (builds the preview bundle first)
```

The tests exercise typed API behavior, domain maths and render the implemented screens against the
fixture API, including add/edit/delete diary flows and delete confirmation, serving/grams mode, recipe
portion logging, URL-backed recipe filters including Own creation, hydration-target feedback, separate
Today/Diary meal-fill alpha, calendar month-cell states and new-recipe creation/validation plus
recipe-photo upload/replacement flows, the Metrics weigh-in capture and all-time measurement history,
and the Nutrition prototype's macro-share/density maths and panel rendering
(346 tests across 44 files as of 2026-10-07).

The **browser suite** (`e2e/`) covers what jsdom cannot: Diary logging/editing and the Edit
sheet's pinned actions on a short screen, confirmation/cancel behaviour when deleting a meal entry,
the Today-vs-Diary hydration split with drink-calorie accounting, the recipe-origin marker with the
catalogue filters, the Own creation filter beside Dish type with URL/tag composition and real touch
taps, recipe creation with photo upload and failure recovery, image replacement on detail, short-phone
form actions, the portion sheet on a small phone, and — after a phone report about tick-boxes ignoring
taps — the whole recipe area control by control (catalogue search/empty state/favourites/archived, the
Add tag form, the portion sheet's usual-portion rules, Edit recipe's validation, the Diary meal picker,
and real touch taps on every tick-box) plus the bottom navigation's arrow and touch swipe, and the 14.3 metrics charts (a real touch drag moves
one shared window, the URL keeps it across a reload, and the trend names its method), the Metrics
weigh-in/body-map journeys, the PWA install prompt and worker registration, and the Nutrition
prototype's target rails and lazily loaded day details at 360 px with no horizontal overflow —
81 tests across phone and desktop on 2026-10-07. It runs against the built bundle served by `serve-preview.mjs` with the fixture API — no Go
server, no database and never household data — and, in CI, only for milestones (release tags, or a
PR labelled `run-e2e`; manual dispatch would need the workflow on `main`, which is production and read-only, so a run is asked for with the label or a tag). Layer-by-layer detail, including the sandbox's browser
workaround: [`../../docs/architecture/testing.md`](../../docs/architecture/testing.md).

## Phase 11 Go integration

`npm run build:go` writes the production bundle to the git-ignored `web/dist/` with `/` as its asset
and router base. The Go server serves that shell and client-side deep links at `/`, gives hashed assets
immutable caching, and uses `no-store` for the shell; the legacy UI is served unchanged at `/legacy/`
and `/next/*` redirects onto the root. Docker builds this bundle in a Node 22 stage and copies only the
built files into the Go image.

In the Arena sandbox the Go server was built and run against a **disposable** database in `/tmp`, and
`scripts/smoke-app-routes.sh` passed against it: `/` and a Diary deep link served the React shell,
`/manifest.webmanifest`, `/sw.js` and `/pwa/icon-192.png` resolved, `/legacy/` served the legacy shell,
and the three `/next` paths answered 308 — in both dev-mode and production-like runs, the latter
confirming `/api/*` still returns 401. `go test ./...` and `go vet ./...` pass. **Docker is unavailable
in this sandbox**, so the image build is verified by the PR's `Docker build (validation)` workflow.

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

The owner has authorized Phase 11. It wired a typed API foundation and build into the Go app under a
temporary `/next/` route, leaving the existing UI as the default; Phase 16 has since retargeted it to
`/`. Fixtures remain available for the Arena
preview and tests; `VITE_API_TARGET` provides the real-server loop. Phase 11 need not change the
visible screens, but it must leave the project ready for user-facing phases.

Phase 12 is the Diary: it must improve the primary user's phone-based workflow, preserve a quick
selector for Tea/Coffee/Water using per-user drink values, and include drink calories in the bank.
The latter two are requirements; whether starter drink records are auto-provisioned for new users
remains open. No phase should cut over based only on framework adoption or functional parity.
