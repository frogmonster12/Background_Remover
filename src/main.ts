import './style.css';
import type {
  WorkerRequest,
  WorkerResponse,
  RemovalResult,
  CompositeOptions,
  BackgroundMode,
} from './contracts.js';
import { applyMask, applyMaskRegion, toPNG } from './compose.js';
import { decodeToBitmap, UnsupportedFormatError } from './formats.js';
import { createBatchQueue } from './batch.js';
import { mountBatchView } from './batch-view.js';
import { stampLine } from './brush.js';
import type { BrushMode } from './brush.js';

// ── SVG icons (Lucide, stroke-based) ──────────────────────────────────────

const I = {
  upload: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  download: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  sun: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`,
  moon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>`,
  image: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`,
  zap: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>`,
  sparkles: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>`,
  alert: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  wifi_off: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`,
  rotateCcw: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`,
  rotateCw: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>`,
  eraser: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>`,
  refreshCw: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>`,
} as const;

// ── Build HTML ─────────────────────────────────────────────────────────────

function buildHTML(): string {
  return `
<div class="workspace" id="workspace" data-phase="idle">

  <header class="header" role="banner">
    <div class="logo">
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
        <rect width="26" height="26" rx="6" fill="var(--primary)"/>
        <circle cx="13" cy="13" r="5" fill="none" stroke="white" stroke-width="1.5"/>
        <circle cx="13" cy="13" r="2.2" fill="white"/>
      </svg>
      <span class="logo-text">Cutout</span>
    </div>
    <div class="mode-tabs" role="tablist" aria-label="Processing mode">
      <button class="mode-tab active" data-tab="single" role="tab" aria-selected="true" aria-controls="single-panel">Single</button>
      <button class="mode-tab" data-tab="batch" role="tab" aria-selected="false" aria-controls="batch-panel">Batch</button>
    </div>
    <button id="theme-toggle" class="icon-btn" aria-label="Switch to light theme">
      ${I.sun}
    </button>
  </header>

  <main class="main-layout" id="single-panel" role="main">

    <div class="canvas-area">

      <div
        class="dropzone"
        id="dropzone"
        role="button"
        tabindex="0"
        aria-labelledby="dropzone-title dropzone-hint browse-btn"
        data-testid="dropzone"
      >
        <div class="dropzone-content">
          <div class="dropzone-icon">${I.upload}</div>
          <p class="dropzone-title" id="dropzone-title">Drop your image here</p>
          <p class="dropzone-hint" id="dropzone-hint">PNG · JPG · WebP</p>
          <button class="browse-btn" id="browse-btn" type="button" tabindex="-1">
            Browse files
          </button>
        </div>
        <div class="dropzone-corners" aria-hidden="true">
          <span></span><span></span><span></span><span></span>
        </div>
      </div>

      <div class="preview-wrap" id="preview-wrap">
        <canvas
          id="preview-canvas"
          class="preview-canvas"
          data-testid="preview-canvas"
          aria-label="Processed image preview"
        ></canvas>
        <canvas
          id="brush-overlay"
          class="brush-overlay"
          data-testid="brush-overlay"
          aria-hidden="true"
        ></canvas>
      </div>

      <div class="progress-overlay" aria-hidden="true">
        <div class="progress-bar">
          <div class="progress-fill" id="progress-fill"></div>
        </div>
      </div>

      <div class="processing-overlay">
        <div class="processing-card">
          <div class="spinner-ring" aria-hidden="true"></div>
          <span class="processing-text" id="processing-text">Loading…</span>
        </div>
      </div>

      <button
        class="new-image-btn"
        id="new-image-btn"
        aria-label="Process a new image"
      >
        ${I.upload}
        New image
      </button>

      <div
        id="status-region"
        class="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        data-testid="status-region"
      ></div>

      <div class="error-banner" id="error-banner" role="alert" aria-atomic="true">
        ${I.alert}
        <span id="error-banner-text"></span>
      </div>

      <input
        type="file"
        id="file-input"
        accept="image/*"
        style="display:none"
        aria-label="Upload image file"
        data-testid="file-input"
      />
      <input
        type="file"
        id="bg-file-input"
        accept="image/*"
        style="display:none"
        aria-label="Upload background image file"
      />
    </div>

    <aside class="controls-panel" aria-label="Image editing controls">

      <section class="control-section" aria-labelledby="bg-section-label">
        <h2 class="section-label" id="bg-section-label">Background</h2>
        <div class="mode-grid" role="group" aria-label="Background mode">
          <button class="mode-btn active" data-mode="transparent" data-testid="bg-mode-transparent" aria-pressed="true">Transparent</button>
          <button class="mode-btn" data-mode="color" data-testid="bg-mode-color" aria-pressed="false">Color</button>
          <button class="mode-btn" data-mode="blur" data-testid="bg-mode-blur" aria-pressed="false">Blur</button>
          <button class="mode-btn" data-mode="image" data-testid="bg-mode-image" aria-pressed="false">Image</button>
        </div>

        <div id="bg-color-row" class="sub-option" hidden>
          <label for="bg-color" class="sub-label">Fill color</label>
          <input type="color" id="bg-color" value="#ffffff" aria-label="Background fill color" />
        </div>

        <div id="bg-blur-row" class="sub-option" hidden>
          <div class="slider-header">
            <label for="blur-radius" class="sub-label">Amount</label>
            <span class="slider-value" id="blur-value">20px</span>
          </div>
          <input type="range" id="blur-radius" class="slider" min="0" max="40" value="20"
            aria-label="Blur radius in pixels" aria-valuemin="0" aria-valuemax="40" aria-valuenow="20" />
        </div>

        <div id="bg-image-row" class="sub-option" hidden>
          <div id="bg-image-preview" class="bg-image-preview">
            <span class="no-bg-text">No image selected</span>
          </div>
          <button class="upload-bg-btn" id="upload-bg-btn" type="button" aria-label="Upload a background image">
            ${I.image} Upload image
          </button>
        </div>
      </section>

      <div class="divider" aria-hidden="true"></div>

      <section class="control-section" aria-labelledby="feather-section-label">
        <div class="slider-header">
          <label for="feather" class="section-label" id="feather-section-label">Edge feather</label>
          <span class="slider-value" id="feather-value">0</span>
        </div>
        <input type="range" id="feather" class="slider" min="0" max="20" value="0"
          aria-label="Edge feathering amount" aria-valuemin="0" aria-valuemax="20" aria-valuenow="0" />
      </section>

      <div class="divider" aria-hidden="true"></div>

      <section class="control-section" aria-labelledby="quality-section-label">
        <h2 class="section-label" id="quality-section-label">Model</h2>
        <p class="quality-note">ORMBG (Apache-2.0) — fast, single-pass removal</p>
      </section>

      <div class="divider" aria-hidden="true"></div>

      <section class="control-section brush-section" id="brush-section" aria-labelledby="brush-section-label">
        <h2 class="section-label" id="brush-section-label">Touch-up</h2>
        <div class="brush-mode-row" role="group" aria-label="Brush mode">
          <button class="brush-mode-btn active" id="brush-restore-btn" data-brush="restore"
            data-testid="brush-restore-btn" aria-pressed="true"
            aria-label="Restore foreground">
            ${I.sparkles} Restore
          </button>
          <button class="brush-mode-btn" id="brush-erase-btn" data-brush="erase"
            data-testid="brush-erase-btn" aria-pressed="false"
            aria-label="Erase background">
            ${I.eraser} Erase
          </button>
        </div>
        <div class="slider-header brush-size-header">
          <label for="brush-size" class="sub-label">Size</label>
          <span class="slider-value" id="brush-size-value">24px</span>
        </div>
        <input type="range" id="brush-size" class="slider" min="4" max="120" value="24"
          aria-label="Brush size in pixels" aria-valuemin="4" aria-valuemax="120" aria-valuenow="24"
          data-testid="brush-size" />
        <div class="brush-actions">
          <button class="icon-btn" id="undo-btn" data-testid="undo-btn"
            aria-label="Undo last stroke" title="Undo (Ctrl+Z)" disabled>
            ${I.rotateCcw}
          </button>
          <button class="icon-btn" id="redo-btn" data-testid="redo-btn"
            aria-label="Redo stroke" title="Redo (Ctrl+Y)" disabled>
            ${I.rotateCw}
          </button>
          <button class="brush-reset-btn" id="reset-mask-btn" data-testid="reset-mask-btn"
            aria-label="Reset to original inference mask">
            ${I.refreshCw} Reset mask
          </button>
        </div>
      </section>

      <div class="divider brush-divider" aria-hidden="true"></div>

      <section class="control-section download-section" aria-label="Download result">
        <button
          id="download-btn"
          class="download-btn"
          disabled
          aria-label="Download PNG"
          aria-disabled="true"
          data-testid="download-btn"
        >
          ${I.download}
          Download PNG
        </button>
        <button
          id="download-jpeg-btn"
          class="download-btn download-btn--secondary"
          disabled
          aria-label="Download JPEG"
          aria-disabled="true"
          data-testid="download-jpeg-btn"
          hidden
        >
          ${I.download}
          Download JPEG
        </button>
      </section>

    </aside>
  </main>
  <div id="batch-panel" class="batch-panel" hidden></div>
  <div class="offline-bar" id="offline-bar" role="status" aria-live="polite">
    ${I.wifi_off}
    You're offline — previously processed images and cached results still work
  </div>
  <div class="update-bar" id="update-bar" role="status" aria-live="polite" data-testid="update-bar">
    ${I.refreshCw}
    <span>A new version is ready.</span>
    <button id="update-reload-btn" class="update-reload-btn" aria-label="Reload to use the new version">
      Reload
    </button>
  </div>
</div>`;
}

