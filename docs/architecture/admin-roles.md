# Admin roles — declaring who may act as whom

| Field | Value |
|---|---|
| **Status** | 🟡 **Partially implemented.** Role declaration, the `users.is_admin` column, start-up reconciliation and the Admin-only account list are built; the in-app **Swap user** control is not. Current status lives in [`../CURRENT_STATE.md`](../CURRENT_STATE.md) |
| **Date raised** | 2026-10-03 (decision 45); mechanism settled 2026-10-04 (decision 89) |
| **Decision owner** | @dougalbob |
| **Scope** | `internal/config/` (role lists), `internal/handlers/roles.go` (reconciliation and authorization), `internal/database/migrations.go` (the `users.is_admin` column), `cmd/server/main.go` (start-up application and logging) |
| **Related** | [`dev-identity-switch.md`](./dev-identity-switch.md) (the *development* identity picker — a different feature), [`local-development.md`](./local-development.md) (`DEV_MODE`), [`../product/vision-and-open-questions.md`](../product/vision-and-open-questions.md) (decisions 45, 88, 89) |

---

## 1. The problem

The owner has almost no data under his own profile, so he cannot tell how the app is behaving without
borrowing his wife's phone. His wife has no corresponding need to see his day. The answer is an
**Admin role**: a deliberate, server-validated switch that lets an authenticated Admin act as another
existing household account, with the app making it unmistakable whose data is on screen.

## 2. The model: Cloudflare authenticates, cals authorizes

| Concern | Owner | Notes |
|---|---|---|
| *Who are you?* | **Cloudflare Access** | Unchanged. There is no login page and the rebuild must not add one. Both household emails must be permitted by the Access policy |
| *What may you do?* | **cals** | The Admin/Standard role. It is an application authorization, never a second login system |

The role grants **full read/write** while acting as the other person (decision 45): entries written
while swapped belong to the person being acted as, exactly as if they had logged them. There is no
read-only mode and no second data model.

## 3. Declaring the roles — `ADMIN_EMAILS` / `STANDARD_EMAILS`

Roles are declared **in configuration, not in code**. They live in the appdata `.env` the server
already reads (`/app/data/.env` → `/mnt/user/appdata/cals-dev-v2/.env` on Unraid), so no personal
email address is ever committed to a public repository.

```dotenv
# /app/data/.env — one line per role, commas between addresses
ADMIN_EMAILS=me@example.com
STANDARD_EMAILS=mywife@example.com
```

| Variable | Default | Meaning |
|---|---|---|
| `ADMIN_EMAILS` | *unset* | Comma-separated addresses that hold the **Admin** role. Unset means *roles are not configured* and the feature stays inert |
| `STANDARD_EMAILS` | *unset* | Comma-separated addresses documented as **Standard**. Optional: Standard is what every account already is, so the list is documentation and a typo check, not a grant |

Rules, all enforced in `internal/config/config.go` before the database is opened:

1. Every entry must be a **syntactically valid** email address. A malformed entry is a start-up
   **failure**, not a warning — a typo that silently grants nothing is worse than a container that
   will not start.
2. Addresses are **lower-cased and trimmed**, matching how every other identity in the app is
   normalized (the Cloudflare JWT email, `DEV_USER_EMAIL`).
3. Blank entries (a trailing comma) and duplicates are ignored.
4. An address in **both** lists is a configuration error. An account can only hold one role.
5. Real environment variables still take precedence over the `.env` file, exactly as they do for
   `DEV_MODE` and the other settings.

### Why not `ADMIN` / `USER`?

The owner's first sketch was `ADMIN=…` / `USER=…`. `USER` is a standard shell variable (usually
`USER=root` in a container), and because real environment variables win over `.env` values, a
`USER=wife@example.com` line would be read back as `root` and silently ignored. `ADMIN_EMAILS` is
also self-describing and plural, so a third household member needs no rename. `CALS_ADMIN_EMAILS`
was considered and rejected: nothing else in this repo is namespaced (`DEV_MODE`, `DB_PATH`,
`CF_TEAM_DOMAIN`), so a prefix would be inconsistent for no gain.

## 4. How the declaration reaches the database

The lists are the **declared source of truth**; `users.is_admin` (additive, `NOT NULL DEFAULT 0`) is
the runtime copy the handlers read. Reconciliation happens in `internal/handlers/roles.go`:

| When | What happens |
|---|---|
| **Start-up**, after migrations | Every declared Admin is granted; **everybody else is set to Standard**. An account that is no longer listed loses the role — that is the revocation path |
| **Account creation** | A brand-new account takes the role its address is declared to hold, so the Admin's very first sign-in already has it rather than waiting for a restart |
| **Never** | The role lists do not create accounts. An address that has not signed in yet is reported in the start-up log as *configured but has no account yet* — inventing a user for a typo would be worse than a missing one |

The start-up log states exactly what happened, because a misspelled address is otherwise invisible:

```
Roles: Admin: me@example.com
Roles: Standard: mywife@example.com
Roles: granted Admin to me@example.com
Roles: revoked Admin from old@example.com (no longer listed in ADMIN_EMAILS)
Roles: me@example.com is configured but has no account yet; the role applies on first sign-in
```

**Operational rule: edit `.env`, then restart the container.** The reconciler is idempotent, so
restarting repeatedly changes nothing after the first pass.

If `ADMIN_EMAILS` is unset the database is deliberately left untouched: the Admin capability must be
opted into, never drifted into.

## 5. What the role gates

| Capability | Standard | Admin |
|---|---|---|
| Own diary, goals, recipes, bank, settings | ✅ | ✅ |
| `GET /api/users` (the account list) | ❌ `403` | ✅ |
| Swap the acting user | ❌ | ✅ *(not built yet)* |

`GET /api/users` was previously answered for **any** authenticated request, which exposed both
household email addresses for no product reason. It is now Admin-only. Nothing in either UI called it,
so no screen changed.

## 6. Security notes

- The role is read from the database server-side on every request that needs it. The client cannot
  claim a role: `is_admin` is a response field, never an accepted input, and no endpoint accepts it.
- Revocation is config-driven. Remove an address from `ADMIN_EMAILS` and restart; the next start-up
  demotes that account and says so in the log.
- The Admin switch is an **authorization** change inside an already-authenticated session. Cloudflare
  still decides who may reach the app at all, and `DEV_MODE` / `DEV_IDENTITY_SWITCH` remain
  development-only, LAN-restricted conveniences — they are not the production feature and must never
  be enabled on the Cloudflare-routed container.
- Audit trail: decision 45 leans on a **log line plus honest diary timestamps** for a two-person
  household rather than an "entered by" column, which would be a storage change. The swap work will
  log every switch.

## 7. Not built yet

- The **acting-user switch** itself: a server-side session cookie validated on every request, an
  Admin-only endpoint to set and clear it, and the persistent "Viewing as …" indicator with a way
  back to the Admin's own account.
- Authorization for the switch must read the **authenticated** identity, not the acting one, so an
  Admin who is viewing another account can still list accounts and swap back.
- Whether the non-admin user is ever told that an Admin edited their data (leaning: no).

`GET /api/users` is the list the switch UI will use, so it became Admin-only first.
