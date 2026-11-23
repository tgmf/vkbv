// Offline seed vetting (04 §2):   npm run vet -- [--count N] [--from S]
// Checks candidate seeds S, S + 1, … (default 1) against the recorded solutions
// (`vetting.solutions`) with the default fog knobs, and writes the first N that pass (default 20) to
// src/content/data/ch1/vetted-seeds.json, from which a new game draws its seed.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { CHAPTER1_FILES, PINSETS_FILE, TUNING_FILE } from '../src/content/chapter1';
import { loadChapter, loadTuning, parsePinSets } from '../src/content/load';
import { checkSeed } from '../src/sim/vet';

const { values } = parseArgs({
  options: { count: { type: 'string', default: '20' }, from: { type: 'string', default: '1' } },
});
const c = loadChapter(CHAPTER1_FILES, loadTuning(TUNING_FILE));
const sets = parsePinSets(PINSETS_FILE, c);
const solutions = c.tuning.vetting.solutions.map((name) => {
  const pins = sets[name];
  if (!pins) throw new Error(`vetting.solutions names an unknown pin set: ${name}`);
  return pins;
});
const count = Number(values.count);
const seeds: number[] = [];
const t0 = performance.now();
for (let seed = Number(values.from); seeds.length < count; seed++) {
  const t = performance.now();
  const v = checkSeed(c, seed, solutions);
  if (v.pass) seeds.push(seed);
  console.log(
    `seed ${seed}: ${v.pass ? 'pass' : 'fail'} (solvable ${v.solvable}, storylets ${v.storylets}) ` +
      `${Math.round(performance.now() - t)} ms`,
  );
}
const file = join(import.meta.dirname, '..', 'src', 'content', 'data', 'ch1', 'vetted-seeds.json');
const note =
  'Written by `npm run vet` (docs/spec/04-player-layer.md §2): seeds that pass vetting with the default fog knobs.';
writeFileSync(file, `${JSON.stringify({ note, seeds }, null, 2)}\n`);
console.log(`${seeds.length} seeds in ${Math.round(performance.now() - t0)} ms → ${file}`);
