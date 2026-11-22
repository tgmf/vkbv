// The lantern inside the fog (03 §13.4, §14, §15.1, §16, §18).
import { describe, expect, it } from 'vitest';
import { readChapterDir } from '../../src/cli/files';
import { loadChapter } from '../../src/content/load';
import { BOREDOM } from '../../src/sim/cats';
import { chance } from '../../src/sim/conditions';
import {
  fogSetup,
  fogStep,
  initialFog,
  lanternReader,
  standIn,
  WAVE_TOTAL,
  type FogSetup,
} from '../../src/sim/fog';
import { hashState } from '../../src/sim/hash';
import { initialState, runHistory } from '../../src/sim/history';
import { advance, drawEvents, initialWave, lanternFray, type Wave } from '../../src/sim/lantern';
import { runEffects } from '../../src/sim/effects';
import type { FogEvent } from '../../src/sim/fog-quantities';
import { sample } from '../../src/sim/math';
import { perceives } from '../../src/sim/perception';
import { rand } from '../../src/sim/rng';
import { catNode, catPos } from '../../src/sim/space';
import { step } from '../../src/sim/step';
import type { Content, Pin } from '../../src/sim/types';
import { cardPin, ch1, ch1Coarse, makeCtx, powerPin, tiny, TINY_DIR, tuning } from './helpers';

const glow = powerPin('glow', 'home.room', 0);

/** Every wave of a run, from tick 0 until `until` or the lantern's fray. */
function run(setup: FogSetup, w0: Wave, pins: Pin[], followed: string[], until: number): Wave[] {
  const out = [w0];
  let w = w0;
  while (w.lantern.sim.tick < until && lanternFray(w) === null) {
    w = advance(setup, w, pins, followed);
    out.push(w);
  }
  return out;
}

/** P(the protagonist sees each fogged cat's chain), over the cases: 0 after negative evidence. */
function seenMass(setup: FogSetup, w: Wave, P: string, id: string): number {
  const { c } = setup;
  let q = 0;
  for (const fc of w.fog.cases) {
    const cat = fc.cats[id];
    for (const e of cat?.chain ?? []) {
      const cs = standIn(setup, id, e.s, cat?.mean ?? {});
      const src = { pos: catPos(c, cs), node: catNode(cs), radiusM: null };
      if (perceives(c, w.lantern.sim, P, src, 'sight'))
        q += Math.trunc((e.p * fc.weight) / WAVE_TOTAL);
    }
  }
  return q;
}

const variant = (more: Partial<typeof tuning>): Content =>
  loadChapter(readChapterDir(TINY_DIR), { ...tuning, ...more });

describe('the lantern with every cat live is single-history mode (03 §13.4)', () => {
  it.each([
    ['tiny', tiny, 120],
    ['Chapter 1', ch1, 340],
  ] as const)(
    '%s: the same states, tick by tick',
    (_name, c, until) => {
      const setup = fogSetup(c, 1);
      const all = c.cats.map((x) => x.id);
      const h = runHistory(c, 1, 0);
      let w = initialWave(setup, all);
      for (let t = 1; t <= Math.min(until, h.states.length - 1); t++) {
        w = advance(setup, w, [], all);
        expect(hashState(w.lantern.sim)).toBe(hashState(h.states[t] ?? w.lantern.sim));
      }
    },
    120_000,
  );
});

describe('the lantern reads the fog (03 §13.3, §14)', () => {
  it('a fog fact as its probability over the cases; what the lantern holds as fact', () => {
    const setup = fogSetup(tiny, 1);
    let fog = initialFog(setup, ['hero']);
    for (let i = 0; i < 3; i++) fog = fogStep(setup, fog, undefined, true, null, [glow]);
    const want = fog.cases.reduce(
      (a, fc) => a + Math.trunc(((fc.q.facts['heroOut'] ?? 0) * fc.weight) / WAVE_TOTAL),
      0,
    );
    expect(want).toBeGreaterThan(0);
    expect(want).toBeLessThan(1_000_000);
    const ctx = makeCtx(tiny, { t: fog.tick });
    ctx.live = ['pal', 'bystander'];
    ctx.fog = lanternReader(setup, fog, fog.tick);
    expect(chance(ctx, { fact: 'heroOut' }, {})).toBe(want);
    ctx.s.facts.push('heroOut');
    expect(chance(ctx, { fact: 'heroOut' }, {})).toBe(1_000_000);
  });
});

