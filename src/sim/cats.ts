// Cats: gauges, hooks and voices, bodies, free behaviour and control (spec 03 §5, §6 phase 3/6, §8, §10.3).
import type { PlaceSelector } from '../content/schemas/chapter';
import { test } from './conditions';
import { runEffects } from './effects';
import { clamp, sample, softmax } from './math';
import { term, score } from './scores';
import { catNode, catPos, dist2, edgeBetween, nodePos, path, reach, within } from './space';
import { rand } from './rng';
import type { CatId, CatState, Content, Ctx, NodeId, RunningEffect, SimEvent } from './types';
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

/** Resolves a place selector for a cat (03 §8.2), or null when nothing fits. */
export function selectPlace(
  ctx: Ctx,
  id: CatId,
  sel: PlaceSelector,
  activity: string,
): NodeId | null {
  const { c, s } = ctx;
  const cs = catState(ctx, id);
  const def = need(c.cat, id, 'cat');
  const here = planFrom(cs);
  const { dist } = reach(c, here, cs.knowsClosed, undefined, ctx.memo);
  const regionOf = (r: string | undefined) =>
    r === '$homeRegion' ? need(c.node, def.home, 'place').region : r;
  const currentRegion = need(c.node, here, 'place').region;
  const nearest = (ids: NodeId[]): NodeId | null => {
    let best: NodeId | null = null;
    for (const n of ids) {
      const d = dist[n];
      const bd = best === null ? undefined : dist[best];
      if (d !== undefined && (bd === undefined || d < bd)) best = n; // ids come in place order: ties keep the first
    }
    return best;
  };
  const inRegion = (r: string) => c.nodes.filter((n) => n.region === r);
  const sampleOne = (ids: NodeId[]): NodeId | null =>
    ids.length === 0
      ? null
      : (ids[rand(ctx.seed, catScope(ctx, id), ctx.t, `place:${activity}`, ids.length)] ?? null);

  if ('node' in sel) {
    const n = sel.node === '$home' ? def.home : sel.node === '$here' ? here : sel.node;
    return dist[n] === undefined ? null : n;
  }
  if ('tag' in sel)
    return nearest(
      inRegion(regionOf(sel.region) ?? currentRegion)
        .filter((n) => n.tags.includes(sel.tag) || n.objectTags.includes(sel.tag))
        .map((n) => n.id),
    );
  if ('anyOf' in sel) {
    const picks = sel.anyOf.map((x) => selectPlace(ctx, id, x, activity)).filter((n) => n !== null);
    return nearest(c.nodes.map((n) => n.id).filter((n) => picks.includes(n)));
  }
  if ('flag' in sel)
    return nearest(
      inRegion(currentRegion)
        .filter((n) => (s.flags[`${sel.flag}@${n.id}`]?.value ?? 0) !== 0)
        .map((n) => n.id),
    );
  if ('neighbour' in sel) {
    const region = regionOf(sel.region) ?? currentRegion;
    return sampleOne(
      need(c.adj, here, 'place')
        .filter(
          (a) => !cs.knowsClosed.includes(a.edge) && need(c.node, a.to, 'place').region === region,
        )
        .map((a) => a.to),
    );
  }
  if ('nearest' in sel)
    return nearest(
      inRegion(currentRegion)
        .filter((n) => sel.nearest.some((t) => n.tags.includes(t)))
        .map((n) => n.id),
    );
  if ('nearCat' in sel) {
    const me = catPos(c, cs);
    let best: CatId | null = null;
    for (const other of c.cats) {
      if (other.id === id) continue;
      const op = catPos(c, catState(ctx, other.id));
      if (!within(me, op, sel.m)) continue;
      if (best === null || dist2(me, op) < dist2(me, catPos(c, catState(ctx, best))))
        best = other.id;
    }
    if (best === null) return null;
    const n = catNode(catState(ctx, best));
    return need(c.node, n, 'place').region === currentRegion && dist[n] !== undefined ? n : null;
  }
  const { region, tag } = sel.randomNode;
  return sampleOne(
    c.nodes
      .filter(
        (n) =>
          (region === undefined || n.region === region) &&
          (tag === undefined || n.tags.includes(tag)),
      )
      .filter((n) => dist[n.id] !== undefined)
      .map((n) => n.id),
  );
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
  const [lo, hi] = def.ticks;
  cs.activity = activity;
  cs.activityLeft = lo + rand(ctx.seed, catScope(ctx, id), ctx.t, `dur:${activity}`, hi - lo + 1);
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
  cs.activityLeft = 1;
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
  cs.activityLeft = 0;
  cs.activityPlace = null;
  cs.control = 'free';
}

