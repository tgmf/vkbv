// Frames (03 §16): what the renderer and the player layer need at each tick up to the lantern edge,
// derived from the wave and never saved. Per cat, its distinct (position, activity, interrupt) with
// their probabilities; per event and storylet state, the probability it happens at that tick; the
// probability it rains; each requirement item's probability and the progress they make (04 §6).
// `samples` (backward-sampled trajectories) and the smoothing of past ghosts wait for M5
// (docs/questions.md M2-21): frames carry the fog's filtered odds.
import type { Requirement } from '../content/schemas/chapter';
import { fogStates, WAVE_TOTAL, type Fog, type FogSetup } from './fog';
import { or, times } from './fog-quantities';
import type { Wave } from './lantern';
import { PPM } from './math';
import { catNode, catPos } from './space';
import type { CatId, Content, Frame, Ghost, SimEvent, SimState } from './types';
import { need } from './types';

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
  const requirements = requirementItems(c).map((r) => itemChance(sim, wave.fog, r));
  return {
    tick: sim.tick,
    cats,
    happens,
    rain: sim.weather.now === 'rain' ? PPM : 0,
    requirements,
    progress: progressOf(c, requirements),
  };
}
