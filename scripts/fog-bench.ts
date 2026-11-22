// Measures the fog on Chapter 1 (M2 budget, 07 §4).
//   npx tsx scripts/fog-bench.ts [seed]          whole-day projection, every cat fogged
//   npx tsx scripts/fog-bench.ts [seed] --live   Marti live (lantern `step`), the others fogged:
//                                                 the re-run workload; also times 08:00-12:00
//   --pinset <name>                              a pin set of 05 §5.1 (projection only, for now)
// Knob overrides for measuring: FOG=minStatePpm,bands; WHOLE=1 for whole-band boredom
import { CHAPTER1_FILES, TUNING_FILE } from '../src/content/chapter1';
import pinsets from '../src/content/data/pinsets.json';
import { loadChapter, loadTuning, parsePinSets } from '../src/content/load';
import { fogSetup, fogStep, initialFog, type Fog } from '../src/sim/fog';
import { initialState, uniformStreams } from '../src/sim/history';
import { sample } from '../src/sim/math';
import { storyletCats } from '../src/sim/readers';
import { rand } from '../src/sim/rng';
import type { PathMemo } from '../src/sim/space';
import { step } from '../src/sim/step';

const tuning = loadTuning(TUNING_FILE);
const [minState, bands] = (process.env['FOG'] ?? '').split(',').map(Number);
if (minState) tuning.fog.minStatePpm = minState;
if (bands) tuning.fog.bands = bands;
if (process.env['WHOLE'] === '1') tuning.fog.boredomWhole = true; // docs/questions.md M2-7
const c = loadChapter(CHAPTER1_FILES, tuning);
const seed = Number(process.argv[2] ?? 1);
const live = process.argv.includes('--live') ? ['marti'] : [];
const setName = process.argv[process.argv.indexOf('--pinset') + 1];
const pins = process.argv.includes('--pinset')
  ? (parsePinSets(pinsets, c)[setName ?? ''] ?? [])
  : [];
if (pins.length > 0 && live.length > 0)
  throw new Error('--pinset runs a projection only (M2 step 6)');
const K = c.tuning.fog.stepTicks;

const t0 = performance.now();
const setup = fogSetup(c, seed);
const fogged = c.cats.map((x) => x.id).filter((id) => !live.includes(id));
// the fog holds every storylet a fogged cat can take a role in (03 §13.4)
const held = c.storylets
  .filter(
    (sl) =>
      live.length === 0 ||
      storyletCats(c, sl).some((id) => !live.includes(id)) ||
      Object.values(sl.roles).some((r) => 'nearCat' in r),
  )
  .map((sl) => sl.id);
let fog: Fog = initialFog(setup, fogged);
const memo: PathMemo = {};
const streams = uniformStreams(c, 0);
let s = initialState(c, seed, streams, memo);
const t1 = performance.now();

const states = (f: Fog) =>
  f.cases.reduce((a, fc) => a + Object.values(fc.cats).reduce((b, x) => b + x.chain.length, 0), 0);
let maxStates = 0;
let lanternMs = 0;
let windowMs = 0;
const [from, to] = [140, 380]; // 08:00-12:00, the re-run budget case of 07 §4
while (fog.tick < c.world.ticks) {
  const tickStart = performance.now();
  if (live.length > 0) {
    // the lantern: one tick of `step` with the live cats, then the fog catches up
    const t = s.tick;
    const r = step(
      c,
      seed,
      streams,
      s,
      [],
      (bp) =>
        sample(
          bp.options.map((o) => o.ppm),
          rand(seed, 's0:branch', t, bp.key, 1_000_000),
        ),
      memo,
      { live, held },
      setup.decisions,
    );
    if (!r.state) throw new Error('branch point');
    s = r.state;
    lanternMs += performance.now() - tickStart;
    if (fog.tick + K <= s.tick) fog = fogStep(setup, fog, held, false, s);
  } else fog = fogStep(setup, fog, undefined, true, null, pins);
  const now = live.length > 0 ? s.tick : fog.tick;
  if (now > from && now <= to) windowMs += performance.now() - tickStart;
  maxStates = Math.max(maxStates, states(fog));
  if (now % 60 === 0 && (live.length === 0 || fog.tick === now))
    console.log(
      `tick ${now}: cases ${fog.cases.length}, states ${states(fog)}, ${Math.round(performance.now() - t1)} ms`,
    );
}
const total = performance.now() - t1;
const { calls, hits } = setup.decisions;
console.log(
  `${live.length > 0 ? 'Marti live' : 'all fogged'}${setName && pins.length > 0 ? ` (${setName})` : ''}; knobs ${c.tuning.fog.minStatePpm}/${c.tuning.fog.bands}${c.tuning.fog.boredomWhole ? ' whole' : ''}; ` +
    `setup ${Math.round(t1 - t0)} ms; day ${Math.round(total)} ms` +
    (live.length > 0 ? ` (lantern ${Math.round(lanternMs)} ms)` : '') +
    `; 08:00-12:00 ${Math.round(windowMs)} ms = ${Math.round(((to - from) * 1000) / Math.max(1, windowMs))} ticks/s; ` +
    `max states ${maxStates}; decisions ${calls} computed, ${hits} cached (${Math.round((hits * 100) / Math.max(1, calls + hits))}%)`,
);
