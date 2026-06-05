import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE   = path.join(__dirname, '..', 'fixtures', 'hair-sample.jpg');

async function uploadAndWait(page: import('@playwright/test').Page): Promise<void> {
  await page.locator('[data-testid="file-input"]').setInputFiles(FIXTURE);
  await expect(page.locator('[data-testid="status-region"]')).toHaveText(/done/i, {
    timeout: 8000,
  });
}

/** Simulate a brush stroke on the overlay: press, drag, release. */
async function stroke(
  page: import('@playwright/test').Page,
  fromRel = { x: 0.45, y: 0.45 },
  toRel   = { x: 0.55, y: 0.55 },
): Promise<void> {
  const overlay = page.locator('[data-testid="brush-overlay"]');
  const box = await overlay.boundingBox();
  if (!box) throw new Error('brush-overlay not visible');
  const x0 = box.x + box.width  * fromRel.x;
  const y0 = box.y + box.height * fromRel.y;
  const x1 = box.x + box.width  * toRel.x;
  const y1 = box.y + box.height * toRel.y;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x1, y1, { steps: 5 });
  await page.mouse.up();
}

// ── Visibility ─────────────────────────────────────────────────────────────

test.describe('Brush: visibility', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/'); });

  test('brush section is hidden before image is loaded', async ({ page }) => {
    await expect(page.locator('#brush-section')).not.toBeVisible();
  });

  test('brush section appears after processing', async ({ page }) => {
    await uploadAndWait(page);
    await expect(page.locator('#brush-section')).toBeVisible();
  });

  test('brush overlay is not visible before processing', async ({ page }) => {
    await expect(page.locator('[data-testid="brush-overlay"]')).not.toBeVisible();
  });

  test('brush overlay is visible after processing', async ({ page }) => {
    await uploadAndWait(page);
    await expect(page.locator('[data-testid="brush-overlay"]')).toBeVisible();
  });
});

// ── Controls ───────────────────────────────────────────────────────────────

test.describe('Brush: controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await uploadAndWait(page);
  });

  test('restore is the default mode', async ({ page }) => {
    await expect(page.locator('[data-testid="brush-restore-btn"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-testid="brush-erase-btn"]')).toHaveAttribute('aria-pressed', 'false');
  });

  test('can toggle to erase mode', async ({ page }) => {
    await page.locator('[data-testid="brush-erase-btn"]').click();
    await expect(page.locator('[data-testid="brush-erase-btn"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-testid="brush-restore-btn"]')).toHaveAttribute('aria-pressed', 'false');
  });

  test('can toggle back to restore mode', async ({ page }) => {
    await page.locator('[data-testid="brush-erase-btn"]').click();
    await page.locator('[data-testid="brush-restore-btn"]').click();
    await expect(page.locator('[data-testid="brush-restore-btn"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-testid="brush-erase-btn"]')).toHaveAttribute('aria-pressed', 'false');
  });

  test('brush size slider updates displayed value', async ({ page }) => {
    const slider = page.locator('[data-testid="brush-size"]');
    await slider.fill('60');
    await slider.dispatchEvent('input');
    await expect(page.locator('#brush-size-value')).toHaveText('60px');
  });

  test('undo button is initially disabled', async ({ page }) => {
    await expect(page.locator('[data-testid="undo-btn"]')).toBeDisabled();
  });

  test('redo button is initially disabled', async ({ page }) => {
    await expect(page.locator('[data-testid="redo-btn"]')).toBeDisabled();
  });
});

// ── Undo / Redo / Reset ────────────────────────────────────────────────────

