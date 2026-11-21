// Measures one fog projection of the whole day on Chapter 1 (every cat fogged), for the M2 budget.
import { CHAPTER1_FILES, TUNING_FILE } from '../src/content/chapter1';
import { loadChapter, loadTuning } from '../src/content/load';
import { fogSetup, fogStep, initialFog } from '../src/sim/fog';

const tuning = loadTuning(TUNING_FILE);
// Knob overrides for measuring: FOG=minStatePpm,bands
const [minState, bands] = (process.env['FOG'] ?? '').split(',').map(Number);
if (minState) tuning.fog.minStatePpm = minState;
if (bands) tuning.fog.bands = bands;
const c = loadChapter(CHAPTER1_FILES, tuning);
const seed = Number(process.argv[2] ?? 1);
const t0 = performance.now();
const setup = fogSetup(c, seed);
let fog = initialFog(
  setup,
  c.cats.map((x) => x.id),
);
const t1 = performance.now();
let steps = 0;
let maxStates = 0;
while (fog.tick < c.world.ticks) {
  fog = fogStep(setup, fog);
  steps++;
  const states = fog.cases.reduce(
    (a, fc) => a + Object.values(fc.cats).reduce((b, x) => b + x.chain.length, 0),
    0,
  );
  maxStates = Math.max(maxStates, states);
  if (fog.tick % 60 === 0)
    console.log(
      `tick ${fog.tick}: cases ${fog.cases.length}, states ${states}, ${Math.round(performance.now() - t1)} ms`,
    );
}
const { calls, hits } = setup.decisions;
console.log(
  `setup ${Math.round(t1 - t0)} ms; ${steps} steps in ${Math.round(performance.now() - t1)} ms; max states ${maxStates}; ` +
    `decisions ${calls} computed, ${hits} from the cache (hit rate ${Math.round((hits * 100) / Math.max(1, calls + hits))}%)`,
);
