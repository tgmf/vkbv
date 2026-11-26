// Hysteresis decisions, boredom and the decision cache (03 §8.2, §8.3; M2 item 0).
import { describe, expect, it } from 'vitest';
import { PINSETS_FILE } from '../../src/content/chapter1';
import { parsePinSets } from '../../src/content/load';
import { boredomRate, decide, decisionKey, startActivity } from '../../src/sim/cats';
import { hashState } from '../../src/sim/hash';
import { runHistory } from '../../src/sim/history';
import { step } from '../../src/sim/step';
import { newDecisionMemo, type SimState } from '../../src/sim/types';
import { cardPin, cat, ch1, makeCtx, place, tiny } from './helpers';

/** Ends the tiny world's `shift`, whose open choice otherwise keeps pal (its actor) from deciding. */
const shiftOver = (s: SimState) => {
  s.storylets['shift'] = { state: 'done', enteredAt: 0, roles: {}, ended: true };
};

describe('boredom (03 §8.2)', () => {
  it('rises at max(1, trunc(2000 / (lo + hi))) a tick at the place, caps at 1000, resets on a switch', () => {
    expect(boredomRate(tiny, 'work')).toBe(100); // ticks [10, 10]
    expect(boredomRate(tiny, 'nap')).toBe(200); // ticks [5, 5]
    expect(boredomRate(tiny, 'goTo')).toBe(0); // built-ins do not tire
    let ctx = makeCtx(tiny, { t: 1 });
    const cs = place(ctx, 'pal', 'street.c');
    startActivity(ctx, 'pal', 'work', 'free');
    let s = ctx.s;
    for (let t = 1; t <= 12; t++) {
      const r = step(tiny, 1, ctx.streams, { ...s, tick: t }, [], () => 0);
      if (!r.state) throw new Error('branch point');
      s = r.state;
      const pal = s.cats['pal'];
      if (pal?.activity === 'work') expect(pal.boredom).toBe(Math.min(1000, 100 * t));
    }
    // a switch resets it
    ctx = makeCtx(tiny, { t: 20, state: s });
    const pal = cat(ctx, 'pal');
    pal.activity = 'work';
    pal.boredom = 900;
    ctx.s.facts = ['workDone'];
    decide(ctx, 'pal');
    expect(pal).toMatchObject({ activity: 'nap', boredom: 0 });
    void cs;
  });
});

describe('triggers (03 §8.2)', () => {
  it('without a trigger a cat keeps its activity; a changed key triggers on the next decision tick', () => {
    const ctx = makeCtx(tiny, { t: 0 });
    shiftOver(ctx.s);
    const cs = place(ctx, 'pal', 'street.c');
    cs.activity = 'work';
    cs.activityPlace = 'street.c';
    cs.lastKey = decisionKey(ctx, 'pal');
    // tick 5 is a decision tick, but nothing pal's decision reads changed: no decision runs
    const quiet = step(tiny, 1, ctx.streams, { ...ctx.s, tick: 5 }, [], () => 0);
    expect(quiet.events.some((e) => e.type === 'activity' && e.cat === 'pal')).toBe(false);
    // work's gate reads workDone: setting it changes the key, so pal decides and leaves
    const s = { ...ctx.s, tick: 5, facts: ['workDone'] };
    const r = step(tiny, 1, ctx.streams, s, [], () => 0);
    expect(r.events).toContainEqual({
      tick: 5,
      type: 'activityFinished',
      cat: 'pal',
      activity: 'work',
    });
  });

  it('control handed back by a storylet at full boredom triggers at once, off decision ticks', () => {
    const ctx = makeCtx(tiny, { t: 6 });
    shiftOver(ctx.s);
    place(ctx, 'pal', 'street.c');
    startActivity(ctx, 'pal', 'nap', 'storylet');
    const cs = cat(ctx, 'pal');
    cs.pos = { at: cs.activityPlace ?? 'street.c' };
    cs.route = [];
    cs.boredom = 900; // nap tires at 200 a tick: full this tick
    const r = step(tiny, 1, ctx.streams, { ...ctx.s, tick: 6 }, [], () => 0);
    const pal = r.state?.cats['pal'];
    expect(pal?.control).toBe('free');
    expect(r.events.some((e) => e.type === 'activityFinished' && e.cat === 'pal')).toBe(true);
  });

  it('a delay holds the cat for forcedLeft ticks, then it decides at once', () => {
    const ctx = makeCtx(tiny, { t: 1 });
    place(ctx, 'pal', 'street.c');
    const pin = cardPin('nap_now', { cat: 'pal' }, 1); // delay 6 ticks of nap
    let s = ctx.s;
    let freedAt = -1;
    for (let t = 1; t <= 10 && freedAt < 0; t++) {
      const r = step(tiny, 1, ctx.streams, { ...s, tick: t }, [pin], () => 0);
      if (!r.state) throw new Error('branch point');
      s = r.state;
      if (s.cats['pal']?.control === 'free' && t > 1) freedAt = t;
    }
    expect(freedAt).toBe(6); // forcedLeft 6 counted down on ticks 1..6 (the pin fires in phase 1)
  });
});

describe('the decision cache (03 §8.2, §18)', () => {
  it('results with the cache on and off are byte-identical (seeds 1–20 × the 05 pin sets)', () => {
    const sets = parsePinSets(PINSETS_FILE, ch1);
    let hits = 0;
    let calls = 0;
    for (const pins of Object.values(sets))
      for (let seed = 1; seed <= 20; seed++) {
        const on = newDecisionMemo();
        const a = runHistory(ch1, seed, 0, pins, on);
        const b = runHistory(ch1, seed, 0, pins, newDecisionMemo(true));
        expect(a.end).toEqual(b.end);
        a.states.forEach((st, t) => {
          const other = b.states[t];
          if (!other || hashState(st) !== hashState(other)) expect.fail(`seed ${seed} tick ${t}`);
        });
        hits += on.hits;
        calls += on.calls;
      }
    expect(calls).toBeGreaterThan(0);
    expect(hits + calls).toBeGreaterThan(calls); // the cache is used
  }, 600_000);
});
