// Paths (03 §3) and perception (03 §4), including the Chapter 1 window checks from the M1 brief.
import { describe, expect, it } from 'vitest';
import { perceives } from '../../src/sim/perception';
import { catPos, nodePos, path, reach } from '../../src/sim/space';
import { step } from '../../src/sim/step';
import { cat, ch1, makeCtx, place, tiny } from './helpers';

describe('paths', () => {
  it('shortest by minutes; ties go to the smaller place-id sequence', () => {
    expect(path(tiny, 'home.room', 'street.c', { avoid: [] })).toEqual([
      'home.door',
      'street.a',
      'street.b',
      'street.c',
    ]);
    // street.a -> street.c: via b (2 + 3) or via d (3 + 4): b wins on minutes
    expect(reach(tiny, 'street.a', []).dist['street.c']).toBe(5);
  });

  it('avoids known closed edges, follows via in order, and edgesTagged with a fallback', () => {
    expect(path(tiny, 'street.a', 'street.c', { avoid: ['gate'] })).toEqual([
      'street.d',
      'street.c',
    ]);
    expect(path(tiny, 'street.b', 'street.c', { avoid: [], via: ['street.d'] })).toEqual([
      'street.a',
      'street.d',
      'street.c',
    ]);
    expect(path(tiny, 'street.a', 'street.c', { avoid: [], edgesTagged: 'lane' })).toEqual([
      'street.d',
      'street.c',
    ]);
    expect(path(tiny, 'home.room', 'street.c', { avoid: [], edgesTagged: 'lane' })).toEqual([
      'home.door',
      'street.a',
      'street.b',
      'street.c',
    ]);
  });

  it('a cat walks up to a closed edge it did not know, emits blocked, learns it and re-plans', () => {
    const ctx = makeCtx(tiny, { t: 1 });
    const cs = place(ctx, 'pal', 'street.b');
    ctx.s.facts = ['gateClosed'];
    cs.route = ['street.c'];
    cs.activity = 'work';
    cs.activityPlace = 'street.c';
    const r = step(tiny, 1, ctx.streams, ctx.s, [], () => 0);
    const next = r.state?.cats['pal'];
    expect(r.events.some((e) => e.type === 'blocked' && e.cat === 'pal' && e.edge === 'gate')).toBe(
      true,
    );
    expect(next?.knowsClosed).toEqual(['gate']);
    // It decided again at once; any new walk to street.c now goes the long way round.
    if (next?.activityPlace === 'street.c') expect(next.route[0]).toBe('street.a');
    expect(path(tiny, 'street.b', 'street.c', { avoid: next?.knowsClosed ?? [] })).toEqual([
      'street.a',
      'street.d',
      'street.c',
    ]);
  });

  it('positions interpolate along an edge in integer metres', () => {
    const ctx = makeCtx(tiny);
    const cs = cat(ctx, 'pal');
    cs.pos = { from: 'street.a', to: 'street.b', edge: 'street.a__street.b', left: 1, of: 3 };
    expect(catPos(tiny, cs)).toEqual([13, 15]); // 0 + trunc(20 * 2 / 3)
  });
});

describe('perception', () => {
  const sound = (node: string, radiusM: number) => ({ pos: nodePos(ch1, node), node, radiusM });

  it('Chapter 1: Marti at the window nook hears the roadworks while dry, not in rain', () => {
    const ctx = makeCtx(ch1);
    place(ctx, 'marti', 'flat.window_nook');
    expect(perceives(ch1, ctx.s, 'marti', sound('town.roadworks', 60), 'hearing')).toBe(true);
    ctx.s.weather.now = 'rain';
    expect(perceives(ch1, ctx.s, 'marti', sound('town.roadworks', 60), 'hearing')).toBe(false);
  });

  it('Chapter 1: from the study he does not hear it, and he never sees town.lane_n from the flat', () => {
    const ctx = makeCtx(ch1);
    place(ctx, 'marti', 'flat.study');
    expect(perceives(ch1, ctx.s, 'marti', sound('town.roadworks', 60), 'hearing')).toBe(false);
    const lane = { pos: nodePos(ch1, 'town.lane_n'), node: 'town.lane_n', radiusM: null };
    for (const room of [
      'flat.study',
      'flat.kitchen',
      'flat.window_nook',
      'flat.hall',
      'flat.door',
    ]) {
      place(ctx, 'marti', room);
      expect(perceives(ch1, ctx.s, 'marti', lane, 'sight')).toBe(false);
    }
  });

  it('within one space, range is the plain distance; a sound radius caps it', () => {
    const ctx = makeCtx(tiny);
    place(ctx, 'pal', 'street.b');
    expect(
      perceives(tiny, ctx.s, 'pal', { pos: [40, 15], node: 'street.c', radiusM: null }, 'sight'),
    ).toBe(true); // 20 m
    expect(
      perceives(tiny, ctx.s, 'pal', { pos: [40, 15], node: 'street.c', radiusM: 19 }, 'hearing'),
    ).toBe(false);
  });

  it('a door passes sound but walls hide sight', () => {
    const ctx = makeCtx(tiny);
    place(ctx, 'hero', 'home.door'); // indoor, door edge to street.a
    const street = { pos: nodePos(tiny, 'street.a'), node: 'street.a', radiusM: null };
    expect(perceives(tiny, ctx.s, 'hero', { ...street, radiusM: 50 }, 'hearing')).toBe(true); // 30 * 0.6 = 18 m >= 10
    expect(perceives(tiny, ctx.s, 'hero', street, 'sight')).toBe(false);
  });
});
