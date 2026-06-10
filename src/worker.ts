import type { ModelKind, WorkerRequest, WorkerResponse } from './contracts.js';
import { mockRemoveBackground } from './inference.mock.js';
import { detectBackend, loadModel, runInference } from './inference.js';

// Resolved once per model on its first real-model job; reused on subsequent calls.
const modelReady = new Map<ModelKind, Promise<void>>();

function initModel(model: ModelKind, send: (msg: WorkerResponse) => void): Promise<void> {
  const existing = modelReady.get(model);
  if (existing !== undefined) return existing;
  const ready = (async () => {
    const preferred = await detectBackend();
    // loadModel returns the actual backend used (may fall back from webgpu → wasm).
    await loadModel(model, preferred, (progress) => {
      send({ type: 'progress', stage: 'load', progress });
    });
  })();
  modelReady.set(model, ready);
  // A failed load must not poison subsequent attempts (e.g. after a transient
  // network error on the model fetch) — drop the cached promise on rejection.
  ready.catch(() => modelReady.delete(model));
  return ready;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  if (req.type !== 'remove-background') return;

  const { jobId, bitmap } = req;
  const model: ModelKind = req.model ?? 'human';

  try {
    const send = (msg: WorkerResponse, transfer?: Transferable[]) => {
      if (transfer) {
        self.postMessage(msg, { transfer });
      } else {
        self.postMessage(msg);
      }
    };

    let result;
    if (__USE_REAL_MODEL__) {
      await initModel(model, send);
      result = await runInference(bitmap, model);
    } else {
      send({ type: 'progress', stage: 'load', progress: 1 });
      result = mockRemoveBackground(bitmap.width, bitmap.height);
    }

    bitmap.close();
    send({ type: 'result', jobId, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({ type: 'error', jobId, message } satisfies WorkerResponse);
  }
};
