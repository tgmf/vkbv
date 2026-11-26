// Frames (03 §16): what the renderer and the player layer need at each tick up to the lantern edge,
// derived from the wave and never saved. Per cat, its distinct (position, activity, interrupt) with
// their probabilities; per event and storylet state, the probability it happens at that tick; the
// probability it rains; each requirement item's probability and the progress they make (04 §6).
// `samples` (backward-sampled trajectories) and the smoothing of past ghosts wait for M5
// (docs/questions.md M2-21): frames carry the fog's filtered odds.
import type { Requirement } from '../content/schemas/chapter';
import { chance, test } from './conditions';
import { fogStates, lanternReader, WAVE_TOTAL, type Fog, type FogSetup } from './fog';
import { INACTIVE, or, times } from './fog-quantities';
import type { LanternState, Wave } from './lantern';
import { PPM } from './math';
import { perceives, rangeBetween } from './perception';
import { followedCats } from './readers';
import { catNode, catPos, nodePos } from './space';
import type { CatId, Content, Ctx, Frame, Ghost, Pin, SimEvent, SimState } from './types';
import { need, newDecisionMemo } from './types';

const ghostKey = (g: Ghost): string =>
  `${g.node}|${g.pos[0]}|${g.pos[1]}|${g.activity}|${g.interrupt ?? ''}`;

/** A fogged cat's ghosts: its states over the cases grouped by what shows, summing to 1 000 000. */
function fogGhosts(setup: FogSetup, fog: Fog, id: CatId): Ghost[] {
  const { c } = setup;
  const byKey: Record<string, Ghost> = {};
  for (const x of fogStates(setup, fog, id)) {
    const g: Ghost = {
      node: catNode(x.cat),
      pos: catPos(c, x.cat),
      activity: x.cat.activity,
      interrupt: x.cat.interrupt?.action ?? null,
      p: x.p,
    };
    const k = ghostKey(g);
    const seen = byKey[k];
    if (seen) seen.p += g.p;
    else byKey[k] = g;
  }
  // most likely first, ties by key; the truncation remainder goes to the first
  const out = Object.entries(byKey)
    .sort(([ka, a], [kb, b]) => b.p - a.p || (ka < kb ? -1 : ka > kb ? 1 : 0))
    .map(([, g]) => g);
  const first = out[0];
  if (first) first.p += PPM - out.reduce((a, g) => a + g.p, 0);
  return out;
}

/** Whether a cat's chains and the case weights are the same objects and numbers as before. */
const sameChains = (a: Fog, b: Fog, id: CatId): boolean =>
  a.cases.length === b.cases.length &&
  a.cases.every((fc, i) => {
    const other = b.cases[i];
    return other !== undefined && other.weight === fc.weight && other.cats[id] === fc.cats[id];
  });

/** P(a fact) at this tick: 1 000 000 once the lantern holds it, otherwise its mixture over the cases. */
export function factChance(sim: SimState, fog: Fog, fact: string): number {
  if (sim.facts.includes(fact)) return PPM;
  return fog.cases.reduce(
    (a, fc) => a + Math.trunc(((fc.q.facts[fact] ?? 0) * fc.weight) / WAVE_TOTAL),
    0,
  );
}

/** The top-level items of the anchor's requirement tree (04 §6). */
export const requirementItems = (c: Content): Requirement[] =>
  'all' in c.anchor.requirements ? c.anchor.requirements.all : [c.anchor.requirements];

/** P(an item holds): `all` multiplies, `any` is 1 − Π(1 − p), as conditions do (03 §13.3). */
function itemChance(sim: SimState, fog: Fog, r: Requirement): number {
  if ('fact' in r) return factChance(sim, fog, r.fact);
  if ('all' in r) return r.all.reduce((a, x) => times(a, itemChance(sim, fog, x)), PPM);
  return r.any.reduce((a, x) => or(a, itemChance(sim, fog, x)), 0);
}

/** Each requirement item's probability at this tick (04 §6), in `requirementItems` order. */
export const requirementChances = (c: Content, sim: SimState, fog: Fog): number[] =>
  requirementItems(c).map((r) => itemChance(sim, fog, r));

