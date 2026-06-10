import type { AlphaMask, CompositeOptions } from './contracts.js';

type ImageSource = ImageBitmap | OffscreenCanvas;

// ---------------------------------------------------------------------------
// Color parsing
// ---------------------------------------------------------------------------

function parseColor(color: string): [number, number, number] {
  const hex6 = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hex6) {
    return [parseInt(hex6[1]!, 16), parseInt(hex6[2]!, 16), parseInt(hex6[3]!, 16)];
  }
  const hex3 = color.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (hex3) {
    return [
      parseInt(hex3[1]! + hex3[1]!, 16),
      parseInt(hex3[2]! + hex3[2]!, 16),
      parseInt(hex3[3]! + hex3[3]!, 16),
    ];
  }
  // Fallback: let the canvas parse named colors, rgb(), hsl(), etc.
  const tmp = new OffscreenCanvas(1, 1);
  const ctx = tmp.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0]!, d[1]!, d[2]!];
}

// ---------------------------------------------------------------------------
// Source pixel data extraction
// ---------------------------------------------------------------------------

function getSourceData(image: ImageSource): ImageData {
  const { width, height } = image;
  if (image instanceof OffscreenCanvas) {
    return image.getContext('2d')!.getImageData(0, 0, width, height);
  }
  const tmp = new OffscreenCanvas(width, height);
  const ctx = tmp.getContext('2d')!;
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, width, height);
}

// ---------------------------------------------------------------------------
// Compositing modes (operate on flat Uint8ClampedArray buffers)
// ---------------------------------------------------------------------------

function compositeTransparent(
  out: Uint8ClampedArray,
  src: Uint8ClampedArray,
  mask: AlphaMask,
): void {
  for (let i = 0; i < mask.length; i++) {
    out[i * 4] = src[i * 4]!;
    out[i * 4 + 1] = src[i * 4 + 1]!;
    out[i * 4 + 2] = src[i * 4 + 2]!;
    out[i * 4 + 3] = mask[i]!;
  }
}

function compositeColor(
  out: Uint8ClampedArray,
  src: Uint8ClampedArray,
  mask: AlphaMask,
  color: string,
): void {
  const [cr, cg, cb] = parseColor(color);
  for (let i = 0; i < mask.length; i++) {
    const a = mask[i]! / 255;
    out[i * 4] = Math.round(src[i * 4]! * a + cr * (1 - a));
    out[i * 4 + 1] = Math.round(src[i * 4 + 1]! * a + cg * (1 - a));
    out[i * 4 + 2] = Math.round(src[i * 4 + 2]! * a + cb * (1 - a));
    out[i * 4 + 3] = 255;
  }
}

function boxBlur(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): Uint8ClampedArray {
  const r = Math.max(1, Math.round(radius));
  const tmp = new Uint8ClampedArray(data.length);
  const result = new Uint8ClampedArray(data.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sumR = 0, sumG = 0, sumB = 0;
      for (let dx = -r; dx <= r; dx++) {
        const nx = Math.min(width - 1, Math.max(0, x + dx));
        const idx = (y * width + nx) * 4;
        sumR += data[idx]!;
        sumG += data[idx + 1]!;
        sumB += data[idx + 2]!;
      }
      const cnt = 2 * r + 1;
      const ti = (y * width + x) * 4;
      tmp[ti] = sumR / cnt;
      tmp[ti + 1] = sumG / cnt;
      tmp[ti + 2] = sumB / cnt;
      tmp[ti + 3] = data[ti + 3]!;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sumR = 0, sumG = 0, sumB = 0;
      for (let dy = -r; dy <= r; dy++) {
        const ny = Math.min(height - 1, Math.max(0, y + dy));
        const idx = (ny * width + x) * 4;
        sumR += tmp[idx]!;
        sumG += tmp[idx + 1]!;
        sumB += tmp[idx + 2]!;
      }
      const cnt = 2 * r + 1;
      const oi = (y * width + x) * 4;
      result[oi] = sumR / cnt;
      result[oi + 1] = sumG / cnt;
      result[oi + 2] = sumB / cnt;
      result[oi + 3] = data[oi + 3]!;
    }
  }

  return result;
}

