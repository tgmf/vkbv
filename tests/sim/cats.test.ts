// Cats (03 §8, §10.3): hooks and mods, voices, place selectors, bodies, free decisions and control.
import { describe, expect, it } from 'vitest';
import { body, decide, goTo, selectPlace, startActivity } from '../../src/sim/cats';
import { gaugeOf } from '../../src/sim/conditions';
import { step } from '../../src/sim/step';
import { cat, makeCtx, place, tiny, types } from './helpers';

describe('hooks and mods', () => {
  it('rise rules apply when their condition holds and perTicks divides the tick', () => {
    const ctx = makeCtx(tiny, { t: 3 });
    place(ctx, 'pal', 'street.b'); // box: boxPull +10 every tick; decay -1 every 3 ticks
    body(ctx, 'pal');
    expect(cat(ctx, 'pal').base['boxPull']).toBe(109);
  });

  it('decay toward initial stops at the initial value', () => {
    const ctx = makeCtx(tiny, { t: 2 });
    const cs = place(ctx, 'hero', 'home.room');
    cs.base['fearOfWater'] = 401;
    body(ctx, 'hero');
    expect(cs.base['fearOfWater']).toBe(400);
    ctx.t = 4;
    body(ctx, 'hero');
    expect(cs.base['fearOfWater']).toBe(400);
  });

  it('a decaying mod shrinks by decayPerTick and is dropped at 0; a held one runs out', () => {
    const ctx = makeCtx(tiny, { t: 1 });
    const cs = place(ctx, 'hero', 'home.room');
    cs.mods = [
      { gauge: 'itch', add: 25, left: 3, decayPerTick: 10, pin: null },
      { gauge: 'boxPull', add: 50, left: 1, decayPerTick: 0, pin: null },
    ];
    body(ctx, 'hero');
    expect(cs.mods).toEqual([{ gauge: 'itch', add: 15, left: 2, decayPerTick: 10, pin: null }]);
    expect(gaugeOf(ctx, 'hero', 'itch')).toBe(315);
  });

  it('a hook voices when it crosses its threshold, once per cooldown', () => {
    const ctx = makeCtx(tiny, { t: 1 });
    place(ctx, 'hero', 'home.room');
    cat(ctx, 'hero').base['itch'] = 400; // over 350, input state still at 300
    body(ctx, 'hero');
    const voice = ctx.events.find((e) => e.type === 'voice');
    expect(voice).toMatchObject({ cat: 'hero', hook: 'itch', radiusM: tiny.tuning.voice.radiusM });
    expect(cat(ctx, 'hero').voiceAt['itch']).toBe(1);
  });
});

describe('place selectors', () => {
  const sel = (id: string, at: Parameters<typeof selectPlace>[2], node: string) => {
    const ctx = makeCtx(tiny);
    place(ctx, id, node);
    return selectPlace(ctx, id, at, 'x');
  };
  it('node, $home and $here', () => {
    expect(sel('pal', { node: 'street.d' }, 'street.b')).toBe('street.d');
    expect(sel('pal', { node: '$home' }, 'street.d')).toBe('street.b');
    expect(sel('pal', { node: '$here' }, 'street.d')).toBe('street.d');
  });
  it('tag: nearest in the current region, counting objects; region names another region', () => {
    expect(sel('pal', { tag: 'box' }, 'street.c')).toBe('street.b');
    expect(sel('hero', { tag: 'box' }, 'home.door')).toBe('home.room'); // the mat object carries box
    expect(sel('hero', { tag: 'shore', region: 'street' }, 'home.room')).toBe('street.c');
    expect(sel('hero', { tag: 'shore' }, 'home.room')).toBeNull(); // not in the home region
  });
  it('anyOf, nearest, flag', () => {
    expect(sel('pal', { anyOf: [{ tag: 'shore' }, { tag: 'sheltered' }] }, 'street.a')).toBe(
      'street.d',
    );
    expect(sel('pal', { nearest: ['shore', 'box'] }, 'street.a')).toBe('street.b');
    const ctx = makeCtx(tiny);
    place(ctx, 'pal', 'street.a');
    ctx.s.flags['boxHere@street.d'] = { value: 1, until: null };
    expect(selectPlace(ctx, 'pal', { flag: 'boxHere' }, 'x')).toBe('street.d');
  });
  it('neighbour and randomNode sample from the matching places', () => {
    expect(['street.b', 'street.d', 'home.door']).toContain(
      sel('pal', { neighbour: true }, 'street.a'),
    );
    expect(['street.b', 'street.d']).toContain(
      sel('pal', { neighbour: true, region: 'street' }, 'street.a'),
    );
    expect(sel('pal', { randomNode: { region: 'street', tag: 'shore' } }, 'street.a')).toBe(
      'street.c',
    );
  });
  it('nearCat: where the nearest other cat within m stands, or nothing', () => {
    const ctx = makeCtx(tiny);
    place(ctx, 'pal', 'street.b');
    place(ctx, 'bystander', 'street.a');
    expect(selectPlace(ctx, 'pal', { nearCat: true, m: 20 }, 'x')).toBe('street.a');
    expect(selectPlace(ctx, 'pal', { nearCat: true, m: 19 }, 'x')).toBeNull();
  });
});

