// Storylet effects (03 §9.3, first table) and pins with every card and power primitive (03 §9.3, §11).
import { describe, expect, it } from 'vitest';
import { gaugeOf } from '../../src/sim/conditions';
import { runEffects } from '../../src/sim/effects';
import { pinsPhase } from '../../src/sim/pins';
import { step } from '../../src/sim/step';
import type { Pin } from '../../src/sim/types';
import { cardPin, cat, makeCtx, place, powerPin, tiny } from './helpers';

describe('storylet effects', () => {
  it('fact, flag (value, ttl, at a cat), counter', () => {
    const ctx = makeCtx(tiny, { t: 10 });
    place(ctx, 'pal', 'street.c');
    runEffects(
      ctx,
      [
        { fact: 'f' },
        { flag: 'a', value: false },
        { flag: 'b', at: 'pal', ttl: 5 },
        { counter: 'work', add: 3 },
      ],
      {},
    );
    expect(ctx.s.facts).toContain('f');
    expect(ctx.s.flags['a']).toEqual({ value: 0, until: null });
    expect(ctx.s.flags['b@street.c']).toEqual({ value: 1, until: 15 });
    expect(ctx.s.counters['work']).toBe(3);
  });

  it('gauge: set and add write base; add with holdTicks adds a mod', () => {
    const ctx = makeCtx(tiny);
    runEffects(
      ctx,
      [
        { gauge: 'hero.itch', add: 50 },
        { gauge: 'hero.boxPull', set: 0 },
        { gauge: 'self.itch', add: 100, holdTicks: 4 },
      ],
      { self: 'hero' },
    );
    const hero = cat(ctx, 'hero');
    expect(hero.base['itch']).toBe(350);
    expect(hero.base['boxPull']).toBe(tiny.hooksFloor); // clamped to the floor
    expect(hero.mods).toEqual([{ gauge: 'itch', add: 100, left: 4, decayPerTick: 0, pin: null }]);
    expect(gaugeOf(ctx, 'hero', 'itch')).toBe(450);
  });

  it('goTo (every cat of a list role), startActivity, stop, interrupt', () => {
    const ctx = makeCtx(tiny);
    place(ctx, 'pal', 'street.b');
    place(ctx, 'bystander', 'street.a');
    const roles = { crew: ['pal', 'bystander'] };
    runEffects(ctx, [{ goTo: ['@crew', 'street.d'], route: 'via', via: ['street.c'] }], { roles });
    expect(cat(ctx, 'pal')).toMatchObject({
      activity: 'goTo',
      control: 'storylet',
      route: ['street.c', 'street.d'],
    });
    expect(cat(ctx, 'bystander').route).toEqual(['street.b', 'street.c', 'street.d']);
    runEffects(ctx, [{ stop: '@crew' }], { roles });
    expect(cat(ctx, 'pal')).toMatchObject({
      activity: 'none',
      control: 'free',
      route: [],
    });
    runEffects(ctx, [{ startActivity: ['pal', 'nap'] }, { interrupt: ['pal', 'stretch', 3] }], {
      storylet: 'shift',
    });
    expect(cat(ctx, 'pal')).toMatchObject({
      activity: 'nap',
      control: 'storylet',
      interrupt: { action: 'stretch', left: 3, by: 'shift' },
    });
  });

  it('emit: at a place, from a cat, to a cat, or from the storylet origin', () => {
    const ctx = makeCtx(tiny);
    place(ctx, 'pal', 'street.b');
    runEffects(
      ctx,
      [
        { emit: 'a', at: 'street.c' },
        { emit: 'b', from: 'pal', radiusM: 9, factIfPerceivedBy: { hero: 'x' } },
        { emit: 'c' },
      ],
      {
        origin: 'pal',
        storylet: 'shift',
      },
    );
    const emits = ctx.events.filter((e) => e.type === 'emit');
    expect(emits.map((e) => [e.name, e.node, e.radiusM, e.source])).toEqual([
      ['a', 'street.c', null, 'pal'],
      ['b', 'street.b', 9, 'pal'],
      ['c', 'street.b', null, 'pal'],
    ]);
    expect(emits[1]).toMatchObject({ storylet: 'shift', factIfPerceivedBy: { hero: 'x' } });
  });

  it('trigger activates a storylet; chance applies with its probability', () => {
    const ctx = makeCtx(tiny);
    runEffects(
      ctx,
      [{ trigger: 'rite' }, { chance: 0, fact: 'never' }, { chance: 1000, fact: 'always' }],
      {},
    );
    expect(ctx.s.storylets['rite']?.state).toBe('a');
    expect(ctx.s.facts).toEqual(['always']);
    expect(ctx.chanceN).toBe(2);
  });
});

/** Fires pins at tick t on a fresh context and returns it. */
function firePins(pins: Pin[], t = 0, setup?: (ctx: ReturnType<typeof makeCtx>) => void) {
  const ctx = makeCtx(tiny, { t, pins });
  setup?.(ctx);
  pinsPhase(ctx);
  return ctx;
}

