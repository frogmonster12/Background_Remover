/**
 * Diagnostic test — NOT part of the spike pass/fail.
 * Run with: npx playwright test --config playwright.inference.config.ts tests/e2e/inference-diag.spec.ts
 */
import { test } from '@playwright/test';

test('diagnose browser environment for ONNX inference', async ({ page }) => {
  test.setTimeout(30_000);

  const requests: Array<{ url: string; status: number | null; blocked: boolean }> = [];

  page.on('request', (req) => {
    if (req.url().includes('onnx') || req.url().includes('wasm') || req.url().includes('birefnet') || req.url().includes('BiRefNet')) {
      requests.push({ url: req.url(), status: null, blocked: false });
    }
  });

  page.on('response', (resp) => {
    const entry = requests.find((r) => r.url === resp.url());
    if (entry) entry.status = resp.status();
  });

  page.on('requestfailed', (req) => {
    const entry = requests.find((r) => r.url === req.url());
    if (entry) entry.blocked = true;
  });

  const allConsole: string[] = [];
  page.on('console', (msg) => {
    allConsole.push(`[${msg.type()}] ${msg.text()}`);
  });

  await page.goto('/');

  const env = await page.evaluate(() => ({
    crossOriginIsolated: (window as Window & { crossOriginIsolated?: boolean }).crossOriginIsolated ?? false,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    workerType: typeof Worker,
    webgpu: 'gpu' in navigator,
  }));

  console.log('\n=== Browser Environment ===');
  console.log(JSON.stringify(env, null, 2));

  // Test if CDN WASM fetch is blocked by COEP — check MIME type (must be application/wasm for streaming).
  const cdnWasmUrl = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/ort-wasm-simd-threaded.jsep.wasm';
  const fetchResult = await page.evaluate(async (url: string) => {
    try {
      const resp = await fetch(url, { method: 'HEAD' });
      return `HTTP ${resp.status}, CORP: ${resp.headers.get('Cross-Origin-Resource-Policy') ?? 'none'}, CORS: ${resp.headers.get('Access-Control-Allow-Origin') ?? 'none'}, Content-Type: ${resp.headers.get('Content-Type') ?? 'none'}`;
    } catch (e) {
      return `FETCH ERROR: ${String(e)}`;
    }
  }, cdnWasmUrl);

  // Test WebAssembly.instantiateStreaming from main thread.
  const wasmStreamResult = await page.evaluate(async (url: string) => {
    try {
      await WebAssembly.compileStreaming(fetch(url));
      return 'WASM streaming compile: OK';
    } catch (e) {
      return `WASM streaming compile ERROR: ${String(e)}`;
    }
  }, cdnWasmUrl);
  console.log('CDN WASM fetch result:', fetchResult);
  console.log('WASM streaming compile:', wasmStreamResult);

  // Quick model-load attempt in the main thread (just processor, no model) to see error.
  const workerUrl = new URL('/src/worker.ts', page.url()).toString();
  const workerResult = await page.evaluate(async (workerUrl: string) => {
    return new Promise<string>((resolve) => {
      const worker = new Worker(workerUrl, { type: 'module' });
      const timer = setTimeout(() => resolve('TIMEOUT after 15s'), 15_000);
      worker.onerror = (e) => { clearTimeout(timer); resolve(`Worker onerror: ${e.message}`); };
      worker.onmessage = ({ data }) => {
        if (data.type === 'error') { clearTimeout(timer); resolve(`Worker error msg: ${data.message}`); }
        if (data.type === 'progress') { /* just wait for more */ }
      };
      // Don't post a real job — just create the worker to trigger model load init.
      // After 15s, report timeout.
    });
  }, workerUrl);

  console.log('Worker init result:', workerResult);
  console.log('\n=== Network Requests ===');
  console.log(requests.map((r) => `${r.blocked ? '❌' : r.status ?? '?'} ${r.url}`).join('\n') || '(none recorded)');
  console.log('\n=== Console ===');
  console.log(allConsole.join('\n') || '(none)');
});