/**
 * P(each storylet is in each state) at this tick, `INACTIVE` included: a storylet the lantern runs
 * (not in `heldStorylets`) is in its lantern state at 1 000 000; one the fog holds (or every one,
 * without a lantern) is its mixture over the cases. Storylets in file order, states in INACTIVE, then
 * file order; a state with no chance is left out.
 */
export function storyletChances(
  c: Content,
  fog: Fog,
  lantern: LanternState | null,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const sl of c.storylets) {
    const p: Record<string, number> = {};
    if (lantern && !lantern.heldStorylets.includes(sl.id)) {
      p[lantern.sim.storylets[sl.id]?.state ?? INACTIVE] = PPM;
    } else
      for (const st of [INACTIVE, ...Object.keys(sl.states)]) {
        const x = fog.cases.reduce(
          (a, fc) => a + Math.trunc(((fc.q.storylets[sl.id]?.p[st] ?? 0) * fc.weight) / WAVE_TOTAL),
          0,
        );
        if (x > 0) p[st] = x;
      }
    out[sl.id] = p;
  }
  return out;
}

/** progress (04 §6): the weights of the items whose probability reaches `frontier.countAtPpm`. */
export function progressOf(c: Content, requirements: readonly number[]): number {
  const items = requirementItems(c);
  return requirements.reduce(
    (a, p, i) => a + (p >= c.tuning.frontier.countAtPpm ? (items[i]?.weight ?? 0) : 0),
    0,
  );
}

/** The name an event has in `happens`, or null for events nobody reads there (moves, choices). */
function happensKey(e: SimEvent): string | null {
  switch (e.type) {
    case 'emit':
      return e.name;
    case 'voice':
      return 'voice';
    case 'storylet':
      return `storylet:${e.id}.${e.state}`;
    case 'detector':
      return `detector:${e.id}`;
    default:
      return null;
  }
}

/**
 * The frame of tick t (03 §16). `wave` is the wave at tick t; `next` the wave after the step from t,
 * whose events are the tick's (as a watched fact of t reads them, 03 §15.2), or null at the last
 * tick (no step follows it); a fog step computed in that advance puts its events at t. `prev` (the frame and wave of t − 1) lets a fogged cat whose
 * chains did not change keep its ghosts.
 */
export function frameOf(
  setup: FogSetup,
  wave: Wave,
  next: Wave | null,
  prev?: { wave: Wave; frame: Frame },
  pins: readonly Pin[] = [],
): Frame {
  const { c } = setup;
  const sim = wave.lantern.sim;
  const cats: Record<CatId, Ghost[]> = {};
  for (const { id } of c.cats) {
    if (wave.lantern.live.includes(id)) {
      const cs = need(sim.cats, id, 'cat');
      cats[id] = [
        {
          node: catNode(cs),
          pos: catPos(c, cs),
          activity: cs.activity,
          interrupt: cs.interrupt?.action ?? null,
          p: PPM,
        },
      ];
    } else {
      const kept = prev && !prev.wave.lantern.live.includes(id) && prev.frame.cats[id];
      cats[id] =
        kept && sameChains(prev.wave.fog, wave.fog, id) ? kept : fogGhosts(setup, wave.fog, id);
    }
  }
  const happens: Record<string, number> = {};
  for (const e of next?.tickEvents ?? []) {
    const k = happensKey(e);
    if (k !== null) happens[k] = PPM;
  }
  if (next && next.fog.tick !== wave.fog.tick)
    for (const fc of next.fog.cases)
      for (const e of fc.q.stepEvents) {
        if (happens[e.name] === PPM) continue;
        const m = Math.trunc((e.p * fc.weight) / WAVE_TOTAL);
        happens[e.name] = Math.min(PPM, (happens[e.name] ?? 0) + m);
      }
  const requirements = requirementChances(c, sim, wave.fog);
  return {
    tick: sim.tick,
    cats,
    happens,
    rain: sim.weather.now === 'rain' ? PPM : 0,
    requirements,
    progress: progressOf(c, requirements),
    ...targets(setup, wave),
    effects: sim.effects.map((e) => ({
      pin: e.pin,
      kind: e.kind,
      source: e.source,
      place: e.place,
      radiusM: e.radiusM,
    })),
    gazes: gazesAt(c, pins, sim.tick),
    lanterns: lanternsOf(c, wave),
    lines: linesOf(c, sim, next?.tickEvents ?? []),
    pins: pinsFired(sim, wave.fog, pins),
    forming: formingOf(setup, wave),
  };
}