describe('pins between lantern and fog (03 §13.6, §14)', () => {
  it('a card on a fogged cat is the fog’s; a place card is the lantern’s, its fogged part the fog’s', () => {
    const setup = fogSetup(tiny, 1);
    const onPal = cardPin('poke', { cat: 'pal' }, 2);
    const onPlace = cardPin('poke', { place: 'street.a' }, 2); // radius 5: the bystander's place
    const ws = run(setup, initialWave(setup, ['hero']), [onPal, onPlace], ['hero'], 5);
    const w = ws[ws.length - 1];
    if (!w) throw new Error('no wave');
    expect(w.lantern.sim.pins[onPal.id]).toBeUndefined();
    expect(w.lantern.sim.pins[onPlace.id]).toBe('fired');
    for (const fc of w.fog.cases) {
      expect(fc.q.pins[onPal.id]).toEqual({ fired: 1_000_000, fizzled: 0 });
      expect(fc.q.pins[onPlace.id]).toEqual({ fired: 1_000_000, fizzled: 0 });
      // pal is still interrupted (10 ticks); the bystander was, for the step (4 ticks): his nap
      // did not tire
      expect(fc.cats['pal']?.chain.every((e) => e.s.interrupt?.action === 'jump')).toBe(true);
      expect(fc.cats['bystander']?.chain.every((e) => e.s.bands[BOREDOM] === 0)).toBe(true);
    }
  });
});

