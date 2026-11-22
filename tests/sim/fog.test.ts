// The fog's cat chains (03 §13.2, §13.3, §18).
import { describe, expect, it } from 'vitest';
import { bandEdges, bandWidthOf, BOREDOM, choices } from '../../src/sim/cats';
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
import { readChapterDir } from '../../src/cli/files';
import { loadChapter } from '../../src/content/load';
import { ch1, ch1Coarse, makeCtx, tiny, TINY_DIR, tuning } from './helpers';

const ids = (c: Content) => c.cats.map((x) => x.id);

describe('one decision function (03 §13.3, §18)', () => {
  it.each([40, 120, 300, 600])(
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
        s.cats[id] = standIn(setup, id, e.s, pm.mean);
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

/** The tiny world with 4 bands: the band tests check the arithmetic, whatever the default knobs. */
const tiny4 = loadChapter(readChapterDir(TINY_DIR), {
  ...tuning,
  fog: { ...tuning.fog, bands: 4 },
});

describe('bands (03 §13.2)', () => {
  it('a hook rule moves trunc(add × 1e6 / bandWidth) ppm to the next band', () => {
    // Tiny world: hooks floor 20, 4 bands: 3 equal ones up to fog.saturatedBandFrom (950), edges
    // 20 / 330 / 640 / 950, and a saturated band 950-1000. boxPull rises 10 per tick while the cat
    // stands at a box; over a 5-tick step that is 50, so trunc(50e6 / 310) = 161 290 ppm move up.
    const setup = fogSetup(tiny4, 1);
    expect(setup.banded['hero']).toContain('boxPull');
    const fog = initialFog(setup, ['hero']);
    const fc = fog.cases[0];
    const hero = fc?.cats['hero'];
    if (!fc || !hero) throw new Error('no hero');
    // street.b carries the box tag itself (object tags do not count in conditions, M1-1)
    const box = { id: 'street.b' };
    const b = bandOf(tiny4, 100);
    // One state: napping in the box for long enough, boxPull in its seeded band.
    hero.chain = [
      {
        s: {
          activity: 'nap',
          place: box.id,
          walk: null,
          bands: { ...hero.chain[0]?.s.bands, boxPull: b },
          interrupt: null,
          control: 'forced',
        },
        p: 1_000_000,
      },
    ];
    // The step covers ticks 1-5: the rise adds 50, so 161 290 ppm move up a band. Then the decay
    // (−1 every 3 ticks: tick 3) moves trunc(1e6 / 310) = 3 225 ppm of that band back down.
    const next = fogStep(setup, { tick: 1, cases: [fc] });
    const up = next.cases[0]?.cats['hero']?.chain.filter((e) => e.s.bands['boxPull'] === b + 1);
    expect(up?.reduce((a, e) => a + e.p, 0)).toBe(
      Math.trunc((161_290 * (1_000_000 - 3_225)) / 1_000_000),
    );
    expect(bandMid(tiny4, b)).toBe(Math.trunc((20 + 330 - 1) / 2));
  });

  it('the saturated top band: narrow, at the cap, read at its own midpoint (03 §13.2)', () => {
    expect(bandEdges(tiny4, 'boxPull')).toEqual([20, 330, 640, 950, 1001]);
    expect(bandEdges(tiny4, BOREDOM)).toEqual([0, 316, 633, 950, 1001]);
    expect(bandOf(tiny4, 949)).toBe(2);
    expect(bandOf(tiny4, 950)).toBe(3);
    expect(bandMid(tiny4, 3)).toBe(975); // a tired cat in the fog reads about the cap
    expect(bandWidthOf(tiny4, BOREDOM, 3)).toBe(51);
  });
});

describe('decisions at triggers only (03 §13.3, §18)', () => {
  it('walking mass is never polled for a decision; its arrival triggers one', () => {
    const setup = fogSetup(tiny, 1);
    const fog = initialFog(setup, ['bystander']);
    const fc = fog.cases[0];
    const by = fc?.cats['bystander'];
    if (!fc || !by) throw new Error('no bystander');
    by.chain = [
      {
        s: {
          activity: 'fetch',
          place: 'street.b',
          walk: { from: 'street.a', path: ['street.b'], leftSteps: 2, ofSteps: 2 },
          bands: { ...by.chain[0]?.s.bands },
          interrupt: null,
          control: 'free',
        },
        p: 1_000_000,
      },
    ];
    const count = () => setup.decisions.calls + setup.decisions.hits;
    const walking = fogStep(setup, { tick: 1, cases: [fc] }); // one step of the walk left
    expect(count()).toBe(0);
    fogStep(setup, walking); // arrives: a trigger
    expect(count()).toBeGreaterThan(0);
  });
});

describe('whole-band boredom (fog.boredomWhole, docs/questions.md M2-7)', () => {
  it('carries exact boredom per state: no split, rate × step ticks per step, a band change decides', () => {
    const c = loadChapter(readChapterDir(TINY_DIR), {
      ...tuning,
      fog: { ...tuning.fog, boredomWhole: true },
    });
    const setup = fogSetup(c, 1);
    const fog = initialFog(setup, ['bystander']);
    const fc = fog.cases[0];
    const by = fc?.cats['bystander'];
    if (!fc || !by) throw new Error('no bystander');
    // fetch at its place, boredom 0: fetch tires at trunc(2000 / 4) = 500 a tick
    by.chain = [
      {
        s: {
          activity: 'fetch',
          place: 'street.b',
          walk: null,
          bands: { ...by.chain[0]?.s.bands, $boredom: 0 },
          bored: 0,
          interrupt: null,
          control: 'storylet', // no free decision: the boredom alone is under test
        },
        p: 1_000_000,
      },
    ];
    const next = fogStep(setup, { tick: 1, cases: [fc] }).cases[0]?.cats['bystander']?.chain;
    // 5 ticks × 500 caps at 1000: one state, at the top band, and control handed back
    expect(next?.length).toBeGreaterThan(0);
    const fetching = next?.filter((e) => e.s.activity === 'fetch') ?? [];
    for (const e of fetching) expect(e.s.bored).toBe(1000);
    expect(next?.every((e) => e.s.control === 'free')).toBe(true);
  });
});
