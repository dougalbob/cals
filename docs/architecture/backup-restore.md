# Backup and restore — in-app safety net

| Field | Value |
|---|---|
| **Status** | 🟢 Adopted (built 2026-11-08, first RC pending) |
| **Owner questions answered** | 1) database + photos together · 2) Admin only · 3) automatic daily, keep 7 · 4) download and upload |
| **Related** | [`CURRENT_STATE.md`](../CURRENT_STATE.md), [`data-copy-warning.md`](./data-copy-warning.md), [`admin-roles.md`](./admin-roles.md), [`unraid-image-release.md`](./unraid-image-release.md) |

## What it does

A **Backups** section on the Settings screen (visible to the Admin account only) lets the owner:

- Tap **Back up now** to take a live, WAL-safe snapshot of the diary database and every recipe photo into one `.zip` file.
- See a list of all backups already saved, with the date, size, and whether each was taken manually, automatically each day, or as a safety copy just before a restore.
- **Download** a backup to their phone or computer.
- **Delete** an old backup.
- **Restore** either a backup already on the server or one uploaded from their device. Restoring always saves a **before-restore** safety copy first, so the family can undo the restore immediately.

The app also takes one **automatic daily backup** at startup if none exists for that day, and keeps the most recent 7 automatic backups. Manual backups and before-restore backups are kept until the Admin deletes them.

## Where backups live

Backups are written to **`/app/data/backups/`** inside the container, which Unraid mounts at `/mnt/user/appdata/cals-dev-identity/backups/`. That means:

- The existing Unraid appdata backup already covers every backup cals creates. There is nothing extra for the owner to set up.
- Backups are stored **inside** the appdata volume, never outside it.
- The backup file is `cals-YYYYMMDD-HHMMSS.zip` (manual), `cals-auto-…zip` (daily automatic), or `cals-before-restore-…zip` (safety copy).

## What is in a backup zip

Each file contains three things, rooted at the top of the zip:

| Entry | Contents |
|---|---|
| `cals-backup.json` | Metadata — which version of cals wrote the backup, when, and whether it is manual/auto/before-restore. |
| `cals.db` | A self-contained SQLite database snapshot (no `-wal`/`-shm` sidecars needed — the snapshot is taken with `VACUUM INTO`, which guarantees a consistent, closed database). |
| `images/recipes/*` | Every recipe photo file (the original and the thumbnail for each recipe). |

A backup can be unzipped by hand with any standard ZIP tool — there is no proprietary wrapping.

## Safety guarantees

Backups and restores have to be safe because they touch every family member's diary at once. These are the rules the code follows:

**Backups (safe by construction):**

- The database snapshot is taken with **`VACUUM INTO '<tmp>'`**, the SQLite-recommended way to take a consistent copy of a live WAL-mode database. The app keeps running and the family can keep logging food while the backup runs.
- The snapshot is opened in read-only mode and **`PRAGMA integrity_check`**, **`PRAGMA foreign_key_check`** and a check for every expected table are run against it before it is zipped. A broken snapshot never becomes a visible backup.
- The zip is built in a temp file and **renamed atomically** into the backups folder, so a partially-written backup never appears in the list.

**Restores (the riskier half):**

- Only the **Admin** account can reach restore (and download, delete, list); this is enforced server-side, not just hidden in the UI.
- Uploads are capped at **200 MiB** and rejected if they are not a valid cals zip (missing metadata, missing `cals.db`, zip-slip paths, non-SQLite content, integrity failures, foreign-key violations, missing tables, or from a newer schema version are all refused before any live data is touched).
- A restore **always creates a `cals-before-restore-…zip` first**. If the restore fails for any reason, that file is there to roll back to.
- During a restore, other write requests are briefly paused (they get a **503 Retry-After: 5** so the mobile app can retry). The restore:
  1. Takes the before-restore safety backup.
  2. Extracts and validates the candidate backup in a temporary staging directory.
  3. Closes the live database pool (waits for in-flight requests to finish), replaces `cals.db` with the staged file, removes stale `-wal`/`-shm` sidecars, and reopens.
  4. Runs the normal **additive migrations** so an older backup gains any newer columns added since the backup was taken.
  5. Swaps the recipe images directory atomically (old directory is moved aside, the staged images are moved into place).
- The UI uses two-step confirmation:
  - Server-file restore: the Admin must type **`REPLACE ALL DATA`** into a confirmation box.
  - Uploaded-file restore: a browser `prompt()` asks the Admin to type **`RESTORE`** before the upload is sent.
- After a restore completes the page reloads so the React query cache can't show stale data.

A restore is typically over in a small number of seconds for a normal-sized household database.

## What a restore does NOT do

- It does not merge — every diary entry, food, drink, weight, measurement, recipe and photo is replaced by the backup's contents.
- It does not touch anything outside `/app/data` (the database and `/app/data/images/recipes`).
- It does not change settings in `/app/data/.env` (roles, Cloudflare, FatSecret credentials).
- It does not downgrade the cals binary. Restoring an older backup into a newer cals is fine (migrations run additively), but going the other way — running an older cals binary against a newer backup — is refused.

## Recovery steps if the worst happens

If something looks wrong after a restore:

1. Stay on the Settings screen — the **first** `cals-before-restore-YYYYMMDD-HHMMSS.zip` in the list is the safety copy taken just before the restore.
2. Tap **Restore** on that file. That puts the database and photos back exactly as they were the instant before the restore started.
3. If the app is not reachable at all (worst case), copy any `cals-…zip` from `/mnt/user/appdata/cals-dev-identity/backups/` to a safe location before doing anything else. The container can be restarted; the backups folder is untouched by a Force Update.

## Operational notes

- A daily automatic backup is taken at container startup if none exists for the current UTC day. It is best-effort: if the backup fails the container still starts and the error is logged.
- Automatic backups are pruned to the most recent **7** at startup and after each new automatic backup. Manual and before-restore backups are never pruned automatically.
- If the owner ever manually downloads a backup, that file is a normal ZIP on their device and can be re-uploaded through the same screen — it is not tied to one installation of cals.

## Decisions recorded here

These owner questions were answered before building, per the handoff:

| # | Decision |
|---|---|
| Photos | Database **and** recipe photos are bundled in one zip. A restore always puts photos back exactly as they were. |
| Who | **Admin only** (the owner). Enforced server-side. |
| Automatic | **Daily automatic** + keep last 7. Manual on top. |
| Download/upload | **Both** supported. Uploads capped at 200 MiB and validated. |
