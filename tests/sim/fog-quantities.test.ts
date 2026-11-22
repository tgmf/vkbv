// Fog quantities and cases (03 §13.5, §13.6).
import { describe, expect, it } from 'vitest';
import {
  addCounter,
  addFactChance,
  counterOf,
  clearFlag,
  flagChance,
  initialQuantities,
  mixQuantities,
  or,
  setFlag,
} from '../../src/sim/fog-quantities';
import { fogSetup, fogStep, initialFog, linkKey, WAVE_TOTAL, type Fog } from '../../src/sim/fog';
import { runHistory } from '../../src/sim/history';
import { ch1, ch1Coarse, tiny } from './helpers';

describe('fog quantities (03 §13.6)', () => {
  it('a once-storylet state adds its disjoint entering masses; other sources combine as independent', () => {
    const q = initialQuantities(tiny);
    addFactChance(q, 'f', 300_000, 'sl:a.s');
    addFactChance(q, 'f', 300_000, 'sl:a.s');
    expect(q.facts['f']).toBe(600_000);
    addFactChance(q, 'f', 500_000);
    expect(q.facts['f']).toBe(or(600_000, 500_000));
    expect(q.facts['f']).toBe(800_000);
  });

  it('a flag expires with its contribution, and clearing scales every contribution', () => {
    const q = initialQuantities(tiny);
    setFlag(q, 'box@x', 400_000, 10);
    setFlag(q, 'box@x', 500_000, null);
    expect(flagChance(q, 'box@x', 5)).toBe(700_000);
    expect(flagChance(q, 'box@x', 10)).toBe(500_000);
    clearFlag(q, 'box@x', 500_000);
    expect(flagChance(q, 'box@x', 10)).toBe(250_000);
  });

  it('a counter gains Bernoulli terms; mixing cases keeps the total variance', () => {
    const a = initialQuantities(tiny);
    const b = initialQuantities(tiny);
    // kept in millionths of a unit, so no fraction is lost
    addCounter(a, 'n', 10, 500_000);
    expect(a.counters['n']).toEqual({ mean: 5_000_000, variance: 25_000_000 });
    expect(counterOf(a, 'n')).toEqual({ mean: 5, variance: 25 });
    addCounter(a, 'n', 5, 960_000); // 4.8 more: whole units would have kept 4
    expect(a.counters['n']?.mean).toBe(9_800_000);
    addCounter(b, 'n', 30, 1_000_000);
    expect(b.counters['n']).toEqual({ mean: 30_000_000, variance: 0 });
    // equal weights: mean (9.8 + 30) / 2 = 19.9; variance = mean variance + spread of the means
    const m = mixQuantities(tiny, [
      { w: 1, q: a },
      { w: 1, q: b },
    ]);
    const va = 25_000_000 + 25 * 38_400; // 5² × 0.96 × 0.04 = 0.96 units² more
    expect(m.counters['n']).toEqual({
      mean: 19_900_000,
      variance: Math.trunc(va / 2) + 10_100 * 10_100, // (9.8 − 19.9)² = (30 − 19.9)² = 102.01
    });
  });
});

/** Runs the whole-day projection, calling `each` after every step. */
function project(c: typeof tiny, ticks: number, each: (fog: Fog) => void): Fog {
  const setup = fogSetup(c, 1);
  let fog = initialFog(
    setup,
    c.cats.map((x) => x.id),
  );
  while (fog.tick < ticks) {
    fog = fogStep(setup, fog);
    each(fog);
  }
  return fog;
}

const mixed = (fog: Fog, fact: string) =>
  fog.cases.reduce(
    (a, fc) => a + Math.trunc(((fc.q.facts[fact] ?? 0) * fc.weight) / WAVE_TOTAL),
    0,
  );

describe('cases (03 §13.5)', () => {
  it('a link splits exactly at the transition that sets it: each case agrees with its link', () => {
    const setup = fogSetup(ch1Coarse, 1);
    const key = linkKey({ kind: 'fact', fact: 'crewArrived' });
    expect(setup.links.map(linkKey)).toContain(key);
    project(ch1Coarse, 120, (fog) => {
      expect(fog.cases.reduce((a, fc) => a + fc.weight, 0)).toBe(WAVE_TOTAL);
      for (const fc of fog.cases) {
        const rd = fc.q.storylets['roadworks_day']?.p ?? {};
        if (fc.links[key] === 1) {
          expect(fc.q.facts['crewArrived']).toBe(1_000_000);
          expect(rd['not_started'] ?? 0).toBe(0);
        } else {
          expect(fc.q.facts['crewArrived'] ?? 0).toBe(0);
          expect(rd['working'] ?? 0).toBe(0);
        }
      }
    });
  }, 60_000);

  it('the weather splits into rain and stopped cases; rain has surely started by its window’s end', () => {
    const c = ch1Coarse;
    const fog = project(c, 460, () => undefined); // 13:20, past the start window (11:00–13:00)
    expect(fog.cases.every((fc) => fc.weather !== 'dry')).toBe(true);
    for (const fc of fog.cases) expect(fc.q.facts['rainStarted']).toBe(1_000_000);
    for (const fc of fog.cases)
      if (fc.weather === 'rain')
        expect(fc.rainStart.reduce((a, [, p]) => a + p, 0)).toBe(1_000_000);
  }, 120_000);

  it('storylets in the fog land near the reference simulation by the end of the day', () => {
    // A smoke check ahead of calibration (07 §3): within 10 points over 200 behaviour streams, at
    // the default fog knobs (npm run calibrate checks the buckets over many seeds).
    const c = ch1;
    const fog = project(c, c.world.ticks, () => undefined);
    // 200 behaviour streams: for a 50% event the reference's own noise is then about 3.5 points
    const n = 200;
    const ends = Array.from({ length: n }, (_, i) => {
      const h = runHistory(c, 1, 100_001 + i);
      return h.states[h.states.length - 1]?.facts ?? [];
    });
    for (const fact of ['rokkoOnBeach', 'rokkoUnderBoat', 'shopClosedEarly', 'crewArrived']) {
      const ref = Math.trunc((ends.filter((f) => f.includes(fact)).length * 1_000_000) / n);
      expect(Math.abs(mixed(fog, fact) - ref), fact).toBeLessThanOrEqual(100_000);
    }
  }, 300_000);
});
