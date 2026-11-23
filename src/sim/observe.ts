// Observation (03 §15): the watched fact a protagonist's view makes of a tick (§15.2), whether a
// watched fact can hold on a re-run (§15.5), and Gaze (§15.4). Placement itself is the lantern's
// (`lantern.ts`); playback, which records watched facts and pays, is M3's.
import type { Prim } from '../content/schemas/dsl';
import { applyEvidence } from './backward';
import { fogStates, type ChainState, type Fog, type FogSetup } from './fog';
import { canonicalJson } from './hash';
import { perceives } from './perception';
import { hash32, rand } from './rng';
import { namedCats } from './sifting';
import { catNode, catPos, nodePos, within } from './space';
import type {
  CatId,
  CatState,
  GazeFact,
  NodeId,
  Pin,
  PinId,
  SeenCat,
  SimEvent,
  SimState,
  WatchedFact,
  WatchedSummary,
} from './types';
import { need } from './types';

const sorted = (xs: Iterable<string>): string[] => [...new Set(xs)].sort();

/**
 * The watched fact P's perception makes of the tick just stepped (03 §15.2): `sim` is the lantern
 * after the step and its edge (fogged cats P sees are live by then), `events` the step's events.
 * P perceives storylet states it holds a role in or whose role cats it sees, detectors naming it, a
 * cat it sees or no cat, and emitted events by §4's rules.
 */
export function watch(
  setup: FogSetup,
  sim: SimState,
  events: readonly SimEvent[],
  live: readonly CatId[],
  P: CatId,
): WatchedFact {
  const { c } = setup;
  const me = need(sim.cats, P, 'cat');
  const sees = (pos: [number, number], node: NodeId) =>
    perceives(c, sim, P, { pos, node, radiusM: null }, 'sight');
  const cats: SeenCat[] = [];
  for (const id of live) {
    const cs = need(sim.cats, id, 'cat');
    if (id !== P && sees(catPos(c, cs), catNode(cs)))
      cats.push({ cat: id, node: catNode(cs), activity: cs.activity });
  }
  const known = [P, ...cats.map((x) => x.cat)];
  const paidBy: Record<string, PinId[]> = {};
  const touched = (ids: readonly CatId[]) =>
    sorted(ids.filter((id) => live.includes(id)).flatMap((id) => sim.cats[id]?.touchedBy ?? []));
  const storylets: string[] = [];
  const detectors: string[] = [];
  const names: string[] = [];
  const facts: string[] = [];
  for (const e of events) {
    if (e.type === 'storylet') {
      const bound = Object.values(e.roles).flat();
      if (!bound.some((id) => known.includes(id))) continue;
      const key = `${e.id}.${e.state}`;
      storylets.push(key);
      paidBy[key] = touched(bound);
      for (const x of need(c.storylet, e.id, 'storylet').states[e.state]?.onEnter ?? [])
        if ('fact' in x) facts.push(x.fact);
    } else if (e.type === 'detector') {
      const d = c.detectors.find((x) => x.id === e.id);
      if (!d) continue;
      const named = namedCats(c, d);
      if (named.length > 0 && !named.some((id) => known.includes(id))) continue;
      detectors.push(e.id);
      paidBy[e.id] = touched(named);
      facts.push(d.emits);
    } else if (e.type === 'emit') {
      const run = e.storylet !== null ? sim.storylets[e.storylet] : undefined;
      const always =
        e.global ||
        e.to === P ||
        e.source === P ||
        (run !== undefined && Object.values(run.roles).flat().includes(P));
      const sense = e.radiusM === null ? 'sight' : 'hearing';
      if (!always && !perceives(c, sim, P, { pos: e.pos, node: e.node, radiusM: e.radiusM }, sense))
        continue;
      names.push(e.name);
      const own = e.factIfPerceivedBy?.[P];
      if (own) facts.push(own);
    } else if (e.type === 'voice') {
      const src = { pos: e.pos, node: e.node, radiusM: e.radiusM };
      if (e.cat === P || perceives(c, sim, P, src, 'hearing')) names.push(`voice:${e.hook}`);
    }
  }
  const setNow = events.flatMap((e) => (e.type === 'fact' ? [e.fact] : []));
  const summary: WatchedSummary = {
    self: { node: catNode(me), activity: me.activity, interrupt: me.interrupt?.action ?? null },
    cats,
    storylets: sorted(storylets),
    detectors: sorted(detectors),
    factsSet: sorted(facts.filter((f) => setNow.includes(f))),
    events: sorted(names),
    nodesSeen: c.nodes.filter((n) => sees(nodePos(c, n.id), n.id)).map((n) => n.id),
    paidBy,
    // QUESTION(M2-19): fogged cats carry no pressure in the fog: the live cats' sum only
    totalPressure: live.reduce((a, id) => a + (sim.cats[id]?.pressure ?? 0), 0),
    weather: sim.weather.now,
  };
  const tick = sim.tick - 1;
  return { tick, cat: P, digest: hash32(canonicalJson({ tick, cat: P, summary })), summary };
}

