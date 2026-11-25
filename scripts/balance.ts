// `npm run balance` (05 §5.2, M4): B2-B7 measured over seeds 1..N (default 50), each vetted live,
// split over J child processes (default: the CPU count). Prints the table; never fails the build.
//   npm run balance -- [--seeds N] [--jobs J]      FOG=minStatePpm,bands to override the fog knobs
import { availableParallelism } from 'node:os';
import { parseArgs } from 'node:util';
import { balanceSeed, judgeBalance, type SeedBalance } from '../src/cli/balance';
import { answerPart, inChildren } from '../src/cli/parallel';
import { CHAPTER1_FILES, PINSETS_FILE, TUNING_FILE } from '../src/content/chapter1';
import { loadChapter, loadTuning, parsePinSets } from '../src/content/load';

const { values } = parseArgs({
  options: {
    seeds: { type: 'string', default: '50' },
    jobs: { type: 'string' },
    part: { type: 'string' }, // internal: the child's seeds, "1,2,…"
  },
});
const tuning = loadTuning(TUNING_FILE);
const [minState, bands] = (process.env['FOG'] ?? '').split(',').map(Number);
if (minState) tuning.fog.minStatePpm = minState;
if (bands) tuning.fog.bands = bands;
const c = loadChapter(CHAPTER1_FILES, tuning);
const sets = parsePinSets(PINSETS_FILE, c);
const parse = (pins: string[]) => parsePinSets({ sets: { road: pins } }, c)['road'] ?? [];

if (values.part !== undefined) {
  answerPart(values.part, (seed) => balanceSeed(c, sets, parse, Number(seed)));
} else {
  const seeds = Number(values.seeds);
  const jobs = Math.max(1, Number(values.jobs ?? availableParallelism()));
  const t0 = performance.now();
  const runs = (
    await inChildren<SeedBalance>(
      import.meta.filename,
      Array.from({ length: seeds }, (_, i) => `${i + 1}`),
      jobs,
    )
  ).sort((a, b) => a.seed - b.seed);
  console.log(
    `balance (05 §5.2); whole-day runs (Marti live); knobs ${c.tuning.fog.minStatePpm}/${c.tuning.fog.bands}; ` +
      `seeds 1-${seeds}, each vetted live`,
  );
  for (const r of judgeBalance(runs)) {
    console.log(
      `${r.id}  ${r.pass ? 'pass' : 'FAIL'}  ${r.property}: ${r.measured}  (${r.target})`,
    );
    if (r.against.length > 0) console.log(`      against: requested seeds ${r.against.join(', ')}`);
  }
  console.log(`vetted: ${runs.map((r) => `${r.seed}→${r.vetted}`).join(', ')}`);
  console.error(
    `${seeds} seeds on ${Math.min(jobs, seeds)} processes: ${Math.round((performance.now() - t0) / 1000)} s`,
  );
}