describe('fog events the protagonist perceives (03 §13.4, §15.1)', () => {
  const event = (more: Partial<FogEvent>): FogEvent => ({
    name: 'shout',
    node: 'home.room',
    p: 1_000_000,
    radiusM: 40,
    source: 'pal',
    to: null,
    global: false,
    factIfPerceivedBy: { hero: 'heardShout' },
    hops: 0,
    storylet: 'shift',
    state: 'hz',
    ...more,
  });
  /** The wave at a fog step boundary, with these events as the fog's last-step events. */
  const at = (events: FogEvent[]) => {
    const setup = fogSetup(tiny, 1);
    let w = initialWave(setup, ['hero']);
    while (w.lantern.sim.tick < 5) w = advance(setup, w, [], ['hero']);
    const fog = {
      ...w.fog,
      cases: w.fog.cases.map((fc) => ({ ...fc, q: { ...fc.q, stepEvents: events } })),
    };
    return { setup, w: { ...w, fog } };
  };

  it('a perceivable event is drawn: it happens in the lantern and its held storylet runs live', () => {
    const { setup, w } = at([event({})]); // pal's shout, heard where the hero stands
    const t = w.lantern.sim.tick;
    const d = drawEvents(setup, w.fog, w.lantern.sim, w.lantern.heldStorylets, 'hero', t);
    expect(d.incoming.map((e) => (e.type === 'emit' ? e.name : e.type))).toEqual(['shout']);
    expect(d.live).toEqual([['shift', 'hz']]);
    // next tick the hero hears it and gets its fact
    const next = advance(setup, { ...w, fog: d.fog, incoming: d.incoming }, [], ['hero']);
    expect(next.lantern.sim.facts).toContain('heardShout');
    expect(next.lantern.sim.cats['hero']?.heard).toContain('shout');
  });

  it('a role holder perceives its storylet’s state events wherever it is (03 §4, M1-2)', () => {
    const rite = event({
      name: 'storylet:rite.a',
      node: 'street.c',
      radiusM: null,
      storylet: 'rite',
      state: 'a',
      factIfPerceivedBy: null,
    });
    const { setup, w } = at([rite]);
    const fog = {
      ...w.fog,
      cases: w.fog.cases.map((fc) => ({
        ...fc,
        q: {
          ...fc.q,
          storylets: {
            ...fc.q.storylets,
            rite: { p: { a: 1_000_000 }, roles: { hero: ['hero'] } },
          },
        },
      })),
    };
    const d = drawEvents(
      setup,
      fog,
      w.lantern.sim,
      w.lantern.heldStorylets,
      'hero',
      w.lantern.sim.tick,
    );
    expect(d.live).toEqual([['rite', 'a']]);
    expect(d.incoming).toEqual([]); // a state event is the fog's bookkeeping, not an emitted event
  });

  it('an event out of range is not drawn; one not drawn is negative evidence', () => {
    const far = event({ node: 'street.c', radiusM: 5 }); // 42 m away, a 5 m sound
    const { setup, w } = at([far]);
    const d = drawEvents(
      setup,
      w.fog,
      w.lantern.sim,
      w.lantern.heldStorylets,
      'hero',
      w.lantern.sim.tick,
    );
    expect(d.incoming).toEqual([]);
    expect(d.fog).toBe(w.fog); // nothing perceivable: no evidence at all
    const { setup: s2, w: w2 } = at([event({ p: 1 })]); // perceivable, but almost surely not drawn
    const d2 = drawEvents(
      s2,
      w2.fog,
      w2.lantern.sim,
      w2.lantern.heldStorylets,
      'hero',
      w2.lantern.sim.tick,
    );
    expect(d2.incoming).toEqual([]);
    expect(d2.fog).not.toBe(w2.fog); // the evidence "it did not happen" was applied
  });

  it('a live storylet’s effects on a fogged cat go to the fog, not to its stale lantern copy', () => {
    const ctx = makeCtx(tiny);
    ctx.live = ['hero'];
    ctx.fogFx = [];
    const before = structuredClone(ctx.s.cats['pal']);
    runEffects(ctx, [{ interrupt: ['pal', 'stretch', 10] }], { storylet: 'shift' });
    expect(ctx.s.cats['pal']).toEqual(before);
    expect(ctx.fogFx.map((x) => x.cat)).toEqual(['pal']);
    const setup = fogSetup(tiny, 1);
    const fog = fogStep(setup, initialFog(setup, ['pal']), [], false, ctx.s, [], [], ctx.fogFx);
    // stretch for 10 ticks: two steps, one left after this one
    for (const fc of fog.cases)
      expect(fc.cats['pal']?.chain.every((e) => e.s.interrupt?.action === 'stretch')).toBe(true);
  });
});