function compositeBlur(
  out: Uint8ClampedArray,
  src: Uint8ClampedArray,
  mask: AlphaMask,
  width: number,
  height: number,
  radius: number,
): void {
  const blurred = boxBlur(src, width, height, radius);
  for (let i = 0; i < mask.length; i++) {
    const a = mask[i]! / 255;
    out[i * 4] = Math.round(src[i * 4]! * a + blurred[i * 4]! * (1 - a));
    out[i * 4 + 1] = Math.round(src[i * 4 + 1]! * a + blurred[i * 4 + 1]! * (1 - a));
    out[i * 4 + 2] = Math.round(src[i * 4 + 2]! * a + blurred[i * 4 + 2]! * (1 - a));
    out[i * 4 + 3] = 255;
  }
}

function compositeImageBg(
  out: Uint8ClampedArray,
  src: Uint8ClampedArray,
  mask: AlphaMask,
  bg: ImageBitmap,
  width: number,
  height: number,
): void {
  const tmp = new OffscreenCanvas(width, height);
  const tmpCtx = tmp.getContext('2d')!;
  const scale = Math.max(width / bg.width, height / bg.height);
  const bw = bg.width * scale;
  const bh = bg.height * scale;
  tmpCtx.drawImage(bg, (width - bw) / 2, (height - bh) / 2, bw, bh);
  const bgData = tmpCtx.getImageData(0, 0, width, height).data;

  for (let i = 0; i < mask.length; i++) {
    const a = mask[i]! / 255;
    out[i * 4] = Math.round(src[i * 4]! * a + bgData[i * 4]! * (1 - a));
    out[i * 4 + 1] = Math.round(src[i * 4 + 1]! * a + bgData[i * 4 + 1]! * (1 - a));
    out[i * 4 + 2] = Math.round(src[i * 4 + 2]! * a + bgData[i * 4 + 2]! * (1 - a));
    out[i * 4 + 3] = 255;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Box-blur the alpha channel of a mask to soften hard cutout edges.
 * radius=0 returns a copy of the input unchanged.
 */
export function featherMask(
  mask: AlphaMask,
  width: number,
  height: number,
  radius: number,
): AlphaMask {
  if (radius <= 0) return new Uint8ClampedArray(mask);

  const r = Math.round(radius);
  const out = new Uint8ClampedArray(mask.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -r; dy <= r; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          sum += mask[ny * width + nx]!;
          count++;
        }
      }
      out[y * width + x] = count > 0 ? Math.round(sum / count) : 0;
    }
  }

  return out;
}

/**
 * Composite the subject (defined by mask) over a background.
 * Accepts an OffscreenCanvas source in addition to ImageBitmap so that
 * unit tests can supply synthetic pixel data without createImageBitmap.
 */
export function applyMask(
  image: ImageSource,
  mask: AlphaMask,
  options: CompositeOptions = { mode: 'transparent' },
): OffscreenCanvas {
  const { width, height } = image;
  const srcData = getSourceData(image);

  const feathered =
    (options.feather ?? 0) > 0
      ? featherMask(mask, width, height, options.feather!)
      : mask;

  const out = new Uint8ClampedArray(width * height * 4);

  switch (options.mode) {
    case 'transparent':
      compositeTransparent(out, srcData.data, feathered);
      break;
    case 'color':
      compositeColor(out, srcData.data, feathered, options.color ?? '#000000');
      break;
    case 'blur':
      compositeBlur(out, srcData.data, feathered, width, height, options.blurRadius ?? 10);
      break;
    case 'image':
      if (options.backgroundImage) {
        compositeImageBg(out, srcData.data, feathered, options.backgroundImage, width, height);
      } else {
        compositeTransparent(out, srcData.data, feathered);
      }
      break;
  }

  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d')!.putImageData(new ImageData(out, width, height), 0, 0);
  return canvas;
}

// ---------------------------------------------------------------------------
// Region compositing (brush live-preview path)
// ---------------------------------------------------------------------------

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Feathered mask values for a rectangular region — identical math to
 * featherMask (truncated box window, normalized by in-bounds count) so the
 * region pass stays pixel-identical to the full pass. Uses a summed-area
 * table over the f-expanded rect, making each pixel O(1) instead of O(f²).
 */