// ── Mount ──────────────────────────────────────────────────────────────────

document.getElementById('app')!.innerHTML = buildHTML();

// ── Theme init ─────────────────────────────────────────────────────────────

const html = document.documentElement;
const savedTheme = localStorage.getItem('cutout-theme');
if (savedTheme === 'dark' || savedTheme === 'light') {
  html.setAttribute('data-theme', savedTheme);
}

// ── DOM refs ───────────────────────────────────────────────────────────────

const workspace       = document.getElementById('workspace')!;
const dropzone        = document.getElementById('dropzone')!;
const browseBtn       = document.getElementById('browse-btn')!;
const fileInput       = document.getElementById('file-input') as HTMLInputElement;
const bgFileInput     = document.getElementById('bg-file-input') as HTMLInputElement;
const previewCanvas   = document.getElementById('preview-canvas') as HTMLCanvasElement;
const brushOverlay    = document.getElementById('brush-overlay') as HTMLCanvasElement;
const canvasArea      = document.querySelector<HTMLElement>('.canvas-area')!;
const progressFill    = document.getElementById('progress-fill')!;
const processingText  = document.getElementById('processing-text')!;
const statusRegion    = document.getElementById('status-region')!;
const downloadBtn     = document.getElementById('download-btn') as HTMLButtonElement;
const downloadJpegBtn = document.getElementById('download-jpeg-btn') as HTMLButtonElement;
const themeToggle     = document.getElementById('theme-toggle') as HTMLButtonElement;
const newImageBtn     = document.getElementById('new-image-btn')!;
const bgColorInput    = document.getElementById('bg-color') as HTMLInputElement;
const blurSlider      = document.getElementById('blur-radius') as HTMLInputElement;
const blurValue       = document.getElementById('blur-value')!;
const featherSlider   = document.getElementById('feather') as HTMLInputElement;
const featherValue    = document.getElementById('feather-value')!;
const bgColorRow      = document.getElementById('bg-color-row')!;
const bgBlurRow       = document.getElementById('bg-blur-row')!;
const bgImageRow      = document.getElementById('bg-image-row')!;
const uploadBgBtn     = document.getElementById('upload-bg-btn')!;
const bgImgPreview    = document.getElementById('bg-image-preview')!;
const errorBannerText = document.getElementById('error-banner-text')!;
const offlineBar      = document.getElementById('offline-bar')!;
// Brush controls
const undoBtn         = document.getElementById('undo-btn') as HTMLButtonElement;
const redoBtn         = document.getElementById('redo-btn') as HTMLButtonElement;
const resetMaskBtn    = document.getElementById('reset-mask-btn') as HTMLButtonElement;
const brushSizeSlider = document.getElementById('brush-size') as HTMLInputElement;
const brushSizeValue  = document.getElementById('brush-size-value')!;