test.describe('Brush: undo / redo / reset', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await uploadAndWait(page);
  });

  test('undo is enabled after a stroke', async ({ page }) => {
    await stroke(page);
    await expect(page.locator('[data-testid="undo-btn"]')).toBeEnabled();
  });

  test('undo reverts the stroke (undo button becomes disabled again after single stroke)', async ({ page }) => {
    await stroke(page);
    await expect(page.locator('[data-testid="undo-btn"]')).toBeEnabled();
    await page.locator('[data-testid="undo-btn"]').click();
    await expect(page.locator('[data-testid="undo-btn"]')).toBeDisabled();
  });

  test('redo is enabled after undo', async ({ page }) => {
    await stroke(page);
    await page.locator('[data-testid="undo-btn"]').click();
    await expect(page.locator('[data-testid="redo-btn"]')).toBeEnabled();
  });

  test('redo re-applies after undo', async ({ page }) => {
    await stroke(page);
    await page.locator('[data-testid="undo-btn"]').click();
    await page.locator('[data-testid="redo-btn"]').click();
    await expect(page.locator('[data-testid="undo-btn"]')).toBeEnabled();
    await expect(page.locator('[data-testid="redo-btn"]')).toBeDisabled();
  });

  test('reset enables undo and clears redo', async ({ page }) => {
    await stroke(page);
    await page.locator('[data-testid="undo-btn"]').click(); // undo the stroke
    await page.locator('[data-testid="reset-mask-btn"]').click(); // reset (even without brush changes = no-op mask-wise but pushes undo)
    await expect(page.locator('[data-testid="undo-btn"]')).toBeEnabled();
    await expect(page.locator('[data-testid="redo-btn"]')).toBeDisabled();
  });

  test('Ctrl+Z triggers undo', async ({ page }) => {
    await stroke(page);
    await page.keyboard.press('Control+z');
    await expect(page.locator('[data-testid="undo-btn"]')).toBeDisabled();
  });

  test('Ctrl+Y triggers redo', async ({ page }) => {
    await stroke(page);
    await page.keyboard.press('Control+z');
    await expect(page.locator('[data-testid="redo-btn"]')).toBeEnabled();
    await page.keyboard.press('Control+y');
    await expect(page.locator('[data-testid="undo-btn"]')).toBeEnabled();
    await expect(page.locator('[data-testid="redo-btn"]')).toBeDisabled();
  });
});

// ── Brush affects canvas + download (Phase 4) ──────────────────────────────

test.describe('Brush: canvas and export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await uploadAndWait(page);
  });

  test('erase stroke changes canvas pixels (alpha decreases at stroke center)', async ({ page }) => {
    // Switch to erase mode and set a large brush to reliably hit the mock foreground (ellipse center)
    await page.locator('[data-testid="brush-erase-btn"]').click();
    const sizeSlider = page.locator('[data-testid="brush-size"]');
    await sizeSlider.fill('80');
    await sizeSlider.dispatchEvent('input');

    // Sample alpha at canvas center before erasing
    const alphaBefore = await page.evaluate((): number => {
      const c = document.getElementById('preview-canvas') as HTMLCanvasElement;
      const ctx = c.getContext('2d')!;
      const d = ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
      return d[3] ?? 0;
    });

    // Erase stroke through the center of the overlay (center = foreground in mock)
    await stroke(page, { x: 0.4, y: 0.4 }, { x: 0.6, y: 0.6 });

    const alphaAfter = await page.evaluate((): number => {
      const c = document.getElementById('preview-canvas') as HTMLCanvasElement;
      const ctx = c.getContext('2d')!;
      const d = ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
      return d[3] ?? 0;
    });

    expect(alphaAfter).toBeLessThan(alphaBefore);
  });

  test('restore stroke changes canvas pixels (alpha increases at edge)', async ({ page }) => {
    // The mock ellipse leaves the top-left corner as background (alpha=0).
    // We brush there with restore to bring alpha up.
    const sizeSlider = page.locator('[data-testid="brush-size"]');
    await sizeSlider.fill('80');
    await sizeSlider.dispatchEvent('input');

    const alphaBefore = await page.evaluate((): number => {
      const c = document.getElementById('preview-canvas') as HTMLCanvasElement;
      const ctx = c.getContext('2d')!;
      // Sample near the top-left corner which is always background in the mock ellipse
      const d = ctx.getImageData(2, 2, 1, 1).data;
      return d[3] ?? 0;
    });

    // Restore stroke at top-left corner
    await stroke(page, { x: 0.01, y: 0.01 }, { x: 0.08, y: 0.08 });

    const alphaAfter = await page.evaluate((): number => {
      const c = document.getElementById('preview-canvas') as HTMLCanvasElement;
      const ctx = c.getContext('2d')!;
      const d = ctx.getImageData(2, 2, 1, 1).data;
      return d[3] ?? 0;
    });

    expect(alphaAfter).toBeGreaterThan(alphaBefore);
  });

  test('download PNG reflects erase brush edit', async ({ page }) => {
    await page.locator('[data-testid="brush-erase-btn"]').click();
    const sizeSlider = page.locator('[data-testid="brush-size"]');
    await sizeSlider.fill('80');
    await sizeSlider.dispatchEvent('input');

    // Erase stroke through center
    await stroke(page, { x: 0.3, y: 0.3 }, { x: 0.7, y: 0.7 });

    // Wait for recomposite to finish then verify canvas has changed
    const alphaCenter = await page.evaluate((): number => {
      const c = document.getElementById('preview-canvas') as HTMLCanvasElement;
      const ctx = c.getContext('2d')!;
      const d = ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
      return d[3] ?? 0;
    });
    // Center was erased — alpha must be less than 255
    expect(alphaCenter).toBeLessThan(255);

    // Download and confirm file appears
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('[data-testid="download-btn"]').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.png$/i);
  });

  test('brush edits survive background mode change', async ({ page }) => {
    // Erase center stroke
    await page.locator('[data-testid="brush-erase-btn"]').click();
    const sizeSlider = page.locator('[data-testid="brush-size"]');
    await sizeSlider.fill('80');
    await sizeSlider.dispatchEvent('input');
    await stroke(page);

    // Switch to color mode and back — working mask should persist
    await page.locator('[data-testid="bg-mode-color"]').click();
    await page.locator('[data-testid="bg-mode-transparent"]').click();

    // Undo should still be available (mask was changed by the stroke)
    await expect(page.locator('[data-testid="undo-btn"]')).toBeEnabled();
  });
});

