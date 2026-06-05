import {
  pipeline,
  RawImage,
  env,
  type ImageSegmentationPipelineOutput,
} from '@huggingface/transformers';
import type { InferenceBackend, RemovalResult } from './contracts.js';

// Model: ORMBG (Apache-2.0). Confirmed in MODELS.md.
export const MODEL_ID = 'onnx-community/ormbg-ONNX' as const;
export const MODEL_LICENSE = 'Apache-2.0' as const;

// Prefer self-hosted weights from public/models/ (populated by `npm run download:model`).
// Falls back to HuggingFace CDN when local files are absent — both paths work;
// self-hosting is required for full offline support after one online visit.
env.allowLocalModels = true;
env.allowRemoteModels = true;

// Serve ORT WASM runtime from same origin (public/ort/) to avoid cross-origin restrictions
// in Workers. The files are copied there by `npm run copy:ort`.
const wasmEnv = env.backends.onnx.wasm as Record<string, unknown>;
wasmEnv['wasmPaths'] = '/ort/';

// Module-level singleton — loaded once per worker lifetime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _pipe: any = null;
let _activeBackend: InferenceBackend | null = null;

/**
 * Probe for WebGPU support. Returns 'webgpu' if a GPU adapter is found,
 * otherwise 'wasm'.
 *
 * FORCE_WASM build flag bypasses the probe — used by the headless Playwright
 * inference test where navigator.gpu exists (SwiftShader) but WebGPU ONNX ops
 * are not reliably supported.
 */
export async function detectBackend(): Promise<InferenceBackend> {
  if (__FORCE_WASM__) return 'wasm';

  if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
    try {
      const gpu = navigator.gpu as { requestAdapter(): Promise<unknown> };
      const adapter = await gpu.requestAdapter();
      if (adapter !== null) return 'webgpu';
    } catch {
      // WebGPU not available — fall through
    }
  }
  return 'wasm';
}

/**
 * Load the background-removal pipeline singleton.
 * Returns the backend actually used (may fall back from webgpu → wasm).
 * Idempotent: subsequent calls with a matching backend are no-ops.
 */
export async function loadModel(
  preferredBackend: InferenceBackend,
  onProgress?: (progress: number) => void,
): Promise<InferenceBackend> {
  if (_pipe !== null && _activeBackend !== null) return _activeBackend;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const progressCallback = onProgress ? (data: any) => {
    if (data && typeof data.progress === 'number') {
      onProgress(data.progress / 100);
    }
  } : undefined;

  const tryLoad = async (backend: InferenceBackend) => {
    // Use uint8 quantized model (44.3 MB) for WASM; fp16 (88.1 MB) for WebGPU.
    const dtype = backend === 'webgpu' ? 'fp16' : 'uint8';
    _pipe = await pipeline('background-removal', MODEL_ID, {
      device: backend,
      dtype,
      progress_callback: progressCallback,
    });
    _activeBackend = backend;
  };

  try {
    await tryLoad(preferredBackend);
  } catch {
    if (preferredBackend === 'webgpu') {
      // WebGPU not functional — fall back to WASM uint8.
      _pipe = null;
      _activeBackend = null;
      await tryLoad('wasm');
    } else {
      throw new Error(`WASM model load failed for ${MODEL_ID}. Check network and COEP headers.`);
    }
  }

  if (_activeBackend === null) throw new Error('loadModel: backend still null after load attempt');
  return _activeBackend;
}

/** Return the backend the pipeline was loaded on (null if not loaded). */
export function activeBackend(): InferenceBackend | null {
  return _activeBackend;
}

/**
 * Run background removal on an ImageBitmap.
 * Caller must have called loadModel() first.
 * Returns a RemovalResult with a 1-channel alpha mask.
 */
export async function runInference(
  bitmap: ImageBitmap,
): Promise<RemovalResult> {
  if (_pipe === null || _activeBackend === null) {
    throw new Error('Pipeline not loaded. Call loadModel() first.');
  }

  const inferenceStart = performance.now();

  // Convert ImageBitmap → RawImage (RGBA) via OffscreenCanvas.
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get OffscreenCanvas 2D context');
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  const rawImage = new RawImage(imageData.data, bitmap.width, bitmap.height, 4);

  // Run background-removal pipeline. Output is an array of RawImages (RGBA cutout).
  const output = await _pipe(rawImage) as ImageSegmentationPipelineOutput;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resultImage: RawImage = (output as any)[0];

  // Extract alpha channel: 255 = foreground, 0 = background.
  const mask = new Uint8ClampedArray(bitmap.width * bitmap.height);
  if (resultImage.channels === 4) {
    for (let i = 0; i < mask.length; i++) {
      mask[i] = resultImage.data[i * 4 + 3];
    }
  } else {
    // Fallback: treat first channel as mask (should not happen for background-removal).
    for (let i = 0; i < mask.length; i++) {
      mask[i] = resultImage.data[i * resultImage.channels];
    }
  }

  return {
    mask,
    width: bitmap.width,
    height: bitmap.height,
    inferenceMs: performance.now() - inferenceStart,
    backend: _activeBackend,
  };
}
