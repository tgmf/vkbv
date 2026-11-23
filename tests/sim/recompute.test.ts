// The re-run (03 §17, 04 §6): the frontier limit, the fray and the end, checkpoints, facts past the
// edge, the 03 §18 invariants about re-runs; the whole-day run and the projection from the edge.
import { describe, expect, it } from 'vitest';
import { anchorChance, projectToEnd } from '../../src/sim/backward';
import { fogSetup, type FogSetup } from '../../src/sim/fog';
import { frameOf } from '../../src/sim/frames';
import { canonicalJson, hashState } from '../../src/sim/hash';
import { advance, initialWave, type Wave } from '../../src/sim/lantern';
import { PPM } from '../../src/sim/math';
import { watch } from '../../src/sim/observe';
import {
  editTick,
  projectFrom,
  projectionFog,
  rerun,
  rerunAll,
  wholeDayRun,
  type RerunRequest,
} from '../../src/sim/recompute';
import { hash32 } from '../../src/sim/rng';
import type { Frame, Frontier, Pin, WatchedFact } from '../../src/sim/types';
import { tiny } from './helpers';

const glowAt = (tick: number, id = 'glow'): Pin => ({
  id,
  seq: 1,
  tick,
  kind: 'power',
  power: 'glow',
  place: 'home.room',
});

/** A frontier that never limits: every main storylet seen, the story limit out of reach. */
const open = (setup: FogSetup): Frontier => ({ story: 1000, pastTicks: 0, storylets: setup.main });

const req = (pins: Pin[], frontier: Frontier, watched: WatchedFact[] = []): RerunRequest => ({
  pins,
  watched,
  frontier,
});

/** The hero's watched facts of a run from tick 0, one per tick, until `until` or the fray. */
function factsOf(setup: FogSetup, pins: Pin[], until: number): WatchedFact[] {
  const facts: WatchedFact[] = [];
  let w = initialWave(setup, ['hero']);
  while (w.fray === null && w.lantern.sim.tick < until) {
    w = advance(setup, w, pins, ['hero']);
    facts.push(watch(setup, w.lantern.sim, w.tickEvents, w.lantern.live, 'hero'));
  }
  return facts;
}

const shows = (f: WatchedFact | undefined, storylet: string): boolean =>
  (f?.summary.storylets ?? []).some((k) => k.startsWith(`${storylet}.`));

describe('the re-run stops at the frontier limit (04 §6)', () => {
  it('just before a never-watched main storylet would reach the hero', () => {
    const setup = fogSetup(tiny, 1);
    const pins = [glowAt(10)];
    const r = rerunAll(setup, null, req(pins, { story: 1000, pastTicks: 0, storylets: [] }));
    const facts = factsOf(setup, pins, 60);
    const first = facts.findIndex((f) => shows(f, 'lured'));
    expect(first).toBeGreaterThan(0);
    expect(r.result.end).toEqual({ kind: 'limit', tick: first - 1 });
    expect(r.result.edge).toBe(first - 1);
    expect(r.result.frames.length).toBe(first); // ticks 0..edge, nothing past it
    // once watched, the same storylet does not stop it
    const seen = rerunAll(
      setup,
      null,
      req(pins, { story: 1000, pastTicks: 0, storylets: ['lured'] }),
    );
    expect(seen.result.edge).toBeGreaterThan(first);
  });

  it('just before progress passes the story limit', () => {
    const setup = fogSetup(tiny, 1);
    const pins = [glowAt(0)];
    const all = rerunAll(setup, null, req(pins, open(setup))).result.frames;
    const over = all.findIndex((f) => f.progress > 0);
    expect(over).toBeGreaterThan(0);
    const r = rerunAll(
      setup,
      null,
      req(pins, { story: 0, pastTicks: 10_000, storylets: setup.main }),
    );
    expect(r.result.end).toEqual({ kind: 'limit', tick: over - 1 });
  });

  it('pastTicks ticks after reach', () => {
    const setup = fogSetup(tiny, 1);
    const pins = [glowAt(0)];
    const all = rerunAll(setup, null, req(pins, open(setup))).result.frames;
    const reach = all.findIndex((f) => f.progress >= 50);
    expect(reach).toBeGreaterThan(0);
    // the story limit holds over the stretch (no new progress before reach + 7)
    expect(all.slice(reach, reach + 8).every((f) => f.progress === 50)).toBe(true);
    const r = rerunAll(setup, null, req(pins, { story: 50, pastTicks: 7, storylets: setup.main }));
    expect(r.result.end).toEqual({ kind: 'limit', tick: reach + 7 });
  });

  it('a new game: story 0, pastTicks 0 gives the edge at 0', () => {
    const setup = fogSetup(tiny, 1);
    const r = rerunAll(setup, null, req([], { story: 0, pastTicks: 0, storylets: [] }));
    expect(r.result.edge).toBe(0);
    expect(r.result.frames.length).toBe(1);
  });

  it('a side storylet the hero perceives does not stop it', () => {
    const setup = fogSetup(tiny, 1);
    const pins = [glowAt(0)];
    const facts = factsOf(setup, pins, 120);
    const side = facts.findIndex((f) => shows(f, 'shift'));
    expect(side).toBeGreaterThan(0);
    const r = rerunAll(setup, null, req(pins, open(setup)));
    expect(r.result.edge).toBeGreaterThan(side);
  });
});

