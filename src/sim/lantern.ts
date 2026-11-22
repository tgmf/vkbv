// The lantern (03 §13.4, §14, §15.1): Marti and the cats he perceives, simulated by `step` on one
// concrete state, inside the fog. One tick: the lantern's step (reading the fog), the fog's step when
// a step boundary passes (reading the lantern), then the lantern edge: placement or negative evidence
// for every fogged cat, release of cats unseen for long, storylets moving between fog and lantern.
// Fog events drawn into the lantern (03 §15.1, last paragraph) come with Gaze and imposed facts.
import { applyEvidence } from './backward';
import { bandEdges, BOREDOM } from './cats';
import {
  fogStates,
  fogStep,
  initialFog,
  lanternReader,
  pointMass,
  standIn,
  WAVE_TOTAL,
  type ChainState,
  type Fog,
  type FogSetup,
} from './fog';
import { INACTIVE } from './fog-quantities';
import { sample } from './math';
import { perceives } from './perception';
import { storyletCats } from './readers';
import { rand } from './rng';
import { catNode, catPos } from './space';
import { step } from './step';
import { uniformStreams } from './history';
import type { CatId, CatState, Pin, SimEvent, SimState } from './types';
import { need } from './types';

/**
 * The lantern state (03 §13.4). `unseen` (not in the spec's list) counts the ticks since a
 * protagonist last saw each live cat, for release.
 */
export interface LanternState {
  sim: SimState;
  live: CatId[]; // cast order
  dwell: Record<CatId, number>;
  heldStorylets: string[]; // file order
  unseen: Record<CatId, number>;
}

/** The wave: the lantern inside the fog, and the lantern's events the fog has not perceived yet. */
export interface Wave {
  lantern: LanternState;
  fog: Fog;
  events: SimEvent[];
  localCauses: number;
}

const inCast = (setup: FogSetup, ids: readonly CatId[]): CatId[] =>
  setup.c.cats.map((x) => x.id).filter((id) => ids.includes(id));

/** The cats a storylet binds or could bind; null when a role binds by distance (`nearCat`). */
function roleCats(setup: FogSetup, id: string, sim: SimState): CatId[] | null {
  const def = need(setup.c.storylet, id, 'storylet');
  const run = sim.storylets[id];
  if (run && run.state !== null) return Object.values(run.roles).flat();
  if (Object.values(def.roles).some((r) => 'nearCat' in r)) return null;
  return storyletCats(setup.c, def);
}

/**
 * The wave at tick 0 (03 §13.1): the `live` cats (the followed protagonists, by default) live at
 * their start, every other cat in the fog; storylets that could bind a fogged cat held by the fog.
 */
export function initialWave(setup: FogSetup, followed: readonly CatId[], live = followed): Wave {
  const { c } = setup;
  const liveCats = inCast(setup, live);
  const fog = initialFog(
    setup,
    c.cats.map((x) => x.id).filter((id) => !liveCats.includes(id)),
  );
  // the lantern holds the world's starting flags; the fog adds only what fogged cats set
  for (const fc of fog.cases) fc.q.flags = {};
  const held = c.storylets
    .filter((sl) => {
      // a role bound by distance could bind any cat: held while any cat is fogged
      const cats = roleCats(setup, sl.id, setup.base) ?? c.cats.map((x) => x.id);
      return cats.some((id) => !liveCats.includes(id));
    })
    .map((sl) => sl.id);
  const unseen: Record<CatId, number> = {};
  for (const id of liveCats) unseen[id] = 0;
  return {
    lantern: { sim: setup.base, live: liveCats, dwell: {}, heldStorylets: held, unseen },
    fog,
    events: [],
    localCauses: 0,
  };
}

/**
 * A placed cat (03 §15.1): position and activity from its state; boredom and each banded gauge drawn
 * uniformly within its band, mean-field gauges at their expected value, traits seeded; `heard` where
 * its probability is at least 500 000.
 */
