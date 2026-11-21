// Cats: gauges, hooks and voices, bodies, free behaviour and control (spec 03 §5, §6 phase 3/6, §8, §10.3).
import type { PlaceSelector } from '../content/schemas/chapter';
import type { Condition } from '../content/schemas/dsl';
import { chance, flagHolds, readGauge, test } from './conditions';
import { runEffects } from './effects';
import { clamp, sample, softmax } from './math';
import { term, score } from './scores';
import { catNode, catPos, dist2, edgeBetween, nodePos, path, reach, within } from './space';
import { hash32, rand } from './rng';
import type {
  Candidate,
  CatId,
  CatState,
  Content,
  Ctx,
  DecisionMemo,
  DecisionReads,
  NodeId,
  RunningEffect,
  SimEvent,
} from './types';
import { catScope, need } from './types';

const TRAITS = ['O', 'C', 'E', 'A', 'N'];

export const catState = (ctx: Ctx, id: CatId): CatState => need(ctx.s.cats, id, 'cat');

/** Where a cat plans from: its place, or the far end of the edge it is walking. */
export const planFrom = (cs: CatState): NodeId => ('at' in cs.pos ? cs.pos.at : cs.pos.to);

export const emit = (ctx: Ctx, e: SimEvent): void => void ctx.events.push(e);

/** Keeps a gauge's base inside its range. */
export const clampBase = (c: Content, gauge: string, v: number): number =>
  clamp(v, TRAITS.includes(gauge) ? 0 : c.hooksFloor, 1000);

/** Gauge value of a cat in any state (used to compare against the step's input). */
function valueIn(c: Content, cs: CatState, gauge: string): number {
  const base = cs.base[gauge];
  if (base === undefined) return 0;
  let v = base;
  for (const m of cs.mods) if (m.gauge === gauge) v += m.add;
  return clamp(v, c.hooksFloor, 1000);
}

export function insertSorted(list: string[], item: string): boolean {
  if (list.includes(item)) return false;
  list.push(item);
  list.sort();
  return true;
}

// --- interrupts, activities and walking -----------------------------------------------------------

export function setInterrupt(ctx: Ctx, id: CatId, action: string, ticks: number, by: string): void {
  if (ticks <= 0) return;
  const cs = catState(ctx, id);
  cs.interrupt = { action, left: Math.max(ticks, cs.interrupt?.left ?? 0), by };
  emit(ctx, { tick: ctx.t, type: 'interrupt', cat: id, action, ticks, by });
}

/** Selectors that sample among several places (03 §8.2); the fog splits mass evenly instead. */
const samples = (sel: PlaceSelector): boolean => 'neighbour' in sel || 'randomNode' in sel;

/** Resolves a place selector for a cat (03 §8.2), or null when nothing fits. */
export function selectPlace(
  ctx: Ctx,
  id: CatId,
  sel: PlaceSelector,
  activity: string,
): NodeId | null {
  const ids = placeOptions(ctx, id, sel);
  if (ids.length === 0) return null;
  if (!samples(sel)) return ids[0] ?? null;
  return ids[rand(ctx.seed, catScope(ctx, id), ctx.t, `place:${activity}`, ids.length)] ?? null;
}

/** A cat as conditions see it: live, or its most likely chain state in the fog (03 §13.3). */
const likelyCat = (ctx: Ctx, id: CatId): CatState => ctx.fog?.likely(id) ?? catState(ctx, id);

/**
 * The places a selector can pick: one for the deterministic selectors, every candidate for
 * `neighbour` and `randomNode` (a live cat samples one; the fog splits its mass over all).
 */
