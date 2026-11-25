// Calibration (07 §3): each event's chance by the end of a whole-day run against whether it happens in
// one reality of the reference simulation. `seedPairs` runs one seed; `judge` checks the rates and the
// buckets over all of them. scripts/calibrate.ts and tests/calibration.test.ts share both.
import { fogSetup, WAVE_TOTAL, type Fog } from '../sim/fog';
import { initialState, sortPins, uniformStreams } from '../sim/history';
import { sample } from '../sim/math';
import { storyletCats } from '../sim/readers';
import { wholeDayRun } from '../sim/recompute';
import { rand } from '../sim/rng';
import { step } from '../sim/step';
import type { Content, Pin, SimState } from '../sim/types';

/** The events of `07` §3. */
export const CALIBRATION_EVENTS = [
  'crewArrived',
  'roadBlocked',
  'shopClosedEarly',
  'rokkoUnderBoat',
  'martiOut',
  'anchor.meeting',
];

/** One event of one seed: its chance in the run, whether the reality had it, whether it is a fog event. */
export interface Pair {
  seed: number;
  event: string;
  p: number;
  hit: boolean;
  fog: boolean;
}

/** The storylets that set each fact (03 §12.2: an effect `fact`, or `factIfPerceivedBy` on an emit). */
function setters(c: Content): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const sl of c.storylets)
    for (const st of Object.values(sl.states))
      for (const e of st.onEnter ?? []) {
        const set =
          'fact' in e ? [e.fact] : 'emit' in e ? Object.values(e.factIfPerceivedBy ?? {}) : [];
        for (const f of set) if (!(out[f] ??= []).includes(sl.id)) out[f].push(sl.id);
      }
  return out;
}

/**
 * The reality (07 §3): a single history in `stream`, except that its weather is drawn as the
 * lantern draws it (branch scope s0:branch), so it shares the world the run made concrete.
 */
function reality(c: Content, pins: readonly Pin[], seed: number, stream: number): SimState {
  const streams = uniformStreams(c, stream);
  const log = sortPins(pins);
  let s = initialState(c, seed, streams);
  while (s.tick < c.world.ticks) {
    const t = s.tick;
    const r = step(c, seed, streams, s, log, (bp) =>
      sample(
        bp.options.map((o) => o.ppm),
        rand(
          seed,
          bp.key.startsWith('weather:') ? 's0:branch' : `s${stream}:branch`,
          t,
          bp.key,
          1_000_000,
        ),
      ),
    );
    if (!r.state) throw new Error('a sampled step cannot stop at a branch point');
    s = r.state;
    const reached = s.anchor.reachedAt;
    if (reached !== null && s.tick > reached + c.tuning.end.afterAnchorTicks) break;
  }
  return s;
}

/** A local cause's top contributor is strong above this share of its chance (per mille; M3-1, M4). */
export const STRONG_SHARE_PM = 200;

/**
 * What deferring links on demand cost in one run (03 §15.3, M3-1): its local causes, those recorded
 * in `wouldLink` (a `heard` caused only in the fog), and how many of those had a strong top contributor.
 */
export interface LocalCauses {
  localCauses: number;
  wouldLink: number;
  strong: number;
}

/** One seed's pairs and its run's local causes. */
export interface SeedRun extends LocalCauses {
  pairs: Pair[];
}

/** `seedRun`'s pairs alone. */
export const seedPairs = (
  c: Content,
  pins: readonly Pin[],
  seed: number,
  events: readonly string[] = CALIBRATION_EVENTS,
): Pair[] => seedRun(c, pins, seed, events).pairs;

/**
 * One seed (07 §3): the whole-day run (Marti live, the other cats in the fog, conditioning off) gives
 * each event's p, 1 000 000 if the lantern holds it, otherwise its chance in the fog just before the
 * protagonists' perception first moved it (M2-26), or at the end; the reality in stream 100000 +
 * seed gives the outcome. A fog event: the lantern does not hold it and no storylet that sets it has a role for
 * Marti or ran live in this run's lantern.
 */
export function seedRun(
  c: Content,
  pins: readonly Pin[],
  seed: number,
  events: readonly string[] = CALIBRATION_EVENTS,
): SeedRun {
  // each event's forecast: its chance in the fog just before the protagonists' perception first
  // moves it by `calibration.observedPpm` (what the ghosts showed before the run learned it, M2-26)
  const chance = (fog: Fog, event: string) =>
    fog.cases.reduce(
      (a, fc) => a + Math.trunc(((fc.q.facts[event] ?? 0) * fc.weight) / WAVE_TOTAL),
      0,
    );
  const before: Record<string, number> = {};
  const forecast: Record<string, number> = {};
  const w = wholeDayRun(
    fogSetup(c, seed),
    pins,
    (x) => {
      for (const event of events) {
        const b = before[event];
        if (b === undefined || forecast[event] !== undefined) continue;
        if (Math.abs(chance(x.fog, event) - b) >= c.tuning.calibration.observedPpm)
          forecast[event] = b;
      }
    },
    (fog) => {
      for (const event of events) before[event] = chance(fog, event);
    },
  );
  const sim = w.lantern.sim;
  const end = reality(c, pins, seed, 100_000 + seed);
  const set = setters(c);
  const pairs = events.map((event) => {
    const held = sim.facts.includes(event);
    const p = held ? 1_000_000 : (forecast[event] ?? chance(w.fog, event));
    const lantern = (set[event] ?? []).some((id) => {
      const run = sim.storylets[id];
      const def = c.storylet[id];
      return (
        (def !== undefined && storyletCats(c, def).includes('marti')) ||
        (run !== undefined && (run.state !== null || run.ended))
      );
    });
    return { seed, event, p, hit: end.facts.includes(event), fog: !held && !lantern };
  });
  return {
    pairs,
    localCauses: w.localCauses,
    wouldLink: w.wouldLink.length,
    strong: w.wouldLink.filter((x) => x.top.ppm * 1000 > x.p * STRONG_SHARE_PM).length,
  };
}

