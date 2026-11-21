// Conditions (spec 03 §8.1, §10.1) and the reads they need.
import type { Condition } from '../content/schemas/dsl';
import { clamp } from './math';
import { catNode, catPos, inWindow, nodePos, within } from './space';
import type { CatId, Ctx, NodeId, Pos, Scope } from './types';
import { need } from './types';

const TRAITS = ['O', 'C', 'E', 'A', 'N'];

/** The cats a reference names: `self`, `@role` (all its cats) or a cat id. */
export function cats(ctx: Ctx, scope: Scope, who: string): CatId[] {
  if (who === 'self') return scope.self ? [scope.self] : [];
  if (who.startsWith('@')) return [...(scope.roles?.[who.slice(1)] ?? [])];
  return ctx.s.cats[who] ? [who] : [];
}

export const cat = (ctx: Ctx, scope: Scope, who: string): CatId | null =>
  cats(ctx, scope, who)[0] ?? null;

/** A gauge's value: base plus running mods, clamped (03 §5). A cat without it reads 0. */
export function gaugeOf(ctx: Ctx, catId: CatId, gauge: string): number {
  const cs = need(ctx.s.cats, catId, 'cat');
  const base = cs.base[gauge];
  if (base === undefined) return 0;
  if (TRAITS.includes(gauge)) return base;
  let v = base;
  for (const m of cs.mods) if (m.gauge === gauge) v += m.add;
  return clamp(v, ctx.c.hooksFloor, 1000);
}

/** Reads `who.gauge`; `fallbackCat` is used for a bare gauge name (a card's scale). */
export function readGauge(ctx: Ctx, scope: Scope, ref: string, fallbackCat?: CatId): number {
  const dot = ref.indexOf('.');
  const id = dot < 0 ? (fallbackCat ?? null) : cat(ctx, scope, ref.slice(0, dot));
  return id ? gaugeOf(ctx, id, dot < 0 ? ref : ref.slice(dot + 1)) : 0;
}

/** The place a reference stands at: a cat's place, or the place itself. */
export function placeOf(ctx: Ctx, scope: Scope, ref: string): NodeId | null {
  if (ctx.c.node[ref]) return ref;
  const id = cat(ctx, scope, ref);
  return id ? catNode(need(ctx.s.cats, id, 'cat')) : null;
}

export function posOf(ctx: Ctx, scope: Scope, ref: string): Pos | null {
  if (ctx.c.node[ref]) return nodePos(ctx.c, ref);
  const id = cat(ctx, scope, ref);
  return id ? catPos(ctx.c, need(ctx.s.cats, id, 'cat')) : null;
}

export const flagKey = (name: string, node: NodeId | null): string =>
  node ? `${name}@${node}` : name;
export const flagValue = (ctx: Ctx, key: string): number => ctx.s.flags[key]?.value ?? 0;
export const hasFact = (ctx: Ctx, fact: string): boolean => ctx.s.facts.includes(fact);

/** A running effect from a pin of this card or power within m metres of the cat. */
function effectNear(
  ctx: Ctx,
  scope: Scope,
  src: { card: string } | { power: string },
  who: string,
  m: number,
) {
  const p = posOf(ctx, scope, who);
  return (
    p !== null &&
    ctx.s.effects.some(
      (e) =>
        ('card' in src
          ? 'card' in e.source && e.source.card === src.card
          : 'power' in e.source && e.source.power === src.power) &&
        within(nodePos(ctx.c, e.place), p, m),
    )
  );
}

const cmp = (
  v: number,
  c: {
    gte?: number | undefined;
    lte?: number | undefined;
    lt?: number | undefined;
    eq?: number | undefined;
  },
) =>
  (c.gte === undefined || v >= c.gte) &&
  (c.lte === undefined || v <= c.lte) &&
  (c.lt === undefined || v < c.lt) &&
  (c.eq === undefined || v === c.eq);

export const PPM = 1_000_000;
const ppmOf = (b: boolean): number => (b ? PPM : 0);

/**
 * A condition's probability in ppm (03 §13.3). `all` multiplies (independence assumed), `any` is
 * 1 − Π(1 − p), `not` is 1 − p. About live things every leaf is 0 or 1 000 000, so the result is
 * exactly the boolean of §10.1.
 */