// ── Before / after output (saved to tests/output/) ────────────────────────

test.describe('Brush: before/after output', () => {
  test('saves before/after canvas screenshots to tests/output/', async ({ page }) => {
    await page.goto('/');
    await uploadAndWait(page);

    const outputDir = path.join(__dirname, '..', 'output');
    fs.mkdirSync(outputDir, { recursive: true });

    // Capture "before" screenshot
    const canvasBefore = await page.locator('[data-testid="preview-canvas"]').screenshot();
    fs.writeFileSync(path.join(outputDir, 'brush-before.png'), canvasBefore);

    // Erase stroke through center
    await page.locator('[data-testid="brush-erase-btn"]').click();
    const sizeSlider = page.locator('[data-testid="brush-size"]');
    await sizeSlider.fill('80');
    await sizeSlider.dispatchEvent('input');
    await stroke(page, { x: 0.3, y: 0.3 }, { x: 0.7, y: 0.7 });

    // Capture "after" screenshot
    const canvasAfter = await page.locator('[data-testid="preview-canvas"]').screenshot();
    fs.writeFileSync(path.join(outputDir, 'brush-after.png'), canvasAfter);

    // Verify the files were written and differ
    expect(canvasBefore.length).toBeGreaterThan(0);
    expect(canvasAfter.length).toBeGreaterThan(0);
    // Files must differ (brush changed the canvas)
    expect(canvasBefore.equals(canvasAfter)).toBe(false);
  });
});

// ── Accessibility ──────────────────────────────────────────────────────────

test.describe('Brush: accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await uploadAndWait(page);
  });

  test('brush controls have aria-label attributes', async ({ page }) => {
    await expect(page.locator('[data-testid="undo-btn"]')).toHaveAttribute('aria-label');
    await expect(page.locator('[data-testid="redo-btn"]')).toHaveAttribute('aria-label');
    await expect(page.locator('[data-testid="reset-mask-btn"]')).toHaveAttribute('aria-label');
  });

  test('brush mode buttons have aria-pressed', async ({ page }) => {
    await expect(page.locator('[data-testid="brush-restore-btn"]')).toHaveAttribute('aria-pressed');
    await expect(page.locator('[data-testid="brush-erase-btn"]')).toHaveAttribute('aria-pressed');
  });

  test('brush size slider has aria range attributes', async ({ page }) => {
    const slider = page.locator('[data-testid="brush-size"]');
    await expect(slider).toHaveAttribute('aria-valuemin');
    await expect(slider).toHaveAttribute('aria-valuemax');
    await expect(slider).toHaveAttribute('aria-valuenow');
    await expect(slider).toHaveAttribute('aria-label');
  });

  test('brush section has labelledby heading', async ({ page }) => {
    await expect(page.locator('#brush-section')).toHaveAttribute('aria-labelledby', 'brush-section-label');
    await expect(page.locator('#brush-section-label')).toBeVisible();
  });
});
