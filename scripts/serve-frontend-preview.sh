#!/usr/bin/env bash
#
# Bring up the cals frontend preview in one command.
#
# Designed for Arena sessions, where the sandbox is recycled between turns:
# `node_modules` is not snapshotted and processes do not survive, so a preview
# tab from an earlier turn always reports "This preview has expired".
#
#   ./scripts/serve-frontend-preview.sh          # fast path: pre-built bundle + fixtures
#   ./scripts/serve-frontend-preview.sh --dev    # Vite dev server, with HMR
#
# The default path needs only Node — no npm install — because the app is served
# from the pre-built `web/frontend/preview/` directory by
# `web/frontend/serve-preview.mjs`, with the fixture API mounted in-process.
# That directory is NOT in the snapshot exclusion list (unlike `dist/`), so it
# survives between turns; building it is the only step that needs Vite, and it
# is only redone when it is missing.
#
# Port 5173 is pinned so the preview URL stays stable. Run this as the FIRST
# action of a session so the preview is available for as much of it as possible.
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root/web/frontend"

MODE="static"
if [ "${1:-}" = "--dev" ]; then
    MODE="dev"
fi

if ! command -v node >/dev/null 2>&1; then
    echo "error: node is not installed (Node 20.19+ / 22.12+ is needed)" >&2
    exit 1
fi

have_deps() { [ -x node_modules/.bin/vite ]; }

install_deps() {
    echo "Installing frontend dependencies (node_modules is not snapshotted)…"
    npm ci --no-audit --no-fund
}

# --- port hygiene -----------------------------------------------------------
# Restarting must be safe whether or not a previous attempt is still around:
# if a healthy preview already answers, do nothing; if the port is held by a
# stale preview process, clear it; anything else is left alone and reported.

port_in_use() { ss -ltn 2>/dev/null | grep -q ":5173 "; }

preview_healthy() {
    # Must be *our* preview, not just anything answering on the port.
    curl -fsS -m 2 "http://localhost:5173/api/version" 2>/dev/null | grep -q '"version"'
}

if preview_healthy; then
    echo "A preview is already serving on :5173 — nothing to do."
    exit 0
fi

if port_in_use; then
    echo "Port 5173 is held by a stale process — clearing it…"
    pkill -f 'serve-preview\.mjs' 2>/dev/null || true
    pkill -f 'node_modules/\.bin/vite' 2>/dev/null || true
    for _ in 1 2 3 4 5 6; do
        sleep 0.5
        port_in_use || break
    done
    if port_in_use; then
        echo "error: port 5173 is still in use by another process:" >&2
        ss -ltnp 2>/dev/null | grep ":5173 " >&2 || true
        exit 1
    fi
fi

if [ "$MODE" = "dev" ]; then
    have_deps || install_deps
    if [ -n "${VITE_API_TARGET:-}" ]; then
        echo "Vite dev server, proxying /api to ${VITE_API_TARGET}"
    else
        echo "Vite dev server, using the fixture API"
    fi
    echo "Starting Vite on 0.0.0.0:5173 …"
    exec npm run dev
fi

# Default: serve the pre-built bundle. Build it only if it is missing.
if [ ! -f preview/index.html ]; then
    echo "No preview build found — building it (one-off, needs Vite)…"
    have_deps || install_deps
    npm run build:preview
fi

echo "Serving the pre-built preview on 0.0.0.0:5173 (no dependencies required)…"
exec node serve-preview.mjs
