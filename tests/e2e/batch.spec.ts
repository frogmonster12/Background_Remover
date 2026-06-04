import { expect, test } from '@playwright/test';
import path from 'path';

// Use three copies of the known-good 2×2 PNG fixture so all succeed in mock mode.
// Format-mixed dedup is covered by unit tests.
const PNG_FIXTURE = path.join(process.cwd(), 'tests', 'fixtures', 'sample.png');
const FIXTURES = [PNG_FIXTURE, PNG_FIXTURE, PNG_FIXTURE];

test('batch: select multiple files → progress advances → ZIP download', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');

  // File input must be present in the DOM
  const fileInput = page.locator('input[type="file"]');
  await expect(fileInput).toBeAttached();

  // Upload 3 images
  await fileInput.setInputFiles(FIXTURES);

  // Progress bar must become visible
  const progressBar = page.locator('[role="progressbar"]');
  await expect(progressBar).toBeVisible({ timeout: 5_000 });

  // Wait for all 3 items to reach done — progress bar hits 100%
  await expect(progressBar).toHaveAttribute('aria-valuenow', '100', { timeout: 15_000 });

  // All 3 list items should be done
  await expect(page.locator('[data-status="done"]')).toHaveCount(3);

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
