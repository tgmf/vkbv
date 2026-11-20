import { describe, expect, it } from 'vitest';
import { hashState, runReplay, type LogEntry } from '../src/sim/replay';
import golden from './golden/replay-basic.json';

const log = golden.log as LogEntry[];

describe('golden replay', () => {
  it('matches the stored hash', () => {
    const state = runReplay(golden.seed, log, golden.frames);
    expect(hashState(state)).toBe(golden.expectedHash);
  });

  it('is deterministic across runs', () => {
    const a = runReplay(golden.seed, log, golden.frames);
    const b = runReplay(golden.seed, log, golden.frames);
    expect(b).toEqual(a);
    expect(hashState(b)).toBe(hashState(a));
  });

  it('pausing stops ticks; reset restarts from the new seed', () => {
    // 200 frames, paused for frames 20..34 (15) and frame 150 (1), reset at 80 → tick = 200 - 80 - 1
    const state = runReplay(golden.seed, log, golden.frames);
    expect(state.seed).toBe(777);
    expect(state.tick).toBe(119);
  });

  it('different seeds diverge', () => {
    expect(hashState(runReplay(1, [], 50))).not.toBe(hashState(runReplay(2, [], 50)));
  });
});
