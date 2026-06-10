/**
 * Generates the general-model test fixtures by rasterizing inline SVG scenes
 * with Playwright Chromium (already a dev dependency — no new packages).
 *
 * Run once: node tests/fixtures/generate-model-fixtures.mjs
 * Outputs:
 *   cartoon-sample.png  — flat-color cartoon character (the ORMBG failure case)
 *   product-sample.png  — product bottle on a plain studio background
 */
import { chromium } from '@playwright/test';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const OUT_DIR = dirname(fileURLToPath(import.meta.url));
const W = 640;
const H = 480;

const cartoonSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="#8ecae6"/>
  <ellipse cx="120" cy="80" rx="70" ry="26" fill="#ffffff" opacity="0.9"/>
  <ellipse cx="500" cy="120" rx="90" ry="30" fill="#ffffff" opacity="0.85"/>
  <rect y="400" width="${W}" height="80" fill="#74c69d"/>
  <!-- cartoon character: round body, big head, outlines -->
  <g stroke="#1d3557" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
    <ellipse cx="320" cy="330" rx="85" ry="75" fill="#ffb703"/>
    <circle cx="320" cy="185" r="95" fill="#ffb703"/>
    <path d="M 250 130 L 225 70 L 275 105 Z" fill="#fb8500"/>
    <path d="M 390 130 L 415 70 L 365 105 Z" fill="#fb8500"/>
    <circle cx="285" cy="175" r="14" fill="#ffffff"/>
    <circle cx="355" cy="175" r="14" fill="#ffffff"/>
    <circle cx="285" cy="178" r="6" fill="#1d3557" stroke="none"/>
    <circle cx="355" cy="178" r="6" fill="#1d3557" stroke="none"/>
    <path d="M 295 225 Q 320 250 345 225" fill="none"/>
    <ellipse cx="320" cy="345" rx="45" ry="38" fill="#fff3c4"/>
    <path d="M 245 300 L 195 340" fill="none"/>
    <path d="M 395 300 L 445 340" fill="none"/>
    <path d="M 290 400 L 285 440" fill="none"/>
    <path d="M 350 400 L 355 440" fill="none"/>
  </g>
</svg>`;

const productSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f4f4f2"/>
      <stop offset="1" stop-color="#dddbd6"/>
    </linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#2a4d69"/>
      <stop offset="0.45" stop-color="#4b86b4"/>
      <stop offset="0.55" stop-color="#9bc4e2"/>
      <stop offset="1" stop-color="#2a4d69"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <ellipse cx="320" cy="420" rx="120" ry="18" fill="#000000" opacity="0.18"/>
  <!-- product: a bottle with cap and label -->
  <rect x="295" y="60" width="50" height="36" rx="6" fill="#222831"/>
  <rect x="302" y="96" width="36" height="26" fill="#393e46"/>
  <path d="M 270 122 L 370 122 Q 395 160 395 210 L 395 390 Q 395 418 367 418 L 273 418 Q 245 418 245 390 L 245 210 Q 245 160 270 122 Z" fill="url(#glass)"/>
  <rect x="262" y="240" width="116" height="110" rx="8" fill="#fafafa"/>
  <rect x="276" y="262" width="88" height="10" rx="5" fill="#2a4d69"/>
  <rect x="276" y="284" width="64" height="8" rx="4" fill="#9aa5b1"/>
  <rect x="276" y="302" width="76" height="8" rx="4" fill="#9aa5b1"/>
  <rect x="276" y="326" width="44" height="8" rx="4" fill="#c44536"/>
  <rect x="258" y="135" width="14" height="240" rx="7" fill="#ffffff" opacity="0.35"/>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });

for (const [name, svg] of [['cartoon-sample.png', cartoonSvg], ['product-sample.png', productSvg]]) {
  await page.setContent(
    `<!doctype html><body style="margin:0">${svg}</body>`,
    { waitUntil: 'load' },
  );
  await page.screenshot({ path: join(OUT_DIR, name) });
  console.log(`wrote ${name}`);
}

await browser.close();
