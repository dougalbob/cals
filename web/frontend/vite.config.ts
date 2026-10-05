import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
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
  // The standalone review bundle must mirror production's temporary mount point
  // so its manifest, worker and install URL are tested at /next/ too.
  const previewBuild = process.env.VITE_PREVIEW === '1'
  const appBase = goBuild || previewBuild ? '/next/' : '/'

  return {
    base: appBase,
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        injectRegister: 'inline',
        scope: appBase,
        includeManifestIcons: false,
        manifest: {
          id: appBase,
          name: 'cals — calorie diary',
          short_name: 'cals',
          description: 'A personal calorie and nutrition diary.',
          start_url: appBase,
          scope: appBase,
          display: 'standalone',
          background_color: '#f5f7fa',
          theme_color: '#4a90d9',
          categories: ['health', 'lifestyle'],
          icons: [
            {
              src: `${appBase}pwa/icon-192.png`,
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable',
            },
            {
              src: `${appBase}pwa/icon-512.png`,
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
        // Installability only: an inert, network-only worker with no fetch
        // handler. The injected manifest is deliberately never cached.
        injectManifest: {
          globPatterns: [],
          injectionPoint: 'self.__WB_MANIFEST',
          minify: false,
        },
        devOptions: { enabled: false },
      }),
      ...(apiTarget ? [] : [fixtureApi()]),
    ],
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
