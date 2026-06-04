import { expect, test } from '@playwright/test';
import path from 'path';

// Three distinct real-JPEG copies so createImageBitmap never fails in headless Chromium.
// Synthetic minimal PNGs and tiny JPEGs fail Chrome's image decoder; real photos don't.
const FIX = (f: string) => path.join(process.cwd(), 'tests', 'fixtures', f);
const FIXTURES = [FIX('fixture-a.jpg'), FIX('fixture-b.jpg'), FIX('fixture-c.jpg')];

test('batch: select multiple files → progress advances → ZIP download', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');

  // Switch to batch mode
  await page.locator('[data-tab="batch"]').click();
  await page.locator('.batch-panel').waitFor({ state: 'visible' });

  // Batch file input (inside .batch-dropzone, supports multiple files)
  const fileInput = page.locator('.batch-dropzone input[type="file"]');
  await expect(fileInput).toBeAttached();

  // Upload 3 images
  await fileInput.setInputFiles(FIXTURES);

  // Progress bar must become visible
  const progressBar = page.locator('[role="progressbar"]');
  await expect(progressBar).toBeVisible({ timeout: 5_000 });

  // Wait for all 3 items to reach done — progress bar hits 100%
  await expect(progressBar).toHaveAttribute('aria-valuenow', '100', { timeout: 15_000 });

  // All 3 list items should be done (mock inference; allow a few seconds per item)
  await expect(page.locator('[data-status="done"]')).toHaveCount(3, { timeout: 15_000 });

  // Download button should be enabled
  const downloadBtn = page.locator('button:has-text("Download all")');
  await expect(downloadBtn).toBeEnabled();

  // Trigger download and capture the file
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 10_000 }),
    downloadBtn.click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/\.zip$/i);

  // No JS exceptions during the flow
  expect(errors).toHaveLength(0);
});
