/**
 * Live-URL verification: load the deployed site, run one real background
 * removal end-to-end, download the cutout, confirm it's a PNG with alpha.
 * Usage: node scripts/verify-live.mjs [url]
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'hair-sample.jpg');
const URL_ = process.argv[2] ?? 'https://frogmonster12.github.io/Background_Remover/';

const browser = await chromium.launch();
const page = await browser.newPage();
const consoleLines = [];
page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));

console.log('Loading', URL_);
await page.goto(URL_, { waitUntil: 'domcontentloaded' });

const isolated = await page.evaluate(() => window.crossOriginIsolated);
console.log('crossOriginIsolated:', isolated, '(needs SW second-load injection on Pages if false)');

await page.locator('#file-input').setInputFiles(FIXTURE);
console.log('Uploaded fixture, waiting for inference (cold model download may take a while)…');
await page.locator('#workspace[data-phase="done"], #workspace[data-phase="error"]')
  .waitFor({ state: 'attached', timeout: 600_000 });
const phase = await page.locator('#workspace').getAttribute('data-phase');
console.log('phase:', phase);

if (phase !== 'done') {
  console.log('error banner:', await page.locator('#error-banner-text').textContent().catch(() => '?'));
  consoleLines.slice(-12).forEach((l) => console.log(' ', l.slice(0, 250)));
  await browser.close();
  process.exit(1);
}

const backend = consoleLines.find((l) => l.includes('inference backend')) ?? '(not seen)';
console.log('backend:', backend);

const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.locator('[data-testid="download-btn"]').click(),
]);
const file = path.join(ROOT, 'tests', 'output', 'live-cutout.png');
await download.saveAs(file);
const buf = fs.readFileSync(file);
const isPNG = buf[0] === 0x89 && buf[1] === 0x50;
const hasAlpha = buf[25] === 6 || buf[25] === 4;
console.log(`downloaded: ${download.suggestedFilename()} (${(buf.length / 1024).toFixed(0)} KB) PNG=${isPNG} alpha=${hasAlpha}`);

await browser.close();
process.exit(isPNG && hasAlpha ? 0 : 1);