describe('the re-run never passes the fray or the chapter’s end (03 §16, §17)', () => {
  it('ends at the fray when the story limit is never reached', () => {
    for (const seed of [1, 2, 3]) {
      const setup = fogSetup(tiny, seed);
      // the hero lured, the rite done: frays (03 §16); no frontier limit holds it back
      const frayed = rerunAll(setup, null, req([glowAt(0)], { ...open(setup), pastTicks: 0 }));
      expect(frayed.result.end.kind).toBe('fray');
      expect(frayed.result.edge).toBe(frayed.result.end.tick);
      expect(frayed.result.frames.length).toBe(frayed.result.edge + 1);
      expect(frayed.edgeWave.lantern.sim.tick).toBe(frayed.result.edge);
    }
    // seed 3 untouched: the rite never happens, the chapter's last tick without the anchor
    const setup = fogSetup(tiny, 3);
    const r = rerunAll(setup, null, req([], open(setup)));
    expect(r.result.end).toEqual({ kind: 'fray', tick: tiny.world.ticks });
    expect(r.result.frames.length).toBe(tiny.world.ticks + 1);
  });
});

// --- properties over random pin sets ----------------------------------------------------------------

const NODES = ['home.room', 'home.door', 'street.a', 'street.b', 'street.c', 'street.d'];
const TEMPLATES: ((n: (k: number) => number, tick: number, id: string) => Pin)[] = [
  (n, tick, id) => ({ ...glowAt(tick, id), place: NODES[n(NODES.length)] ?? 'home.room' }),
  (n, tick, id) => ({
    id,
    seq: 0,
    tick,
    kind: 'card',
    card: ['scare', 'rumour', 'mark', 'magnet', 'poke'][n(5)] ?? 'scare',
    target: { place: NODES[n(NODES.length)] ?? 'street.a' },
    special: false,
  }),
  (n, tick, id) => ({
    id,
    seq: 0,
    tick,
    kind: 'card',
    card: ['hold', 'send', 'poke', 'shift', 'nap_now'][n(5)] ?? 'hold',
    target: { cat: ['hero', 'pal', 'bystander'][n(3)] ?? 'pal' },
    special: false,
  }),
  (n, tick, id) => ({
    id,
    seq: 0,
    tick,
    kind: 'card',
    card: 'magnet',
    target: { object: ['bell', 'crate', 'mat'][n(3)] ?? 'crate' },
    special: false,
  }),
];

/** A pin set from a number: 1 to 3 pins at ticks 0..59, ordered by tick, with sequence numbers. */
function randomPins(set: number): Pin[] {
  let draws = 0;
  const n = (k: number) => hash32(`pins|${set}|${draws++}`) % k;
  const count = 1 + n(3);
  const pins: Pin[] = [];
  for (let i = 0; i < count; i++) {
    const make = TEMPLATES[n(TEMPLATES.length)];
    if (make) pins.push(make(n, n(60), `r${set}.${i}`));
  }
  return pins
    .sort((a, b) => a.tick - b.tick || (a.id < b.id ? -1 : 1))
    .map((p, i) => ({ ...p, seq: i + 1 }));
}