export function placeOptions(ctx: Ctx, id: CatId, sel: PlaceSelector): NodeId[] {
  const { c } = ctx;
  const cs = catState(ctx, id);
  const def = need(c.cat, id, 'cat');
  const here = planFrom(cs);
  const { dist } = reach(c, here, cs.knowsClosed, undefined, ctx.memo);
  const regionOf = (r: string | undefined) =>
    r === '$homeRegion' ? need(c.node, def.home, 'place').region : r;
  const currentRegion = need(c.node, here, 'place').region;
  const nearest = (ids: NodeId[]): NodeId[] => {
    let best: NodeId | null = null;
    for (const n of ids) {
      const d = dist[n];
      const bd = best === null ? undefined : dist[best];
      if (d !== undefined && (bd === undefined || d < bd)) best = n; // ids come in place order: ties keep the first
    }
    return best === null ? [] : [best];
  };
  const inRegion = (r: string) => c.nodes.filter((n) => n.region === r);

  if ('node' in sel) {
    const n = sel.node === '$home' ? def.home : sel.node === '$here' ? here : sel.node;
    return dist[n] === undefined ? [] : [n];
  }
  if ('tag' in sel)
    return nearest(
      inRegion(regionOf(sel.region) ?? currentRegion)
        .filter((n) => n.tags.includes(sel.tag) || n.objectTags.includes(sel.tag))
        .map((n) => n.id),
    );
  if ('anyOf' in sel) {
    // Chapter 1 nests only deterministic selectors here; a sampling one counts all its options.
    const picks = sel.anyOf.flatMap((x) => placeOptions(ctx, id, x));
    return nearest(c.nodes.map((n) => n.id).filter((n) => picks.includes(n)));
  }
  if ('flag' in sel)
    return nearest(
      inRegion(currentRegion)
        .filter((n) => flagHolds(ctx, `${sel.flag}@${n.id}`))
        .map((n) => n.id),
    );
  if ('neighbour' in sel) {
    const region = regionOf(sel.region) ?? currentRegion;
    return need(c.adj, here, 'place')
      .filter(
        (a) => !cs.knowsClosed.includes(a.edge) && need(c.node, a.to, 'place').region === region,
      )
      .map((a) => a.to);
  }
  if ('nearest' in sel)
    return nearest(
      inRegion(currentRegion)
        .filter((n) => sel.nearest.some((t) => n.tags.includes(t)))
        .map((n) => n.id),
    );
  if ('nearCat' in sel) {
    // In the fog, other cats stand where they most likely are (03 §13.3).
    const me = catPos(c, cs);
    let best: CatState | null = null;
    for (const other of c.cats) {
      if (other.id === id) continue;
      const os = likelyCat(ctx, other.id);
      const op = catPos(c, os);
      if (!within(me, op, sel.m)) continue;
      if (best === null || dist2(me, op) < dist2(me, catPos(c, best))) best = os;
    }
    if (best === null) return [];
    const n = catNode(best);
    return need(c.node, n, 'place').region === currentRegion && dist[n] !== undefined ? [n] : [];
  }
  const { region, tag } = sel.randomNode;
  return c.nodes
    .filter(
      (n) =>
        (region === undefined || n.region === region) &&
        (tag === undefined || n.tags.includes(tag)),
    )
    .filter((n) => dist[n.id] !== undefined)
    .map((n) => n.id);
}

/** Starts an activity as a free choice would; false when it has no place or no path (03 §8.2). */
export function startActivity(
  ctx: Ctx,
  id: CatId,
  activity: string,
  control: CatState['control'],
): boolean {
  const def = ctx.c.activity[activity];
  if (!def) return false;
  const cs = catState(ctx, id);
  const place = selectPlace(ctx, id, def.at, activity);
  if (place === null) return false;
  const from = planFrom(cs);
  const route =
    place === from ? [] : path(ctx.c, from, place, { avoid: cs.knowsClosed, memo: ctx.memo });
  if (route === null) return false;
  cs.activity = activity;
  cs.boredom = 0;
  cs.activityStart = ctx.t;
  cs.activityPlace = place;
  cs.route = route;
  cs.control = control;
  emit(ctx, { tick: ctx.t, type: 'activity', cat: id, activity, place });
  return true;
}

