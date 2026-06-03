import './style.css';
import { createBatchQueue } from './batch.js';
import { mountBatchView } from './batch-view.js';
import { mockRemoveBackground } from './inference.mock.js';
import type { RemovalResult } from './contracts.js';

// Mock inference: reads image dimensions from a decoded bitmap.
// Falls back to 64×64 if createImageBitmap is unavailable.
async function mockInference(file: File): Promise<RemovalResult> {
  try {
    const bitmap = await createImageBitmap(file);
    const result = mockRemoveBackground(bitmap.width, bitmap.height);
    bitmap.close();
    return result;
  } catch {
    return mockRemoveBackground(64, 64);
  }
}

// Renders cutout to PNG bytes for ZIP export.
async function renderCutout(_file: File, result: RemovalResult): Promise<Uint8Array> {
  const w = result.width || 1;
  const h = result.height || 1;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D context');
  const imageData = new ImageData(w, h);
  for (let i = 0; i < result.mask.length; i++) {
    imageData.data[i * 4 + 3] = result.mask[i];
  }
  ctx.putImageData(imageData, 0, 0);
  return new Promise<Uint8Array>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) { reject(new Error('toBlob failed')); return; }
      void blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf)));
    }, 'image/png');
  });
}

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('#app not found');

const queue = createBatchQueue(mockInference);
mountBatchView(app, queue, renderCutout);
