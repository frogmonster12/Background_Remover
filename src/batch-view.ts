import './batch-view.css';
import { exportZip } from './batch.js';
import type { BatchItem, BatchProgress, BatchQueue, RenderFn } from './batch.js';

// ---------------------------------------------------------------------------
// Lucide icon SVG strings (inline — no external CDN dependency)
// ---------------------------------------------------------------------------

const ICON_CLOCK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
  aria-hidden="true"><circle cx="12" cy="12" r="10"/>
  <polyline points="12 6 12 12 16 14"/></svg>`;

const ICON_LOADER = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
  class="batch-spin" aria-hidden="true">
  <line x1="12" y1="2" x2="12" y2="6"/>
  <line x1="12" y1="18" x2="12" y2="22"/>
  <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/>
  <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/>
  <line x1="2" y1="12" x2="6" y2="12"/>
  <line x1="18" y1="12" x2="22" y2="12"/>
  <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/>
  <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>`;

const ICON_CHECK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
  aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
  <polyline points="22 4 12 14.01 9 11.01"/></svg>`;

const ICON_X = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
  aria-hidden="true"><circle cx="12" cy="12" r="10"/>
  <line x1="15" y1="9" x2="9" y2="15"/>
  <line x1="9" y1="9" x2="15" y2="15"/></svg>`;

const ICON_DOWNLOAD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
  aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
  <polyline points="7 10 12 15 17 10"/>
  <line x1="12" y1="15" x2="12" y2="3"/></svg>`;

const ICON_UPLOAD = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
  aria-hidden="true"><polyline points="16 16 12 12 8 16"/>
  <line x1="12" y1="12" x2="12" y2="21"/>
  <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>`;

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

function statusIcon(status: BatchItem['status']): string {
  switch (status) {
    case 'queued':     return ICON_CLOCK;
    case 'processing': return ICON_LOADER;
    case 'done':       return ICON_CHECK;
    case 'error':      return ICON_X;
  }
}

function statusLabel(item: BatchItem): string {
  switch (item.status) {
    case 'queued':     return 'Queued';
    case 'processing': return 'Processing…';
    case 'done':       return 'Done';
    case 'error':      return item.error ?? 'Error';
  }
}

// ---------------------------------------------------------------------------
// DOM construction helpers
// ---------------------------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  html = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (html) node.innerHTML = html;
  return node;
}

// ---------------------------------------------------------------------------
// Batch view mount
// ---------------------------------------------------------------------------