function placedCat(
  setup: FogSetup,
  fog: Fog,
  id: CatId,
  s: ChainState,
  mean: Record<string, number>,
  t: number,
): CatState {
  const { c, seed } = setup;
  const cs = standIn(setup, id, s, mean);
  const within = (g: string, band: number) => {
    const edges = bandEdges(c, g);
    const lo = edges[band] ?? 0;
    const hi = Math.min(1001, edges[band + 1] ?? 1001);
    return lo + rand(seed, 'obs', t, `gauge:${id}:${g}`, Math.max(1, hi - lo));
  };
  const base = { ...cs.base };
  for (const g of Object.keys(s.bands)) if (g !== BOREDOM) base[g] = within(g, s.bands[g] ?? 0);
  const heard: string[] = [];
  const names: string[] = [];
  for (const fc of fog.cases)
    for (const n of Object.keys(fc.q.heard[id] ?? {})) if (!names.includes(n)) names.push(n);
  for (const n of names.sort()) {
    const p = fog.cases.reduce(
      (a, fc) => a + Math.trunc(((fc.q.heard[id]?.[n] ?? 0) * fc.weight) / WAVE_TOTAL),
      0,
    );
    if (p >= 500_000) heard.push(n);
  }
  return {
    ...cs,
    boredom: s.bored ?? within(BOREDOM, s.bands[BOREDOM] ?? 0),
    activityStart: t,
    base,
    heard,
    interrupt: cs.interrupt && {
      ...cs.interrupt,
      left: cs.interrupt.left * c.tuning.fog.stepTicks,
    },
  };
}

/** Removes a cat from every case of the fog: it is live now. */
const withoutCat = (fog: Fog, id: CatId): Fog => ({
  tick: fog.tick,
  cases: fog.cases.map((fc) => {
    const cats = { ...fc.cats };
    delete cats[id];
    return { ...fc, cats };
  }),
});

/**
 * Advances the wave one tick (03 §14, §15.1). `followed` are the protagonists whose perception
 * places cats. The draws use scope `obs`, keyed by who, whom and when, never by the log.
 */
