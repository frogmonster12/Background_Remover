import {
  pipeline,
  RawImage,
  env,
  type ImageSegmentationPipelineOutput,
} from '@huggingface/transformers';
import type { InferenceBackend, ModelKind, RemovalResult } from './contracts.js';

/** Per-model config. Licenses verified in MODELS.md — MIT/Apache-2.0 only. */
interface ModelSpec {
  /** HF repo id — also the path under public/models/ when self-hosted. */
  id: string;
  license: 'Apache-2.0' | 'MIT';
  /** ONNX dtype requested per backend (must match files fetched by scripts/download-model.mjs). */
  dtype: Record<InferenceBackend, 'uint8' | 'fp16' | 'fp32'>;
}

export const MODEL_REGISTRY: Record<ModelKind, ModelSpec> = {
  human: {
    id: 'onnx-community/ormbg-ONNX',
    license: 'Apache-2.0',
    dtype: { wasm: 'uint8', webgpu: 'fp16' },
  },
  general: {
    id: 'imgly/isnet-general-onnx',
    license: 'MIT',
    // No uint8 variant published; fp16 verified working in ort-web WASM (see MODELS.md).
    dtype: { wasm: 'fp16', webgpu: 'fp16' },
  },
};

// Back-compat aliases for the default (Human) model.
export const MODEL_ID = MODEL_REGISTRY.human.id;
export const MODEL_LICENSE = MODEL_REGISTRY.human.license;

// App base path, derived from this worker bundle's own URL so it works both
// at the domain root (dev: /src/worker.ts → '/') and at a subpath
// (GitHub project pages: /<repo>/assets/worker-x.js → '/<repo>/').
const APP_BASE = new URL('..', self.location.href).pathname;

// Prefer self-hosted weights from public/models/ (populated by `npm run download:model`).
// Falls back to HuggingFace CDN when local files are absent — both paths work;
// self-hosting is required for full offline support after one online visit.
env.allowLocalModels = true;
env.allowRemoteModels = true;
env.localModelPath = APP_BASE + 'models/';

// Serve ORT WASM runtime from same origin (public/ort/) to avoid cross-origin restrictions
// in Workers. The files are copied there by `npm run copy:ort`.
const wasmEnv = env.backends.onnx.wasm as Record<string, unknown>;
wasmEnv['wasmPaths'] = APP_BASE + 'ort/';

// Pipeline singletons — one per model, loaded once per worker lifetime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _pipes = new Map<ModelKind, any>();
let _activeBackend: InferenceBackend | null = null;

// Map a registry dtype to the ONNX filename transformers.js will request.
function onnxFileFor(dtype: 'uint8' | 'fp16' | 'fp32'): string {
  return dtype === 'fp32' ? 'onnx/model.onnx' : `onnx/model_${dtype}.onnx`;
}

/**
 * Check whether the self-hosted weights for a model are actually present.
 *
 * Dev/preview servers answer requests for MISSING files with the SPA shell —
 * HTTP 200 + text/html — so transformers.js never sees a 404 and never falls
 * back to the Hugging Face CDN; it tries to parse HTML as ONNX and dies.
 * This probe treats "not ok" OR "text/html for a non-HTML asset" as absent.
 *
 * HEAD + no-store, deliberately: an earlier Range-request probe broke the
 * live site — on hosts that honor Range (GitHub Pages; NOT vite dev/preview,
 * which is why local tests missed it), the probe's cancelled 206 body raced
 * the immediately-following real fetch of the same URL through the HTTP
 * cache / service worker, which then delivered a 1-byte body
 * (JSON.parse("{") failures). HEAD has no body to cancel, produces no 206,
 * writes nothing to any cache, and our SW passes non-GET requests through.
 */
async function localModelPresent(spec: ModelSpec, backend: InferenceBackend): Promise<boolean> {
  const files = ['config.json', 'preprocessor_config.json', onnxFileFor(spec.dtype[backend])];
  for (const file of files) {
    const url = `${env.localModelPath}${spec.id}/${file}`;
    try {
      const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
      if (!res.ok || contentType.includes('text/html')) return false;
    } catch {
      return false;
    }
  }
  return true;
}

// Loads are serialized because the local-vs-remote decision mutates the
// GLOBAL transformers.js env flags; two concurrent loads (e.g. switching
// models while the first is still downloading) must not interleave.
let _loadChain: Promise<unknown> = Promise.resolve();

// ORMBG cannot run on ort-web's WebGPU (JSEP) backend today: the model loads,
// but inference fails with "using ceil() in shape computation is not yet
// supported for MaxPool" — an ort-web operator gap, verified on real hardware
// (AMD RX 5600 XT, Chrome headed, cross-origin-isolated, 2026-06). ISNet shares
// the MaxPool-with-ceil architecture, so the same gap applies. Flip this once
// ort-web supports ceil-mode MaxPool; until then the probe is skipped so
// WebGPU-capable visitors don't download fp16 models just to fail.
const WEBGPU_ENABLED = false as boolean;

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
  if (!WEBGPU_ENABLED) return 'wasm';

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
 * Load the background-removal pipeline singleton for the given model.
 * Returns the backend actually used (may fall back from webgpu → wasm).
 * Idempotent per model: subsequent calls are no-ops.
 */
