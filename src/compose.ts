/**
 * compose.ts — stub for track/ui. Track A (track/compose) will replace this
 * with the canonical implementation. These signatures match contracts.ts exactly
 * so the UI compiles and runs against the mock today.
 */
import type { RemovalResult, CompositeOptions } from './contracts.js';

export async function decodeToBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

export async function applyMask(
  source: ImageBitmap,
  result: RemovalResult,
  options: CompositeOptions,
): Promise<ImageBitmap> {
  const { width, height, mask } = result;

  // Build alpha-masked cutout
  const cutout = new OffscreenCanvas(width, height);
  const ctx = cutout.getContext('2d')!;
  ctx.drawImage(source, 0, 0, width, height);
  const imgData = ctx.getImageData(0, 0, width, height);
  const { data } = imgData;

  const featherPx = (options.feather ?? 0) * 12.75; // slider 0-20 → ~0-255 range
  for (let i = 0; i < mask.length; i++) {
    let a = mask[i];
    if (featherPx > 0) {
      const dist = Math.min(a, 255 - a);
      if (dist < featherPx) a = Math.round((dist / featherPx) * a);
    }
    data[i * 4 + 3] = a;
  }
  ctx.putImageData(imgData, 0, 0);

  if (options.mode === 'transparent') {
    return cutout.transferToImageBitmap();
  }

  const out = new OffscreenCanvas(width, height);
  const outCtx = out.getContext('2d')!;

  if (options.mode === 'color' && options.color) {
    outCtx.fillStyle = options.color;
    outCtx.fillRect(0, 0, width, height);
  } else if (options.mode === 'blur') {
    const r = options.blurRadius ?? 20;
    outCtx.filter = `blur(${r}px)`;
    outCtx.drawImage(source, 0, 0, width, height);
    outCtx.filter = 'none';
  } else if (options.mode === 'image' && options.backgroundImage) {
    const bg = options.backgroundImage;
    const scale = Math.max(width / bg.width, height / bg.height);
    const sw = bg.width * scale;
    const sh = bg.height * scale;
    outCtx.drawImage(bg, (width - sw) / 2, (height - sh) / 2, sw, sh);
  }

  outCtx.drawImage(cutout, 0, 0);
  return out.transferToImageBitmap();
}