function finish(ctx: Ctx, id: CatId, cs: CatState): void {
  const activity = cs.activity;
  cs.activityLeft = 0;
  const def = ctx.c.activity[activity];
  if (def?.onFinish) runEffects(ctx, def.onFinish, { self: id });
  emit(ctx, { tick: ctx.t, type: 'activityFinished', cat: id, activity });
  if (cs.control !== 'free') cs.control = 'free';
}

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
    finish(ctx, id, cs);
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
      finish(ctx, id, cs);
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
  if ((cs.activityPlace === null || cs.activityPlace === pos.at) && cs.activityLeft > 0) {
    const def = c.activity[cs.activity];
    const since = t - cs.activityStart;
    const due = (def?.while ?? []).filter((e) => since % (e.everyTicks ?? 1) === 0);
    if (due.length > 0) runEffects(ctx, due, { self: id });
    cs.activityLeft -= 1;
    if (cs.activityLeft === 0) finish(ctx, id, cs);
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

interface Candidate {
  activity: string;
  score: number;
  effect: RunningEffect | null; // for attracted / repelled offers
}

/** Phase 6 decision for one cat (03 §8.2). */
export function decide(ctx: Ctx, id: CatId): void {
  const { c } = ctx;
  const cs = catState(ctx, id);
  const def = need(c.cat, id, 'cat');
  const scope = { self: id };
  const cands: Candidate[] = [];

  for (const a of def.activities) {
    const ad = need(c.activity, a, 'activity');
    if (ad.gate && !test(ctx, ad.gate, scope)) continue;
    // selectPlace only returns places the cat can reach, so no path check is needed here.
    if (selectPlace(ctx, id, ad.at, a) === null) continue;
    const sticky = a === cs.activity && cs.activityLeft > 0 ? c.stickiness : 0;
    cands.push({ activity: a, score: score(ctx, ad.score, scope) + sticky, effect: null });
  }
  for (const e of ctx.s.effects) {
    if ((e.kind !== 'attract' && e.kind !== 'repel') || !reaches(ctx, e, id)) continue;
    const extra = e.kind === 'attract' && e.scale ? term(ctx, e.scale, scope, id) : 0;
    const activity = e.kind === 'attract' ? 'attracted' : 'repelled';
    const sticky = activity === cs.activity && cs.activityLeft > 0 ? c.stickiness : 0;
    cands.push({ activity, score: e.strength + extra + sticky, effect: e });
  }
  if (cands.length === 0) return;

  const p = softmax(
    cands.map((x) => x.score),
    def.temperatureTenths,
  );
  const chosen = cands[sample(p, rand(ctx.seed, catScope(ctx, id), ctx.t, 'act', 1_000_000))];
  if (!chosen || (chosen.activity === cs.activity && cs.activityLeft > 0)) return;

  if (chosen.effect?.kind === 'attract') {
    goTo(ctx, id, chosen.effect.place, 'free');
    cs.activity = 'attracted';
    cs.activityLeft = Math.max(1, chosen.effect.left);
  } else if (chosen.effect) {
    const away = nearestOutside(ctx, id, chosen.effect);
    if (away !== null) {
      goTo(ctx, id, away, 'free');
      cs.activity = 'repelled';
    }
  } else startActivity(ctx, id, chosen.activity, 'free');
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

/** Initial gauges of a cat for a stream (03 §5): part of the wave. */
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
