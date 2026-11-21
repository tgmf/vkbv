// The fog: cat chains per case, computed, never simulated (spec 03 §13).
import type { Condition, Score } from '../content/schemas/dsl';
import { choices, clampBase, initialGauges, placeOptions } from './cats';
import { chance } from './conditions';
import { initialState, uniformStreams } from './history';
import { PPM } from './math';
import { storyletCats } from './readers';
import { edgeBetween, path, type PathMemo } from './space';
import type { CatId, CatState, Content, Ctx, FogReader, NodeId, SimState, StandIns } from './types';
import { need } from './types';

/** One possible state of a fogged cat (03 §13.2). Walking and durations count fog steps. */
export interface ChainState {
  activity: string;
  place: NodeId;
  walk: null | { from: NodeId; path: NodeId[]; leftSteps: number; ofSteps: number };
  leftSteps: number;
  bands: Record<string, number>;
  interrupt: null | { action: string; leftSteps: number };
  control: 'free' | 'storylet' | 'forced';
}

export interface Entry {
  s: ChainState;
  p: number; // ppm within the cat's chain in this case
}

/** A fogged cat in one case: its chain and its mean-field gauges (expected values). */
export interface FogCat {
  chain: Entry[];
  mean: Record<string, number>;
}

export type Weather = 'dry' | 'rain' | 'stopped';

export interface FogCase {
  weight: number; // out of WAVE_TOTAL
  weather: Weather;
  cats: Record<CatId, FogCat>;
}

export interface Fog {
  tick: number; // the tick the next fog step starts at
  cases: FogCase[];
}

export const WAVE_TOTAL = 1_000_000_000;

/** What the fog derives once per content and seed. */
export interface FogSetup {
  c: Content;
  seed: number;
  /** Banded gauges per cat, in hooks.json order (03 §13.2). */
  banded: Record<CatId, string[]>;
  /** The seeded stats of every cat (03 §5): traits, and hooks at tick 0. */
  seeded: Record<CatId, Record<string, number>>;
  /** The state the fog's skeletons start from: tick 0 of the seed, stream 0. */
  base: SimState;
  memo: PathMemo;
}

// --- setup --------------------------------------------------------------------------------------

const gaugeName = (ref: string): string => ref.slice(ref.indexOf('.') + 1);

/** Gauge names a condition reads (`who.g`). */
function condGauges(cond: Condition | undefined, out: string[]): void {
  if (!cond) return;
  if ('all' in cond) cond.all.forEach((y) => condGauges(y, out));
  else if ('any' in cond) cond.any.forEach((y) => condGauges(y, out));
  else if ('not' in cond) condGauges(cond.not, out);
  else if ('gauge' in cond) out.push(gaugeName(cond.gauge));
}

/** Gauge names a score reads, in its terms and their conditions. */
function scoreGauges(sc: Score | undefined, out: string[]): void {
  for (const t of sc?.terms ?? []) {
    if ('gauge' in t) out.push(gaugeName(t.gauge));
    if ('if' in t) condGauges(t.if, out);
  }
}

export function fogSetup(c: Content, seed: number): FogSetup {
  const banded: Record<CatId, string[]> = {};
  const seeded: Record<CatId, Record<string, number>> = {};
  for (const def of c.cats) {
    const read: string[] = [];
    for (const a of def.activities) {
      const ad = need(c.activity, a, 'activity');
      condGauges(ad.gate, read);
      scoreGauges(ad.score, read);
    }
    for (const sl of c.storylets) {
      if (!storyletCats(c, sl).includes(def.id)) continue;
      condGauges(sl.trigger, read);
      for (const st of Object.values(sl.states))
        for (const e of st.exits) {
          condGauges(e.gate, read);
          scoreGauges(e.score, read);
        }
    }
    banded[def.id] = c.hooks
      .map((h) => h.id)
      .filter((g) => g in def.hooks && read.includes(g))
      .slice(0, c.tuning.fog.maxBandedGauges);
    seeded[def.id] = initialGauges(c, seed, `s0:${def.id}`, def.id);
  }
  const memo: PathMemo = {};
  return { c, seed, banded, seeded, base: initialState(c, seed, uniformStreams(c, 0), memo), memo };
}

