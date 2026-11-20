import { applyCommand, createState, step } from './step';
import type { SimCommand, SimState } from './types';

/** A command applied just before the step with the given frame index. */
export interface LogEntry {
  readonly frame: number;
  readonly command: SimCommand;
}

/** Runs the sim headless (no worker) for `frames` steps, applying logged commands. */
export function runReplay(seed: number, log: readonly LogEntry[], frames: number): SimState {
  let state = createState(seed);
  for (let frame = 0; frame < frames; frame++) {
    for (const entry of log) {
      if (entry.frame === frame) state = applyCommand(state, entry.command);
    }
    state = step(state);
  }
  return state;
}

/** FNV-1a 32-bit over a canonical serialisation of the full state. */
export function hashState(state: SimState): string {
  const canonical = [state.tick, state.seed, state.value, state.paused, state.rng].join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
