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

/** Encode canvas to PNG (preserves alpha channel). */
export async function toPNG(canvas: OffscreenCanvas): Promise<Blob> {
  return canvas.convertToBlob({ type: 'image/png' });
}

/** Encode canvas to JPEG at the given quality (0–1, default 0.92). */
export async function toJPEG(canvas: OffscreenCanvas, quality = 0.92): Promise<Blob> {
  return canvas.convertToBlob({ type: 'image/jpeg', quality });
}