// --- bands --------------------------------------------------------------------------------------

const span = (c: Content) => 1001 - c.hooksFloor;
export const bandOf = (c: Content, v: number): number =>
  Math.min(c.tuning.fog.bands - 1, Math.trunc(((v - c.hooksFloor) * c.tuning.fog.bands) / span(c)));
export const bandMid = (c: Content, b: number): number =>
  c.hooksFloor + Math.trunc(((2 * b + 1) * span(c)) / (2 * c.tuning.fog.bands));
const bandWidth = (c: Content): number => Math.trunc(span(c) / c.tuning.fog.bands);

// --- chain states as cats ---------------------------------------------------------------------------

/** A cat state that stands in for a chain state, so the shared decision code can read it. */
export function standIn(
  setup: FogSetup,
  id: CatId,
  s: ChainState,
  mean: Record<string, number>,
  stepTicks: number,
): CatState {
  const { c } = setup;
  const seeded = need(setup.seeded, id, 'cat');
  const base: Record<string, number> = { ...seeded };
  for (const g of Object.keys(mean)) base[g] = mean[g] ?? 0;
  for (const g of Object.keys(s.bands)) base[g] = bandMid(c, s.bands[g] ?? 0);
  let pos: CatState['pos'] = { at: s.walk ? s.walk.from : s.place };
  let route: NodeId[] = [];
  if (s.walk) {
    const w = s.walk;
    const nodes = [w.from, ...w.path];
    const ticks = (a: NodeId, b: NodeId) =>
      Math.trunc(need(c.edge, edgeBetween(c, a, b) ?? '', 'edge').minutes / c.world.tickMinutes);
    let elapsed = Math.trunc(((w.ofSteps - w.leftSteps) * pathTicks(c, nodes)) / w.ofSteps);
    for (let i = 0; i + 1 < nodes.length; i++) {
      const a = nodes[i] ?? '';
      const b = nodes[i + 1] ?? '';
      const of = ticks(a, b);
      if (elapsed < of) {
        pos =
          elapsed === 0
            ? { at: a }
            : { from: a, to: b, edge: edgeBetween(c, a, b) ?? '', left: of - elapsed, of };
        route = nodes.slice(elapsed === 0 ? i + 1 : i + 2);
        break;
      }
      elapsed -= of;
      pos = { at: b };
      route = nodes.slice(i + 2);
    }
  }
  return {
    pos,
    route,
    activity: s.activity,
    activityLeft: s.leftSteps * stepTicks,
    activityStart: 0,
    activityPlace: s.place,
    control: s.control,
    interrupt: s.interrupt && {
      action: s.interrupt.action,
      left: s.interrupt.leftSteps,
      by: 'fog',
    },
    base,
    initial: seeded,
    mods: [],
    pressure: 0,
    touchedBy: [],
    knowsClosed: [],
    heard: [],
    voiceAt: {},
  };
}

function pathTicks(c: Content, nodes: readonly NodeId[]): number {
  let sum = 0;
  for (let i = 0; i + 1 < nodes.length; i++)
    sum += need(c.edge, edgeBetween(c, nodes[i] ?? '', nodes[i + 1] ?? '') ?? '', 'edge').minutes;
  return Math.trunc(sum / c.world.tickMinutes);
}

// --- one case's context -------------------------------------------------------------------------------

/** A step context over one case: a skeleton state, and a fog reader over the case's chains. */
interface CaseCtx {
  ctx: Ctx;
  standIns: Record<CatId, StandIns>;
  deciding: { id: CatId | null };
}

