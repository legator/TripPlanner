// Trip Planner Service Worker: Offline Route & Map Tile Caching
const CACHE_VERSION = 'trip-planner-v3';
const TILE_CACHE_NAME = 'trip-planner-map-tiles';
const DATA_CACHE_NAME = 'trip-planner-data';

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('Pre-caching static assets failed:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_VERSION && key !== TILE_CACHE_NAME && key !== DATA_CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Cache map tiles & GET data responses
self.addEventListener('fetch', (event) => {
  // CRITICAL: CacheStorage API only supports 'GET' requests.
  // POST requests (like /api/plan, /api/traffic/incidents, /api/route/eta) must bypass the cache.
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // 1. Bypass Service Worker entirely for localhost/development or Next.js internal chunks
  if (
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.pathname.startsWith('/_next/')
  ) {
    return;
  }

  // 2. Map Tiles (HERE, Google Maps, OpenStreetMap tiles)
  const isMapTile =
    url.hostname.includes('hereapi.com') ||
    url.hostname.includes('maps.googleapis.com') ||
    url.hostname.includes('tile.openstreetmap.org') ||
    url.pathname.includes('/maptile/') ||
    url.pathname.includes('/vectortile/');

  if (isMapTile) {
    event.respondWith(
      caches.open(TILE_CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          // Stale-while-revalidate in background
          fetch(event.request)
            .then((fresh) => {
              if (fresh && fresh.status === 200) cache.put(event.request, fresh);
            })
            .catch(() => {});
          return cachedResponse;
        }

        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          // If offline and not in cache, return empty status or fail gracefully
          return new Response(null, { status: 503, statusText: 'Offline' });
        }
      })
    );
    return;
  }

  // 3. GET API caching (places nearby, fuel prices, geocoding)
  if (url.pathname.startsWith('/api/places') || url.pathname.startsWith('/api/fuel')) {
    event.respondWith(
      caches.open(DATA_CACHE_NAME).then(async (cache) => {
        try {
          const networkResponse = await fetch(event.request.clone());
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch {
          const cached = await cache.match(event.request);
          if (cached) return cached;
          return new Response(JSON.stringify({ error: 'Offline' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      })
    );
    return;
  }

  // 4. HTML Page Navigation: Network-First (always fresh code, offline fallback)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match('/');
          if (cached) return cached;
          return new Response('Offline', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          });
        })
    );
    return;
  }

  // 5. Static Assets fallback
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).catch(() => {
          return new Response('Not Found', { status: 404 });
        })
      );
    })
  );
});
