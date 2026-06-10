/**
 * Fresh-clone / CDN-fallback verification (prompt 08) against the built preview.
 *
 * Phase A — fresh-clone simulation: hide dist/models/, confirm the app fetches
 *           the model from the Hugging Face CDN and still produces a cutout.
 * Phase B — error honesty: models still hidden AND HF blocked → the surfaced
 *           error names the real cause (missing model), not COEP.
 * Phase C — self-hosted path: restore dist/models/, confirm a cutout with
 *           ZERO huggingface requests.
 *
 * Service workers are blocked in all phases so Playwright request routing and
 * accounting see every fetch (the SW path is covered by verify-sw.mjs).
 *
 * Usage: node scripts/verify-fallback.mjs   (runs `npm run build` itself)
 *
 * Note (Jeff's machine): the default DNS resolver times out on HF's CDN hosts
 * (cas-bridge.xethub.hf.co etc.) while huggingface.co resolves fine. The script
 * resolves those hosts via 1.1.1.1 and pins them with --host-resolver-rules;
 * on machines/CI with healthy DNS this is skipped.
 */
import { chromium } from 'playwright';
import { execSync, spawn } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import { Resolver } from 'node:dns/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST_MODELS = path.join(ROOT, 'dist', 'models');
const DIST_MODELS_HIDDEN = path.join(ROOT, 'dist', '_models_hidden');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'hair-sample.jpg');
const BASE_URL = 'http://localhost:4173';
const INFERENCE_TIMEOUT = 600_000; // phase A downloads ~44 MB from the CDN
const HF_HOSTS = ['cas-bridge.xethub.hf.co', 'us.aws.cdn.hf.co'];

const isHF = (url) => /huggingface\.co|\.hf\.co/.test(url);

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
}

// ── DNS workaround: pin HF CDN hosts that the OS resolver can't resolve ─────
async function hostResolverArgs() {
  const rules = [];
  const cloudflare = new Resolver();
  cloudflare.setServers(['1.1.1.1']);
  for (const host of HF_HOSTS) {
    try {
      await lookup(host); // OS resolver works — no pin needed
    } catch {
      try {
        const [ip] = await cloudflare.resolve4(host);
        if (ip) {
          rules.push(`MAP ${host} ${ip}`);
          console.log(`(dns) pinned ${host} -> ${ip} via 1.1.1.1`);
        }
      } catch {
        console.log(`(dns) WARNING: ${host} unresolvable even via 1.1.1.1`);
      }
    }
  }
  return rules.length > 0 ? [`--host-resolver-rules=${rules.join(', ')}`] : [];
}

async function uploadAndWaitPhase(page) {
  await page.locator('#file-input').setInputFiles(FIXTURE);
  await page.locator('#workspace[data-phase="done"], #workspace[data-phase="error"]')
    .waitFor({ state: 'attached', timeout: INFERENCE_TIMEOUT });
  return page.locator('#workspace').getAttribute('data-phase');
}

// ── Build (with models present) and start the preview server ────────────────
if (!existsSync(path.join(ROOT, 'public', 'models'))) {
  console.error('public/models/ missing — run `npm run download:model` first.');
  process.exit(1);
}
console.log('Building...');
execSync('npm run build', { cwd: ROOT, stdio: 'inherit' });

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

const browser = await chromium.launch({ args: await hostResolverArgs() });

try {
  // ── Phase A: fresh clone — no local models, CDN fallback must fire ───────
  console.log('Phase A — fresh-clone simulation (dist/models hidden)');
  renameSync(DIST_MODELS, DIST_MODELS_HIDDEN);

  let ctx = await browser.newContext({ serviceWorkers: 'block' });
  let page = await ctx.newPage();
  const hfRequests = [];
  page.on('request', (req) => { if (isHF(req.url())) hfRequests.push(req.url()); });

  await page.goto(BASE_URL);
  const phaseA = await uploadAndWaitPhase(page);
  check('cutout produced with no local models (phase=done)', phaseA === 'done');
  check('Hugging Face CDN request actually made', hfRequests.length > 0,
    hfRequests[0] ? hfRequests[0].slice(0, 90) : 'none recorded');
  await ctx.close();

  // ── Phase B: models hidden AND CDN blocked — error must be honest ────────
  console.log('\nPhase B — error honesty (CDN blocked, models still hidden)');
  ctx = await browser.newContext({ serviceWorkers: 'block' });
  page = await ctx.newPage();
  await page.route((url) => isHF(url.href), (route) => route.abort());

  await page.goto(BASE_URL);
  const phaseB = await uploadAndWaitPhase(page);
  const statusText = (await page.locator('[data-testid="status-region"]').textContent()) ?? '';
  check('failure surfaces as phase=error', phaseB === 'error');
  check('error names the model / missing files', /could not be loaded|ormbg/i.test(statusText),
    statusText.slice(0, 140));
  const coi = await page.evaluate(() => window.crossOriginIsolated);
  check('error does NOT blame COEP while isolated', coi === true && !/COEP|COOP|isolat/i.test(statusText));
  await ctx.close();

  // ── Phase C: self-hosted path — zero HF requests ──────────────────────────
  console.log('\nPhase C — self-hosted (dist/models restored)');
  renameSync(DIST_MODELS_HIDDEN, DIST_MODELS);

  ctx = await browser.newContext({ serviceWorkers: 'block' });
  page = await ctx.newPage();
  const hfRequestsC = [];
  page.on('request', (req) => { if (isHF(req.url())) hfRequestsC.push(req.url()); });

  await page.goto(BASE_URL);
  const phaseC = await uploadAndWaitPhase(page);
  check('cutout produced from self-hosted models (phase=done)', phaseC === 'done');
  check('zero Hugging Face requests', hfRequestsC.length === 0,
    hfRequestsC[0] ? `unexpected: ${hfRequestsC[0].slice(0, 90)}` : '');
  await ctx.close();
} catch (err) {
  console.error('\nVERIFICATION ERROR:', err.message);
  failures++;
} finally {
  if (existsSync(DIST_MODELS_HIDDEN)) renameSync(DIST_MODELS_HIDDEN, DIST_MODELS);
  await browser.close();
  preview.kill();
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