// ── State ──────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'processing' | 'done' | 'error';

let sourceBitmap: ImageBitmap | null = null;
let sourceFile: File | null = null;
let removalResult: RemovalResult | null = null;
let bgImageBitmap: ImageBitmap | null = null;
let bgObjectURL: string | null = null;
let currentJobId = '';
let options: CompositeOptions = { mode: 'transparent', feather: 0 };

// Brush state
let workingMask: Uint8ClampedArray | null = null;
let originalMask: Uint8ClampedArray | null = null;
let undoStack: Uint8ClampedArray[] = [];
let redoStack: Uint8ClampedArray[] = [];
let brushMode: BrushMode = 'restore';
let brushRadius = 24;

// Pointer state during a stroke
let isPainting = false;
let strokeSnapshot: Uint8ClampedArray | null = null;
let lastPaintPos: { x: number; y: number } | null = null;
let pendingPos: { x: number; y: number } | null = null;
let rafPending = false;

// Full-image source pixels, extracted once per image for region compositing.
// ~4 bytes/pixel (24 MB at 3000×2000) — freed when a new image loads.
let sourceData: ImageData | null = null;

function getSourceData(): ImageData | null {
  if (sourceData) return sourceData;
  if (!sourceBitmap) return null;
  const { width, height } = sourceBitmap;
  const tmp = new OffscreenCanvas(width, height);
  const ctx = tmp.getContext('2d')!;
  ctx.drawImage(sourceBitmap, 0, 0);
  sourceData = ctx.getImageData(0, 0, width, height);
  return sourceData;
}

