// Worker host for the simulation (02 §3): the host of host.ts with the worker's postMessage and
// clock. It runs no timer: between slices of a re-run it yields through a MessageChannel, so
// messages that arrived meanwhile (a newer request) are handled first.
import { CHAPTER1_FILES, PINSETS_FILE, TUNING_FILE } from '../content/chapter1';
import { createHost } from './host';
import type { MainToWorker, WorkerToMain } from './protocol';

interface WorkerScope {
  postMessage(message: WorkerToMain): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<MainToWorker>) => void): void;
}
const scope = self as unknown as WorkerScope;

const later: (() => void)[] = [];
const yielder = new MessageChannel();
yielder.port1.onmessage = () => later.shift()?.();

const host = createHost(
  { chapter: CHAPTER1_FILES, tuning: TUNING_FILE, pinsets: PINSETS_FILE },
  {
    post: (message) => scope.postMessage(message),
    schedule: (fn) => {
      later.push(fn);
      yielder.port2.postMessage(null);
    },
    now: () => performance.now(),
  },
);

scope.addEventListener('message', (event) => host.receive(event.data));
