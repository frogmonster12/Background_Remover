import type { WorkerRequest, WorkerResponse } from './contracts.js';
import { mockRemoveBackground } from './inference.mock.js';
import { detectBackend, loadModel, runInference } from './inference.js';

// Resolved once on the first real-model job; reused on subsequent calls.
let backendReady: Promise<void> | null = null;

function initBackend(send: (msg: WorkerResponse) => void): Promise<void> {
  if (backendReady !== null) return backendReady;
  backendReady = (async () => {
    const preferred = await detectBackend();
    // loadModel returns the actual backend used (may fall back from webgpu → wasm).
    await loadModel(preferred, (progress) => {
      send({ type: 'progress', stage: 'load', progress });
    });
  })();
  return backendReady;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  if (req.type !== 'remove-background') return;

  const { jobId, bitmap } = req;

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
      await initBackend(send);
      // runInference reads _activeBackend internally — no need to pass it separately.
      result = await runInference(bitmap);
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
