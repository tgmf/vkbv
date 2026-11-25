// The balance properties B2-B7 of 05 §5.2, measured (M4): `balanceSeed` runs one requested seed (vetted
// live, as the worker vets a typed seed, 04 §2) through the whole-day runs each property needs, each
// stopped once its property is decided; `judgeBalance` turns every seed's results into the table.
// scripts/balance.ts runs the seeds in parallel. Measuring only: nothing here fails the build.
import { fogSetup, WAVE_TOTAL, type FogSetup } from '../sim/fog';
import { advance, initialWave, type Wave } from '../sim/lantern';
import { followedCats } from '../sim/readers';
import { wholeDayRun } from '../sim/recompute';
import type { Content, Pin } from '../sim/types';
import { vet, vettingContent } from '../sim/vet';

/** 05 §5.2's properties as data: the pin sets each reads, its threshold, and B5's four pins. */
export const BALANCE = {
  /** B2-B4: P(`martiOut` by 19:00) of each set, at most / at least this, per mille. */
  out: [
    { id: 'B2', set: 'lure_unprimed', atMostPm: 150 },
    { id: 'B3', set: 'lure_one_prime', atMostPm: 350 },
    { id: 'B4', set: 'lure_primed', atLeastPm: 600 },
  ],
  outBy: 800, // 19:00
  /** B5: subsets of these added to `lure_primed`; P(`roadBlocked` at rain start) against 50%. */
  roadPins: [
    'tea_break@town.roadworks@180',
    'box@town.roadworks@200',
    'sudden_flea@gavrila@220',
    'something_shiny@town.roadworks@240',
  ],
  roadBase: 'lure_primed',
  roadPpm: 500_000,
  roadSubsetsAtLeast: 3,
  /** B6: these do not fray, B7: this frays, on at least this share of seeds (45 of 50). */
  notFray: ['road_tea', 'road_box', 'road_both'],
  fray: 'late_lure',
  seedsPm: 900,
} as const;

/** One requested seed's measures. */
export interface SeedBalance {
  seed: number;
  vetted: number;
  /** B2-B4: whether the lantern holds `martiOut` by 19:00, per set. */
  out: Record<string, boolean>;
  /** B5: the fog's P(`roadBlocked`) at the end of the first fog step that saw the rain, per subset. */
  road: Record<string, number>;
  /** B6, B7: whether the whole-day run frayed, per set. */
  frayed: Record<string, boolean>;
}

/** Runs the lantern from tick 0 with `pins` until `done` holds of a wave, or the run ends. */
function runUntil(setup: FogSetup, pins: readonly Pin[], done: (w: Wave) => boolean): Wave {
  const { c } = setup;
  const followed = followedCats(c);
  let w = initialWave(setup, followed);
  while (!done(w) && w.fray === null && w.lantern.sim.tick < c.world.ticks)
    w = advance(setup, w, pins, followed);
  return w;
}

/** The non-empty subsets of B5's pins, in binary order, each named by its pins joined with `+`. */
export function roadSubsets(): string[][] {
  const pins = BALANCE.roadPins;
  return Array.from({ length: (1 << pins.length) - 1 }, (_, i) =>
    pins.filter((_, k) => ((i + 1) >> k) & 1),
  );
}

/** The fog's chance of a fact over its cases. */
const chance = (w: Wave, fact: string): number =>
  w.lantern.sim.facts.includes(fact)
    ? 1_000_000
    : w.fog.cases.reduce(
        (a, fc) => a + Math.trunc(((fc.q.facts[fact] ?? 0) * fc.weight) / WAVE_TOTAL),
        0,
      );

/**
 * One requested seed: vetted with `vetting.solutions` (04 §2), then B2-B4 to 19:00, B5's subsets to the
 * first fog step that sees the rain, B6 and B7 to the end. `sets` are the pin sets of 05 §5.1; `parse`
 * reads pins written as 05 §5.1 writes them.
 */
