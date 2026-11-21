// Score terms and hazard rates (spec 03 §9.2, §10.2).
import type { HazardTerm, Score, ScoreTerm } from '../content/schemas/dsl';
import { test, readGauge } from './conditions';
import { clamp } from './math';
import type { CatId, Ctx, Scope } from './types';

/** How many of world.primes hold; only the primes' own cat has any (03 §10.2). */
export function primeCount(ctx: Ctx, catId: string): number {
  const primes = ctx.c.world.primes;
  if (catId !== primes.cat) return 0;
  return primes.list.filter((p) => test(ctx, p.cond, {})).length;
}

/** One term. `offered` is the cat a card's scale is read from (bare gauge names). */
export function term(ctx: Ctx, t: ScoreTerm, scope: Scope, offered?: CatId): number {
  if ('base' in t) return t.base;
  if ('primeCount' in t) return t.add * primeCount(ctx, t.primeCount);
  if ('gauge' in t) {
    if (t.if && !test(ctx, t.if, scope)) return 0;
    return Math.trunc(readGauge(ctx, scope, t.gauge, offered) / t.per) * t.add;
  }
  return test(ctx, t.if, scope) ? t.add : 0;
}

export const score = (ctx: Ctx, sc: Score, scope: Scope): number =>
  sc.base + (sc.terms ?? []).reduce((sum, t) => sum + term(ctx, t, scope), 0);

/** perMille + Σ terms, clamped to 0..1000. */
export const hazardRate = (
  ctx: Ctx,
  perMille: number,
  terms: readonly HazardTerm[],
  scope: Scope,
): number =>
  clamp(
    perMille + terms.reduce((sum, t) => sum + (test(ctx, t.if, scope) ? t.addPerMille : 0), 0),
    0,
    1000,
  );