/** Built-in `goTo` (03 §9.3): walk to `node`, then finish there. */
export function goTo(
  ctx: Ctx,
  id: CatId,
  node: NodeId,
  control: CatState['control'],
  opts: { via?: string[] | undefined; edgesTagged?: string | undefined } = {},
): void {
  const cs = catState(ctx, id);
  const from = planFrom(cs);
  const route =
    from === node
      ? []
      : path(ctx.c, from, node, { avoid: cs.knowsClosed, memo: ctx.memo, ...opts });
  if (route === null) return;
  cs.activity = 'goTo';
  cs.boredom = 0;
  cs.activityStart = ctx.t;
  cs.activityPlace = node;
  cs.route = route;
  cs.control = control;
  emit(ctx, { tick: ctx.t, type: 'activity', cat: id, activity: 'goTo', place: node });
}

/** Ends whatever the cat was doing; it is free to decide again. */
export function stopCat(cs: CatState): void {
  cs.route = [];
  cs.activity = 'none';
  cs.activityPlace = null;
  cs.control = 'free';
}

/**
 * Leaves the current activity (03 §8.2): runs its `onFinish` and emits `activityFinished`, so
 * `activityFinished` means "left that activity". Used when switching and when a built-in ends.
 */
function leave(ctx: Ctx, id: CatId, cs: CatState): void {
  const activity = cs.activity;
  if (activity === 'none') return;
  const def = ctx.c.activity[activity];
  if (def?.onFinish) runEffects(ctx, def.onFinish, { self: id });
  emit(ctx, { tick: ctx.t, type: 'activityFinished', cat: id, activity });
}

/** A built-in activity ends (a goTo arrived, an attraction ended): the cat stands, free (03 §8.3). */
function endBuiltIn(ctx: Ctx, id: CatId, cs: CatState): void {
  leave(ctx, id, cs);
  cs.activity = 'none';
  cs.control = 'free';
}

/** Boredom gained per tick at an activity's place: max(1, trunc(2000 / (lo + hi))); built-ins 0. */
export const boredomRate = (c: Content, activity: string): number => {
  const def = c.activity[activity];
  return def ? Math.max(1, Math.trunc(2000 / (def.ticks[0] + def.ticks[1]))) : 0;
};

// --- phase 3: bodies ------------------------------------------------------------------------------

/** Phase 3a: hook rules, mods and voices (03 §10.3). */
function hooks(ctx: Ctx, id: CatId, cs: CatState): void {
  const { c, t } = ctx;
  for (const h of c.hooks) {
    const base = cs.base[h.id];
    if (base === undefined) continue;
    let v = base;
    for (const r of h.rise)
      if ('perTicks' in r && t % r.perTicks === 0 && (!r.when || test(ctx, r.when, { self: id })))
        v += r.add;
    const d = h.decay;
    if (d && t % d.perTicks === 0 && (!d.when || test(ctx, d.when, { self: id }))) {
      const init = cs.initial[h.id] ?? v;
      if (d.toward !== 'initial') v += d.add;
      else if (d.add < 0 && v > init) v = Math.max(init, v + d.add);
      else if (d.add > 0 && v < init) v = Math.min(init, v + d.add);
    }
    cs.base[h.id] = clampBase(c, h.id, v);
  }
  for (const m of cs.mods) {
    m.left -= 1;
    const step = Math.min(Math.abs(m.add), m.decayPerTick);
    m.add += m.add > 0 ? -step : step;
  }
  cs.mods = cs.mods.filter((m) => m.left > 0 && m.add !== 0);

  const before = need(ctx.prev.cats, id, 'cat');
  for (const h of c.hooks) {
    if (cs.base[h.id] === undefined) continue;
    const was = valueIn(c, before, h.id);
    const now = valueIn(c, cs, h.id);
    const { over, under, lines = [], linesOver } = h.voice;
    const up = over !== undefined && was <= over && now > over;
    const down = under !== undefined && was >= under && now < under;
    const last = cs.voiceAt[h.id];
    if (!(up || down) || (last !== undefined && t - last < c.tuning.voice.cooldownTicks)) continue;
    const pool = up ? (linesOver ?? lines) : lines;
    const line =
      pool[rand(ctx.seed, catScope(ctx, id), t, `voice:${h.id}`, Math.max(pool.length, 1))];
    if (line === undefined) continue;
    cs.voiceAt[h.id] = t;
    const node = catNode(cs);
    emit(ctx, {
      tick: t,
      type: 'voice',
      cat: id,
      hook: h.id,
      line,
      pos: catPos(c, cs),
      node,
      radiusM: c.tuning.voice.radiusM,
    });
  }
}

