/**
 * mulberry32 — the only source of randomness allowed in src/sim.
 * Pure: takes the current 32-bit state and returns the next state plus a float in [0, 1).
 */
export interface PrngResult {
  readonly state: number;
  readonly value: number;
}

export function seedState(seed: number): number {
  return seed >>> 0;
}

export function nextFloat(state: number): PrngResult {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { state: next, value };
}