describe('re-run properties (20 random pin sets)', () => {
  it('a re-run from a checkpoint gives byte-identical results to one from tick 0', () => {
    let replayed = 0;
    for (let set = 1; set <= 20; set++) {
      const setup = fogSetup(tiny, 1 + (set % 3));
      const pins = randomPins(set);
      const last = pins[pins.length - 1];
      if (!last) throw new Error('no pin');
      const base = pins.slice(0, -1);
      const full = rerunAll(setup, null, req(pins, open(setup)));
      const before = rerunAll(setup, null, req(base, open(setup)));
      expect(editTick(before, setup.seed, pins, [])).toBe(Math.min(last.tick, before.result.edge));
      const edited = rerunAll(setup, before, req(pins, open(setup)));
      expect(canonicalJson(edited.result)).toBe(canonicalJson(full.result));
      expect(canonicalJson(edited.edgeWave)).toBe(canonicalJson(full.edgeWave));
      expect(canonicalJson(edited.checkpoints)).toBe(canonicalJson(full.checkpoints));
      if (last.tick >= tiny.tuning.waves.checkpointEvery) replayed += 1;
    }
    expect(replayed).toBeGreaterThan(0); // some edits really started from a later checkpoint
  }, 30_000);

  it('a re-run in one go gives the same lantern as one advanced a tick at a time', () => {
    let extended = 0;
    for (let set = 1; set <= 20; set++) {
      const setup = fogSetup(tiny, 1 + (set % 3));
      const pins = randomPins(set);
      const near = rerunAll(
        setup,
        null,
        req(pins, { story: 0, pastTicks: 10, storylets: setup.main }),
      );
      const far = rerunAll(
        setup,
        null,
        req(pins, { story: 0, pastTicks: 40, storylets: setup.main }),
      );
      const from = near.result.edge;
      const to = far.result.edge;
      expect(to).toBeGreaterThanOrEqual(from);
      // tick by tick from the shorter re-run's edge, as live playback would
      let w: Wave = near.edgeWave;
      while (w.lantern.sim.tick < to) {
        const next = advance(setup, w, pins, ['hero']);
        expect(frameOf(setup, w, next)).toEqual(far.result.frames[w.lantern.sim.tick]);
        w = next;
      }
      expect(hashState(w.lantern.sim)).toBe(hashState(far.edgeWave.lantern.sim));
      expect(canonicalJson(w.fog)).toBe(canonicalJson(far.edgeWave.fog));
      expect(far.result.frames.slice(0, from + 1)).toEqual(near.result.frames);
      if (to > from) extended += 1;
    }
    expect(extended).toBeGreaterThan(0);
  }, 30_000);
});

// --- 03 §18 -------------------------------------------------------------------------------------------

describe('re-run invariants (03 §18)', () => {
  it('same seed, pins, watched facts and frontier give identical results', () => {
    const pins = randomPins(7);
    const a = rerunAll(fogSetup(tiny, 2), null, req(pins, open(fogSetup(tiny, 2))));
    const b = rerunAll(fogSetup(tiny, 2), null, req(pins, open(fogSetup(tiny, 2))));
    expect(canonicalJson(b.result)).toBe(canonicalJson(a.result));
    expect(JSON.parse(JSON.stringify(a.result))).toEqual(a.result);
  });

  it('streams one frame per tick from the replayed checkpoint to the edge, in order', () => {
    const setup = fogSetup(tiny, 1);
    const pins = [glowAt(0)];
    const before = rerunAll(setup, null, req([], open(setup)));
    const it = rerun(setup, before, req(pins, open(setup)));
    const streamed: { tick: number; frame: Frame }[] = [];
    let r = it.next();
    while (!r.done) {
      streamed.push(r.value);
      r = it.next();
    }
    const ticks = streamed.map((x) => x.tick);
    expect(ticks).toEqual(ticks.map((_, i) => i)); // the edit is at 0: everything streams
    expect(streamed.map((x) => x.frame)).toEqual(r.value.result.frames);
  });

  it('adding a pin at t leaves every frame before t unchanged', () => {
    for (let set = 1; set <= 10; set++) {
      const setup = fogSetup(tiny, 1 + (set % 3));
      const pins = randomPins(set);
      const last = pins[pins.length - 1];
      if (!last) throw new Error('no pin');
      const a = rerunAll(setup, null, req(pins.slice(0, -1), open(setup))).result.frames;
      const b = rerunAll(setup, null, req(pins, open(setup))).result.frames;
      const t = Math.min(last.tick, a.length, b.length);
      expect(b.slice(0, t)).toEqual(a.slice(0, t));
    }
  });

  it('a pin invalid in every state leaves the wave as it was, apart from its fizzle', () => {
    const setup = fogSetup(tiny, 1);
    // nap_now is bound to pal: on the hero it is wrongCat everywhere; scare has no cat branch
    const invalid: Pin[] = [
      {
        id: 'x1',
        seq: 5,
        tick: 12,
        kind: 'card',
        card: 'nap_now',
        target: { cat: 'hero' },
        special: false,
      },
      {
        id: 'x2',
        seq: 6,
        tick: 20,
        kind: 'card',
        card: 'scare',
        target: { cat: 'pal' },
        special: false,
      },
    ];
    const pins = [glowAt(0)];
    const a = rerunAll(setup, null, req(pins, open(setup)));
    const b = rerunAll(setup, null, req([...pins, ...invalid], open(setup)));
    expect(b.result.frames).toEqual(a.result.frames);
    expect(b.result.end).toEqual(a.result.end);
    expect(canonicalJson(b.edgeWave.fog)).toBe(canonicalJson(a.edgeWave.fog));
    const strip = (w: Wave) => ({ ...w.lantern.sim, pins: {} });
    expect(hashState(strip(b.edgeWave))).toBe(hashState(strip(a.edgeWave)));
    const states = b.edgeWave.lantern.sim.pins;
    expect([states['x1'], states['x2']]).toEqual(['pending', 'pending']);
  });
});

