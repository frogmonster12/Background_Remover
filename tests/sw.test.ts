/**
 * Unit tests for public/sw.js — cache poisoning protection.
 *
 * The SW is plain JS (no exports), so it is loaded into a mocked
 * ServiceWorkerGlobalScope via `new Function` and exercised through its
 * install / activate / fetch event listeners. Node 24 provides Response,
 * Headers and URL natively, so the real file runs unmodified.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SW_SOURCE = readFileSync(join(__dirname, '..', 'public', 'sw.js'), 'utf8');
const ORIGIN = 'https://cutout.example';

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

interface MockRequest {
  method: string;
  url: string;
  mode: string;
}

function makeRequest(path: string, mode = 'cors'): MockRequest {
  return { method: 'GET', url: `${ORIGIN}${path}`, mode };
}

interface Harness {
  dispatch(type: 'install' | 'activate', event?: unknown): void;
  /** Dispatch a fetch event; resolves the response and all waitUntil work. */
  dispatchFetch(req: MockRequest): Promise<Response | undefined>;
  cacheContents(name: string): Map<string, Response>;
  cacheNames(): string[];
  skipWaiting: ReturnType<typeof vi.fn>;
  clientsClaim: ReturnType<typeof vi.fn>;
  setFetchImpl(impl: (req: MockRequest) => Promise<Response>): void;
  /** Pre-populate a named cache before any events run. */
  seedCache(name: string, path: string, response: Response): void;
}

function loadSW(): Harness {
  const listeners = new Map<string, ((event: unknown) => void)[]>();
  const cacheStores = new Map<string, Map<string, Response>>();
  let fetchImpl: (req: MockRequest) => Promise<Response> = () =>
    Promise.reject(new Error('fetch not stubbed'));

  function getStore(name: string): Map<string, Response> {
    if (!cacheStores.has(name)) cacheStores.set(name, new Map());
    return cacheStores.get(name)!;
  }

  function makeCache(name: string) {
    const store = getStore(name);
    return {
      match: (req: MockRequest) => Promise.resolve(store.get(req.url)),
      put: (req: MockRequest, res: Response) => {
        store.set(req.url, res);
        return Promise.resolve();
      },
    };
  }

  const cachesMock = {
    open: (name: string) => Promise.resolve(makeCache(name)),
    keys: () => Promise.resolve([...cacheStores.keys()]),
    delete: (name: string) => Promise.resolve(cacheStores.delete(name)),
  };

  const skipWaiting = vi.fn();
  const clientsClaim = vi.fn();
  const selfMock = {
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type)!.push(fn);
    },
    skipWaiting,
    clients: { claim: clientsClaim },
    location: { origin: ORIGIN },
  };

  // Run the real sw.js with mocked globals
  new Function('self', 'caches', 'fetch', 'Response', 'Headers', 'URL', SW_SOURCE)(
    selfMock,
    cachesMock,
    (req: MockRequest) => fetchImpl(req),
    Response,
    Headers,
    URL,
  );

  return {
    dispatch(type, event = {}) {
      for (const fn of listeners.get(type) ?? []) fn(event);
    },
    async dispatchFetch(req) {
      let responsePromise: Promise<Response> | undefined;
      const pending: Promise<unknown>[] = [];
      const event = {
        request: req,
        respondWith: (p: Promise<Response>) => { responsePromise = p; },
        waitUntil: (p: Promise<unknown>) => { pending.push(p); },
      };
      for (const fn of listeners.get('fetch') ?? []) fn(event);
      const response = responsePromise ? await responsePromise : undefined;
      await Promise.allSettled(pending);
      return response;
    },
    cacheContents: getStore,
    cacheNames: () => [...cacheStores.keys()],
    skipWaiting,
    clientsClaim,
    setFetchImpl(impl) { fetchImpl = impl; },
    seedCache(name, path, response) {
      getStore(name).set(`${ORIGIN}${path}`, response);
    },
  };
}

function currentCacheName(): string {
  const m = SW_SOURCE.match(/CACHE_VERSION\s*=\s*'([^']+)'/);
  if (!m) throw new Error('CACHE_VERSION not found in sw.js');
  return `cutout-${m[1]!}`;
}

