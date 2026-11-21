// Worker host for the simulation. It never runs a clock: the UI drives time (spec 02 §3).
import type { MainToWorker, WorkerToMain } from './protocol';

interface WorkerScope {
  postMessage(message: WorkerToMain): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<MainToWorker>) => void): void;
}
const scope = self as unknown as WorkerScope;

function handle(msg: MainToWorker): WorkerToMain {
  switch (msg.kind) {
    case 'init':
      return { kind: 'ready', reqId: msg.reqId };
    case 'vet':
    case 'recompute':
    case 'commit':
    case 'observe':
    case 'debugHistory':
      return { kind: 'error', reqId: msg.reqId, message: 'not implemented' };
    default: {
      const never: never = msg;
      throw new Error(`unknown message ${JSON.stringify(never)}`);
    }
  }
}

scope.addEventListener('message', (event) => scope.postMessage(handle(event.data)));
