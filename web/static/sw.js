const CACHE_NAME = 'cals-v1';

// Assets to cache (excluding JS files for easy updates)
const STATIC_ASSETS = [
  '/static/css/style.css',
  '/static/manifest.json'
];

// Install - cache static assets only
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
      );
    })
  );
  // Take control immediately
  self.clients.claim();
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Always fetch JS files from network (no caching)
  if (url.pathname.endsWith('.js')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .catch(() => caches.match(event.request))
    );
    return;
  }
  
  // API calls - network only
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Static assets - cache first, then network
  if (url.pathname.startsWith('/static/') || url.pathname.startsWith('/public/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          // Cache new static assets
          if (response.ok && !url.pathname.endsWith('.js')) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        });
      })
    );
    return;
  }
  
  // HTML pages - network first
  event.respondWith(
    fetch(event.request)
      .catch(() => caches.match('/'))
  );
});
