import type { AlphaMask } from './contracts.js';

export type BrushMode = 'restore' | 'erase';

/**
 * Applies a soft circular stamp at (cx, cy) in image-pixel coordinates.
 * Uses cosine falloff — full effect at center, zero at the radius edge.
 * Mutates and returns the mask.
 *
 * @param strength  0–1 blend per application (default 1 = full paint on first pass)
 */
export function stampMask(
  mask: AlphaMask,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
  mode: BrushMode,
  strength = 1,
): AlphaMask {
  const r = Math.max(1, radius);
  const x0 = Math.max(0, Math.floor(cx - r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const x1 = Math.min(width - 1, Math.ceil(cx + r));
  const y1 = Math.min(height - 1, Math.ceil(cy + r));

  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
      if (dist > r) continue;
      // Cosine falloff: 1 at center → 0 at radius edge
      const falloff = Math.cos((dist / r) * (Math.PI / 2));
      const alpha = Math.min(1, falloff * strength);
      const idx = py * width + px;
      const cur = mask[idx]!;
      if (mode === 'restore') {
        mask[idx] = Math.round(cur + (255 - cur) * alpha);
      } else {
        mask[idx] = Math.round(cur * (1 - alpha));
      }
    }
  }
  return mask;
}

/**
 * Interpolates stamps along a line from (x0,y0) to (x1,y1) for gap-free strokes.
 * Stamps every ~radius/4 pixels to ensure smooth coverage even at fast pointer speeds.
 */
export function stampLine(
  mask: AlphaMask,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  mode: BrushMode,
  strength = 1,
): AlphaMask {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const step = Math.max(1, radius * 0.25);
  const steps = Math.max(0, Math.ceil(dist / step));
  for (let i = 0; i <= steps; i++) {
    const t = steps > 0 ? i / steps : 0;
    stampMask(mask, width, height, x0 + dx * t, y0 + dy * t, radius, mode, strength);
  }
  return mask;
}