function caseCtx(setup: FogSetup, fc: FogCase, t: number): CaseCtx {
  const { c } = setup;
  const K = c.tuning.fog.stepTicks;
  const s = structuredClone(setup.base);
  s.tick = t;
  s.weather.now = fc.weather === 'rain' ? 'rain' : 'dry';
  const standIns: Record<CatId, StandIns> = {};
  for (const def of c.cats) {
    const cat = fc.cats[def.id];
    if (cat)
      standIns[def.id] = cat.chain.map((e) => ({
        cat: standIn(setup, def.id, e.s, cat.mean, K),
        p: e.p,
      }));
  }
  const deciding: { id: CatId | null } = { id: null };
  const likely: Record<CatId, CatState> = {};
  for (const def of c.cats) {
    let best: StandIns[number] | undefined;
    for (const x of standIns[def.id] ?? []) if (best === undefined || x.p > best.p) best = x;
    if (best) likely[def.id] = best.cat;
  }
  const fog: FogReader = {
    chain: (id) => (id === deciding.id ? null : (standIns[id] ?? null)),
    likely: (id) => likely[id] ?? null,
    quantity: (key) =>
      key.startsWith('flag:') && (setup.base.flags[key.slice(5)]?.value ?? 0) !== 0 ? PPM : 0,
    counter: (name) => ({ mean: setup.base.counters[name] ?? 0, variance: 0 }),
    heard: () => 0,
  };
  const ctx: Ctx = {
    c,
    seed: setup.seed,
    streams: uniformStreams(c, 0),
    s,
    prev: s,
    t,
    events: [],
    pins: [],
    pick: () => {
      throw new Error('the fog never samples');
    },
    chanceN: 0,
    memo: setup.memo,
    fog,
  };
  return { ctx, standIns, deciding };
}

/** Evaluates `fn` with `id` standing as the given chain state (the cat deciding, not mixed). */
function as<T>(cc: CaseCtx, id: CatId, cat: CatState, fn: () => T): T {
  const saved = cc.ctx.s.cats[id];
  cc.ctx.s.cats[id] = cat;
  cc.deciding.id = id;
  try {
    return fn();
  } finally {
    if (saved) cc.ctx.s.cats[id] = saved;
    cc.deciding.id = null;
  }
}

// --- starting an activity -------------------------------------------------------------------------------

const ceilDiv = (a: number, b: number) => Math.trunc((a + b - 1) / b);

/** P(leftSteps = n) for an activity's duration [lo, hi] ticks, uniform over ticks (03 §13.2). */
function durationSteps(lo: number, hi: number, K: number): [number, number][] {
  const counts: [number, number][] = [];
  for (let d = lo; d <= hi; d++) {
    const n = Math.max(1, ceilDiv(d, K));
    const last = counts[counts.length - 1];
    if (last && last[0] === n) last[1] += 1;
    else counts.push([n, 1]);
  }
  const total = hi - lo + 1;
  return split(
    counts.map(([n, k]) => [n, k]),
    total,
  );
}

/** Splits 1 000 000 ppm by integer shares; the remainder goes to the first. */
function split<T>(shares: [T, number][], total: number): [T, number][] {
  const out = shares.map(([x, k]): [T, number] => [x, Math.trunc((k * PPM) / total)]);
  const first = out[0];
  if (first) first[1] += PPM - out.reduce((a, [, p]) => a + p, 0);
  return out;
}

/**
 * The chain states a cat may enter by starting `activity` from `from` (03 §13.2, §13.3): one per
 * place option (split evenly) and duration, walking first when the place is elsewhere.
 */
function starts(
  cc: CaseCtx,
  id: CatId,
  from: CatState,
  activity: string,
  bands: Record<string, number>,
  control: ChainState['control'],
): [ChainState, number][] {
  const { c, memo } = cc.ctx;
  const K = c.tuning.fog.stepTicks;
  const ad = c.activity[activity];
  const here = 'at' in from.pos ? from.pos.at : from.pos.to;
  if (!ad)
    return [
      [{ activity, place: here, walk: null, leftSteps: 0, bands, interrupt: null, control }, PPM],
    ];
  const places = as(cc, id, from, () => placeOptions(cc.ctx, id, ad.at));
  const out: [ChainState, number][] = [];
  for (const [place, pp] of split(
    places.map((n): [NodeId, number] => [n, 1]),
    places.length,
  )) {
    const route = place === here ? [] : path(c, here, place, { avoid: [], memo });
    if (route === null) continue;
    const walkSteps =
      route.length === 0 ? 0 : Math.max(1, ceilDiv(pathTicks(c, [here, ...route]), K));
    const walk =
      walkSteps === 0
        ? null
        : { from: here, path: route, leftSteps: walkSteps, ofSteps: walkSteps };
    for (const [leftSteps, dp] of durationSteps(ad.ticks[0], ad.ticks[1], K))
      out.push([
        { activity, place, walk, leftSteps, bands, interrupt: null, control },
        Math.trunc((pp * dp) / PPM),
      ]);
  }
  return out;
}