describe('pins and primitives', () => {
  it('willpower: a direct +300 on a cat with willpower 850 adds 45; the same shift reaching it indirectly adds 300', () => {
    const direct = firePins([cardPin('shift', { cat: 'hero' }, 0)]);
    expect(cat(direct, 'hero').base['boxPull']).toBe(145);
    const viaSpecial = firePins([cardPin('shift', { object: 'mat' }, 0, true)]);
    expect(cat(viaSpecial, 'hero').base['boxPull']).toBe(400);
  });

  it('interrupt: direct ticks are reduced too; place interrupts reach every cat in the radius', () => {
    const ctx = firePins(
      [cardPin('poke', { cat: 'hero' }, 0), cardPin('poke', { place: 'street.b' }, 0)],
      0,
      (c) => {
        place(c, 'pal', 'street.b');
        place(c, 'bystander', 'street.a');
      },
    );
    expect(cat(ctx, 'hero').interrupt).toMatchObject({ left: 1 }); // trunc(10 * 0.15)
    expect(cat(ctx, 'pal').interrupt).toMatchObject({ action: 'jump', left: 4 });
    expect(cat(ctx, 'bystander').interrupt).toBeNull(); // 20 m away, radius 5
    expect(cat(ctx, 'hero').mods).toEqual([
      { gauge: 'itch', add: 45, left: 5, decayPerTick: 10, pin: expect.any(String) as string },
    ]);
  });

  it('a hold keeps the longer of two interrupts', () => {
    const ctx = firePins([cardPin('poke', { place: 'street.b' }, 0)], 0, (c) => {
      place(c, 'pal', 'street.b').interrupt = { action: 'nap', left: 9, by: 'x' };
    });
    expect(cat(ctx, 'pal').interrupt).toMatchObject({ action: 'jump', left: 9 });
  });

  it('gaugeShift with holdWhileRunning adds a mod for `ticks`; ifHasGauge skips cats without it', () => {
    const ctx = firePins([cardPin('hold', { cat: 'hero' }, 0), cardPin('poke', { cat: 'pal' }, 0)]);
    expect(cat(ctx, 'hero').mods[0]).toMatchObject({
      gauge: 'itch',
      add: 30,
      left: 20,
      decayPerTick: 0,
    });
    expect(cat(ctx, 'pal').mods).toEqual([]);
  });

  it('attract: a running effect whose offer makes reached cats walk to the place', () => {
    const pin = cardPin('magnet', { place: 'street.c' }, 0);
    const ctx = firePins([pin], 0, (c) => {
      place(c, 'pal', 'street.b');
      place(c, 'bystander', 'street.a');
    });
    expect(ctx.s.effects).toHaveLength(1);
    expect(ctx.s.effects[0]).toMatchObject({
      kind: 'attract',
      place: 'street.c',
      left: 10,
      strength: 5,
    });
    expect(cat(ctx, 'pal').touchedBy).toEqual([pin.id]);
    expect(cat(ctx, 'pal').pressure).toBe(20);
    expect(cat(ctx, 'hero').touchedBy).toEqual([]); // 40+ m away
    // In a full step the reached cats decide at once; with a strong offer they become `attracted`.
    const r = step(
      tiny,
      1,
      ctx.streams,
      { ...makeCtx(tiny).s, cats: ctx.s.cats, tick: 1 },
      [{ ...pin, tick: 1 }],
      () => 0,
    );
    expect(r.state?.cats['pal']?.activity).toBe('attracted'); // 20 m away: reached
    expect(r.state?.cats['pal']?.activityPlace).toBe('street.c');
    expect(r.state?.cats['bystander']?.activity).toBe('none'); // 40 m away: not reached
  });

  it('a power attract reaches only cats its `affects` allows, and its storylet needs the target reached', () => {
    const ctx = firePins([powerPin('glow', 'home.door', 0)], 0, (c) =>
      place(c, 'hero', 'home.room'),
    );
    expect(ctx.s.effects[0]).toMatchObject({
      kind: 'attract',
      affects: { kinds: ['protagonist'] },
    });
    expect(cat(ctx, 'hero').touchedBy).toHaveLength(1);
    expect(cat(ctx, 'hero').pressure).toBe(50);
    expect(ctx.s.storylets['lured']?.state).toBe('tempted');
    const far = firePins([powerPin('glow', 'street.c', 0)]);
    expect(far.s.storylets['lured']?.state).toBeNull();
  });

  it('repel offers a walk out of the radius', () => {
    const pin = cardPin('scare', { place: 'street.b' }, 1);
    const ctx = makeCtx(tiny, { t: 1, pins: [pin] });
    place(ctx, 'pal', 'street.b').base['O'] = 500;
    const r = step(tiny, 1, ctx.streams, ctx.s, [pin], () => 0);
    const pal = r.state?.cats['pal'];
    if (pal?.activity === 'repelled')
      expect(['street.a', 'street.c', 'street.d']).toContain(pal.activityPlace);
    expect(r.state?.effects[0]).toMatchObject({ kind: 'repel', left: 4 });
  });

  it('socialSpread emits a sound; first-time perceivers echo it next tick with one hop less', () => {
    const pin = cardPin('rumour', { place: 'street.b' }, 2);
    const ctx = makeCtx(tiny, { t: 2, pins: [pin] });
    place(ctx, 'pal', 'street.b');
    place(ctx, 'bystander', 'street.a');
    const r1 = step(tiny, 1, ctx.streams, ctx.s, [pin], () => 0);
    expect(r1.events.find((e) => e.type === 'emit')).toMatchObject({
      name: 'rumour',
      hops: 1,
      radiusM: 30,
    });
    expect(r1.state?.cats['pal']?.heard).toContain('rumour');
    // Pal is there; the hero hears it through the open window (27 m >= 25 m); bystander's 10 m hearing is too short.
    expect(r1.state?.echoes.map((e) => e.cat)).toEqual(['hero', 'pal']);
    if (!r1.state) throw new Error('no state');
    const r2 = step(tiny, 1, ctx.streams, r1.state, [pin], () => 0);
    const echoes = r2.events.filter((e) => e.type === 'emit' && e.name === 'rumour');
    expect(echoes.map((e) => (e.type === 'emit' ? [e.source, e.hops] : null))).toEqual([
      ['hero', 0],
      ['pal', 0],
    ]);
    expect(r2.state?.echoes).toEqual([]);
  });

  it('delay forces an activity where the cat stands; move sends it, even from mid-edge', () => {
    const ctx = firePins(
      [cardPin('nap_now', { cat: 'pal' }, 0), cardPin('send', { cat: 'bystander' }, 0)],
      0,
      (c) => {
        place(c, 'pal', 'street.c');
        cat(c, 'bystander').pos = {
          from: 'street.a',
          to: 'street.b',
          edge: 'street.a__street.b',
          left: 1,
          of: 2,
        };
      },
    );
    expect(cat(ctx, 'pal')).toMatchObject({
      activity: 'nap',
      forcedLeft: 6,
      activityPlace: 'street.c',
      control: 'forced',
    });
    expect(cat(ctx, 'bystander')).toMatchObject({
      activity: 'goTo',
      control: 'forced',
      route: ['street.a', 'street.d'],
    });
  });

  it('setFlag scoped to the target place for `ticks`, as a running effect', () => {
    const ctx = firePins([cardPin('mark', { place: 'street.d' }, 3)], 3);
    expect(ctx.s.flags['marked@street.d']).toEqual({ value: 1, until: 13 });
    expect(ctx.s.effects[0]).toMatchObject({
      kind: 'flag',
      place: 'street.d',
      left: 10,
      source: { card: 'mark' },
    });
  });

  it('collapse (Gaze) changes no simulation state', () => {
    const before = makeCtx(tiny).s;
    const ctx = firePins([powerPin('gaze', 'street.b', 0)]);
    expect({ ...ctx.s, pins: {} }).toEqual({ ...before, pins: {} });
  });

  it('special: runs instead of the object branch, only on the source object', () => {
    const ctx = firePins([cardPin('poke', { object: 'bell' }, 0, true)]);
    expect(cat(ctx, 'hero').base['itch']).toBe(900);
    expect(ctx.s.storylets['rite']?.state).toBe('a');
    expect(ctx.events.find((e) => e.type === 'pinFired')).toMatchObject({
      special: true,
      card: 'poke',
    });
  });

  it('invalid pins fizzle with a reason, stay pending, and fire the first tick they are valid', () => {
    const wrong = firePins([cardPin('nap_now', { cat: 'hero' }, 0)]);
    expect(wrong.events).toContainEqual(
      expect.objectContaining({ type: 'fizzle', reason: 'wrongCat' }),
    );
    const noBranch = firePins([cardPin('shift', { place: 'street.a' }, 0)]);
    expect(noBranch.events).toContainEqual(
      expect.objectContaining({ type: 'fizzle', reason: 'noBranch' }),
    );
    const onlyObjects = firePins(
      [cardPin('magnet', { object: 'crate' }, 0)],
      0,
      (c) => (c.s.facts = ['crateShown']),
    );
    expect(onlyObjects.events).toContainEqual(
      expect.objectContaining({ type: 'fizzle', reason: 'noBranch' }),
    );

    const hidden = cardPin('magnet', { object: 'crate' }, 0);
    const ctx = firePins([hidden]);
    expect(ctx.s.pins[hidden.id]).toBe('pending');
    expect(ctx.events).toContainEqual(
      expect.objectContaining({ type: 'fizzle', reason: 'hidden' }),
    );
    const later = makeCtx(tiny, {
      state: { ...ctx.s, tick: 5, facts: ['crateShown'] },
      pins: [hidden],
    });
    pinsPhase(later);
    expect(later.s.pins[hidden.id]).toBe('pending'); // onlyObjects: crate is not the bell
    expect(later.events).toEqual([]); // a pending pin does not fizzle twice
  });
});
