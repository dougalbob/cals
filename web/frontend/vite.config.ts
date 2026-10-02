import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fixtureApi } from './mock-api/vite-plugin.mjs'

/**
 * Two modes:
 *
 * 1. `VITE_API_TARGET=http://localhost:8150 npm run dev`
 *    → proxies /api to a real `go run ./cmd/server` on your machine.
 *      This is the normal development mode for cals.
 *
 * 2. `npm run dev` with no VITE_API_TARGET
 *    → serves the fixture API (mock-api/) in-process, seeded with data that
 *      mirrors the Go handlers' response shapes. This exists so the UI can be
 *      worked on in environments that cannot run the Go binary (e.g. the
 *      Arena sandbox, which has no Go toolchain) and so the spike is
 *      demonstrable without a database.
 */
const apiTarget = process.env.VITE_API_TARGET

export default defineConfig({
  plugins: [react(), tailwindcss(), ...(apiTarget ? [] : [fixtureApi()])],
  server: {
    // Bind all interfaces so the sandbox preview proxy can reach the dev server.
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Preview hosts are served from a different origin; do not reject them.
    allowedHosts: true,
    proxy: apiTarget ? { '/api': { target: apiTarget, changeOrigin: true } } : undefined,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // The preview bundle (npm run build:preview) is served from disk by
    // serve-preview.mjs, so its sourcemap would only add ~1.8 MB to the
    // snapshot for nothing.
    sourcemap: process.env.VITE_PREVIEW !== '1',
  },
})