function featherRegion(
  mask: AlphaMask,
  width: number,
  height: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  f: number,
): Uint8ClampedArray {
  // Every pixel's window, clamped to the image, lies inside the rect
  // expanded by f (also clamped) — so a SAT over that area suffices.
  const ex0 = Math.max(0, x0 - f);
  const ey0 = Math.max(0, y0 - f);
  const ex1 = Math.min(width, x0 + w + f);
  const ey1 = Math.min(height, y0 + h + f);
  const ew = ex1 - ex0;
  const eh = ey1 - ey0;

  // sat[(y+1)*(ew+1)+(x+1)] = sum of mask over expanded-rect rows ≤ y, cols ≤ x.
  // Integer sums stay exact and fit Uint32 (255 · 6 M pixels < 2³²).
  const stride = ew + 1;
  const sat = new Uint32Array(stride * (eh + 1));
  for (let yy = 0; yy < eh; yy++) {
    let rowSum = 0;
    const maskRow = (ey0 + yy) * width + ex0;
    for (let xx = 0; xx < ew; xx++) {
      rowSum += mask[maskRow + xx]!;
      sat[(yy + 1) * stride + (xx + 1)] = sat[yy * stride + (xx + 1)]! + rowSum;
    }
  }

  const out = new Uint8ClampedArray(w * h);
  for (let yy = 0; yy < h; yy++) {
    const py = y0 + yy;
    const wy0 = Math.max(0, py - f);
    const wy1 = Math.min(height - 1, py + f);
    const c = wy0 - ey0;
    const d = wy1 - ey0 + 1;
    for (let xx = 0; xx < w; xx++) {
      const px = x0 + xx;
      const wx0 = Math.max(0, px - f);
      const wx1 = Math.min(width - 1, px + f);
      const a = wx0 - ex0;
      const b = wx1 - ex0 + 1;
      const sum = sat[d * stride + b]! - sat[c * stride + b]! - sat[d * stride + a]! + sat[c * stride + a]!;
      const count = (wx1 - wx0 + 1) * (wy1 - wy0 + 1);
      out[yy * w + xx] = Math.round(sum / count);
    }
  }
  return out;
}

/**
 * Composite only a rectangular region, using pre-extracted full-image source
 * pixels. Supports 'transparent' and 'color' modes (with feather) — the modes
 * where a pixel's output depends only on its own mask/source values. Blur and
 * image backgrounds need whole-frame context; callers fall back to applyMask.
 *
 * The region is clamped to the image; returns null when nothing overlaps.
 * The returned ImageData is sized to the clamped rect and ready for
 * `ctx.putImageData(data, x, y)`.
 */
export function applyMaskRegion(
  srcData: ImageData,
  mask: AlphaMask,
  options: CompositeOptions,
  region: Region,
): { data: ImageData; x: number; y: number } | null {
  if (options.mode !== 'transparent' && options.mode !== 'color') return null;

  const W = srcData.width;
  const H = srcData.height;
  const x0 = Math.max(0, Math.floor(region.x));
  const y0 = Math.max(0, Math.floor(region.y));
  const x1 = Math.min(W, Math.ceil(region.x + region.width));
  const y1 = Math.min(H, Math.ceil(region.y + region.height));
  if (x1 <= x0 || y1 <= y0) return null;

  const w = x1 - x0;
  const h = y1 - y0;
  const f = (options.feather ?? 0) > 0 ? Math.round(options.feather!) : 0;
  const src = srcData.data;
  const out = new Uint8ClampedArray(w * h * 4);
  const feathered = f > 0 ? featherRegion(mask, W, H, x0, y0, w, h, f) : null;

  let cr = 0, cg = 0, cb = 0;
  if (options.mode === 'color') {
    [cr, cg, cb] = parseColor(options.color ?? '#000000');
  }

  for (let yy = 0; yy < h; yy++) {
    const py = y0 + yy;
    for (let xx = 0; xx < w; xx++) {
      const px = x0 + xx;
      const si = (py * W + px) * 4;
      const oi = (yy * w + xx) * 4;
      const m = feathered ? feathered[yy * w + xx]! : mask[py * W + px]!;
      if (options.mode === 'color') {
        const a = m / 255;
        out[oi]     = Math.round(src[si]! * a + cr * (1 - a));
        out[oi + 1] = Math.round(src[si + 1]! * a + cg * (1 - a));
        out[oi + 2] = Math.round(src[si + 2]! * a + cb * (1 - a));
        out[oi + 3] = 255;
      } else {
        out[oi]     = src[si]!;
        out[oi + 1] = src[si + 1]!;
        out[oi + 2] = src[si + 2]!;
        out[oi + 3] = m;
      }
    }
  }

  return { data: new ImageData(out, w, h), x: x0, y: y0 };
}

/** Encode canvas to PNG (preserves alpha channel). */
export async function toPNG(canvas: OffscreenCanvas): Promise<Blob> {
  return canvas.convertToBlob({ type: 'image/png' });
}

/** Encode canvas to JPEG at the given quality (0–1, default 0.92). */
export async function toJPEG(canvas: OffscreenCanvas, quality = 0.92): Promise<Blob> {
  return canvas.convertToBlob({ type: 'image/jpeg', quality });
}
