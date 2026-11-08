# DEV Identity Switch — pick a user from the browser during development

| Field | Value |
|---|---|
| **Status** | 🟢 **ADOPTED — implemented** (config, middleware, page and tests on `cals-dev`) |
| **Updated** | 2026-10-02 |
| **Decision owner** | @dougalbob |
| **Scope** | `internal/config/`, `internal/auth/`, `internal/handlers/devidentity.go`, `cmd/server/main.go`, the dev Unraid template `cals-dev-identity.xml`. Production behaviour is unchanged when the flag is unset. |
| **Related** | [`local-development.md`](./local-development.md) (DEV_MODE), [`data-copy-warning.md`](./data-copy-warning.md) (the data in the dev container), [`unraid-image-release.md`](./unraid-image-release.md) (the Cloudflare-routed V2 container) |

## The problem

`DEV_MODE` supplies one fixed identity (`DEV_USER_EMAIL`). Testing as the other
person therefore meant editing a variable and restarting the container — slow,
and easy to forget which identity you were looking at. The product's primary
user's flows (daily logging, water) have to be checked as **her**, and the
household is two users, so switching back and forth is a daily need during
Phase 12.

## The design

An **opt-in** switch, on top of `DEV_MODE`:

| Variable | Default | Meaning |
|---|---|---|
| `DEV_IDENTITY_SWITCH` | `false` | Allow the selected identity to be changed from the browser. **Requires `DEV_MODE=true`**; loading the config fails otherwise. |
| `DEV_USER_EMAIL` | — | Still required in `DEV_MODE`; it becomes the **default** identity used when no choice is remembered. |

Two ways to switch, both only for loopback/private socket peers:

1. **`?as=<email>` on any URL.** The middleware validates that the email belongs to an
   existing user, stores it in a cookie, and redirects (303) to the same URL without the
   parameter. `?as=` with an empty value clears the choice and returns to the default.
2. **`/dev/identity`** — a minimal, phone-friendly page listing the users that already
   exist in that database, with the current identity marked and a link to clear it. It
   exists only while `DEV_IDENTITY_SWITCH=true`.

The remembered identity lives in an `HttpOnly`, `SameSite=Lax` cookie named
`cals_dev_identity` for 12 hours, per browser. Nothing is written to the database by the
switch itself.

### Where to find the picker

The picker is a separate development page, not a dropdown inside the diary. The bare
`http://<unraid-lan-ip>:8152/` address opens the normal cals app; use
`http://<unraid-lan-ip>:8152/dev/identity` to choose an account. The Unraid template's
**WebUI** shortcut points directly to the picker. Builds with the in-app convenience link
also show **Switch user** in the app header, but the direct URL remains available in every
build with the switch enabled. After choosing, select **Open cals** on the picker or use
`/` for the React Diary.

If the picker says no users were found, it is reading an empty `users` table from this
container's mounted database. The picker never creates users. Confirm the container is using
the disposable database copy described below; a brand-new dev database creates only the
configured default account after the normal app is opened once, while other accounts must
already exist in the copy. Never point this container at V1 or live V2 appdata.

### Hard constraints (all enforced in code and covered by tests)

| Constraint | How it is enforced |
|---|---|
| Opt-in, and only with `DEV_MODE` | `config.Load()` errors on `DEV_IDENTITY_SWITCH=true` without `DEV_MODE=true`, before the database is opened |
| Never on the Cloudflare-routed container | The household container (`cals-dev-v2`) runs with `DEV_MODE` unset/false, so the switch cannot activate there; `DEV_MODE` additionally requires a loopback/private `BIND_ADDRESS` and refuses wildcard/public binds |
| Loopback/private peers only | Requests are checked against `netip.ParseAddrPort(r.RemoteAddr)` — the same guard as `DEV_MODE`; `X-Forwarded-For` and other proxy headers are ignored, and non-private peers get `401` |
| Existing users only | `UserExistsByEmail` looks the email up in `users`; the switch never creates a user (unlike the normal request path). Unknown emails get `400` and no cookie |
| No in-app login page | The page is an identity *picker for development*, not authentication: it lists existing users only, and it cannot be reached in production (see above) |

The picker page is wrapped in the same dev-mode middleware as the API, so it also
returns `401` to non-private peers. When the switch is off, the route is not registered at
all (the SPA fallback serves the normal app shell).

## The LAN-only dev container recipe

`DEV_MODE` rejects `0.0.0.0` and requires a **private** `BIND_ADDRESS`. A bridge container
therefore cannot publish a port: the published address is the container's private IP, but
the host side of a `-p`/Unraid port mapping is not the peer address the server sees — and
the container's own bind must be private, which a bridge container's address is. The
working recipe is **host networking**, binding the Unraid LAN IP on a spare port, with its
own copy of the data:

| Setting | Value |
|---|---|
| Template | [`cals-dev-identity.xml`](../../cals-dev-identity.xml) (repository root, ready to import) |
| Container name | `cals-dev-identity` |
| Image | `ghcr.io/dougalbob/cals-dev-v2:dev-latest` (the same image as the Cloudflare-routed container) |
| Network | **host** (required — no port mapping) |
| `PORT` | `8152` (V1 is 8150, the Cloudflare-routed V2 is 8151) |
| `BIND_ADDRESS` | the Unraid **LAN IP**, e.g. `192.168.1.10` — not `0.0.0.0`, not public |
| `DEV_MODE` | `true` |
| `DEV_IDENTITY_SWITCH` | `true` |
| `DEV_USER_EMAIL` | either user's email (the default identity) |
| Appdata | `/mnt/user/appdata/cals-dev-identity` → `/app/data`, **a copy of the database** |
| Reachability | `http://<unraid-lan-ip>:8152/dev/identity` — LAN only, never through Cloudflare Tunnel |

The appdata directory must be created and populated **before** first start:

```bash
# On Unraid. Stop the container you are copying from so SQLite WAL is consistent.
docker stop cals-dev-v2
mkdir -p /mnt/user/appdata/cals-dev-identity
cp -a /mnt/user/appdata/cals-dev-v2/. /mnt/user/appdata/cals-dev-identity/
docker start cals-dev-v2

# A SQLite database is the directory, not one file: -wal and -shm must come too.
ls -l /mnt/user/appdata/cals-dev-identity/cals.db
```

> **Never point this container at `/mnt/user/appdata/cals` (V1) or
> `/mnt/user/appdata/cals-dev-v2` (the Cloudflare-routed V2).** It is a disposable copy and
> the only container where the data may be broken. See
> [`data-copy-warning.md`](./data-copy-warning.md) — since 2026-10-02 the V2 appdata holds
> live household data, not a scratch copy.

Unlike the Cloudflare-routed container, this one can be opened directly at
`http://<unraid-lan-ip>:8152/` (the React app) or `/legacy/` (the legacy UI) with no
Cloudflare session, because `DEV_MODE` supplies the identity. That is exactly why it must
stay on the LAN.

## Verification (2026-10-02, Arena sandbox, real server)

Built with the sandbox toolchain (`scripts/verify-go-in-sandbox.sh`), then:

- `go vet ./...` and `go test ./...` pass, including new tests for config validation,
  middleware behaviour and the picker page.
- Two users created in a temporary database; with `DEV_IDENTITY_SWITCH=true`:
  - `/api/users/me` returned the `DEV_USER_EMAIL` default;
  - `GET /dev/identity?as=wife@example.com` returned `303` to `/dev/identity` and set the
    `cals_dev_identity=wife@example.com` cookie;
  - `/api/users/me` with that cookie returned `wife@example.com`;
  - `?as=ghost@example.com` returned `400` and set no cookie;
  - `?as=` (empty) cleared the cookie and returned to the default;
  - the startup banner reported the switch and the default identity.
- With `DEV_IDENTITY_SWITCH` off, `/dev/identity` is not registered (the SPA shell is
  served instead) and the switch is inert.
- Public-peer rejection and proxy-header distrust are unit-tested (they cannot be produced
  reliably from inside the sandbox).

`docker build` is unchanged by this feature and is still verified by the
`Docker build (validation)` workflow on the PR.

## Alternatives rejected

| Option | Why not |
|---|---|
| Keep editing `DEV_USER_EMAIL` and restarting | The status quo; slow and error-prone, and the reason this feature exists |
| An in-app login page | Rejected by the product decisions (Cloudflare Access owns identity; the rebuild must not add a login) — this is a development-only picker, never registered in production |
| `?as=` without a cookie | Identity would be lost on every navigation; the cookie makes the choice stick for a normal browsing session |
| Auto-create the requested user | Decision 8's "no invented users/data" spirit; a typo would silently create a user. Existing users only |
| Trusting `X-Forwarded-For` for the peer check | Would let a public reverse proxy forward a private address and bypass the guard; `RemoteAddr` only |
| Allowing the switch whenever `DEV_MODE` is on | The switch exposes other people's data in the dev database; it stays a separate opt-in |

## Open questions

- If the switch proves useful, should the picker page also show each user's calorie/water
  targets (read-only) to make it obvious which account is selected? Not needed yet.
- The dev container tracks `dev-latest`. If that becomes noisy, pin it to an exact RC tag
  in `cals-dev-identity.xml`.
