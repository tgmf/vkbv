// `npm run sim -- --fog` and `--projection` (M2 item 11): the report's blocks and ends, on the tiny world.
import { describe, expect, it } from 'vitest';
import { fogReport } from '../../src/cli/fog-report';
import { projectToEnd } from '../../src/sim/backward';
import { fogSetup } from '../../src/sim/fog';
import { initialWave } from '../../src/sim/lantern';
import { projectionFog, wholeDayRun } from '../../src/sim/recompute';
import { hhmm } from '../../src/sim/space';
import { powerPin, tiny } from '../sim/helpers';

const pins = [powerPin('glow', 'home.room', 0)];
const pct = (ppm: number) => `${(ppm / 10_000).toFixed(1)}%`;
const heads = (lines: string[]) => lines.filter((l) => /^\d\d:\d\d t\d+ /.test(l));
const tickOf = (head: string) => Number(/ t(\d+) /.exec(head)?.[1]);

/** Of `ticks`: the first, the first in every later hour, and `last`. */
const expected = (ticks: number[], last: number) => {
  const hour = (t: number) => hhmm(tiny, t).slice(0, 2);
  const out = ticks.filter((t, i) => i === 0 || hour(t) !== hour(ticks[i - 1] ?? t));
  return out.at(-1) === last ? out : [...out, last];
};

describe('npm run sim -- --fog / --projection (M2 item 11)', () => {
  it('--fog: a block at tick 0, each hour and the end of the whole-day run, then how it ended', () => {
    for (const [seed, strain] of [
      [1, true],
      [2, false],
    ] as const) {
      const lines = fogReport(tiny, seed, pins, 'fog', strain);
      const w = wholeDayRun(fogSetup(tiny, seed), pins);
      const last = w.lantern.sim.tick;
      const all = Array.from({ length: last + 1 }, (_, t) => t);
      expect(heads(lines).map(tickOf)).toEqual(expected(all, last));
      expect(heads(lines)[0]).toMatch(/ live 1 /); // the hero; cats it places join later
      for (const h of heads(lines))
        expect(h).toMatch(
          strain ? / live [1-9]\d* .* strain \d+\.\d%$/ : / live [1-9]\d* .* progress \d+$/,
        );
      expect(lines.filter((l) => l.startsWith('  requirements ')).length).toBe(heads(lines).length);
      const end =
        w.fray !== null
          ? `end: fray at ${hhmm(tiny, w.fray)} (t${w.fray})`
          : `end: anchor at ${hhmm(tiny, w.lantern.sim.anchor.reachedAt ?? 0)}`;
      expect(lines.at(-1)?.startsWith(end)).toBe(true);
    }
  });

  it('--projection: the fog alone from tick 0, nobody live, then P(anchor) and the fray', () => {
    const lines = fogReport(tiny, 1, pins, 'projection');
    const setup = fogSetup(tiny, 1);
    const start = projectionFog(setup, initialWave(setup, ['hero']));
    const fogTicks = [start.tick];
    const p = projectToEnd(setup, start, pins, (f) => fogTicks.push(f.tick));
    expect(heads(lines).map(tickOf)).toEqual(expected(fogTicks, p.fog.tick));
    for (const h of heads(lines))
      expect(h).toMatch(/ live 0 .* alive \d+\.\d% {2}anchor \d+\.\d%$/);
    expect(lines.at(-1)?.startsWith(`end: P(anchor) ${pct(p.anchor)} raw, `)).toBe(true);
  });
});
