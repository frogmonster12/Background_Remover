import { describe, expect, it } from 'vitest';
import type { AlphaMask, CompositeOptions } from './contracts.js';
import { applyMask, applyMaskRegion, featherMask, toJPEG, toPNG } from './compose.js';
import type { Region } from './compose.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create an OffscreenCanvas filled with a flat RGBA color. */
function solidCanvas(w: number, h: number, r: number, g: number, b: number, a = 255): OffscreenCanvas {
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d')!;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  ctx.putImageData(new ImageData(data, w, h), 0, 0);
  return c;
}

/** Read pixel RGBA at index i from an OffscreenCanvas. */
function pixelAt(canvas: OffscreenCanvas, i: number): [number, number, number, number] {
  const ctx = canvas.getContext('2d')!;
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  return [d[i * 4], d[i * 4 + 1], d[i * 4 + 2], d[i * 4 + 3]];
}

// ---------------------------------------------------------------------------
// featherMask — pure array math
// ---------------------------------------------------------------------------

describe('featherMask', () => {
  it('radius 0 returns a copy with identical values', () => {
    const mask: AlphaMask = new Uint8ClampedArray([0, 255, 0, 255, 0]);
    const result = featherMask(mask, 5, 1, 0);
    expect(Array.from(result)).toEqual([0, 255, 0, 255, 0]);
  });

  it('softens a single opaque pixel: neighbours gain alpha > 0', () => {
    // 5x1 mask: [0, 0, 255, 0, 0]
    const mask: AlphaMask = new Uint8ClampedArray([0, 0, 255, 0, 0]);
    const result = featherMask(mask, 5, 1, 1);
    // Center should still be the brightest
    expect(result[2]).toBeGreaterThan(0);
    // Immediate neighbours should have received some alpha
    expect(result[1]).toBeGreaterThan(0);
    expect(result[3]).toBeGreaterThan(0);
    // Far neighbours may or may not be touched, but center >= neighbours
    expect(result[2]).toBeGreaterThanOrEqual(result[1]);
  });

  it('leaves fully opaque image unchanged (all 255)', () => {
    const mask: AlphaMask = new Uint8ClampedArray([255, 255, 255, 255]);
    const result = featherMask(mask, 4, 1, 2);
    expect(Array.from(result)).toEqual([255, 255, 255, 255]);
  });

  it('leaves fully transparent image unchanged (all 0)', () => {
    const mask: AlphaMask = new Uint8ClampedArray([0, 0, 0, 0]);
    const result = featherMask(mask, 4, 1, 2);
    expect(Array.from(result)).toEqual([0, 0, 0, 0]);
  });

  it('produces intermediate values on a hard vertical edge in a 2D mask', () => {
    // 4x1 mask: left half transparent, right half opaque
    const mask: AlphaMask = new Uint8ClampedArray([0, 0, 255, 255]);
    const result = featherMask(mask, 4, 1, 1);
    // pixel 1 (adjacent to the hard edge on transparent side) should get some alpha
    expect(result[1]).toBeGreaterThan(0);
    // pixel 2 (adjacent to hard edge on opaque side) should still be reasonably high
    expect(result[2]).toBeGreaterThan(0);
    // hard transparent pixels far from edge should have lower value than hard opaque
    expect(result[3]).toBeGreaterThan(result[0]);
  });
});

// ---------------------------------------------------------------------------
// applyMask — transparent mode
// ---------------------------------------------------------------------------

describe('applyMask — transparent mode', () => {
  it('returns an OffscreenCanvas of the same dimensions', () => {
    const src = solidCanvas(4, 3, 255, 0, 0);
    const mask: AlphaMask = new Uint8ClampedArray(12).fill(255);
    const result = applyMask(src, mask, { mode: 'transparent' });
    expect(result.width).toBe(4);
    expect(result.height).toBe(3);
  });

  it('foreground pixels (mask=255) keep original color and full alpha', () => {
    const src = solidCanvas(2, 1, 200, 100, 50);
    const mask: AlphaMask = new Uint8ClampedArray([255, 0]);
    const result = applyMask(src, mask, { mode: 'transparent' });
    const [r, g, b, a] = pixelAt(result, 0);
    expect(r).toBe(200);
    expect(g).toBe(100);
    expect(b).toBe(50);
    expect(a).toBe(255);
  });

  it('background pixels (mask=0) become fully transparent', () => {
    const src = solidCanvas(2, 1, 200, 100, 50);
    const mask: AlphaMask = new Uint8ClampedArray([255, 0]);
    const result = applyMask(src, mask, { mode: 'transparent' });
    const [, , , a] = pixelAt(result, 1);
    expect(a).toBe(0);
  });

  it('partial mask value (128) produces partial alpha', () => {
    const src = solidCanvas(1, 1, 128, 128, 128);
    const mask: AlphaMask = new Uint8ClampedArray([128]);
    const result = applyMask(src, mask, { mode: 'transparent' });
    const [, , , a] = pixelAt(result, 0);
    expect(a).toBe(128);
  });
});

// ---------------------------------------------------------------------------
// applyMask — color mode
// ---------------------------------------------------------------------------

