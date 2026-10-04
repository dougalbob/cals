# Admin roles — declaring who may act as whom

| Field | Value |
|---|---|
| **Status** | 🟢 **Implemented.** Role declaration, the `users.is_admin` column, start-up reconciliation, the Admin-only account list, the server-side acting-user switch and the "Viewing as …" banner are all built. Review and release status lives in [`../CURRENT_STATE.md`](../CURRENT_STATE.md) |
| **Date raised** | 2026-10-03 (decision 45); mechanism settled 2026-10-04 (decision 89) |
| **Decision owner** | @dougalbob |
| **Scope** | `internal/config/` (role lists), `internal/handlers/roles.go` (reconciliation and authorization), `internal/handlers/actinguser.go` (the switch), `internal/auth/` (the two identity context keys), `internal/database/migrations.go` (the `users.is_admin` column), `cmd/server/main.go` (middleware order, routes, start-up logging), `web/frontend/src/components/SwapUserSheet.tsx` and `AppLayout.tsx` (the control and the banner) |
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
| Swap the acting user | ❌ | ✅ |

`GET /api/users` was previously answered for **any** authenticated request, which exposed both
household email addresses for no product reason. It is now Admin-only. Nothing in either UI called it,
so no screen changed.

## 6. The acting-user switch

| Piece | Detail |
|---|---|
| Storage | `cals_acting_user` cookie holding the target **account id**. `HttpOnly`, `SameSite=Lax`, `Path=/`, 12 hours |
| Applied by | `handlers.ActingUserMiddleware`, registered after authentication and before every protected route in `cmd/server/main.go` |
| Set / cleared by | `POST /api/session/acting-user` `{user_id}` and `DELETE /api/session/acting-user` |
| Read by the UI | `GET /api/session` → `{authenticated_user, acting_user, is_admin, viewing_as_other}` |

The middleware only ever rewrites `auth.UserEmailKey` (whose data this request touches). It never
touches `auth.AuthenticatedEmailKey` (who is signed in), which is why role checks remain trustworthy
while swapped.

### Two identities, and why they must not be confused

`internal/auth/context.go` defines both:

- **`UserEmailKey`** — the acting user. Every handler, the bank maths and every diary row already
  read this one, which is what makes the switch a single-middleware change rather than an edit to
  ~55 endpoints.
- **`AuthenticatedEmailKey`** — the identity Cloudflare verified. Set by the Cloudflare and
  `DEV_MODE` middleware; never overwritten.

**Authorization reads the second one.** An Admin who is viewing another account must still be able to
list accounts and swap back; if `GET /api/users` keyed off the acting identity, the Admin would be
locked out of the way back the moment they used the feature. A Standard user, meanwhile, cannot gain
the capability by being swapped into.

### Why the cookie is not signed

The switch is honoured **only for an Admin**, and the Admin check reads the authenticated identity
from the Cloudflare JWT — which a browser cannot forge. A cookie planted or hand-edited by a Standard
user is therefore ignored on sight (and cleared, so the browser stops resending it). Signing it would
protect against nothing the JWT does not already protect. A cookie naming a non-existent account, or
the Admin's own account, is likewise ignored.

The switch is logged (`acting-user switch: a@x is now acting as b@x`), which is decision 45's chosen
audit trail for a two-person household — a log line plus honest diary timestamps, rather than an
"entered by" column that would be a storage change.

## 7. What the UI does

- **Header** — shows the *acting* account, and a **Swap user** button for an Admin.
- **Banner** — while `viewing_as_other`, an amber bar under the header reads "Viewing as Sarah —
  anything you log belongs to them" with **Return to \<you\>** beside it. It is a `role="status"`
  region, so it is announced rather than being colour-only.
- **Sheet** — `SwapUserSheet` lists the accounts, marks the one being viewed, labels the Admin's own
  account "Your own account", and offers Return for it.
- **Cache** — every cached query is account-scoped, so a switch calls `queryClient.clear()` rather
  than invalidating a handful of keys. Lingering previous-account data would be worse than a refetch.

The fixture API (`web/frontend/mock-api/`) models both accounts, with the second holding her own
diary, drinks, water target and weigh-in, so the Arena preview shows genuinely different data after a
swap. Recipe favourites and remembered portions remain shared in the fixture; they are per-user in
the real app.

## 8. Security notes

- The role is read from the database server-side on every request that needs it. The client cannot
  claim a role: `is_admin` is a response field, never an accepted input, and no endpoint accepts it.
- Revocation is config-driven. Remove an address from `ADMIN_EMAILS` and restart; the next start-up
  demotes that account and says so in the log.
- The Admin switch is an **authorization** change inside an already-authenticated session. Cloudflare
  still decides who may reach the app at all, and `DEV_MODE` / `DEV_IDENTITY_SWITCH` remain
  development-only, LAN-restricted conveniences — they are not the production feature and must never
  be enabled on the Cloudflare-routed container.
- Audit trail: decision 45 leans on a **log line plus honest diary timestamps** for a two-person
  household rather than an "entered by" column, which would be a storage change. Every switch is
  logged, in both directions.

## 9. Not built / open

- Whether a Standard user is ever told that an Admin edited their data (decision 45 leans: no).
- A Cloudflare Access application for the **PWA bypass** path, so the app can be installed on a
  phone. Deferred by the owner; it is a Zero Trust configuration change, not cals code.
- Role management in the UI. Roles come from `.env` only; there is no in-app promotion control, by
  design — the off-switch lives in appdata, not behind the thing it switches off.
