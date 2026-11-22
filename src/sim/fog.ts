// The fog: cat chains and world quantities per case, computed, never simulated (spec 03 §13).
import type { StoryletDef } from '../content/schemas/chapter';
import type { Condition, Effect, Score } from '../content/schemas/dsl';
import {
  BOREDOM,
  boredomRate,
  choices,
  clampBase,
  conditionVector,
  gaugeBand,
  initialGauges,
  placeOptions,
  readsOf,
} from './cats';
import { cats as catsOf, chance, flagKey } from './conditions';
import {
  addCounter,
  addFactChance,
  raiseFactPart,
  setFact,
  addHeard,
  clearFlag,
  counterOf,
  flagChance,
  INACTIVE,
  initialQuantities,
  mixQuantities,
  or,
  renormalise,
  setFlag,
  times,
  type FogEvent,
  type Quantities,
} from './fog-quantities';
import { initialState, uniformStreams } from './history';
import { PPM } from './math';
import {
  buildPerceptionTable,
  buildReaders,
  requirementFacts,
  storyletCats,
  tablePerceives,
} from './readers';
import type { Link, PerceptionTable } from './readers';
import { detectorCats } from './sifting';
import { catNode, edgeBetween, inWindow, path, type PathMemo } from './space';
import { bindRoles, choiceOptions, exitOptions } from './storylets';
import type {
  CatId,
  CatState,
  Content,
  Ctx,
  FogReader,
  NodeId,
  Scope,
  SimState,
  StandIns,
} from './types';
import { need, newDecisionMemo, type DecisionMemo } from './types';

/** One possible state of a fogged cat (03 §13.2). Walking and durations count fog steps. */
export interface ChainState {
  activity: string;
  place: NodeId;
  walk: null | { from: NodeId; path: NodeId[]; leftSteps: number; ofSteps: number };
  bands: Record<string, number>;
  interrupt: null | { action: string; leftSteps: number };
  control: 'free' | 'storylet' | 'forced';
}

export interface Entry {
  s: ChainState;
  p: number; // ppm within the cat's chain in this case
  /** Transient, within one step: this mass changed its decision key (03 §13.3). Never stored. */
  d?: boolean;
}

/** A fogged cat in one case: its chain and its mean-field gauges (expected values). */
export interface FogCat {
  chain: Entry[];
  mean: Record<string, number>;
  /** The cat's decision conditions at its last step, hashed (03 §13.3); -1 = none yet. */
  conds: number;
}

export type Weather = 'dry' | 'rain' | 'stopped';

export interface FogCase {
  weight: number; // out of WAVE_TOTAL
  weather: Weather;
  /** While raining in a projection: the start tick's distribution, [tick, ppm] by tick (03 §13.5). */
  rainStart: [number, number][];
  /** Each link's value in this case: 0 (not yet) or 1 (03 §13.5), by link key. */
  links: Record<string, 0 | 1>;
  cats: Record<CatId, FogCat>;
  q: Quantities;
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
  /** The decision cache shared by every case and step (03 §8.2). */
  decisions: DecisionMemo;
  links: Link[];
  table: PerceptionTable;
  /** Per cat, the gauges its decisions read (boredom included): a band move of one is a trigger. */
  reads: Record<CatId, string[]>;
  /** Detectors the fog estimates: those something reads or a requirement names (03 §13.6). */
  detectors: string[];
  nodeIndex: Record<NodeId, number>;
}

export const linkKey = (l: Link): string =>
  l.kind === 'fact' ? `fact:${l.fact}` : `state:${l.storylet}.${l.state}`;

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
  const decisions = newDecisionMemo();
  const reads: Record<CatId, string[]> = {};
  for (const def of c.cats) {
    const names = [BOREDOM];
    for (const a of def.activities)
      for (const ref of readsOf(c, decisions, a).gauges) {
        const [who, g] = ref.includes('.')
          ? [ref.slice(0, ref.indexOf('.')), gaugeName(ref)]
          : ['self', ref];
        if ((who === 'self' || who === def.id) && !names.includes(g)) names.push(g);
      }
    reads[def.id] = names;
  }
  const readers = buildReaders(c);
  const required = requirementFacts(c);
  return {
    c,
    seed,
    banded,
    seeded,
    base: initialState(c, seed, uniformStreams(c, 0), memo),
    memo,
    decisions,
    reads,
    links: readers.links,
    table: buildPerceptionTable(c),
    detectors: c.detectors
      .filter((d) => required.includes(d.emits) || readers.of[`fact:${d.emits}`] !== undefined)
      .map((d) => d.id),
    nodeIndex: Object.fromEntries(c.nodes.map((n, i) => [n.id, i])),
  };
}

// --- bands --------------------------------------------------------------------------------------

const span = (c: Content) => 1001 - c.hooksFloor;
/** The width of one band of a gauge's range (boredom and traits start at 0, hooks at the floor). */
const widthOf = (c: Content, g: string): number =>
  Math.trunc((g === BOREDOM ? 1001 : span(c)) / c.tuning.fog.bands);
/** The midpoint of band b of a gauge (03 §13.2). */
const midOf = (c: Content, g: string, b: number): number =>
  g === BOREDOM ? Math.trunc(((2 * b + 1) * 1001) / (2 * c.tuning.fog.bands)) : bandMid(c, b);
export const bandOf = (c: Content, v: number): number =>
  Math.min(c.tuning.fog.bands - 1, Math.trunc(((v - c.hooksFloor) * c.tuning.fog.bands) / span(c)));
export const bandMid = (c: Content, b: number): number =>
  c.hooksFloor + Math.trunc(((2 * b + 1) * span(c)) / (2 * c.tuning.fog.bands));

/**
 * A gauge change of `add` on one state (03 §13.2): `trunc(|add| × 1e6 / bandWidth)` ppm of the mass,
 * scaled by `ppm`, moves toward `limit` (whole bands first, then the fraction).
 */
function bandMove(
  c: Content,
  e: Entry,
  g: string,
  add: number,
  ppm: number,
  limit?: number,
  mark = false,
): Entry[] {
  const b = e.s.bands[g];
  if (b === undefined || add === 0 || ppm === 0) return [e];
  const dir = add > 0 ? 1 : -1;
  const lim = limit ?? (dir > 0 ? c.tuning.fog.bands - 1 : 0);
  if ((dir > 0 && b >= lim) || (dir < 0 && b <= lim)) return [e];
  const frac = times(Math.trunc((Math.abs(add) * PPM) / widthOf(c, g)), ppm);
  const whole = Math.trunc(frac / PPM);
  const rem = frac % PPM;
  const to = (n: number) => (dir > 0 ? Math.min(lim, b + n) : Math.max(lim, b - n));
  const at = (n: number, p: number): Entry => ({
    s: { ...e.s, bands: { ...e.s.bands, [g]: to(n) } },
    p,
    ...((e.d === true || (mark && n > 0)) && { d: true }),
  });
  const stay = times(e.p, PPM - rem);
  return rem > 0 ? [at(whole, stay), at(whole + 1, e.p - stay)] : [at(whole, e.p)];
}

