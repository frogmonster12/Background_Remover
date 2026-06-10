/**
 * Brush redraw benchmark — full-frame applyMask vs dirty-region applyMaskRegion
 * on a 3000×2000 image, measured in real Chromium against the Vite dev server.
 *
 * Usage: node scripts/bench-brush.mjs   (starts its own dev server on :5198)
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 5198;
const BASE_URL = `http://localhost:${PORT}`;

const dev = spawn('npx', ['vite', '--port', String(PORT)], {
  cwd: ROOT, shell: true, stdio: 'pipe',
  env: { ...process.env, USE_REAL_MODEL: 'false' },
});
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('dev server timeout')), 30_000);
  const poll = async () => {
    try {
      const res = await fetch(BASE_URL);
      if (res.ok) { clearTimeout(t); resolve(); return; }
    } catch { /* not up yet */ }
    setTimeout(poll, 400);
  };
  poll();
});

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(BASE_URL);

const results = await page.evaluate(async () => {
  const { applyMask, applyMaskRegion } = await import('/src/compose.ts');

  const W = 3000, H = 2000;

  // Deterministic gradient source + varied mask
  const src = new OffscreenCanvas(W, H);
  const sctx = src.getContext('2d');
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = (i * 7) % 256;
    data[i * 4 + 1] = (i * 13) % 256;
    data[i * 4 + 2] = (i * 29) % 256;
    data[i * 4 + 3] = 255;
  }
  sctx.putImageData(new ImageData(data, W, H), 0, 0);
  const mask = new Uint8ClampedArray(W * H);
  for (let i = 0; i < W * H; i++) mask[i] = (i * 37) % 256;

  const preview = new OffscreenCanvas(W, H);
  const pctx = preview.getContext('2d');

  const median = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };

  // ── BEFORE: full recomposite + full drawImage (old per-move path) ────────
  const fullTimes = [];
  for (let i = 0; i < 15; i++) {
    const t0 = performance.now();
    const composed = applyMask(src, mask, { mode: 'transparent' });
    pctx.clearRect(0, 0, W, H);
    pctx.drawImage(composed, 0, 0);
    fullTimes.push(performance.now() - t0);
  }

  // ── AFTER: dirty-region recomposite + putImageData ───────────────────────
  const srcData = sctx.getImageData(0, 0, W, H);
  const scenarios = {
    // brush radius 24 (default) + 30px movement → pad 25 → 80×80 rect
    'region transparent r=24': { opts: { mode: 'transparent' }, rect: { x: 1500, y: 1000, width: 80, height: 80 } },
    // worst-case brush radius 120 + 40px movement → ~282×282 rect
    'region transparent r=120': { opts: { mode: 'transparent' }, rect: { x: 1400, y: 900, width: 282, height: 282 } },
    'region color r=24': { opts: { mode: 'color', color: '#3366cc' }, rect: { x: 1500, y: 1000, width: 80, height: 80 } },
    // feather adds an O(r²) window per pixel — measure the worst slider combo
    'region transparent r=120 feather=20': { opts: { mode: 'transparent', feather: 20 }, rect: { x: 1400, y: 900, width: 322, height: 322 } },
    'region transparent r=24 feather=5': { opts: { mode: 'transparent', feather: 5 }, rect: { x: 1500, y: 1000, width: 90, height: 90 } },
  };

  const out = { 'full recomposite 3000x2000 (BEFORE)': median(fullTimes) };
  for (const [name, { opts, rect }] of Object.entries(scenarios)) {
    const times = [];
    for (let i = 0; i < 60; i++) {
      const t0 = performance.now();
      const patch = applyMaskRegion(srcData, mask, opts, rect);
      pctx.putImageData(patch.data, patch.x, patch.y);
      times.push(performance.now() - t0);
    }
    out[name] = median(times);
  }

  // One-time source extraction cost (paid once per image on pointerdown)
  const t0 = performance.now();
  sctx.getImageData(0, 0, W, H);
  out['one-time getImageData 3000x2000'] = performance.now() - t0;

  return out;
});

console.log('\nMedian times (ms) — 3000×2000 image, Chromium:');
for (const [k, v] of Object.entries(results)) {
  console.log(`  ${v.toFixed(2).padStart(8)}  ${k}`);
}

await browser.close();
dev.kill();
process.exit(0);
