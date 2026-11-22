// The backward pass (03 §14): evidence at the fog's present weighs its cases by Bayes' rule and
// conditions what it is about; the anchor treated as already seen; strain and a projection's fray.
// Smoothing of earlier fog steps (§14 step 3) is left to frame requests, as §14 allows: nothing
// keeps earlier steps yet (M2 step 9). "Forward again" is the caller stepping on from the result.
import {
  fogStep,
  normalise,
  stateKey,
  WAVE_TOTAL,
  type ChainState,
  type Fog,
  type FogCase,
  type FogSetup,
} from './fog';
import { renormalise, setFact } from './fog-quantities';
import { PPM } from './math';
import type { CatId, Pin } from './types';

/**
 * What was seen (03 §14): a fogged cat in one of `states` (a placement, a Gaze sample) or in none of
 * them (negative evidence), a fact set or not, a storylet in a state or not, an event of the fog's
 * last step at a node or not (03 §15.1). Who emitted the event stays open.
 */
export type Evidence =
  | { kind: 'cat'; cat: CatId; states: readonly ChainState[]; holds: boolean }
  | { kind: 'fact'; fact: string; holds: boolean }
  | { kind: 'state'; storylet: string; state: string; holds: boolean }
  | { kind: 'event'; name: string; node: string; holds: boolean };

/** P(the evidence | the case), in ppm. A cat not in the fog is the lantern's: evidence about it is 1. */
export function likelihood(fc: FogCase, ev: Evidence): number {
  const as = (p: number) => (ev.holds ? Math.min(PPM, p) : PPM - Math.min(PPM, p));
  switch (ev.kind) {
    case 'cat': {
      const cat = fc.cats[ev.cat];
      if (!cat) return PPM;
      const keys = ev.states.map(stateKey);
      return as(cat.chain.reduce((a, e) => a + (keys.includes(stateKey(e.s)) ? e.p : 0), 0));
    }
    case 'fact':
      return as(fc.q.facts[ev.fact] ?? 0);
    case 'state':
      return as(fc.q.storylets[ev.storylet]?.p[ev.state] ?? 0);
    case 'event':
      return as(eventChance(fc, ev.name, ev.node));
    default: {
      const never: never = ev;
      throw new Error(`unknown evidence ${JSON.stringify(never)}`);
    }
  }
}

/** P(the fog's last step emitted the event at that node) in one case (its sources are exclusive). */
export const eventChance = (fc: FogCase, name: string, node: string): number =>
  Math.min(
    PPM,
    fc.q.stepEvents.reduce((a, e) => a + (e.name === name && e.node === node ? e.p : 0), 0),
  );

/** floor(a × WAVE_TOTAL / total) exactly, for 0 ≤ a ≤ total ≤ WAVE_TOTAL (products stay below 2^53). */
function toWave(a: number, total: number): number {
  const hi = Math.trunc((a * PPM) / total);
  const rest = a * PPM - hi * total;
  return hi * (WAVE_TOTAL / PPM) + Math.trunc((rest * (WAVE_TOTAL / PPM)) / total);
}

/**
 * Case weights times a likelihood, renormalised to WAVE_TOTAL (exact Bayes over cases, 03 §14 step 1);
 * cases at 0 are dropped and the remainder goes to the first case. Null when every case is at 0.
 */
function reweigh(cases: readonly FogCase[], like: (fc: FogCase) => number): FogCase[] | null {
  const parts = cases.map((fc) => ({ fc, a: Math.trunc((fc.weight * like(fc)) / PPM) }));
  const total = parts.reduce((s, x) => s + x.a, 0);
  if (total === 0) return null;
  const out = parts.filter((x) => x.a > 0).map((x) => ({ ...x.fc, weight: toWave(x.a, total) }));
  const first = out[0];
  if (first) first.weight += WAVE_TOTAL - out.reduce((s, fc) => s + fc.weight, 0);
  return out;
}

