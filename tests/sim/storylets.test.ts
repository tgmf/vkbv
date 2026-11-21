// Storylets (03 §9) and detectors (03 §10.4) on the tiny world.
import { describe, expect, it } from 'vitest';
import { siftingPhase } from '../../src/sim/sifting';
import { activate, bindRoles, hasOpenChoice, storyletsPhase } from '../../src/sim/storylets';
import type { BranchPoint } from '../../src/sim/types';
import { cat, makeCtx, place, tiny } from './helpers';

const def = (id: string) => {
  const d = tiny.storylet[id];
  if (!d) throw new Error(id);
  return d;
};

describe('roles', () => {
  it('cat, roleTag, roleTag all, and an optional nearCat that may stay empty', () => {
    const ctx = makeCtx(tiny);
    place(ctx, 'pal', 'street.b');
    place(ctx, 'bystander', 'street.c');
    expect(bindRoles(ctx, def('shift'))).toEqual({
      boss: ['pal'],
      helper: ['bystander'],
      all: ['bystander'],
    });
    place(ctx, 'bystander', 'street.d'); // 28 m from pal: still within 30
    expect(bindRoles(ctx, def('shift'))?.['helper']).toEqual(['bystander']);
    place(ctx, 'pal', 'street.c'); // 25 m
    place(ctx, 'hero', 'home.room');
    place(ctx, 'bystander', 'street.a'); // 40 m
    expect(bindRoles(ctx, def('shift'))?.['helper']).toEqual([]); // nobody within 30 m of pal
  });
});

describe('activation and exits', () => {
  const at = (t: number, pick?: (bp: BranchPoint) => number) => {
    const ctx = makeCtx(tiny, { t, ...(pick ? { pick } : {}) });
    place(ctx, 'pal', 'street.b');
    place(ctx, 'bystander', 'street.a');
    return ctx;
  };

  it('a storylet activates when its trigger holds and does not transition on that tick', () => {
    const ctx = at(4);
    storyletsPhase(ctx);
    expect(ctx.s.storylets['shift']?.state).toBeNull();
    ctx.t = 5;
    storyletsPhase(ctx);
    expect(ctx.s.storylets['shift']).toMatchObject({ state: 'idle', enteredAt: 5 });
    expect(ctx.events).toContainEqual({
      tick: 5,
      type: 'storylet',
      id: 'shift',
      state: 'idle',
      roles: { boss: ['pal'], helper: ['bystander'], all: ['bystander'] },
    });
  });

  it('auto beats hazard beats choice', () => {
    const asked: string[] = [];
    const ctx = at(10, (bp) => (asked.push(bp.key), 0));
    activate(ctx, 'shift');
    ctx.s.facts = ['workDone'];
    storyletsPhase(ctx);
    expect(ctx.s.storylets['shift']?.state).toBe('done'); // auto
    expect(asked).toEqual([]);

    const ctx2 = at(10, (bp) => (asked.push(bp.key), 0)); // helper bound: hazard rate 200
    activate(ctx2, 'shift');
    storyletsPhase(ctx2);
    expect(asked).toEqual(['sl:shift:hazard']);
    expect(ctx2.s.storylets['shift']?.state).toBe('hz');
  });

  it('hazard options carry exact rates; choices happen only on decision ticks, as a softmax with stay', () => {
    let seen: BranchPoint[] = [];
    const record = (k: number) => (bp: BranchPoint) => (seen.push(bp), k);
    const ctx = at(11, record(1)); // stay on the hazard
    activate(ctx, 'shift');
    storyletsPhase(ctx);
    expect(seen.map((b) => b.options)).toEqual([
      [
        { label: 'hz', ppm: 200_000 },
        { label: 'stay', ppm: 800_000 },
      ],
    ]);
    seen = [];
    ctx.t = 15;
    ctx.pick = record(1);
    storyletsPhase(ctx);
    expect(seen.map((b) => b.key)).toEqual(['sl:shift:hazard', 'sl:shift:choice']);
    expect(seen[1]?.options).toEqual([
      { label: 'chosen', ppm: 500_000 },
      { label: 'stay', ppm: 500_000 },
    ]);
  });

  it('the actor of an open choice exit has an open choice (and so makes no free decision)', () => {
    const ctx = at(5);
    expect(hasOpenChoice(ctx, 'pal')).toBe(false);
    activate(ctx, 'shift');
    expect(hasOpenChoice(ctx, 'pal')).toBe(true);
    expect(hasOpenChoice(ctx, 'bystander')).toBe(false);
  });

  it('a terminal state ends the storylet; once: true never re-activates, once: false does', () => {
    const ctx = at(20);
    activate(ctx, 'shift');
    ctx.s.facts = ['workDone'];
    storyletsPhase(ctx);
    expect(ctx.s.storylets['shift']).toMatchObject({ state: 'done', ended: true });
    expect(activate(ctx, 'shift')).toBe(false);
    // rite was triggered by done; it runs a -> b (terminal) and can run again
    storyletsPhase(ctx);
    expect(ctx.s.storylets['rite']).toMatchObject({ state: 'b', ended: true });
    expect(activate(ctx, 'rite')).toBe(true);
    expect(ctx.s.storylets['rite']?.state).toBe('a');
  });

  it('trigger effects ignore the trigger but respect once and running storylets', () => {
    const ctx = at(0); // the meet trigger does not hold
    expect(activate(ctx, 'meet')).toBe(true);
    expect(ctx.s.facts).toContain('anchor.met');
    expect(activate(ctx, 'meet')).toBe(false);
  });

  it('a choice needs its actor standing at a place without an interrupt', () => {
    const asked: string[] = [];
    const ctx = at(15, (bp) => (asked.push(bp.key), 1));
    activate(ctx, 'shift');
    place(ctx, 'bystander', 'street.c'); // no helper bound: no hazard
    ctx.s.storylets['shift'] = {
      state: 'idle',
      enteredAt: 15,
      roles: { boss: ['pal'], helper: [], all: ['bystander'] },
      ended: false,
    };
    cat(ctx, 'pal').interrupt = { action: 'x', left: 2, by: 'y' };
    storyletsPhase(ctx);
    expect(asked).toEqual([]);
  });
});