/** A gauge set to `v` on a fraction `ppm` of one state's mass. */
function bandSet(c: Content, e: Entry, g: string, v: number, ppm: number): Entry[] {
  if (e.s.bands[g] === undefined) return [e];
  const moved = times(e.p, ppm);
  const set: Entry = {
    s: { ...e.s, bands: { ...e.s.bands, [g]: bandOf(c, clampBase(c, g, v)) } },
    p: moved,
  };
  return moved === e.p ? [set] : [{ s: e.s, p: e.p - moved }, set];
}

/** A gauge effect on a cat's mean-field value with probability `ppm`. */
function meanEffect(
  c: Content,
  fc: { mean: Record<string, number> },
  g: string,
  add: number | null,
  set: number | null,
  ppm: number,
) {
  const v = fc.mean[g];
  if (v === undefined) return;
  if (set !== null) fc.mean[g] = v + times(clampBase(c, g, set) - v, ppm);
  else if (add !== null) fc.mean[g] = clampBase(c, g, v + times(add, ppm));
}

// --- chain states as cats ---------------------------------------------------------------------------

/** A cat state that stands in for a chain state, so the shared decision code can read it. */
export function standIn(
  setup: FogSetup,
  id: CatId,
  s: ChainState,
  mean: Record<string, number>,
): CatState {
  const { c } = setup;
  const seeded = need(setup.seeded, id, 'cat');
  const base: Record<string, number> = { ...seeded };
  for (const g of Object.keys(mean)) base[g] = mean[g] ?? 0;
  for (const g of Object.keys(s.bands)) if (g !== BOREDOM) base[g] = bandMid(c, s.bands[g] ?? 0);
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
    boredom: midOf(c, BOREDOM, s.bands[BOREDOM] ?? 0),
    forcedLeft: 0,
    lastKey: -1,
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

/** The node a chain state stands at for perception: a walking cat at the nearer end of its edge. */
const stateNode = (setup: FogSetup, id: CatId, s: ChainState): NodeId =>
  s.walk ? catNode(standIn(setup, id, s, {})) : s.place;

// --- one case's context -------------------------------------------------------------------------------

/**
 * A step context over one case: a skeleton state, and a fog reader over the case's chains.
 * `finished` gives P(the cat finished the activity in this step) to `activityFinished`, on the
 * step's first tick only.
 */
interface CaseCtx {
  ctx: Ctx;
  standIns: Record<CatId, StandIns>;
  deciding: { id: CatId | null };
  /** A chain state's stand-in, built once per fog step (shared by every case of the step). */
  stand: (id: CatId, s: ChainState, mean: Record<string, number>) => CatState;
  /** A chain state's canonical key, built once per fog step. */
  key: (s: ChainState) => string;
}

/**
 * What one fog step shares between its cases: stand-ins by cat, state and mean-field values, and
 * the canonical keys of the states and mean-field records it has seen (by object, so never stale).
 */
interface StepMemo {
  stands: Record<string, CatState>;
  keys: WeakMap<ChainState, string>;
  means: WeakMap<Record<string, number>, string>;
}

const newStepMemo = (): StepMemo => ({ stands: {}, keys: new WeakMap(), means: new WeakMap() });

function caseCtx(
  setup: FogSetup,
  fc: FogCase,
  t: number,
  step: StepMemo,
  finished: Record<CatId, Record<string, number>> = {},
): CaseCtx {
  const { c } = setup;
  // a skeleton: only `tick`, `weather.now` and whole cats are ever replaced, nothing deeper
  const s: SimState = {
    ...setup.base,
    tick: t,
    weather: { ...setup.base.weather, now: fc.weather === 'rain' ? 'rain' : 'dry' },
    cats: { ...setup.base.cats },
  };
  const key = (cs: ChainState): string => {
    let k = step.keys.get(cs);
    if (k === undefined) {
      k = keyOf(cs);
      step.keys.set(cs, k);
    }
    return k;
  };
  const meanKey = (mean: Record<string, number>): string => {
    let k = step.means.get(mean);
    if (k === undefined) {
      k = JSON.stringify(mean);
      step.means.set(mean, k);
    }
    return k;
  };
  const stand = (id: CatId, cs: ChainState, mean: Record<string, number>): CatState => {
    const k = `${id}|${key(cs)}|${meanKey(mean)}`;
    return (step.stands[k] ??= standIn(setup, id, cs, mean));
  };
  const standIns: Record<CatId, StandIns> = {};
  for (const def of c.cats) {
    const cat = fc.cats[def.id];
    if (cat)
      standIns[def.id] = cat.chain.map((e) => ({ cat: stand(def.id, e.s, cat.mean), p: e.p }));
  }
  const deciding: { id: CatId | null } = { id: null };
  const likely: Record<CatId, CatState> = {};
  for (const def of c.cats) {
    let best: StandIns[number] | undefined;
    for (const x of standIns[def.id] ?? []) if (best === undefined || x.p > best.p) best = x;
    if (best) {
      likely[def.id] = best.cat;
      s.cats[def.id] = best.cat; // reads that do not mix (role binding, gauges in scores) see it
    }
  }
  const { q } = fc;
  const fog: FogReader = {
    chain: (id) => (id === deciding.id ? null : (standIns[id] ?? null)),
    likely: (id) => likely[id] ?? null,
    quantity: (key) => {
      if (key.startsWith('fact:')) return q.facts[key.slice(5)] ?? 0;
      if (key.startsWith('flag:')) return flagChance(q, key.slice(5), ctx.t);
      const dot = key.indexOf('.');
      return q.storylets[key.slice(6, dot)]?.p[key.slice(dot + 1)] ?? 0;
    },
    counter: (name) => counterOf(q, name),
    heard: (id, event) => q.heard[id]?.[event] ?? 0,
    finished: (id, a) => (ctx.t === t ? (finished[id]?.[a] ?? 0) : 0),
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
    decisions: setup.decisions,
    fog,
    partsMemo: {},
  };
  return { ctx, standIns, deciding, stand, key };
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

/** Splits 1 000 000 ppm by integer shares; the remainder goes to the first. */
function split<T>(shares: [T, number][], total: number): [T, number][] {
  const out = shares.map(([x, k]): [T, number] => [x, Math.trunc((k * PPM) / total)]);
  const first = out[0];
  if (first) first[1] += PPM - out.reduce((a, [, p]) => a + p, 0);
  return out;
}

/** The walk from `here` to `place` (null: already there; undefined: no path). */
function walkTo(
  c: Content,
  memo: PathMemo,
  here: NodeId,
  place: NodeId,
  opts: { via?: string[] | undefined; edgesTagged?: string | undefined } = {},
): ChainState['walk'] | undefined {
  if (place === here) return null;
  const route = path(c, here, place, { avoid: [], memo, ...opts });
  if (route === null) return undefined;
  const steps = Math.max(1, ceilDiv(pathTicks(c, [here, ...route]), c.tuning.fog.stepTicks));
  return { from: here, path: route, leftSteps: steps, ofSteps: steps };
}

/**
 * The chain states a cat may enter by starting `activity` from `from` (03 §13.2, §13.3): one per
 * place option (split evenly), walking first when the place is elsewhere, boredom at 0.
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
  const ad = c.activity[activity];
  const here = 'at' in from.pos ? from.pos.at : from.pos.to;
  const fresh = { ...bands, [BOREDOM]: 0 }; // a switch resets boredom (03 §8.2)
  if (!ad)
    return [[{ activity, place: here, walk: null, bands: fresh, interrupt: null, control }, PPM]];
  const places = as(cc, id, from, () => placeOptions(cc.ctx, id, ad.at));
  const out: [ChainState, number][] = [];
  for (const [place, pp] of split(
    places.map((n): [NodeId, number] => [n, 1]),
    places.length,
  )) {
    const walk = walkTo(c, memo, here, place);
    if (walk === undefined) continue;
    out.push([{ activity, place, walk, bands: fresh, interrupt: null, control }, pp]);
  }
  return out;
}

// --- initial fog ---------------------------------------------------------------------------------------

/** The fog at tick 0: one case, each fogged cat at its start with its seeded stats (03 §13.2). */
export function initialFog(setup: FogSetup, fogged: readonly CatId[]): Fog {
  const { c } = setup;
  const links: Record<string, 0 | 1> = {};
  for (const l of setup.links) links[linkKey(l)] = 0;
  const fc: FogCase = {
    weight: WAVE_TOTAL,
    weather: c.world.weather.initial === 'rain' ? 'rain' : 'dry',
    rainStart: c.world.weather.initial === 'rain' ? [[0, PPM]] : [],
    links,
    cats: {},
    q: initialQuantities(c),
  };
  const cc = caseCtx(setup, fc, 0, newStepMemo());
  for (const def of c.cats) {
    if (!fogged.includes(def.id)) continue;
    const seeded = need(setup.seeded, def.id, 'cat');
    const bands: Record<string, number> = { [BOREDOM]: 0 };
    for (const g of need(setup.banded, def.id, 'cat')) bands[g] = bandOf(c, seeded[g] ?? 0);
    const mean: Record<string, number> = {};
    for (const h of c.hooks)
      if (h.id in def.hooks && !(h.id in bands)) mean[h.id] = seeded[h.id] ?? 0;
    const at: ChainState = {
      activity: 'none',
      place: def.start,
      walk: null,
      bands,
      interrupt: null,
      control: 'free',
    };
    const first = standIn(setup, def.id, at, mean);
    const chain = starts(cc, def.id, first, def.startActivity ?? 'none', bands, 'free').map(
      ([s, p]) => ({ s, p }),
    );
    fc.cats[def.id] = { chain: normalise(c, chain), mean, conds: -1 };
  }
  return { tick: 0, cases: [fc] };
}

// --- normalising -----------------------------------------------------------------------------------------

const keyOf = (s: ChainState): string => JSON.stringify(s);

/** Whether a condition reads a gauge anywhere in it. */
const readsGauge = (cond: Condition): boolean =>
  'all' in cond
    ? cond.all.some(readsGauge)
    : 'any' in cond
      ? cond.any.some(readsGauge)
      : 'not' in cond
        ? readsGauge(cond.not)
        : 'gauge' in cond;

/**
 * Merges equal states, drops states below `fog.minStatePpm`, renormalises to 1 000 000 and sorts by
 * canonical key; the remainder goes to the first state (03 §13.2).
 */
export function normalise(c: Content, chain: readonly Entry[]): Entry[] {
  const byKey: Record<string, Entry> = {};
  const keys: string[] = [];
  for (const e of chain) {
    if (e.p <= 0) continue;
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

// --- effects in the fog -------------------------------------------------------------------------------------

/** What a case's step collects: events, and storylet effects on fogged cats to apply to chains. */
interface Sink {
  events: FogEvent[];
  catFx: { cat: CatId; mass: number; effect: Effect; scope: Scope }[];
  finished: Record<CatId, Record<string, number>>;
}

/** P(the cat stands at each node), from its chain (a live cat: its node). */
function nodeMass(setup: FogSetup, cc: CaseCtx, id: CatId): [NodeId, number][] {
  const chain = cc.standIns[id];
  if (!chain) {
    const cs = cc.ctx.s.cats[id];
    return cs ? [[catNode(cs), PPM]] : [];
  }
  const out: [NodeId, number][] = [];
  for (const x of chain) {
    const n = catNode(x.cat);
    const seen = out.find((y) => y[0] === n);
    if (seen) seen[1] += x.p;
    else out.push([n, x.p]);
  }
  return out;
}

/**
 * World effects with probability `m` (03 §13.6): facts and flags gain `m`, counters a Bernoulli term,
 * events `m` at their place, triggers activate with `m`; effects on fogged cats are queued for the
 * chains. `here` is where `self` stands (an activity's own state). Effects on live cats are left to
 * the lantern (decisions.md, M2).
 */
function fogEffects(
  setup: FogSetup,
  cc: CaseCtx,
  q: Quantities,
  list: readonly Effect[],
  scope: Scope,
  m: number,
  sink: Sink,
  here: NodeId | null = null,
  source = '',
): void {
  const { c } = setup;
  const ctx = cc.ctx;
  const fogged = (id: CatId) => cc.standIns[id] !== undefined;
  const atSelf = (id: CatId | null | undefined): [NodeId, number][] =>
    !id ? [] : id === scope.self && here !== null ? [[here, PPM]] : nodeMass(setup, cc, id);
  for (const e of list) {
    const mass = e.chance === undefined ? m : times(m, e.chance * 1000);
    if (mass <= 0) continue;
    if ('goTo' in e || 'startActivity' in e || 'stop' in e || 'interrupt' in e || 'gauge' in e) {
      const who =
        'goTo' in e
          ? e.goTo[0]
          : 'startActivity' in e
            ? e.startActivity[0]
            : 'stop' in e
              ? e.stop
              : 'interrupt' in e
                ? e.interrupt[0]
                : e.gauge.slice(0, e.gauge.indexOf('.'));
      for (const id of catsOf(ctx, scope, who))
        if (fogged(id)) sink.catFx.push({ cat: id, mass, effect: e, scope });
    } else if ('emit' in e) {
      const source =
        (e.from ? catsOf(ctx, scope, e.from)[0] : undefined) ?? scope.self ?? scope.origin ?? null;
      const to = e.to ? (catsOf(ctx, scope, e.to)[0] ?? null) : null;
      const where: [NodeId, number][] = e.at ? [[e.at, PPM]] : source ? atSelf(source) : atSelf(to);
      for (const [node, p] of where)
        sink.events.push({
          name: e.emit,
          node,
          p: times(mass, p),
          radiusM: e.radiusM ?? null,
          source,
          to,
          global: false,
          factIfPerceivedBy: e.factIfPerceivedBy ?? null,
        });
    } else if ('trigger' in e) {
      activateMass(setup, cc, q, need(c.storylet, e.trigger, 'storylet'), mass, sink);
    } else if ('flag' in e) {
      const value =
        e.value === undefined ? 1 : typeof e.value === 'boolean' ? Number(e.value) : e.value;
      const nodes: [NodeId | null, number][] =
        e.at === undefined
          ? [[null, PPM]]
          : c.node[e.at]
            ? [[e.at, PPM]]
            : atSelf(catsOf(ctx, scope, e.at)[0]);
      for (const [node, p] of nodes) {
        const key = flagKey(e.flag, node);
        if (value === 0) clearFlag(q, key, times(mass, p));
        else setFlag(q, key, times(mass, p), e.ttl === undefined ? null : ctx.t + e.ttl);
      }
    } else if ('counter' in e) {
      addCounter(q, e.counter, e.add, mass);
    } else if ('fact' in e) {
      addFactChance(q, e.fact, mass, source);
    } else {
      const never: never = e;
      throw new Error(`unknown effect ${JSON.stringify(never)}`);
    }
  }
}

/** A storylet effect on a fraction `mass` of a fogged cat's chain (03 §13.6, independence assumed). */
function catEffect(
  setup: FogSetup,
  cc: CaseCtx,
  id: CatId,
  fc: FogCat,
  mass: number,
  e: Effect,
): FogCat {
  const { c } = setup;
  const K = c.tuning.fog.stepTicks;
  if ('gauge' in e) {
    const g = gaugeName(e.gauge);
    const mean = { ...fc.mean };
    const out = { chain: fc.chain, mean, conds: fc.conds };
    meanEffect(c, out, g, e.add ?? null, e.set ?? null, mass);
    // QUESTION-free approximation: a held mod (`holdTicks`) on a fogged cat does not shift back.
    out.chain = fc.chain.flatMap((x) =>
      e.set !== undefined ? bandSet(c, x, g, e.set, mass) : bandMove(c, x, g, e.add ?? 0, mass),
    );
    return out;
  }
  const chain: Entry[] = [];
  for (const x of fc.chain) {
    const moved = times(x.p, mass);
    if (moved < x.p) chain.push({ s: x.s, p: x.p - moved });
    if (moved === 0) continue;
    const me = cc.stand(id, x.s, fc.mean);
    const here = 'at' in me.pos ? me.pos.at : me.pos.to;
    if ('goTo' in e) {
      const walk = walkTo(c, cc.ctx.memo, here, e.goTo[1], {
        via: e.route === 'via' ? e.via : undefined,
        edgesTagged: e.route === 'edgesTagged' ? e.tag : undefined,
      });
      if (walk === undefined) chain.push({ s: x.s, p: moved });
      else
        chain.push({
          s: {
            ...x.s,
            activity: 'goTo',
            place: e.goTo[1],
            walk,
            bands: { ...x.s.bands, [BOREDOM]: 0 },
            control: 'storylet',
          },
          p: moved,
        });
    } else if ('startActivity' in e) {
      const next = starts(cc, id, me, e.startActivity[1], x.s.bands, 'storylet');
      if (next.length === 0) chain.push({ s: x.s, p: moved });
      for (const [s, p] of next) chain.push({ s, p: times(moved, p) });
    } else if ('stop' in e) {
      chain.push({
        s: { ...x.s, activity: 'none', place: here, walk: null, control: 'free' },
        d: true,
        p: moved,
      });
    } else if ('interrupt' in e) {
      chain.push({
        s: {
          ...x.s,
          interrupt: { action: e.interrupt[1], leftSteps: Math.max(1, ceilDiv(e.interrupt[2], K)) },
        },
        p: moved,
      });
    } else chain.push({ s: x.s, p: moved });
  }
  return { chain, mean: fc.mean, conds: fc.conds };
}

// --- storylets in the fog --------------------------------------------------------------------------------

const isTerminal = (def: StoryletDef, st: string) => (def.states[st]?.exits.length ?? 0) === 0;

const origin = (def: StoryletDef, roles: Record<string, CatId[]>): CatId | undefined => {
  for (const name of Object.keys(def.roles)) {
    const first = roles[name]?.[0];
    if (first) return first;
  }
  return undefined;
};

/** Enters `state` with mass `m`: moves it in the distribution, runs onEnter, emits the storylet event. */
function enterMass(
  setup: FogSetup,
  cc: CaseCtx,
  q: Quantities,
  def: StoryletDef,
  roles: Record<string, CatId[]>,
  state: string,
  m: number,
  sink: Sink,
): void {
  if (m <= 0) return;
  const scope: Scope = { roles, storylet: def.id, origin: origin(def, roles) };
  const onEnter = need(def.states, state, 'storylet state').onEnter ?? [];
  // a once-storylet enters a state by disjoint masses, so its facts add up (03 §13.6)
  fogEffects(setup, cc, q, onEnter, scope, m, sink, null, def.once ? `sl:${def.id}.${state}` : '');
  for (const [node, p] of nodeMass(setup, cc, scope.origin ?? ''))
    sink.events.push({
      name: `storylet:${def.id}.${state}`,
      node,
      p: times(m, p),
      radiusM: null,
      source: scope.origin ?? null,
      to: null,
      global: false,
      factIfPerceivedBy: null,
    });
}

/** Activates a fog storylet with probability `m` of its inactive mass (a trigger effect). */
function activateMass(
  setup: FogSetup,
  cc: CaseCtx,
  q: Quantities,
  def: StoryletDef,
  m: number,
  sink: Sink,
): void {
  const sl = q.storylets[def.id];
  if (!sl) return;
  const roles = sl.roles ?? bindRoles(cc.ctx, def);
  if (!roles) return;
  const moved = times(sl.p[INACTIVE] ?? 0, m);
  if (moved <= 0) return;
  sl.roles = roles;
  sl.p[INACTIVE] = (sl.p[INACTIVE] ?? 0) - moved;
  sl.p[def.start] = (sl.p[def.start] ?? 0) + moved;
  enterMass(setup, cc, q, def, roles, def.start, moved, sink);
}

/** P(the actor is available and chooses each option), averaged over its chain (03 §13.6). */
function fogChoice(
  cc: CaseCtx,
  def: StoryletDef,
  state: string,
  choices: Parameters<typeof choiceOptions>[3],
  actor: CatId,
  scope: Scope,
): number[] {
  const n = choices.length + 1;
  const chain = cc.standIns[actor];
  const one = (cs: CatState): number[] =>
    !('at' in cs.pos) || cs.interrupt
      ? Array.from({ length: n }, () => 0)
      : choiceOptions(cc.ctx, def, state, choices, actor, scope).map((o) => o.ppm);
  if (!chain) {
    const cs = cc.ctx.s.cats[actor];
    return cs ? one(cs) : Array.from({ length: n }, () => 0);
  }
  const sum = Array.from({ length: n }, () => 0);
  for (const x of chain) {
    const opts = as(cc, actor, x.cat, () => one(x.cat));
    for (let i = 0; i < n; i++) sum[i] = (sum[i] ?? 0) + times(x.p, opts[i] ?? 0);
  }
  return sum;
}

/** A storylet transition that sets a link still false in this case, with its mass this step. */
interface LinkFire {
  storylet: string;
  state: string;
  fact: string;
  m: number;
  roles: Record<string, CatId[]>;
}

/** The link fact a state's onEnter sets for sure, if that link is still 0 in the case. */
function linkFact(
  setup: FogSetup,
  def: StoryletDef,
  state: string,
  links: Readonly<Record<string, 0 | 1>>,
): string | null {
  for (const e of def.states[state]?.onEnter ?? [])
    if ('fact' in e && e.chance === undefined && links[`fact:${e.fact}`] === 0) return e.fact;
  return null;
}

/**
 * One fog step of every storylet the fog holds (03 §13.6): transitions, then activation. Gates
 * and triggers are read at the step's first tick; hazards compound over its ticks; choices happen
 * when the step holds a decision tick; at most one transition per step (decisions.md, M2).
 */
function storyletsTick(
  setup: FogSetup,
  cc: CaseCtx,
  q: Quantities,
  held: readonly string[],
  sink: Sink,
  links: Readonly<Record<string, 0 | 1>>,
): LinkFire | null {
  const { c } = setup;
  const ctx = cc.ctx;
  const K = c.tuning.fog.stepTicks;
  const decisionStep = hits(ctx.t, K, c.decisionEveryTicks) > 0;
  let fire: LinkFire | null = null;
  for (const def of c.storylets) {
    if (!held.includes(def.id)) continue;
    const sl = need(q.storylets, def.id, 'storylet');
    const roles = sl.roles;
    const before = { ...sl.p };
    const entered: [string, number][] = [];
    const move = (from: string, to: string, m: number) => {
      if (m <= 0) return;
      sl.p[from] = (sl.p[from] ?? 0) - m;
      sl.p[to] = (sl.p[to] ?? 0) + m;
      entered.push([to, m]);
    };
    if (roles) {
      const scope: Scope = { roles, storylet: def.id, origin: origin(def, roles) };
      for (const state of Object.keys(def.states)) {
        const m = before[state] ?? 0;
        if (m <= 0 || isTerminal(def, state)) continue;
        const { autos, hazard, choices, actor } = exitOptions(ctx, def, state, scope);
        let rest = m;
        const auto = autos[0];
        if (auto) {
          const mv = times(rest, auto.ppm);
          move(state, auto.to, mv);
          rest -= mv;
        }
        // hazards compound over the step's ticks: P(none) = stay^K, shared by rate
        const stay = hazard[hazard.length - 1]?.ppm ?? PPM;
        let none = PPM;
        for (let k = 0; k < K; k++) none = times(none, stay);
        const fired = times(rest, PPM - none);
        for (const h of hazard.slice(0, -1)) {
          const mv = PPM === stay ? 0 : Math.trunc((fired * h.ppm) / (PPM - stay));
          move(state, h.label, mv);
          rest -= mv;
        }
        if (decisionStep && actor && choices.length > 0) {
          const ppm = fogChoice(cc, def, state, choices, actor, scope);
          const avail = rest;
          choices.forEach((e, i) => {
            const mv = times(avail, ppm[i] ?? 0);
            move(state, e.to, mv);
            rest -= mv;
          });
        }
      }
    }
    // activation: the running maximum of the trigger's chance (03 §13.6)
    const bound = roles ?? bindRoles(ctx, def);
    const inactive = sl.p[INACTIVE] ?? 0;
    if (bound && inactive > 0) {
      const trig = chance(ctx, def.trigger, { roles: bound });
      const m = def.once
        ? Math.min(inactive, Math.max(0, trig - (PPM - inactive)))
        : times(trig, inactive);
      if (m > 0) {
        sl.roles = bound;
        move(INACTIVE, def.start, m);
      }
    }
    const r = sl.roles;
    if (r)
      for (const [state, m] of entered) {
        // The first transition this step that sets a link still false splits the case (03 §13.5)
        const fact: string | null = fire === null ? linkFact(setup, def, state, links) : null;
        if (fact !== null) {
          const same = entered.filter(([st]) => st === state).reduce((a, [, x]) => a + x, 0);
          fire = { storylet: def.id, state, fact, m: same, roles: r };
        }
        if (fire?.storylet === def.id && fire.state === state) continue;
        enterMass(setup, cc, q, def, r, state, m, sink);
      }
    if (!def.once)
      for (const state of Object.keys(def.states))
        if (isTerminal(def, state)) move(state, INACTIVE, sl.p[state] ?? 0);
    for (const k of Object.keys(sl.p)) if ((sl.p[k] ?? 0) <= 0) delete sl.p[k];
  }
  return fire;
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
  const seeded = need(setup.seeded, id, 'cat');
  let chain = fc.chain;
  const mean = { ...fc.mean };
  // A rule's condition per state; states that differ only in steps left share it.
  const seen = new WeakMap<Condition, Record<string, number>>();
  const whenPpm = (e: Entry, cond: Condition | undefined): number => {
    if (!cond) return PPM;
    const memo = seen.get(cond) ?? {};
    seen.set(cond, memo);
    // a condition that reads no gauge depends only on where the cat is and what it does
    const key = readsGauge(cond)
      ? cc.key(e.s)
      : JSON.stringify([e.s.place, e.s.walk, e.s.activity, e.s.interrupt, e.s.control]);
    const hit = memo[key];
    if (hit !== undefined) return hit;
    const p = as(cc, id, cc.stand(id, e.s, fc.mean), () => chance(cc.ctx, cond, { self: id }));
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
        for (const e of chain) p += times(e.p, whenPpm(e, r.when));
        const v = mean[h.id] ?? 0;
        let next = clampBase(c, h.id, v + times(add, p));
        if (r.toward)
          next = add < 0 ? Math.max(Math.min(v, init), next) : Math.min(Math.max(v, init), next);
        mean[h.id] = next;
        continue;
      }
      const initBand = bandOf(c, init);
      const lim = (dir: number) => {
        const l = dir > 0 ? c.tuning.fog.bands - 1 : 0;
        return r.toward ? (dir > 0 ? Math.min(l, initBand) : Math.max(l, initBand)) : l;
      };
      const mark = need(setup.reads, id, 'cat').includes(h.id);
      chain = chain.flatMap((e) => bandMove(c, e, h.id, add, whenPpm(e, r.when), lim(add), mark));
    }
  }
  return { chain, mean, conds: fc.conds };
}

/**
 * Advances one cat's chain one fog step in one case (03 §13.2, §13.3): interrupts and walks count
 * down; at its place an activity runs its `while` effects and tires (boredom moves bands). There
 * are no activity timers: only mass whose decision key changed decides (a band move of a gauge
 * its decision reads, its conditions changing bucket, an arrival, an ended interrupt, control
 * handed back), by the shared decision function with hysteresis. Leaving an activity runs its
 * `onFinish` on the leaving mass.
 */
function catStep(
  cc: CaseCtx,
  setup: FogSetup,
  id: CatId,
  fc: FogCat,
  t: number,
  q: Quantities,
  sink: Sink,
  blocked = 0,
): FogCat {
  const { c } = setup;
  const K = c.tuning.fog.stepTicks;
  const top = c.tuning.fog.bands - 1;
  // conditions the decision reads, against the last step: a changed bucket triggers all mass
  const conds = conditionVector(cc.ctx, id);
  const all = conds !== fc.conds;
  const hooked = hooksStep(cc, setup, id, fc, t);
  const mean = { ...hooked.mean };
  const out: Entry[] = [];
  const scope: Scope = { self: id };
  const counted: Record<string, number> = {}; // `${counter}|${add}` → this cat's mass doing it
  const selfGauge = (e: Effect) =>
    'gauge' in e && e.gauge.slice(0, e.gauge.indexOf('.')) === 'self' ? gaugeName(e.gauge) : null;
  const begun: Record<string, [ChainState, number][]> = {}; // starts by place and activity, this step
  const decided: Record<string, ReturnType<typeof choices>> = {}; // decisions by state, this step

  for (const first of hooked.chain) {
    const s0 = first.s;
    let entries: Entry[] = [first];
    if (s0.interrupt) {
      const left = s0.interrupt.leftSteps - 1;
      entries = [
        {
          s: { ...s0, interrupt: left > 0 ? { ...s0.interrupt, leftSteps: left } : null },
          p: first.p,
          ...((first.d === true || left === 0) && { d: true }),
        },
      ];
    } else if (s0.walk) {
      const left = s0.walk.leftSteps - 1;
      entries = [
        {
          s: { ...s0, walk: left > 0 ? { ...s0.walk, leftSteps: left } : null },
          p: first.p,
          ...((first.d === true || left === 0) && { d: true }),
        },
      ];
    } else {
      const ad = c.activity[s0.activity];
      // at its place: `while` effects, then boredom; a storylet's activity hands control back
      // with the share that tires past the top band (03 §8.3, decisions.md)
      for (const w of ad?.while ?? []) {
        const n = hits(t, K, w.everyTicks ?? 1);
        if (n === 0) continue;
        const g = selfGauge(w);
        if (g !== null && 'gauge' in w) {
          if (w.add !== undefined) {
            meanEffect(c, { mean }, g, w.add * n, null, first.p);
            const mark = need(setup.reads, id, 'cat').includes(g);
            entries = entries.flatMap((e) =>
              bandMove(c, e, g, (w.add ?? 0) * n, PPM, undefined, mark),
            );
          }
        } else if ('counter' in w) {
          const k = `${w.counter}|${w.add * n}`;
          counted[k] = (counted[k] ?? 0) + first.p;
        } else fogEffects(setup, cc, q, [w], scope, first.p, sink, s0.place);
      }
      const rate = boredomRate(c, s0.activity) * K;
      const storylet = s0.control === 'storylet' && s0.activity !== 'goTo';
      entries = entries.flatMap((e) =>
        bandMove(c, e, BOREDOM, rate, PPM, storylet ? top + 1 : undefined, true).map((x) =>
          (x.s.bands[BOREDOM] ?? 0) > top
            ? {
                s: { ...x.s, bands: { ...x.s.bands, [BOREDOM]: top }, control: 'free' as const },
                p: x.p,
                d: true,
              }
            : x,
        ),
      );
    }
    for (const e0 of entries) {
      // a goTo that has arrived ends (03 §9.3): the cat stands, free
      let e = e0;
      if (e.s.activity === 'goTo' && !e.s.walk && !e.s.interrupt) {
        const fin = (sink.finished[id] ??= {});
        fin['goTo'] = (fin['goTo'] ?? 0) + e.p;
        e = { s: { ...e.s, activity: 'none', control: 'free' }, p: e.p, d: true };
      }
      const s = e.s;
      if (s.control !== 'free' || s.walk || s.interrupt || !(all || e.d === true)) {
        out.push({ s, p: e.p });
        continue;
      }
      const sk = cc.key(s);
      const { cands, ppm } = (decided[sk] ??= as(cc, id, cc.stand(id, s, mean), () =>
        choices(cc.ctx, id),
      ));
      // the actor of an open storylet choice makes no free decision (03 §8.3)
      const moving = cands.length === 0 ? 0 : e.p - times(e.p, blocked);
      if (e.p - moving > 0) out.push({ s, p: e.p - moving });
      if (moving === 0) continue;
      // leaving: the old activity's onFinish on the leaving mass (gauges on the state, the rest on the world)
      let leaving: Entry[] = [{ s, p: moving }];
      const ad = c.activity[s.activity];
      if (ad) {
        for (const f of ad.onFinish ?? []) {
          const g = selfGauge(f);
          const pm = f.chance === undefined ? PPM : f.chance * 1000;
          if (g !== null && 'gauge' in f) {
            meanEffect(c, { mean }, g, f.add ?? null, f.set ?? null, times(moving, pm));
            leaving = leaving.flatMap((x) =>
              f.set !== undefined ? bandSet(c, x, g, f.set, pm) : bandMove(c, x, g, f.add ?? 0, pm),
            );
          } else fogEffects(setup, cc, q, [f], scope, moving, sink, s.place);
        }
        const fin = (sink.finished[id] ??= {});
        fin[s.activity] = (fin[s.activity] ?? 0) + moving;
      }
      for (const l of leaving)
        cands.forEach((cand, i) => {
          const p = times(l.p, ppm[i] ?? 0);
          if (p === 0) return;
          const k = `${s.place}|${cand.activity}`;
          const next = (begun[k] ??= starts(
            cc,
            id,
            cc.stand(id, l.s, mean),
            cand.activity,
            {},
            'free',
          ));
          for (const [n, q2] of next)
            out.push({ s: { ...n, bands: { ...l.s.bands, [BOREDOM]: 0 } }, p: times(p, q2) });
        });
    }
  }
  // the cat's states are exclusive: one Bernoulli term per counter and amount
  for (const k of Object.keys(counted).sort()) {
    const bar = k.lastIndexOf('|');
    addCounter(q, k.slice(0, bar), Number(k.slice(bar + 1)), counted[k] ?? 0);
  }
  return { chain: out, mean, conds };
}

/**
 * Fogged cats perceive the step's events (03 §13.6): `heard`, hook `onEvent` and
 * `factIfPerceivedBy`, through the place perception table.
 */
function perceive(setup: FogSetup, fc: FogCase, events: readonly FogEvent[]): void {
  const { c, table } = setup;
  const weather = fc.weather === 'rain' ? 'rain' : 'dry';
  const index = (n: NodeId) => setup.nodeIndex[n] ?? -1;
  for (const def of c.cats) {
    const cat = fc.cats[def.id];
    if (!cat) continue;
    let chain = cat.chain;
    const mean = { ...cat.mean };
    const at: Record<string, number> = {};
    const nodeOf = (s: ChainState) => {
      const k = s.walk ? JSON.stringify(s.walk) : s.place;
      return (at[k] ??= index(stateNode(setup, def.id, s)));
    };
    // where the cat's mass stands: band moves below never move it between places
    const byNode: [number, number][] = [];
    for (const e of chain) {
      const n = nodeOf(e.s);
      const seen = byNode.find((x) => x[0] === n);
      if (seen) seen[1] += e.p;
      else byNode.push([n, e.p]);
    }
    for (const ev of events) {
      const j = index(ev.node);
      const always = ev.global || ev.to === def.id || ev.source === def.id;
      const sense = ev.radiusM === null ? 'sight' : 'hearing';
      const seesNode = (n: number) =>
        always || tablePerceives(table, def.id, sense, weather, n, j, ev.radiusM);
      const sees = (s: ChainState) => seesNode(nodeOf(s));
      let pp = 0;
      for (const [n, mass] of byNode) if (seesNode(n)) pp += mass;
      const m = times(ev.p, pp);
      if (m === 0) continue;
      addHeard(fc.q, def.id, ev.name, m);
      const fact = ev.factIfPerceivedBy?.[def.id];
      if (fact) addFactChance(fc.q, fact, m);
      for (const h of c.hooks) {
        if (!(h.id in def.hooks)) continue;
        for (const r of h.rise) {
          if (!('onEvent' in r) || r.onEvent !== ev.name) continue;
          meanEffect(c, { mean }, h.id, r.add, null, m);
          chain = chain.flatMap((e) => (sees(e.s) ? bandMove(c, e, h.id, r.add, ev.p) : [e]));
        }
      }
    }
    fc.cats[def.id] = { chain: normalise(c, chain), mean, conds: cat.conds };
  }
}

/** Detectors the fog estimates (03 §13.6): the product of each clause's highest chance so far. */
function detectorsStep(
  setup: FogSetup,
  cc: CaseCtx,
  q: Quantities,
  events: readonly FogEvent[],
): void {
  const { c } = setup;
  for (const id of setup.detectors) {
    const d = c.detectors.find((x) => x.id === id);
    if (!d) continue;
    if (!detectorCats(c, d).some((x) => cc.standIns[x] !== undefined)) continue;
    const best = q.detectors[id] ?? d.kernel.map(() => 0);
    d.kernel.forEach((clause, i) => {
      let p: number;
      if ('holds' in clause) p = chance(cc.ctx, clause.holds, {});
      else {
        p = 0;
        for (const ev of events)
          if (ev.name === clause.event && (clause.at === undefined || clause.at === ev.node))
            p = or(p, ev.p);
      }
      best[i] = Math.max(best[i] ?? 0, p);
    });
    q.detectors[id] = best;
    const est = best.reduce((a, x) => times(a, x), PPM);
    raiseFactPart(q, d.emits, `det:${id}`, est);
  }
}

/** P(each cat is the actor of an open choice exit) in the storylets the fog holds (03 §8.3). */
function choiceActors(
  setup: FogSetup,
  cc: CaseCtx,
  q: Quantities,
  held: readonly string[],
): Record<CatId, number> {
  const out: Record<CatId, number> = {};
  for (const def of setup.c.storylets) {
    const sl = q.storylets[def.id];
    if (!held.includes(def.id) || !sl?.roles) continue;
    const scope: Scope = { roles: sl.roles, storylet: def.id, origin: origin(def, sl.roles) };
    for (const state of Object.keys(def.states)) {
      const m = sl.p[state] ?? 0;
      if (m <= 0 || isTerminal(def, state)) continue;
      const { choices, actor } = exitOptions(cc.ctx, def, state, scope);
      if (actor && choices.length > 0) out[actor] = or(out[actor] ?? 0, m);
    }
  }
  return out;
}

/** One case through one step: chains, storylets, effects on chains, perception, detectors. */
function caseStep(
  setup: FogSetup,
  fc: FogCase,
  t: number,
  held: readonly string[],
  step: StepMemo,
): FogCase[] {
  const { c } = setup;
  const q = cloneQ(fc.q);
  const sink: Sink = { events: [], catFx: [], finished: {} };
  const cc = caseCtx(setup, { ...fc, q }, t, step);
  const cats: Record<CatId, FogCat> = {};
  const actors = choiceActors(setup, cc, q, held);
  for (const def of c.cats) {
    const cat = fc.cats[def.id];
    if (cat) cats[def.id] = catStep(cc, setup, def.id, cat, t, q, sink, actors[def.id] ?? 0);
  }
  // storylets read the new chains; `activityFinished` sees this step's finishes on its first tick
  const next: FogCase = { ...fc, q, cats };
  const cc2 = caseCtx(setup, next, t, step, sink.finished);
  const fire = storyletsTick(setup, cc2, q, held, sink, fc.links);
  if (fire === null || fire.m <= 0) return [finishStep(setup, cc2, next, sink)];
  // Split exactly at the transition (03 §13.5): it happened in one case and not in the other.
  const def = need(setup.c.storylet, fire.storylet, 'storylet');
  const yes: FogCase = { ...next, cats: { ...next.cats }, q: cloneQ(next.q) };
  const yesSink = structuredClone(sink);
  yes.weight = times(fc.weight, fire.m);
  yes.links = { ...fc.links, [`fact:${fire.fact}`]: 1 };
  need(yes.q.storylets, def.id, 'storylet').p = { [fire.state]: PPM };
  const ccYes = caseCtx(setup, yes, t, step);
  enterMass(setup, ccYes, yes.q, def, fire.roles, fire.state, PPM, yesSink);
  const no = next;
  no.weight = fc.weight - yes.weight;
  const sl = need(no.q.storylets, def.id, 'storylet');
  const rest = { ...sl.p };
  rest[fire.state] = (rest[fire.state] ?? 0) - fire.m;
  if ((rest[fire.state] ?? 0) <= 0) delete rest[fire.state];
  sl.p = renormalise(rest);
  return [
    ...(yes.weight > 0 ? [finishStep(setup, ccYes, yes, yesSink)] : []),
    ...(no.weight > 0 ? [finishStep(setup, cc2, no, sink)] : []),
  ];
}

/** The rest of a case's step: storylet effects on chains, perception, detectors. */
function finishStep(setup: FogSetup, cc: CaseCtx, fc: FogCase, sink: Sink): FogCase {
  const { c } = setup;
  for (const fx of sink.catFx) {
    const cat = fc.cats[fx.cat];
    if (cat) fc.cats[fx.cat] = catEffect(setup, cc, fx.cat, cat, fx.mass, fx.effect);
  }
  for (const def of c.cats) {
    const cat = fc.cats[def.id];
    if (cat) fc.cats[def.id] = { chain: normalise(c, cat.chain), mean: cat.mean, conds: cat.conds };
  }
  perceive(setup, fc, sink.events);
  detectorsStep(setup, cc, fc.q, sink.events);
  return fc;
}

/** A copy of a case's quantities, deep only where they are records of records (03 §13.6). */
function cloneQ(q: Quantities): Quantities {
  const parts: Quantities['factParts'] = {};
  for (const k of Object.keys(q.factParts)) parts[k] = { ...q.factParts[k] };
  const flags: Quantities['flags'] = {};
  for (const k of Object.keys(q.flags)) flags[k] = (q.flags[k] ?? []).map((x) => ({ ...x }));
  const storylets: Quantities['storylets'] = {};
  for (const k of Object.keys(q.storylets)) {
    const sl = q.storylets[k];
    if (sl) storylets[k] = { p: { ...sl.p }, roles: sl.roles };
  }
  const heard: Quantities['heard'] = {};
  for (const k of Object.keys(q.heard)) heard[k] = { ...q.heard[k] };
  const detectors: Quantities['detectors'] = {};
  for (const k of Object.keys(q.detectors)) detectors[k] = [...(q.detectors[k] ?? [])];
  return {
    facts: { ...q.facts },
    factParts: parts,
    flags,
    counters: { ...q.counters },
    storylets,
    heard,
    detectors,
  };
}

// --- weather cases, links, merging (03 §13.5) ---------------------------------------------------------

/** The weather hazard at tick u, in ppm: inside the window `perMille`, certain at its last tick. */
function hazardAt(
  c: Content,
  u: number,
  h: { window: [string, string]; perMille: number },
): number {
  if (!inWindow(c, u, h.window)) return 0;
  return inWindow(c, u + 1, h.window) ? h.perMille * 1000 : PPM;
}

/** Copies a case with a new weight and weather (chains and quantities shared until changed). */
const withWeather = (
  fc: FogCase,
  weight: number,
  weather: Weather,
  rainStart: [number, number][],
): FogCase => ({
  ...fc,
  weight,
  weather,
  rainStart,
  q: cloneQ(fc.q),
});

/** Splits cases where the weather changes during the step [t, t + K) (projections only). */
function weatherSplit(setup: FogSetup, cases: readonly FogCase[], t: number): FogCase[] {
  const { c } = setup;
  const K = c.tuning.fog.stepTicks;
  const { rainStart: start, rainStop: stop } = c.world.weather;
  const out: FogCase[] = [];
  for (const fc of cases) {
    if (fc.weather === 'dry') {
      let surv = PPM;
      const starts: [number, number][] = [];
      for (let u = t; u < t + K; u++) {
        const p = times(surv, hazardAt(c, u, start));
        if (p > 0) starts.push([u, p]);
        surv -= p;
      }
      const w = times(fc.weight, PPM - surv);
      if (w === 0 || starts.length === 0) {
        out.push(fc);
        continue;
      }
      if (fc.weight - w > 0) out.push({ ...fc, weight: fc.weight - w });
      const rain = withWeather(fc, w, 'rain', split(starts, PPM - surv));
      setFact(rain.q, 'rainStarted', PPM);
      for (const def of c.cats) addHeard(rain.q, def.id, 'rainStarted', PPM);
      out.push(rain);
    } else if (fc.weather === 'rain') {
      let stopped = 0;
      const left: [number, number][] = [];
      for (const [s, r] of fc.rainStart) {
        let surv = PPM;
        for (let u = t; u < t + K; u++)
          if (u - s >= (stop.minDurationTicks ?? 0)) surv -= times(surv, hazardAt(c, u, stop));
        stopped += times(r, PPM - surv);
        if (surv > 0) left.push([s, times(r, surv)]);
      }
      const w = left.length === 0 ? fc.weight : times(fc.weight, stopped);
      if (w === 0) {
        out.push(fc);
        continue;
      }
      if (fc.weight - w > 0)
        out.push({
          ...fc,
          weight: fc.weight - w,
          rainStart: split(
            left,
            left.reduce((a, [, p]) => a + p, 0),
          ),
        });
      const dry = withWeather(fc, w, 'stopped', []);
      setFact(dry.q, 'rainStopped', PPM);
      for (const def of c.cats) addHeard(dry.q, def.id, 'rainStopped', PPM);
      out.push(dry);
    } else out.push(fc);
  }
  return out;
}

/**
 * Splits cases on links that rose during the step (03 §13.5): where a link is still 0 and its
 * quantity rose to m, a new case with the link true takes weight × m; the rest keeps it false.
 */
function linkSplit(setup: FogSetup, cases: readonly FogCase[]): FogCase[] {
  let out = [...cases];
  for (const l of setup.links) {
    const key = linkKey(l);
    const next: FogCase[] = [];
    for (const fc of out) {
      if (fc.links[key] === 1) {
        next.push(fc);
        continue;
      }
      const sl = l.kind === 'state' ? fc.q.storylets[l.storylet] : undefined;
      const m = l.kind === 'fact' ? (fc.q.facts[l.fact] ?? 0) : (sl?.p[l.state] ?? 0);
      if (m === 0) {
        next.push(fc);
        continue;
      }
      const w = times(fc.weight, m);
      const yes: FogCase = { ...fc, cats: { ...fc.cats }, q: cloneQ(fc.q) };
      const no = fc;
      yes.weight = w;
      yes.links = { ...fc.links, [key]: 1 };
      no.weight = fc.weight - w;
      if (l.kind === 'fact') {
        setFact(yes.q, l.fact, PPM);
        setFact(no.q, l.fact, 0);
      } else {
        const ys = yes.q.storylets[l.storylet];
        if (ys) ys.p = { [l.state]: PPM };
        const ns = no.q.storylets[l.storylet];
        if (ns) {
          const rest = { ...ns.p };
          delete rest[l.state];
          ns.p = renormalise(rest);
        }
      }
      if (yes.weight > 0) next.push(yes);
      if (no.weight > 0) next.push(no);
    }
    out = next;
  }
  return out;
}

const caseKey = (fc: FogCase): string => JSON.stringify([fc.weather, fc.links]);

/** Merges cases with the same weather and link values (03 §13.5): weights add, the rest mixes. */
export function mergeCases(setup: FogSetup, cases: readonly FogCase[]): FogCase[] {
  const { c } = setup;
  const groups: Record<string, FogCase[]> = {};
  const keys: string[] = [];
  for (const fc of cases) {
    const k = caseKey(fc);
    const g = groups[k];
    if (g) g.push(fc);
    else {
      groups[k] = [fc];
      keys.push(k);
    }
  }
  keys.sort();
  return keys.map((k) => {
    const g = need(groups, k, 'case');
    const first = g[0];
    if (!first) throw new Error('empty case group');
    if (g.length === 1) return first;
    const weight = g.reduce((a, x) => a + x.weight, 0);
    const share = (x: FogCase) => Math.trunc((x.weight * PPM) / weight);
    const cats: Record<CatId, FogCat> = {};
    for (const def of c.cats) {
      const parts = g.flatMap((x) => {
        const cat = x.cats[def.id];
        return cat ? [{ cat, s: share(x) }] : [];
      });
      if (parts.length === 0) continue;
      const mean: Record<string, number> = {};
      for (const gauge of Object.keys(parts[0]?.cat.mean ?? {}))
        mean[gauge] = Math.trunc(
          parts.reduce((a, x) => a + (x.cat.mean[gauge] ?? 0) * x.s, 0) / PPM,
        );
      cats[def.id] = {
        chain: normalise(
          c,
          parts.flatMap((x) => x.cat.chain.map((e) => ({ s: e.s, p: times(e.p, x.s) }))),
        ),
        mean,
        conds: parts[0]?.cat.conds ?? -1,
      };
    }
    const rain: [number, number][] = [];
    for (const x of g)
      for (const [s, p] of x.rainStart) {
        const seen = rain.find((y) => y[0] === s);
        if (seen) seen[1] += times(p, share(x));
        else rain.push([s, times(p, share(x))]);
      }
    rain.sort((a, b) => a[0] - b[0]);
    return {
      weight,
      weather: first.weather,
      rainStart:
        rain.length > 0
          ? split(
              rain,
              rain.reduce((a, [, p]) => a + p, 0),
            )
          : [],
      links: first.links,
      cats,
      q: mixQuantities(
        c,
        g.map((x) => ({ w: x.weight, q: x.q })),
      ),
    };
  });
}

/**
 * Advances the fog one step of `fog.stepTicks` ticks (03 §13.2, §13.5, §13.6). `held` lists the
 * storylets the fog runs (all of them in a projection). The weather changes by case only in a
 * projection (`projection: true`); up to the lantern edge it is the lantern's.
 */
export function fogStep(
  setup: FogSetup,
  fog: Fog,
  held: readonly string[] = setup.c.storylets.map((s) => s.id),
  projection = true,
): Fog {
  const t = fog.tick;
  const split1 = projection ? weatherSplit(setup, fog.cases, t) : [...fog.cases];
  const step = newStepMemo();
  const stepped = split1.flatMap((fc) => caseStep(setup, fc, t, held, step));
  const cases = mergeCases(setup, linkSplit(setup, stepped));
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
  const bands: Record<string, number> = { [BOREDOM]: gaugeBand(c, BOREDOM, cs.boredom) };
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
    bands,
    interrupt: cs.interrupt && {
      action: cs.interrupt.action,
      leftSteps: ceilDiv(cs.interrupt.left, K),
    },
    control: cs.control,
  };
  return { chain: [{ s, p: PPM }], mean, conds: -1 };
}

/** The decision function called by the fog for one chain state in one case (for tests). */
export function fogChoices(setup: FogSetup, fc: FogCase, t: number, id: CatId, s: ChainState) {
  const cc = caseCtx(setup, fc, t, newStepMemo());
  const mean = fc.cats[id]?.mean ?? {};
  const me = standIn(setup, id, s, mean);
  return as(cc, id, me, () => choices(cc.ctx, id));
}
