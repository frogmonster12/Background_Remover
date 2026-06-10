/**
 * SW cache-fix verification against the built preview (npm run build first).
 *
 * Simulates the real-world broken state in a persistent browser profile:
 *   Phase A — serve the OLD v2.0.0 sw.js, poison its cache (SPA HTML stored
 *             under the model URL, same for transformers-cache), confirm the
 *             app is broken.
 *   Phase B — restore the NEW sw.js (the "deploy"), reload the same profile,
 *             confirm: update bar appears, old caches are deleted, background
 *             removal works again — no manual storage clearing.
 *   Phase C — go offline, reload, confirm removal still works (model served
 *             from cache).
 *
 * Usage: npm run build && node scripts/verify-sw.mjs
 */
import { chromium } from 'playwright';
import { execSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST_SW = path.join(ROOT, 'dist', 'sw.js');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'hair-sample.jpg');
const BASE_URL = 'http://localhost:4173';
const MODEL_URL_PATH = '/models/onnx-community/ormbg-ONNX/onnx/model_uint8.onnx';
const INFERENCE_TIMEOUT = 300_000;

let failures = 0;
function check(label, ok) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failures++;
}

// ── Old (broken) sw.js, pinned to the last pre-fix commit ──────────────────
// cb29e33 is the SW fix; its parent still has the unversioned v2.0.0 worker.
const OLD_SW_REV = 'cb29e33~1';
const newSW = readFileSync(DIST_SW, 'utf8');
const oldSW = execSync(`git show ${OLD_SW_REV}:public/sw.js`, { cwd: ROOT, encoding: 'utf8' });
if (!oldSW.includes("'cutout-v2.0.0'")) {
  console.error(`Expected ${OLD_SW_REV} sw.js to be the old v2.0.0 version — aborting.`);
  process.exit(1);
}

// ── Start preview server ────────────────────────────────────────────────────
const preview = spawn('npm', ['run', 'preview'], { cwd: ROOT, shell: true, stdio: 'pipe' });
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('preview server timeout')), 30_000);
  const poll = async () => {
    try {
      const res = await fetch(BASE_URL);
      if (res.ok) { clearTimeout(t); resolve(); return; }
    } catch { /* not up yet */ }
    setTimeout(poll, 500);
  };
  poll();
});
console.log('Preview server up.\n');

const profileDir = mkdtempSync(path.join(tmpdir(), 'cutout-sw-verify-'));

async function uploadAndWaitPhase(page) {
  await page.locator('#file-input').setInputFiles(FIXTURE);
  await page.locator('#workspace[data-phase="done"], #workspace[data-phase="error"]')
    .waitFor({ state: 'attached', timeout: INFERENCE_TIMEOUT });
  return page.locator('#workspace').getAttribute('data-phase');
}

// Switch the loaded image to the General (ISNet) model and wait for the re-run.
async function switchToGeneralAndWait(page) {
  await page.locator('[data-testid="model-general"]').click();
  await page.locator('#workspace[data-phase="processing"]')
    .waitFor({ state: 'attached', timeout: 15_000 });
  await page.locator('#workspace[data-phase="done"], #workspace[data-phase="error"]')
    .waitFor({ state: 'attached', timeout: INFERENCE_TIMEOUT });
  return page.locator('#workspace').getAttribute('data-phase');
}

try {
  // ── Phase A: reproduce the broken profile with the OLD sw.js ─────────────
  console.log('Phase A — reproduce broken state (old v2.0.0 SW, poisoned cache)');
  writeFileSync(DIST_SW, oldSW);

  let ctx = await chromium.launchPersistentContext(profileDir, { headless: true });
  let page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(BASE_URL);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 15_000 });

  // Poison both cache layers with the SPA shell, as the original incident did.
  await page.evaluate(async (modelPath) => {
    const html = new Response('<!doctype html><html><body>stale shell</body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
    const sw = await caches.open('cutout-v2.0.0');
    await sw.put(modelPath, html.clone());
    const tf = await caches.open('transformers-cache');
    await tf.put(new URL(modelPath, location.origin).href, html.clone());
  }, MODEL_URL_PATH);

  const phaseBroken = await uploadAndWaitPhase(page);
  check('app is broken with poisoned cache (phase=error)', phaseBroken === 'error');
  await ctx.close();

  // ── Phase B: "deploy" the fixed sw.js, reload the same profile ───────────
  console.log('\nPhase B — deploy new SW, same profile, no manual clearing');
  writeFileSync(DIST_SW, newSW);

  ctx = await chromium.launchPersistentContext(profileDir, { headless: true });
  page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(BASE_URL);

  // New SW installs in the background → skipWaiting → claim → update bar.
  await page.locator('#update-bar.visible').waitFor({ state: 'visible', timeout: 30_000 });
  check('update bar appears when the new SW takes over', true);

  await page.locator('#update-reload-btn').click();
  await page.waitForLoadState('domcontentloaded');

  const cacheNames = await page.evaluate(() => caches.keys());
  check('old cutout-v2.0.0 cache deleted', !cacheNames.includes('cutout-v2.0.0'));
  check('poisoned transformers-cache deleted', !cacheNames.includes('transformers-cache'));

  const phaseFixed = await uploadAndWaitPhase(page);
  check('background removal works after update (phase=done)', phaseFixed === 'done');

  // First online use of the General model — warms the SW cache with the fp16 weights.
  const phaseGeneralOnline = await switchToGeneralAndWait(page);
  check('General model (ISNet) works online (phase=done)', phaseGeneralOnline === 'done');

  // ── Phase C: offline reload, removal still works ──────────────────────────
  console.log('\nPhase C — offline');
  await ctx.setOffline(true);
  await page.reload();
  const phaseOffline = await uploadAndWaitPhase(page);
  check('background removal works offline (model from cache)', phaseOffline === 'done');

  const phaseGeneralOffline = await switchToGeneralAndWait(page);
  check('General model works offline (fp16 from cache)', phaseGeneralOffline === 'done');

  const isolated = await page.evaluate(() => window.crossOriginIsolated);
  check('crossOriginIsolated preserved offline (COI headers from SW cache)', isolated === true);

  await ctx.close();
} catch (err) {
  console.error('\nVERIFICATION ERROR:', err.message);
  failures++;
} finally {
  writeFileSync(DIST_SW, newSW); // always restore the real build output
  preview.kill();
  try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* profile lock */ }
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
