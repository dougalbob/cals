#!/usr/bin/env bash
#
# Runtime smoke check for a *running* cals server.
#
# WHY THIS EXISTS
# The Docker validation workflow only proved the image builds; nothing ever
# started it. A build can succeed and the app still fail on first run (bad
# migration, missing web assets, listener misconfiguration). This script makes
# the running container answer the routes that matter, against a disposable
# database, without a Cloudflare JWT and without ever touching household data.
#
# USAGE
#   scripts/smoke-app-routes.sh BASE_URL                  # DEV_MODE server
#   scripts/smoke-app-routes.sh --expect-auth BASE_URL    # production-like
#
# With --expect-auth the protected routes must answer 401 (no JWT), which is
# the "Cloudflare Access is still enforced" check; without it they must answer
# 200 and return the dev identity, which proves the DB and handlers work.
#
# Exit status: 0 when every check passes, 1 otherwise (with a summary).

set -uo pipefail

expect_auth=no
if [ "${1:-}" = "--expect-auth" ]; then
    expect_auth=yes
    shift
fi

BASE_URL="${1:-}"
if [ -z "$BASE_URL" ]; then
    echo "usage: $0 [--expect-auth] BASE_URL" >&2
    exit 2
fi
BASE_URL="${BASE_URL%/}"

TODAY="$(date -u +%F)"
TMP_BODY="$(mktemp)"
trap 'rm -f "$TMP_BODY"' EXIT

pass_count=0
fail_count=0
failures=""

# check <label> <path> <expected-status> [expected-body-pattern]
check() {
    local label="$1" path="$2" expected="$3" pattern="${4:-}"
    local status body
    status="$(curl -sS -o "$TMP_BODY" -w '%{http_code}' --max-time 10 "$BASE_URL$path" 2>/dev/null)" || status=000
    # curl prints the status even when it fails to connect; keep the last three
    # digits so 000 never becomes 000000.
    status="${status: -3}"
    # Strip NULs as well as newlines: a binary asset (an icon, say) otherwise
    # makes bash warn about a null byte in command substitution.
    body="$(head -c 400 "$TMP_BODY" | tr '\0\n' '  ')"

    if [ "$status" != "$expected" ]; then
        printf '  %-4s %-34s %s (expected %s)\n' 'FAIL' "$label" "$status" "$expected"
        failures="${failures}${label}: got HTTP ${status}, expected ${expected}; body: ${body:0:200}"$'\n'
        fail_count=$((fail_count + 1))
        return
    fi
    if [ -n "$pattern" ] && ! grep -q "$pattern" "$TMP_BODY"; then
        printf '  %-4s %-34s %s (body missing %s)\n' 'FAIL' "$label" "$status" "$pattern"
        failures="${failures}${label}: HTTP ${status} but body did not contain '${pattern}'; body: ${body:0:200}"$'\n'
        fail_count=$((fail_count + 1))
        return
    fi

    printf '  %-4s %-34s %s\n' 'ok' "$label" "$status"
    pass_count=$((pass_count + 1))
}

mode="dev-mode (DEV_MODE=true)"
[ "$expect_auth" = "yes" ] && mode="production-like (no DEV_MODE)"

echo "== cals route smoke =="
echo "   base: $BASE_URL"
echo "   mode: $mode"
echo

# Unprotected routes: both modes must serve these.
#
# Since the Phase 16 cutover the React app owns /, the legacy vanilla UI is the
# unlinked lifeboat at /legacy/, and the retired /next/ mount redirects onto the
# root with its prefix stripped. curl is deliberately not given -L: the 308s are
# the contract, and following them would hide a redirect that had gone wrong.
check 'GET /health'                    '/health'                    200 'OK'
check 'GET /api/version'               '/api/version'               200 '"version"'
check 'GET / (React shell)'            '/'                          200 '/assets/'
check 'GET /diary (React deep link)'   '/diary'                     200 '/assets/'
check 'GET /manifest.webmanifest'      '/manifest.webmanifest'      200 '"start_url":"/"'
check 'GET /sw.js (worker)'            '/sw.js'                     200 'addEventListener'
check 'GET /pwa/icon-192.png'          '/pwa/icon-192.png'          200
check 'GET /legacy/ (lifeboat)'        '/legacy/'                   200 '<html'
check 'GET /next (retired -> 308)'     '/next'                      308
check 'GET /next/ (retired -> 308)'    '/next/'                     308
check 'GET /next/diary (308, stripped)' '/next/diary'               308

echo
if [ "$expect_auth" = "yes" ]; then
    # Protected routes must stay behind Cloudflare Access.
    for path in '/api/users/me' '/api/diary' '/api/recipes' "/api/bank?date=$TODAY"; do
        check "GET ${path%%\?*}" "$path" 401
    done
else
    # DEV_MODE identity: proves migrations ran and the handlers can read.
    check 'GET /api/users/me'            '/api/users/me'                       200 '"email"'
    check 'GET /api/diary (today)'       "/api/diary?date=$TODAY"              200 '"entries"'
    check 'GET /api/recipes'             '/api/recipes'                        200 '^\['
    check 'GET /api/bank (today)'        "/api/bank?date=$TODAY"               200 '"daily_goal"'
    check 'GET /api/drinks'              '/api/drinks'                         200 '^\['
fi

echo
if [ "$fail_count" -gt 0 ]; then
    echo "$fail_count check(s) failed, $pass_count passed."
    echo
    echo "--- failure detail ---"
    printf '%s' "$failures"
    exit 1
fi

echo "All $pass_count checks passed."
