import { describe, expect, it } from 'vitest';
import type { RemovalResult } from './contracts.js';
import { mockRemoveBackground } from './inference.mock.js';

describe('mockRemoveBackground', () => {
  it('returns a RemovalResult that satisfies the contract', () => {
    const width = 64;
    const height = 48;
    const result: RemovalResult = mockRemoveBackground(width, height);

    expect(result.width).toBe(width);
    expect(result.height).toBe(height);
    expect(result.mask).toBeInstanceOf(Uint8ClampedArray);
    expect(result.mask.length).toBe(width * height);
    expect(result.backend).toBe('wasm');
    expect(result.inferenceMs).toBeGreaterThanOrEqual(0);
  });

  it('mask has non-trivial alpha (not all-opaque and not all-transparent)', () => {
    const result = mockRemoveBackground(100, 100);
    const hasOpaque = Array.from(result.mask).some((v) => v === 255);
    const hasTransparent = Array.from(result.mask).some((v) => v === 0);
    expect(hasOpaque).toBe(true);
    expect(hasTransparent).toBe(true);
  });

  it('produces a deterministic ellipse (same result for same dimensions)', () => {
    const a = mockRemoveBackground(80, 60);
    const b = mockRemoveBackground(80, 60);
    expect(a.mask).toEqual(b.mask);
  });
});