// --- initial chains ------------------------------------------------------------------------------------

/** The fog at tick 0: one case (dry), each cat at its start with its seeded stats (03 §13.2). */
export function initialFog(setup: FogSetup, fogged: readonly CatId[]): Fog {
  const { c } = setup;
  const fc: FogCase = {
    weight: WAVE_TOTAL,
    weather: c.world.weather.initial === 'rain' ? 'rain' : 'dry',
    cats: {},
  };
  const cc = caseCtx(setup, fc, 0);
  for (const def of c.cats) {
    if (!fogged.includes(def.id)) continue;
    const seeded = need(setup.seeded, def.id, 'cat');
    const bands: Record<string, number> = {};
    for (const g of need(setup.banded, def.id, 'cat')) bands[g] = bandOf(c, seeded[g] ?? 0);
    const mean: Record<string, number> = {};
    for (const h of c.hooks)
      if (h.id in def.hooks && !(h.id in bands)) mean[h.id] = seeded[h.id] ?? 0;
    const at: ChainState = {
      activity: 'none',
      place: def.start,
      walk: null,
      leftSteps: 0,
      bands,
      interrupt: null,
      control: 'free',
    };
    const first = standIn(setup, def.id, at, mean, c.tuning.fog.stepTicks);
    const chain = starts(cc, def.id, first, def.startActivity ?? 'none', bands, 'free').map(
      ([s, p]) => ({ s, p }),
    );
    fc.cats[def.id] = { chain: normalise(c, chain), mean };
  }
  return { tick: 0, cases: [fc] };
}

// --- normalising -----------------------------------------------------------------------------------------

const keyOf = (s: ChainState): string => JSON.stringify(s);

/**
 * Merges equal states, drops states below `fog.minStatePpm`, renormalises to 1 000 000 and sorts by
 * canonical key; the remainder goes to the first state (03 §13.2).
 */
export function normalise(c: Content, chain: readonly Entry[]): Entry[] {
  const byKey: Record<string, Entry> = {};
  const keys: string[] = [];
  for (const e of chain) {
    const k = keyOf(e.s);
    const seen = byKey[k];
    if (seen) seen.p += e.p;
    else {
      byKey[k] = { s: e.s, p: e.p };
      keys.push(k);
    }
  }
  keys.sort();
  let kept = keys.map((k) => need(byKey, k, 'state'));
  const floor = c.tuning.fog.minStatePpm;
  if (kept.some((e) => e.p >= floor)) kept = kept.filter((e) => e.p >= floor);
  const total = kept.reduce((a, e) => a + e.p, 0);
  const out = kept.map((e) => ({ s: e.s, p: Math.trunc((e.p * PPM) / total) }));
  const first = out[0];
  if (first) first.p += PPM - out.reduce((a, e) => a + e.p, 0);
  return out;
}

// --- one fog step ---------------------------------------------------------------------------------------

/** Ticks in [t, t + K) that `perTicks` divides. */
const hits = (t: number, K: number, perTicks: number): number => {
  let n = 0;
  for (let u = t; u < t + K; u++) if (u % perTicks === 0) n++;
  return n;
};

