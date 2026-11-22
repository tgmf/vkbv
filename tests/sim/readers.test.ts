// The readers index, link selection (03 §13.5) and the place perception table (03 §13.6).
import { describe, expect, it } from 'vitest';
import { perceives } from '../../src/sim/perception';
import { buildPerceptionTable, buildReaders, tablePerceives } from '../../src/sim/readers';
import type { Content } from '../../src/sim/types';
import { ch1, freshState, tiny } from './helpers';

describe('readers index', () => {
  it('lists who reads each quantity', () => {
    const r = buildReaders(ch1);
    const kinds = (key: string) => (r.of[key] ?? []).map((x) => `${x.kind}:${x.id}`);
    expect(kinds('fact:crewArrived')).toEqual([
      'activity:work_road',
      'activity:tea_break',
      'world:world',
    ]);
    expect(kinds('fact:martiOut')).toContain('anchor:requirements');
  });

  it('picks the Chapter 1 links: the road race first, then the most reading cats', () => {
    // roadDone: set entering roadworks_day.finished through an auto exit gated on the roadwork
    // counter (a race, one link per counter). crewArrived: 4 cats. martiOut is set only by a
    // storylet that binds Marti, who is never fogged: a lantern fact, never a link. rainStarted is
    // the weather case.
    expect(buildReaders(ch1).links).toEqual([
      { kind: 'fact', fact: 'roadDone' },
      { kind: 'fact', fact: 'crewArrived' },
    ]);
  });

  it('takes at most fog.maxLinks', () => {
    const none = { ...ch1, tuning: { ...ch1.tuning, fog: { ...ch1.tuning.fog, maxLinks: 0 } } };
    expect(buildReaders(none).links).toEqual([]);
  });
});

/** Every cat, pair of places, sense and weather: the table agrees with live perception. */
function agrees(c: Content) {
  const table = buildPerceptionTable(c);
  let checked = 0;
  for (const weather of ['dry', 'rain'] as const)
    for (const cat of c.cats) {
      const s = freshState(c);
      s.weather.now = weather;
      c.nodes.forEach((a, i) => {
        const cs = s.cats[cat.id];
        if (!cs) throw new Error('no cat');
        cs.pos = { at: a.id };
        c.nodes.forEach((b, j) => {
          for (const sense of ['sight', 'hearing'] as const)
            for (const radiusM of [null, 10]) {
              const live = perceives(c, s, cat.id, { pos: b.pos, node: b.id, radiusM }, sense);
              const fog = tablePerceives(table, cat.id, sense, weather, i, j, radiusM);
              if (live !== fog)
                expect.fail(`${cat.id} at ${a.id}, ${sense} ${b.id}, ${weather}, r=${radiusM}`);
              checked++;
            }
        });
      });
    }
  return checked;
}

describe('place perception table', () => {
  it('agrees with perceives on the tiny world', () => {
    expect(agrees(tiny)).toBeGreaterThan(0);
  });
  it('agrees with perceives on Chapter 1', () => {
    expect(agrees(ch1)).toBe(2 * 12 * 28 * 28 * 2 * 2);
  });
});
