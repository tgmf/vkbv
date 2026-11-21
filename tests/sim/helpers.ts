// Shared helpers for simulation tests: the two content sets, and a step context on a chosen state.
import { join } from 'node:path';
import { readChapterDir } from '../../src/cli/files';
import { CHAPTER1_FILES, TUNING_FILE } from '../../src/content/chapter1';
import { loadChapter, loadTuning, type Content } from '../../src/content/load';
import { initialState, uniformStreams } from '../../src/sim/history';
import type { BranchPoint, CatState, Ctx, Pin, SimState } from '../../src/sim/types';
import { newDecisionMemo } from '../../src/sim/types';

export const tuning = loadTuning(TUNING_FILE);
export const TINY_DIR = join(import.meta.dirname, '..', 'fixtures', 'tiny');
export const tiny: Content = loadChapter(readChapterDir(TINY_DIR), tuning);
export const ch1: Content = loadChapter(CHAPTER1_FILES, tuning);
/**
 * Chapter 1 with the coarse fog knobs used for measuring (minStatePpm 20 000, 2 bands), so fog
 * invariant tests over many steps stay fast while the budget question (M2-1) is open.
 */
export const ch1Coarse: Content = loadChapter(CHAPTER1_FILES, {
  ...tuning,
  fog: { ...tuning.fog, minStatePpm: 20_000, bands: 2 },
});

export const freshState = (c: Content, seed = 1, stream = 0): SimState =>
  initialState(c, seed, uniformStreams(c, stream));

/** A context at tick t over a copy of `state` (default: the initial state with its tick set). */
export function makeCtx(
  c: Content,
  opts: {
    state?: SimState;
    t?: number;
    seed?: number;
    pins?: Pin[];
    pick?: (bp: BranchPoint) => number;
  } = {},
): Ctx {
  const base = opts.state ?? freshState(c, opts.seed ?? 1);
  const s = structuredClone(base);
  if (opts.t !== undefined) s.tick = opts.t;
  return {
    c,
    seed: opts.seed ?? 1,
    streams: uniformStreams(c, 0),
    s,
    prev: structuredClone(s),
    t: s.tick,
    events: [],
    pins: opts.pins ?? [],
    pick: opts.pick ?? (() => 0),
    chanceN: 0,
    memo: {},
    decisions: newDecisionMemo(),
  };
}

export const cat = (ctx: Ctx, id: string): CatState => {
  const cs = ctx.s.cats[id];
  if (!cs) throw new Error(`no cat ${id}`);
  return cs;
};

/** Puts a cat standing at a place with nothing to do. */
export function place(ctx: Ctx, id: string, node: string): CatState {
  const cs = cat(ctx, id);
  cs.pos = { at: node };
  cs.route = [];
  cs.activity = 'none';
  cs.boredom = 0;
  cs.activityPlace = null;
  cs.control = 'free';
  cs.interrupt = null;
  return cs;
}

let seq = 0;
export const cardPin = (
  card: string,
  target: { cat: string } | { object: string } | { place: string },
  tick: number,
  special = false,
): Pin => ({ id: `p${++seq}`, seq, tick, kind: 'card', card, target, special });
export const powerPin = (power: string, placeId: string, tick: number): Pin => ({
  id: `p${++seq}`,
  seq,
  tick,
  kind: 'power',
  power,
  place: placeId,
});

export const types = (ctx: Ctx): string[] => ctx.events.map((e) => e.type);