describe('detectors', () => {
  const tickWith = (ctx: ReturnType<typeof makeCtx>, t: number, rain = false) => {
    ctx.t = t;
    ctx.events = rain
      ? [
          {
            tick: t,
            type: 'emit',
            name: 'rainStarted',
            pos: [0, 0],
            node: 'home.room',
            radiusM: null,
            source: null,
            to: null,
            storylet: null,
            global: true,
            hops: 0,
            factIfPerceivedBy: null,
          },
        ]
      : [];
    siftingPhase(ctx);
  };

  it('an event clause forks a match; a holds clause needs consecutive ticks; completion sets the fact once', () => {
    const ctx = makeCtx(tiny);
    place(ctx, 'pal', 'street.b');
    tickWith(ctx, 60, true);
    expect(ctx.s.pools['soak']).toEqual([{ stage: 1, stageTick: 60, count: 0 }]);
    tickWith(ctx, 61);
    tickWith(ctx, 62);
    expect(ctx.s.facts).not.toContain('soaked');
    tickWith(ctx, 63);
    expect(ctx.s.facts).toContain('soaked');
    expect(ctx.events).toContainEqual({ tick: 63, type: 'detector', id: 'soak' });
    tickWith(ctx, 64, true);
    expect(ctx.s.pools['soak']).toEqual([]); // fires at most once
  });

  it('a holds count resets when the condition breaks', () => {
    const ctx = makeCtx(tiny);
    place(ctx, 'pal', 'street.b');
    tickWith(ctx, 60, true);
    tickWith(ctx, 61);
    place(ctx, 'pal', 'home.door');
    tickWith(ctx, 62);
    expect(ctx.s.pools['soak']).toEqual([{ stage: 1, stageTick: 60, count: 0 }]);
  });

  it('withinTicks drops a match that waited too long; unless kills it inside its stages', () => {
    const ctx = makeCtx(tiny);
    place(ctx, 'pal', 'home.door');
    tickWith(ctx, 60, true);
    tickWith(ctx, 71);
    expect(ctx.s.pools['soak']).toEqual([]);

    const ctx2 = makeCtx(tiny);
    place(ctx2, 'pal', 'street.b');
    tickWith(ctx2, 60, true);
    ctx2.t = 61;
    ctx2.events = [{ tick: 61, type: 'fact', fact: 'heroOut' }];
    siftingPhase(ctx2);
    expect(ctx2.s.pools['soak']).toEqual([]);
  });
});