describe('applyMask — color mode', () => {
  it('background pixels (mask=0) are filled with the specified hex color', () => {
    // Blue source; mask=0 means background; color=#ff0000 (red)
    const src = solidCanvas(2, 1, 0, 0, 255);
    const mask: AlphaMask = new Uint8ClampedArray([255, 0]);
    const result = applyMask(src, mask, { mode: 'color', color: '#ff0000' });
    const [r, , , a] = pixelAt(result, 1);
    expect(r).toBe(255);
    expect(a).toBe(255); // fully opaque background
  });

  it('foreground pixels (mask=255) retain original color on opaque canvas', () => {
    const src = solidCanvas(2, 1, 0, 0, 255);
    const mask: AlphaMask = new Uint8ClampedArray([255, 0]);
    const result = applyMask(src, mask, { mode: 'color', color: '#ff0000' });
    const [r, g, b, a] = pixelAt(result, 0);
    expect(r).toBe(0);
    expect(g).toBe(0);
    expect(b).toBe(255);
    expect(a).toBe(255);
  });
});

// ---------------------------------------------------------------------------
// applyMask — blur mode
// ---------------------------------------------------------------------------

describe('applyMask — blur mode', () => {
  it('background pixels (mask=0) are non-transparent', () => {
    const src = solidCanvas(4, 1, 128, 64, 32);
    const mask: AlphaMask = new Uint8ClampedArray([255, 255, 0, 0]);
    const result = applyMask(src, mask, { mode: 'blur', blurRadius: 1 });
    const [, , , a2] = pixelAt(result, 2);
    const [, , , a3] = pixelAt(result, 3);
    expect(a2).toBe(255);
    expect(a3).toBe(255);
  });

  it('foreground pixels (mask=255) are opaque', () => {
    const src = solidCanvas(4, 1, 128, 64, 32);
    const mask: AlphaMask = new Uint8ClampedArray([255, 255, 0, 0]);
    const result = applyMask(src, mask, { mode: 'blur', blurRadius: 1 });
    const [, , , a0] = pixelAt(result, 0);
    expect(a0).toBe(255);
  });
});

// ---------------------------------------------------------------------------
// applyMask — image mode
// ---------------------------------------------------------------------------

describe('applyMask — image mode', () => {
  it('background pixels (mask=0) are filled from background image', () => {
    // Green source subject
    const src = solidCanvas(2, 1, 0, 255, 0);
    // Red background image
    const bgCanvas = solidCanvas(2, 1, 255, 0, 0);
    const mask: AlphaMask = new Uint8ClampedArray([255, 0]);

    // Cast OffscreenCanvas as ImageBitmap for the test since happy-dom has no createImageBitmap
    const result = applyMask(src, mask, {
      mode: 'image',
      backgroundImage: bgCanvas as unknown as ImageBitmap,
    });

    const [r, , , a] = pixelAt(result, 1);
    expect(r).toBe(255); // red from background
    expect(a).toBe(255);
  });

  it('foreground pixels (mask=255) keep source color', () => {
    const src = solidCanvas(2, 1, 0, 255, 0);
    const bgCanvas = solidCanvas(2, 1, 255, 0, 0);
    const mask: AlphaMask = new Uint8ClampedArray([255, 0]);
    const result = applyMask(src, mask, {
      mode: 'image',
      backgroundImage: bgCanvas as unknown as ImageBitmap,
    });
    const [r, g, b, a] = pixelAt(result, 0);
    expect(r).toBe(0);
    expect(g).toBe(255);
    expect(b).toBe(0);
    expect(a).toBe(255);
  });
});

// ---------------------------------------------------------------------------
// applyMask — feather integration
// ---------------------------------------------------------------------------

describe('applyMask — feather option', () => {
  it('produces intermediate alpha at hard mask edges when feather > 0', () => {
    // 4x1: left half transparent, right half opaque
    const src = solidCanvas(4, 1, 128, 128, 128);
    const mask: AlphaMask = new Uint8ClampedArray([0, 0, 255, 255]);
    const result = applyMask(src, mask, { mode: 'transparent', feather: 1 });
    // Pixel at index 1 was mask=0 but is adjacent to opaque region — should have alpha > 0
    const [, , , a] = pixelAt(result, 1);
    expect(a).toBeGreaterThan(0);
    // Pixel 0 (far from edge) should be the lowest alpha
    const [, , , a0] = pixelAt(result, 0);
    expect(a).toBeGreaterThanOrEqual(a0);
  });
});

// ---------------------------------------------------------------------------
// applyMaskRegion — must be pixel-identical to the full pass
// ---------------------------------------------------------------------------

/** Source canvas with a deterministic per-pixel gradient (not flat). */
function gradientCanvas(w: number, h: number): OffscreenCanvas {
  const c = new OffscreenCanvas(w, h);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4]     = (i * 7) % 256;
    data[i * 4 + 1] = (i * 13) % 256;
    data[i * 4 + 2] = (i * 29) % 256;
    data[i * 4 + 3] = 255;
  }
  c.getContext('2d')!.putImageData(new ImageData(data, w, h), 0, 0);
  return c;
}