/** One case conditioned on the evidence (03 §14 step 2): disagreeing states or values get 0. */
function condition(setup: FogSetup, fc: FogCase, ev: Evidence): FogCase {
  switch (ev.kind) {
    case 'cat': {
      const cat = fc.cats[ev.cat];
      if (!cat) return fc;
      const keys = ev.states.map(stateKey);
      const kept = cat.chain.filter((e) => keys.includes(stateKey(e.s)) === ev.holds);
      return { ...fc, cats: { ...fc.cats, [ev.cat]: { ...cat, chain: normalise(setup.c, kept) } } };
    }
    case 'fact': {
      const q = { ...fc.q, facts: { ...fc.q.facts }, factParts: { ...fc.q.factParts } };
      setFact(q, ev.fact, ev.holds ? PPM : 0);
      return { ...fc, q };
    }
    case 'state': {
      const sl = fc.q.storylets[ev.storylet];
      if (!sl) return fc;
      const rest = { ...sl.p };
      delete rest[ev.state];
      const p = ev.holds ? { [ev.state]: PPM } : renormalise(rest);
      return {
        ...fc,
        q: { ...fc.q, storylets: { ...fc.q.storylets, [ev.storylet]: { ...sl, p } } },
      };
    }
    case 'event':
      return fc; // the cases agree with it now; which cat emitted it stays open
    default: {
      const never: never = ev;
      throw new Error(`unknown evidence ${JSON.stringify(never)}`);
    }
  }
}

/**
 * Applies evidence seen at the fog's present (03 §14 steps 1–2): Bayes over cases, then each case
 * conditioned on it. Null when the evidence is impossible in every case (the caller falls back to a
 * local cause, or reopens a watched fact).
 */
export function applyEvidence(setup: FogSetup, fog: Fog, ev: Evidence): Fog | null {
  const cases = reweigh(fog.cases, (fc) => likelihood(fc, ev));
  return cases && { tick: fog.tick, cases: cases.map((fc) => condition(setup, fc, ev)) };
}

/** P(the anchor is reached by now), raw: the cases' chances by weight (strain, on a projection). */
export function anchorChance(setup: FogSetup, fog: Fog): number {
  const id = setup.c.anchor.id;
  return fog.cases.reduce(
    (a, fc) => a + Math.trunc((fc.weight * (fc.q.facts[id] ?? 0)) / WAVE_TOTAL),
    0,
  );
}

/** P(not dead by now): `fraysIf` has not held without the anchor (03 §12.2, §13.6). */
export const aliveChance = (fog: Fog): number =>
  PPM - fog.cases.reduce((a, fc) => a + Math.trunc((fc.weight * fc.q.dead) / WAVE_TOTAL), 0);

/**
 * The anchor treated as already seen (03 §14): with `waves.anchorConditioning` on, case weights
 * times P(anchor reached | case). Chains are not re-weighted (an approximation). Unchanged with the
 * knob off or when no case reaches the anchor.
 */
export function conditionOnAnchor(setup: FogSetup, fog: Fog): Fog {
  if (!setup.c.tuning.waves.anchorConditioning) return fog;
  const id = setup.c.anchor.id;
  const cases = reweigh(fog.cases, (fc) => fc.q.facts[id] ?? 0);
  return cases ? { tick: fog.tick, cases } : fog;
}

export interface Projection {
  fog: Fog; // at the chapter's end, raw
  conditioned: Fog; // the same, the anchor treated as seen
  anchor: number; // P(anchor reached), raw: strain when projected from the lantern edge
  /**
   * The first tick from which the anchor can be reached with less than `fog.frayBelowPpm` (03 §16):
   * the start of the first step after which P(alive) is below it, or the chapter's end when P(anchor)
   * is below it there; null when it never frays (docs/questions.md M2-12).
   */
  fray: number | null;
}

/** Advances a fog to the chapter's end with the pins, no lantern (03 §13.1). */
export function projectToEnd(setup: FogSetup, fog: Fog, pins: readonly Pin[] = []): Projection {
  const { c } = setup;
  const below = c.tuning.fog.frayBelowPpm;
  let f = fog;
  let fray: number | null = null;
  while (f.tick < c.world.ticks) {
    const t = f.tick;
    f = fogStep(setup, f, undefined, true, null, pins);
    if (fray === null && aliveChance(f) < below) fray = t;
  }
  const anchor = anchorChance(setup, f);
  if (fray === null && anchor < below) fray = c.world.ticks;
  return { fog: f, conditioned: conditionOnAnchor(setup, f), anchor, fray };
}
