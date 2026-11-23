// Counters carried by chains (fog.counterByChain, docs/questions.md M2-8, M2-23): the work a fogged cat
// does persists with the states that did it, so a counter's spread matches single histories.
import { describe, expect, it } from 'vitest';
import { readChapterDir } from '../../src/cli/files';
import { loadChapter } from '../../src/content/load';
import { fogSetup, WAVE_TOTAL } from '../../src/sim/fog';
import { initialState } from '../../src/sim/history';
import { advance, initialWave } from '../../src/sim/lantern';
import { sample } from '../../src/sim/math';
import { rand } from '../../src/sim/rng';
import { step } from '../../src/sim/step';
import type { Content } from '../../src/sim/types';
import { TINY_DIR, tuning } from './helpers';

/**
 * The tiny world with the fog's approximations off and `byChain` the switch under test. Pal works in
 * spells: `work` (no gate, score 1, tiring in about 10 ticks), `nap` or `wander` after
 * it, so how much pal has worked by a tick varies between histories. Pal plays no storylet role (the live bystander takes pal's).
 */
function exact(byChain: boolean): Content {
  const files = readChapterDir(TINY_DIR);
  const acts = structuredClone(files.activities) as { activities: Record<string, unknown>[] };
  const work = acts.activities.find((a) => a['id'] === 'work');
  if (work) {
    delete work['gate'];
    work['score'] = { base: 1 };
  }
  const cast = structuredClone(files.cast) as {
    cats: { id: string; activities: string[]; roles?: string[] }[];
  };
  const pal = cast.cats.find((x) => x.id === 'pal');
  const bystander = cast.cats.find((x) => x.id === 'bystander');
  if (pal && bystander) {
    pal.activities = ['work', 'nap', 'wander'];
    // `shift` binds the (live) bystander, not pal: the fog does not correlate its state with the
    // flag its `chosen` state sets (docs/questions.md M2-24)
    bystander.roles = [...(bystander.roles ?? []), ...(pal.roles ?? [])];
    pal.roles = [];
  }
  // the gate stays open: a fogged walker does not notice an edge that closes (docs/questions.md M2-25)
  const map = structuredClone(files.map) as { edges: Record<string, unknown>[] };
  for (const e of map.edges) delete e['when'];
  return loadChapter(
    { ...files, activities: acts, cast, map },
    {
      ...tuning,
      fog: {
        ...tuning.fog,
        stepTicks: 1,
        bands: 490,
        saturatedBandFrom: 1000,
        minStatePpm: 1,
        boredomWhole: true,
        counterByChain: byChain,
      },
      lantern: { ...tuning.lantern, releaseAfterTicks: 100_000 },
    },
  );
}

const TICKS = [10, 15, 20, 25, 30, 40, 50, 60, 80];

/** The `work` counter's mean and sd (units) at each tick, pal in the fog, the others live. */
function fogMoments(c: Content): Record<number, [number, number]> {
  const setup = fogSetup(c, 1);
  const out: Record<number, [number, number]> = {};
  let w = initialWave(setup, [], ['hero', 'bystander']);
  while (w.lantern.sim.tick < 81) {
    w = advance(setup, w, [], []);
    const t = w.lantern.sim.tick;
    if (!TICKS.includes(t)) continue;
    let m = 0;
    let m2 = 0;
    for (const fc of w.fog.cases) {
      const x = fc.weight / WAVE_TOTAL;
      const q = fc.q.counters['work'] ?? { mean: 0, variance: 0 };
      m += (x * q.mean) / 1e6;
      m2 += x * (q.variance / 1e6 + (q.mean / 1e6) ** 2);
    }
    out[t] = [m, Math.sqrt(Math.max(0, m2 - m * m))];
  }
  return out;
}

/** The same from N single histories, pal's stream varying, the rest on stream 0. */
function refMoments(c: Content, N: number): Record<number, [number, number]> {
  const xs: Record<number, number[]> = {};
  for (let k = 1; k <= N; k++) {
    const streams = { hero: 0, pal: k, bystander: 0, world: 0 };
    let s = initialState(c, 1, streams);
    while (s.tick < 81) {
      const t = s.tick;
      const r = step(c, 1, streams, s, [], (bp) =>
        sample(
          bp.options.map((o) => o.ppm),
          rand(1, 's0:branch', t, bp.key, 1_000_000),
        ),
      );
      if (!r.state) throw new Error('branch point');
      s = r.state;
      if (TICKS.includes(s.tick)) (xs[s.tick] ??= []).push(s.counters['work'] ?? 0);
    }
  }
  const out: Record<number, [number, number]> = {};
  for (const t of TICKS) {
    const a = xs[t] ?? [];
    const m = a.reduce((x, y) => x + y, 0) / a.length;
    out[t] = [m, Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length)];
  }
  return out;
}

describe('counters carried by chains (fog.counterByChain)', () => {
  it('a fogged cat’s work counter has the spread of its single histories', () => {
    const ref = refMoments(exact(true), 400);
    const on = fogMoments(exact(true));
    for (const t of TICKS) {
      const [rm, rs] = ref[t] ?? [0, 0];
      const [fm, fs] = on[t] ?? [0, 0];
      expect(Math.abs(fm - rm)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(fs - rs)).toBeLessThanOrEqual(Math.max(0.3, rs * 0.15));
    }
  }, 120_000);
});
