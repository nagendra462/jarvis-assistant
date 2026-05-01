const CACHE_NAME = 'jarvis-v2';
const OFFLINE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Pre-cache the app shell on install
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(OFFLINE_ASSETS))
  );
  self.skipWaiting();
});

// Clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first with cache fallback (skip API calls from caching)
self.addEventListener('fetch', e => {
  // Don't cache API calls or POST requests
  if (e.request.method !== 'GET' || e.request.url.includes('/api/')) return;

  e.respondWith(
    fetch(e.request)
      .then(response => {
        // Cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Offline — serve from cache
        return caches.match(e.request).then(cached => {
          // For navigation requests, always return index.html
          if (!cached && e.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return cached;
        });
      })
  );
});
