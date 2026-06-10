/**
 * Ship-check 1: does inference engage WebGPU in a real (headed) browser?
 * Reports adapter info, cross-origin isolation, chosen backend, and which
 * model variant was fetched. Run: npm run build && node scripts/check-webgpu.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'hair-sample.jpg');
const BASE_URL = 'http://localhost:4173';

const preview = spawn('npm', ['run', 'preview'], { cwd: ROOT, shell: true, stdio: 'pipe' });
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('preview timeout')), 30_000);
  const poll = async () => {
    try { if ((await fetch(BASE_URL)).ok) { clearTimeout(t); resolve(); return; } } catch {}
    setTimeout(poll, 400);
  };
  poll();
});

// Headed launch so the real GPU is available (headless often gets SwiftShader).
let browser;
try {
  browser = await chromium.launch({ headless: false, channel: 'chrome' });
  console.log('Browser: installed Google Chrome (headed)');
} catch {
  browser = await chromium.launch({ headless: false });
  console.log('Browser: Playwright Chromium (headed)');
}

const page = await browser.newPage();
const consoleLines = [];
const modelRequests = [];
page.on('console', (m) => consoleLines.push(m.text()));
page.on('request', (r) => {
  if (r.url().includes('.onnx')) modelRequests.push(r.url());
});

await page.goto(BASE_URL);

const gpuInfo = await page.evaluate(async () => {
  const out = { crossOriginIsolated: window.crossOriginIsolated, hasGPU: 'gpu' in navigator };
  if (!out.hasGPU) return out;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) { out.adapter = null; return out; }
    out.adapter = {
      vendor: adapter.info?.vendor ?? '?',
      architecture: adapter.info?.architecture ?? '?',
      device: adapter.info?.device ?? '?',
      description: adapter.info?.description ?? '?',
      isFallbackAdapter: adapter.isFallbackAdapter ?? adapter.info?.isFallbackAdapter ?? '?',
    };
  } catch (e) {
    out.adapterError = e.message;
  }
  return out;
});
console.log('crossOriginIsolated:', gpuInfo.crossOriginIsolated);
console.log('navigator.gpu present:', gpuInfo.hasGPU);
console.log('adapter:', JSON.stringify(gpuInfo.adapter ?? gpuInfo.adapterError ?? 'none'));

console.log('\nUploading fixture, waiting for inference…');
await page.locator('#file-input').setInputFiles(FIXTURE);
await page.locator('#workspace[data-phase="done"], #workspace[data-phase="error"]')
  .waitFor({ state: 'attached', timeout: 300_000 });
const phase = await page.locator('#workspace').getAttribute('data-phase');

const backendLine = consoleLines.find((l) => l.includes('inference backend'));
console.log('\nfinal phase:', phase);
console.log('backend log:', backendLine ?? '(not seen)');
console.log('model files requested:', modelRequests.length ? modelRequests.map((u) => u.split('/').pop()).join(', ') : '(cache hit — none over network)');

if (phase === 'error') {
  const errText = await page.locator('#error-banner-text').textContent().catch(() => '?');
  console.log('\nerror banner:', errText);
  console.log('\n--- console output ---');
  consoleLines.forEach((l) => console.log(' ', l.slice(0, 300)));
}

await browser.close();
preview.kill();
process.exit(phase === 'done' ? 0 : 1);
