/**
 * Deterministic mock inference — returns a centered ellipse cutout.
 * Used when __USE_REAL_MODEL__ is false (default in dev/test).
 * Conforms to RemovalResult so all downstream code compiles against the real contract.
 */
import type { AlphaMask, InferenceBackend, RemovalResult } from './contracts.js';

/**
 * Generates a deterministic ellipse mask centered in the image.
 * Pixels inside the ellipse are opaque (255); outside are transparent (0).
 */
export function mockRemoveBackground(
  width: number,
  height: number,
): RemovalResult {
  const start = performance.now();
  const mask: AlphaMask = new Uint8ClampedArray(width * height);

  const cx = width / 2;
  const cy = height / 2;
  const rx = width * 0.38;
  const ry = height * 0.45;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      mask[y * width + x] = dx * dx + dy * dy <= 1 ? 255 : 0;
    }
  }

  const backend: InferenceBackend = 'wasm';
  return {
    mask,
    width,
    height,
    inferenceMs: performance.now() - start,
    backend,
  };
}