describe('placement (03 §15.1)', () => {
  const seeds = [1, 2, 3, 4, 5];

  it('places cats only from states with mass; negative evidence clears what is not seen', () => {
    let placed = 0;
    for (const seed of seeds) {
      const setup = fogSetup(tiny, seed);
      const ws = run(setup, initialWave(setup, ['hero']), [glow], ['hero'], 120);
      for (let i = 1; i < ws.length; i++) {
        const before = ws[i - 1];
        const w = ws[i];
        if (!before || !w) continue;
        expect(w.localCauses).toBe(0);
        // every cat still fogged: the hero sees none of its mass (placed, or ruled out)
        for (const def of tiny.cats)
          if (!w.lantern.live.includes(def.id)) expect(seenMass(setup, w, 'hero', def.id)).toBe(0);
        for (const id of w.lantern.live) {
          if (before.lantern.live.includes(id)) continue;
          placed += 1;
          // placed off a step boundary: its state had mass in the fog before the tick
          if (w.lantern.sim.tick % tiny.tuning.fog.stepTicks === 0) continue;
          const cs = w.lantern.sim.cats[id];
          const had = before.fog.cases.some((fc) =>
            fc.cats[id]?.chain.some((e) => {
              const st = standIn(setup, id, e.s, fc.cats[id]?.mean ?? {});
              return (
                e.p > 0 && st.activity === cs?.activity && st.activityPlace === cs.activityPlace
              );
            }),
          );
          expect(had).toBe(true);
        }
      }
    }
    expect(placed).toBeGreaterThan(0);
  });

  it('the draw does not change when an unrelated pin changes', () => {
    const placements = (pins: Pin[]) => {
      const setup = fogSetup(tiny, 1);
      const ws = run(setup, initialWave(setup, ['hero']), pins, ['hero'], 40);
      return ws.map((w) => [
        w.lantern.sim.tick,
        w.lantern.live.join(','),
        JSON.stringify(w.lantern.sim.cats['bystander']?.pos),
      ]);
    };
    // `mark` sets a flag at street.d that nothing here reads
    expect(placements([glow, cardPin('mark', { place: 'street.d' }, 1)])).toEqual(
      placements([glow]),
    );
  });

  it('a placed cat dwells: no free decision while its dwell lasts', () => {
    const setup = fogSetup(tiny, 1);
    const ws = run(setup, initialWave(setup, ['hero']), [glow], ['hero'], 120);
    let checked = 0;
    for (let i = 1; i < ws.length; i++) {
      const w = ws[i];
      const before = ws[i - 1];
      if (!w || !before) continue;
      for (const id of w.lantern.live) {
        if (before.lantern.live.includes(id)) continue;
        expect(w.lantern.dwell[id]).toBe(tiny.tuning.lantern.dwellTicks);
        const activity = w.lantern.sim.cats[id]?.activity;
        for (let k = 1; k < tiny.tuning.lantern.dwellTicks && ws[i + k]; k++) {
          if (ws[i + k]?.lantern.live.includes(id)) {
            expect(ws[i + k]?.lantern.sim.cats[id]?.activity).toBe(activity);
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('a cat unseen for lantern.releaseAfterTicks returns to the fog at a step boundary', () => {
    const c = variant({ lantern: { ...tuning.lantern, releaseAfterTicks: 4 } });
    let released = 0;
    for (const seed of [1, 3, 4, 5, 8]) {
      const setup = fogSetup(c, seed);
      const ws = run(setup, initialWave(setup, ['hero']), [glow], ['hero'], 120);
      for (let i = 1; i < ws.length; i++) {
        const before = ws[i - 1];
        const w = ws[i];
        if (!before || !w) continue;
        for (const id of before.lantern.live) {
          if (w.lantern.live.includes(id)) continue;
          released += 1;
          expect(w.lantern.sim.tick % c.tuning.fog.stepTicks).toBe(0);
          expect(before.lantern.unseen[id]).toBeGreaterThanOrEqual(4);
          expect(w.fog.cases.every((fc) => fc.cats[id] !== undefined)).toBe(true);
        }
      }
    }
    expect(released).toBeGreaterThan(0);
  });
});

describe('the lantern frays when fraysIf holds in it (03 §16)', () => {
  it('the tiny world: the rite done, the timeline ends there', () => {
    const setup = fogSetup(tiny, 1);
    const ws = run(setup, initialWave(setup, ['hero']), [glow], ['hero'], 120);
    const last = ws[ws.length - 1];
    const fray = last ? lanternFray(last) : null;
    expect(fray).not.toBeNull();
    expect(last?.lantern.sim.tick).toBe((fray ?? 0) + 1);
  });
});

describe('the lantern frays on the fog’s chance of reaching the anchor (03 §16, M2-16)', () => {
  /** The tiny wave at tick 7 (off a fog step boundary) with every case's P(dead) set. */
  const withDead = (dead: number) => {
    const setup = fogSetup(tiny, 1);
    let w = initialWave(setup, ['hero']);
    while (w.lantern.sim.tick < 7) w = advance(setup, w, [], ['hero']);
    const fog = { ...w.fog, cases: w.fog.cases.map((fc) => ({ ...fc, q: { ...fc.q, dead } })) };
    return advance(setup, { ...w, fog }, [], ['hero']);
  };

  it('a likely but unwatched fray does not end the timeline', () => {
    expect(lanternFray(withDead(600_000))).toBeNull();
    expect(lanternFray(withDead(1_000_000 - tiny.tuning.fog.frayBelowPpm))).toBeNull();
  });

  it('it frays once the anchor can be reached with less than fog.frayBelowPpm', () => {
    const w = withDead(1_000_000 - tiny.tuning.fog.frayBelowPpm + 1);
    expect(lanternFray(w)).toBe(w.lantern.sim.tick);
  });
});

describe('B1 live (05 §5.2, 03 §18)', () => {
  it.each([1, 2, 3])(
    'untouched, seed %i: Marti stays in his flat at every tick',
    (seed) => {
      const setup = fogSetup(ch1Coarse, seed);
      let w = initialWave(setup, ['marti']);
      while (w.lantern.sim.tick < ch1Coarse.world.ticks && lanternFray(w) === null) {
        w = advance(setup, w, [], ['marti']);
        const m = w.lantern.sim.cats['marti'];
        const node = m ? catNode(m) : '';
        expect(ch1Coarse.node[node]?.region).toBe('flat');
      }
    },
    120_000,
  );
});

describe('exactness on the tiny world (03 §18; M2 acceptance, many streams)', () => {
  it('one fogged cat, no links, the approximations off: its marginals equal its single histories', () => {
    // The fog's approximations switched off: one-tick steps, exact boredom, bands two units wide,
    // no state floor; nobody followed, so nothing is placed or released.
    const c = variant({
      fog: {
        ...tuning.fog,
        stepTicks: 1,
        bands: 490,
        saturatedBandFrom: 1000,
        minStatePpm: 1,
        boredomWhole: true,
      },
      lantern: { ...tuning.lantern, releaseAfterTicks: 100_000 },
    });
    const setup = fogSetup(c, 1);
    const ticks = [5, 8, 10, 13, 15, 20, 25, 30, 35, 40, 45, 50, 55];
    const key = (activity: string, walking: boolean) => (walking ? `${activity}*` : activity);
    const fogM: Record<number, Record<string, number>> = {};
    let w = initialWave(setup, [], ['hero', 'pal']);
    while (w.lantern.sim.tick < 56) {
      w = advance(setup, w, [], []);
      const t = w.lantern.sim.tick;
      if (!ticks.includes(t)) continue;
      const m: Record<string, number> = (fogM[t] = {});
      for (const fc of w.fog.cases)
        for (const e of fc.cats['bystander']?.chain ?? []) {
          const k = key(e.s.activity, e.s.walk !== null);
          m[k] = (m[k] ?? 0) + Math.trunc((e.p * fc.weight) / WAVE_TOTAL);
        }
    }
    // single histories: the bystander's own stream varies, everything else on stream 0
    const N = 200;
    const refM: Record<number, Record<string, number>> = {};
    for (let k = 1; k <= N; k++) {
      const streams = { hero: 0, pal: 0, bystander: k, world: 0 };
      let s = initialState(c, 1, streams);
      while (s.tick < 56) {
        const t = s.tick;
        const r = step(c, 1, streams, s, [], (bp) =>
          sample(
            bp.options.map((o) => o.ppm),
            rand(1, 's0:branch', t, bp.key, 1_000_000),
          ),
        );
        if (!r.state) throw new Error('branch point');
        s = r.state;
        if (!ticks.includes(s.tick)) continue;
        const b = s.cats['bystander'];
        if (!b) continue;
        const kk = key(b.activity, !('at' in b.pos) || b.route.length > 0);
        const m = (refM[s.tick] ??= {});
        m[kk] = (m[kk] ?? 0) + 1_000_000 / N;
      }
    }
    for (const t of ticks)
      for (const k of new Set([...Object.keys(fogM[t] ?? {}), ...Object.keys(refM[t] ?? {})]))
        expect(Math.abs((fogM[t]?.[k] ?? 0) - (refM[t]?.[k] ?? 0))).toBeLessThanOrEqual(
          c.tuning.fog.exactTolerancePpm,
        );
  }, 120_000);
});