/** Phase 3 for one cat (03 §6). */
export function body(ctx: Ctx, id: CatId): void {
  const { c, t } = ctx;
  const cs = catState(ctx, id);
  hooks(ctx, id, cs);
  cs.pressure = Math.max(0, cs.pressure - c.tuning.pressure.decayPerTick);

  if (cs.interrupt) {
    cs.interrupt.left -= 1;
    if (cs.interrupt.left <= 0) cs.interrupt = null;
    return;
  }
  // `attracted` lasts until its attract effect ends (03 §9.3).
  if (
    cs.activity === 'attracted' &&
    !ctx.s.effects.some((e) => e.kind === 'attract' && e.place === cs.activityPlace)
  ) {
    cs.route = [];
    endBuiltIn(ctx, id, cs);
    return;
  }
  const pos = cs.pos;
  if (!('at' in pos)) {
    pos.left -= 1;
    if (pos.left > 0) return;
    cs.pos = { at: pos.to };
    emit(ctx, { tick: t, type: 'arrive', cat: id, node: pos.to });
    // Arriving at a goTo target with an empty route ends the goTo (03 §8.3).
    if (cs.activity === 'goTo' && cs.route.length === 0 && cs.activityPlace === pos.to)
      endBuiltIn(ctx, id, cs);
    return;
  }
  const next = cs.route[0];
  if (next !== undefined) {
    const edgeId = edgeBetween(c, pos.at, next);
    const edge = edgeId === null ? undefined : c.edge[edgeId];
    if (!edge || !edgeId) {
      stopCat(cs);
      return;
    }
    if (edge.when && !test(ctx, edge.when, { self: id })) {
      emit(ctx, { tick: t, type: 'blocked', cat: id, edge: edgeId });
      insertSorted(cs.knowsClosed, edgeId);
      stopCat(cs);
      return;
    }
    const minutes = Math.max(1, Math.trunc(edge.minutes / c.world.tickMinutes));
    cs.pos = { from: pos.at, to: next, edge: edgeId, left: minutes, of: minutes };
    cs.route = cs.route.slice(1);
    emit(ctx, { tick: t, type: 'depart', cat: id, from: pos.at, to: next });
    return;
  }
  // A goTo to where the cat already stands has arrived: it ends at once (03 §9.3).
  if (cs.activity === 'goTo' && cs.activityPlace === pos.at) {
    endBuiltIn(ctx, id, cs);
    return;
  }
  if (cs.activityPlace === null || cs.activityPlace === pos.at) {
    // 03 §6 phase 3f: `while` effects, boredom; a storylet's activity hands control back at full
    // boredom, a card's `delay` when `forcedLeft` runs out (03 §8.3).
    const def = c.activity[cs.activity];
    const since = t - cs.activityStart;
    const due = (def?.while ?? []).filter((e) => since % (e.everyTicks ?? 1) === 0);
    if (due.length > 0) runEffects(ctx, due, { self: id });
    cs.boredom = Math.min(1000, cs.boredom + boredomRate(c, cs.activity));
    if (cs.control === 'storylet' && cs.activity !== 'goTo' && cs.boredom >= 1000)
      cs.control = 'free';
    if (cs.control === 'forced') {
      cs.forcedLeft = Math.max(0, cs.forcedLeft - 1);
      if (cs.forcedLeft === 0) cs.control = 'free';
    }
  }
}

