// The fog's cat chains (03 §13.2, §13.3, §18).
import { describe, expect, it } from 'vitest';
import { choices } from '../../src/sim/cats';
import {
  bandMid,
  bandOf,
  fogChoices,
  fogSetup,
  fogStep,
  initialFog,
  pointMass,
  standIn,
  WAVE_TOTAL,
  type Fog,
  type FogCase,
} from '../../src/sim/fog';
import { runHistory } from '../../src/sim/history';
import type { Content } from '../../src/sim/types';
import { ch1, ch1Coarse, makeCtx, tiny } from './helpers';

const ids = (c: Content) => c.cats.map((x) => x.id);

describe('one decision function (03 §13.3, §18)', () => {
  it.each([0, 40, 120, 300])(
    'live and point-mass chain states give the same probabilities on Chapter 1, tick %i',
    (t) => {
      const setup = fogSetup(ch1, 1);
      const live = runHistory(ch1, 1, 0).states[t];
      if (!live) throw new Error('no state');
      // Both sides from the same stand-ins: every cat as its point mass.
      const empty = initialFog(setup, []).cases[0];
      if (!empty) throw new Error('no case');
      const fc: FogCase = { ...empty, weight: WAVE_TOTAL, weather: live.weather.now, cats: {} };
      const s = structuredClone(setup.base);
      s.tick = t;
      s.weather = { ...live.weather };
      for (const id of ids(ch1)) {
        const cs = live.cats[id];
        if (!cs) throw new Error('no cat');
        const pm = pointMass(setup, id, cs);
        fc.cats[id] = pm;
        const e = pm.chain[0];
        if (!e) throw new Error('empty chain');
        s.cats[id] = standIn(setup, id, e.s, pm.mean, ch1.tuning.fog.stepTicks);
      }
      const ctx = makeCtx(ch1, { state: s, t });
      let compared = 0;
      for (const id of ids(ch1)) {
        const e = fc.cats[id]?.chain[0];
        if (!e) continue;
        const a = choices(ctx, id);
        const b = fogChoices(setup, fc, t, id, e.s);
        expect(b.cands.map((x) => x.activity)).toEqual(a.cands.map((x) => x.activity));
        expect(b.ppm).toEqual(a.ppm);
        compared += a.cands.length;
      }
      expect(compared).toBeGreaterThan(0);
    },
  );
});

/** Every cat's chain sums to 1 000 000 and holds only integers in every case after every step. */
function checkFog(fog: Fog): void {
  expect(fog.cases.reduce((a, fc) => a + fc.weight, 0)).toBe(WAVE_TOTAL);
  for (const fc of fog.cases)
    for (const [id, cat] of Object.entries(fc.cats)) {
      const sum = cat.chain.reduce((a, e) => a + e.p, 0);
      if (sum !== 1_000_000) expect.fail(`${id} sums to ${sum} at tick ${fog.tick}`);
      for (const e of cat.chain)
        if (!Number.isInteger(e.p) || e.p <= 0) expect.fail(`${id}: ${e.p}`);
    }
  if (/[:[,]-?\d+(?:\.\d+|[eE])/.test(JSON.stringify(fog))) expect.fail('a float in the fog');
}

describe('chains', () => {
  it('sum to 1 000 000 after every step on the tiny world (whole day) and Chapter 1 (morning)', () => {
    for (const [c, ticks] of [
      [tiny, tiny.world.ticks],
      [ch1Coarse, 120],
    ] as const) {
      const setup = fogSetup(c, 1);
      let fog = initialFog(setup, ids(c));
      checkFog(fog);
      while (fog.tick < ticks) {
        fog = fogStep(setup, fog);
        checkFog(fog);
      }
    }
  }, 120_000);

  it('start at the seeded stats: each banded gauge in the band holding its value', () => {
    const setup = fogSetup(ch1, 7);
    const fog = initialFog(setup, ids(ch1));
    const marti = fog.cases[0]?.cats['marti'];
    const seeded = setup.seeded['marti'] ?? {};
    for (const g of setup.banded['marti'] ?? [])
      for (const e of marti?.chain ?? []) expect(e.s.bands[g]).toBe(bandOf(ch1, seeded[g] ?? 0));
    for (const [g, v] of Object.entries(marti?.mean ?? {})) expect(v).toBe(seeded[g]);
  });

  it('B1 on the morning: with no pins all of Marti’s mass stays in the flat', () => {
    const setup = fogSetup(ch1Coarse, 1);
    let fog = initialFog(setup, ids(ch1));
    while (fog.tick < 240) {
      fog = fogStep(setup, fog);
      for (const fc of fog.cases)
        for (const e of fc.cats['marti']?.chain ?? []) {
          const nodes = [e.s.place, ...(e.s.walk ? [e.s.walk.from, ...e.s.walk.path] : [])];
          for (const n of nodes)
            expect(ch1Coarse.node[n]?.region, `${n} at ${fog.tick}`).toBe('flat');
        }
    }
  }, 120_000);
});

describe('bands (03 §13.2)', () => {
  it('a hook rule moves trunc(add × 1e6 / bandWidth) ppm to the next band', () => {
    // Tiny world: hooks floor 20, 4 bands of width trunc(981 / 4) = 245. boxPull rises 10 per tick
    // while the cat stands at a box; over a 5-tick step that is 50, so 204 081 ppm move up a band.
    const setup = fogSetup(tiny, 1);
    expect(setup.banded['hero']).toContain('boxPull');
    const fog = initialFog(setup, ['hero']);
    const fc = fog.cases[0];
    const hero = fc?.cats['hero'];
    if (!fc || !hero) throw new Error('no hero');
    // street.b carries the box tag itself (object tags do not count in conditions, M1-1)
    const box = { id: 'street.b' };
    const b = bandOf(tiny, 100);
    // One state: napping in the box for long enough, boxPull in its seeded band.
    hero.chain = [
      {
        s: {
          activity: 'nap',
          place: box.id,
          walk: null,
          leftSteps: 9,
          bands: { ...hero.chain[0]?.s.bands, boxPull: b },
          interrupt: null,
          control: 'forced',
        },
        p: 1_000_000,
      },
    ];
    // The step covers ticks 1-5: the rise adds 50, so 204 081 ppm move up a band. Then the decay
    // (−1 every 3 ticks: tick 3) moves trunc(1e6 / 245) = 4 081 ppm of that band back down.
    const next = fogStep(setup, { tick: 1, cases: [fc] });
    const up = next.cases[0]?.cats['hero']?.chain.filter((e) => e.s.bands['boxPull'] === b + 1);
    expect(up?.reduce((a, e) => a + e.p, 0)).toBe(
      Math.trunc((204_081 * (1_000_000 - 4_081)) / 1_000_000),
    );
    expect(bandMid(tiny, b)).toBe(20 + Math.trunc(981 / 8));
  });
});
