'use client';

/**
 * Register Service Worker for offline route tile caching and PWA support.
 * In development mode, unregisters any active service worker to prevent stale chunk caching.
 */
export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  // Never register or run service workers in development mode
  if (process.env.NODE_ENV !== 'production') {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const reg of registrations) {
        reg.unregister().then((unregistered) => {
          if (unregistered) {
            console.log('[PWA] Unregistered development ServiceWorker:', reg.scope);
          }
        });
      }
    });

    if ('caches' in window) {
      caches.keys().then((keys) => {
        for (const key of keys) {
          caches.delete(key);
        }
      });
    }
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('PWA ServiceWorker registered with scope:', reg.scope);
      })
      .catch((err) => {
        console.warn('PWA ServiceWorker registration failed:', err);
      });
  });
}

/**
 * Checks whether the app currently has an active network connection.
 */
export function isOnline(): boolean {
  if (typeof window === 'undefined') return true;
  return navigator.onLine;
}

/**
 * Pre-cache map tiles around route waypoints for offline driving.
 */
export async function preCacheRouteTiles(
  waypoints: Array<{ lat: number; lng: number }>,
  zoomLevels = [12, 13, 14]
) {
  if (typeof window === 'undefined' || !('caches' in window)) return;

  try {
    const tileCache = await caches.open('trip-planner-map-tiles');
    // For each key point, prefetch OSM or standard raster tiles if possible
    for (const pt of waypoints.slice(0, 15)) {
      for (const z of zoomLevels) {
        const x = Math.floor(((pt.lng + 180) / 360) * Math.pow(2, z));
        const latRad = (pt.lat * Math.PI) / 180;
        const y = Math.floor(
          ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * Math.pow(2, z)
        );

        const tileUrl = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
        const exists = await tileCache.match(tileUrl);
        if (!exists) {
          fetch(tileUrl, { mode: 'no-cors' })
            .then((res) => {
              if (res) tileCache.put(tileUrl, res);
            })
            .catch(() => {});
        }
      }
    }
  } catch (err) {
    console.warn('Tile pre-caching encountered an error:', err);
  }
}
