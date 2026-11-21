// Worker host for the simulation. It never runs a clock: the UI drives time (spec 02 §3).
import { CHAPTER1_FILES, PINSETS_FILE, TUNING_FILE } from '../content/chapter1';
import { ContentError, loadChapter, loadTuning, parsePinSets, type Content } from '../content/load';
import { runHistory, type History } from '../sim/history';
import type { Pin } from '../sim/types';
import { inspectView } from './inspect';
import type { MainToWorker, WorkerToMain } from './protocol';

interface WorkerScope {
  postMessage(message: WorkerToMain): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<MainToWorker>) => void): void;
}
const scope = self as unknown as WorkerScope;

let content: Content | null = null;
let pinsets: Record<string, Pin[]> = {};
/** The dev inspector's history, kept until it asks for another seed, stream or pin set. */
let inspected: { key: string; history: History } | null = null;

function handle(msg: MainToWorker): WorkerToMain {
  switch (msg.kind) {
    case 'init':
      try {
        // The content is loaded and cross-checked in this thread too (02 §5).
        content = loadChapter(
          CHAPTER1_FILES,
          loadTuning({ ...(TUNING_FILE as object), ...msg.tuning }),
        );
        pinsets = parsePinSets(PINSETS_FILE, content);
        return { kind: 'ready', reqId: msg.reqId };
      } catch (e) {
        if (!(e instanceof ContentError)) throw e;
        return { kind: 'error', reqId: msg.reqId, message: e.message };
      }
    case 'inspect': {
      if (!content) return { kind: 'error', reqId: msg.reqId, message: 'not initialised' };
      const key = `${msg.seed}|${msg.stream}|${msg.pinset}`;
      if (inspected?.key !== key)
        inspected = {
          key,
          history: runHistory(content, msg.seed, msg.stream, pinsets[msg.pinset] ?? []),
        };
      return {
        kind: 'inspected',
        reqId: msg.reqId,
        view: inspectView(content, inspected.history, msg.tick),
      };
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
