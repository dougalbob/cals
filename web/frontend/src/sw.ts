// Workbox injects this manifest placeholder when it builds the PWA worker.
// It is intentionally not passed to precacheAndRoute: the worker stores no
// application shell and no API response, and offers no offline logging or
// queued-write behaviour (decision 53).
const injectedManifest = (self as unknown as { __WB_MANIFEST: unknown[] }).__WB_MANIFEST
void injectedManifest

/**
 * The project's tsconfig uses the DOM lib, not the WebWorker lib — adding
 * WebWorker alongside DOM makes `self`, `caches` and friends ambiguous
 * everywhere else in the app. So the one worker-only type this file needs is
 * declared here instead of being pulled in globally.
 */
interface FetchEventLike extends Event {
  readonly request: Request
  respondWith(response: Response | Promise<Response>): void
}

/**
 * A network-only, pass-through fetch handler.
 *
 * WHY THIS EXISTS
 * The handler below changes nothing about what the app can do: every request is
 * handed straight to the network, nothing is read from or written to a cache,
 * and there is no offline fallback. It exists because Chromium's *install
 * prompt* algorithm still requires a service worker with a fetch handler, even
 * though installing from the browser menu has not needed one since Chrome 109
 * (Android) / 110 (desktop). cals has an in-app "Install app" button on Settings
 * that is driven by `beforeinstallprompt` (src/lib/pwaInstall.ts); without a
 * fetch handler that event never fires and the button is dead code.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   - no `caches.open`, no `cache.put`, no precaching — so a stale shell or a
 *     stale API response can never be served, and there is nothing to bust when
 *     a new image is deployed;
 *   - no offline fallback — the app makes no offline promise (decision 53), so
 *     failing loudly is correct and a synthetic response would be a lie;
 *   - no rewriting, no header changes, no redirects.
 *
 * `fetch(event.request)` reuses the request's own mode, credentials, cache mode
 * and redirect behaviour, so the browser's normal network stack and HTTP cache
 * still apply exactly as they would with no worker at all. If the network fails
 * the promise rejects and the browser shows its own error — the same outcome as
 * an unhandled request.
 */
self.addEventListener('fetch', (event: Event) => {
  const fetchEvent = event as FetchEventLike
  fetchEvent.respondWith(fetch(fetchEvent.request))
})
