// Compares the fogged crew with the reference simulation hour by hour (M2-8): the road counter and
// the crew's time by activity, averaged over seeds 1..N (fog: whole-day projection; reference: one
// history per seed in stream 100000 + seed, as in npm run calibrate). FOG=minStatePpm,bands
import { CHAPTER1_FILES, TUNING_FILE } from '../src/content/chapter1';
import { loadChapter, loadTuning } from '../src/content/load';
import { counterOf } from '../src/sim/fog-quantities';
import { fogSetup, fogStep, initialFog, WAVE_TOTAL } from '../src/sim/fog';
import { runHistory } from '../src/sim/history';

const tuning = loadTuning(TUNING_FILE);
const [minState, bands] = (process.env['FOG'] ?? '').split(',').map(Number);
if (minState) tuning.fog.minStatePpm = minState;
if (bands) tuning.fog.bands = bands;
if (process.env['WHOLE'] === '1') tuning.fog.boredomWhole = true;
const c = loadChapter(CHAPTER1_FILES, tuning);
const N = Number(process.argv[2] ?? 20);
const crew = process.env['CAT'] ? [process.env['CAT']] : c.cats.filter((x) => x.roles?.includes('crew')).map((x) => x.id);
const ticks = [60, 120, 180, 240, 300, 330];
const acts = ['work_road', 'tea_break', 'goTo', 'none', 'sit_in_box', 'chat', 'groom', 'other'];
const bucket = (a: string) => (acts.includes(a) ? a : 'other');
type Row = { work: number; acts: Record<string, number> };
const fog: Record<number, Row> = {};
const ref: Record<number, Row> = {};
const row = (r: Record<number, Row>, t: number) => (r[t] ??= { work: 0, acts: {} });
for (let seed = 1; seed <= N; seed++) {
  const setup = fogSetup(c, seed);
  let f = initialFog(setup, c.cats.map((x) => x.id));
  while (f.tick < 330) {
    f = fogStep(setup, f);
    if (!ticks.includes(f.tick)) continue;
    const r = row(fog, f.tick);
    for (const fc of f.cases) {
      const w = fc.weight / WAVE_TOTAL;
      r.work += (counterOf(fc.q, 'roadwork').mean * w) / N;
      for (const id of crew)
        for (const e of fc.cats[id]?.chain ?? []) {
          const a = bucket(e.s.walk ? 'goTo' : e.s.activity);
          r.acts[a] = (r.acts[a] ?? 0) + (e.p / 1e6) * w / (N * crew.length);
        }
    }
  }
  const h = runHistory(c, seed, 100000 + seed);
  for (const t of ticks) {
    const s = h.states[t];
    const r = row(ref, t);
    r.work += (s?.counters['roadwork'] ?? 0) / N;
    for (const id of crew) {
      const cs = s?.cats[id];
      const a = bucket(cs && !('at' in cs.pos) ? 'goTo' : (cs?.activity ?? 'other'));
      r.acts[a] = (r.acts[a] ?? 0) + 1 / (N * crew.length);
    }
  }
}
console.log(`knobs ${c.tuning.fog.minStatePpm}/${c.tuning.fog.bands}, ${N} seeds; crew time in %, fog / reference`);
for (const t of ticks) {
  const f = row(fog, t);
  const r = row(ref, t);
  const cells = acts.map((a) => `${a} ${Math.round((f.acts[a] ?? 0) * 100)}/${Math.round((r.acts[a] ?? 0) * 100)}`);
  console.log(`t${t} road ${Math.round(f.work)}/${Math.round(r.work)} | ${cells.join('  ')}`);
}
