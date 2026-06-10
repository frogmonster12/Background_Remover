import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { expect, test, type Page } from '@playwright/test';

/**
 * General-model spike (prompt 13): ISNet general-use must produce a usable
 * mask on the subjects ORMBG fails on (illustrations, products), and ORMBG
 * must keep working unchanged. Masks are saved to tests/output/ for eyeballing:
 *   cartoon-mask-human.png    — the documented ORMBG failure (before)
 *   cartoon-mask-general.png  — ISNet on the same image (after)
 *   product-mask-general.png  — ISNet on a product shot
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, '../fixtures');
const OUTPUT_DIR = path.resolve(__dirname, '../output');

interface MaskRun {
  width: number;
  height: number;
  inferenceMs: number;
  backend: string;
  /** Foreground fraction (mask value > 128). */
  fgFraction: number;
  /** Mean mask value in the center 10% box (subject area in both fixtures). */
  centerMean: number;
  /** Mean mask value in the four 5%-corner boxes (background in both fixtures). */
  cornerMean: number;
  maskPng: string;
}

async function runModel(page: Page, fixture: string, model: 'human' | 'general'): Promise<MaskRun> {
  const workerUrl = new URL('/src/worker.ts', page.url()).toString();
  const fixtureBase64 = fs.readFileSync(path.join(FIXTURES, fixture)).toString('base64');

  return page.evaluate(
    async ({ workerUrl, fixtureBase64, model }: { workerUrl: string; fixtureBase64: string; model: string }) => {
      const bytes = Uint8Array.from(atob(fixtureBase64), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const { width, height } = bitmap;

      const result = await new Promise<{
        mask: Uint8ClampedArray;
        inferenceMs: number;
        backend: string;
      }>((resolve, reject) => {
        const worker = new Worker(workerUrl, { type: 'module' });
        worker.onerror = (e) => reject(new Error(`Worker error: ${e.message ?? String(e)}`));
        worker.onmessage = ({ data }) => {
          if (data.type === 'result') {
            resolve({
              mask: data.result.mask,
              inferenceMs: data.result.inferenceMs,
              backend: data.result.backend,
            });
            worker.terminate();
          } else if (data.type === 'error') {
            reject(new Error(data.message));
            worker.terminate();
          }
        };
        worker.postMessage({ type: 'remove-background', jobId: 'spike', bitmap, model }, [bitmap]);
      });

      const mask = result.mask;
      let fg = 0;
      for (let i = 0; i < mask.length; i++) if (mask[i] > 128) fg++;

      const boxMean = (x0: number, y0: number, x1: number, y1: number) => {
        let sum = 0;
        let n = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            sum += mask[y * width + x];
            n++;
          }
        }
        return sum / n;
      };

      const cw = Math.floor(width * 0.05);
      const ch = Math.floor(height * 0.05);
      const centerMean = boxMean(
        Math.floor(width * 0.45), Math.floor(height * 0.45),
        Math.floor(width * 0.55), Math.floor(height * 0.55),
      );
      const cornerMean = (
        boxMean(0, 0, cw, ch) +
        boxMean(width - cw, 0, width, ch) +
        boxMean(0, height - ch, cw, height) +
        boxMean(width - cw, height - ch, width, height)
      ) / 4;

      // Grayscale mask PNG for manual eyeballing.
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      const imgData = ctx.createImageData(width, height);
      for (let i = 0; i < mask.length; i++) {
        imgData.data[i * 4] = mask[i];
        imgData.data[i * 4 + 1] = mask[i];
        imgData.data[i * 4 + 2] = mask[i];
        imgData.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
      const maskPng = canvas.toDataURL('image/png').replace('data:image/png;base64,', '');

      return {
        width,
        height,
        inferenceMs: result.inferenceMs,
        backend: result.backend,
        fgFraction: fg / mask.length,
        centerMean,
        cornerMean,
        maskPng,
      };
    },
    { workerUrl, fixtureBase64, model },
  );
}

function saveMask(run: MaskRun, name: string): void {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT_DIR, name), Buffer.from(run.maskPng, 'base64'));
}

function report(label: string, run: MaskRun): void {
  console.log(
    `${label}: ${run.width}×${run.height} backend=${run.backend} ` +
    `inference=${Math.round(run.inferenceMs)}ms fg=${(run.fgFraction * 100).toFixed(1)}% ` +
    `centerMean=${run.centerMean.toFixed(0)} cornerMean=${run.cornerMean.toFixed(0)}`,
  );
}

test.describe('general model (ISNet general-use)', () => {
  test.setTimeout(300_000);

  test('cartoon: General cuts what Human cannot (before/after saved)', async ({ page }) => {
    await page.goto('/');
    page.setDefaultTimeout(280_000);

    // BEFORE — the documented ORMBG failure case.
    const before = await runModel(page, 'cartoon-sample.png', 'human');
    report('cartoon human (before)', before);
    saveMask(before, 'cartoon-mask-human.png');

    // AFTER — same image through the general model.
    const after = await runModel(page, 'cartoon-sample.png', 'general');
    report('cartoon general (after)', after);
    saveMask(after, 'cartoon-mask-general.png');

    // The general model must clearly separate subject (center) from sky (corners).
    expect(after.centerMean).toBeGreaterThan(200);
    expect(after.cornerMean).toBeLessThan(50);
    // Non-degenerate foreground share: the character, not the whole frame.
    expect(after.fgFraction).toBeGreaterThan(0.05);
    expect(after.fgFraction).toBeLessThan(0.7);
  });

  test('product: General cuts a product on a plain background', async ({ page }) => {
    await page.goto('/');
    page.setDefaultTimeout(280_000);

    const run = await runModel(page, 'product-sample.png', 'general');
    report('product general', run);
    saveMask(run, 'product-mask-general.png');

    expect(run.centerMean).toBeGreaterThan(200);
    expect(run.cornerMean).toBeLessThan(50);
    expect(run.fgFraction).toBeGreaterThan(0.05);
    expect(run.fgFraction).toBeLessThan(0.7);
  });

  test('human photo: ORMBG unchanged via explicit model field (no regression)', async ({ page }) => {
    await page.goto('/');
    page.setDefaultTimeout(280_000);

    const run = await runModel(page, 'hair-sample.jpg', 'human');
    report('hair human', run);

    // Same non-degenerate bounds as the original spike.
    expect(run.fgFraction).toBeGreaterThan(0.05);
    expect(run.fgFraction).toBeLessThan(0.95);
  });
});
