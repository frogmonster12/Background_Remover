/**
 * contracts.ts — integration boundary frozen after bootstrap.
 * All tracks code against these types. Do NOT modify without flagging to the team.
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** Which compute backend the model ran on. */
export type InferenceBackend = 'webgpu' | 'wasm';

/**
 * Which segmentation model to run.
 * - 'human'   — ORMBG: best on photos of people/pets (default).
 * - 'general' — ISNet general-use: illustrations, products, arbitrary subjects.
 * Added for the Human/General toggle (prompt 13) as an OPTIONAL field so all
 * pre-existing messages remain valid; omitted means 'human'.
 */
export type ModelKind = 'human' | 'general';

/** Background replacement mode for composite step. */
export type BackgroundMode = 'transparent' | 'color' | 'blur' | 'image';

/** Raw alpha mask — one byte per pixel, same dimensions as the source image. */
export type AlphaMask = Uint8ClampedArray;

// ---------------------------------------------------------------------------
// Inference result
// ---------------------------------------------------------------------------

/** What the worker returns after a successful inference pass. */
export interface RemovalResult {
  /** Alpha mask: 1 byte per pixel (0 = transparent, 255 = opaque). */
  mask: AlphaMask;
  /** Original image width in CSS pixels. */
  width: number;
  /** Original image height in CSS pixels. */
  height: number;
  /** Wall-clock time for the inference call, milliseconds. */
  inferenceMs: number;
  /** Which backend the model executed on. */
  backend: InferenceBackend;
}

// ---------------------------------------------------------------------------
// Composite options
// ---------------------------------------------------------------------------

/** Options passed to the compose step after inference. */
export interface CompositeOptions {
  mode: BackgroundMode;
  /** CSS color string; used when mode === 'color'. */
  color?: string;
  /** Blur radius in pixels; used when mode === 'blur'. */
  blurRadius?: number;
  /** Replacement background ImageBitmap; used when mode === 'image'. */
  backgroundImage?: ImageBitmap;
  /** Edge feather radius in pixels (0 = hard edge). */
  feather?: number;
}

// ---------------------------------------------------------------------------
// Worker message protocol
// ---------------------------------------------------------------------------

/** Sent from main thread → worker to start a job. */
export interface WorkerRequest {
  type: 'remove-background';
  /** Unique job identifier — echoed back in the response. */
  jobId: string;
  /** The source image, transferred (zero-copy) to the worker. */
  bitmap: ImageBitmap;
  /** Model to run. Optional — omitted means 'human' (ORMBG). */
  model?: ModelKind;
}

/** Worker → main thread: job succeeded. */
export interface WorkerResponseOk {
  type: 'result';
  jobId: string;
  result: RemovalResult;
}

/** Worker → main thread: job failed. */
export interface WorkerResponseError {
  type: 'error';
  jobId: string;
  message: string;
}

/** Worker → main thread: model loading progress (0–1). */
export interface WorkerResponseProgress {
  type: 'progress';
  stage: 'load' | 'inference';
  /** 0–1 fraction. */
  progress: number;
}

/** Union of all messages the worker can send. */
export type WorkerResponse =
  | WorkerResponseOk
  | WorkerResponseError
  | WorkerResponseProgress;
