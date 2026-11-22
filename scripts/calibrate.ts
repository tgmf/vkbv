// Calibration (07 §3): the fog's predicted probability of each event against how often it happens
// in the reference simulation, bucket by bucket.
//   npm run calibrate -- [--seeds N] [--quick]       FOG=minStatePpm,bands, WHOLE=1 to override knobs
// For each seed: the whole-day projection (no cat live, conditioning off) gives p for each event;
// one reality, a single history in stream 100000 + seed with the seed's stats, gives the outcome.
// Pin set `untouched` only, until the fog applies pins on fogged targets (M2 step 4).
import { parseArgs } from 'node:util';
import { CHAPTER1_FILES, TUNING_FILE } from '../src/content/chapter1';
import { loadChapter, loadTuning } from '../src/content/load';
import { fogSetup, fogStep, initialFog, WAVE_TOTAL } from '../src/sim/fog';
import { runHistory } from '../src/sim/history';

const { values } = parseArgs({
  options: { seeds: { type: 'string' }, quick: { type: 'boolean' } },
});
const tuning = loadTuning(TUNING_FILE);
const [minState, bands] = (process.env['FOG'] ?? '').split(',').map(Number);
if (minState) tuning.fog.minStatePpm = minState;
if (bands) tuning.fog.bands = bands;
if (process.env['WHOLE'] === '1') tuning.fog.boredomWhole = true; // docs/questions.md M2-7
const c = loadChapter(CHAPTER1_FILES, tuning);
const cal = c.tuning.calibration;
const seeds = Number(values.seeds ?? (values.quick ? cal.seedsQuick : cal.seeds));
const events = [
  'crewArrived',
  'roadBlocked',
  'shopClosedEarly',
  'rokkoUnderBoat',
  'martiOut',
  'anchor.meeting',
];

const pairs: { event: string; p: number; hit: boolean }[] = [];
const t0 = performance.now();
for (let seed = 1; seed <= seeds; seed++) {
  const setup = fogSetup(c, seed);
  let fog = initialFog(
    setup,
    c.cats.map((x) => x.id),
  );
  while (fog.tick < c.world.ticks) fog = fogStep(setup, fog);
  const reality = runHistory(c, seed, 100_000 + seed);
  const end = reality.states[reality.states.length - 1];
  for (const event of events) {
    const p = fog.cases.reduce(
      (a, fc) => a + Math.trunc(((fc.q.facts[event] ?? 0) * fc.weight) / WAVE_TOTAL),
      0,
    );
    pairs.push({ event, p, hit: end?.facts.includes(event) ?? false });
  }
  if (seed % 10 === 0) console.error(`seed ${seed}: ${Math.round(performance.now() - t0)} ms`);
}

const pct = (x: number) => `${(x / 10_000).toFixed(1)}%`.padStart(7);
console.log(
  `knobs ${c.tuning.fog.minStatePpm}/${c.tuning.fog.bands}${c.tuning.fog.boredomWhole ? ' whole' : ''}; ${seeds} seeds, ${pairs.length} pairs; ` +
    `tolerance ${pct(cal.tolerancePpm)}, at least ${cal.minPerBucket} pairs a bucket`,
);
console.log('bucket      pairs   mean p  observed   diff');
let failed = 0;
for (let b = 0; b < 10; b++) {
  const inB = pairs.filter((x) => Math.min(9, Math.trunc(x.p / 100_000)) === b);
  if (inB.length === 0) continue;
  const meanP = Math.trunc(inB.reduce((a, x) => a + x.p, 0) / inB.length);
  const obs = Math.trunc((inB.filter((x) => x.hit).length * 1_000_000) / inB.length);
  const diff = Math.abs(meanP - obs);
  const checked = inB.length >= cal.minPerBucket;
  const ok = !checked || diff <= cal.tolerancePpm;
  if (!ok) failed++;
  console.log(
    `${b * 10}-${b * 10 + 10}%`.padEnd(10) +
      `${inB.length}`.padStart(7) +
      `  ${pct(meanP)}  ${pct(obs)}  ${pct(diff)}  ${checked ? (ok ? 'ok' : 'MISS') : '(too few)'}`,
  );
}
console.log('event              mean p  observed');
for (const event of events) {
  const of = pairs.filter((x) => x.event === event);
  const meanP = Math.trunc(of.reduce((a, x) => a + x.p, 0) / of.length);
  const obs = Math.trunc((of.filter((x) => x.hit).length * 1_000_000) / of.length);
  console.log(`${event.padEnd(17)}${pct(meanP)}  ${pct(obs)}`);
}
console.log(failed === 0 ? 'calibration: pass' : `calibration: ${failed} bucket(s) miss`);
process.exitCode = failed === 0 ? 0 : 1;
