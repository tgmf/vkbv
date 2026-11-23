// Calibration (07 §3): each event's chance by the end of a whole-day run against how often it happens
// in the reference simulation.
//   npm run calibrate -- [--seeds N] [--quick] [--pinset NAME]
//                                    FOG=minStatePpm,bands, WHOLE=1 to override knobs
// For each seed: the whole-day run (03 §13.1: Marti live from tick 0, the other cats in the fog,
// conditioning off) gives p for each event: 1 000 000 if the lantern holds it, otherwise its chance in
// the fog; one reality, a single history in stream 100000 + seed with the seed's stats and the
// run's weather (the lantern's draws), gives the outcome. Both run the pin set (default `untouched`).
// Rates: every event, mean p against the observed share; the full run must pass them, --quick prints
// them. Buckets: fog events only (no storylet that sets the event has a role for Marti or ran live in
// that seed's lantern).
import { parseArgs } from 'node:util';
import { CHAPTER1_FILES, TUNING_FILE } from '../src/content/chapter1';
import pinsets from '../src/content/data/pinsets.json';
import { loadChapter, loadTuning, parsePinSets } from '../src/content/load';
import { fogSetup, WAVE_TOTAL } from '../src/sim/fog';
import { initialState, sortPins, uniformStreams } from '../src/sim/history';
import { sample } from '../src/sim/math';
import { rand } from '../src/sim/rng';
import { step } from '../src/sim/step';
import type { SimState } from '../src/sim/types';
import { wholeDayRun } from '../src/sim/recompute';
import { storyletCats } from '../src/sim/readers';

const { values } = parseArgs({
  options: { seeds: { type: 'string' }, quick: { type: 'boolean' }, pinset: { type: 'string' } },
});
const tuning = loadTuning(TUNING_FILE);
const [minState, bands] = (process.env['FOG'] ?? '').split(',').map(Number);
if (minState) tuning.fog.minStatePpm = minState;
if (bands) tuning.fog.bands = bands;
if (process.env['WHOLE'] === '1') tuning.fog.boredomWhole = true; // docs/questions.md M2-7
const c = loadChapter(CHAPTER1_FILES, tuning);
const cal = c.tuning.calibration;
const seeds = Number(values.seeds ?? (values.quick ? cal.seedsQuick : cal.seeds));
const setName = values.pinset ?? 'untouched';
const pins = parsePinSets(pinsets, c)[setName];
if (!pins) throw new Error(`no pin set ${setName}`);
const events = [
  'crewArrived',
  'roadBlocked',
  'shopClosedEarly',
  'rokkoUnderBoat',
  'martiOut',
  'anchor.meeting',
];

// the storylets that set each event (03 §12.2: an effect `fact`, or `factIfPerceivedBy` on an emit)
const setters: Record<string, string[]> = {};
for (const sl of c.storylets)
  for (const st of Object.values(sl.states))
    for (const e of st.onEnter ?? []) {
      const set =
        'fact' in e ? [e.fact] : 'emit' in e ? Object.values(e.factIfPerceivedBy ?? {}) : [];
      for (const f of set) if (!(setters[f] ??= []).includes(sl.id)) setters[f].push(sl.id);
    }

/**
 * The reality (07 §3): a single history in `stream`, except that its weather is drawn as the
 * lantern draws it (branch scope s0:branch), so it shares the world the run made concrete.
 */
function reality(seed: number, stream: number): SimState {
  const streams = uniformStreams(c, stream);
  const log = sortPins(pins ?? []);
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

const pairs: { event: string; p: number; hit: boolean; fog: boolean }[] = [];
const t0 = performance.now();
for (let seed = 1; seed <= seeds; seed++) {
  const w = wholeDayRun(fogSetup(c, seed), pins);
  const sim = w.lantern.sim;
  const end = reality(seed, 100_000 + seed);
  for (const event of events) {
    const held = sim.facts.includes(event);
    const p = held
      ? 1_000_000
      : w.fog.cases.reduce(
          (a, fc) => a + Math.trunc(((fc.q.facts[event] ?? 0) * fc.weight) / WAVE_TOTAL),
          0,
        );
    // a fog event: no storylet that sets it has a role for Marti or ran live in this run's lantern
    const lantern = (setters[event] ?? []).some((id) => {
      const run = sim.storylets[id];
      const def = c.storylet[id];
      return (
        (def !== undefined && storyletCats(c, def).includes('marti')) ||
        (run !== undefined && (run.state !== null || run.ended))
      );
    });
    pairs.push({ event, p, hit: end?.facts.includes(event) ?? false, fog: !held && !lantern });
  }
  if (seed % 10 === 0) console.error(`seed ${seed}: ${Math.round(performance.now() - t0)} ms`);
}

const pct = (x: number) => `${(x / 10_000).toFixed(1)}%`.padStart(7);
console.log(
  `${setName}; whole-day runs (Marti live); knobs ${c.tuning.fog.minStatePpm}/${c.tuning.fog.bands}${c.tuning.fog.boredomWhole ? ' whole' : ''}; ` +
    `${seeds} seeds; tolerance ${pct(cal.tolerancePpm)}, at least ${cal.minPerBucket} pairs a bucket`,
);
console.log('rates: event        mean p  observed   diff');
let rateMisses = 0;
for (const event of events) {
  const of = pairs.filter((x) => x.event === event);
  const meanP = Math.trunc(of.reduce((a, x) => a + x.p, 0) / of.length);
  const obs = Math.trunc((of.filter((x) => x.hit).length * 1_000_000) / of.length);
  const ok = Math.abs(meanP - obs) <= cal.tolerancePpm;
  if (!ok) rateMisses++;
  const fogShare = Math.trunc((of.filter((x) => x.fog).length * 100) / of.length);
  console.log(
    `       ${event.padEnd(17)}${pct(meanP)}  ${pct(obs)}  ${pct(Math.abs(meanP - obs))}  ${ok ? 'ok' : 'MISS'}  (fog event in ${fogShare}% of seeds)`,
  );
}
const fogPairs = pairs.filter((x) => x.fog);
console.log(
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
  console.log(
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
const failed = bucketMisses > 0 || (!values.quick && rateMisses > 0);
console.log(
  `calibration: ${failed ? 'MISS' : 'pass'} (${bucketMisses} bucket(s), ${rateMisses} rate(s) miss${values.quick ? '; rates not decisive with --quick' : ''})`,
);
process.exitCode = failed ? 1 : 0;
