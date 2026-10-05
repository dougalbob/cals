// Workbox injects this manifest placeholder when it builds the PWA worker.
// It is intentionally not passed to precacheAndRoute: the worker has no fetch
// handler, stores no application shell or API response, and offers no offline
// logging or queued-write behaviour.
const injectedManifest = (self as unknown as { __WB_MANIFEST: unknown[] }).__WB_MANIFEST
void injectedManifest