// ── Worker ─────────────────────────────────────────────────────────────────

const worker = new Worker(
  new URL('./worker.ts', import.meta.url),
  { type: 'module' },
);

worker.addEventListener('message', (e: MessageEvent<WorkerResponse>) => {
  const msg = e.data;

  if (msg.type === 'progress') {
    const pct = Math.round(msg.progress * 100);
    progressFill.style.width = `${pct}%`;
    processingText.textContent =
      msg.stage === 'load' ? `Loading model… ${pct}%` : `Processing… ${pct}%`;
    return;
  }

  if (msg.jobId !== currentJobId) return;

  if (msg.type === 'result') {
    console.log(`[Cutout] inference backend: ${msg.result.backend}`);
    removalResult = msg.result;
    workingMask   = new Uint8ClampedArray(msg.result.mask);
    originalMask  = new Uint8ClampedArray(msg.result.mask);
    undoStack     = [];
    redoStack     = [];
    updateUndoRedoBtns();
    recomposite();
  } else {
    setPhase('error');
    setStatus(`Error: ${msg.message}`, true);
  }
});

// ── File processing ────────────────────────────────────────────────────────

async function processFile(file: File): Promise<void> {
  sourceFile = file;
  setPhase('processing');
  progressFill.style.width = '0%';
  processingText.textContent = 'Loading…';
  setStatus('Processing…');

  try {
    const [src, workerBm] = await Promise.all([
      decodeToBitmap(file),
      decodeToBitmap(file),
    ]);
    sourceBitmap?.close();
    sourceBitmap = src;
    sourceData = null;

    currentJobId = crypto.randomUUID();
    const req: WorkerRequest = {
      type: 'remove-background',
      jobId: currentJobId,
      bitmap: workerBm,
    };
    worker.postMessage(req, [workerBm]);
  } catch (err) {
    if (err instanceof UnsupportedFormatError) {
      setPhase('error');
      setStatus(`Unsupported format: ${err.message}`, true);
    } else {
      setPhase('error');
      setStatus('Failed to read image.', true);
    }
  }
}

async function recomposite(): Promise<void> {
  if (!sourceBitmap || !removalResult) return;
  const mask = workingMask ?? removalResult.mask;
  const opts: CompositeOptions = { ...options, backgroundImage: bgImageBitmap ?? undefined };
  try {
    const composed = applyMask(sourceBitmap, mask, opts);
    renderToCanvas(composed);
    setPhase('done');
    setStatus('Done.');
  } catch (err) {
    console.error('Composite error:', err);
  }
}

// ── Canvas ─────────────────────────────────────────────────────────────────

function renderToCanvas(bitmap: ImageBitmap | OffscreenCanvas): void {
  const { width, height } = bitmap;
  previewCanvas.width  = width;
  previewCanvas.height = height;

  const pad  = 48;
  const scale = Math.min(
    (canvasArea.clientWidth  - pad * 2) / width,
    (canvasArea.clientHeight - pad * 2) / height,
    1,
  );
  const cssW = Math.round(width  * scale);
  const cssH = Math.round(height * scale);
  previewCanvas.style.width  = `${cssW}px`;
  previewCanvas.style.height = `${cssH}px`;

  const ctx = previewCanvas.getContext('2d')!;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0);

  // Sync overlay pixel dimensions to match display size (1:1 CSS pixel mapping)
  brushOverlay.width  = cssW;
  brushOverlay.height = cssH;

  downloadBtn.disabled = false;
  downloadBtn.removeAttribute('aria-disabled');

  const isOpaque = options.mode !== 'transparent';
  downloadJpegBtn.hidden = !isOpaque;
  if (isOpaque) {
    downloadJpegBtn.disabled = false;
    downloadJpegBtn.removeAttribute('aria-disabled');
  }
}

