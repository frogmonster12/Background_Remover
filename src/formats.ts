export class UnsupportedFormatError extends Error {
  constructor(mimeType: string) {
    super(`Unsupported image format: ${mimeType}`);
    this.name = 'UnsupportedFormatError';
  }
}

const SUPPORTED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

/**
 * Decodes any supported image File to an ImageBitmap.
 * HEIC/HEIF is handled via a dynamically-imported heic2any conversion
 * so the ~2.7 MB decoder is never loaded for non-HEIC files.
 */
export async function decodeToBitmap(file: File): Promise<ImageBitmap> {
  const type = file.type.toLowerCase();

  if (type === 'image/heic' || type === 'image/heif') {
    const { default: heic2any } = await import('heic2any');
    const converted = (await heic2any({
      blob: file,
      toType: 'image/jpeg',
    })) as Blob | Blob[];
    const jpeg = Array.isArray(converted) ? converted[0]! : converted;
    return createImageBitmap(jpeg);
  }

  if (!SUPPORTED_TYPES.has(type)) {
    throw new UnsupportedFormatError(file.type);
  }

  return createImageBitmap(file);
}
