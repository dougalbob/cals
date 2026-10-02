const APP_VERSION = '2.0.0';
const CACHE_NAME = 'cals-v' + APP_VERSION;

// Only cache CSS and images - never JS
const STATIC_ASSETS = [
  '/static/css/style.css'
];

// Install
self.addEventListener('install', (event) => {
  console.log(`Service Worker v${APP_VERSION} installing...`);
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  console.log(`Service Worker v${APP_VERSION} activating...`);
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME)
            .map((key) => {
              console.log(`Deleting old cache: ${key}`);
              return caches.delete(key);
            })
      );
    })
  );
  self.clients.claim();
});

// Fetch
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // NEVER cache JS files - always fetch from network
  if (url.pathname.endsWith('.js')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
    );
    return;
  }
  
  // API calls - network only
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // HTML - network first, no caching
  if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
    );
    return;
  }
  
  // CSS and images - cache first
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    })
  );
});