/**
 * Lightweight canvas update used during live brush strokes —
 * skips button state and overlay resize (stable during a single stroke).
 *
 * Performance note: applyMask iterates every pixel. For images > ~4K on a side
 * (~8 M pixels) this can exceed 16 ms/frame, causing visible lag. A dirty-bbox
 * optimisation would be needed for those sizes.
 */
function paintStrokePreview(): void {
  if (!sourceBitmap || !workingMask) return;
  const opts: CompositeOptions = { ...options, backgroundImage: bgImageBitmap ?? undefined };
  const composed = applyMask(sourceBitmap, workingMask, opts);
  const ctx = previewCanvas.getContext('2d')!;
  ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  ctx.drawImage(composed, 0, 0);
}

// ── Download ───────────────────────────────────────────────────────────────

function downloadResult(format: 'png' | 'jpeg'): void {
  const tmp = document.createElement('canvas');
  tmp.width  = previewCanvas.width;
  tmp.height = previewCanvas.height;
  const ctx  = tmp.getContext('2d')!;

  if (format === 'jpeg') {
    ctx.fillStyle = options.mode === 'color' ? (options.color ?? '#ffffff') : '#ffffff';
    ctx.fillRect(0, 0, tmp.width, tmp.height);
  }
  ctx.drawImage(previewCanvas, 0, 0);

  const mime     = format === 'png' ? 'image/png' : 'image/jpeg';
  const quality  = format === 'jpeg' ? 0.92 : undefined;
  const rawBase = (sourceFile?.name ?? 'image').replace(/\.[^.]+$/, '');
  const baseName = rawBase.replace(/[/\\]/g, '_').replace(/\0/g, '').replace(/^\.+/, '_') || 'image';
  const filename = `${baseName}-cutout.${format === 'png' ? 'png' : 'jpg'}`;

  tmp.toBlob(
    (blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    },
    mime,
    quality,
  );
}

// ── Background mode ────────────────────────────────────────────────────────

function setBackgroundMode(mode: BackgroundMode): void {
  options = { ...options, mode };

  document.querySelectorAll<HTMLButtonElement>('.mode-btn').forEach((btn) => {
    const active = btn.dataset['mode'] === mode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });

  bgColorRow.hidden = mode !== 'color';
  bgBlurRow.hidden  = mode !== 'blur';
  bgImageRow.hidden = mode !== 'image';

  if (mode === 'color')  options = { ...options, color:      bgColorInput.value };
  if (mode === 'blur')   options = { ...options, blurRadius: parseInt(blurSlider.value, 10) };
  if (mode === 'image')  options = { ...options, backgroundImage: bgImageBitmap ?? undefined };

  recomposite();
}

// ── Phase ──────────────────────────────────────────────────────────────────

function setPhase(p: Phase): void {
  workspace.setAttribute('data-phase', p);
  if (p !== 'done') {
    downloadBtn.disabled = true;
    downloadBtn.setAttribute('aria-disabled', 'true');
    downloadJpegBtn.disabled = true;
    downloadJpegBtn.setAttribute('aria-disabled', 'true');
    downloadJpegBtn.hidden = true;
  }
}

function setStatus(text: string, isError = false): void {
  statusRegion.textContent = text;
  if (isError) errorBannerText.textContent = text;
}

// ── Theme ──────────────────────────────────────────────────────────────────