/**
 * Whether a watched fact can hold on a re-run (03 §15.5), and the fogged cats it saw, which the edge
 * forces into the watched state unless its ordinary draw shows them so: P's own part
 * must be the same; each other seen cat that is live must stand and act as it did (QUESTION(M2-20):
 * a live cat the edit changed is not re-derived from its divergence, the fact reopens), and each
 * fogged one must have mass in the watched state. The forced parts together (their masses
 * multiplied) must reach `observation.reopenBelowPpm`.
 */
export function imposed(
  setup: FogSetup,
  fog: Fog,
  sim: SimState,
  live: readonly CatId[],
  fact: WatchedFact,
): { holds: false } | { holds: true; force: SeenCat[] } {
  const me = need(sim.cats, fact.cat, 'cat');
  const self = fact.summary.self;
  if (
    catNode(me) !== self.node ||
    me.activity !== self.activity ||
    (me.interrupt?.action ?? null) !== self.interrupt
  )
    return { holds: false };
  const force: SeenCat[] = [];
  let p = 1_000_000;
  for (const seen of fact.summary.cats) {
    if (live.includes(seen.cat)) {
      if (!shows(need(sim.cats, seen.cat, 'cat'), seen)) return { holds: false };
      continue;
    }
    const mass = matching(setup, fog, seen).reduce((a, x) => a + x.p, 0);
    if (mass === 0) return { holds: false };
    p = Math.trunc((p * Math.min(1_000_000, mass)) / 1_000_000);
    force.push(seen);
  }
  if (force.length > 0 && p < setup.c.tuning.observation.reopenBelowPpm) return { holds: false };
  return { holds: true, force };
}

/** Whether a cat stands and acts as a watched part says. */
export const shows = (cs: CatState, seen: SeenCat): boolean =>
  catNode(cs) === seen.node && cs.activity === seen.activity;

/** A fogged cat's states matching a watched part, with their mixture mass. */
export const matching = (setup: FogSetup, fog: Fog, seen: SeenCat) =>
  fogStates(setup, fog, seen.cat).filter((x) => x.p > 0 && shows(x.cat, seen));

/** One of `states` in proportion to its mass, drawn with `purpose` at tick t. */
export function pickState<T extends { p: number }>(
  setup: FogSetup,
  states: readonly T[],
  t: number,
  purpose: string,
): T | undefined {
  const total = states.reduce((a, x) => a + x.p, 0);
  if (total === 0) return undefined;
  const r = rand(setup.seed, 'obs', t, purpose, total);
  let acc = 0;
  return states.find((x) => (acc += x.p) > r);
}

/**
 * Gaze at tick t (03 §15.4): for each pin of a power with `collapse` whose window holds t, every
 * fogged cat, in cast order, is placed or not by §15.1's rule with the circle (`radiusM` around the
 * place, ignoring walls and weather) instead of a protagonist's perception: a hit fixes a state in
 * the circle as evidence and a gaze fact (the cat stays fogged); a miss is negative evidence.
 */
export function gaze(
  setup: FogSetup,
  fog: Fog,
  pins: readonly Pin[],
  t: number,
): { fog: Fog; facts: GazeFact[] } {
  const { c } = setup;
  let f = fog;
  const facts: GazeFact[] = [];
  for (const pin of pins) {
    if (pin.kind !== 'power') continue;
    const prim = need(c.power, pin.power, 'power').effects.find(
      (x): x is Extract<Prim, { prim: 'collapse' }> => x.prim === 'collapse',
    );
    if (!prim || t < pin.tick || t >= pin.tick + prim.ticks) continue;
    const centre = nodePos(c, pin.place);
    for (const { id } of c.cats) {
      if (!f.cases.some((fc) => fc.cats[id])) continue;
      const inside = fogStates(setup, f, id).filter((x) =>
        within(catPos(c, x.cat), centre, prim.radiusM),
      );
      const q = inside.reduce((a, x) => a + x.p, 0);
      if (q === 0) continue;
      const hit = rand(setup.seed, 'obs', t, `gaze:${pin.id}:${t}:${id}`, 1_000_000) < q;
      const chosen = hit ? pickState(setup, inside, t, `gazepick:${pin.id}:${t}:${id}`) : undefined;
      const states: ChainState[] = chosen ? [chosen.s] : inside.map((x) => x.s);
      const after = applyEvidence(setup, f, { kind: 'cat', cat: id, states, holds: hit });
      if (after) f = after;
      if (chosen)
        facts.push({
          tick: t,
          pin: pin.id,
          cat: id,
          node: catNode(chosen.cat),
          activity: chosen.cat.activity,
        });
    }
  }
  return { fog: f, facts };
}