/**
 * Forming stories (06 §2, assist mode; M8-1): each storylet started and not finished at this tick
 * that can move on now, with P(it is in such a state), its most likely such state (ties in file order)
 * and the cat bound to its first role that holds one (the lantern's run, or the fog's heaviest case
 * with roles bound). A state can move on when one of its exits has no gate or a gate that holds now
 * (read as the lantern reads the fog); a storylet waiting in a state whose every exit is shut (the
 * lure's `home` before any lure is near) is not forming.
 */
function formingOf(setup: FogSetup, wave: Wave): Frame['forming'] {
  const { c } = setup;
  const chances = storyletChances(c, wave.fog, wave.lantern);
  const out: Frame['forming'] = [];
  let ctx: Ctx | null = null;
  for (const sl of c.storylets) {
    const roles = wave.lantern.heldStorylets.includes(sl.id)
      ? fogRoles(wave.fog, sl.id)
      : (wave.lantern.sim.storylets[sl.id]?.roles ?? null);
    const scope = { roles: roles ?? {}, storylet: sl.id };
    let p = 0;
    let state: string | null = null;
    let best = 0;
    for (const [st, x] of Object.entries(chances[sl.id] ?? {})) {
      const exits = st === INACTIVE ? [] : (sl.states[st]?.exits ?? []);
      ctx ??= lanternCtx(setup, wave);
      const at = ctx;
      if (!exits.some((e) => !e.gate || test(at, e.gate, scope))) continue;
      p += x;
      if (x > best) {
        best = x;
        state = st;
      }
    }
    if (state === null || p === 0) continue;
    let cat: CatId | null = null;
    for (const r of Object.keys(sl.roles)) {
      cat = roles?.[r]?.[0] ?? null;
      if (cat !== null) break;
    }
    out.push({ storylet: sl.id, state, p: Math.min(PPM, p), cat });
  }
  return out;
}

/** A fog-held storylet's roles in its heaviest case that has them bound (ties: the first case). */
function fogRoles(fog: Fog, id: string): Record<string, CatId[]> | null {
  let roles: Record<string, CatId[]> | null = null;
  let w = -1;
  for (const fc of fog.cases) {
    const r = fc.q.storylets[id]?.roles;
    if (r && fc.weight > w) {
      roles = r;
      w = fc.weight;
    }
  }
  return roles;
}

/**
 * P(fired by this tick) of each pin before it (06 §3): 1 000 000 or 0 where the lantern holds the pin's
 * state; otherwise the fog's P(fired) over its cases (03 §13.6); left out where neither has seen it.
 */
function pinsFired(sim: SimState, fog: Fog, pins: readonly Pin[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pin of pins) {
    if (pin.tick >= sim.tick) continue;
    const live = sim.pins[pin.id];
    if (live !== undefined) {
      out[pin.id] = live === 'fired' ? PPM : 0;
      continue;
    }
    if (!fog.cases.some((fc) => fc.q.pins[pin.id])) continue;
    const each = fog.cases.map((fc) => fc.q.pins[pin.id]?.fired ?? 0);
    // the same in every case: that value exactly (a sum of truncated shares can fall short of it)
    const first = each[0] ?? 0;
    out[pin.id] = each.every((x) => x === first)
      ? first
      : Math.min(
          PPM,
          fog.cases.reduce(
            (a, fc, i) => a + Math.trunc(((each[i] ?? 0) * fc.weight) / WAVE_TOTAL),
            0,
          ),
        );
  }
  return out;
}

