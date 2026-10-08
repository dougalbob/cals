# Exercise and steps: discovery findings

> **Status: 🟡 Live discovery — parked.** The owner has parked the data-source decision (2026-10-08). Nothing has been built. This document records what was asked, what the code and the platform say, what is still unknown, and the test that will settle it. It is a handover: **read §0 and §5 before doing any steps work.**
>
> Docs-only. No code, schema, configuration, Cloudflare, Unraid or appdata change. Written 2026-10-08 (Europe/London).

## 0. Read this first

- **Asked for:** an **Exercise** section in the bottom navigation, starting with **daily steps**: a daily total plus a daily breakdown in the style of the Google Fit app. The owner's Google Fit screenshot did **not** reach the workspace. Re-request it before designing the breakdown screen.
- **Phones:** both household phones are **Android 13** (owner, 2026-10-08). Both users had Google Fit on Android.
- **Current steps code:** only the legacy v1 Google Fit REST integration (`internal/handlers/fitness.go`), shown on the legacy Metrics page. The React app has no Google Fit or step-API code (checked 2026-10-08).
- **Open and untested:** the owner followed the Google Fit → Google Health migration and granted access. Google Health reports activity as **active** but shows **no data yet**. The owner will test after a walk. The result goes in §5.1, not a guess.
- **Parked:** data source, navigation placement, and phone-to-server authentication. The owner said "skip for now" on navigation and "not sure" on authentication, and asked for this write-up rather than a decision.
- **Steps never credit the bank** (decision 48). Any change needs its own decision and tests.

## 1. What the owner asked, and the answers so far

- An Exercise section in the bottom navigation. The first slice is daily steps (total plus breakdown). Nothing beyond that is specified yet.
- The v1 integration "would stop working regularly". The owner asked whether to reuse the old Google Cloud project or start fresh. **Answer:** neither is a sound base. A fresh Fit project cannot be created, Google Health API is not onboarding new projects, and reusing the old project only buys time until Fit is switched off (§4).
- Owner answers, 2026-10-08: both phones Android 13. Navigation: "skip for now, I can't decide". Phone-to-server authentication: "not sure". Data source: asked for the Android 13 limits (§4 and §5), then parked. The "next step" question was skipped.
- Owner instruction, same day: write this up in a new document that later sessions can see, publish it as a PR merged into `cals-dev`, **stop after the merge** (no release-candidate tag), and **skip CI** for this docs-only PR. "Lets publish" normally ends in an RC tag (`docs/architecture/git-workflow.md` §5). This session did not tag.

## 2. What v1 does today (verified in code, 2026-10-08)

| Behaviour | Where | Finding |
|---|---|---|
| Data source | `internal/handlers/fitness.go` ~L353–365 | Google Fit REST `users/me/dataset:aggregate`, data type `com.google.step_count.delta`, 1-day buckets. Scope `fitness.activity.read` (L37). It does use real Google Fit data. |
| Redirect URI | `fitness.go` L27 | Hard-coded to the production callback host. |
| Routes | `cmd/server/main.go` L197–202 | `GET /api/fit/auth`, `GET /api/fit/callback`, `GET /api/fit/status`, `DELETE /api/fit/disconnect`, `GET /api/steps`, `POST /api/steps/sync`. All behind `withAuth`. |
| "Connected" | `HandleFitStatus`, `fitness.go` ~L102–123 | `connected := err == nil` on a `fit_tokens` row. It never checks whether refresh still works. |
| Token refresh | `getValidToken`, `fitness.go` ~L307–323 | Refreshes within 5 minutes of expiry. Refresh errors are returned to a caller that discards them (see below). |
| Background sync | `HandleGetSteps` → `go refreshStepsIfNeeded` (L164); callback → `go syncStepsForUser` (L95) | Fire-and-forget goroutines. Errors are dropped. |
| Hourly guard | `refreshStepsIfNeeded`, `fitness.go` ~L326–339 | Never throttles. See §3.3. |
| Day buckets | `startTime := now.AddDate(0,0,-14).Truncate(24*time.Hour)` (L344); label `time.UnixMilli(…).Format("2006-01-02")` (L405) | Buckets start at UTC midnight, which is 01:00 BST. See §3.4. |
| Storage | `step_entries` (user_id, date, steps, synced_at; UNIQUE(user_id, date)) and `fit_tokens` (access and refresh tokens as plain TEXT). `internal/database/migrations.go` L186–207 | Tokens sit in plaintext SQLite, so they are in every backup. |
| Logging | None in `fitness.go` | Failures are invisible. |
| Tests | None for `fitness.go` | Nothing guards the maths. |
| Legacy UI | `web/static/js/components/metrics.js` (~L566–700); `web/static/js/api.js` L241–253 | Goal hard-coded at 10,000 (`metrics.js` L606). No last-synced, stale or error text (grep). |
| API contract | `GET /api/steps` gained `from`/`to` in 14.1 (`docs/CURRENT_STATE.md`) | The legacy client calls `/api/steps?days=`. |

