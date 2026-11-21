// Every condition kind (03 §10.1) and score term (03 §10.2), on the tiny world.
import { describe, expect, it } from 'vitest';
import { test as holds, gaugeOf } from '../../src/sim/conditions';
import { hazardRate, primeCount, score, term } from '../../src/sim/scores';
import { cat, makeCtx, place, tiny } from './helpers';

describe('conditions', () => {
  it('all, any, not, fact', () => {
    const ctx = makeCtx(tiny);
    ctx.s.facts = ['a'];
    expect(holds(ctx, { fact: 'a' }, {})).toBe(true);
    expect(holds(ctx, { all: [{ fact: 'a' }, { fact: 'b' }] }, {})).toBe(false);
    expect(holds(ctx, { any: [{ fact: 'a' }, { fact: 'b' }] }, {})).toBe(true);
    expect(holds(ctx, { not: { fact: 'b' } }, {})).toBe(true);
  });

  it('flag: unscoped, scoped to a place, scoped to where a cat stands; 0 does not hold', () => {
    const ctx = makeCtx(tiny);
    ctx.s.flags = {
      x: { value: 1, until: null },
      'y@street.b': { value: 1, until: null },
      z: { value: 0, until: null },
    };
    place(ctx, 'pal', 'street.b');
    expect(holds(ctx, { flag: 'x' }, {})).toBe(true);
    expect(holds(ctx, { flag: 'z' }, {})).toBe(false);
    expect(holds(ctx, { flag: 'y', at: 'street.b' }, {})).toBe(true);
    expect(holds(ctx, { flag: 'y', at: 'pal' }, {})).toBe(true);
    expect(holds(ctx, { flag: 'y', at: 'hero' }, {})).toBe(false);
    expect(holds(ctx, { flag: 'y' }, {})).toBe(false);
  });

  it('gauge comparisons read base plus mods, clamped; a missing gauge reads 0', () => {
    const ctx = makeCtx(tiny);
    cat(ctx, 'hero').mods.push({ gauge: 'itch', add: 250, left: 5, decayPerTick: 0, pin: null });
    expect(gaugeOf(ctx, 'hero', 'itch')).toBe(550);
    expect(holds(ctx, { gauge: 'hero.itch', gte: 550 }, {})).toBe(true);
    expect(holds(ctx, { gauge: 'self.itch', lt: 550 }, { self: 'hero' })).toBe(false);
    expect(holds(ctx, { gauge: '@r.itch', lte: 600 }, { roles: { r: ['hero'] } })).toBe(true);
    expect(holds(ctx, { gauge: 'pal.itch', lte: 0 }, {})).toBe(true);
  });

  it('at: place, tag, region; on an edge a cat counts as at the nearer end', () => {
    const ctx = makeCtx(tiny);
    const cs = place(ctx, 'pal', 'street.b');
    expect(holds(ctx, { at: 'pal', node: 'street.b' }, {})).toBe(true);
    expect(holds(ctx, { at: 'pal', tag: 'box' }, {})).toBe(true);
    expect(holds(ctx, { at: 'pal', region: 'street' }, {})).toBe(true);
    cs.pos = { from: 'street.b', to: 'street.c', edge: 'gate', left: 2, of: 3 };
    expect(holds(ctx, { at: 'pal', node: 'street.b' }, {})).toBe(true);
    cs.pos = { from: 'street.b', to: 'street.c', edge: 'gate', left: 1, of: 3 };
    expect(holds(ctx, { at: 'pal', node: 'street.c' }, {})).toBe(true);
  });

  it('near: two cats, or a cat and a place, in metres', () => {
    const ctx = makeCtx(tiny);
    place(ctx, 'pal', 'street.b');
    place(ctx, 'bystander', 'street.a');
    expect(holds(ctx, { near: ['pal', 'bystander'], m: 20 }, {})).toBe(true);
    expect(holds(ctx, { near: ['pal', 'bystander'], m: 19 }, {})).toBe(false);
    expect(holds(ctx, { near: ['pal', 'street.c'], m: 20 }, {})).toBe(true);
  });

  it('clock windows are inclusive and may wrap past midnight', () => {
    const ctx = makeCtx(tiny, { t: 60 }); // 07:00
    expect(holds(ctx, { clock: ['07:00', '07:00'] }, {})).toBe(true);
    expect(holds(ctx, { clock: ['07:01', '08:00'] }, {})).toBe(false);
    expect(holds(ctx, { clock: ['22:00', '07:00'] }, {})).toBe(true);
  });

  it('weather, state, counter, heard, bound, activity', () => {
    const ctx = makeCtx(tiny);
    expect(holds(ctx, { weather: 'dry' }, {})).toBe(true);
    ctx.s.storylets['shift'] = { state: 'idle', enteredAt: 0, roles: {}, ended: false };
    expect(holds(ctx, { state: ['shift', 'idle'] }, {})).toBe(true);
    ctx.s.counters['work'] = 7;
    expect(holds(ctx, { counter: 'work', gte: 7, lt: 8 }, {})).toBe(true);
    expect(holds(ctx, { counter: 'work', eq: 6 }, {})).toBe(false);
    cat(ctx, 'pal').heard = ['rumour'];
    expect(holds(ctx, { heard: 'rumour', by: 'pal' }, {})).toBe(true);
    expect(holds(ctx, { bound: '@h' }, { roles: { h: [] } })).toBe(false);
    expect(holds(ctx, { bound: '@h' }, { roles: { h: ['pal'] } })).toBe(true);
    cat(ctx, 'pal').activity = 'work';
    expect(holds(ctx, { activity: 'pal', is: 'work' }, {})).toBe(true);
  });

  it('power and pin: a running effect of that source within m metres', () => {
    const ctx = makeCtx(tiny);
    place(ctx, 'hero', 'street.a');
    const effect = {
      id: 'p:0',
      kind: 'attract' as const,
      pin: 'p',
      source: { power: 'glow' },
      place: 'street.b',
      left: 5,
      born: 0,
      radiusM: 10,
      strength: 1,
      scale: null,
      affects: null,
    };
    ctx.s.effects = [effect];
    expect(holds(ctx, { power: 'glow', near: 'hero', m: 20 }, {})).toBe(true);
    expect(holds(ctx, { power: 'glow', near: 'hero', m: 19 }, {})).toBe(false);
    ctx.s.effects = [{ ...effect, kind: 'flag', source: { card: 'mark' } }];
    expect(holds(ctx, { pin: 'mark', near: 'hero', m: 20 }, {})).toBe(true);
    expect(holds(ctx, { power: 'glow', near: 'hero', m: 20 }, {})).toBe(false);
  });

  it('countCats counts cats at tagged places, minus except', () => {
    const ctx = makeCtx(tiny);
    place(ctx, 'pal', 'street.b');
    place(ctx, 'bystander', 'street.a');
    expect(holds(ctx, { countCats: { tag: 'outdoor' }, eq: 2 }, {})).toBe(true);
    expect(holds(ctx, { countCats: { tag: 'outdoor', notTag: 'box' }, eq: 1 }, {})).toBe(true);
    expect(
      holds(ctx, { countCats: { tag: 'outdoor', except: ['pal', 'bystander'] }, eq: 0 }, {}),
    ).toBe(true);
  });

  it('activityFinished and card special hold only on the tick their event happened', () => {
    const ctx = makeCtx(tiny);
    expect(holds(ctx, { activityFinished: ['pal', 'work'] }, {})).toBe(false);
    ctx.events.push({ tick: 0, type: 'activityFinished', cat: 'pal', activity: 'work' });
    expect(holds(ctx, { activityFinished: ['pal', 'work'] }, {})).toBe(true);
    expect(holds(ctx, { card: 'poke', special: true }, {})).toBe(false);
    ctx.events.push({ tick: 0, type: 'pinFired', pin: 'x', special: true, card: 'poke' });
    expect(holds(ctx, { card: 'poke', special: true }, {})).toBe(true);
  });
});

