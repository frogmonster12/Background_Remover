import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE   = path.join(__dirname, '..', 'fixtures', 'hair-sample.jpg');

// Helper: upload a file and wait for processing to finish
async function uploadAndWait(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('[data-testid="file-input"]').setInputFiles(FIXTURE);
  await expect(page.locator('[data-testid="status-region"]')).toHaveText(/done/i, {
    timeout: 8000,
  });
}

test.describe('UI workspace', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // ── Initial state ──────────────────────────────────────────────────────

  test('shows dropzone on initial load', async ({ page }) => {
    await expect(page.locator('[data-testid="dropzone"]')).toBeVisible();
    await expect(page.locator('[data-testid="preview-canvas"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="download-btn"]')).toBeDisabled();
  });

  // ── Core flow ──────────────────────────────────────────────────────────

  test('drop image → preview canvas renders', async ({ page }) => {
    await uploadAndWait(page);
    await expect(page.locator('[data-testid="preview-canvas"]')).toBeVisible();
    await expect(page.locator('[data-testid="dropzone"]')).not.toBeVisible();
  });

  test('download PNG is enabled after processing', async ({ page }) => {
    await uploadAndWait(page);
    await expect(page.locator('[data-testid="download-btn"]')).toBeEnabled();
  });

  test('download PNG yields a .png file', async ({ page }) => {
    await uploadAndWait(page);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-testid="download-btn"]').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.png$/i);
  });

  // ── Background modes ───────────────────────────────────────────────────

  test('background mode: transparent (default)', async ({ page }) => {
    await uploadAndWait(page);
    await expect(page.locator('[data-testid="bg-mode-transparent"]')).toHaveAttribute('aria-pressed', 'true');
    // Color / blur sub-options should be hidden
    await expect(page.locator('#bg-color-row')).not.toBeVisible();
    await expect(page.locator('#bg-blur-row')).not.toBeVisible();
    await expect(page.locator('[data-testid="download-jpeg-btn"]')).not.toBeVisible();
  });

  test('background mode: color — shows color picker and JPEG download', async ({ page }) => {
    await uploadAndWait(page);
    await page.locator('[data-testid="bg-mode-color"]').click();

    await expect(page.locator('[data-testid="bg-mode-color"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#bg-color-row')).toBeVisible();
    await expect(page.locator('[data-testid="download-jpeg-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="download-btn"]')).toBeEnabled();
  });

  test('background mode: blur — shows blur slider', async ({ page }) => {
    await uploadAndWait(page);
    await page.locator('[data-testid="bg-mode-blur"]').click();

    await expect(page.locator('[data-testid="bg-mode-blur"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#bg-blur-row')).toBeVisible();
    await expect(page.locator('[data-testid="download-btn"]')).toBeEnabled();
  });

  test('background mode: image — shows upload button', async ({ page }) => {
    await uploadAndWait(page);
    await page.locator('[data-testid="bg-mode-image"]').click();

    await expect(page.locator('[data-testid="bg-mode-image"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#bg-image-row')).toBeVisible();
  });

  test('switching back to transparent hides sub-options', async ({ page }) => {
    await uploadAndWait(page);
    await page.locator('[data-testid="bg-mode-color"]').click();
    await expect(page.locator('#bg-color-row')).toBeVisible();

    await page.locator('[data-testid="bg-mode-transparent"]').click();
    await expect(page.locator('#bg-color-row')).not.toBeVisible();
    await expect(page.locator('[data-testid="download-jpeg-btn"]')).not.toBeVisible();
  });

  test('download JPEG (color mode) yields a .jpg file', async ({ page }) => {
    await uploadAndWait(page);
    await page.locator('[data-testid="bg-mode-color"]').click();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-testid="download-jpeg-btn"]').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.jpg$/i);
  });

  // ── Accessibility ──────────────────────────────────────────────────────

  test('a11y: key landmarks and ARIA attributes are present', async ({ page }) => {
    // Header role
    await expect(page.locator('[role="banner"]')).toBeVisible();
    // Main role
    await expect(page.locator('[role="main"]')).toBeVisible();
    // Controls aside label
    await expect(page.locator('aside[aria-label]')).toBeVisible();
    // Dropzone has accessible name
    await expect(page.locator('[data-testid="dropzone"]')).toHaveAttribute('aria-label');
    // Download button has accessible name
    await expect(page.locator('[data-testid="download-btn"]')).toHaveAttribute('aria-label');
    // Live region exists
    await expect(page.locator('[data-testid="status-region"]')).toHaveAttribute('aria-live', 'polite');
    // File input has accessible name
    await expect(page.locator('[data-testid="file-input"]')).toHaveAttribute('aria-label');
    // Mode buttons have aria-pressed
    await expect(page.locator('[data-testid="bg-mode-transparent"]')).toHaveAttribute('aria-pressed');
    // Sliders have accessible range attributes
    await expect(page.locator('#feather')).toHaveAttribute('aria-label');
  });

  test('a11y: status region updates to "Done." after processing', async ({ page }) => {
    await uploadAndWait(page);
    const statusText = await page.locator('[data-testid="status-region"]').textContent();
    expect(statusText?.toLowerCase()).toMatch(/done/);
  });

  test('a11y: dropzone is keyboard-operable (tabindex=0)', async ({ page }) => {
    const dropzone = page.locator('[data-testid="dropzone"]');
    await expect(dropzone).toHaveAttribute('tabindex', '0');
    await expect(dropzone).toHaveAttribute('role', 'button');
  });

  test('a11y: controls have visible labels', async ({ page }) => {
    // Slider labels must be present
    await expect(page.locator('label[for="feather"]')).toBeVisible();
    await expect(page.locator('label[for="blur-radius"]')).not.toBeVisible(); // hidden until blur mode
    // Background section heading
    await expect(page.locator('#bg-section-label')).toBeVisible();
    // Quality section heading
    await expect(page.locator('#quality-section-label')).toBeVisible();
  });
});
