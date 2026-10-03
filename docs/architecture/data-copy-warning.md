# Data Copy Warning — read before touching appdata or the database

| Field | Value |
|---|---|
| **Status** | 🟢 **ADOPTED operational warning — read before any migration, backup, copy or container change** |
| **Raised** | 2026-10-02 |
| **Decision owner** | @dougalbob |
| **Related** | [`unraid-image-release.md`](./unraid-image-release.md), [`local-development.md`](./local-development.md), [`dev-identity-switch.md`](./dev-identity-switch.md), [`../../AGENTS.md`](../../AGENTS.md) |

## What happened

On **2026-10-02** the V2 container (`cals-dev-v2`, host port `8151`) was started from a
**copy of the database taken that morning**, and the Cloudflare route was then pointed at
`8151`. V2 is now the app the household sees.

That has a consequence that is easy to miss:

> **The data the household enters now lands in `/mnt/user/appdata/cals-dev-v2/cals.db`,
> not in the V1 database at `/mnt/user/appdata/cals/cals.db`. The two have been diverging
> since the moment of the copy.**

Neither database is a backup of the other. V2's started life as a copy, but it is now
**live data**: it may not be deleted, reset, overwritten from V1, or used as a scratch copy
for development. The old assumption in the development documentation — that the
`cals-dev*` appdata directories are disposable — is only true for copies made *after* this
warning, and never for `cals-dev-v2` as it stands today.

## Which database is which (as of 2026-10-02)

| Container | Port | Appdata (`cals.db`) | What it is |
|---|---|---|---|
| `cals-counter` (V1) | 8150 | `/mnt/user/appdata/cals` | Production V1, still running. **Stale**: it stopped receiving the household's new entries when the Cloudflare route moved |
| `cals-dev-v2` (V2) | 8151 | `/mnt/user/appdata/cals-dev-v2` | **The household's live app since 2026-10-02.** Started from the morning copy; holds all data entered since |
| `cals-dev-identity` (dev) | 8152, LAN only | `/mnt/user/appdata/cals-dev-identity` | Disposable copy for the DEV identity switch. Safe to break. Never point it at the two live appdata directories |

> **Open owner decision:** which database is canonical going forward? If V2 is the
> household app, V1's copy should be treated as an archive and the divergence should stop
> being possible (one writer, one database). Until that is decided, do not "reconcile" the
> two by copying either over the other.

## Rules

1. **Do not copy over live appdata.** Never run a copy *from* a development directory *to*
   a live one, and never point a new container at an existing live appdata directory.
2. **Copy with the container stopped.** SQLite runs in WAL mode, so a database is the
   directory (`cals.db`, `-wal`, `-shm`) — stop the source container, `cp -a` the whole
   directory, start it again. A copy taken from a running container can be inconsistent.
3. **A copy is not a backup.** Keep a real backup (e.g. Unraid's appdata backup) separate
   from these directories, and check that it exists before any structural change.
   **Confirmed by the owner on 2026-10-03 (decision 54): a backup exists.** Its location and cadence
   are not yet recorded here — a future session should write them down so nobody has to ask again,
   and should verify a restore has been tried at least once.
4. **The dev container is the only container allowed to lose data.** Anything entered at
   `8152` is expected to be thrown away.
5. **Migrations must assume V2's data is real.** Additive migrations only (see
   [`../../AGENTS.md`](../../AGENTS.md)); no drops or rewrites, and test against a copy.
6. **Check before you act.** `docker inspect <name> --format '{{json .Mounts}}'` (or the
   Unraid UI) shows which host directory a container actually mounts. Confirm it is the one
   you think it is before deleting, migrating or restoring anything.

## What the codebase does to help

- Migrations are additive, tolerate "duplicate column"/"already exists", and never drop a
  table or rewrite user data (`internal/database/migrations.go`).
- `DEV_MODE` refuses wildcard/public binds and only bypasses auth for loopback/private
  peers, so a development container cannot accidentally serve the LAN/internet
  ([`local-development.md`](./local-development.md)).
- The dev identity container has its own template (`cals-dev-identity.xml`) and a
  differently-named appdata directory, so it cannot be confused with either live one
  ([`dev-identity-switch.md`](./dev-identity-switch.md)).
- The app version is visible at `GET /api/version` and in the UI footer, and image tags
  identify each checkpoint, so you can tell which build wrote a database.

## History

- 2026-10-02: V2 installed, data copied that morning, Cloudflare route moved to `8151`.
  This document created the same day because no record of the copy existed anywhere in
  `docs/`.