/** The local causes of many runs (M3-1), as one line. */
export function localCausesLine(runs: readonly LocalCauses[]): string {
  const sum = (f: (r: LocalCauses) => number) => runs.reduce((a, r) => a + f(r), 0);
  const withAny = runs.filter((r) => r.localCauses > 0).length;
  return (
    `local causes: ${sum((r) => r.localCauses)} in ${runs.length} runs (${withAny} of them with any); ` +
    `${sum((r) => r.wouldLink)} a link would have explained (a heard from the fog), ` +
    `${sum((r) => r.strong)} with a top contributor above ${STRONG_SHARE_PM / 10}% of its chance; ` +
    `${sum((r) => r.localCauses - r.wouldLink)} with no consistent past`
  );
}

export interface Verdict {
  lines: string[];
  rateMisses: number;
  bucketMisses: number;
  pass: boolean;
}

const pct = (x: number) => `${(x / 10_000).toFixed(1)}%`.padStart(7);

/**
 * The two checks of 07 §3 over every seed's pairs. Rates: each event's mean p against its observed
 * share, within `calibration.tolerancePpm`; decisive only when not `quick`. Buckets: fog events in ten
 * buckets by p; each with at least `calibration.minPerBucket` pairs within the tolerance.
 */
export function judge(c: Content, pairs: readonly Pair[], quick: boolean): Verdict {
  const cal = c.tuning.calibration;
  const events = [...new Set(pairs.map((x) => x.event))];
  const lines = ['rates: event        mean p  observed   diff'];
  let rateMisses = 0;
  for (const event of events) {
    const of = pairs.filter((x) => x.event === event);
    const meanP = Math.trunc(of.reduce((a, x) => a + x.p, 0) / of.length);
    const obs = Math.trunc((of.filter((x) => x.hit).length * 1_000_000) / of.length);
    const ok = Math.abs(meanP - obs) <= cal.tolerancePpm;
    if (!ok) rateMisses++;
    const fogShare = Math.trunc((of.filter((x) => x.fog).length * 100) / of.length);
    lines.push(
      `       ${event.padEnd(17)}${pct(meanP)}  ${pct(obs)}  ${pct(Math.abs(meanP - obs))}  ${ok ? 'ok' : 'MISS'}  (fog event in ${fogShare}% of seeds)`,
    );
  }
  const fogPairs = pairs.filter((x) => x.fog);
  lines.push(
    `buckets (fog events, ${fogPairs.length} pairs): bucket  pairs   mean p  observed   diff`,
  );
  let bucketMisses = 0;
  for (let b = 0; b < 10; b++) {
    const inB = fogPairs.filter((x) => Math.min(9, Math.trunc(x.p / 100_000)) === b);
    if (inB.length === 0) continue;
    const meanP = Math.trunc(inB.reduce((a, x) => a + x.p, 0) / inB.length);
    const obs = Math.trunc((inB.filter((x) => x.hit).length * 1_000_000) / inB.length);
    const diff = Math.abs(meanP - obs);
    const checked = inB.length >= cal.minPerBucket;
    const ok = !checked || diff <= cal.tolerancePpm;
    if (!ok) bucketMisses++;
    lines.push(
      `         ${`${b * 10}-${b * 10 + 10}%`.padEnd(10)}` +
        `${inB.length}`.padStart(5) +
        `  ${pct(meanP)}  ${pct(obs)}  ${pct(diff)}  ${checked ? (ok ? 'ok' : 'MISS') : '(too few)'}` +
        // which events fall in the bucket: pairs (happened)
        `  ${events
          .map((e) => [e, inB.filter((x) => x.event === e)] as const)
          .filter(([, of]) => of.length > 0)
          .map(([e, of]) => `${e} ${of.length}(${of.filter((x) => x.hit).length})`)
          .join(', ')}`,
    );
  }
  const pass = bucketMisses === 0 && (quick || rateMisses === 0);
  lines.push(
    `calibration: ${pass ? 'pass' : 'MISS'} (${bucketMisses} bucket(s), ${rateMisses} rate(s) miss${quick ? '; rates not decisive with --quick' : ''})`,
  );
  return { lines, rateMisses, bucketMisses, pass };
}
