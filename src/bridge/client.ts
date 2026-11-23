// Typed request/response client for the simulation worker (spec 02 §3).
// Each request gets a reqId. A reply that is older than the latest request of its kind is
// dropped (its promise never settles), so the UI keeps the previous result until the new one arrives.
// A re-run's streamed `rerun` messages go to `onRerun`; its promise settles with the final reply.
import type { MainToWorker, Request, WorkerToMain } from './protocol';

type Rerun = Extract<WorkerToMain, { kind: 'rerun' }>;

export interface SimClient {
  request(msg: Request, onRerun?: (patch: Rerun) => void): Promise<WorkerToMain>;
  dispose(): void;
}

export function createSimClient(): SimClient {
  const worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
  let nextId = 1;
  const latestByKind = new Map<MainToWorker['kind'], number>();
  const pending = new Map<
    number,
    {
      kind: MainToWorker['kind'];
      resolve: (r: WorkerToMain) => void;
      onRerun: ((patch: Rerun) => void) | undefined;
    }
  >();

  worker.addEventListener('message', (event: MessageEvent<WorkerToMain>) => {
    const reply = event.data;
    const req = pending.get(reply.reqId);
    if (!req) return;
    const latest = latestByKind.get(req.kind) === reply.reqId;
    if (reply.kind === 'rerun') {
      if (latest) req.onRerun?.(reply);
      return;
    }
    pending.delete(reply.reqId);
    if (latest) req.resolve(reply);
  });

  return {
    request(msg, onRerun) {
      const reqId = nextId++;
      latestByKind.set(msg.kind, reqId);
      return new Promise((resolve) => {
        pending.set(reqId, { kind: msg.kind, resolve, onRerun });
        worker.postMessage({ ...msg, reqId });
      });
    },
    dispose: () => worker.terminate(),
  };
}
