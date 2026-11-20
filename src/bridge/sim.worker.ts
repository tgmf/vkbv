/**
 * Worker host: owns timing and messaging so that src/sim stays pure.
 * Runs a fixed-step loop and posts throttled snapshots.
 */
import { applyCommand, createState, step, TICKS_PER_SECOND, toSnapshot } from '../sim/step';
import type { SimState } from '../sim/types';
import {
  INITIAL_SEED,
  SNAPSHOT_INTERVAL_MS,
  type MainToWorker,
  type WorkerToMain,
} from './protocol';

interface TypedWorkerScope {
  postMessage(message: WorkerToMain): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<MainToWorker>) => void): void;
}

const scope = self as unknown as TypedWorkerScope;
const STEP_MS = 1000 / TICKS_PER_SECOND;
const MAX_STEPS_PER_FRAME = 5;

let state: SimState = createState(INITIAL_SEED);
let accumulator = 0;
let last = performance.now();
let lastSent = -Infinity;

function sendSnapshot(now: number): void {
  lastSent = now;
  scope.postMessage({ kind: 'snapshot', snapshot: toSnapshot(state) });
}

scope.addEventListener('message', (event) => {
  const msg = event.data;
  switch (msg.kind) {
    case 'command':
      state = applyCommand(state, msg.command);
      sendSnapshot(performance.now());
      break;
  }
});

setInterval(() => {
  const now = performance.now();
  accumulator += now - last;
  last = now;
  let steps = 0;
  while (accumulator >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
    state = step(state);
    accumulator -= STEP_MS;
    steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME) accumulator = 0; // drop backlog after a stall
  if (now - lastSent >= SNAPSHOT_INTERVAL_MS) sendSnapshot(now);
}, STEP_MS / 2);

sendSnapshot(last);
