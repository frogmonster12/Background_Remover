import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Current cache name, read from the SW source so the test can't drift.
const swSource = readFileSync(path.join(__dirname, '..', '..', 'public', 'sw.js'), 'utf8');
const CACHE_NAME = `cutout-${swSource.match(/CACHE_VERSION\s*=\s*'([^']+)'/)![1]!}`;

/** Wait until the page is controlled by the service worker (post clients.claim). */
async function waitForSWControl(page: import('@playwright/test').Page): Promise<void> {
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    undefined,
    { timeout: 15000 },
  );
}

test.describe('Service worker cache', () => {
  test('registers and takes control of the page', async ({ page }) => {
    await page.goto('/');
    await waitForSWControl(page);
    const scope = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return reg?.scope ?? null;
    });
    expect(scope).not.toBeNull();
  });

  test('only the current versioned cache exists after a controlled fetch', async ({ page }) => {
    await page.goto('/');
    await waitForSWControl(page);
    const cutoutCaches = await page.evaluate(async () => {
      // The cache is created lazily on the first SW-intercepted request —
      // trigger one now that the page is controlled.
      await fetch('/');
      return (await caches.keys()).filter((k) => k.startsWith('cutout-'));
    });
    expect(cutoutCaches).toEqual([CACHE_NAME]);
  });

  test('SPA-fallback / error response for a .onnx request is NOT cached', async ({ page }) => {
    await page.goto('/');
    await waitForSWControl(page);

    // The dev server answers this bogus model URL with the SPA shell
    // (200 text/html) — the exact response that poisoned the v2.0.0 cache.
    const result = await page.evaluate(async (cacheName) => {
      const url = '/models/does-not-exist/model.onnx';
      const res = await fetch(url);
      const cache = await caches.open(cacheName);
      const cached = await cache.match(url);
      return {
        status: res.status,
        contentType: res.headers.get('content-type') ?? '',
        wasCached: cached !== undefined,
      };
    }, CACHE_NAME);

    // Whether the server falls back to HTML (dev) or 404s (static host),
    // the response must never enter the cache.
    expect(
      result.status === 404 || result.contentType.includes('text/html'),
    ).toBe(true);
    expect(result.wasCached).toBe(false);
  });

  test('activate deletes stale version caches (poisoned v2.0.0 recovery)', async ({ page }) => {
    await page.goto('/');
    await waitForSWControl(page);

    // Simulate the broken state: an old-version cache holding an HTML page
    // stored under a model URL. Then register the SW under a new script URL
    // (?v= query) — the browser treats it as an update, so install + activate
    // re-run: the same code path as deploying a new CACHE_VERSION.
    await page.evaluate(async () => {
      const stale = await caches.open('cutout-v2.0.0');
      await stale.put(
        '/models/onnx-community/ormbg-ONNX/onnx/model_uint8.onnx',
        new Response('<!doctype html><html></html>', {
          headers: { 'content-type': 'text/html' },
        }),
      );

      const newReg = await navigator.serviceWorker.register('/sw.js?v=e2e-update');
      // newReg.active is still the OLD worker — wait for the NEW (installing)
      // worker to reach 'activated', which happens only after its activate
      // handler's waitUntil (the cache cleanup) settles.
      const incoming = newReg.installing ?? newReg.waiting;
      if (incoming && incoming.state !== 'activated') {
        await new Promise<void>((resolve) => {
          incoming.addEventListener('statechange', () => {
            if (incoming.state === 'activated') resolve();
          });
        });
      }
    });

    const keys = await page.evaluate(() => caches.keys());
    expect(keys).not.toContain('cutout-v2.0.0');
  });

  test('update bar exists but is hidden by default', async ({ page }) => {
    await page.goto('/');
    const updateBar = page.locator('[data-testid="update-bar"]');
    await expect(updateBar).toHaveCount(1);
    await expect(updateBar).not.toHaveClass(/visible/);
  });
});
