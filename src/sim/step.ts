import { nextFloat, seedState } from './prng';
import type { SimCommand, SimSnapshot, SimState } from './types';

export const TICKS_PER_SECOND = 10;

export function createState(seed: number): SimState {
  const s = seed >>> 0;
  return { tick: 0, seed: s, value: 0, paused: false, rng: seedState(s) };
}

export function applyCommand(state: SimState, command: SimCommand): SimState {
  switch (command.type) {
    case 'togglePause':
      return { ...state, paused: !state.paused };
    case 'reset':
      return createState(command.seed);
  }
}

/** Advances the sim by one fixed step. Paused sims do not advance. */
export function step(state: SimState): SimState {
  if (state.paused) return state;
  const r = nextFloat(state.rng);
  return { ...state, tick: state.tick + 1, value: r.value, rng: r.state };
}

export function toSnapshot(state: SimState): SimSnapshot {
  return { tick: state.tick, seed: state.seed, value: state.value, paused: state.paused };
}
