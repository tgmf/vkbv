// Typed request/response client for the simulation worker (spec 02 §3).
// Each request gets a reqId. A reply that is older than the latest request of its kind is
// dropped (its promise never settles), so the UI keeps the previous result until the new one arrives.
import type { MainToWorker, WorkerToMain } from './protocol';

/** A request as the caller writes it: any MainToWorker message without its reqId. */
type Request = MainToWorker extends infer M
  ? M extends unknown
    ? Omit<M, 'reqId'>
    : never
  : never;

export interface SimClient {
  request(msg: Request): Promise<WorkerToMain>;
  dispose(): void;
}

export function createSimClient(): SimClient {
  const worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
  let nextId = 1;
  const latestByKind = new Map<MainToWorker['kind'], number>();
  const pending = new Map<
    number,
    { kind: MainToWorker['kind']; resolve: (r: WorkerToMain) => void }
  >();

  worker.addEventListener('message', (event: MessageEvent<WorkerToMain>) => {
    const reply = event.data;
    const req = pending.get(reply.reqId);
    if (!req) return;
    pending.delete(reply.reqId);
    if (latestByKind.get(req.kind) === reply.reqId) req.resolve(reply);
  });

  return {
    request(msg) {
      const reqId = nextId++;
      latestByKind.set(msg.kind, reqId);
      return new Promise((resolve) => {
        pending.set(reqId, { kind: msg.kind, resolve });
        worker.postMessage({ ...msg, reqId });
      });
    },
    dispose: () => worker.terminate(),
  };
}
