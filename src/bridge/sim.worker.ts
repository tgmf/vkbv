// Worker host for the simulation. It never runs a clock: the UI drives time (spec 02 §3).
import { CHAPTER1_FILES, TUNING_FILE } from '../content/chapter1';
import { ContentError, loadChapter, loadTuning, type Content } from '../content/load';
import type { MainToWorker, WorkerToMain } from './protocol';

interface WorkerScope {
  postMessage(message: WorkerToMain): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<MainToWorker>) => void): void;
}
const scope = self as unknown as WorkerScope;

let content: Content | null = null;

function handle(msg: MainToWorker): WorkerToMain {
  switch (msg.kind) {
    case 'init':
      try {
        // The content is loaded and cross-checked in this thread too (02 §5).
        content = loadChapter(
          CHAPTER1_FILES,
          loadTuning({ ...(TUNING_FILE as object), ...msg.tuning }),
        );
        return { kind: 'ready', reqId: msg.reqId };
      } catch (e) {
        if (!(e instanceof ContentError)) throw e;
        return { kind: 'error', reqId: msg.reqId, message: e.message };
      }
    case 'vet':
    case 'recompute':
    case 'commit':
    case 'observe':
    case 'debugHistory':
      return {
        kind: 'error',
        reqId: msg.reqId,
        message: content ? 'not implemented' : 'not initialised',
      };
    default: {
      const never: never = msg;
      throw new Error(`unknown message ${JSON.stringify(never)}`);
    }
  }
}

scope.addEventListener('message', (event) => scope.postMessage(handle(event.data)));