export function chance(ctx: Ctx, cond: Condition, scope: Scope): number {
  if ('all' in cond) {
    let p = PPM;
    for (const x of cond.all) {
      if (p === 0) break;
      p = Math.trunc((p * chance(ctx, x, scope)) / PPM);
    }
    return p;
  }
  if ('any' in cond) {
    let q = PPM; // probability that none holds
    for (const x of cond.any) {
      if (q === 0) break;
      q = Math.trunc((q * (PPM - chance(ctx, x, scope))) / PPM);
    }
    return PPM - q;
  }
  if ('not' in cond) return PPM - chance(ctx, cond.not, scope);
  return ppmOf(leaf(ctx, cond, scope));
}

/** A gate: holds when its probability reaches `fog.gateThresholdPpm` (03 §13.3). */
export const test = (ctx: Ctx, cond: Condition, scope: Scope): boolean =>
  chance(ctx, cond, scope) >= ctx.c.tuning.fog.gateThresholdPpm;

type Leaf = Exclude<Condition, { all: unknown } | { any: unknown } | { not: unknown }>;

function leaf(ctx: Ctx, cond: Leaf, scope: Scope): boolean {
  const { c, s } = ctx;
  if ('fact' in cond) return hasFact(ctx, cond.fact);
  if ('flag' in cond) {
    const node = cond.at === undefined ? null : placeOf(ctx, scope, cond.at);
    return (
      (cond.at === undefined || node !== null) && flagValue(ctx, flagKey(cond.flag, node)) !== 0
    );
  }
  if ('gauge' in cond) return cmp(readGauge(ctx, scope, cond.gauge), cond);
  if ('power' in cond) return effectNear(ctx, scope, { power: cond.power }, cond.near, cond.m);
  if ('pin' in cond) return effectNear(ctx, scope, { card: cond.pin }, cond.near, cond.m);
  if ('near' in cond) {
    const a = posOf(ctx, scope, cond.near[0]);
    const b = posOf(ctx, scope, cond.near[1]);
    return a !== null && b !== null && within(a, b, cond.m);
  }
  if ('clock' in cond) return inWindow(c, ctx.t, cond.clock);
  if ('weather' in cond) return s.weather.now === cond.weather;
  if ('state' in cond) return s.storylets[cond.state[0]]?.state === cond.state[1];
  if ('counter' in cond) return cmp(s.counters[cond.counter] ?? 0, cond);
  if ('heard' in cond) {
    const id = cat(ctx, scope, cond.by);
    return id !== null && need(s.cats, id, 'cat').heard.includes(cond.heard);
  }
  if ('countCats' in cond) {
    const { tag, notTag, except = [] } = cond.countCats;
    let n = 0;
    for (const def of c.cats) {
      if (except.includes(def.id)) continue;
      const tags = need(c.node, catNode(need(s.cats, def.id, 'cat')), 'place').tags;
      if (
        (tag === undefined || tags.includes(tag)) &&
        (notTag === undefined || !tags.includes(notTag))
      )
        n++;
    }
    return n === cond.eq;
  }
  if ('bound' in cond) return cats(ctx, scope, cond.bound).length > 0;
  if ('activityFinished' in cond) {
    const id = cat(ctx, scope, cond.activityFinished[0]);
    return ctx.events.some(
      (e) =>
        e.type === 'activityFinished' && e.cat === id && e.activity === cond.activityFinished[1],
    );
  }
  if ('card' in cond) {
    return ctx.events.some((e) => e.type === 'pinFired' && e.special && e.card === cond.card);
  }
  if ('activity' in cond) {
    const id = cat(ctx, scope, cond.activity);
    return id !== null && need(s.cats, id, 'cat').activity === cond.is;
  }
  if ('at' in cond) {
    const id = cat(ctx, scope, cond.at);
    if (id === null) return false;
    const node = need(c.node, catNode(need(s.cats, id, 'cat')), 'place');
    // QUESTION(M1-1): a place's tags here are its own tags only; place selectors (03 §8.2) also
    // count the tags of objects standing there. See docs/questions.md.
    return (
      (cond.node === undefined || node.id === cond.node) &&
      (cond.tag === undefined || node.tags.includes(cond.tag)) &&
      (cond.region === undefined || node.region === cond.region)
    );
  }
  const never: never = cond;
  throw new Error(`unknown condition ${JSON.stringify(never)}`);
}