export async function loadModel(
  model: ModelKind,
  preferredBackend: InferenceBackend,
  onProgress?: (progress: number) => void,
): Promise<InferenceBackend> {
  const run = _loadChain.then(() => loadModelSerialized(model, preferredBackend, onProgress));
  _loadChain = run.catch(() => { /* a failed load must not block the next one */ });
  return run;
}

async function loadModelSerialized(
  model: ModelKind,
  preferredBackend: InferenceBackend,
  onProgress?: (progress: number) => void,
): Promise<InferenceBackend> {
  if (_pipes.has(model) && _activeBackend !== null) return _activeBackend;

  const spec = MODEL_REGISTRY[model];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const progressCallback = onProgress ? (data: any) => {
    if (data && typeof data.progress === 'number') {
      onProgress(data.progress / 100);
    }
  } : undefined;

  const tryLoad = async (backend: InferenceBackend) => {
    // Decide local vs CDN per load. Without the probe, a dev server's
    // 200-HTML answer for missing local files would mask the 404 and the
    // CDN fallback would never fire (fresh clone without download:model).
    const useLocal = await localModelPresent(spec, backend);
    env.allowLocalModels = useLocal;
    if (!useLocal) {
      console.info(
        `[Cutout] self-hosted weights for ${spec.id} not found under ` +
        `${env.localModelPath} — fetching from the Hugging Face CDN (one-time).`,
      );
    }
    const pipe = await pipeline('background-removal', spec.id, {
      device: backend,
      dtype: spec.dtype[backend],
      progress_callback: progressCallback,
    });
    _pipes.set(model, pipe);
    _activeBackend = backend;
  };

  try {
    await tryLoad(preferredBackend);
  } catch (err) {
    if (preferredBackend === 'webgpu') {
      // WebGPU not functional — fall back to WASM.
      _pipes.delete(model);
      await tryLoad('wasm');
    } else {
      throw new Error(describeLoadFailure(spec, err));
    }
  }

  if (_activeBackend === null) throw new Error('loadModel: backend still null after load attempt');
  return _activeBackend;
}

/**
 * Build an honest, cause-specific load-failure message. Three cases:
 *  (a) cross-origin isolation actually missing — the only time COEP is blamed
 *  (b) model files unreachable (404 / HTML masquerade / network) — names the
 *      model and where it was looked for
 *  (c) anything else — surfaces the real underlying error
 */
function describeLoadFailure(spec: ModelSpec, err: unknown): string {
  const detail = err instanceof Error ? err.message : String(err);
  const isolated = (self as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;

  // Blame missing isolation ONLY when the error itself is thread/SAB-shaped.
  // crossOriginIsolated === false is NORMAL on the first GitHub Pages load
  // (the SW injects COOP/COEP from the second load on) and single-threaded
  // WASM works fine there — an unrelated error must not be pinned on COEP.
  const looksLikeThreadFailure = /shared\s*is\s*disabled|sharedarraybuffer/i.test(detail);
  if (!isolated && looksLikeThreadFailure) {
    return (
      `Model load failed for ${spec.id}: this page is not cross-origin isolated, ` +
      `so multithreaded WASM is unavailable (COOP/COEP headers missing). ` +
      `Underlying error: ${detail}`
    );
  }

  const looksLikeMissingFile =
    /404|not found|unexpected token|<!doctype|failed to fetch|networkerror|could not locate/i.test(detail);
  if (looksLikeMissingFile) {
    return (
      `Model files for ${spec.id} could not be loaded — not present under ` +
      `${env.localModelPath}${spec.id}/ and the Hugging Face CDN fetch failed ` +
      `(offline, blocked, or repo unavailable). Underlying error: ${detail}`
    );
  }

  return `Model load failed for ${spec.id}. Underlying error: ${detail}`;
}

/** Return the backend the pipelines run on (null if nothing loaded). */
export function activeBackend(): InferenceBackend | null {
  return _activeBackend;
}

/**
 * Run background removal on an ImageBitmap with the given model.
 * Caller must have called loadModel(model, ...) first.
 * Returns a RemovalResult with a 1-channel alpha mask.
 */
export async function runInference(
  bitmap: ImageBitmap,
  model: ModelKind,
): Promise<RemovalResult> {
  const pipe = _pipes.get(model);
  if (pipe === undefined || _activeBackend === null) {
    throw new Error(`Pipeline for model "${model}" not loaded. Call loadModel() first.`);
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
  const output = await pipe(rawImage) as ImageSegmentationPipelineOutput;
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
