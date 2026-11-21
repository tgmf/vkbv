// Storylet, activity and hook effects (spec 03 §9.3, first table).
import type { Effect } from '../content/schemas/dsl';
import {
  clampBase,
  catState,
  goTo,
  insertSorted,
  setInterrupt,
  startActivity,
  stopCat,
} from './cats';
import { cat, cats, flagKey, placeOf, posOf } from './conditions';
import { rand } from './rng';
import { catNode, catPos, nodePos } from './space';
import { activate } from './storylets';
import type { CatId, Ctx, NodeId, Pos, Scope } from './types';
import { worldScope } from './types';

export function addFact(ctx: Ctx, fact: string): void {
  if (insertSorted(ctx.s.facts, fact)) ctx.events.push({ tick: ctx.t, type: 'fact', fact });
}

/** Emits a named event (03 §4: an event with radiusM is a sound). */
export function emitNamed(
  ctx: Ctx,
  name: string,
  at: { pos: Pos; node: NodeId },
  more: {
    radiusM?: number | null;
    source?: CatId | null;
    to?: CatId | null;
    storylet?: string | null;
    global?: boolean;
    hops?: number;
    factIfPerceivedBy?: Record<CatId, string> | null;
  } = {},
): void {
  ctx.events.push({
    tick: ctx.t,
    type: 'emit',
    name,
    pos: at.pos,
    node: at.node,
    radiusM: more.radiusM ?? null,
    source: more.source ?? null,
    to: more.to ?? null,
    storylet: more.storylet ?? null,
    global: more.global ?? false,
    hops: more.hops ?? 0,
    factIfPerceivedBy: more.factIfPerceivedBy ?? null,
  });
}

/** Where a cat stands, as an event position. */
export function catSpot(ctx: Ctx, id: CatId): { pos: Pos; node: NodeId } {
  const cs = catState(ctx, id);
  return { pos: catPos(ctx.c, cs), node: catNode(cs) };
}

export function runEffects(ctx: Ctx, list: readonly Effect[], scope: Scope): void {
  for (const e of list) {
    // QUESTION(M1-3): purpose chance:<n> counts every chance effect this tick, so an unrelated
    // earlier roll shifts later ones (03 §9.3 read literally).
    if (e.chance !== undefined) {
      const roll = rand(ctx.seed, worldScope(ctx), ctx.t, `chance:${ctx.chanceN}`, 1000);
      ctx.chanceN += 1;
      if (roll >= e.chance) continue;
    }
    apply(ctx, e, scope);
  }
}

function apply(ctx: Ctx, e: Effect, scope: Scope): void {
  const { s, t } = ctx;
  if ('goTo' in e) {
    const [who, node] = e.goTo;
    const opts = {
      via: e.route === 'via' ? e.via : undefined,
      edgesTagged: e.route === 'edgesTagged' ? e.tag : undefined,
    };
    for (const id of cats(ctx, scope, who)) goTo(ctx, id, node, 'storylet', opts);
  } else if ('startActivity' in e) {
    for (const id of cats(ctx, scope, e.startActivity[0]))
      startActivity(ctx, id, e.startActivity[1], 'storylet');
  } else if ('stop' in e) {
    for (const id of cats(ctx, scope, e.stop)) stopCat(catState(ctx, id));
  } else if ('interrupt' in e) {
    const [who, action, ticks] = e.interrupt;
    for (const id of cats(ctx, scope, who))
      setInterrupt(ctx, id, action, ticks, scope.storylet ?? 'effect');
  } else if ('emit' in e) {
    const source = (e.from ? cat(ctx, scope, e.from) : null) ?? scope.self ?? scope.origin ?? null;
    const to = e.to ? cat(ctx, scope, e.to) : null;
    let spot: { pos: Pos; node: NodeId } | null = null;
    if (e.at) spot = { pos: nodePos(ctx.c, e.at), node: e.at };
    else if (source) spot = catSpot(ctx, source);
    else if (to) spot = catSpot(ctx, to);
    if (!spot) return;
    emitNamed(ctx, e.emit, spot, {
      radiusM: e.radiusM ?? null,
      source,
      to,
      storylet: scope.storylet ?? null,
      factIfPerceivedBy: e.factIfPerceivedBy ?? null,
    });
  } else if ('trigger' in e) {
    activate(ctx, e.trigger);
  } else if ('flag' in e) {
    const node = e.at === undefined ? null : placeOf(ctx, scope, e.at);
    if (e.at !== undefined && node === null) return;
    const value =
      e.value === undefined ? 1 : typeof e.value === 'boolean' ? Number(e.value) : e.value;
    s.flags[flagKey(e.flag, node)] = { value, until: e.ttl === undefined ? null : t + e.ttl };
  } else if ('gauge' in e) {
    const dot = e.gauge.indexOf('.');
    const g = e.gauge.slice(dot + 1);
    for (const id of cats(ctx, scope, e.gauge.slice(0, dot))) {
      const cs = catState(ctx, id);
      const base = cs.base[g];
      if (base === undefined) continue;
      if (e.set !== undefined) cs.base[g] = clampBase(ctx.c, g, e.set);
      else if (e.add !== undefined && e.holdTicks !== undefined)
        cs.mods.push({ gauge: g, add: e.add, left: e.holdTicks, decayPerTick: 0, pin: null });
      else if (e.add !== undefined) cs.base[g] = clampBase(ctx.c, g, base + e.add);
    }
  } else if ('counter' in e) {
    s.counters[e.counter] = (s.counters[e.counter] ?? 0) + e.add;
  } else if ('fact' in e) {
    addFact(ctx, e.fact);
  } else {
    const never: never = e;
    throw new Error(`unknown effect ${JSON.stringify(never)}`);
  }
}

/** Position of a reference for effects that need one (exported for pins). */
export const spotOf = (ctx: Ctx, scope: Scope, ref: string): { pos: Pos; node: NodeId } | null => {
  const node = placeOf(ctx, scope, ref);
  const pos = posOf(ctx, scope, ref);
  return node && pos ? { pos, node } : null;
};
