# Local Development — `DEV_MODE` and a safe data copy

| Field | Value |
|---|---|
| **Status** | 🟢 **ADOPTED — implemented** |
| **Updated** | 2026-10-02 |
| **Decision owner** | @dougalbob |
| **Scope** | `cmd/server/main.go`, `internal/config/`, `internal/auth/`, tests and documentation. The Docker image and production deployment defaults are unchanged. |
| **Related** | [`frontend-strategy.md`](./frontend-strategy.md), [`../product/vision-and-open-questions.md`](../product/vision-and-open-questions.md) |

## The problem this solves

The app is behind Cloudflare Access. That is correct for production and painful for development:

- A local `localhost` request has no Cloudflare Access JWT, so protected routes return `401`.
- Testing against the real database means testing against **live data you care about**. A bad migration or a mis-clicked delete could cause real loss.
- Standing up a second, parallel deployment with its own Access policy and hostname adds avoidable moving parts.

The approach: **one codebase, the same app, and a separate copy of the data for development.** `DEV_MODE` supplies a fixed local identity only when the server is configured with a safe bind address and the request comes from a loopback or private IP.

## The workflow

```
Unraid appdata
├── cals/            ← production data. NEVER touched during development.
│   └── cals.db
└── cals-dev/        ← a copy, safe to break
    ├── cals.db
    └── .env
```

**1. Make a copy of the data (on Unraid, before any development work):**

```bash
# Stop the container first so the copy is consistent (SQLite WAL).
docker stop cals-counter
mkdir -p /mnt/user/appdata/cals-dev
cp -a /mnt/user/appdata/cals/. /mnt/user/appdata/cals-dev/
docker start cals-counter

# Confirm the copy is complete and readable
ls -l /mnt/user/appdata/cals-dev/cals.db
```

> **Important:** a SQLite database is not just `cals.db` — in WAL mode it may also have `-wal` and `-shm` companions. Copying the whole directory (as above, using `-a`) is why this instruction copies the directory rather than the single file.

**2. Run cals against the copy, locally, with authentication relaxed:**

```bash
DEV_MODE=true \
DEV_USER_EMAIL=you@example.com \
DB_PATH=/mnt/user/appdata/cals-dev/cals.db \
PORT=8150 \
go run ./cmd/server
```

`DEV_USER_EMAIL` selects which user's data the app sees; change it and restart to work as the other user. In `DEV_MODE`, `BIND_ADDRESS` defaults to `127.0.0.1`. You can set it explicitly if needed, but it must be a loopback or private IP address; public IPs, wildcard addresses and hostnames are rejected at startup. Choose a free `PORT` (for example `8151`) if the production server is already using `8150` on the same host.

| Variable | Production default | Development use |
|---|---|---|
| `DEV_MODE` | unset / `false` | Set to `true` to use local development auth |
| `DEV_USER_EMAIL` | unused | Required when `DEV_MODE=true`; the local identity, and the default when the identity switch is on |
| `DEV_IDENTITY_SWITCH` | unset / `false` | Optional: allow picking any **existing** user from `/dev/identity` or `?as=<email>`. Requires `DEV_MODE=true`; see [`dev-identity-switch.md`](./dev-identity-switch.md) |
| `PORT` | `8150` | Choose a free port if production is using the same host |

| `BIND_ADDRESS` | empty (listen on all interfaces, as before) | Defaults to `127.0.0.1`; if set, must be a loopback or private IP |
| `DB_PATH` | `/app/data/cals.db` | Point to the copied database, or mount `cals-dev` at `/app/data` |

For an Unraid development container, use a **separate template** that mounts `cals-dev`, never `cals`. The process bind address is inside the container: with bridge networking, set `BIND_ADDRESS` to the container's private IP and publish a different host port only on loopback (for example `127.0.0.1:8151:8150`, where the container listens on `PORT=8150`). Alternatively, use host networking with `BIND_ADDRESS=127.0.0.1` and a free `PORT` such as `8151`. Do not use a wildcard bind or the production port mapping for a development container. If you cannot verify both the container bind and host port mapping, use the local `go run` workflow above instead.

**3. Point the new frontend at it** (Phase 11 onwards):

```bash
cd web/frontend
VITE_API_TARGET=http://localhost:8150 npm run dev
```

If you chose a different local `PORT` (for example `8151`), use that port in `VITE_API_TARGET`.

**4. When development is finished and verified on the copy:** copy the code forward, run with `DEV_MODE` unset/false against the real appdata, and delete or archive `cals-dev` only when you are happy.

## What `DEV_MODE=true` does and does not do

