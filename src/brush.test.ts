import { describe, expect, it } from 'vitest';
import { stampMask, stampLine } from './brush.js';

// ---------------------------------------------------------------------------
// stampMask — restore mode
// ---------------------------------------------------------------------------

describe('stampMask — restore mode', () => {
  it('raises center pixel to 255 at default strength', () => {
    const mask = new Uint8ClampedArray(9); // 3×3, all 0
    stampMask(mask, 3, 3, 1, 1, 1.4, 'restore');
    expect(mask[4]).toBe(255); // (1,1) = index 4
  });

  it('applies partial alpha at mid-radius', () => {
    // 5×1 mask all 0; center at x=2, radius=2 → x=1 is at dist=1 (partial falloff)
    const mask = new Uint8ClampedArray(5);
    stampMask(mask, 5, 1, 2, 0, 2, 'restore');
    // center: dist=0, falloff=1 → should be 255
    expect(mask[2]).toBe(255);
    // x=1: dist=1, falloff=cos(π/4)≈0.707 → 0<val<255
    expect(mask[1]).toBeGreaterThan(0);
    expect(mask[1]).toBeLessThan(255);
    // center should be brighter than edge
    expect(mask[2]).toBeGreaterThan(mask[1]);
  });

  it('leaves pixels strictly outside radius untouched', () => {
    const mask = new Uint8ClampedArray(5).fill(100); // 5×1
    stampMask(mask, 5, 1, 2, 0, 1, 'restore'); // radius=1
    // x=0 (dist=2 > 1) and x=4 (dist=2 > 1) → unchanged
    expect(mask[0]).toBe(100);
    expect(mask[4]).toBe(100);
  });

  it('is idempotent — repeated calls on a maxed mask stay at 255', () => {
    const mask = new Uint8ClampedArray(1); // single pixel
    stampMask(mask, 1, 1, 0, 0, 1, 'restore');
    stampMask(mask, 1, 1, 0, 0, 1, 'restore');
    expect(mask[0]).toBe(255);
  });
});

// ---------------------------------------------------------------------------
// stampMask — erase mode
// ---------------------------------------------------------------------------

describe('stampMask — erase mode', () => {
  it('lowers center pixel to 0 at default strength', () => {
    const mask = new Uint8ClampedArray(9).fill(255); // 3×3, all opaque
    stampMask(mask, 3, 3, 1, 1, 1.4, 'erase');
    expect(mask[4]).toBe(0);
  });

  it('partially lowers alpha at mid-radius', () => {
    const mask = new Uint8ClampedArray(5).fill(255);
    stampMask(mask, 5, 1, 2, 0, 2, 'erase');
    // center: fully erased
    expect(mask[2]).toBe(0);
    // x=1: partially erased (0 < val < 255)
    expect(mask[1]).toBeGreaterThan(0);
    expect(mask[1]).toBeLessThan(255);
    // edge retains more than center
    expect(mask[1]).toBeGreaterThan(mask[2]);
  });

  it('leaves pixels strictly outside radius untouched', () => {
    const mask = new Uint8ClampedArray(5).fill(200);
    stampMask(mask, 5, 1, 2, 0, 1, 'erase');
    expect(mask[0]).toBe(200);
    expect(mask[4]).toBe(200);
  });

  it('is idempotent — repeated calls on a zeroed mask stay at 0', () => {
    const mask = new Uint8ClampedArray(1); // single pixel = 0
    stampMask(mask, 1, 1, 0, 0, 1, 'erase');
    stampMask(mask, 1, 1, 0, 0, 1, 'erase');
    expect(mask[0]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// stampMask — out-of-bounds safety
// ---------------------------------------------------------------------------

describe('stampMask — out-of-bounds safety', () => {
  it('does not throw when center is far outside the mask', () => {
    const mask = new Uint8ClampedArray(4).fill(128); // 2×2
    expect(() => stampMask(mask, 2, 2, -50, -50, 10, 'restore')).not.toThrow();
    expect(() => stampMask(mask, 2, 2, 200, 200, 10, 'erase')).not.toThrow();
  });

  it('still paints in-bounds pixels when center is partially off-canvas', () => {
    // center at (-0.5, 0), radius=2 — some pixels in the 2×2 mask are reachable
    const mask = new Uint8ClampedArray(4).fill(0); // 2×2
    stampMask(mask, 2, 2, -0.5, 0, 2, 'restore');
    const anyPainted = Array.from(mask).some((v) => v > 0);
    expect(anyPainted).toBe(true);
  });

  it('clamps to [0,255] — no overflow', () => {
    const mask = new Uint8ClampedArray([200]);
    stampMask(mask, 1, 1, 0, 0, 1, 'restore');
    expect(mask[0]).toBeLessThanOrEqual(255);
    expect(mask[0]).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// stampLine — gap-free interpolation
// ---------------------------------------------------------------------------

describe('stampLine', () => {
  it('fills the gap between two distant points (no holes)', () => {
    // 20×1 mask all 0; stroke from x=2 to x=17 with small radius=1.5
    // Without interpolation there would be gaps, with it the middle should be painted
    const mask = new Uint8ClampedArray(20).fill(0);
    stampLine(mask, 20, 1, 2, 0, 17, 0, 1.5, 'restore');
    expect(mask[2]).toBeGreaterThan(0); // near start
    expect(mask[9]).toBeGreaterThan(0); // middle
    expect(mask[10]).toBeGreaterThan(0);
    expect(mask[17]).toBeGreaterThan(0); // near end
  });

  it('handles a zero-length segment (start === end)', () => {
    const mask = new Uint8ClampedArray(9).fill(0);
    expect(() => stampLine(mask, 3, 3, 1, 1, 1, 1, 1.4, 'restore')).not.toThrow();
    expect(mask[4]).toBe(255); // single stamp at center
  });

  it('handles erase mode along a line', () => {
    const mask = new Uint8ClampedArray(10).fill(255);
    stampLine(mask, 10, 1, 2, 0, 7, 0, 1.5, 'erase');
    expect(mask[4]).toBe(0); // midpoint should be erased
    expect(mask[5]).toBe(0);
  });
});