## 3. Why v1 "stopped working": likely causes

1. **Probably 7-day refresh tokens (unverified).** Google's OAuth documentation says that a Google Cloud project whose consent screen is in *Testing* receives refresh tokens that expire after seven days, unless the scopes are only name, email and profile. If the old project was never published, that gives a roughly weekly failure, which matches "stops regularly". **Check:** old project → OAuth consent screen → Publishing status.
2. **Failures are invisible (verified in code).** There is no logging, errors are dropped, and `/api/fit/status` says "connected" while a token row exists. The Metrics page can therefore show old numbers and still say connected.
3. **The hourly guard never throttles (verified by probe).** Scanning `SELECT MAX(synced_at) FROM step_entries …` into `sql.NullTime` fails with `unsupported Scan, storing driver.Value type string into type *time.Time`, which leaves `Valid=false`. The guard then decides a sync is needed, even when the last sync finished a minute earlier. A typed control scan decides no sync is needed. Even if the scan had succeeded with a zero time, `time.Since` would still trigger a sync. **Consequence:** every Metrics load makes a Google call per user. It loses no data, but it adds calls and failure points.
4. **The day boundary is off (verified by probe).** Buckets start at UTC midnight, which is 01:00 BST. The probe started a bucket at `2026-10-06 00:00 UTC` (`01:00 BST`), and it covered `Tue 06 Oct 01:00 → Wed 07 Oct 01:00`. Until the clocks go back on 25 October 2026, a "day" will not match the Google Fit day.
5. **Unknown:** whether the old Google Cloud project still exists, its publishing status, and whether the Fit REST API still returns the owner's data.

## 4. Platform facts

Dated as read on 2026-10-08 unless marked. Anything marked "earlier reading" came from an earlier session and must be re-checked before anyone relies on it.

