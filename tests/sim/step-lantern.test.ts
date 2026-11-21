// `step` with lantern arguments (03 §13.4) and conditions in ppm (03 §13.3).
import { describe, expect, it } from 'vitest';
import { chance, test as gate } from '../../src/sim/conditions';
import { hashState } from '../../src/sim/hash';
import { initialState, runHistory, uniformStreams } from '../../src/sim/history';
import { sample } from '../../src/sim/math';
import { rand } from '../../src/sim/rng';
import { step } from '../../src/sim/step';
import type { LanternArgs, SimState } from '../../src/sim/types';
import { ch1, makeCtx, tiny } from './helpers';

/** Runs seed 1, stream 0 to `ticks` with the given lantern arguments, sampling branch points. */
function run(c: typeof ch1, ticks: number, lantern: LanternArgs | null): SimState[] {
  const streams = uniformStreams(c, 0);
  const memo = {};
  let s = initialState(c, 1, streams, memo);
  const states = [s];
  while (s.tick < ticks) {
    const t = s.tick;
    const r = step(
      c,
      1,
      streams,
      s,
      [],
      (bp) =>
        sample(
          bp.options.map((o) => o.ppm),
          rand(1, 's0:branch', t, bp.key, 1_000_000),
        ),
      memo,
      lantern,
    );
    if (!r.state) throw new Error('stopped at a branch point');
    s = r.state;
    states.push(s);
  }
  return states;
}

describe('step with lantern arguments', () => {
  it('every cat live and nothing held is single-history mode', () => {
    const all = { live: ch1.cats.map((x) => x.id), held: [] };
    const h = runHistory(ch1, 1, 0);
    const lit = run(ch1, 300, all);
    expect(lit.map(hashState)).toEqual(h.states.slice(0, 301).map(hashState));
  });

  it('a fogged cat is not stepped: its state stays as it was', () => {
    const fogged = 'pal';
    const live = tiny.cats.map((x) => x.id).filter((id) => id !== fogged);
    // Storylets that could bind it are held by the fog (03 §13.4); here, all of them.
    const states = run(tiny, 60, { live, held: tiny.storylets.map((d) => d.id) });
    const first = states[0]?.cats[fogged];
    for (const s of states) expect(s.cats[fogged]).toEqual(first);
    // the live cats still move
    expect(states.at(-1)?.cats['hero']).not.toEqual(states[0]?.cats['hero']);
  });

  it('a storylet held by the fog does not activate or move', () => {
    const all = tiny.cats.map((x) => x.id);
    const free = run(tiny, 120, null);
    const moved = tiny.storylets.filter((d) => free.some((s) => s.storylets[d.id]?.state !== null));
    expect(moved.length).toBeGreaterThan(0);
    const held = run(tiny, 120, { live: all, held: moved.map((d) => d.id) });
    for (const d of moved) for (const s of held) expect(s.storylets[d.id]?.state).toBeNull();
  });
});

describe('conditions in ppm', () => {
  it('about live things every condition is 0 or 1 000 000, and the gate agrees', () => {
    const ctx = makeCtx(tiny, { t: 30 });
    const conds = [
      { clock: ['06:00', '07:00'] as [string, string] },
      { weather: 'dry' as const },
      { not: { weather: 'dry' as const } },
      { all: [{ weather: 'dry' as const }, { at: 'hero', region: 'home' }] },
      { any: [{ weather: 'rain' as const }, { fact: 'nothing' }] },
    ];
    for (const cond of conds) {
      const p = chance(ctx, cond, {});
      expect([0, 1_000_000]).toContain(p);
      expect(gate(ctx, cond, {})).toBe(p === 1_000_000);
    }
  });
});