function isDarkMode(): boolean {
  const t = html.getAttribute('data-theme');
  if (t === 'dark')  return true;
  if (t === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function updateThemeIcon(): void {
  const dark = isDarkMode();
  themeToggle.innerHTML = dark ? I.sun : I.moon;
  themeToggle.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
}

updateThemeIcon();

// ── Brush helpers ──────────────────────────────────────────────────────────

/** Convert a pointer event (CSS coords) to image pixel coordinates. */
function getImageCoords(e: PointerEvent): { x: number; y: number } {
  const rect = brushOverlay.getBoundingClientRect();
  const cssX = e.clientX - rect.left;
  const cssY = e.clientY - rect.top;
  // brushOverlay.width === CSS width (1:1 ratio), previewCanvas.width === image width
  const scaleX = previewCanvas.width  / brushOverlay.width;
  const scaleY = previewCanvas.height / brushOverlay.height;
  return { x: cssX * scaleX, y: cssY * scaleY };
}

/** Draw the circular cursor preview at CSS coordinate (cssX, cssY). */
function drawCursor(cssX: number, cssY: number): void {
  const ctx = brushOverlay.getContext('2d')!;
  ctx.clearRect(0, 0, brushOverlay.width, brushOverlay.height);

  // Brush radius in display (CSS / overlay) pixels
  const displayRadius = brushRadius * (brushOverlay.width / previewCanvas.width);
  if (displayRadius < 0.5) return;

  const isRestore = brushMode === 'restore';
  const color     = isRestore ? 'rgba(124,106,247,0.9)' : 'rgba(240,80,100,0.9)';
  const colorDim  = isRestore ? 'rgba(124,106,247,0.35)' : 'rgba(240,80,100,0.35)';

  // Inner soft-falloff ring (50% radius)
  ctx.beginPath();
  ctx.arc(cssX, cssY, Math.max(1, displayRadius * 0.5), 0, Math.PI * 2);
  ctx.strokeStyle = colorDim;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Outer boundary ring
  ctx.beginPath();
  ctx.arc(cssX, cssY, displayRadius, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Center dot
  ctx.beginPath();
  ctx.arc(cssX, cssY, 2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/** rAF callback: apply the pending stamp(s) and refresh the preview. */
function paintFrame(): void {
  rafPending = false;
  if (!isPainting || !workingMask || !pendingPos || !removalResult) return;

  const pos = pendingPos;
  const from = lastPaintPos ?? pos;
  stampLine(
    workingMask,
    removalResult.width,
    removalResult.height,
    from.x,
    from.y,
    pos.x,
    pos.y,
    brushRadius,
    brushMode,
  );
  lastPaintPos = pos;

  // Dirty-region redraw: composite only the stroke's bounding box. Transparent
  // and color modes are per-pixel local; blur/image need the whole frame, so
  // they keep the (rAF-throttled) full redraw.
  const src = options.mode === 'transparent' || options.mode === 'color'
    ? getSourceData()
    : null;
  if (src && workingMask) {
    const pad = brushRadius + 1 + Math.round(options.feather ?? 0);
    const patch = applyMaskRegion(src, workingMask, options, {
      x: Math.min(from.x, pos.x) - pad,
      y: Math.min(from.y, pos.y) - pad,
      width: Math.abs(pos.x - from.x) + pad * 2,
      height: Math.abs(pos.y - from.y) + pad * 2,
    });
    if (patch) {
      previewCanvas.getContext('2d')!.putImageData(patch.data, patch.x, patch.y);
    }
  } else {
    paintStrokePreview();
  }

  // Redraw cursor over the updated preview (image → overlay coordinate mapping)
  const overlayX = (pos.x / previewCanvas.width)  * brushOverlay.width;
  const overlayY = (pos.y / previewCanvas.height) * brushOverlay.height;
  drawCursor(overlayX, overlayY);
}

// ── Undo / redo ────────────────────────────────────────────────────────────

function updateUndoRedoBtns(): void {
  undoBtn.disabled = undoStack.length === 0;
  undoBtn.setAttribute('aria-disabled', String(undoBtn.disabled));
  redoBtn.disabled = redoStack.length === 0;
  redoBtn.setAttribute('aria-disabled', String(redoBtn.disabled));
}

function pushUndo(snapshot: Uint8ClampedArray): void {
  undoStack.push(snapshot);
  if (undoStack.length > 20) undoStack.shift();
  redoStack = [];
  updateUndoRedoBtns();
}

function undo(): void {
  if (!workingMask || undoStack.length === 0) return;
  redoStack.push(new Uint8ClampedArray(workingMask));
  workingMask = undoStack.pop()!;
  recomposite();
  updateUndoRedoBtns();
}

function redo(): void {
  if (!workingMask || redoStack.length === 0) return;
  undoStack.push(new Uint8ClampedArray(workingMask));
  if (undoStack.length > 20) undoStack.shift();
  workingMask = redoStack.pop()!;
  recomposite();
  updateUndoRedoBtns();
}

function resetMask(): void {
  if (!workingMask || !originalMask) return;
  undoStack.push(new Uint8ClampedArray(workingMask));
  if (undoStack.length > 20) undoStack.shift();
  redoStack = [];
  workingMask = new Uint8ClampedArray(originalMask);
  recomposite();
  updateUndoRedoBtns();
}

// ── Events ─────────────────────────────────────────────────────────────────

dropzone.addEventListener('dragover',  (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
dropzone.addEventListener('dragleave', ()  => dropzone.classList.remove('drag-over'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  const file = e.dataTransfer?.files[0];
  if (file) processFile(file);
});
dropzone.addEventListener('click',   (e) => { if (e.target !== browseBtn) fileInput.click(); });
dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});

browseBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) processFile(file);
  fileInput.value = '';
});

document.querySelectorAll<HTMLButtonElement>('.mode-btn').forEach((btn) =>
  btn.addEventListener('click', () => setBackgroundMode(btn.dataset['mode'] as BackgroundMode)),
);

bgColorInput.addEventListener('input', () => {
  options = { ...options, color: bgColorInput.value };
  recomposite();
});

blurSlider.addEventListener('input', () => {
  const val = parseInt(blurSlider.value, 10);
  blurValue.textContent = `${val}px`;
  blurSlider.setAttribute('aria-valuenow', String(val));
  options = { ...options, blurRadius: val };
  recomposite();
});

featherSlider.addEventListener('input', () => {
  const val = parseInt(featherSlider.value, 10);
  featherValue.textContent = String(val);
  featherSlider.setAttribute('aria-valuenow', String(val));
  options = { ...options, feather: val };
  recomposite();
});

uploadBgBtn.addEventListener('click', () => bgFileInput.click());
bgFileInput.addEventListener('change', async () => {
  const file = bgFileInput.files?.[0];
  if (!file) return;
  bgImageBitmap?.close();
  if (bgObjectURL) URL.revokeObjectURL(bgObjectURL);
  bgImageBitmap = await createImageBitmap(file);
  bgObjectURL   = URL.createObjectURL(file);
  bgImgPreview.innerHTML = `<img src="${bgObjectURL}" alt="Background preview" loading="lazy" />`;
  options = { ...options, backgroundImage: bgImageBitmap };
  bgFileInput.value = '';
  recomposite();
});

downloadBtn.addEventListener('click',     () => downloadResult('png'));
downloadJpegBtn.addEventListener('click', () => downloadResult('jpeg'));

newImageBtn.addEventListener('click', () => {
  setPhase('idle');
  sourceBitmap?.close();
  sourceBitmap  = null;
  sourceData    = null;
  removalResult = null;
  workingMask   = null;
  originalMask  = null;
  undoStack     = [];
  redoStack     = [];
  updateUndoRedoBtns();
  fileInput.click();
});

themeToggle.addEventListener('click', () => {
  const next = isDarkMode() ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('cutout-theme', next);
  updateThemeIcon();
});

// ── Brush mode toggle ──────────────────────────────────────────────────────

document.querySelectorAll<HTMLButtonElement>('.brush-mode-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    brushMode = btn.dataset['brush'] as BrushMode;
    document.querySelectorAll<HTMLButtonElement>('.brush-mode-btn').forEach((b) => {
      const active = b.dataset['brush'] === brushMode;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
  });
});

brushSizeSlider.addEventListener('input', () => {
  brushRadius = parseInt(brushSizeSlider.value, 10);
  brushSizeValue.textContent = `${brushRadius}px`;
  brushSizeSlider.setAttribute('aria-valuenow', String(brushRadius));
});

undoBtn.addEventListener('click',      () => undo());
redoBtn.addEventListener('click',      () => redo());
resetMaskBtn.addEventListener('click', () => resetMask());

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undo();
  } else if (
    (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' ||
    (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z'
  ) {
    e.preventDefault();
    redo();
  }
});

