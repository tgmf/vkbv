// World quantities in the fog, per case (spec 03 §13.6). Every value is an integer: ppm, or a
// counter's expected value and variance.
import { PPM } from './math';
import type { CatId, Content } from './types';

/** One contribution to a flag: P(it set the flag) and when that setting expires. */
export interface FlagPart {
  p: number;
  until: number | null;
}

/** A storylet in the fog: a distribution over `inactive` and its states, and its bound roles. */
export interface FogStorylet {
  p: Record<string, number>; // 'inactive' or a state id → ppm, summing to 1 000 000
  roles: Record<string, CatId[]> | null; // bound at first activation
}

export interface Quantities {
  facts: Record<string, number>; // P(set by now): its parts combined as independent
  /** A fact's sources: '' for independent contributions; a storylet state's entering masses add. */
  factParts: Record<string, Record<string, number>>;
  flags: Record<string, FlagPart[]>; // by flag key (`name` or `name@node`)
  counters: Record<string, { mean: number; variance: number }>;
  storylets: Record<string, FogStorylet>;
  heard: Record<CatId, Record<string, number>>; // P(the cat has perceived the event)
  detectors: Record<string, number[]>; // per kernel clause, the highest ppm reached so far
}

/** An event emitted in the fog this step: P(emitted at that node). */
export interface FogEvent {
  name: string;
  node: string;
  p: number;
  radiusM: number | null;
  source: CatId | null;
  to: CatId | null;
  global: boolean;
  factIfPerceivedBy: Record<CatId, string> | null;
}

export const INACTIVE = 'inactive';

/** P(a or b) for independent events. */
export const or = (a: number, b: number): number => a + b - Math.trunc((a * b) / PPM);
export const times = (a: number, b: number): number => Math.trunc((a * b) / PPM);

/** The quantities at tick 0: initial flags and counters, every storylet inactive. */
export function initialQuantities(c: Content): Quantities {
  const flags: Record<string, FlagPart[]> = {};
  for (const [k, v] of Object.entries(c.world.initialFlags ?? {}))
    if (v !== 0) flags[k] = [{ p: PPM, until: null }];
  const counters: Quantities['counters'] = {};
  for (const [k, v] of Object.entries(c.world.counters))
    counters[k] = { mean: v.start, variance: 0 };
  const storylets: Record<string, FogStorylet> = {};
  for (const sl of c.storylets) storylets[sl.id] = { p: { [INACTIVE]: PPM }, roles: null };
  return { facts: {}, factParts: {}, flags, counters, storylets, heard: {}, detectors: {} };
}

/** P(the flag is set at tick t): any unexpired contribution. */
export function flagChance(q: Quantities, key: string, t: number): number {
  let none = PPM;
  for (const part of q.flags[key] ?? [])
    if (part.until === null || part.until > t) none = times(none, PPM - part.p);
  return PPM - none;
}

/** A flag set to a non-zero value with probability m (until null = no expiry). */
export function setFlag(q: Quantities, key: string, m: number, until: number | null): void {
  const parts = q.flags[key] ?? [];
  q.flags[key] = parts;
  const same = parts.find((x) => x.until === until);
  if (same) same.p = or(same.p, m);
  else parts.push({ p: m, until });
}

/** A flag cleared with probability m: every contribution survives with 1 − m. */
export function clearFlag(q: Quantities, key: string, m: number): void {
  for (const part of q.flags[key] ?? []) part.p = times(part.p, PPM - m);
}

/** A counter gains `add` with probability m (a Bernoulli term: mean m·add, variance add²·m(1 − m)). */
export function addCounter(q: Quantities, name: string, add: number, m: number): void {
  const cur = q.counters[name] ?? { mean: 0, variance: 0 };
  q.counters[name] = {
    mean: cur.mean + Math.trunc((add * m) / PPM),
    variance: cur.variance + Math.trunc((add * add * times(m, PPM - m)) / PPM),
  };
}

export const counterOf = (q: Quantities, name: string) =>
  q.counters[name] ?? { mean: 0, variance: 0 };

/**
 * A fact set with probability m. With a `source` (a once-storylet's state), the masses entering it
 * are disjoint, so they add; contributions without one combine as independent (03 §13.6).
 */
export function addFactChance(q: Quantities, fact: string, m: number, source = ''): void {
  if (m <= 0) return;
  const parts = (q.factParts[fact] ??= {});
  parts[source] =
    source === '' ? or(parts[source] ?? 0, m) : Math.min(PPM, (parts[source] ?? 0) + m);
  combineFact(q, fact);
}

