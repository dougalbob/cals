# cals

A personal calorie and nutrition tracking application.

## Documentation

| Document | What it covers |
|---|---|
| [`docs/`](docs/README.md) | Documentation index and conventions |
| [`docs/architecture/frontend-strategy.md`](docs/architecture/frontend-strategy.md) | 🟡 Proposed overall; **Phase 11 authorized**. React 19 + TypeScript + Vite + Tailwind; UI/UX improvement is a headline requirement. Frontend only — Go API, database, auth and deployment stay unchanged |
| [`docs/architecture/git-workflow.md`](docs/architecture/git-workflow.md) | Branch strategy: `main` is production, `cals-dev` is integration, all work arrives via PR |
| [`docs/architecture/unraid-image-release.md`](docs/architecture/unraid-image-release.md) | **How cals is installed and updated**: the `cals-dev-v2.xml` Unraid template + prebuilt GHCR image (Compose is retired as an install method) |
| [`AGENTS.md`](AGENTS.md) | Working rules for AI agents and contributors — **never push to `main`** |
| [`ai_contextual_docs/context.txt`](ai_contextual_docs/context.txt) | 🔴 **Legacy** historic build log — superseded by `docs/`, not maintained |

> **Headline product requirement:** the frontend work must materially improve how cals looks and feels in everyday use—especially on a phone. A framework migration or functional parity alone is not success. See the UI acceptance gate in [`frontend-strategy.md`](docs/architecture/frontend-strategy.md).

## Branching (short version)

- **`main`** — live production. Protected by convention and (where the plan allows) GitHub branch protection. Never push directly.
- **`cals-dev`** — integration branch. All pull requests target this.
- **topic / session branches** — one per change (`arena/*`, `feat/*`, `fix/*`).

```bash
./scripts/setup-git-hooks.sh   # once per clone: blocks accidental pushes to main
```

## Configuration

Copy `.env.example` (or create `/app/data/.env`) with your environment variables.

### Required

| Variable | Description |
|---|---|
| `CF_TEAM_DOMAIN` | Cloudflare Teams domain for production authentication (not used when `DEV_MODE=true`) |
| `CF_POLICY_AUD` | Cloudflare Access policy audience (not used when `DEV_MODE=true`) |

### Optional

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8150` | HTTP listen port. The `cals-dev-v2` Unraid template sets this to `8151`; V1 remains on `8150`. |
| `LOG_LEVEL` | `info` | Log level |
| `DB_PATH` | `/app/data/cals.db` | SQLite database path |
| `DEV_MODE` | `false` | Local-only authentication bypass; see [Local Development](docs/architecture/local-development.md) |
| `DEV_USER_EMAIL` | *(required with `DEV_MODE=true`)* | User identity to use in local development |
| `BIND_ADDRESS` | *(all interfaces in production; `127.0.0.1` in dev mode)* | Listener IP; dev mode accepts only loopback/private IPs |
| `FATSECRET_CLIENT_ID` | *(disabled)* | FatSecret API client ID |
| `FATSECRET_CLIENT_SECRET` | *(disabled)* | FatSecret API client secret |
| `MEALIE_BASE_URL` | *(disabled)* | Base URL of your Mealie instance (e.g. `http://mealie:9000`) |
| `MEALIE_API_KEY` | *(disabled)* | Mealie API key (****** |

> **Note:** If `MEALIE_BASE_URL` or `MEALIE_API_KEY` are not set the application still starts normally; the Mealie endpoints return `503 Service Unavailable` until both variables are provided.

---

## Mealie Integration (v1)

Allows searching recipes stored in a separately hosted [Mealie](https://mealie.io) container and importing them into cals.

### Reaching Mealie from cals

`cals` must be able to reach Mealie over the network. Set `MEALIE_BASE_URL` to an address the cals container can resolve and route to:

- **V2 Unraid template container** (`cals-dev-v2`, bridge network): use a routable address, typically the Unraid host IP — `MEALIE_BASE_URL=http://<unraid-host-ip>:9000`. Container-hostname resolution (`http://mealie:9000`) only works when both containers share a user-defined Docker network; if you want that, add `--network <name>` to `ExtraParams` on both containers.
- **Legacy V1 deployment** (the existing Compose setup, kept only for the current V1 server): both services sit on the same Compose network, so `MEALIE_BASE_URL=http://mealie:9000` works there as before.

In both cases `MEALIE_API_KEY` is the Mealie API key.

### Endpoints

All endpoints are protected by Cloudflare Access middleware.

### Recipes view behaviour

In the **Recipes** tab, the `Search recipes...` box now searches both:

- local cals recipes (shown under **In cals**)
- Mealie recipes (shown under **From Mealie** when you type a query)

Each Mealie result includes an **Import** button. Successful imports are added to cals immediately and shown in the local list without needing a page refresh.

#### Search Mealie recipes

```
GET /api/mealie/search?q=<query>
```

Returns a JSON array of matching recipes:

```json
[
  { "id": "abc123", "name": "Pasta Carbonara", "slug": "pasta-carbonara" }
]
```

#### Import a Mealie recipe

```
POST /api/mealie/import/{mealieRecipeId}
```

Fetches the full recipe from Mealie and creates it in cals. Returns `201 Created` with the new cals recipe JSON on success.

**v1 note:** All ingredient lines are imported as **text ingredients only** (stored in `recipe_text_ingredients`). No food matching against the cals foods table is performed. Nutrition totals will be zero until you manually link ingredients.

**Duplicate protection:** If a recipe with the same name (case-insensitive) already exists in cals the endpoint returns `409 Conflict`:

```json
{
  "error": "A recipe with this name already exists",
  "existing_id": 42
}
```