// ── Brush overlay pointer events ───────────────────────────────────────────

brushOverlay.addEventListener('pointerdown', (e) => {
  if (!workingMask || !removalResult) return;
  e.preventDefault();
  brushOverlay.setPointerCapture(e.pointerId);
  isPainting    = true;
  getSourceData(); // one-time pixel extraction now, not mid-stroke
  strokeSnapshot = new Uint8ClampedArray(workingMask);
  const pos     = getImageCoords(e);
  lastPaintPos  = null;
  pendingPos    = pos;
  if (!rafPending) {
    rafPending = true;
    requestAnimationFrame(paintFrame);
  }
});

brushOverlay.addEventListener('pointermove', (e) => {
  const rect = brushOverlay.getBoundingClientRect();
  const cssX = e.clientX - rect.left;
  const cssY = e.clientY - rect.top;
  drawCursor(cssX, cssY);

  if (!isPainting) return;
  e.preventDefault();
  pendingPos = getImageCoords(e);
  if (!rafPending) {
    rafPending = true;
    requestAnimationFrame(paintFrame);
  }
});

brushOverlay.addEventListener('pointerup', () => {
  if (!isPainting) return;
  isPainting = false;
  if (strokeSnapshot) {
    pushUndo(strokeSnapshot);
    strokeSnapshot = null;
  }
  lastPaintPos = null;
  pendingPos   = null;
  recomposite(); // full-quality composite after stroke ends
});

