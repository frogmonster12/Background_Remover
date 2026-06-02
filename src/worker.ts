/**
 * Web Worker entry point.
 * Dispatches to mock or real inference based on the build-time flag __USE_REAL_MODEL__.
 */
import type { WorkerRequest, WorkerResponse } from './contracts.js';
import { mockRemoveBackground } from './inference.mock.js';

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

    send({ type: 'progress', stage: 'load', progress: 1 });

    let result;
    if (__USE_REAL_MODEL__) {
      // Real model wired in P6 — stub throws until then
      throw new Error('Real model not yet wired. Set USE_REAL_MODEL=false or run P6.');
    } else {
      result = mockRemoveBackground(bitmap.width, bitmap.height);
    }

    bitmap.close();

    send({ type: 'result', jobId, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({ type: 'error', jobId, message } satisfies WorkerResponse);
  }
};