| It **does** | It **does not** |
|---|---|
| Skip Cloudflare JWT validation for protected routes, subject to the bind and request-address checks below | Change production behaviour when unset or `false` |
| Use `DEV_USER_EMAIL` as the current user, so either real user's screens can be tested without an in-app login page | Select or copy a database automatically — `DB_PATH` / the mounted data directory still matters |
| Auto-create the local user on first request, as production does | Change the schema or disable FatSecret, Mealie or Google Fit; unconfigured integrations keep their existing behaviour |
| Log a prominent warning on every start, including the database path and listener address | Make an internet-exposed or proxied development server safe to use |

## Safety design

`DEV_MODE=true` relaxes authentication. It is opt-in and fails closed:

1. **Bind-address guard.** With no `BIND_ADDRESS`, the server binds to `127.0.0.1`. If set explicitly, the value must be a literal loopback or private IP. Wildcards such as `0.0.0.0` / `::`, public IPs, and hostnames are rejected before the database is opened.
2. **Request-address guard.** The bypass is honoured only when the socket peer (`RemoteAddr`) is loopback or private: IPv4 loopback/RFC1918 and IPv6 loopback/ULA. Public or malformed peer addresses receive `401`. The middleware does **not** trust `X-Forwarded-For` or other proxy headers.
3. **No public proxy/tunnel.** Do not put a dev-mode server behind Cloudflare Tunnel or another public reverse proxy. Its local/private connection to the app could pass the peer-address guard even when the original client is remote.
4. **Required identity and banner.** Startup fails if `DEV_MODE` is invalid or `DEV_USER_EMAIL` is missing/invalid. Every successful dev-mode start logs:

   ```text
   ⚠️  DEV_MODE ENABLED — Cloudflare Access is DISABLED for loopback/private requests
   ⚠️  Database: /path/to/cals-dev/cals.db
   ⚠️  Listen address: 127.0.0.1:8150
   ```

5. **Production default is unchanged.** An unset or false `DEV_MODE` uses Cloudflare JWT validation and the existing all-interface listener by default.
6. **The identity switch is a second, independent opt-in.** `DEV_IDENTITY_SWITCH=true` is rejected unless `DEV_MODE=true`, reuses the same loopback/private peer guard (proxy headers are still ignored), and can only select users that already exist — it never creates one. A production or Cloudflare-routed deployment never sets either flag, so `/dev/identity` does not exist there.

## Verification

Verified in the Arena sandbox (the helper installs Go 1.27 in `/tmp`; Docker is unavailable there):

- `./scripts/verify-go-in-sandbox.sh` builds `./cmd/server`; `go test ./...` and `go vet ./...` pass.
- Against a fresh temporary database, `/api/users/me` returns `200` with the configured dev user's email, and the startup banner reports the DB path and loopback listener.
- `DEV_MODE=true` with `BIND_ADDRESS=0.0.0.0` fails before creating/opening the database.
- With `DEV_MODE=false`, `/api/users/me` and `/api/debug/fatsecret` return `401` without a Cloudflare token; `/health` remains public.
- Unit tests cover public-peer denial (including a spoofed `X-Forwarded-For`), private/loopback acceptance, per-user identity, configuration validation, and the production listener default.

`docker build` still needs to be checked on a machine with Docker. This is the first standalone backend change in the frontend rebuild plan; it does not change the database schema or production authentication behavior for existing routes.

## Remaining operational choice

Use a **second Unraid template** for development so it is difficult to point the dev container at production appdata. Note the distinction: the `cals-dev-v2.xml` template in the repository is the V2 development *image* deployment (appdata `/mnt/user/appdata/cals-dev-v2`) — it is not a `DEV_MODE` development container. A `DEV_MODE` container still needs its own template configured with the bind and port mapping described above, mounting a `cals-dev` data copy, never `cals`.

**Done (2026-10-02):** that second template now exists —
[`cals-dev-identity.xml`](../../cals-dev-identity.xml) creates the LAN-only
`cals-dev-identity` container (host networking, `BIND_ADDRESS` = the Unraid LAN IP,
`PORT=8152`, its own `cals-dev-identity` appdata copy) and enables the
**DEV identity switch**, so either user can be selected from a browser at
`/dev/identity` without editing variables or restarting. See
[`dev-identity-switch.md`](./dev-identity-switch.md).

> ⚠️ **Before making a new data copy, read [`data-copy-warning.md`](./data-copy-warning.md).**
> As of 2026-10-02 the Cloudflare-routed V2 container runs on a database copy taken that
> morning, and the household's new entries are being written to
> `/mnt/user/appdata/cals-dev-v2` — it is **live data**, not a scratch copy. Only the
> `cals-dev-identity` directory is disposable.