brushOverlay.addEventListener('pointercancel', () => {
  isPainting     = false;
  strokeSnapshot = null;
  lastPaintPos   = null;
});

brushOverlay.addEventListener('pointerleave', () => {
  if (isPainting) return; // keep cursor if dragging out of bounds
  const ctx = brushOverlay.getContext('2d')!;
  ctx.clearRect(0, 0, brushOverlay.width, brushOverlay.height);
});

// ── Worker dispatch helper ─────────────────────────────────────────────────

function dispatchJob(bitmap: ImageBitmap): Promise<RemovalResult> {
  const jobId = crypto.randomUUID();
  return new Promise<RemovalResult>((resolve, reject) => {
    const handler = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === 'progress') return;
      if (msg.type === 'result' || msg.type === 'error') {
        if (msg.jobId !== jobId) return;
        worker.removeEventListener('message', handler);
        if (msg.type === 'result') resolve(msg.result);
        else reject(new Error(msg.message));
      }
    };
    worker.addEventListener('message', handler);
    const req: WorkerRequest = { type: 'remove-background', jobId, bitmap };
    worker.postMessage(req, [bitmap]);
  });
}

// ── Batch inference + render functions ────────────────────────────────────

async function batchInferenceFn(file: File): Promise<RemovalResult> {
  const bitmap = await decodeToBitmap(file);
  return dispatchJob(bitmap);
}

async function batchRenderFn(file: File, result: RemovalResult): Promise<Uint8Array> {
  const bitmap = await decodeToBitmap(file);
  const composed = applyMask(bitmap, result.mask, { mode: 'transparent' });
  bitmap.close();
  const blob = await toPNG(composed);
  return new Uint8Array(await blob.arrayBuffer());
}

// ── Batch view mount ──────────────────────────────────────────────────────

const batchContainer = document.getElementById('batch-panel')!;
const batchQueue = createBatchQueue(batchInferenceFn);
mountBatchView(batchContainer, batchQueue, batchRenderFn);

// ── Tab switching ─────────────────────────────────────────────────────────

document.querySelectorAll<HTMLButtonElement>('.mode-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const tabName = tab.dataset['tab'];
    const singlePanel = document.querySelector<HTMLElement>('.main-layout')!;
    const batchPanel = document.getElementById('batch-panel')!;

    document.querySelectorAll('.mode-tab').forEach((t) => {
      t.classList.remove('active');
      t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');

    if (tabName === 'batch') {
      singlePanel.hidden = true;
      batchPanel.hidden = false;
    } else {
      singlePanel.hidden = false;
      batchPanel.hidden = true;
    }
  });
});

// ── Offline indicator ─────────────────────────────────────────────────────

function syncOffline() {
  offlineBar.classList.toggle('visible', !navigator.onLine);
}

syncOffline();
window.addEventListener('online',  syncOffline);
window.addEventListener('offline', syncOffline);

// ── Service worker registration + update notice ──────────────────────────

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // True only when an SW already controlled this page at load time —
    // distinguishes a version update from the very first install
    // (clients.claim() fires controllerchange in both cases).
    const hadController = navigator.serviceWorker.controller !== null;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return;
      const updateBar  = document.getElementById('update-bar')!;
      const reloadBtn  = document.getElementById('update-reload-btn')!;
      updateBar.classList.add('visible');
      reloadBtn.addEventListener('click', () => window.location.reload(), { once: true });
    });

    // Relative so it works at a subpath (e.g. GitHub project pages)
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // SW registration fails silently — app still works online
    });
  });
}