describe('score terms', () => {
  it('base, if, gauge per (truncated, optionally gated), primeCount', () => {
    const ctx = makeCtx(tiny);
    const self = { self: 'hero' };
    expect(term(ctx, { base: 3 }, self)).toBe(3);
    expect(term(ctx, { if: { weather: 'dry' }, add: 2 }, self)).toBe(2);
    expect(term(ctx, { gauge: 'self.itch', per: 200, add: 3 }, self)).toBe(3); // trunc(300 / 200) * 3
    expect(term(ctx, { gauge: 'self.itch', per: 200, add: 3, if: { weather: 'rain' } }, self)).toBe(
      0,
    );
    expect(primeCount(ctx, 'hero')).toBe(0);
    cat(ctx, 'hero').base['itch'] = 500;
    cat(ctx, 'hero').base['fearOfWater'] = 300;
    expect(term(ctx, { primeCount: 'hero', add: 2 }, self)).toBe(4);
    expect(primeCount(ctx, 'pal')).toBe(0); // primes belong to their own cat only
    expect(score(ctx, { base: 1, terms: [{ primeCount: 'hero', add: 2 }] }, self)).toBe(5);
  });

  it('a scale term reads a bare gauge from the offered cat', () => {
    const ctx = makeCtx(tiny);
    expect(term(ctx, { gauge: 'O', per: 500, add: 1 }, {}, 'pal')).toBe(1);
    expect(term(ctx, { gauge: 'O', per: 1000, add: 1 }, {}, 'pal')).toBe(0);
  });

  it('hazard rates add terms and clamp to 0..1000', () => {
    const ctx = makeCtx(tiny);
    expect(hazardRate(ctx, 30, [{ if: { weather: 'dry' }, addPerMille: 40 }], {})).toBe(70);
    expect(hazardRate(ctx, 900, [{ if: { weather: 'dry' }, addPerMille: 400 }], {})).toBe(1000);
    expect(hazardRate(ctx, 0, [{ if: { weather: 'dry' }, addPerMille: -5 }], {})).toBe(0);
  });
});