/** Deterministic non-trivial mask with hard and soft values. */
function variedMask(w: number, h: number): AlphaMask {
  const mask = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = (i * 37) % 256;
  return mask;
}

/** Assert region output equals the same rect of a full applyMask pass. */
function expectRegionMatchesFull(
  w: number,
  h: number,
  options: CompositeOptions,
  region: Region,
): void {
  const src = gradientCanvas(w, h);
  const mask = variedMask(w, h);
  const srcData = src.getContext('2d')!.getImageData(0, 0, w, h);

  const fullCanvas = applyMask(src, mask, options);
  const full = fullCanvas.getContext('2d')!.getImageData(0, 0, w, h);
  const patch = applyMaskRegion(srcData, mask, options, region);

  expect(patch).not.toBeNull();
  const { data, x, y } = patch!;
  for (let yy = 0; yy < data.height; yy++) {
    for (let xx = 0; xx < data.width; xx++) {
      for (let k = 0; k < 4; k++) {
        const regionVal = data.data[(yy * data.width + xx) * 4 + k];
        const fullVal = full.data[((y + yy) * w + (x + xx)) * 4 + k];
        if (regionVal !== fullVal) {
          throw new Error(
            `pixel mismatch at region (${xx},${yy}) ch${k}: region=${regionVal} full=${fullVal}`,
          );
        }
      }
    }
  }
}

describe('applyMaskRegion — pixel identity with full pass', () => {
  it('transparent mode, interior rect', () => {
    expectRegionMatchesFull(32, 24, { mode: 'transparent' }, { x: 5, y: 4, width: 12, height: 10 });
  });

  it('transparent mode with feather, rect overlapping the image corner', () => {
    expectRegionMatchesFull(
      32, 24,
      { mode: 'transparent', feather: 2 },
      { x: -4, y: -4, width: 14, height: 12 },
    );
  });

  it('transparent mode with feather, rect at the bottom-right edge', () => {
    expectRegionMatchesFull(
      32, 24,
      { mode: 'transparent', feather: 3 },
      { x: 24, y: 16, width: 20, height: 20 },
    );
  });

  it('color mode, interior rect', () => {
    expectRegionMatchesFull(
      32, 24,
      { mode: 'color', color: '#3366cc' },
      { x: 8, y: 2, width: 16, height: 18 },
    );
  });

  it('color mode with feather', () => {
    expectRegionMatchesFull(
      32, 24,
      { mode: 'color', color: '#ff8800', feather: 1 },
      { x: 0, y: 0, width: 32, height: 24 },
    );
  });
});

describe('applyMaskRegion — clamping and unsupported modes', () => {
  it('returns null for a rect fully outside the image', () => {
    const src = gradientCanvas(8, 8);
    const srcData = src.getContext('2d')!.getImageData(0, 0, 8, 8);
    const mask = variedMask(8, 8);
    expect(applyMaskRegion(srcData, mask, { mode: 'transparent' }, { x: 20, y: 20, width: 5, height: 5 })).toBeNull();
    expect(applyMaskRegion(srcData, mask, { mode: 'transparent' }, { x: -10, y: -10, width: 5, height: 5 })).toBeNull();
  });

  it('clamps a partially out-of-bounds rect to the image', () => {
    const src = gradientCanvas(8, 8);
    const srcData = src.getContext('2d')!.getImageData(0, 0, 8, 8);
    const mask = variedMask(8, 8);
    const patch = applyMaskRegion(srcData, mask, { mode: 'transparent' }, { x: -3, y: 5, width: 6, height: 10 });
    expect(patch).not.toBeNull();
    expect(patch!.x).toBe(0);
    expect(patch!.y).toBe(5);
    expect(patch!.data.width).toBe(3);
    expect(patch!.data.height).toBe(3);
  });

  it('returns null for blur and image modes (whole-frame fallback)', () => {
    const src = gradientCanvas(8, 8);
    const srcData = src.getContext('2d')!.getImageData(0, 0, 8, 8);
    const mask = variedMask(8, 8);
    expect(applyMaskRegion(srcData, mask, { mode: 'blur', blurRadius: 4 }, { x: 0, y: 0, width: 8, height: 8 })).toBeNull();
    expect(applyMaskRegion(srcData, mask, { mode: 'image' }, { x: 0, y: 0, width: 8, height: 8 })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// toPNG / toJPEG
// ---------------------------------------------------------------------------

describe('toPNG', () => {
  it('returns a Blob with type image/png', async () => {
    const canvas = solidCanvas(2, 2, 255, 0, 0, 128);
    const blob = await toPNG(canvas);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
  });
});

describe('toJPEG', () => {
  it('returns a Blob with type image/jpeg', async () => {
    const canvas = solidCanvas(2, 2, 255, 0, 0);
    const blob = await toJPEG(canvas);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/jpeg');
  });

  it('accepts a custom quality value', async () => {
    const canvas = solidCanvas(2, 2, 255, 0, 0);
    const blob = await toJPEG(canvas, 0.5);
    expect(blob).toBeInstanceOf(Blob);
  });
});