/** The lines of a step's events (06 §2): followed protagonists' voices, storylet states with text. */
function linesOf(c: Content, sim: SimState, events: readonly SimEvent[]): Frame['lines'] {
  const followed = followedCats(c);
  const out: Frame['lines'] = [];
  for (const e of events) {
    if (e.type === 'voice' && followed.includes(e.cat))
      out.push({ cat: e.cat, node: e.node, text: e.line, shows: `voice:${e.hook}` });
    else if (e.type === 'storylet') {
      const text = need(c.storylet, e.id, 'storylet').states[e.state]?.textKey;
      if (text === undefined) continue;
      const cat = Object.values(e.roles).flat()[0] ?? null;
      const cs = cat === null ? undefined : sim.cats[cat];
      out.push({
        cat,
        node: cs ? catNode(cs) : (c.nodes[0]?.id ?? ''),
        text,
        shows: `${e.id}.${e.state}`,
      });
    }
  }
  return out;
}

/** Gaze circles whose window holds tick t (03 §15.4), in log order. */
function gazesAt(c: Content, pins: readonly Pin[], t: number): Frame['gazes'] {
  const out: Frame['gazes'] = [];
  for (const pin of pins) {
    if (pin.kind !== 'power') continue;
    for (const prim of need(c.power, pin.power, 'power').effects)
      if (prim.prim === 'collapse' && t >= pin.tick && t < pin.tick + prim.ticks)
        out.push({ pin: pin.id, place: pin.place, radiusM: prim.radiusM });
  }
  return out;
}

/** Each live followed protagonist's sight (03 §4): its range toward its own space, the places it sees. */
function lanternsOf(c: Content, wave: Wave): Frame['lanterns'] {
  const sim = wave.lantern.sim;
  return followedCats(c).flatMap((cat) => {
    const cs = sim.cats[cat];
    if (!cs || !wave.lantern.live.includes(cat)) return [];
    const here = catNode(cs);
    const seen = c.nodes
      .filter((n) =>
        perceives(c, sim, cat, { pos: nodePos(c, n.id), node: n.id, radiusM: null }, 'sight'),
      )
      .map((n) => n.id);
    return [{ cat, rangeMm: rangeBetween(c, cat, here, here, sim.weather.now, 'sight'), seen }];
  });
}

/** A read-only context at the wave's tick: conditions read the lantern, and the fog through its reader. */
function lanternCtx(setup: FogSetup, wave: Wave): Ctx {
  const sim = wave.lantern.sim;
  return {
    c: setup.c,
    seed: setup.seed,
    streams: {},
    s: sim,
    prev: sim,
    t: sim.tick,
    events: [],
    pins: [],
    pick: () => 0,
    chanceN: 0,
    memo: setup.memo,
    decisions: newDecisionMemo(),
    live: wave.lantern.live,
    held: wave.lantern.heldStorylets,
    fog: lanternReader(setup, wave.fog, sim.tick),
  };
}

/**
 * Objects' P(visible), the powers available and edges' P(closed) at the wave's tick (04 §3, §8; 06 §2):
 * `visibleWhen`, `availableWhen` and `when` read as conditions do in the lantern, the fog through its
 * reader (03 §13.3).
 */
function targets(setup: FogSetup, wave: Wave): Pick<Frame, 'visible' | 'powers' | 'closed'> {
  const { c } = setup;
  let ctx: Ctx | null = null;
  const at = (): Ctx => (ctx ??= lanternCtx(setup, wave));
  const visible: Record<string, number> = {};
  for (const o of c.objects) if (o.visibleWhen) visible[o.id] = chance(at(), o.visibleWhen, {});
  const powers = c.powers
    .filter((p) => !p.availableWhen || test(at(), p.availableWhen, {}))
    .map((p) => p.id);
  const closed: Record<string, number> = {};
  for (const e of c.edges) if (e.when) closed[e.id] = PPM - chance(at(), e.when, {});
  return { visible, powers, closed };
}
