// Prints a hash of the fog every hour of a whole-day projection: an identity check for changes that
// must not move results. `FOG=minStatePpm,bands,ticks npx tsx scripts/fog-hash.ts`
import { CHAPTER1_FILES, TUNING_FILE } from '../src/content/chapter1';
import { loadChapter, loadTuning } from '../src/content/load';
import { fogSetup, fogStep, initialFog } from '../src/sim/fog';
import { hash32 } from '../src/sim/rng';
const tuning = loadTuning(TUNING_FILE);
const [m, b, ticks] = (process.env['FOG'] ?? '20000,2,900').split(',').map(Number);
tuning.fog.minStatePpm = m ?? 20000;
tuning.fog.bands = b ?? 2;
const c = loadChapter(CHAPTER1_FILES, tuning);
const setup = fogSetup(c, 1);
let fog = initialFog(
  setup,
  c.cats.map((x) => x.id),
);
const t0 = performance.now();
const hashes: string[] = [];
while (fog.tick < (ticks ?? 900)) {
  fog = fogStep(setup, fog);
  if (fog.tick % 60 === 0) hashes.push(hash32(JSON.stringify(fog)).toString(16));
}
console.log(hashes.join(' '), `${Math.round(performance.now() - t0)} ms`);