/** Hook rules over one step (03 §13.2): banded gauges move mass between bands; mean-field ones shift. */
function hooksStep(cc: CaseCtx, setup: FogSetup, id: CatId, fc: FogCat, t: number): FogCat {
  const { c } = setup;
  const K = c.tuning.fog.stepTicks;
  const width = bandWidth(c);
  const seeded = need(setup.seeded, id, 'cat');
  let chain = fc.chain;
  const mean = { ...fc.mean };
  // A rule's condition per state; states that differ only in steps left share it.
  const seen = new WeakMap<Condition, Record<string, number>>();
  const whenPpm = (e: Entry, cond: Condition | undefined): number => {
    if (!cond) return PPM;
    const memo = seen.get(cond) ?? {};
    seen.set(cond, memo);
    const key = decisionKey(e.s);
    const hit = memo[key];
    if (hit !== undefined) return hit;
    const p = as(cc, id, standIn(setup, id, e.s, fc.mean, K), () =>
      chance(cc.ctx, cond, { self: id }),
    );
    memo[key] = p;
    return p;
  };

  for (const h of c.hooks) {
    if (!(h.id in seeded)) continue;
    const rules: { when: Condition | undefined; perTicks: number; add: number; toward: boolean }[] =
      [];
    for (const r of h.rise)
      if ('perTicks' in r)
        rules.push({ when: r.when, perTicks: r.perTicks, add: r.add, toward: false });
    if (h.decay)
      rules.push({
        when: h.decay.when,
        perTicks: h.decay.perTicks,
        add: h.decay.add,
        toward: h.decay.toward === 'initial',
      });
    const init = seeded[h.id] ?? 0;
    for (const r of rules) {
      const add = r.add * hits(t, K, r.perTicks);
      if (add === 0) continue;
      if (h.id in mean) {
        let p = 0;
        for (const e of chain) p += Math.trunc((e.p * whenPpm(e, r.when)) / PPM);
        const v = mean[h.id] ?? 0;
        let next = clampBase(c, h.id, v + Math.trunc((add * p) / PPM));
        if (r.toward)
          next = add < 0 ? Math.max(Math.min(v, init), next) : Math.min(Math.max(v, init), next);
        mean[h.id] = next;
        continue;
      }
      const initBand = bandOf(c, init);
      const moved: Entry[] = [];
      for (const e of chain) {
        const b = e.s.bands[h.id];
        if (b === undefined) {
          moved.push(e);
          continue;
        }
        const dir = add > 0 ? 1 : -1;
        let limit = dir > 0 ? c.tuning.fog.bands - 1 : 0;
        if (r.toward) limit = dir > 0 ? Math.min(limit, initBand) : Math.max(limit, initBand);
        if ((dir > 0 && b >= limit) || (dir < 0 && b <= limit)) {
          moved.push(e);
          continue;
        }
        // trunc(|add| × 1e6 / bandWidth) ppm moves, scaled by the rule's condition (03 §13.2)
        const frac = Math.trunc(
          (Math.trunc((Math.abs(add) * PPM) / width) * whenPpm(e, r.when)) / PPM,
        );
        const whole = Math.trunc(frac / PPM);
        const rem = frac % PPM;
        const to = (n: number) => (dir > 0 ? Math.min(limit, b + n) : Math.max(limit, b - n));
        const at = (n: number, p: number) =>
          moved.push({ s: { ...e.s, bands: { ...e.s.bands, [h.id]: to(n) } }, p });
        const stay = Math.trunc((e.p * (PPM - rem)) / PPM);
        at(whole, stay);
        if (rem > 0) at(whole + 1, e.p - stay);
      }
      chain = moved;
    }
  }
  return { chain, mean };
}

/** Advances one cat's chain one fog step in one case (03 §13.2, §13.3). */
function catStep(cc: CaseCtx, setup: FogSetup, id: CatId, fc: FogCat, t: number): FogCat {
  const { c } = setup;
  const K = c.tuning.fog.stepTicks;
  const decisionStep = hits(t, K, c.decisionEveryTicks) > 0;
  const hooked = hooksStep(cc, setup, id, fc, t);
  const out: Entry[] = [];
  const decided: Record<string, { ppm: number; next: [ChainState, number][] | null }[]> = {};
  for (const e of hooked.chain) {
    let s = e.s;
    let ended = false;
    if (s.interrupt) {
      const left = s.interrupt.leftSteps - 1;
      out.push({
        s: { ...s, interrupt: left > 0 ? { ...s.interrupt, leftSteps: left } : null },
        p: e.p,
      });
      continue;
    }
    if (s.walk) {
      const left = s.walk.leftSteps - 1;
      s = { ...s, walk: left > 0 ? { ...s.walk, leftSteps: left } : null };
      ended = left === 0 && s.leftSteps === 0;
    } else if (s.leftSteps > 0) {
      s = { ...s, leftSteps: s.leftSteps - 1 };
      if (s.leftSteps === 0) {
        ended = true;
        s = { ...s, control: 'free' };
      }
    }
    if (s.control !== 'free' || s.walk || !(decisionStep || ended)) {
      out.push({ s, p: e.p });
      continue;
    }
    // The decision reads the state but not how many steps are left, only whether any are.
    const key = decisionKey(s);
    let outcome = decided[key];
    if (!outcome) {
      const me = standIn(setup, id, s, hooked.mean, K);
      const { cands, ppm } = as(cc, id, me, () => choices(cc.ctx, id));
      outcome = cands.map((cand, i) => ({
        ppm: ppm[i] ?? 0,
        next:
          cand.activity === s.activity && s.leftSteps > 0
            ? null
            : starts(cc, id, me, cand.activity, s.bands, 'free'),
      }));
      decided[key] = outcome;
    }
    if (outcome.length === 0) out.push({ s, p: e.p });
    for (const o of outcome) {
      const p = Math.trunc((e.p * o.ppm) / PPM);
      if (p === 0) continue;
      if (o.next === null) out.push({ s, p });
      else for (const [next, q] of o.next) out.push({ s: next, p: Math.trunc((p * q) / PPM) });
    }
  }
  return { chain: normalise(c, out), mean: hooked.mean };
}

