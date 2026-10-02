# Local Development — `DEV_MODE` and a safe data copy

| Field | Value |
|---|---|
| **Status** | 🟡 **PROPOSED** — approach agreed with the owner on 2026-10-02; not yet implemented |
| **Date** | 2026-10-02 |
| **Decision owner** | @dougalbob |
| **Scope** | A small, deliberate change to `cmd/server/main.go`, the Dockerfile, and the Unraid template. **The only backend change currently proposed** |
| **Related** | [`frontend-strategy.md`](./frontend-strategy.md), [`../product/vision-and-open-questions.md`](../product/vision-and-open-questions.md) |

## The problem this solves

The app is behind Cloudflare Access. That is correct for production and painful for development:

- Any page or API call from `localhost` is rejected, because the signed `CF_Authorization` cookie belongs to `cals.duncandoes.uk`. Running `go run ./cmd/server` locally gives you `401` on everything except `/health`, `/api/version` and `/public/*` — verified in this repo's sandbox, where the real server returns exactly that.
- Testing against the real database means testing against **live data you care about**. A bad migration or a mis-clicked delete is then a real loss.
- Standing up a second, parallel "cals v2" deployment (second container, second hostname, second Access policy, second certificate) is — as you put it — cumbersome, and it drifts from the real thing.

The approach proven on the other project, adapted here: **one codebase, one container, one hostname, with a `DEV_MODE` switch and a copy of the data.**

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
cp -a /mnt/user/appdata/cals/. /mnt/user/appdata/cals-dev/
docker start cals-counter

# Confirm the copy is complete and readable
ls -l /mnt/user/appdata/cals-dev/cals.db
```

> **Important:** a SQLite database is not just `cals.db` — in WAL mode it may also have `-wal` and `-shm` companions. Copying the whole directory (as above, using `-a`) is why this instruction says `cp -a /mnt/user/appdata/cals/.` rather than copying the single file.

**2. Run cals against the copy, locally, with authentication relaxed:**

```bash
DEV_MODE=true \
DB_PATH=/mnt/user/appdata/cals-dev/cals.db \
PORT=8150 \
go run ./cmd/server
```

Or in Docker with an Unraid template variable:

| Unraid template variable | Production value | Development value |
|---|---|---|
| `DEV_MODE` | *(unset / `false`)* | `true` |
| `DB_PATH` | `/app/data/cals.db` | `/app/data/cals.db` (with the **dev** appdata path mounted) |
| Container path | `/mnt/user/appdata/cals` → `/app/data` | `/mnt/user/appdata/cals-dev` → `/app/data` |

Note the last row: the cleanest Unraid approach is a **second template that mounts `cals-dev`** rather than changing `DB_PATH`. Same image, same port, different data. That keeps the production container's configuration untouched.

**3. Point the new frontend at it** (Phase 11 onwards):

```bash
cd web/frontend
VITE_API_TARGET=http://localhost:8150 npm run dev
```

**4. When the refactoring is finished and verified on the copy:** copy the code forward, run with `DEV_MODE` unset/implicit-false against the real appdata, and delete or archive `cals-dev` when you are happy.

## What `DEV_MODE=true` should and should not do

Proposed behaviour, deliberately conservative:

| It **does** | It **does not** |
|---|---|
| Skip Cloudflare JWT validation and act as a fixed local user | Change anything about production behaviour when unset |
| Work out "who am I" from a `DEV_USER_EMAIL` env var, so you can develop as **either of the two real users** (there is no in-app login page — identity always comes from outside) | Bypass anything on a publicly reachable bind address (see safety below) |
| Log a loud, unmissable warning at startup (`⚠️ DEV_MODE — Cloudflare Access is DISABLED`) | Touch the database schema differently, or move any data automatically |
| Make the local user auto-created on first request, exactly as production does | Reach out to Cloudflare, FatSecret, Mealie or Google Fit any differently |

### Safety design (the part that actually matters)

`DEV_MODE=true` disables authentication, so it must be **impossible to enable by accident on a public host**:

1. **Bind-address guard.** If `DEV_MODE=true` and the server is not bound to a loopback/private address, **refuse to start** with a clear error. Rationale: an Access-bypassing server must never be reachable from the internet, even briefly. In Docker you would bind `127.0.0.1:8150:8150` for dev.
2. **Request-address guard.** Even in dev mode, only honour the bypass for requests whose `RemoteAddr` is loopback or private (`127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `::1`). Anything else gets the normal `401`.
3. **Startup banner.** Log the warning on every single start, not just once, and include the data path so it is obvious which database is in play:

   ```
   ⚠️  DEV_MODE ENABLED — Cloudflare Access is DISABLED for loopback/private requests
   ⚠️  Database: /app/data/cals.db
   ```
4. **Loud documentation.** This file, `AGENTS.md`, and the Unraid template description all say the same thing: never enable on a public bind.
5. **No production default change.** `getEnv("DEV_MODE", "")` — absent means production behaviour, so an existing deployment cannot be affected by upgrading the image.

### Why this is safer than the alternative

The alternative — a separate "dev" deployment with its own Access policy and hostname — has *more* moving parts and a subtler failure mode: it is very easy to end up with the dev instance pointing at production data after a config copy/paste. One switch, one guard, one copy of the data is easier to reason about and to verify.

## Impact on the rebuild

- **This is the one backend change proposed in the whole plan.** It is small (~40 lines in `cmd/server/main.go` plus a Dockerfile/Unraid note), self-contained, and justified because every phase after 11 depends on being able to run the real server locally against real-shaped data.
- It also unlocks the PWA and camera/image-upload work, which cannot be tested meaningfully against fixtures.
- It should be **Phase 11** of the frontend migration, or done immediately as a standalone PR — whichever you prefer. It does not depend on any frontend work.
- Verification is honest and bounded: `/api/users/me` returns `200` with the dev user from loopback, returns `401` from a non-private address, and the server refuses to start if `DEV_MODE=true` is combined with a public bind.

## Open questions

1. **`DEV_USER_EMAIL` — now the most important part of dev mode.** There are two real users (you and your wife) and identity comes from Cloudflare Access with no in-app login, so dev mode is the *only* way to see a given person's screens locally. It should let you switch between them easily (an env var you restart with, or a dev-only switcher in the UI). Note this means "pretending to be your wife" locally — which is exactly why dev mode must never be reachable off the machine (see the safety design above).
2. **Should `DEV_MODE` also skip the FatSecret/Mealie/Google Fit integrations** when credentials are missing, or leave them returning `503` as now? (Current behaviour is already graceful, so probably leave it.)
3. **Where should this live in the plan** — a standalone PR now, or Phase 11 with the frontend foundation?
4. **Second Unraid template, or the same template with a variable changed by hand?** (The second template is safer: it makes it very hard to point dev work at the production appdata path by mistake.)
