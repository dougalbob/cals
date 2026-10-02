#!/usr/bin/env bash
#
# Arena-session only: get a Go toolchain and build cals inside the sandbox.
#
# WHY THIS IS NEEDED
# The Arena sandbox ships Node but no Go, and the usual sources are blocked
# (go.dev, dl.google.com, proxy.golang.org, apt and Docker are all unreachable).
# There is, however, a PyPI wheel that bundles a real Go toolchain (`go-bin`),
# and PyPI is reachable — hence this script.
#
# WHAT IT DOES
#   1. installs `go-bin` into a throwaway venv at /tmp (nothing system-wide)
#   2. copies the repo to /tmp/calstest and adds one `replace` directive so the
#      golang.org/x/image dependency can be fetched from its GitHub mirror
#      (the vanity domain is blocked)
#   3. builds ./cmd/server with CGO enabled (SQLite needs gcc; gcc is present)
#
# WHAT IT DOES NOT DO
#   * It never modifies the working tree — all of the above happens in /tmp.
#   * It cannot replace Docker: `docker build` must still be verified on
#     your own machine (or by the build-only CI check).
#   * The toolchain lives in /tmp, which is not snapshotted, so this must be
#     re-run in each new session (~1 min, less once caches warm).
#
# USAGE
#   ./scripts/verify-go-in-sandbox.sh          # build only
#   ./scripts/verify-go-in-sandbox.sh --run    # build, then start it on :8150
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV=/tmp/govenv
SRC=/tmp/calstest
export GOPATH=/tmp/gopath
export GOMODCACHE=/tmp/gopath/pkg/mod
export GOCACHE=/tmp/gocache
export GOPROXY=direct GOSUMDB=off GOPRIVATE='*' GOFLAGS=-mod=mod CGO_ENABLED=1

echo "==> 1/3 Go toolchain (PyPI wheel, /tmp only)"
if [ ! -x "$VENV/bin/go" ]; then
    python3 -m venv "$VENV"
    "$VENV/bin/pip" install --quiet --no-cache-dir go-bin
fi
export PATH="$VENV/bin:$PATH"
go version

echo
echo "==> 2/3 scratch copy of the repo (your working tree is untouched)"
rm -rf "$SRC"
mkdir -p "$SRC"
tar --exclude=.git --exclude=node_modules --exclude=preview -cf - -C "$repo_root" . | tar xf - -C "$SRC"

grep -q 'golang.org/x/image => github.com/golang/image' "$SRC/go.mod" || \
    printf '\nreplace golang.org/x/image => github.com/golang/image v0.15.0\n' >> "$SRC/go.mod"

echo
echo "==> 3/3 building ./cmd/server (first run downloads modules from GitHub)"
(cd "$SRC" && go build -o "$SRC/cals" ./cmd/server)
ls -lh "$SRC/cals"

if [ "${1:-}" = "--run" ]; then
    echo
    echo "==> starting the real server on :8150 (Ctrl-C equivalent: pkill -f '/tmp/calstest/cals')"
    cd "$SRC"
    PORT=8150 DB_PATH="$SRC/cals.db" CF_TEAM_DOMAIN=example.cloudflareaccess.com CF_POLICY_AUD=local \
        exec "$SRC/cals"
fi

echo
echo "Build OK. To run it:"
echo "  cd $SRC && PORT=8150 DB_PATH=$SRC/cals.db \\"
echo "    CF_TEAM_DOMAIN=example.cloudflareaccess.com CF_POLICY_AUD=local ./cals"
echo
echo "Note: /health and /api/version answer; everything under /api/ returns 401"
echo "without a Cloudflare Access JWT, which is the middleware working correctly."