function htmlResponse(status = 200): Response {
  return new Response('<!doctype html><html><body>SPA shell</body></html>', {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function binaryResponse(contentType: string): Response {
  return new Response(new Uint8Array([0x08, 0x01, 0x12]), {
    status: 200,
    headers: contentType ? { 'content-type': contentType } : {},
  });
}

// ---------------------------------------------------------------------------
// install / activate
// ---------------------------------------------------------------------------

describe('sw.js — install', () => {
  it('calls skipWaiting so a new SW activates without waiting for old tabs', () => {
    const sw = loadSW();
    sw.dispatch('install');
    expect(sw.skipWaiting).toHaveBeenCalled();
  });
});

describe('sw.js — activate', () => {
  it('deletes every cache that does not match the current version', async () => {
    const sw = loadSW();
    sw.seedCache('cutout-v2.0.0', '/models/model.onnx', htmlResponse()); // poisoned old cache
    sw.seedCache('cutout-v1.9.0', '/index.html', htmlResponse());
    sw.seedCache(currentCacheName(), '/keep.js', binaryResponse('text/javascript'));

    let done: Promise<unknown> = Promise.resolve();
    sw.dispatch('activate', { waitUntil: (p: Promise<unknown>) => { done = p; } });
    await done;

    expect(sw.cacheNames()).toEqual([currentCacheName()]);
  });

  it('claims open clients after cleanup', async () => {
    const sw = loadSW();
    let done: Promise<unknown> = Promise.resolve();
    sw.dispatch('activate', { waitUntil: (p: Promise<unknown>) => { done = p; } });
    await done;
    expect(sw.clientsClaim).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// fetch — poisoning protection
// ---------------------------------------------------------------------------

describe('sw.js — fetch handler never caches bad responses', () => {
  it('does NOT cache a 404 for a .onnx request', async () => {
    const sw = loadSW();
    sw.setFetchImpl(() => Promise.resolve(new Response('Not found', { status: 404 })));
    await sw.dispatchFetch(makeRequest('/models/ormbg/onnx/model_uint8.onnx'));
    expect(sw.cacheContents(currentCacheName()).size).toBe(0);
  });

  it('does NOT cache a text/html (SPA fallback) response for a .onnx request', async () => {
    const sw = loadSW();
    sw.setFetchImpl(() => Promise.resolve(htmlResponse(200)));
    const res = await sw.dispatchFetch(makeRequest('/models/ormbg/onnx/model_uint8.onnx'));
    // Response is still passed through to the page (it will fail there visibly)…
    expect(res?.status).toBe(200);
    // …but it must never enter the cache.
    expect(sw.cacheContents(currentCacheName()).size).toBe(0);
  });

  it('does NOT cache a text/html response for a .wasm request', async () => {
    const sw = loadSW();
    sw.setFetchImpl(() => Promise.resolve(htmlResponse(200)));
    await sw.dispatchFetch(makeRequest('/ort/ort-wasm-simd-threaded.wasm'));
    expect(sw.cacheContents(currentCacheName()).size).toBe(0);
  });

  it('does NOT cache a 500 error for any asset', async () => {
    const sw = loadSW();
    sw.setFetchImpl(() => Promise.resolve(new Response('oops', { status: 500 })));
    await sw.dispatchFetch(makeRequest('/assets/index.js'));
    expect(sw.cacheContents(currentCacheName()).size).toBe(0);
  });

  it('caches a valid application/octet-stream response for a .onnx request', async () => {
    const sw = loadSW();
    sw.setFetchImpl(() => Promise.resolve(binaryResponse('application/octet-stream')));
    await sw.dispatchFetch(makeRequest('/models/ormbg/onnx/model_uint8.onnx'));
    const store = sw.cacheContents(currentCacheName());
    expect(store.size).toBe(1);
    expect([...store.keys()][0]).toContain('model_uint8.onnx');
  });

  it('caches a valid application/wasm response for a .wasm request', async () => {
    const sw = loadSW();
    sw.setFetchImpl(() => Promise.resolve(binaryResponse('application/wasm')));
    await sw.dispatchFetch(makeRequest('/ort/ort-wasm-simd-threaded.wasm'));
    expect(sw.cacheContents(currentCacheName()).size).toBe(1);
  });

  it('tolerates a missing content-type on binaries (some static hosts omit it)', async () => {
    const sw = loadSW();
    sw.setFetchImpl(() => Promise.resolve(binaryResponse('')));
    await sw.dispatchFetch(makeRequest('/models/ormbg/onnx/model_uint8.onnx'));
    expect(sw.cacheContents(currentCacheName()).size).toBe(1);
  });

  it('caches text/html for a navigation request (expected type)', async () => {
    const sw = loadSW();
    sw.setFetchImpl(() => Promise.resolve(htmlResponse(200)));
    await sw.dispatchFetch(makeRequest('/', 'navigate'));
    expect(sw.cacheContents(currentCacheName()).size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// fetch — offline behaviour
// ---------------------------------------------------------------------------

describe('sw.js — offline behaviour', () => {
  it('serves the cached entry when the network is unavailable', async () => {
    const sw = loadSW();
    // First visit online: model is fetched and cached
    sw.setFetchImpl(() => Promise.resolve(binaryResponse('application/octet-stream')));
    await sw.dispatchFetch(makeRequest('/models/ormbg/onnx/model_uint8.onnx'));
    // Now offline: fetch rejects
    sw.setFetchImpl(() => Promise.reject(new TypeError('Failed to fetch')));
    const res = await sw.dispatchFetch(makeRequest('/models/ormbg/onnx/model_uint8.onnx'));
    expect(res).toBeDefined();
    expect(res!.ok).toBe(true);
    const body = new Uint8Array(await res!.arrayBuffer());
    expect(body.length).toBeGreaterThan(0); // real binary, not HTML
  });

  it('cached binary entry is the binary, not an HTML page', async () => {
    const sw = loadSW();
    sw.setFetchImpl(() => Promise.resolve(binaryResponse('application/octet-stream')));
    await sw.dispatchFetch(makeRequest('/models/ormbg/onnx/model_uint8.onnx'));
    const store = sw.cacheContents(currentCacheName());
    const cached = [...store.values()][0]!;
    expect((cached.headers.get('content-type') || '')).not.toContain('text/html');
  });

  it('does not let a later HTML fallback overwrite a good cached binary', async () => {
    const sw = loadSW();
    sw.setFetchImpl(() => Promise.resolve(binaryResponse('application/octet-stream')));
    await sw.dispatchFetch(makeRequest('/models/ormbg/onnx/model_uint8.onnx'));
    // Server breaks: starts returning the SPA shell for the model URL
    sw.setFetchImpl(() => Promise.resolve(htmlResponse(200)));
    await sw.dispatchFetch(makeRequest('/models/ormbg/onnx/model_uint8.onnx'));
    const cached = [...sw.cacheContents(currentCacheName()).values()][0]!;
    expect((cached.headers.get('content-type') || '')).toContain('octet-stream');
  });
});

// ---------------------------------------------------------------------------
// fetch — scope
// ---------------------------------------------------------------------------

describe('sw.js — request scope', () => {
  it('ignores cross-origin requests (no respondWith)', async () => {
    const sw = loadSW();
    sw.setFetchImpl(() => Promise.resolve(binaryResponse('application/octet-stream')));
    const res = await sw.dispatchFetch({
      method: 'GET',
      url: 'https://huggingface.co/onnx-community/ormbg-ONNX/resolve/main/onnx/model_uint8.onnx',
      mode: 'cors',
    });
    expect(res).toBeUndefined();
    expect(sw.cacheContents(currentCacheName()).size).toBe(0);
  });

  it('ignores non-GET requests', async () => {
    const sw = loadSW();
    const res = await sw.dispatchFetch({ method: 'POST', url: `${ORIGIN}/api`, mode: 'cors' });
    expect(res).toBeUndefined();
  });
});
