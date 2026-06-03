import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnsupportedFormatError, decodeToBitmap } from './formats.js';

// Mock heic2any before any dynamic import resolves it
vi.mock('heic2any', () => ({
  default: vi.fn().mockResolvedValue(new Blob([], { type: 'image/jpeg' })),
}));

const fakeBitmap = { width: 100, height: 80, close: vi.fn() } as unknown as ImageBitmap;

beforeEach(() => {
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(fakeBitmap));
});

describe('decodeToBitmap — supported formats', () => {
  it.each([
    ['image/png', 'test.png'],
    ['image/jpeg', 'test.jpg'],
    ['image/webp', 'test.webp'],
    ['image/gif', 'test.gif'],
  ])('decodes %s via createImageBitmap', async (type, name) => {
    const file = new File([''], name, { type });
    const bitmap = await decodeToBitmap(file);
    expect(bitmap).toBe(fakeBitmap);
    expect(createImageBitmap).toHaveBeenCalledWith(file);
  });
});

describe('decodeToBitmap — unsupported format', () => {
  it('throws UnsupportedFormatError for image/bmp', async () => {
    const file = new File([''], 'test.bmp', { type: 'image/bmp' });
    await expect(decodeToBitmap(file)).rejects.toBeInstanceOf(UnsupportedFormatError);
  });

  it('error message includes the MIME type', async () => {
    const file = new File([''], 'test.tiff', { type: 'image/tiff' });
    await expect(decodeToBitmap(file)).rejects.toThrow('image/tiff');
  });

  it('UnsupportedFormatError.name is UnsupportedFormatError', async () => {
    const file = new File([''], 'test.bmp', { type: 'image/bmp' });
    try {
      await decodeToBitmap(file);
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as UnsupportedFormatError).name).toBe('UnsupportedFormatError');
    }
  });
});

describe('decodeToBitmap — HEIC', () => {
  it('dispatches image/heic to heic2any and returns a bitmap', async () => {
    const file = new File([''], 'photo.heic', { type: 'image/heic' });
    const bitmap = await decodeToBitmap(file);
    expect(bitmap).toBe(fakeBitmap);
    // createImageBitmap called with the converted jpeg blob, not the heic file
    expect(createImageBitmap).not.toHaveBeenCalledWith(file);
    expect(createImageBitmap).toHaveBeenCalledTimes(1);
  });

  it('dispatches image/heif to heic2any', async () => {
    const file = new File([''], 'photo.heif', { type: 'image/heif' });
    const bitmap = await decodeToBitmap(file);
    expect(bitmap).toBe(fakeBitmap);
  });
});
