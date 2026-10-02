#!/usr/bin/env bash
#
# Bring up the frontend spike preview in one command.
#
# Intended for Arena sessions, where the sandbox is recycled between turns:
# node_modules is not snapshotted, so the dev server needs its dependencies
# reinstalled before it can start. Run this as the FIRST action of a session so
# the preview is live for as much of the turn as possible.
#
#   ./scripts/serve-frontend-preview.sh
#
# Then open the preview from the Arena process panel (the URL is bound to the
# current sandbox instance and port 5173, so a tab from an earlier turn will
# report "Expired" — reopen it rather than refreshing).
#
# Port 5173 is pinned with strictPort so the preview URL stays stable.
# Set VITE_API_TARGET to develop against a real Go server instead of fixtures:
#
#   VITE_API_TARGET=http://localhost:8150 ./scripts/serve-frontend-preview.sh
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root/web/frontend"

if ! command -v node >/dev/null 2>&1; then
    echo "error: node is not installed (need Node 20.19+ / 22.12+ for Vite 8)" >&2
    exit 1
fi

if [ ! -d node_modules ]; then
    echo "node_modules missing (not snapshotted) — installing dependencies…"
    npm install --no-audit --no-fund
fi

if [ -n "${VITE_API_TARGET:-}" ]; then
    echo "Proxying /api to ${VITE_API_TARGET} (real Go server mode)"
else
    echo "Using the fixture API (no VITE_API_TARGET set)"
fi

echo "Starting Vite on 0.0.0.0:5173 …"
exec npm run dev
