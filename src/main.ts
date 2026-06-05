import './style.css';
import type {
  WorkerRequest,
  WorkerResponse,
  RemovalResult,
  CompositeOptions,
  BackgroundMode,
} from './contracts.js';
import { applyMask, toPNG } from './compose.js';
import { decodeToBitmap, UnsupportedFormatError } from './formats.js';
import { createBatchQueue } from './batch.js';
import { mountBatchView } from './batch-view.js';

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

  <main class="main-layout" role="main">

    <div class="canvas-area">

      <div
        class="dropzone"
        id="dropzone"
        role="button"
        tabindex="0"
        aria-label="Drop an image here, or press Enter to browse files"
        data-testid="dropzone"
      >
        <div class="dropzone-content">
          <div class="dropzone-icon">${I.upload}</div>
          <p class="dropzone-title">Drop your image here</p>
          <p class="dropzone-hint">PNG · JPG · WebP</p>
          <button class="browse-btn" id="browse-btn" type="button" tabindex="-1">
            Browse files
          </button>
        </div>
        <div class="dropzone-corners" aria-hidden="true">
          <span></span><span></span><span></span><span></span>
        </div>
      </div>

      <canvas
        id="preview-canvas"
        class="preview-canvas"
        data-testid="preview-canvas"
        aria-label="Processed image preview"
      ></canvas>

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

      <section class="control-section download-section" aria-label="Download result">
        <button
          id="download-btn"
          class="download-btn"
          disabled
          aria-label="Download result as PNG"
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
          aria-label="Download result as JPEG"
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

// ── State ──────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'processing' | 'done' | 'error';

let sourceBitmap: ImageBitmap | null = null;
let sourceFile: File | null = null;
let removalResult: RemovalResult | null = null;
let bgImageBitmap: ImageBitmap | null = null;
let bgObjectURL: string | null = null;
let currentJobId = '';
let options: CompositeOptions = { mode: 'transparent', feather: 0 };

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
  const opts: CompositeOptions = { ...options, backgroundImage: bgImageBitmap ?? undefined };
  try {
    const composed = applyMask(sourceBitmap, removalResult.mask, opts);
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

  const area = previewCanvas.parentElement!;
  const pad  = 48;
  const scale = Math.min(
    (area.clientWidth  - pad * 2) / width,
    (area.clientHeight - pad * 2) / height,
    1,
  );
  previewCanvas.style.width  = `${Math.round(width  * scale)}px`;
  previewCanvas.style.height = `${Math.round(height * scale)}px`;

  const ctx = previewCanvas.getContext('2d')!;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0);

  downloadBtn.disabled = false;
  downloadBtn.removeAttribute('aria-disabled');

  const isOpaque = options.mode !== 'transparent';
  downloadJpegBtn.hidden = !isOpaque;
  if (isOpaque) {
    downloadJpegBtn.disabled = false;
    downloadJpegBtn.removeAttribute('aria-disabled');
  }
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
  removalResult = null;
  fileInput.click();
});

themeToggle.addEventListener('click', () => {
  const next = isDarkMode() ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('cutout-theme', next);
  updateThemeIcon();
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

// ── Service worker registration ───────────────────────────────────────────

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration fails silently — app still works online
    });
  });
}