export function advance(
  setup: FogSetup,
  wave: Wave,
  pins: readonly Pin[],
  followed: readonly CatId[],
): Wave {
  const { c, seed } = setup;
  const K = c.tuning.fog.stepTicks;
  const lan = wave.lantern;
  const t0 = lan.sim.tick;
  // 1. the lantern's step, reading the fog
  const streams = uniformStreams(c, 0);
  const r = step(
    c,
    seed,
    streams,
    lan.sim,
    pins,
    (bp) =>
      sample(
        bp.options.map((o) => o.ppm),
        rand(seed, 's0:branch', t0, bp.key, 1_000_000),
      ),
    setup.memo,
    {
      live: lan.live,
      held: lan.heldStorylets,
      dwell: Object.keys(lan.dwell).filter((id) => (lan.dwell[id] ?? 0) > 0),
      fog: lanternReader(setup, wave.fog, t0),
    },
    setup.decisions,
  );
  if (!r.state) throw new Error('a sampled step cannot stop at a branch point');
  let sim = r.state;
  const t = sim.tick;
  const dwell: Record<CatId, number> = {};
  for (const [id, d] of Object.entries(lan.dwell)) if (d > 1) dwell[id] = d - 1;
  let live = [...lan.live];
  let held = [...lan.heldStorylets];
  const unseen = { ...lan.unseen };
  let events = [...wave.events, ...r.events];
  let fog = wave.fog;
  let localCauses = wave.localCauses;

  // 2. the fog's step when a step boundary passes, reading the lantern; then release (03 §13.4)
  if (fog.tick + K <= t) {
    fog = fogStep(setup, fog, held, false, sim, pins, events);
    events = [];
    for (const id of live) {
      if (followed.includes(id) || (unseen[id] ?? 0) < c.tuning.lantern.releaseAfterTicks) continue;
      const cs = need(sim.cats, id, 'cat');
      fog = {
        tick: fog.tick,
        cases: fog.cases.map((fc) => ({
          ...fc,
          cats: { ...fc.cats, [id]: pointMass(setup, id, cs) },
        })),
      };
      live = live.filter((x) => x !== id);
      delete unseen[id];
      delete dwell[id];
      // a storylet whose role's cat leaves returns to the fog as a point mass at its state
      for (const sl of c.storylets) {
        const run = sim.storylets[sl.id];
        if (held.includes(sl.id) || !run || !Object.values(run.roles).flat().includes(id)) continue;
        held = inStorylets(setup, [...held, sl.id]);
        const st = run.state ?? INACTIVE;
        fog = {
          tick: fog.tick,
          cases: fog.cases.map((fc) => ({
            ...fc,
            q: {
              ...fc.q,
              storylets: {
                ...fc.q.storylets,
                [sl.id]: { p: { [st]: 1_000_000 }, roles: run.roles },
              },
            },
          })),
        };
      }
    }
  }

  // 3. the lantern edge (03 §15.1): each protagonist sees, places, or sees nothing
  for (const P of followed) {
    for (const id of live)
      if (id !== P) {
        const cs = need(sim.cats, id, 'cat');
        const seen = perceives(
          c,
          sim,
          P,
          { pos: catPos(c, cs), node: catNode(cs), radiusM: null },
          'sight',
        );
        unseen[id] = seen ? 0 : (unseen[id] ?? 0) + 1;
      }
    for (const def of c.cats) {
      const id = def.id;
      if (live.includes(id) || !fog.cases.some((fc) => fc.cats[id])) continue;
      const states = fogStates(setup, fog, id);
      const sees = states.filter((x) =>
        perceives(
          c,
          sim,
          P,
          { pos: catPos(c, x.cat), node: catNode(x.cat), radiusM: null },
          'sight',
        ),
      );
      const q = sees.reduce((a, x) => a + x.p, 0);
      if (q === 0) continue;
      const draw = rand(seed, 'obs', t, `place:${P}:${id}`, 1_000_000);
      if (draw < q) {
        // place: a perceivable state in proportion to its mass
        const pick = rand(seed, 'obs', t, `pick:${P}:${id}`, q);
        let acc = 0;
        const chosen = sees.find((x) => (acc += x.p) > pick) ?? sees[sees.length - 1];
        if (!chosen) continue;
        const after = applyEvidence(setup, fog, {
          kind: 'cat',
          cat: id,
          states: [chosen.s],
          holds: true,
        });
        if (!after) localCauses += 1; // no consistent past: placed as seen, nothing else changes
        fog = withoutCat(after ?? fog, id);
        sim = {
          ...sim,
          cats: { ...sim.cats, [id]: placedCat(setup, after ?? fog, id, chosen.s, chosen.mean, t) },
        };
        live = inCast(setup, [...live, id]);
        dwell[id] = c.tuning.lantern.dwellTicks;
        unseen[id] = 0;
      } else {
        // negative evidence: P does not see it
        const after = applyEvidence(setup, fog, {
          kind: 'cat',
          cat: id,
          states: sees.map((x) => x.s),
          holds: false,
        });
        if (after) fog = after;
      }
    }
  }

  // 4. held storylets whose roles are all live run in the lantern from a drawn state (03 §13.4)
  for (const id of held) {
    const cats = roleCats(setup, id, sim);
    const bound = fog.cases.find((fc) => fc.q.storylets[id]?.roles)?.q.storylets[id]?.roles ?? null;
    const needed = bound ? Object.values(bound).flat() : cats;
    if (needed === null || needed.length === 0 || !needed.every((x) => live.includes(x))) continue;
    const dist: Record<string, number> = {};
    for (const fc of fog.cases)
      for (const [st, p] of Object.entries(fc.q.storylets[id]?.p ?? {}))
        dist[st] = (dist[st] ?? 0) + Math.trunc((p * fc.weight) / WAVE_TOTAL);
    const names = Object.keys(dist).sort();
    const st =
      names[
        sample(
          names.map((n) => dist[n] ?? 0),
          rand(
            seed,
            'obs',
            t,
            `storylet:${id}`,
            Math.max(
              1,
              names.reduce((a, n) => a + (dist[n] ?? 0), 0),
            ),
          ),
        )
      ] ?? INACTIVE;
    const after = applyEvidence(setup, fog, {
      kind: 'state',
      storylet: id,
      state: st,
      holds: true,
    });
    if (after) fog = after;
    const def = need(c.storylet, id, 'storylet');
    const terminal = st !== INACTIVE && (def.states[st]?.exits.length ?? 0) === 0;
    sim = {
      ...sim,
      storylets: {
        ...sim.storylets,
        [id]: {
          state: st === INACTIVE ? null : st,
          enteredAt: t,
          roles: bound ?? {},
          ended: terminal,
        },
      },
    };
    held = held.filter((x) => x !== id);
  }

  return {
    lantern: { sim, live, dwell, heldStorylets: held, unseen },
    fog,
    events,
    localCauses,
  };
}

/** Storylets in file order. */
const inStorylets = (setup: FogSetup, ids: readonly string[]): string[] =>
  setup.c.storylets.map((s) => s.id).filter((id) => ids.includes(id));

/** The lantern frays when `fraysIf` holds in it without the anchor (03 §16): its dead tick. */
export const lanternFray = (wave: Wave): number | null => wave.lantern.sim.anchor.deadAt;
