// Score terms and hazard rates (spec 03 §9.2, §10.2).
import type { HazardTerm, Score, ScoreTerm } from '../content/schemas/dsl';
import { chance, PPM, readGauge } from './conditions';
import { clamp } from './math';
import type { CatId, Ctx, Scope } from './types';

/** `add` scaled by a probability: trunc(add × ppm / 1 000 000) (03 §13.3). */
const scaled = (add: number, ppm: number): number => Math.trunc((add * ppm) / PPM);

/**
 * How many of world.primes hold, in ppm (1 000 000 per prime that surely holds); only the primes'
 * own cat has any (03 §10.2).
 */
export function primeCountPpm(ctx: Ctx, catId: string): number {
  const primes = ctx.c.world.primes;
  if (catId !== primes.cat) return 0;
  return primes.list.reduce((sum, p) => sum + chance(ctx, p.cond, {}), 0);
}

/** How many of world.primes surely hold (the count the trace and the inspector show). */
export const primeCount = (ctx: Ctx, catId: string): number =>
  Math.trunc(primeCountPpm(ctx, catId) / PPM);

/** One term. `offered` is the cat a card's scale is read from (bare gauge names). */
export function term(ctx: Ctx, t: ScoreTerm, scope: Scope, offered?: CatId): number {
  if ('base' in t) return t.base;
  if ('primeCount' in t) return scaled(t.add, primeCountPpm(ctx, t.primeCount));
  if ('gauge' in t) {
    const p = t.if ? chance(ctx, t.if, scope) : PPM;
    return scaled(Math.trunc(readGauge(ctx, scope, t.gauge, offered) / t.per) * t.add, p);
  }
  return scaled(t.add, chance(ctx, t.if, scope));
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
    perMille + terms.reduce((sum, t) => sum + scaled(t.addPerMille, chance(ctx, t.if, scope)), 0),
    0,
    1000,
  );