| Fact | Source | Status |
|---|---|---|
| Developers cannot sign up for the Google Fit APIs (including REST) since 1 May 2024. | [Fit REST reference](https://developers.google.com/fit/rest/v1/reference/users/dataset/aggregate) | Verified (fetched) |
| Google Fit APIs are supported only until the end of 2026. | [Track steps](https://developer.android.com/health-and-fitness/health-connect/features/steps); [Fit migration guide](https://developer.android.com/health-and-fitness/health-connect/migration/fit) | Verified |
| Google's recommended path for step-tracking apps is Health Connect. For cloud and OAuth integrations it is the Google Health API. | [Fit migration guide](https://developer.android.com/health-and-fitness/health-connect/migration/fit) | Verified |
| The Fitbit app became the Google Health app (rolled out 19 May 2026). Google will invite Google Fit users to migrate their data "later this year". No Fit shutdown date has been announced. | [blog.google, 7 May 2026](https://blog.google/products-and-platforms/products/google-health/google-health-app/) | Verified (search) |
| The Google Health API is "not onboarding new projects at this time". | [developers.google.com/health](https://developers.google.com/health) | Earlier reading; re-check |
| A consent screen in *Testing* gives refresh tokens that expire after 7 days. | [OAuth 2.0 docs](https://developers.google.com/identity/protocols/oauth2) | Earlier reading; re-check |
| Health Connect is built into Android 14 and later. On Android 13 and earlier it is a separate Play Store app. It needs Google Play services. | [Check availability](https://developer.android.com/health-and-fitness/health-connect/availability) | Verified (fetched) |
| Health Connect counts steps itself only on Android 14 or later (with SDK extension 20), and only while some app holds `READ_STEPS`. | [Track steps](https://developer.android.com/health-and-fitness/health-connect/features/steps) | Verified |
| The Health Connect step total "includes mobile steps (Android 14 or higher) and steps from other apps and devices". | [Fit migration guide](https://developer.android.com/health-and-fitness/health-connect/migration/fit) | Verified |
| Reads reach back 30 days by default. Older reads need `PERMISSION_READ_HEALTH_DATA_HISTORY`. On Android 13 and earlier, the 30-day limit applies to reading **any** data, and the history permission removes it. | [Read raw data](https://developer.android.com/health-and-fitness/health-connect/read-data); [Get started](https://developer.android.com/health-and-fitness/health-connect/get-started) | Verified |
| Background reads need an extra permission. The official sample checks `FEATURE_READ_HEALTH_DATA_IN_BACKGROUND` first. | [Read raw data](https://developer.android.com/health-and-fitness/health-connect/read-data) | Verified |
| Reads are paged (default page size 1000). The sample treats `IllegalStateException` as a back-off signal. | [Read raw data](https://developer.android.com/health-and-fitness/health-connect/read-data) | Verified |
| Aggregating without a `DataOrigin` filter includes on-device steps. From June 2026, on-device steps are attributed to a device-specific package name. | [Track steps](https://developer.android.com/health-and-fitness/health-connect/features/steps) | Verified |
| Google Fit has a "Sync Fit with Health Connect" switch (Profile → Settings). When it is on, Fit data is shared into Health Connect. | [Android Police walkthrough](https://www.androidpolice.com/sync-samsung-health-with-google-fit/); [Validic migration guide](https://developer.validic.com/docs/native-android-mobile-inform-sdk-migrating-users-from-google-fit-sdk-to-health-connect) | Secondary sources. Confirm on the phone |
| Google Health can record phone steps and write them to Health Connect. | [Motion help page](https://motion-app.com/help/migrate-to-health-connect/) | Vendor claim. Unverified |
| On older Android, Health Connect cannot count steps itself, so a writer app is needed (for example Samsung Health, Google Health or a pedometer). | [Fog-breaker, Aug 2026](https://fog-breaker.com/en/blog/google-fit-shutting-down) | Third-party summary |
| Published apps must declare Health Connect access in Play Console. Whether a sideloaded (non-Play) APK can request Health Connect permissions is **unknown**. | [Read raw data](https://developer.android.com/health-and-fitness/health-connect/read-data) (exceptions table, partly visible) | Partly verified. Open |
| Cloudflare Access service-token JWTs carry `common_name` (the Client ID), an empty `sub`, and no `email`. | [Cloudflare application token](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/) | Verified |
| Fitbit Web API shutdown: 30 October 2026 per Google's developer page (earlier reading). "September 2026" per a third-party article. Relevant only if a household member uses a Fitbit device. | [Google Health API](https://developers.google.com/health); [FitMesh](https://www.fitmesh.fit/en/blog/google-health-replaces-google-fit) | Sources disagree. Re-check if relevant |

## 5. The open question: Android 13, Google Health, and no data

**Facts that bear on it (from §4):** Health Connect does not count steps on Android 13. Its total includes phone steps only on Android 14 and later. On Android 13, reads are limited to 30 days unless the history permission is granted. Google Fit can share its data into Health Connect (secondary sources).

**Hypotheses (not mutually exclusive):**

- **H1. No app writes this phone's steps into Health Connect.** Fit's sync switch is off, or Fit is not writing steps, and Google Health is not recording phone steps on this phone. On Android 13 nothing else will count them.
- **H2. New steps flow, but older data is not visible.** The 30-day rule on Android 13 applies, the history permission has not been granted, or Fit history has not been migrated yet.
- **H3. Access was granted for something other than steps.** Activity is "active", but the steps data type is not shared.
- **H4. The data exists but is shown elsewhere**, or it is delayed.

**The owner's test (after a walk, about 10 minutes):**

1. Note the time, and today's step count in Google Fit (if still installed) and in Google Health.
2. Open Health Connect → Steps. Note which apps are listed as sources and when each last wrote. Allow a few minutes after walking.
3. Check Google Health's Steps or Activity view for today.
4. Note the Android version (both 13), the Health Connect app version (from the Play Store), the Google Health app version, and whether Fit's "Sync Fit with Health Connect" is on.
5. Record the result in §5.1, with the date and time.

**How to read the result:**

| Result | Meaning | Next step |
|---|---|---|
| The walk appears in Health Connect or Google Health. | New phone steps reach Health Connect on Android 13. | Test whether older days appear (H2). Option A becomes viable. |
| The walk appears in Google Fit but not in Health Connect or Google Health. | Fit is not passing steps to Health Connect. | Check the sync switch. If still nothing, Option A needs another writer, or the sensor fallback. |
| The walk appears in no app. | A phone-side capture problem (activity permission, battery restrictions, recording off). | Fix the phone first, then re-test before any design work. |
| The walk appears from a source other than Fit or Google Health. | Another writer exists. | Identify it, and check for double counting. |

### 5.1 Results

- _Pending. Owner test, 2026-10-08, after walking. Record the time, device and app versions here._

## 6. Options (parked; no decision)

| Option | What must be true | Status |
|---|---|---|
| **A. Health Connect plus a small Android companion.** The companion reads Health Connect and posts daily totals to cals. | Some app writes phone steps into Health Connect on Android 13 (§5). The companion can read them. A non-Play build can request the permissions, or we publish a Play listing (privacy policy, data-safety form and health declaration). | Lead option if §5 shows steps in Health Connect. Needs a spike. |
| **A′. Sensor companion.** The companion reads the phone's step counter directly. No Health Connect. | Android 13 lets the app read the step counter reliably in the background, and the app survives reboots and battery settings. | Fallback if no app writes phone steps. Its numbers may differ from Google Fit. The counter counts from the last reboot (general Android behaviour, not verified here). |
| **B. Keep Fit REST on the old project.** | The old project exists and works, and its publishing status is known. | Not recommended for new work. It ends by the end of 2026 and fails silently. A one-off history backfill before it closes is the only plausible use. |
| **C. Google Health API.** | Google opens new projects, or the owner accepts the Testing-mode limits. | Not available for new projects (earlier reading). Not recommended now. |
| **D. Manual daily entry.** | Nothing. | Fallback only. No breakdown, and poor UX. |

Option A's new weak point is the phone. Android can delay background work under battery-saving settings (general Android behaviour), so the app must show when it last synced. That is the direct fix for v1's silent failures.

**Recommendation as it stands (not a decision):** if §5 shows steps in Health Connect, pursue A. If not, pursue A′. Do not build new work on Fit REST. Use D only as a stopgap.

## 7. Phone-to-cals authentication (undecided; owner "not sure")

The phone must send data to cals, which sits behind Cloudflare Access (browser login).

- **(i) Cloudflare service token for the phone.** The phone sends the Access service-token headers, and Access issues a JWT with `common_name` and no `email` (§4). This needs a Cloudflare dashboard change (owner approval, per AGENTS.md) and a code change: reject empty-email identities, map the service identity to a device and a user, and add tests. **This is the default recommendation if we go this way.**
- **(ii) Bypass for one path, plus a per-device token.** This is a Cloudflare change. That path is then guarded only by the device token.
- **(iii) Home Wi-Fi only.** No Cloudflare change. "Today" does not update away from home, and totals catch up when the phone is at home.
- **Latent gap (verified in code).** `CloudflareAuth.Middleware` (`internal/auth/cloudflare.go`) accepts any valid Access JWT and sets the acting user's email from `claims.Email` with no empty-string check. `GetOrCreateUser("")` (`internal/handlers/users.go`) would insert a user with an empty email. `diary.go` passes the email straight through, and several handlers (for example `recipes.go`) have no empty-email check. This is not reachable with the current policy if the policy only admits people, but the policy was not inspected in this session. Fix it before any machine route exists.
- **The spike does not need this decision.** A spike can show the phone's own numbers first.

## 8. The Exercise screen and navigation (parked)

**Proposed first slice (not built):**

- `/exercise` (today) and `/exercise/:date`, with the date in the URL, as Diary does.
- A daily total against a goal ring. The default goal is 10,000 (the legacy figure), to be confirmed.
- Hourly bars (24, tap for a value). This is assumed until the Google Fit screenshot is received.
- A 7-day strip.
- **The concrete UX improvement:** a freshness line ("Phone synced 12 min ago") with a fix action when the data is stale. Metrics currently shows no last-synced or error state.
- Steps stay informational. A test should prove the bank is unchanged (decision 48).

**Slices:** (1) screens, API contract and fixtures, reviewable in the phone-size preview with no Google or Health dependency; (2) the data path (§6); (3) any bank question, as its own decision.

**Data, if built:** additive tables for daily and hourly totals, plus an additive goal setting. Keep the v1 `step_entries` and `/api/steps` until cutover. Do not touch live appdata.

**Navigation:**

- Today there are 8 destinations (`web/frontend/src/AppLayout.tsx`, the `NAV` array). Five are visible, with a two-page swipe and a More/Back arrow (`VISIBLE_NAV_ITEMS = 5`).
- Decision 75 (2026-10-04): show five, swipe to reveal the rest, and design for future Settings and Exercise pages.
- Decision 77 (2026-10-04): the arrow is a temporary preview workaround, because the preview cannot reliably swipe.
- Options: (a) a third swipe page (keeps decision 75 as written); (b) a tap-based More sheet (works in the preview, but reverses decision 75); (c) move Calendar out of the bar. Diary already links to `/calendar` (`web/frontend/src/routes/DiaryRoute.tsx`, ~L203).
- `web/frontend/e2e/navigation.spec.ts` pins the current arrow and swipe behaviour. Any change must update it.
- **Owner: "skip for now, I can't decide."** Parked.

## 9. Open questions for the owner

| # | Question | Blocks | Status |
|---|---|---|---|
| 1 | The walk test result (§5), and which access was granted in Google Health or Health Connect. | Data-source choice (A, A′ or D). | Pending |
| 2 | The Android version of both phones. | Option A feasibility. | Answered: both 13 |
| 3 | Data source: A, A′, D, or wait. | The spike. | Parked |
| 4 | Navigation placement (a, b or c, §8). | Navigation slice. | Parked ("skip for now") |
| 5 | Phone-to-cals authentication (§7). | The push endpoint, not the spike. | "Not sure" |
| 6 | Breakdown: hourly bars, or also by source (phone versus watch)? | Screen design. | Needs the Google Fit screenshot re-sent |
| 7 | Goal default. | The goal ring. | To confirm (10,000 assumed) |
| 8 | How far back should steps be kept or backfilled? | Storage design, and the history permission. | Open |
| 9 | Does the old Google Cloud project exist, and what is its publishing status? | Option B only. | Unknown |
| 10 | Steps and the bank. | Nothing now. | Decision 48 stands. Revisit only as its own decision. |

## 10. Verification log (2026-10-08)

- **Build (sandbox only):** `scripts/verify-go-in-sandbox.sh` built `./cmd/server` in `/tmp/calstest` (Go 1.27.1, from the PyPI `go-bin` wheel). The production image uses Go 1.22, which was not tested.
- **Guard probe:** a throwaway Go program in `/tmp` used the app's SQLite DSN (`?_foreign_keys=on&_journal_mode=WAL`) and `mattn/go-sqlite3` v1.14.22. Results are in §3.3. The probe is not kept in the repository.
- **Day-boundary probe:** container time zone `Europe/London`. Results are in §3.4.
- **Network:** `curl` from the sandbox cannot reach `maven.google.com`, `dl.google.com` or `oauth2.googleapis.com` (HTTP 000). Android builds therefore need GitHub Actions or the owner's machine.
- **Doc links:** `node scripts/check-doc-links.mjs` is run before publishing.
- **Not done:** no code, schema, configuration, Cloudflare, Unraid or appdata change; no tag or RC; no CI run for this PR (owner instruction for this docs-only change).

## 11. Guardrails for whoever picks this up

- `main` is read-only. PRs target `cals-dev`. Sync first (AGENTS.md §0.4).
- Steps do not credit the bank (decision 48). Bank maths is unchanged. Any change is a separate decision with tests.
- Do not change the `fitness.go` maths incidentally. AGENTS.md calls domain maths "hard-won". The guard and day-boundary fixes are separate, tested changes.
- Live household data is in `/mnt/user/appdata/cals-dev-v2`. No copies, deletions or destructive schema work without the data-copy rules (`docs/architecture/data-copy-warning.md`). Schema changes are additive.
- Cloudflare, Unraid and appdata changes need owner approval.
- `ai_contextual_docs/context.txt` is legacy. Do not append to it.
- UI work needs a phone-size preview and a concrete UX improvement (AGENTS.md §4 and §6).
- Re-check every §4 item marked "earlier reading" before relying on it.
- The CI skip used for this PR was an owner instruction for that docs-only change. It is not a general rule.

## 12. Related documents

- [`product/vision-and-open-questions.md`](../product/vision-and-open-questions.md): decisions 48, 75 and 77, and open question 2 (bank crediting, deferred 2026-10-03).
- [`CURRENT_STATE.md`](../CURRENT_STATE.md): the single home for status. This document does not change it.
- [`git-workflow.md`](git-workflow.md): the "Lets publish" loop.
- [`data-copy-warning.md`](data-copy-warning.md): appdata rules.
- [`frontend-strategy.md`](frontend-strategy.md): the Phase 14 row lists "Google Fit connect/disconnect". That work is not in the React app, so the steps UI is legacy-only. This document does not edit that row.
