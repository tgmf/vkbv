// Frames (03 §16): ghosts per cat, events, rain, requirement odds and progress (04 §6).
import { describe, expect, it } from 'vitest';
import { fogSetup } from '../../src/sim/fog';
import { factChance, frameOf, progressOf, requirementItems } from '../../src/sim/frames';
import { advance, initialWave, type Wave } from '../../src/sim/lantern';
import { PPM } from '../../src/sim/math';
import { catNode, catPos } from '../../src/sim/space';
import type { Frame } from '../../src/sim/types';
import { powerPin, tiny } from './helpers';

const glow = powerPin('glow', 'home.room', 0);

/** Waves 0..until and the frames of ticks 0..until − 1, each built from the frame before it. */
function framed(seed: number, until: number) {
  const setup = fogSetup(tiny, seed);
  const waves: Wave[] = [initialWave(setup, ['hero'])];
  const frames: Frame[] = [];
  for (let t = 0; t < until; t++) {
    const w = waves[t];
    if (!w) throw new Error('no wave');
    const next = advance(setup, w, [glow], ['hero']);
    waves.push(next);
    const before = waves[t - 1];
    const pf = frames[t - 1];
    frames.push(frameOf(setup, w, next, before && pf ? { wave: before, frame: pf } : undefined));
  }
  return { setup, waves, frames };
}

const isInts = (x: unknown): boolean =>
  typeof x === 'number'
    ? Number.isInteger(x)
    : Array.isArray(x)
      ? x.every(isInts)
      : typeof x === 'object' && x !== null
        ? Object.values(x).every(isInts)
        : true;

describe('frames (03 §16)', () => {
  it('give a live cat one ghost at 1 000 000 and a fogged cat ghosts summing to 1 000 000', () => {
    for (const seed of [1, 2, 3]) {
      const { waves, frames } = framed(seed, 60);
      for (const f of frames) {
        const w = waves[f.tick];
        if (!w) throw new Error('no wave');
        expect(Object.keys(f.cats)).toEqual(tiny.cats.map((x) => x.id));
        for (const [id, ghosts] of Object.entries(f.cats)) {
          expect(ghosts.reduce((a, g) => a + g.p, 0)).toBe(PPM);
          expect(ghosts.every((g) => g.p > 0)).toBe(true);
          if (w.lantern.live.includes(id)) {
            const cs = w.lantern.sim.cats[id];
            if (!cs) throw new Error('no cat');
            expect(ghosts).toEqual([
              {
                node: catNode(cs),
                pos: catPos(tiny, cs),
                activity: cs.activity,
                interrupt: cs.interrupt?.action ?? null,
                p: PPM,
              },
            ]);
          }
        }
        // the weather is concrete up to the lantern edge
        expect(f.rain).toBe(w.lantern.sim.weather.now === 'rain' ? PPM : 0);
        expect(isInts(f)).toBe(true);
      }
      expect(JSON.parse(JSON.stringify(frames))).toEqual(frames);
    }
  });

  it('keep a fogged cat’s ghosts only when its chains did not change', () => {
    const { setup, waves, frames } = framed(1, 60);
    for (const f of frames) {
      const w = waves[f.tick];
      const next = waves[f.tick + 1];
      if (!w || !next) throw new Error('no wave');
      expect(frameOf(setup, w, next)).toEqual(f);
    }
  });

  it('read requirement odds and progress from the lantern and the fog (04 §6)', () => {
    const { waves, frames } = framed(1, 60);
    const items = requirementItems(tiny);
    expect(items.map((r) => r.weight)).toEqual([50, 0, 50]);
    let heroOut = false;
    for (const f of frames) {
      const w = waves[f.tick];
      if (!w) throw new Error('no wave');
      const sim = w.lantern.sim;
      expect(f.requirements[0]).toBe(factChance(sim, w.fog, 'heroOut'));
      if (sim.facts.includes('heroOut')) {
        heroOut = true;
        expect(f.requirements[0]).toBe(PPM);
      }
      expect(f.progress).toBe(progressOf(tiny, f.requirements));
      const counted = f.requirements.reduce(
        (a, p, i) => a + (p >= tiny.tuning.frontier.countAtPpm ? (items[i]?.weight ?? 0) : 0),
        0,
      );
      expect(f.progress).toBe(counted);
    }
    expect(heroOut).toBe(true); // the glow brings the hero out on seed 1
  });

  it('show the lantern’s events at the tick that emitted them', () => {
    const { waves, frames } = framed(1, 60);
    let seen = 0;
    for (const f of frames) {
      const next = waves[f.tick + 1];
      if (!next) throw new Error('no wave');
      for (const e of next.tickEvents)
        if (e.type === 'storylet') {
          expect(f.happens[`storylet:${e.id}.${e.state}`]).toBe(PPM);
          seen += 1;
        }
      for (const p of Object.values(f.happens)) expect(p).toBeLessThanOrEqual(PPM);
    }
    expect(seen).toBeGreaterThan(0);
  });
});
