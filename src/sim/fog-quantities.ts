// World quantities in the fog, per case (spec 03 §13.6). Every value is an integer: ppm, or a
// counter's expected value and variance.
import { isqrt, PPM } from './math';
import { PHI } from './phi-table';
import type { CatId, Content, RunningEffect } from './types';

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

/** A running effect a pin created in the fog, with P(it exists) in this case (03 §13.6). */
export interface FogEffect extends RunningEffect {
  p: number;
}

/**
 * A temporary gauge mod on a fogged cat, waiting to shift back (03 §13.2): `left` gauge units still to
 * undo over `leftSteps` fog steps, on a fraction `mass` of the chain. `hold`: all at once at the end.
 */
export interface FogMod {
  cat: CatId;
  gauge: string;
  left: number;
  leftSteps: number;
  mass: number;
  hold: boolean;
}

/** What set a fact, flag or `heard` (03 §13.5): a storylet state or effect, its cats, where. */
export interface Source {
  source: string; // `sl:<storylet>.<state>`, `act:<activity>`, `pin:<id>`, `ev:<event>`, `det:<id>`
  cats: CatId[];
  place: string | null;
}

/** One entry of a contributor heap: a source, the ticks it contributed in, and the ppm it added. */
export interface Contributor extends Source {
  from: number;
  to: number;
  ppm: number;
}