// --- phase 6: free behaviour --------------------------------------------------------------------

/** Does a running attract/repel effect reach this cat (straight line, `affects`)? */
export function reaches(ctx: Ctx, e: RunningEffect, id: CatId): boolean {
  const def = need(ctx.c.cat, id, 'cat');
  if (e.affects) {
    const kind = e.affects.kinds.includes(def.kind);
    const hot =
      e.affects.orTemperatureTenthsGte !== undefined &&
      def.temperatureTenths >= e.affects.orTemperatureTenthsGte;
    if (!kind && !hot) return false;
  }
  return within(catPos(ctx.c, catState(ctx, id)), nodePos(ctx.c, e.place), e.radiusM);
}

export type { Candidate };

/** The leaves, gauge refs and world-dependent place selectors an activity reads (03 §8.2). */
function activityReads(ctx: Ctx, activity: string): DecisionReads {
  return readsOf(ctx.c, ctx.decisions, activity);
}

/** `activityReads` for callers without a context (the fog's setup). */
export function readsOf(c: Content, dm: DecisionMemo, activity: string): DecisionReads {
  const memo = dm.reads;
  const hit = memo[activity];
  if (hit) return hit;
  const out: DecisionReads = { gauges: [], leaves: [], places: [] };
  const walk = (cond: Condition | undefined): void => {
    if (!cond) return;
    if ('all' in cond) cond.all.forEach(walk);
    else if ('any' in cond) cond.any.forEach(walk);
    else if ('not' in cond) walk(cond.not);
    else if ('gauge' in cond) out.gauges.push(cond.gauge);
    else out.leaves.push(cond);
  };
  const def = c.activity[activity];
  if (def) {
    walk(def.gate);
    for (const t of def.score.terms ?? []) {
      if ('gauge' in t) out.gauges.push(t.gauge);
      if ('if' in t) walk(t.if);
      if ('primeCount' in t) for (const p of c.world.primes.list) walk(p.cond);
    }
    const sel = (x: PlaceSelector): void => {
      if ('anyOf' in x) x.anyOf.forEach(sel);
      else if ('flag' in x || 'nearCat' in x) out.places.push(x);
    };
    sel(def.at);
  }
  memo[activity] = out;
  return out;
}

/** The activities a cat's decision reads: its list, and its current activity if not in it. */
function readActivities(ctx: Ctx, id: CatId): string[] {
  const list = need(ctx.c.cat, id, 'cat').activities;
  const cur = catState(ctx, id).activity;
  return ctx.c.activity[cur] && !list.includes(cur) ? [...list, cur] : list;
}

/** Boredom's name where a gauge name is expected (keys, bands). */
export const BOREDOM = '$boredom';

/** The band of a gauge value: `fog.bands` equal bands of its range (03 §8.2, §13.2). */
export function gaugeBand(c: Content, gauge: string, v: number): number {
  const floor = gauge === BOREDOM || TRAITS.includes(gauge) ? 0 : c.hooksFloor;
  const span = 1001 - floor;
  return Math.min(c.tuning.fog.bands - 1, Math.trunc(((v - floor) * c.tuning.fog.bands) / span));
}

/** Running attract/repel effects that reach the cat now: its offers (03 §9.3). */
const offersOf = (ctx: Ctx, id: CatId): RunningEffect[] =>
  ctx.s.effects.filter((e) => (e.kind === 'attract' || e.kind === 'repel') && reaches(ctx, e, id));

/**
 * Everything a decision reads, as values (03 §8.2). Banded, it is the decision key a trigger
 * compares; `exact`, it is what the decision cache is keyed by (exact gauges for a live cat, band
 * midpoints for a fog stand-in), plus what place options depend on (decisions.md, M2-6).
 */
