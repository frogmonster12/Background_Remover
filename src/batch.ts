import { zipSync } from 'fflate';
import type { RemovalResult } from './contracts.js';

export const CONCURRENCY = 1;

export type BatchItemStatus = 'queued' | 'processing' | 'done' | 'error';

export interface BatchItem {
  id: string;
  file: File;
  status: BatchItemStatus;
  result?: RemovalResult;
  error?: string;
}

export interface BatchProgress {
  total: number;
  done: number;
  errors: number;
  /** 0–1 fraction of items that have reached a terminal state. */
  fraction: number;
}

export type BatchChangeCallback = (
  items: readonly BatchItem[],
  progress: BatchProgress,
) => void;

/** Converts a File to a RemovalResult. Injected so the worker wiring is outside this module. */
export type InferenceFn = (file: File) => Promise<RemovalResult>;

/** Renders a completed cutout to raw PNG bytes for ZIP export. */
export type RenderFn = (file: File, result: RemovalResult) => Promise<Uint8Array>;

export interface BatchQueue {
  enqueue(files: File[]): void;
  cancel(): void;
  readonly items: readonly BatchItem[];
  readonly progress: BatchProgress;
  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(cb: BatchChangeCallback): () => void;
}

function computeProgress(items: readonly BatchItem[]): BatchProgress {
  const total = items.length;
  const done = items.filter((i) => i.status === 'done').length;
  const errors = items.filter((i) => i.status === 'error').length;
  const fraction = total === 0 ? 0 : (done + errors) / total;
  return { total, done, errors, fraction };
}

export function createBatchQueue(inferenceFn: InferenceFn): BatchQueue {
  let items: BatchItem[] = [];
  let cancelled = false;
  let running = false;
  const subscribers = new Set<BatchChangeCallback>();

  function notify() {
    const progress = computeProgress(items);
    for (const cb of subscribers) cb(items, progress);
  }

  async function runQueue() {
    running = true;
    while (!cancelled) {
      const item = items.find((i) => i.status === 'queued');
      if (!item) break;

      item.status = 'processing';
      notify();

      try {
        item.result = await inferenceFn(item.file);
        item.status = 'done';
      } catch (err) {
        item.status = 'error';
        item.error = err instanceof Error ? err.message : String(err);
      }

      notify();
    }
    running = false;
  }

  return {
    enqueue(files: File[]) {
      const newItems: BatchItem[] = files.map((file, i) => ({
        id: `${Date.now()}-${i}`,
        file,
        status: 'queued',
      }));
      items = [...items, ...newItems];
      notify();
      if (!running) void runQueue();
    },

    cancel() {
      cancelled = true;
    },

    get items(): readonly BatchItem[] {
      return items;
    },

    get progress(): BatchProgress {
      return computeProgress(items);
    },

    subscribe(cb: BatchChangeCallback): () => void {
      subscribers.add(cb);
      return () => subscribers.delete(cb);
    },
  };
}

function stemOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(0, dot) : filename;
}

export async function exportZip(
  items: readonly BatchItem[],
  renderFn: RenderFn,
): Promise<Uint8Array> {
  const doneItems = items.filter(
    (i): i is BatchItem & { result: RemovalResult } =>
      i.status === 'done' && i.result !== undefined,
  );

  const seen = new Map<string, number>();
  const files: Record<string, Uint8Array> = {};

  for (const item of doneItems) {
    const stem = stemOf(item.file.name);
    const count = seen.get(stem) ?? 0;
    seen.set(stem, count + 1);
    const name = count === 0 ? `${stem}.png` : `${stem}_${count}.png`;
    files[name] = await renderFn(item.file, item.result);
  }

  return zipSync(files);
}