export interface Quantities {
  facts: Record<string, number>; // P(set by now): its parts combined as independent
  /** A fact's sources: '' for independent contributions; a storylet state's entering masses add. */
  factParts: Record<string, Record<string, number>>;
  flags: Record<string, FlagPart[]>; // by flag key (`name` or `name@node`)
  /** Expected value and variance in millionths of a unit, so no fraction is lost (decisions.md). */
  counters: Record<string, { mean: number; variance: number }>;
  storylets: Record<string, FogStorylet>;
  heard: Record<CatId, Record<string, number>>; // P(the cat has perceived the event)
  detectors: Record<string, number[]>; // per kernel clause, the highest ppm reached so far
  /** Each pin seen so far: P(fired by now) and P(it fizzled at its tick) (03 §11, §13.6). */
  pins: Record<string, { fired: number; fizzled: number }>;
  effects: FogEffect[]; // in creation order
  echoes: FogEvent[]; // socialSpread hops to emit at the next step (03 §9.3)
  mods: FogMod[]; // in creation order
  /** Per `fact:<f>`, `flag:<key>` and `heard:<cat>:<event>`: its top sources (03 §13.5). */
  heaps: Record<string, Contributor[]>;
  /** P(the anchor's `fraysIf` has held without the anchor by now): dead (03 §12.2, §13.6). */
  dead: number;
  /** The fog's own events of its last step, for the lantern's perception (03 §15.1). */
  stepEvents: FogEvent[];
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
  hops: number; // socialSpread hops left: perceivers re-emit it next step while above 0
  storylet: string | null; // the storylet whose effect emitted it: its role holders perceive it (03 §4)
  state: string | null; // the storylet state whose onEnter emitted it
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
    counters[k] = { mean: v.start * PPM, variance: 0 };
  const storylets: Record<string, FogStorylet> = {};
  for (const sl of c.storylets) storylets[sl.id] = { p: { [INACTIVE]: PPM }, roles: null };
  return {
    facts: {},
    factParts: {},
    flags,
    counters,
    storylets,
    heard: {},
    detectors: {},
    pins: {},
    effects: [],
    echoes: [],
    mods: [],
    heaps: {},
    dead: 0,
    stepEvents: [],
  };
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

/**
 * A counter gains `add` with probability m (a Bernoulli term: mean m·add, variance add²·m(1 − m)),
 * kept in millionths of a unit.
 */
export function addCounter(q: Quantities, name: string, add: number, m: number): void {
  const cur = q.counters[name] ?? { mean: 0, variance: 0 };
  q.counters[name] = {
    mean: cur.mean + add * m,
    variance: cur.variance + add * add * times(m, PPM - m),
  };
}

/** Φ(k / 100) in ppm for any integer k (the committed table, mirrored, clamped at ±4). */
const phiAt = (k: number): number =>
  k >= 0 ? (PHI[Math.min(k, 400)] ?? PPM) : PPM - (PHI[Math.min(-k, 400)] ?? PPM);

/**
 * Conditions a counter on `X ≥ atLeast` holding (or not), as a race link splits a case (03 §13.5):
 * the normal's truncated moments, from the PHI table and its differences for the density, integers
 * only. With β = (atLeast − ½ − μ)/σ and λ the density over the kept tail: above, μ + σλ and
 * σ²(1 + βλ − λ²); below, μ − σλ and σ²(1 − βλ − λ²). A kept tail under 0.1% pins the counter at
 * the threshold.
 */
export function conditionCounter(
  q: Quantities,
  name: string,
  atLeast: number,
  holds: boolean,
): void {
  const cur = q.counters[name];
  if (!cur) return;
  const sdK = isqrt(cur.variance); // σ in thousandths of a unit (variance is units² × 1e6)
  const edge = atLeast * PPM - PPM / 2; // X ≥ atLeast ⇔ X > atLeast − ½
  if (sdK === 0) return; // an exact value is already on its side
  const k = Math.max(-400, Math.min(400, Math.trunc((edge - cur.mean) / (sdK * 10)))); // β × 100
  const below = phiAt(k);
  const tail = holds ? PPM - below : below;
  if (tail < 1000) {
    q.counters[name] = { mean: holds ? atLeast * PPM : (atLeast - 1) * PPM, variance: 0 };
    return;
  }
  const density = (phiAt(k + 1) - phiAt(k - 1)) * 50; // φ(β) in ppm
  const lam = Math.trunc((density * PPM) / tail); // λ in ppm
  const shift = Math.trunc((sdK * lam) / 1000); // σλ in millionths of a unit
  const lamSq = Math.trunc(lam / 1000) ** 2; // λ² in ppm
  const beta = Math.trunc((k * lam) / 100); // βλ in ppm
  const factor = Math.min(PPM, Math.max(0, holds ? PPM + beta - lamSq : PPM - beta - lamSq));
  q.counters[name] = {
    mean: holds ? cur.mean + shift : cur.mean - shift,
    variance: Math.trunc((Math.trunc(cur.variance / 1000) * factor) / 1000),
  };
}

/** A counter's expected value and variance in whole units, as conditions read them (03 §13.7). */
export const counterOf = (q: Quantities, name: string) => {
  const c = q.counters[name] ?? { mean: 0, variance: 0 };
  return { mean: Math.trunc(c.mean / PPM), variance: Math.trunc(c.variance / PPM) };
};

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
    pins: {},
    effects: [],
    echoes: [],
    mods: [],
    heaps: {},
    dead: avg((q) => q.dead),
    stepEvents: [],
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
  // counters, in millionths: weights as shares so products stay below 2^53; the mixture's variance
  // is the mean variance plus the spread of the means ((Δ / 1000)² is units² in millionths)
  const shares = parts.map((x) => Math.trunc((x.w * PPM) / total));
  const mix = (get: (q: Quantities) => number) =>
    parts.reduce((a, x, i) => a + times(get(x.q), shares[i] ?? 0), 0);
  for (const k of keys((q) => q.counters)) {
    const mean = mix((q) => q.counters[k]?.mean ?? 0);
    const variance = mix((q) => {
      const m = q.counters[k] ?? { mean: 0, variance: 0 };
      const d = Math.trunc((m.mean - mean) / 1000);
      return m.variance + d * d;
    });
    out.counters[k] = { mean, variance };
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
  for (const k of keys((q) => q.pins))
    out.pins[k] = {
      fired: avg((q) => q.pins[k]?.fired ?? 0),
      fizzled: avg((q) => q.pins[k]?.fizzled ?? 0),
    };
  // listed records (effects, echoes, mods): the same record in several cases mixes its probability
  const mixList = <T>(
    get: (q: Quantities) => T[],
    prob: (x: T) => number,
    set: (x: T, p: number) => T,
  ) => {
    const seen: string[] = [];
    const list: T[] = [];
    for (const x of parts)
      for (const r of get(x.q)) {
        const k = JSON.stringify(set(r, 0));
        if (seen.includes(k)) continue;
        seen.push(k);
        const p = avg((q) => {
          const same = get(q).find((y) => JSON.stringify(set(y, 0)) === k);
          return same ? prob(same) : 0;
        });
        if (p > 0) list.push(set(r, p));
      }
    return list;
  };
  out.effects = mixList(
    (q) => q.effects,
    (x) => x.p,
    (x, p) => ({ ...x, p }),
  );
  out.echoes = mixList(
    (q) => q.echoes,
    (x) => x.p,
    (x, p) => ({ ...x, p }),
  );
  for (const k of keys((q) => q.heaps)) {
    const merged: Contributor[] = [];
    for (const x of parts)
      for (const e of x.q.heaps[k] ?? []) {
        const id = sourceKey(e);
        if (merged.some((y) => sourceKey(y) === id)) continue;
        const same = parts.flatMap((y) => y.q.heaps[k]?.filter((z) => sourceKey(z) === id) ?? []);
        merged.push({
          source: e.source,
          cats: e.cats,
          place: e.place,
          from: Math.min(...same.map((z) => z.from)),
          to: Math.max(...same.map((z) => z.to)),
          ppm: avg((q) => q.heaps[k]?.find((z) => sourceKey(z) === id)?.ppm ?? 0),
        });
      }
    out.heaps[k] = topSources(merged, c.tuning.fog.contributors);
  }
  out.stepEvents = mixList(
    (q) => q.stepEvents,
    (x) => x.p,
    (x, p) => ({ ...x, p }),
  );
  out.mods = mixList(
    (q) => q.mods,
    (x) => x.mass,
    (x, mass) => ({ ...x, mass }),
  );
  return out;
}

const sourceKey = (x: Source): string => JSON.stringify([x.source, x.cats, x.place]);

/** The `size` largest contributors by ppm, ties by source (03 §13.5). */
function topSources(list: Contributor[], size: number): Contributor[] {
  const keyed = list.map((x) => ({ x, k: sourceKey(x) }));
  keyed.sort((a, b) => b.x.ppm - a.x.ppm || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
  return keyed.slice(0, size).map((y) => y.x);
}

/**
 * Records that `by` added `m` ppm to quantity `key` at tick t, in its contributor heap of `size`
 * (03 §13.5): the same source widens its window and combines as independent (`'or'`), or keeps its
 * highest estimate (`'max'`, a detector's).
 */
export function contribute(
  q: Quantities,
  key: string,
  by: Source,
  t: number,
  m: number,
  size: number,
  combine: 'or' | 'max' = 'or',
): void {
  if (m <= 0 || size <= 0) return;
  const id = sourceKey(by);
  const list = [...(q.heaps[key] ?? [])];
  const i = list.findIndex((x) => sourceKey(x) === id);
  const was = list[i];
  if (was)
    list[i] = { ...was, to: t, ppm: combine === 'or' ? or(was.ppm, m) : Math.max(was.ppm, m) };
  else
    list.push({ source: by.source, cats: [...by.cats], place: by.place, from: t, to: t, ppm: m });
  q.heaps[key] = topSources(list, size);
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
