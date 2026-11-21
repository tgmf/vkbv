// Conditions (spec 03 §8.1, §10.1) and the reads they need.
import type { Condition } from '../content/schemas/dsl';
import { clamp, PPM, probAtLeast } from './math';
import { catNode, catPos, inWindow, nodePos, within } from './space';
import type { CatId, CatState, Ctx, FogReader, NodeId, Pos, Scope } from './types';
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
  return ctx.fog ? fogLeaf(ctx, ctx.fog, cond, scope) : ppmOf(leaf(ctx, cond, scope));
}

// --- leaves in the fog (03 §13.3, §13.6) ---------------------------------------------------------

/** The cat whose state a leaf reads, if any (the first cat a reference names, as `leaf` reads it). */
function leafCat(ctx: Ctx, cond: Leaf, scope: Scope): CatId | null {
  const who = (ref: string) => cat(ctx, scope, ref);
  if ('flag' in cond) return cond.at === undefined || ctx.c.node[cond.at] ? null : who(cond.at);
  if ('gauge' in cond) return who(cond.gauge.slice(0, Math.max(0, cond.gauge.indexOf('.'))));
  if ('power' in cond || 'pin' in cond) return who(cond.near);
  if ('activity' in cond) return who(cond.activity);
  if ('activityFinished' in cond) return who(cond.activityFinished[0]);
  if ('at' in cond) return who(cond.at);
  return null;
}

/** P(lo ≤ X ≤ hi) for a counter held as mean and variance. */
function counterChance(
  m: { mean: number; variance: number },
  cnd: {
    gte?: number | undefined;
    lte?: number | undefined;
    lt?: number | undefined;
    eq?: number | undefined;
  },
): number {
  const lo = cnd.gte ?? cnd.eq;
  const hi = cnd.lte ?? (cnd.lt === undefined ? cnd.eq : cnd.lt - 1);
  const atLeast = (x: number | undefined) =>
    x === undefined ? PPM : probAtLeast(m.mean, m.variance, x);
  return Math.max(0, atLeast(lo) - (hi === undefined ? 0 : atLeast(hi + 1)));
}

/**
 * A leaf's probability in the fog. World quantities come from the fog; a leaf about a fogged cat
 * is the leaf's own boolean averaged over that cat's chain (each state stands in for the cat).
 */
function fogLeaf(ctx: Ctx, fog: FogReader, cond: Leaf, scope: Scope): number {
  if ('fact' in cond) return fog.quantity(`fact:${cond.fact}`);
  if ('state' in cond) return fog.quantity(`state:${cond.state[0]}.${cond.state[1]}`);
  if ('counter' in cond) return counterChance(fog.counter(cond.counter), cond);
  if ('heard' in cond) {
    const id = cat(ctx, scope, cond.by);
    if (id === null) return 0;
    return fog.chain(id) ? fog.heard(id, cond.heard) : ppmOf(leaf(ctx, cond, scope));
  }
  if ('countCats' in cond) return countCatsChance(ctx, fog, cond);
  if ('near' in cond) {
    // two references: mix over each fogged one in turn
    const a = cat(ctx, scope, cond.near[0]);
    const b = cat(ctx, scope, cond.near[1]);
    return mixed(ctx, fog, [a, b], () => ppmOf(leaf(ctx, cond, scope)));
  }
  const inner = (): number => {
    if ('flag' in cond) {
      const node = cond.at === undefined ? null : placeOf(ctx, scope, cond.at);
      if (cond.at !== undefined && node === null) return 0;
      return fog.quantity(`flag:${flagKey(cond.flag, node)}`);
    }
    return ppmOf(leaf(ctx, cond, scope));
  };
  return mixed(ctx, fog, [leafCat(ctx, cond, scope)], inner);
}

/** `inner` averaged over the chains of the fogged cats among `ids` (independent given the case). */
function mixed(
  ctx: Ctx,
  fog: FogReader,
  ids: readonly (CatId | null)[],
  inner: () => number,
): number {
  const [first, ...rest] = ids;
  if (ids.length === 0) return inner();
  const chain = first === null || first === undefined ? null : fog.chain(first);
  if (!chain || first === null || first === undefined || rest.includes(first))
    return mixed(ctx, fog, rest, inner);
  const saved = need(ctx.s.cats, first, 'cat');
  let sum = 0;
  try {
    for (const x of chain) {
      ctx.s.cats[first] = x.cat;
      sum += Math.trunc((x.p * mixed(ctx, fog, rest, inner)) / PPM);
    }
  } finally {
    ctx.s.cats[first] = saved;
  }
  return Math.min(PPM, sum);
}

/** P(exactly `eq` cats stand at matching places): each cat live (0 or 1) or by its chain. */
function countCatsChance(
  ctx: Ctx,
  fog: FogReader,
  cond: Extract<Leaf, { countCats: unknown }>,
): number {
  const { tag, notTag, except = [] } = cond.countCats;
  const matches = (cs: CatState) => {
    const tags = need(ctx.c.node, catNode(cs), 'place').tags;
    return (
      (tag === undefined || tags.includes(tag)) && (notTag === undefined || !tags.includes(notTag))
    );
  };
  // dist[k] = P(k cats so far match), in ppm
  let dist = [PPM];
  for (const def of ctx.c.cats) {
    if (except.includes(def.id)) continue;
    const chain = fog.chain(def.id);
    const p = chain
      ? chain.reduce((sum, x) => sum + (matches(x.cat) ? x.p : 0), 0)
      : ppmOf(matches(need(ctx.s.cats, def.id, 'cat')));
    const next = new Array<number>(dist.length + 1).fill(0);
    dist.forEach((d, k) => {
      next[k] = (next[k] ?? 0) + Math.trunc((d * (PPM - p)) / PPM);
      next[k + 1] = (next[k + 1] ?? 0) + Math.trunc((d * p) / PPM);
    });
    dist = next;
  }
  return dist[cond.eq] ?? 0;
}

/** Whether a flag is set: live, non-zero; in the fog, its probability passes the gate (03 §13.3). */
export const flagHolds = (ctx: Ctx, key: string): boolean =>
  ctx.fog
    ? ctx.fog.quantity(`flag:${key}`) >= ctx.c.tuning.fog.gateThresholdPpm
    : flagValue(ctx, key) !== 0;

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