export function mountBatchView(
  container: HTMLElement,
  queue: BatchQueue,
  renderFn: RenderFn,
): () => void {
  const thumbUrls: string[] = [];

  // Root wrapper
  const root = el('div', { class: 'batch-view' });

  // Drop zone / file input
  const dropzone = el('div', { class: 'batch-dropzone', role: 'region', 'aria-label': 'Image upload area' });
  const dzInner = el('div', { class: 'batch-dropzone-inner' });
  dzInner.innerHTML = `${ICON_UPLOAD}<span class="batch-dropzone-label">Drop images here or <u>browse</u></span>`;
  const fileInput = el('input', {
    type: 'file',
    accept: 'image/*',
    multiple: '',
    'aria-label': 'Select images to remove background',
  });
  dzInner.appendChild(fileInput);
  dropzone.appendChild(dzInner);

  // Progress section
  const progressWrap = el('div', { class: 'batch-progress-wrap', hidden: '' });
  const progressTrack = el('div', { class: 'batch-progress-bar-track' });
  const progressFill = el('div', { class: 'batch-progress-bar-fill', style: 'width:0%' });
  progressTrack.appendChild(progressFill);
  const progressLabelEl = el('p', { class: 'batch-progress-label' });
  const progressBar = el('div', {
    role: 'progressbar',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    'aria-valuenow': '0',
    'aria-label': 'Batch processing progress',
  });
  progressBar.appendChild(progressTrack);
  progressWrap.appendChild(progressBar);
  progressWrap.appendChild(progressLabelEl);

  // Item list
  const listEl = el('ul', { class: 'batch-list', 'aria-live': 'polite', 'aria-label': 'Processing queue' });

  // Download button
  const actionsEl = el('div', { class: 'batch-actions', hidden: '' });
  const downloadBtn = el('button', {
    class: 'batch-download-btn',
    disabled: '',
    'aria-label': 'Download all completed cutouts as ZIP',
  });
  downloadBtn.innerHTML = `${ICON_DOWNLOAD} Download all (ZIP)`;
  actionsEl.appendChild(downloadBtn);

  root.appendChild(dropzone);
  root.appendChild(progressWrap);
  root.appendChild(listEl);
  root.appendChild(actionsEl);
  container.appendChild(root);

  // ---------------------------------------------------------------------------
  // Event: file selection
  // ---------------------------------------------------------------------------
  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files ?? []);
    if (files.length === 0) return;
    fileInput.value = '';
    queue.enqueue(files);
  });

  // ---------------------------------------------------------------------------
  // Event: download ZIP
  // ---------------------------------------------------------------------------
  downloadBtn.addEventListener('click', () => {
    downloadBtn.setAttribute('disabled', '');
    void exportZip(queue.items, renderFn).then((bytes) => {
      // zipSync returns a fresh Uint8Array backed by a plain ArrayBuffer.
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cutouts.zip';
      a.click();
      URL.revokeObjectURL(url);
      downloadBtn.removeAttribute('disabled');
    });
  });

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function setStatusContent(el: HTMLElement, item: BatchItem) {
    // SVG icon is hardcoded (safe); label text must use textContent to prevent XSS
    el.innerHTML = statusIcon(item.status);
    const label = document.createElement('span');
    label.textContent = statusLabel(item);
    el.appendChild(label);
  }

  function updateProgress(progress: BatchProgress) {
    const pct = Math.round(progress.fraction * 100);
    progressFill.style.width = `${pct}%`;
    progressBar.setAttribute('aria-valuenow', String(pct));
    progressLabelEl.textContent =
      `${progress.done + progress.errors} / ${progress.total} — ${progress.done} done, ${progress.errors} errors`;
  }

  function syncList(items: readonly BatchItem[]) {
    // Build a map of existing item elements by id
    const existing = new Map<string, HTMLLIElement>();
    for (const li of Array.from(listEl.children) as HTMLLIElement[]) {
      const id = li.dataset['itemId'];
      if (id) existing.set(id, li);
    }

    for (const item of items) {
      let li = existing.get(item.id);

      if (!li) {
        // Create thumbnail object URL on first encounter
        const thumbUrl = URL.createObjectURL(item.file);
        thumbUrls.push(thumbUrl);

        li = el('li', { class: 'batch-item', 'data-item-id': item.id, 'data-status': item.status });
        const img = el('img', { class: 'batch-item-thumb', src: thumbUrl, alt: '' });
        const name = el('span', { class: 'batch-item-name' });
        name.textContent = item.file.name;
        const statusEl = el('span', { class: 'batch-item-status' });
        setStatusContent(statusEl, item);
        li.appendChild(img);
        li.appendChild(name);
        li.appendChild(statusEl);
        listEl.appendChild(li);
      } else {
        // Update status on existing row
        li.dataset['status'] = item.status;
        li.setAttribute('data-status', item.status);
        const statusEl = li.querySelector('.batch-item-status');
        if (statusEl) setStatusContent(statusEl as HTMLElement, item);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Queue subscription
  // ---------------------------------------------------------------------------
  const unsub = queue.subscribe((items, progress) => {
    // Show progress + actions sections once there are items
    if (items.length > 0) {
      progressWrap.removeAttribute('hidden');
      actionsEl.removeAttribute('hidden');
    }

    updateProgress(progress);
    syncList(items);

    // Enable download button when there is at least one done item
    const hasDone = items.some((i) => i.status === 'done');
    if (hasDone) {
      downloadBtn.removeAttribute('disabled');
    } else {
      downloadBtn.setAttribute('disabled', '');
    }
  });

  // Unmount cleanup
  return () => {
    unsub();
    for (const url of thumbUrls) URL.revokeObjectURL(url);
    container.removeChild(root);
  };
}