function decisionParts(ctx: Ctx, id: CatId, exact: boolean): unknown[] {
  const cs = catState(ctx, id);
  const scope = { self: id };
  const gauges: string[] = [];
  const leaves: Condition[] = [];
  const places: PlaceSelector[] = [];
  for (const a of readActivities(ctx, id)) {
    const r = activityReads(ctx, a);
    for (const g of r.gauges) if (!gauges.includes(g)) gauges.push(g);
    for (const l of r.leaves) if (!leaves.includes(l)) leaves.push(l);
    for (const p of r.places) if (!places.includes(p)) places.push(p);
  }
  const values = gauges.map((ref) => {
    const v = readGauge(ctx, scope, ref);
    return exact ? v : gaugeBand(ctx.c, ref.slice(ref.indexOf('.') + 1), v);
  });
  const offers = offersOf(ctx, id).map((e) =>
    exact
      ? [
          e.id,
          e.kind,
          e.place,
          e.strength,
          e.kind === 'attract' && e.scale ? term(ctx, e.scale, scope, id) : 0,
        ]
      : e.id,
  );
  const parts: unknown[] = [
    id,
    cs.activity,
    cs.activityPlace,
    values,
    exact ? cs.boredom : gaugeBand(ctx.c, BOREDOM, cs.boredom),
    leaves.map((l) => chance(ctx, l, scope)),
    offers,
  ];
  if (exact)
    parts.push(
      planFrom(cs),
      cs.knowsClosed,
      places.map((p) => placeOptions(ctx, id, p)),
    );
  return parts;
}

/**
 * Runs `fn` with fog leaves rounded down to `fog.ppmQuantum` when in the fog (03 §8.2): the key
 * and the decision read the same rounded values, so a cached result is exact.
 */
function quantised<T>(ctx: Ctx, fn: () => T): T {
  if (!ctx.fog) return fn();
  const saved = ctx.quantum;
  ctx.quantum = ctx.c.tuning.fog.ppmQuantum;
  try {
    return fn();
  } finally {
    if (saved === undefined) delete ctx.quantum;
    else ctx.quantum = saved;
  }
}

/**
 * The values of the conditions a cat's decision reads besides gauges, rounded in the fog (03 §8.2):
 * the fog compares them between steps to find a changed decision key for all of a cat's mass.
 */
export function conditionVector(ctx: Ctx, id: CatId): number {
  return quantised(ctx, () => {
    const leaves: Condition[] = [];
    for (const a of readActivities(ctx, id))
      for (const l of activityReads(ctx, a).leaves) if (!leaves.includes(l)) leaves.push(l);
    return hash32(JSON.stringify(leaves.map((l) => chance(ctx, l, { self: id }))));
  });
}

/** The decision key (03 §8.2) as an integer: what a trigger compares with `lastKey`. */
export const decisionKey = (ctx: Ctx, id: CatId): number =>
  quantised(ctx, () => hash32(JSON.stringify(decisionParts(ctx, id, false))));

/**
 * The decision function (03 §8.2, §13.3), with hysteresis: the activities that beat the current
 * one (less boredom) by `activities.stickiness`, with their probabilities in ppm. Empty: nothing
 * changes. The lantern samples it; the fog splits mass by it. Cached by its exact inputs in
 * `ctx.decisions`; results with and without the cache are identical. Changes nothing.
 */
export function choices(ctx: Ctx, id: CatId): { cands: Candidate[]; ppm: number[] } {
  return quantised(ctx, () => {
    const dm = ctx.decisions;
    if (dm.off) {
      dm.calls += 1;
      return decideFresh(ctx, id);
    }
    const key = JSON.stringify(decisionParts(ctx, id, true));
    const hit = dm.results[key];
    if (hit) {
      dm.hits += 1;
      return hit;
    }
    dm.calls += 1;
    const result = decideFresh(ctx, id);
    dm.results[key] = result;
    return result;
  });
}