describe('activities and decisions', () => {
  it('an activity walks to its place, runs while effects there and tires; it has no timer', () => {
    let ctx = makeCtx(tiny, { t: 0 });
    place(ctx, 'pal', 'street.b');
    startActivity(ctx, 'pal', 'work', 'free');
    expect(cat(ctx, 'pal')).toMatchObject({ activity: 'work', boredom: 0, route: ['street.c'] });
    let s = ctx.s;
    const finished: number[] = [];
    for (let t = 0; t < 20; t++) {
      ctx = makeCtx(tiny, { state: s, t });
      // keep pal working: no interruptions from storylets or decisions in this test
      ctx.s.storylets['shift'] = { state: 'done', enteredAt: 0, roles: {}, ended: true };
      body(ctx, 'pal');
      if (ctx.events.some((e) => e.type === 'activityFinished' && e.cat === 'pal'))
        finished.push(t);
      s = ctx.s;
    }
    // depart 0, arrive 3, work ticks 4..19; boredom rises 100 a tick (ticks [10, 10]) to its cap
    expect(s.counters['work']).toBe(16);
    expect(s.cats['pal']?.boredom).toBe(1000);
    expect(s.facts).not.toContain('workDone');
    expect(finished).toEqual([]);
  });

  it('hysteresis keeps the current activity unless another beats it by the margin', () => {
    const ctx = makeCtx(tiny, { t: 5 });
    const cs = place(ctx, 'pal', 'street.c');
    cs.activity = 'work';
    cs.activityPlace = 'street.c';
    decide(ctx, 'pal');
    expect(cs.activity).toBe('work'); // nap 0 does not beat work 3 + margin 2
    cs.boredom = 1000; // work 3 − 4 = −1; nap 0 still not above −1 + 2
    decide(ctx, 'pal');
    expect(cs.activity).toBe('work');
    expect(types(ctx)).toEqual([]);
  });

  it('switching away runs onFinish and emits activityFinished ("left that activity")', () => {
    const ctx = makeCtx(tiny, { t: 5 });
    const cs = place(ctx, 'pal', 'street.c');
    cs.activity = 'work';
    cs.activityPlace = 'street.c';
    cs.boredom = 700;
    ctx.s.facts = ['workDone']; // work's gate fails: it no longer counts, any candidate wins
    decide(ctx, 'pal');
    expect(cs).toMatchObject({ activity: 'nap', boredom: 0 });
    expect(ctx.events).toContainEqual({
      tick: 5,
      type: 'activityFinished',
      cat: 'pal',
      activity: 'work',
    });
  });

  it('a storylet-controlled cat makes no free decision; reaching its goTo target frees it', () => {
    const ctx = makeCtx(tiny, { t: 4 });
    const cs = place(ctx, 'bystander', 'street.a');
    goTo(ctx, 'bystander', 'street.b', 'storylet');
    expect(cs.control).toBe('storylet');
    let s = ctx.s;
    for (let t = 5; t <= 7; t++) {
      const r = step(tiny, 1, ctx.streams, { ...s, tick: t }, [], () => 0);
      if (!r.state) throw new Error('unexpected branch point');
      s = r.state;
      const b = s.cats['bystander'];
      if (t < 7) expect(b?.control).toBe('storylet');
      else {
        expect(r.events).toContainEqual({
          tick: 7,
          type: 'activityFinished',
          cat: 'bystander',
          activity: 'goTo',
        });
        expect(b?.activity).not.toBe('goTo'); // free again, and it decided at once
      }
    }
  });

  it('an interrupt holds the cat: no walking, no decisions, until it runs out', () => {
    const ctx = makeCtx(tiny, { t: 1 });
    const cs = place(ctx, 'pal', 'street.b');
    cs.route = ['street.a'];
    cs.interrupt = { action: 'jump', left: 2, by: 'x' };
    body(ctx, 'pal');
    expect(cs.pos).toEqual({ at: 'street.b' });
    body(ctx, 'pal');
    expect(cs.interrupt).toBeNull();
    body(ctx, 'pal');
    expect('from' in cs.pos).toBe(true);
  });
});