/** Raises one source of a fact to at least v (a detector's estimate). */
export function raiseFactPart(q: Quantities, fact: string, source: string, v: number): void {
  const parts = (q.factParts[fact] ??= {});
  parts[source] = Math.max(parts[source] ?? 0, v);
  combineFact(q, fact);
}

/** Sets a fact to exactly v (a link's case value, the weather's facts). */
export function setFact(q: Quantities, fact: string, v: number): void {
  q.factParts[fact] = { '': v };
  q.facts[fact] = v;
}

function combineFact(q: Quantities, fact: string): void {
  const parts = q.factParts[fact] ?? {};
  q.facts[fact] = Object.keys(parts)
    .sort()
    .reduce((a, k) => or(a, parts[k] ?? 0), 0);
}

export function addHeard(q: Quantities, cat: CatId, event: string, m: number): void {
  if (m <= 0) return;
  const h = q.heard[cat] ?? {};
  q.heard[cat] = h;
  h[event] = or(h[event] ?? 0, m);
}

/** Mixes quantities of cases by weight (merging cases): ppm by weight; counters by total variance. */
export function mixQuantities(
  c: Content,
  parts: readonly { w: number; q: Quantities }[],
): Quantities {
  const total = parts.reduce((a, x) => a + x.w, 0);
  const avg = (get: (q: Quantities) => number) =>
    Math.trunc(parts.reduce((a, x) => a + get(x.q) * x.w, 0) / total);
  const keys = <T>(get: (q: Quantities) => Record<string, T>) => {
    const out: string[] = [];
    for (const x of parts) for (const k of Object.keys(get(x.q))) if (!out.includes(k)) out.push(k);
    return out.sort();
  };
  const out: Quantities = {
    facts: {},
    factParts: {},
    flags: {},
    counters: {},
    storylets: {},
    heard: {},
    detectors: {},
  };
  for (const k of keys((q) => q.facts)) out.facts[k] = avg((q) => q.facts[k] ?? 0);
  for (const k of keys((q) => q.factParts)) {
    const parts: Record<string, number> = {};
    for (const src of keys((q) => q.factParts[k] ?? {}))
      parts[src] = avg((q) => q.factParts[k]?.[src] ?? 0);
    out.factParts[k] = parts;
  }
  for (const k of keys((q) => q.flags)) {
    const untils: (number | null)[] = [];
    for (const x of parts)
      for (const part of x.q.flags[k] ?? [])
        if (!untils.includes(part.until)) untils.push(part.until);
    out.flags[k] = untils.map((until) => ({
      until,
      p: avg((q) => q.flags[k]?.find((part) => part.until === until)?.p ?? 0),
    }));
  }
  for (const k of keys((q) => q.counters)) {
    const mean = avg((q) => q.counters[k]?.mean ?? 0);
    const second = avg((q) => {
      const m = q.counters[k] ?? { mean: 0, variance: 0 };
      return m.variance + m.mean * m.mean;
    });
    out.counters[k] = { mean, variance: Math.max(0, second - mean * mean) };
  }
  for (const sl of c.storylets) {
    const p: Record<string, number> = {};
    for (const st of [INACTIVE, ...Object.keys(sl.states)]) {
      const v = avg((q) => q.storylets[sl.id]?.p[st] ?? 0);
      if (v > 0) p[st] = v;
    }
    const roles = parts.find((x) => x.q.storylets[sl.id]?.roles)?.q.storylets[sl.id]?.roles ?? null;
    out.storylets[sl.id] = { p: renormalise(p), roles };
  }
  for (const id of keys((q) => q.heard)) {
    const h: Record<string, number> = {};
    for (const e of keys((q) => q.heard[id] ?? {})) h[e] = avg((q) => q.heard[id]?.[e] ?? 0);
    out.heard[id] = h;
  }
  for (const d of keys((q) => q.detectors)) {
    const n = Math.max(...parts.map((x) => x.q.detectors[d]?.length ?? 0));
    out.detectors[d] = Array.from({ length: n }, (_, i) => avg((q) => q.detectors[d]?.[i] ?? 0));
  }
  return out;
}

/** Scales a distribution to sum to 1 000 000; the remainder goes to the first key. */
export function renormalise(p: Record<string, number>): Record<string, number> {
  const ks = Object.keys(p);
  const sum = ks.reduce((a, k) => a + (p[k] ?? 0), 0);
  if (sum === 0) return { [INACTIVE]: PPM };
  const out: Record<string, number> = {};
  for (const k of ks) out[k] = Math.trunc(((p[k] ?? 0) * PPM) / sum);
  const first = ks[0];
  if (first !== undefined)
    out[first] = (out[first] ?? 0) + PPM - ks.reduce((a, k) => a + (out[k] ?? 0), 0);
  return out;
}
