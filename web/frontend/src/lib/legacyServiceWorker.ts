/**
 * One-time retirement of the service workers and caches left behind by the UIs
 * this app replaced.
 *
 * WHY THIS EXISTS
 * Two older workers can still be registered on a device that used cals before
 * the Phase 16 cutover:
 *
 *   - `/public/sw.js` — the legacy vanilla-JS UI's worker. Its scope is
 *     `/public/` (the script's directory), so it never controlled `/` and cannot
 *     affect a React page. It did, however, open a `cals-v<version>` cache and
 *     cache `/static/css/style.css`, which is now dead weight that no code will
 *     ever clean up: the legacy UI's own `applyUpdate()` is the only thing that
 *     unregisters it, and that UI is no longer the app anyone opens.
 *   - `/next/sw.js` — the React app's own worker while it was mounted at
 *     `/next/` during Phases 11–15. `/next/` now 308-redirects to `/`, so that
 *     registration can no longer fetch its script to update itself. It was
 *     always inert (no fetch handler, no cache), so it is harmless — but leaving
 *     a registration pointing at a retired path is untidy and would linger
 *     forever.
 *
 * This runs on every boot and is a no-op once there is nothing left to remove,
 * so it is safe to leave in place indefinitely. It never touches this app's own
 * worker at `/sw.js`, and it never throws into the app: a device with service
 * workers disabled, or a browser that rejects the call, simply gets on with
 * rendering.
 */

/** True when a worker script URL belongs to a UI this app has replaced. */
export function isRetiredWorkerScript(scriptURL: string): boolean {
  if (!scriptURL) return false
  // The legacy vanilla UI's worker. Matched on its path suffix so it still
  // matches whatever origin the app is served from.
  if (scriptURL.endsWith('/public/sw.js')) return true
  // The React worker from its temporary /next/ mount. This deliberately does
  // not match the current root worker, whose script URL ends in "/sw.js".
  if (scriptURL.includes('/next/sw.js')) return true
  return false
}

/**
 * True when a Cache Storage entry belongs to the legacy vanilla UI, whose
 * `web/public/sw.js` named its cache `cals-v<version>`.
 *
 * The React worker opens no caches at all (no precaching, no runtime caching —
 * decision 53), so nothing this app creates can match.
 */
export function isRetiredCacheName(name: string): boolean {
  return name.startsWith('cals-v')
}

export interface RetiredWorkersReport {
  unregistered: string[]
  cachesDeleted: string[]
}

/**
 * Unregister the replaced workers and drop the legacy caches.
 *
 * Resolves with what was removed so tests and the console can see the result;
 * resolves with empty lists when there is nothing to do. Never rejects.
 */
export async function retireReplacedServiceWorkers(): Promise<RetiredWorkersReport> {
  const report: RetiredWorkersReport = { unregistered: [], cachesDeleted: [] }
  if (typeof navigator === 'undefined') return report

  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      for (const registration of registrations) {
        const scriptURL =
          registration.active?.scriptURL ??
          registration.installing?.scriptURL ??
          registration.waiting?.scriptURL ??
          ''
        if (!isRetiredWorkerScript(scriptURL)) continue
        await registration.unregister()
        report.unregistered.push(scriptURL)
      }
    } catch (error) {
      // Cleanup must never stop the app from rendering.
      console.warn('[cals] could not review old service workers:', error)
    }
  }

  if (typeof caches !== 'undefined') {
    try {
      const names = await caches.keys()
      for (const name of names) {
        if (!isRetiredCacheName(name)) continue
        await caches.delete(name)
        report.cachesDeleted.push(name)
      }
    } catch (error) {
      console.warn('[cals] could not review old caches:', error)
    }
  }

  if (report.unregistered.length > 0 || report.cachesDeleted.length > 0) {
    console.info('[cals] retired replaced service workers:', report)
  }

  return report
}
