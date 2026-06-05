// Cutout service worker — v2.0.0
// Strategy: cache-first + network-update for all same-origin GETs.
// Also injects COEP/COOP headers on navigation responses so
// SharedArrayBuffer (ORT multithreading) works on GitHub Pages.

const CACHE = 'cutout-v2.0.0';

// Inject cross-origin isolation headers onto a response.
// This lets ORT WASM use SharedArrayBuffer even on hosts that
// don't support custom response headers (e.g. GitHub Pages).
function withCOI(response) {
  const headers = new Headers(response.headers);
  if (!headers.has('Cross-Origin-Embedder-Policy')) {
    headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  }
  if (!headers.has('Cross-Origin-Opener-Policy')) {
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle same-origin GETs
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  const isNavigation = req.mode === 'navigate';

  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(req).then((cached) => {
        // Always try network to refresh the cache
        const networkFetch = fetch(req)
          .then((response) => {
            if (response.ok) cache.put(req, response.clone());
            return isNavigation ? withCOI(response) : response;
          })
          .catch(() => {
            if (cached) return isNavigation ? withCOI(cached) : cached;
            return Response.error();
          });

        // Cache-first: serve cached immediately while updating in background
        if (cached) {
          // Still update cache in background
          fetch(req)
            .then((res) => { if (res.ok) cache.put(req, res.clone()); })
            .catch(() => {/* offline — ignore */});
          return isNavigation ? withCOI(cached) : cached;
        }

        return networkFetch;
      }),
    ),
  );
});
