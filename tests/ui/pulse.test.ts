// Assist mode's pulse (06 §2): the lit share of each cycle equals the marker's probability.
import { describe, expect, it } from 'vitest';
import { pulseLit, pulseOf } from '../../src/render/pulse';

/** The lit share of one whole cycle, sampled finely. */
function litShare(ppm: number, pulse: { cycle: number; phase: number }, from = 0): number {
  const steps = pulse.cycle * 100;
  let lit = 0;
  for (let i = 0; i < steps; i++) if (pulseLit(ppm, from + i / 100, pulse)) lit++;
  return lit / steps;
}

describe('the assist pulse (06 §2)', () => {
  it('draws each marker’s cycle once, in the range, the same every time', () => {
    for (const key of ['door_lure', 'under_the_boat', 'crew_chatter', 'x']) {
      const a = pulseOf(key, 15, 30);
      expect(a).toEqual(pulseOf(key, 15, 30));
      expect(a.cycle).toBeGreaterThanOrEqual(15);
      expect(a.cycle).toBeLessThanOrEqual(30);
      expect(a.phase).toBeGreaterThanOrEqual(0);
      expect(a.phase).toBeLessThan(a.cycle);
    }
    const cycles = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((k) => pulseOf(k, 15, 30).cycle));
    expect(cycles.size).toBeGreaterThan(1); // different cycles keep markers out of step
  });

  it('is lit for probability × cycle ticks of each cycle, in one stretch', () => {
    const pulse = pulseOf('door_lure', 15, 30);
    for (const ppm of [0, 100_000, 333_333, 500_000, 900_000, 1_000_000])
      for (const from of [0, 7.25, 123])
        expect(litShare(ppm, pulse, from)).toBeCloseTo(ppm / 1_000_000, 2);
    // one unbroken stretch: lit → dark at most once per cycle
    let changes = 0;
    let was = pulseLit(400_000, 0, pulse);
    for (let i = 1; i <= pulse.cycle * 100; i++) {
      const now = pulseLit(400_000, i / 100, pulse);
      if (now !== was) changes++;
      was = now;
    }
    expect(changes).toBeLessThanOrEqual(2);
  });

  it('paused, a marker stays as it is', () => {
    const pulse = pulseOf('chain_on_beach', 15, 30);
    const at = pulseLit(500_000, 41.5, pulse);
    for (let i = 0; i < 10; i++) expect(pulseLit(500_000, 41.5, pulse)).toBe(at);
  });
});
