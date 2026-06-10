// Cutout service worker
//
// Strategy: cache-first with background refresh for same-origin GETs.
// Also injects COEP/COOP headers on navigation responses so
// SharedArrayBuffer (ORT multithreading) works on GitHub Pages.
//
// Cache-poisoning protection (the v2.0.0 cache had none and could serve a
// stale SPA-fallback HTML page for model/wasm URLs forever):
//   1. CACHE_VERSION is bumped on every release; `activate` deletes all
//      caches that don't match, then claims open clients.
//   2. A response is only cached when it is 2xx AND its content-type is
//      plausible for the request — text/html is never cached for an asset
//      request like *.onnx or *.wasm.

const CACHE_VERSION = 'v2.1.0';
const CACHE = `cutout-${CACHE_VERSION}`;

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

// Decide whether a response is safe to put in the cache for this request.
function shouldCache(request, response) {
  // Exactly 200 — cache.put() throws on partial (206) responses, which the
  // model-presence probe (Range: bytes=0-0 in inference.ts) can produce.
  if (!response || response.status !== 200) return false;

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const isHTML = contentType.includes('text/html');
  const pathname = new URL(request.url).pathname.toLowerCase();
  const extMatch = pathname.match(/\.([a-z0-9]+)$/);
  const ext = extMatch ? extMatch[1] : null;

  // Navigations, explicit .html requests, and directory paths expect HTML.
  if (request.mode === 'navigate') return true;
  if (ext === 'html' || pathname.endsWith('/')) return true;

  // Any other extension receiving HTML means the server fell back to the
  // SPA shell (or an error page) — never cache that.
  if (isHTML) return false;
  if (ext === null) return true;

  // Critical binaries get a stricter check. An empty content-type is
  // tolerated because some static hosts omit the header.
  if (ext === 'onnx') {
    return contentType === ''
      || contentType.includes('octet-stream')
      || contentType.includes('onnx');
  }
  if (ext === 'wasm') {
    return contentType === ''
      || contentType.includes('wasm')
      || contentType.includes('octet-stream');
  }
  return true;
}

self.addEventListener('install', () => {
  // Activate immediately instead of waiting for every old tab to close,
  // so a fixed SW can replace a broken one on the next load.
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
        const refresh = fetch(req).then((response) => {
          if (shouldCache(req, response)) cache.put(req, response.clone());
          return response;
        });

        if (cached) {
          // Cache-first: serve immediately, refresh in the background.
          event.waitUntil(refresh.catch(() => {/* offline — ignore */}));
          return isNavigation ? withCOI(cached) : cached;
        }

        return refresh
          .then((response) => (isNavigation ? withCOI(response) : response))
          .catch(() => Response.error());
      }),
    ),
  );
});