function decideFresh(ctx: Ctx, id: CatId): { cands: Candidate[]; ppm: number[] } {
  const { c } = ctx;
  const cs = catState(ctx, id);
  const def = need(c.cat, id, 'cat');
  const scope = { self: id };
  const usable = (a: string) => {
    const ad = need(c.activity, a, 'activity');
    // placeOptions only returns places the cat can reach, so no path check is needed here.
    return (!ad.gate || test(ctx, ad.gate, scope)) && placeOptions(ctx, id, ad.at).length > 0;
  };
  const cands: Candidate[] = [];
  for (const a of def.activities)
    if (a !== cs.activity && usable(a))
      cands.push({
        activity: a,
        score: score(ctx, need(c.activity, a, 'activity').score, scope),
        effect: null,
      });
  let cur: number | null = null; // the current activity's score less boredom; null = none
  for (const e of offersOf(ctx, id)) {
    const extra = e.kind === 'attract' && e.scale ? term(ctx, e.scale, scope, id) : 0;
    const activity = e.kind === 'attract' ? 'attracted' : 'repelled';
    if (activity === cs.activity && e.place === cs.activityPlace) cur = e.strength + extra;
    else cands.push({ activity, score: e.strength + extra, effect: e });
  }
  const ad = c.activity[cs.activity];
  if (ad && usable(cs.activity))
    cur =
      score(ctx, ad.score, scope) -
      Math.trunc((cs.boredom * c.tuning.behaviour.boredomWeight) / 1000);
  const better = cur === null ? cands : cands.filter((x) => x.score > cur + c.stickiness);
  if (better.length === 0) return { cands: [], ppm: [] };
  return {
    cands: better,
    ppm: softmax(
      better.map((x) => x.score),
      def.temperatureTenths,
    ),
  };
}

/** Phase 6 decision for one cat (03 §8.2): samples the decision function and switches. */
export function decide(ctx: Ctx, id: CatId): void {
  const cs = catState(ctx, id);
  const { cands, ppm } = choices(ctx, id);
  if (cands.length > 0) {
    const chosen = cands[sample(ppm, rand(ctx.seed, catScope(ctx, id), ctx.t, 'act', 1_000_000))];
    if (chosen) {
      leave(ctx, id, cs);
      if (chosen.effect?.kind === 'attract') {
        goTo(ctx, id, chosen.effect.place, 'free');
        cs.activity = 'attracted';
      } else if (chosen.effect) {
        const away = nearestOutside(ctx, id, chosen.effect);
        if (away !== null) {
          goTo(ctx, id, away, 'free');
          cs.activity = 'repelled';
        }
      } else startActivity(ctx, id, chosen.activity, 'free');
    }
  }
  // the key after the decision, so the cat's own switch is not a trigger (decisions.md)
  cs.lastKey = decisionKey(ctx, id);
}

/** The nearest place (by path minutes) outside a repel effect's radius. */
function nearestOutside(ctx: Ctx, id: CatId, e: RunningEffect): NodeId | null {
  const cs = catState(ctx, id);
  const { dist } = reach(ctx.c, planFrom(cs), cs.knowsClosed, undefined, ctx.memo);
  const centre = nodePos(ctx.c, e.place);
  let best: NodeId | null = null;
  for (const n of ctx.c.nodes) {
    const d = dist[n.id];
    if (d === undefined || within(n.pos, centre, e.radiusM)) continue;
    if (best === null || d < (dist[best] ?? Infinity)) best = n.id;
  }
  return best;
}

/** Initial gauges of a cat (03 §5). The caller passes scope `s0:<cat>`: the seed fixes them. */
export function initialGauges(
  c: Content,
  seed: number,
  scope: string,
  id: CatId,
): Record<string, number> {
  const def = need(c.cat, id, 'cat');
  const base: Record<string, number> = {};
  for (const [g, [lo, hi]] of [...Object.entries(def.traits), ...Object.entries(def.hooks)])
    base[g] = clampBase(c, g, lo + rand(seed, scope, 0, `init:${g}`, hi - lo + 1));
  return base;
}
