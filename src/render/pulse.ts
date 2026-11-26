// Assist mode's pulse (06 §2; Tagir, 2026-11-26): each story marker draws its cycle length once, in
// ticks, from a render-only seeded hash keyed by the marker, and in each cycle shows for one unbroken
// stretch of probability × cycle length ticks. Time is the playhead's (tick + frac), so a paused marker
// stays as it is and the shuttle speeds its pulse up. Never the simulation's `rand`.

/** FNV-1a over the key, render-only. */
function hash(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A marker's cycle length in ticks, in [lo, hi], and where in it the playhead's tick 0 falls. */
export function pulseOf(key: string, lo: number, hi: number): { cycle: number; phase: number } {
  const span = Math.max(1, hi - lo + 1);
  const cycle = Math.max(1, Math.min(lo, hi) + (hash(`cycle|${key}`) % span));
  return { cycle, phase: hash(`phase|${key}`) % cycle };
}

/** Whether a marker of probability `ppm` is lit at playhead time `t` (ticks, fractional). */
export function pulseLit(ppm: number, t: number, pulse: { cycle: number; phase: number }): boolean {
  const k = (((t + pulse.phase) % pulse.cycle) + pulse.cycle) % pulse.cycle;
  return k < (ppm / 1_000_000) * pulse.cycle;
}