describe('watched facts past the new edge (03 §15.5, 04 §4)', () => {
  it('are reopened without a test; paid ones are breaks', () => {
    const setup = fogSetup(tiny, 1);
    const pins = [glowAt(0)];
    const watched = factsOf(setup, pins, 40);
    // the same pins: every fact up to the edge holds; the edge at 20 by pastTicks
    const cut = rerunAll(
      setup,
      null,
      req(pins, { story: 50, pastTicks: 20 - 6, storylets: setup.main }, watched),
    );
    const edge = cut.result.edge;
    expect(edge).toBe(20); // reach is tick 6 on seed 1 (the probe in the frontier tests)
    expect(cut.result.reopened).toEqual(watched.filter((f) => f.tick > edge));
    expect(cut.result.breaks).toEqual([]);
    // a paid fact past the edge is a break
    const paid = watched.map((f) =>
      f.tick === 30 ? { ...f, summary: { ...f.summary, paidBy: { 'x.y': ['p1'] } } } : f,
    );
    const r = rerunAll(
      setup,
      null,
      req(pins, { story: 50, pastTicks: 14, storylets: setup.main }, paid),
    );
    expect(r.result.breaks.map((f) => f.tick)).toEqual([30]);
  });
});

describe('the whole-day run and the projection from the edge (03 §13.1, §14)', () => {
  it('the whole-day run is the re-run with no frontier limit', () => {
    for (const seed of [1, 3]) {
      const setup = fogSetup(tiny, seed);
      const w = wholeDayRun(setup, [glowAt(0)]);
      const r = rerunAll(setup, null, req([glowAt(0)], open(setup)));
      // the whole-day run stops on the wave that holds the fray; the re-run's edge is the fray tick
      expect(r.result.end.kind).toBe('fray');
      expect(w.fray).toBe(r.result.end.tick);
    }
  });

  it('shows every wave and every projected fog to `each`, changing nothing', () => {
    const setup = fogSetup(tiny, 1);
    const pins = [glowAt(0)];
    const ticks: number[] = [];
    const w = wholeDayRun(setup, pins, (x) => ticks.push(x.lantern.sim.tick));
    expect(canonicalJson(w)).toBe(canonicalJson(wholeDayRun(setup, pins)));
    expect(ticks).toEqual(Array.from({ length: w.lantern.sim.tick + 1 }, (_, t) => t));
    const start = projectionFog(setup, initialWave(setup, ['hero']));
    const fogTicks: number[] = [];
    const p = projectToEnd(setup, start, pins, (f) => fogTicks.push(f.tick));
    expect(canonicalJson(p)).toBe(canonicalJson(projectToEnd(setup, start, pins)));
    const k = tiny.tuning.fog.stepTicks;
    expect(fogTicks).toEqual(fogTicks.map((_, i) => start.tick + (i + 1) * k));
    expect(fogTicks.at(-1)).toBe(p.fog.tick);
  });

  it('projects with every live cat a point mass and the lantern’s facts fixed; strain is its P(anchor)', () => {
    const setup = fogSetup(tiny, 1);
    const pins = [glowAt(0)];
    const r = rerunAll(setup, null, {
      ...req(pins, { story: 50, pastTicks: 10, storylets: setup.main }),
      strain: true,
    });
    const w = r.edgeWave;
    expect(w.lantern.sim.facts).toContain('heroOut');
    const proj = projectFrom(setup, w, pins);
    expect(proj.fog.tick).toBeGreaterThanOrEqual(tiny.world.ticks);
    for (const fc of proj.fog.cases) {
      for (const f of w.lantern.sim.facts) expect(fc.q.facts[f]).toBe(PPM);
      for (const id of w.lantern.live) expect(fc.cats[id]).toBeDefined();
    }
    expect(proj.anchor).toBe(anchorChance(setup, proj.fog));
    expect(r.result.stats.strain).toBe(proj.anchor);
    expect(rerunAll(setup, null, req(pins, open(setup))).result.stats.strain).toBeNull();
  });
});
