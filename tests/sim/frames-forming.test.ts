// Frames' forming stories (06 §2, assist mode, M8): each storylet started and not finished that can
// move on now (an exit with no gate or an open one), with P(it is in such a state), its likeliest such
// state and the cat of its first bound role.
import { describe, expect, it } from 'vitest';
import { fogSetup } from '../../src/sim/fog';
import { INACTIVE } from '../../src/sim/fog-quantities';
import { frameOf, storyletChances } from '../../src/sim/frames';
import { advance, initialWave, type Wave } from '../../src/sim/lantern';
import { rerunAll } from '../../src/sim/recompute';
import { PPM } from '../../src/sim/math';
import type { Frame, Pin } from '../../src/sim/types';
import { ch1Coarse, powerPin, tiny } from './helpers';

function framed(seed: number, until: number, pins: Pin[]) {
  const setup = fogSetup(tiny, seed);
  const waves: Wave[] = [initialWave(setup, ['hero'])];
  const frames: Frame[] = [];
  for (let t = 0; t < until; t++) {
    const w = waves[t];
    if (!w) throw new Error('no wave');
    const next = advance(setup, w, pins, ['hero']);
    waves.push(next);
    frames.push(frameOf(setup, w, next, undefined, pins));
  }
  return { waves, frames };
}

const running = (sl: string, st: string) =>
  st !== INACTIVE && (tiny.storylet[sl]?.states[st]?.exits.length ?? 0) > 0;

describe('forming stories in frames (06 §2)', () => {
  const { waves, frames } = framed(1, 60, [powerPin('glow', 'home.room', 0)]);

  it('a storylet the lantern runs is forming at 1 000 000 on its first role, until it ends', () => {
    // the glow at the hero's home starts `lured` (role hero, live) in the lantern
    const on = frames.filter((f) => f.forming.some((x) => x.storylet === 'lured'));
    expect(on.length).toBeGreaterThan(0);
    for (const f of on) {
      const x = f.forming.find((y) => y.storylet === 'lured');
      expect(x).toMatchObject({ p: PPM, cat: 'hero' });
      const run = waves[f.tick]?.lantern.sim.storylets['lured'];
      expect(run?.state).toBe(x?.state);
    }
    // never in a terminal state
    for (const f of frames)
      for (const x of f.forming) expect(running(x.storylet, x.state)).toBe(true);
  });

  it('p is at most the chance of the running states, the state the likeliest of those counted', () => {
    let fogHeld = 0;
    for (const f of frames) {
      const w = waves[f.tick];
      if (!w) throw new Error('no wave');
      const chances = storyletChances(tiny, w.fog, w.lantern);
      for (const sl of tiny.storylets) {
        const states = Object.entries(chances[sl.id] ?? {}).filter(([st]) => running(sl.id, st));
        const total = states.reduce((a, [, p]) => a + p, 0);
        const x = f.forming.find((y) => y.storylet === sl.id);
        if (total === 0) {
          expect(x).toBeUndefined();
          continue;
        }
        if (!x) continue; // every running state waits on a shut exit
        expect(x.p).toBeLessThanOrEqual(Math.min(PPM, total));
        const p = Object.fromEntries(states);
        expect(p[x.state]).toBeGreaterThan(0);
        if (w.lantern.heldStorylets.includes(sl.id)) fogHeld += 1;
      }
    }
    // `shift` (06:05 on, its boss a fogged worker) forms in the fog
    expect(fogHeld).toBeGreaterThan(0);
    const shift = frames.flatMap((f) => f.forming.filter((x) => x.storylet === 'shift'));
    expect(shift.some((x) => x.cat !== null)).toBe(true);
  });

  it('a storylet waiting on shut exits is not forming (Chapter 1: the lure’s `home`)', () => {
    const at = (pins: Pin[], tick: number) => {
      const setup = fogSetup(ch1Coarse, 4);
      const open = { story: 100_000, pastTicks: 0, storylets: setup.main };
      const r = rerunAll(setup, null, { pins, watched: [], frontier: open }).result;
      return r.frames[tick]?.forming.find((x) => x.storylet === 'door_lure');
    };
    // door_lure waits in `home` from dawn; its one exit needs the lure near Marti
    expect(at([], 300)).toBeUndefined();
    const lure: Pin = { id: 'pin1', seq: 1, tick: 715, kind: 'power', power: 'lure', place: 'flat.door' };
    expect(at([lure], 718)).toMatchObject({ p: PPM, cat: 'marti' });
  }, 120_000);

  it('frames stay plain JSON', () => {
    const f = frames[40];
    expect(JSON.parse(JSON.stringify(f))).toEqual(f);
  });
});
