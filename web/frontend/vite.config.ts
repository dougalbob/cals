import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fixtureApi } from './mock-api/vite-plugin.mjs'

/**
 * Development modes:
 *
 * 1. `VITE_API_TARGET=http://localhost:8150 npm run dev`
 *    → proxies the same-origin API, public assets and health check to Go.
 *
 * 2. `npm run dev` with no VITE_API_TARGET
 *    → serves the fixture API in-process for UI work without a database.
 *
 * Production Go builds use `npm run build:go`, which sets the asset and router
 * base to `/next/`. The current vanilla UI remains the default at `/`.
 */
const apiTarget = process.env.VITE_API_TARGET

export default defineConfig(({ mode }) => {
  const goBuild = mode === 'go'

  return {
    base: goBuild ? '/next/' : '/',
    plugins: [react(), tailwindcss(), ...(apiTarget ? [] : [fixtureApi()])],
    server: {
      // Bind all interfaces so the sandbox preview proxy can reach the dev server.
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      // Preview hosts are served from a different origin; do not reject them.
      allowedHosts: true,
      proxy: apiTarget
        ? {
            '/api': { target: apiTarget, changeOrigin: true },
            '/public': { target: apiTarget, changeOrigin: true },
            '/health': { target: apiTarget, changeOrigin: true },
          }
        : undefined,
    },
    test: {
      // `e2e/` holds the Playwright browser suite. Vitest's default include
      // pattern matches `*.spec.ts`, so without this it tries to run Playwright
      // tests inside jsdom and fails the unit suite.
      exclude: [...configDefaults.exclude, 'e2e/**', 'preview/**'],
    },
    build: {
      // Docker/Go serves the production frontend from web/dist.
      outDir: '../dist',
      emptyOutDir: true,
      // The preview bundle is served from disk, so its sourcemap only bloats snapshots.
      sourcemap: !goBuild && process.env.VITE_PREVIEW !== '1',
    },
  }
})
