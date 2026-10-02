# cals frontend spike — React 19 + TypeScript + Vite + Tailwind CSS

**Status: 🟡 SPIKE / proof of concept.** This is *not* the production frontend. Nothing here is served
by the Go application, nothing imports it, and `docker compose build` behaves exactly as before. It
exists to answer one question: *does the proposed stack actually work for cals, in the Arena
environment, with real data shapes?*

Background and the full proposal: [`../../docs/architecture/frontend-strategy.md`](../../docs/architecture/frontend-strategy.md).

---

## What's implemented

| Screen | Route | Notes |
|---|---|---|
| Diary | `/diary` and `/diary/:date` | Calorie ring (consumed vs goal + bank), banked/deficit tile, food/drink split, four meal sections with delete, drinks summary, add-food modal with debounced search |
| Metrics | `/metrics` | Weight (stones & lb + kg), 30-day change, target, waist; 90-day weight trend; 14-day calorie bars with goal line; 30-day bank line; 7-day nutrition traffic lights; measurements table |
| Foods | `/foods` | Debounced search over local foods, plus the "my foods" list (`is_edited = true`) |

Under the hood: React 19, React Router (URL is state — the selected date is in the route), TanStack
Query (one query key per resource, mutations invalidate), Tailwind v4 with the existing
`themes.css` palette ported into an `@theme` block, TypeScript strict.

## What's deliberately missing

Recipes, recipe images, Mealie import, Google Fit, settings, themes, the PWA/service worker, and
every mutation except add/delete diary entry. The production migration phases cover these
(see the strategy doc: phases 11–16).

## Running it

### Against the real Go server (the normal dev loop)

```bash
# terminal 1
go run ./cmd/server                 # cals on :8150

# terminal 2
cd web/frontend
npm install
VITE_API_TARGET=http://localhost:8150 npm run dev
```

Vite proxies `/api` to Go, so this is a true frontend-only rebuild — no backend changes needed.

### Against the fixture API (this sandbox, and for UI work without a DB)

```bash
cd web/frontend
npm install                          # required first: node_modules is never snapshotted
npm run dev                          # http://localhost:5173
```

> **Note:** `node_modules/` is excluded from the Arena workspace snapshot, so a **new session must
> run `npm install`** (about 4 s, 120 packages) before `npm run dev` — otherwise Vite fails with
> `sh: 1: vite: not found`. Nothing else is needed: the fixture API has no external dependencies.

With no `VITE_API_TARGET`, a Vite plugin mounts `mock-api/` as same-origin `/api/*` routes.
Seeded data is generated relative to *today*, so the diary always looks live: 21 days of food
(coffee, porridge, chicken curry, Friday fish & chips, Saturday curry night, Sunday roast), 20 days
of drinks, ~120 days of weight with realistic noise, five measurement sets, and today deliberately
part-filled (dinner not logged yet).

**Mapped fixtures** (same JSON shapes as the Go handlers): `/api/version`, `/api/users/me`,
`/api/foods/search`, `/api/foods/custom`, `/api/diary`, `/api/bank`, `/api/drinks`,
`/api/drinks/entries`, `/api/weight`, `/api/measurements`, `/api/stats/calories`,
`/api/stats/bank`, `/api/nutrition/settings`, `/api/nutrition/weekly`.

**Stubbed**: everything else returns
`501 {"error":"Fixture API: POST /api/recipes is not implemented in the spike"}` so it is obvious
what is real. Add and delete of diary entries *are* implemented, so the modal is clickable.

Bank maths in `mock-api/handler.mjs` is transcribed from `internal/handlers/bank.go` on purpose —
the demo should show the same numbers the Go server would produce, including its quirks (see below).

## Checks

```bash
npm run typecheck     # tsc --noEmit, strict
npm test              # vitest: domain maths + a jsdom render test of the Diary screen
npm run build         # tsc --noEmit && vite build → dist/
```

The render tests drive the components through the fixture API, so a screen that stops rendering
fails the suite rather than only being noticed in the browser (14 tests across the domain maths and
all three screens).

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
4. **A pre-existing inconsistency surfaced.** `bank.go` sums only `diary_entries`, while the diary
   ring in `app.js` includes drink calories. So the "banked" figure silently ignores drinks while
   today's ring does not. The fixture reproduces the real behaviour rather than hiding it — worth a
   decision before the migration ports the bank code (see the strategy doc's phase 12).
5. **Version drift is real.** `cmd/server/main.go` says 1.7.0, `web/static/js/app.js` says 1.7.0,
   but `web/public/sw.js` still says 1.4.0. The spike reads the version from `GET /api/version`
   instead of hard-coding it in two places, which removes this class of drift.
6. **URL-is-state removes a whole class of bugs.** `/diary/2026-09-30` survives refresh, back and
   deep links; the current SPA keeps the date in a global and resets on reload.
7. **A testing story exists on day one.** `npm test` runs in ~2 s and already covers date maths
   (including DST and leap days), stones/lbs conversion, and the rendering of all three screens.

## Next step

The proposed go/no-go is a timeboxed Diary spike judged by the owner — this is that artefact. If the
answer is yes, Phase 11 of the strategy doc replaces the fixture API with the real
`VITE_API_TARGET` loop, ports the remaining screens behind a temporary `/next` route, and the
fixtures stay behind as test data.
