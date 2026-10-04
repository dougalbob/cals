#!/usr/bin/env bash
#
# Arena-session only: run the Playwright browser suite inside the sandbox.
#
# WHY THIS EXISTS
# The sandbox can reach PyPI and the npm registry, but not the browser CDNs:
# `npx playwright install chromium` fails on cdn.playwright.dev (verified), and
# Docker/apt mirrors are unreachable too. The npm registry does serve
# `@sparticuz/chromium`, which bundles a Chromium build — 153.x, the same major
# version Playwright 1.63 ships — plus the shared libraries it needs. This
# script fetches that package into /tmp, extracts the binary, and points the
# suite at it via E2E_CHROMIUM_PATH (see web/frontend/playwright.config.ts).
#
# WHAT IT DOES NOT DO
#   * It never modifies the working tree version control state: the browser and
#     its libraries live in /tmp, which is not snapshotted, so this must be
#     re-run in a new session (~5 s once npm's cache is warm).
#   * It is not how CI runs. GitHub-hosted runners have normal network access
#     and use `npx playwright install --with-deps chromium` instead.
#
# USAGE
#   ./scripts/run-playwright-in-sandbox.sh                     # whole suite
#   ./scripts/run-playwright-in-sandbox.sh e2e/diary.spec.ts   # one spec
#
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND="$repo_root/web/frontend"
PKG_HOME=/tmp/cals-playwright-browser
CHROMIUM=/tmp/chromium
LIBS=/tmp/al2023
FONTS=/tmp/fonts

if [ ! -x "$CHROMIUM" ] || [ ! -f "$LIBS/lib/libnss3.so" ]; then
    echo "==> 1/3 Chromium for Playwright (npm tarball, /tmp only)"
    mkdir -p "$PKG_HOME"
    cd "$PKG_HOME"
    [ -f package.json ] || npm init -y >/dev/null
    npm install --no-audit --no-fund @sparticuz/chromium >/dev/null

    node - <<'NODE'
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const bin = path.join('/tmp/cals-playwright-browser', 'node_modules', '@sparticuz', 'chromium', 'bin')
const inflate = (name, out) => {
  const raw = zlib.brotliDecompressSync(fs.readFileSync(path.join(bin, name)))
  fs.writeFileSync(out, raw)
  console.log(`    ${name} -> ${out}`)
}

inflate('chromium.br', '/tmp/chromium')
fs.chmodSync('/tmp/chromium', 0o755)
inflate('al2023.tar.br', '/tmp/al2023.tar')
inflate('fonts.tar.br', '/tmp/fonts.tar')
NODE

    mkdir -p "$LIBS" "$FONTS"
    tar xf /tmp/al2023.tar -C /tmp/al2023
    tar xf /tmp/fonts.tar -C /tmp/fonts
    rm -f /tmp/al2023.tar /tmp/fonts.tar
else
    echo "==> 1/3 Chromium already extracted in /tmp — reusing"
fi

echo
echo "==> 2/3 frontend dependencies"
cd "$FRONTEND"
if [ ! -x node_modules/.bin/playwright ]; then
    npm ci --no-audit --no-fund
fi
npm run build:preview >/dev/null

echo
echo "==> 3/3 Playwright suite (phone project by default; pass args to narrow it)"
export E2E_CHROMIUM_PATH="$CHROMIUM"
# Playwright's own ffmpeg binary needs the blocked browser CDN; traces and
# screenshots still capture a failure, so video is simply switched off here.
export E2E_NO_VIDEO=1
export LD_LIBRARY_PATH="$LIBS/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export FONTCONFIG_PATH="$FONTS"

if [ "$#" -eq 0 ]; then
    npx playwright test
else
    npx playwright test "$@"
fi
