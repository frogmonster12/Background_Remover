import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { expect, test, type Page } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, '../fixtures');
const OUTPUT   = path.resolve(__dirname, '../output');

fs.mkdirSync(OUTPUT, { recursive: true });

// ── helpers ────────────────────────────────────────────────────────────────

function isPNG(buf: Buffer): boolean {
  return buf[0] === 0x89 && buf[1] === 0x50;
}

function hasTransparency(buf: Buffer): boolean {
  // PNG IHDR color type at byte 25: 4=greyscale+alpha, 6=RGBA
  return buf[25] === 4 || buf[25] === 6;
}

async function waitForDone(page: Page, timeout = 120_000): Promise<void> {
  await page.locator('#workspace[data-phase="done"]').waitFor({ state: 'attached', timeout });
}

async function uploadFile(page: Page, filename: string): Promise<void> {
  const fileInput = page.locator('[data-testid="file-input"]');
  await fileInput.setInputFiles(path.join(FIXTURES, filename));
}

async function downloadPNG(page: Page): Promise<Buffer> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-testid="download-btn"]').click(),
  ]);
  const p = await download.path();
  if (!p) throw new Error('Download path is null');
  return fs.readFileSync(p);
}

// ── single-image / format tests ───────────────────────────────────────────
// Uses a shared page so the model is only downloaded once.

test.describe('single-image flow', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(600_000);

  let sharedPage: Page;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(600_000); // Allow up to 10 min for cold model download (~44 MB)
    // Use the browser's default context (newPage rather than newContext) so the
    // Cache API is shared with previously opened pages in the same Playwright session.
    // This lets the model weights stay cached across describe blocks.
    sharedPage = await browser.newPage();

    const consoleLogs: string[] = [];
    sharedPage.on('console', (msg) => {
      consoleLogs.push(msg.text());
      // Print all logs immediately so we can see model download status
      console.log(`[browser:${msg.type()}] ${msg.text()}`);
    });
    sharedPage.on('pageerror', (err) => {
      console.log(`[page error] ${err.message}`);
    });

    await sharedPage.goto('/');

    // Prime with first image — this triggers the real model download + first inference
    await uploadFile(sharedPage, 'sample.jpg');
    await waitForDone(sharedPage, 540_000);

    // Verify backend was logged
    const backendLog = consoleLogs.find((l) => l.includes('[Cutout] inference backend:'));
    if (!backendLog) console.warn('Backend log not found in console output');
    else console.log('Backend confirmed:', backendLog);
  });

  test.afterAll(async () => {
    await sharedPage.close();
  });

  // ── formats ──

  test('JPG → transparent PNG with alpha', async () => {
    // Already uploaded in beforeAll
    const png = await downloadPNG(sharedPage);
    expect(isPNG(png), 'Should be a PNG file').toBe(true);
    expect(hasTransparency(png), 'PNG should have alpha channel').toBe(true);
  });

  test('PNG → transparent PNG with alpha', async () => {
    await sharedPage.locator('#new-image-btn').click();
    await uploadFile(sharedPage, 'sample.png');
    await waitForDone(sharedPage, 60_000);
    const png = await downloadPNG(sharedPage);
    expect(hasTransparency(png)).toBe(true);
  });

  test('WEBP → transparent PNG with alpha', async () => {
    await sharedPage.locator('#new-image-btn').click();
    await uploadFile(sharedPage, 'sample.webp');
    await waitForDone(sharedPage, 60_000);
    const png = await downloadPNG(sharedPage);
    expect(hasTransparency(png)).toBe(true);
  });

  // ── background modes (use same processed image, just switch mode) ──

  test('color background mode produces PNG', async () => {
    // App should still be in 'done' state from previous test
    await sharedPage.locator('[data-testid="bg-mode-color"]').click();
    const png = await downloadPNG(sharedPage);
    expect(isPNG(png)).toBe(true);
  });

  test('blur background mode produces PNG', async () => {
    await sharedPage.locator('[data-testid="bg-mode-blur"]').click();
    const png = await downloadPNG(sharedPage);
    expect(isPNG(png)).toBe(true);
  });

  test('transparent background mode produces PNG with transparency', async () => {
    await sharedPage.locator('[data-testid="bg-mode-transparent"]').click();
    const png = await downloadPNG(sharedPage);
    expect(hasTransparency(png)).toBe(true);
  });

  // ── feather ──

  test('feather slider changes output (save before/after)', async () => {
    await sharedPage.locator('#new-image-btn').click();
    await uploadFile(sharedPage, 'hair-sample.jpg');
    await waitForDone(sharedPage, 60_000);

    // Screenshot before feather
    const before = await sharedPage.locator('[data-testid="preview-canvas"]').screenshot();
    fs.writeFileSync(path.join(OUTPUT, 'feather-before.png'), before);

    // Apply max feather
    const featherSlider = sharedPage.locator('#feather');
    await featherSlider.fill('20');
    await featherSlider.dispatchEvent('input');
    await sharedPage.waitForTimeout(500);

    // Screenshot after feather
    const after = await sharedPage.locator('[data-testid="preview-canvas"]').screenshot();
    fs.writeFileSync(path.join(OUTPUT, 'feather-after.png'), after);

    // The images should differ
    expect(before.equals(after)).toBe(false);
  });
});

// ── batch test ────────────────────────────────────────────────────────────

test.describe('batch flow', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(600_000); // 5 images × ~60s each + overhead

  test('5 mixed-format images → ZIP with 5 cutouts', async ({ browser }) => {
    // Use browser default context to share Cache API (cached model weights)
    const page = await browser.newPage();
    await page.goto('/');

    // Switch to batch mode
    await page.locator('[data-tab="batch"]').click();
    await page.locator('.batch-panel').waitFor({ state: 'visible' });

    const files = [
      path.join(FIXTURES, 'sample.jpg'),
      path.join(FIXTURES, 'sample.png'),
      path.join(FIXTURES, 'sample.webp'),
      path.join(FIXTURES, 'sample.jpg'),
      path.join(FIXTURES, 'sample.png'),
    ];

    const batchInput = page.locator('.batch-dropzone input[type="file"]');
    await batchInput.setInputFiles(files);

    // Wait for all 5 to reach 'done' status
    await expect(page.locator('.batch-item[data-status="done"]')).toHaveCount(5, {
      timeout: 540_000,
    });

    // Download ZIP
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.batch-download-btn').click(),
    ]);
    const zipPath = await download.path();
    if (!zipPath) throw new Error('No download path');
    const zipBytes = fs.readFileSync(zipPath);

    // Verify ZIP signature (PK = 0x50 0x4B)
    expect(zipBytes[0]).toBe(0x50);
    expect(zipBytes[1]).toBe(0x4B);
    expect(zipBytes.length).toBeGreaterThan(5000); // 5 PNGs should be substantial

    await page.close();
  });
});
