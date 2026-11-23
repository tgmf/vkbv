// The wave hour by hour (M2 item 11): `npm run sim -- --fog` prints a whole-day run (03 §13.1, the
// lantern from tick 0 to the end with no frontier limit), `--projection` the fog alone from tick 0.
// At tick 0, each hour's first tick and the last: cases, live cats, fog states; each requirement item
// and the progress they make; each storylet state with a chance; with `strain`, strain (a projection
// from that tick to the end: slow, minutes on Chapter 1); for the projection, P(alive) and P(anchor)
// so far. Then how it ends.
import type { Requirement } from '../content/schemas/chapter';
import { aliveChance, anchorChance, projectToEnd } from '../sim/backward';
import { fogSetup, type Fog } from '../sim/fog';
import { INACTIVE } from '../sim/fog-quantities';
import { progressOf, requirementChances, requirementItems, storyletChances } from '../sim/frames';
import { initialWave, type LanternState, type Wave } from '../sim/lantern';
import { followedCats } from '../sim/readers';
import { fogStateCount, projectFrom, projectionFog, wholeDayRun } from '../sim/recompute';
import { hhmm } from '../sim/space';
import type { Content, Pin, SimState } from '../sim/types';

const pct = (ppm: number): string => `${(ppm / 10_000).toFixed(1)}%`;

const label = (r: Requirement): string =>
  'fact' in r
    ? r.fact
    : 'all' in r
      ? `all(${r.all.map(label).join(' ')})`
      : `any(${r.any.map(label).join(' | ')})`;

export function fogReport(
  c: Content,
  seed: number,
  pins: readonly Pin[],
  mode: 'fog' | 'projection',
  strain = false,
): string[] {
  const setup = fogSetup(c, seed);
  const items = requirementItems(c);
  const lines: string[] = [];
  let printed: { hour: string; tick: number } | null = null;

  /** The block for one tick, if it is tick 0, an hour's first tick or `last`. */
  const block = (
    tick: number,
    fog: Fog,
    sim: SimState,
    lantern: LanternState | null,
    tail: () => string,
    last = false,
  ) => {
    const hour = hhmm(c, tick).slice(0, 2);
    if (printed && (printed.tick === tick || (printed.hour === hour && !last))) return;
    printed = { hour, tick };
    const req = requirementChances(c, sim, fog);
    lines.push(
      `${hhmm(c, tick)} t${tick}  cases ${fog.cases.length}  live ${lantern?.live.length ?? 0}  ` +
        `states ${fogStateCount(fog)}  progress ${progressOf(c, req)}${tail()}`,
    );
    lines.push(
      `  requirements  ${items.map((r, i) => `${label(r)} ${pct(req[i] ?? 0)}`).join('  ')}`,
    );
    const shown = Object.entries(storyletChances(c, fog, lantern)).flatMap(([id, p]) =>
      Object.entries(p)
        .filter(([st]) => st !== INACTIVE)
        .map(([st, x]) => `${id}.${st} ${pct(x)}`),
    );
    lines.push(`  storylets     ${shown.join('  ') || '-'}`);
  };

  if (mode === 'fog') {
    const lanternBlock = (w: Wave, last = false) =>
      block(
        w.lantern.sim.tick,
        w.fog,
        w.lantern.sim,
        w.lantern,
        () => (strain ? `  strain ${pct(projectFrom(setup, w, pins).anchor)}` : ''),
        last,
      );
    const w = wholeDayRun(setup, pins, (x) => lanternBlock(x));
    lanternBlock(w, true);
    const reached = w.lantern.sim.anchor.reachedAt;
    const end =
      w.fray !== null
        ? `fray at ${hhmm(c, w.fray)} (t${w.fray})`
        : reached !== null
          ? `anchor at ${hhmm(c, reached)} (t${reached})`
          : `chapter end at ${hhmm(c, w.lantern.sim.tick)} (t${w.lantern.sim.tick})`;
    lines.push(`end: ${end}`);
    return lines;
  }

  const fogBlock = (f: Fog, last = false) =>
    block(
      f.tick,
      f,
      setup.base,
      null,
      () => `  alive ${pct(aliveChance(f))}  anchor ${pct(anchorChance(setup, f))}`,
      last,
    );
  const start = projectionFog(setup, initialWave(setup, followedCats(c)));
  fogBlock(start);
  const p = projectToEnd(setup, start, pins, (f) => fogBlock(f));
  fogBlock(p.fog, true);
  const fray = p.fray === null ? 'never' : `${hhmm(c, p.fray)} (t${p.fray})`;
  lines.push(
    `end: P(anchor) ${pct(p.anchor)} raw, ${pct(anchorChance(setup, p.conditioned))} conditioned; frays ${fray}`,
  );
  return lines;
}
