import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import type { RemovalResult } from './contracts.js';
import { createBatchQueue, exportZip } from './batch.js';
import type { BatchItem } from './batch.js';

const MOCK_RESULT: RemovalResult = {
  mask: new Uint8ClampedArray(100),
  width: 10,
  height: 10,
  inferenceMs: 1,
  backend: 'wasm',
};

function makeFile(name: string): File {
  return new File([new Uint8Array(4)], name, { type: 'image/png' });
}

function waitForCompletion(
  queue: ReturnType<typeof createBatchQueue>,
  total: number,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const unsub = queue.subscribe((_items, progress) => {
      if (progress.done + progress.errors === total) {
        unsub();
        resolve();
      }
    });
  });
}

describe('BatchQueue', () => {
  it('all 5 items reach done when inference always succeeds', async () => {
    const queue = createBatchQueue(async () => MOCK_RESULT);
    const files = Array.from({ length: 5 }, (_, i) => makeFile(`img_${i}.png`));

    const done = waitForCompletion(queue, 5);
    queue.enqueue(files);
    await done;

    expect(queue.items.filter((i) => i.status === 'done')).toHaveLength(5);
    expect(queue.items.filter((i) => i.status === 'error')).toHaveLength(0);
    expect(queue.progress.done).toBe(5);
    expect(queue.progress.errors).toBe(0);
    expect(queue.progress.fraction).toBe(1);
  });

  it('one failing item leaves 4 done + 1 error, batch still completes', async () => {
    let calls = 0;
    const queue = createBatchQueue(async () => {
      calls++;
      if (calls === 3) throw new Error('GPU exploded');
      return MOCK_RESULT;
    });
    const files = Array.from({ length: 5 }, (_, i) => makeFile(`img_${i}.png`));

    const done = waitForCompletion(queue, 5);
    queue.enqueue(files);
    await done;

    expect(queue.items.filter((i) => i.status === 'done')).toHaveLength(4);
    expect(queue.items.filter((i) => i.status === 'error')).toHaveLength(1);
    expect(queue.items.find((i) => i.status === 'error')?.error).toBe('GPU exploded');
  });

  it('progress fraction is 0 before processing starts', () => {
    const queue = createBatchQueue(async () => MOCK_RESULT);
    expect(queue.progress.fraction).toBe(0);
    expect(queue.progress.total).toBe(0);
  });

  it('notifies subscribers on state changes', async () => {
    const snapshots: number[] = [];
    const queue = createBatchQueue(async () => MOCK_RESULT);

    const unsub = queue.subscribe((_items, p) => {
      snapshots.push(p.done + p.errors);
    });

    const done = waitForCompletion(queue, 2);
    queue.enqueue([makeFile('a.png'), makeFile('b.png')]);
    await done;
    unsub();

    // Should have been called at least once per completed item
    expect(snapshots.at(-1)).toBe(2);
  });
});

describe('exportZip', () => {
  it('ZIP contains one entry per done item, skips errors', async () => {
    const items: BatchItem[] = [
      { id: '1', file: makeFile('a.jpg'), status: 'done', result: MOCK_RESULT },
      { id: '2', file: makeFile('b.jpg'), status: 'done', result: MOCK_RESULT },
      { id: '3', file: makeFile('c.jpg'), status: 'error', error: 'fail' },
    ];

    const zipBytes = await exportZip(items, async () => new Uint8Array([1, 2, 3, 4]));
    const entries = Object.keys(unzipSync(zipBytes));

    expect(entries).toHaveLength(2);
    expect(entries).toContain('a.png');
    expect(entries).toContain('b.png');
  });

  it('deduplicates filenames with the name_N scheme', async () => {
    const items: BatchItem[] = [
      { id: '1', file: makeFile('photo.jpg'), status: 'done', result: MOCK_RESULT },
      { id: '2', file: makeFile('photo.jpg'), status: 'done', result: MOCK_RESULT },
      { id: '3', file: makeFile('photo.jpg'), status: 'done', result: MOCK_RESULT },
    ];

    const zipBytes = await exportZip(items, async () => new Uint8Array([1, 2, 3]));
    const names = Object.keys(unzipSync(zipBytes)).sort();

    expect(names).toEqual(['photo.png', 'photo_1.png', 'photo_2.png']);
  });

  it('returns an empty ZIP when no items are done', async () => {
    const items: BatchItem[] = [
      { id: '1', file: makeFile('a.jpg'), status: 'queued' },
      { id: '2', file: makeFile('b.jpg'), status: 'error', error: 'fail' },
    ];

    const zipBytes = await exportZip(items, async () => new Uint8Array([1]));
    const entries = Object.keys(unzipSync(zipBytes));

    expect(entries).toHaveLength(0);
  });
});
