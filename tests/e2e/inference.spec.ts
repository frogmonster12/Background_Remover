import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { expect, test } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(__dirname, '../fixtures/hair-sample.jpg');
const OUTPUT_DIR = path.resolve(__dirname, '../output');

test.describe('real-model inference spike', () => {
  test.setTimeout(300_000); // 5 min — first run downloads ~115 MB (fp16)

  test('BiRefNet_lite returns a non-trivial alpha mask for the hair fixture', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');

    // Build the worker URL relative to the page origin so it goes through Vite's transform.
    const workerUrl = new URL('/src/worker.ts', page.url()).toString();

    // Read fixture as base64 on the Node side and pass it into the browser context.
    const fixtureBase64 = fs.readFileSync(FIXTURE).toString('base64');

    // Increase the page's evaluate timeout to match the model download window.
    page.setDefaultTimeout(280_000);

    // Everything inside evaluate runs in the browser (Chromium).
    const result = await page.evaluate(
      async ({ workerUrl, fixtureBase64 }: { workerUrl: string; fixtureBase64: string }) => {
        // Decode the fixture JPEG from base64.
        const bytes = Uint8Array.from(atob(fixtureBase64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: 'image/jpeg' });
        const bitmap = await createImageBitmap(blob);
        const { width, height } = bitmap; // capture before transfer

        const coldStart = performance.now();

        // Spin up the worker (Vite dev server transforms worker.ts with USE_REAL_MODEL=true).
        const inferResult = await new Promise<{
          mask: number[];
          width: number;
          height: number;
          inferenceMs: number;
          backend: string;
        }>((resolve, reject) => {
          const worker = new Worker(workerUrl, { type: 'module' });
          worker.onerror = (e) => reject(new Error(`Worker error: ${e.message ?? String(e)}`));
          worker.onmessage = ({ data }) => {
            if (data.type === 'result') {
              resolve({
                mask: Array.from(data.result.mask as Uint8ClampedArray),
                width: data.result.width,
                height: data.result.height,
                inferenceMs: data.result.inferenceMs,
                backend: data.result.backend,
              });
            } else if (data.type === 'error') {
              reject(new Error(data.message));
            }
          };
          worker.postMessage({ type: 'remove-background', jobId: 'spike', bitmap }, [bitmap]);
        });

        const coldLoadMs = performance.now() - coldStart;

        // Compose a grayscale mask PNG for manual eyeballing.
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        const imgData = ctx.createImageData(width, height);
        for (let i = 0; i < inferResult.mask.length; i++) {
          const v = inferResult.mask[i];
          imgData.data[i * 4] = v;
          imgData.data[i * 4 + 1] = v;
          imgData.data[i * 4 + 2] = v;
          imgData.data[i * 4 + 3] = 255;
        }
        ctx.putImageData(imgData, 0, 0);
        const maskPng = canvas.toDataURL('image/png').replace('data:image/png;base64,', '');

        let nonZero = 0;
        let zero = 0;
        for (const v of inferResult.mask) {
          if (v > 0) nonZero++; else zero++;
        }

        return { ...inferResult, coldLoadMs, nonZero, zero, maskPng };
      },
      { workerUrl, fixtureBase64 },
    );

    // Print timing for MODELS.md.
    console.log('\n=== Inference Spike Results ===');
    console.log(`Model:        onnx-community/ormbg-ONNX (Apache-2.0)`);
    console.log(`Backend:      ${result.backend}`);
    console.log(`Image:        ${result.width}×${result.height}`);
    console.log(`Cold-load ms: ${Math.round(result.coldLoadMs)}`);
    console.log(`Inference ms: ${Math.round(result.inferenceMs)}`);
    console.log(`Non-zero px:  ${result.nonZero} / ${result.mask.length}`);
    console.log(`Zero px:      ${result.zero} / ${result.mask.length}`);
    console.log('================================\n');

    // Mask must cover the full image.
    expect(result.mask.length).toBe(result.width * result.height);

    // Non-trivial: real segmentation produces foreground AND background pixels.
    expect(result.nonZero).toBeGreaterThan(0);
    expect(result.zero).toBeGreaterThan(0);

    // Sanity: at least 5% of each category (not a near-degenerate mask).
    const total = result.mask.length;
    expect(result.nonZero / total).toBeGreaterThan(0.05);
    expect(result.zero / total).toBeGreaterThan(0.05);

    // No JS console errors from Vite or the worker.
    expect(consoleErrors).toHaveLength(0);

    // Save mask PNG so Jeff can eyeball hair edges.
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const pngPath = path.join(OUTPUT_DIR, 'hair-mask.png');
    fs.writeFileSync(pngPath, Buffer.from(result.maskPng, 'base64'));
    console.log(`Mask saved → ${pngPath}`);
  });
});
