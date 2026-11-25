// Calibration (07 §3): each event's chance by the end of a whole-day run against how often it happens
// in the reference simulation (src/cli/calibration.ts).
//   npm run calibrate -- [--seeds N] [--quick] [--pinset NAME] [--jobs J]
//                                    FOG=minStatePpm,bands, WHOLE=1, BYCHAIN=1 to override knobs
// Seeds 1..N (default `calibration.seeds`, `calibration.seedsQuick` with --quick) of each pin set
// (default both of 07 §3: road_both and untouched), split over J child processes (default: the CPU
// count). Rates must pass in the full run and are printed with --quick; buckets must pass in both.
// Each pin set also prints its runs' local causes (03 §15.3, docs/questions.md M3-1).
import { availableParallelism } from 'node:os';
import { parseArgs } from 'node:util';
import {
  judge,
  localCausesLine,
  seedRun,
  type LocalCauses,
  type Pair,
} from '../src/cli/calibration';
import { answerPart, inChildren } from '../src/cli/parallel';
import { CHAPTER1_FILES, PINSETS_FILE, TUNING_FILE } from '../src/content/chapter1';
import { loadChapter, loadTuning, parsePinSets } from '../src/content/load';

const { values } = parseArgs({
  options: {
    seeds: { type: 'string' },
    quick: { type: 'boolean', default: false },
    pinset: { type: 'string' },
    jobs: { type: 'string' },
    part: { type: 'string' }, // internal: the child's work, "set:seed,set:seed,…"
  },
});
const tuning = loadTuning(TUNING_FILE);
const [minState, bands] = (process.env['FOG'] ?? '').split(',').map(Number);
if (minState) tuning.fog.minStatePpm = minState;
if (bands) tuning.fog.bands = bands;
if (process.env['WHOLE'] === '1') tuning.fog.boredomWhole = true; // docs/questions.md M2-7
if (process.env['BYCHAIN'] === '1') tuning.fog.counterByChain = true; // docs/questions.md M2-8
const c = loadChapter(CHAPTER1_FILES, tuning);
const sets = parsePinSets(PINSETS_FILE, c);
const pinsOf = (name: string) => {
  const pins = sets[name];
  if (!pins) throw new Error(`no pin set ${name}`);
  return pins;
};

type Result = { set: string; pairs: Pair[]; local: LocalCauses };

if (values.part !== undefined) {
  // a child: its share of (set, seed) items, sent back to the parent
  answerPart(values.part, (item): Result => {
    const [set = '', seed = ''] = item.split(':');
    const { pairs, ...local } = seedRun(c, pinsOf(set), Number(seed));
    return { set, pairs, local };
  });
} else {
  const cal = c.tuning.calibration;
  const seeds = Number(values.seeds ?? (values.quick ? cal.seedsQuick : cal.seeds));
  const names = values.pinset ? [values.pinset] : ['road_both', 'untouched'];
  names.forEach(pinsOf);
  const jobs = Math.max(1, Number(values.jobs ?? availableParallelism()));
  const items = names.flatMap((set) => Array.from({ length: seeds }, (_, i) => `${set}:${i + 1}`));
  const t0 = performance.now();
  const results = await inChildren<Result>(import.meta.filename, items, jobs);
  let failed = false;
  for (const set of names) {
    const of = results.filter((r) => r.set === set);
    const pairs = of.flatMap((r) => r.pairs).sort((a, b) => a.seed - b.seed);
    const v = judge(c, pairs, values.quick);
    const pct = (x: number) => `${(x / 10_000).toFixed(1)}%`;
    console.log(
      `${set}; whole-day runs (Marti live); knobs ${c.tuning.fog.minStatePpm}/${c.tuning.fog.bands}${c.tuning.fog.boredomWhole ? ' whole' : ''}; ` +
        `${seeds} seeds; tolerance ${pct(cal.tolerancePpm)}, at least ${cal.minPerBucket} pairs a bucket`,
    );
    for (const line of v.lines) console.log(line);
    console.log(localCausesLine(of.map((r) => r.local)));
    failed ||= !v.pass;
  }
  console.error(
    `${items.length} seed runs on ${Math.min(jobs, items.length)} processes: ${Math.round((performance.now() - t0) / 1000)} s`,
  );
  process.exitCode = failed ? 1 : 0;
}
