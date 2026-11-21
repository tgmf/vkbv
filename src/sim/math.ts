// Integer maths for the simulation (spec 03 §1, §1.1). No floats are stored or compared.
import { EXP } from './exp-table';

export const PPM = 1_000_000;

export const mulPm = (a: number, pm: number): number => Math.trunc((a * pm) / 1000);

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** floor(sqrt(n)) for integer 0 <= n <= 2^52, by integer Newton iteration. */
export function isqrt(n: number): number {
  if (n < 2) return n;
  let x = n;
  let y = Math.trunc((x + 1) / 2);
  while (y < x) {
    x = y;
    y = Math.trunc((x + Math.trunc(n / x)) / 2);
  }
  return x;
}

/**
 * Softmax over integer scores at temperature tTenths (the Filter dial × 10), in ppm.
 * Uses the committed EXP table; the rounding remainder goes to the first top-scoring option.
 */
export function softmax(scores: readonly number[], tTenths: number): number[] {
  const m = Math.max(...scores);
  const e = scores.map((s) => {
    const k = Math.trunc(((m - s) * 1000) / tTenths);
    return k > 1200 ? 0 : (EXP[k] ?? 0);
  });
  const sum = e.reduce((a, b) => a + b, 0);
  const p = e.map((x) => Math.trunc((x * PPM) / sum));
  const top = scores.indexOf(m);
  p[top] = (p[top] ?? 0) + PPM - p.reduce((a, b) => a + b, 0);
  return p;
}

/** First index whose running sum of ppm exceeds r, for r in [0, 1 000 000). */
export function sample(ppm: readonly number[], r: number): number {
  let sum = 0;
  for (let i = 0; i < ppm.length; i++) {
    sum += ppm[i] ?? 0;
    if (sum > r) return i;
  }
  return ppm.length - 1;
}