/** A chain state with its remaining steps reduced to "some" or "none": what a decision reads. */
const decisionKey = (s: ChainState): string =>
  JSON.stringify({ ...s, leftSteps: s.leftSteps > 0 ? 1 : 0 });

/** Advances the fog one step of `fog.stepTicks` ticks (03 §13.2). */
export function fogStep(setup: FogSetup, fog: Fog): Fog {
  const t = fog.tick;
  const cases = fog.cases.map((fc) => {
    const cc = caseCtx(setup, fc, t);
    const cats: Record<CatId, FogCat> = {};
    for (const def of setup.c.cats) {
      const cat = fc.cats[def.id];
      if (cat) cats[def.id] = catStep(cc, setup, def.id, cat, t);
    }
    return { ...fc, cats };
  });
  return { tick: t + setup.c.tuning.fog.stepTicks, cases };
}

// --- live cats as chains --------------------------------------------------------------------------------

/**
 * A live cat as a point mass (03 §13.1, §13.4): its activity, place and remaining walk, banded
 * gauges in the band holding their value, the rest as exact expected values.
 */
export function pointMass(setup: FogSetup, id: CatId, cs: CatState): FogCat {
  const { c } = setup;
  const K = c.tuning.fog.stepTicks;
  const value = (g: string) => {
    let v = cs.base[g] ?? 0;
    for (const m of cs.mods) if (m.gauge === g) v += m.add;
    return clampBase(c, g, v);
  };
  const bands: Record<string, number> = {};
  for (const g of need(setup.banded, id, 'cat')) bands[g] = bandOf(c, value(g));
  const mean: Record<string, number> = {};
  for (const h of c.hooks) if (h.id in cs.base && !(h.id in bands)) mean[h.id] = value(h.id);
  const from = 'at' in cs.pos ? cs.pos.at : cs.pos.from;
  const rest = 'at' in cs.pos ? cs.route : [cs.pos.to, ...cs.route];
  const ticks = rest.length === 0 ? 0 : pathTicks(c, [from, ...rest]);
  const walkSteps = ticks === 0 ? 0 : Math.max(1, ceilDiv(ticks, K));
  const s: ChainState = {
    activity: cs.activity,
    place: cs.activityPlace ?? (rest.length > 0 ? (rest[rest.length - 1] ?? from) : from),
    walk: walkSteps === 0 ? null : { from, path: rest, leftSteps: walkSteps, ofSteps: walkSteps },
    leftSteps: ceilDiv(cs.activityLeft, K),
    bands,
    interrupt: cs.interrupt && {
      action: cs.interrupt.action,
      leftSteps: ceilDiv(cs.interrupt.left, K),
    },
    control: cs.control,
  };
  return { chain: [{ s, p: PPM }], mean };
}

/** The decision function called by the fog for one chain state in one case (for tests). */
export function fogChoices(setup: FogSetup, fc: FogCase, t: number, id: CatId, s: ChainState) {
  const cc = caseCtx(setup, fc, t);
  const mean = fc.cats[id]?.mean ?? {};
  const me = standIn(setup, id, s, mean, setup.c.tuning.fog.stepTicks);
  return as(cc, id, me, () => choices(cc.ctx, id));
}