export function balanceSeed(
  c: Content,
  sets: Record<string, Pin[]>,
  parse: (pins: string[]) => Pin[],
  requested: number,
): SeedBalance {
  const solutions = c.tuning.vetting.solutions.map((name) => sets[name] ?? []);
  const seed = vet(vettingContent(c), requested, solutions).seed;
  const setup = fogSetup(c, seed);
  const pinsOf = (name: string) => {
    const pins = sets[name];
    if (!pins) throw new Error(`no pin set ${name}`);
    return pins;
  };
  const out: Record<string, boolean> = {};
  for (const { set } of BALANCE.out) {
    const w = runUntil(setup, pinsOf(set), (x) => x.lantern.sim.tick >= BALANCE.outBy);
    out[set] = w.lantern.sim.facts.includes('martiOut');
  }
  const road: Record<string, number> = {};
  const base = pinsOf(BALANCE.roadBase);
  for (const subset of roadSubsets()) {
    // the fog steps when the lantern passes a boundary and reads its weather then (03 §14)
    const w = runUntil(setup, [...base, ...parse(subset)], (x) => {
      const r = x.lantern.sim.weather.startedAt;
      return r !== null && x.fog.tick > r;
    });
    road[subset.join('+')] = chance(w, 'roadBlocked');
  }
  const frayed: Record<string, boolean> = {};
  for (const set of [...BALANCE.notFray, BALANCE.fray])
    frayed[set] = wholeDayRun(setup, pinsOf(set)).fray !== null;
  return { seed: requested, vetted: seed, out, road, frayed };
}

export interface BalanceRow {
  id: string;
  property: string;
  measured: string;
  target: string;
  pass: boolean;
  /** Seeds that went against the property (for traces). */
  against: number[];
}

const pct = (pm: number) => `${(pm / 10).toFixed(1)}%`;

/** The table of B2-B7 over every seed's measures (05 §5.2). */
export function judgeBalance(runs: readonly SeedBalance[]): BalanceRow[] {
  const n = runs.length;
  const share = (f: (r: SeedBalance) => boolean) => runs.filter(f).length;
  const rows: BalanceRow[] = [];
  for (const p of BALANCE.out) {
    const k = share((r) => r.out[p.set] === true);
    const pm = Math.trunc((k * 1000) / Math.max(1, n));
    const atMost = 'atMostPm' in p;
    const limit = atMost ? p.atMostPm : p.atLeastPm;
    rows.push({
      id: p.id,
      property: `${p.set}: P(martiOut by 19:00)`,
      measured: `${pct(pm)} (${k}/${n})`,
      target: `${atMost ? '≤' : '≥'} ${pct(limit)}`,
      pass: atMost ? pm <= limit : pm >= limit,
      against: runs.filter((r) => r.out[p.set] === atMost).map((r) => r.seed),
    });
  }
  const means = roadSubsets().map((subset) => {
    const name = subset.join('+');
    const mean = Math.trunc(runs.reduce((a, r) => a + (r.road[name] ?? 0), 0) / Math.max(1, n));
    return { subset, name, mean };
  });
  const blocking = means.filter((m) => m.mean >= BALANCE.roadPpm);
  const singles = blocking.filter((m) => m.subset.length === 1);
  rows.push({
    id: 'B5',
    property: `${BALANCE.roadBase} + road pins: P(roadBlocked at rain start)`,
    measured:
      `${blocking.length} subsets ≥ 50%, ${singles.length} of them single pins; ` +
      means.map((m) => `${m.name} ${pct(Math.trunc(m.mean / 1000))}`).join(', '),
    target: `no single pin ≥ 50%; ≥ ${BALANCE.roadSubsetsAtLeast} subsets ≥ 50%`,
    pass: singles.length === 0 && blocking.length >= BALANCE.roadSubsetsAtLeast,
    against: [],
  });
  const enough = (k: number) => k * 1000 >= BALANCE.seedsPm * n;
  for (const set of BALANCE.notFray) {
    const k = share((r) => r.frayed[set] === false);
    rows.push({
      id: 'B6',
      property: `${set}: does not fray`,
      measured: `${k}/${n}`,
      target: `≥ ${pct(BALANCE.seedsPm)} of seeds`,
      pass: enough(k),
      against: runs.filter((r) => r.frayed[set] !== false).map((r) => r.seed),
    });
  }
  const k = share((r) => r.frayed[BALANCE.fray] === true);
  rows.push({
    id: 'B7',
    property: `${BALANCE.fray}: frays`,
    measured: `${k}/${n}`,
    target: `≥ ${pct(BALANCE.seedsPm)} of seeds`,
    pass: enough(k),
    against: runs.filter((r) => r.frayed[BALANCE.fray] !== true).map((r) => r.seed),
  });
  return rows;
}
