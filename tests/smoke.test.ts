import { describe, expect, it } from 'vitest';

describe('harness smoke test', () => {
  it('Vitest and happy-dom are wired correctly', () => {
    expect(typeof document).toBe('object');
    expect(1 + 1).toBe(2);
  });
});
