// What frames carry for the viewer (06 §2, M5): barriers, running effects, Gaze circles, the lantern,
// voiced lines.
import { describe, expect, it } from 'vitest';
import { chance } from '../../src/sim/conditions';
import { fogSetup, lanternReader } from '../../src/sim/fog';
import { frameOf } from '../../src/sim/frames';
import { advance, initialWave, type Wave } from '../../src/sim/lantern';
import { PPM } from '../../src/sim/math';
import { rangeBetween } from '../../src/sim/perception';
import { catNode } from '../../src/sim/space';
import type { Frame, Pin } from '../../src/sim/types';
import { cardPin, ch1Coarse, makeCtx, powerPin, tiny } from './helpers';

const glow = powerPin('glow', 'home.room', 0);
const gazePin = powerPin('gaze', 'street.c', 20);
const PINS: Pin[] = [glow, gazePin];

function framed(seed: number, until: number, pins: Pin[] = PINS) {
  const setup = fogSetup(tiny, seed);
  const waves: Wave[] = [initialWave(setup, ['hero'])];
  const frames: Frame[] = [];
  for (let t = 0; t < until; t++) {
    const w = waves[t];
    if (!w) throw new Error('no wave');
    const next = advance(setup, w, pins, ['hero']);
    waves.push(next);
    const before = waves[t - 1];
    const pf = frames[t - 1];
    frames.push(
      frameOf(setup, w, next, before && pf ? { wave: before, frame: pf } : undefined, pins),
    );
  }
  return { setup, waves, frames };
}

describe('frames for the viewer (06 §2)', () => {
  it('list the lantern’s running effects, e.g. the glow while it runs', () => {
    const { waves, frames } = framed(1, 40);
    let glowing = 0;
    for (const f of frames) {
      const sim = waves[f.tick]?.lantern.sim;
      if (!sim) throw new Error('no wave');
      expect(f.effects).toEqual(
        sim.effects.map((e) => ({
          pin: e.pin,
          kind: e.kind,
          source: e.source,
          place: e.place,
          radiusM: e.radiusM,
        })),
      );
      if (f.effects.some((e) => e.pin === glow.id && e.kind === 'attract')) glowing += 1;
    }
    expect(glowing).toBeGreaterThanOrEqual(9); // 10 ticks of attract, from the tick after the pin
    expect(frames[30]?.effects).toEqual([]);
  });

  it('show a Gaze circle exactly on the ticks of its window', () => {
    const { frames } = framed(1, 30);
    const on = frames.filter((f) => f.gazes.length > 0).map((f) => f.tick);
    expect(on).toEqual([20, 21, 22]); // the tiny Gaze lasts 3 ticks
    expect(frames[20]?.gazes).toEqual([{ pin: gazePin.id, place: 'street.c', radiusM: 6 }]);
  });

  it('give each edge with a `when` its chance of being closed', () => {
    const { setup, waves, frames } = framed(1, 60);
    const gated = tiny.edges.filter((e) => e.when);
    expect(gated.length).toBeGreaterThan(0);
    for (const f of frames) {
      expect(Object.keys(f.closed)).toEqual(gated.map((e) => e.id));
      const w = waves[f.tick];
      if (!w) throw new Error('no wave');
      const ctx = {
        ...makeCtx(tiny, { state: w.lantern.sim }),
        live: w.lantern.live,
        held: w.lantern.heldStorylets,
        fog: lanternReader(setup, w.fog, f.tick),
      };
      for (const e of gated) {
        if (!e.when) continue;
        expect(f.closed[e.id]).toBe(PPM - chance(ctx, e.when, {}));
      }
    }
    expect(frames[0]?.closed).toEqual(Object.fromEntries(gated.map((e) => [e.id, 0])));
  });

  it('give the protagonist’s lantern: its range in its own space, smaller outdoors in rain', () => {
    for (const seed of [1, 2, 3]) {
      const { waves, frames } = framed(seed, 60);
      for (const f of frames) {
        const sim = waves[f.tick]?.lantern.sim;
        const hero = sim?.cats['hero'];
        if (!sim || !hero) throw new Error('no wave');
        const here = catNode(hero);
        expect(f.lanterns).toHaveLength(1);
        expect(f.lanterns[0]?.cat).toBe('hero');
        expect(f.lanterns[0]?.rangeMm).toBe(
          rangeBetween(tiny, 'hero', here, here, sim.weather.now, 'sight'),
        );
        expect(f.lanterns[0]?.seen).toContain(here);
      }
    }
    // the hero outdoors, dry and then in rain (03 §4: rain shortens sight outdoors)
    const setup = fogSetup(tiny, 1);
    const w0 = initialWave(setup, ['hero']);
    const at = (now: 'dry' | 'rain') => {
      const sim = structuredClone(w0.lantern.sim);
      const hero = sim.cats['hero'];
      if (!hero) throw new Error('no hero');
      hero.pos = { at: 'street.c' };
      sim.weather.now = now;
      return frameOf(setup, { ...w0, lantern: { ...w0.lantern, sim } }, null).lanterns[0];
    };
    const dry = at('dry');
    const wet = at('rain');
    const sightMm = (tiny.cat['hero']?.perception.sightM ?? 0) * 1000;
    expect(dry?.rangeMm).toBe(sightMm);
    expect(wet?.rangeMm).toBe((sightMm * tiny.world.perception.rainSightPerMille) / 1000);
    expect(wet?.seen.length).toBeLessThanOrEqual(dry?.seen.length ?? 0);
  });

  it('carry the lines of the step from the tick: the hero’s voices and storylet states with text', () => {
    let storylet = 0;
    for (const seed of [1, 2, 3]) {
      const { waves, frames } = framed(seed, 120);
      for (const f of frames) {
        const next = waves[f.tick + 1];
        if (!next) throw new Error('no wave');
        const expected = next.tickEvents.flatMap((e) => {
          if (e.type === 'voice')
            return e.cat === 'hero' ? [{ text: e.line, shows: `voice:${e.hook}`, cat: e.cat }] : [];
          if (e.type !== 'storylet') return [];
          const text = tiny.storylet[e.id]?.states[e.state]?.textKey;
          return text
            ? [{ text, shows: `${e.id}.${e.state}`, cat: Object.values(e.roles).flat()[0] ?? null }]
            : [];
        });
        expect(f.lines.map(({ text, shows, cat }) => ({ text, shows, cat }))).toEqual(expected);
        storylet += f.lines.filter((l) => !l.shows.startsWith('voice:')).length;
      }
      expect(JSON.parse(JSON.stringify(frames))).toEqual(frames);
    }
    expect(storylet).toBeGreaterThan(0);
  });

  it('give each pin before the tick its chance of having fired (06 §3: fizzled pins)', () => {
    const crate = cardPin('magnet', { object: 'crate' }, 2); // hidden until crateShown: pending
    const wrong = cardPin('nap_now', { cat: 'hero' }, 3); // bound to pal: never fires on the hero
    const onPal = cardPin('poke', { cat: 'pal' }, 6); // a fogged cat: the fog's
    const noBranch = cardPin('scare', { cat: 'pal' }, 7); // scare has no cat branch
    const pins = [glow, crate, wrong, onPal, noBranch];
    const { waves, frames } = framed(1, 40, pins);
    for (const f of frames)
      for (const pin of pins) if (pin.tick >= f.tick) expect(f.pins[pin.id]).toBeUndefined();
    expect(frames[1]?.pins[glow.id]).toBe(PPM);
    expect(frames[3]?.pins[crate.id]).toBe(0);
    expect(frames[4]?.pins[wrong.id]).toBe(0);
    for (const f of frames.slice(4)) expect(f.pins[wrong.id]).toBe(0);
    // the crate's pin fires once the crate shows in the lantern
    const shown = waves.findIndex((w) => w.lantern.sim.facts.includes('crateShown'));
    for (const f of frames.slice(3))
      expect(f.pins[crate.id]).toBe(
        waves[f.tick]?.lantern.sim.pins[crate.id] === 'fired' ? PPM : 0,
      );
    if (shown < 0) expect(frames[39]?.pins[crate.id]).toBe(0);
    // pins on a fogged cat are read from the fog: a valid one fires, one with no branch never does
    const seen = frames.filter((f) => f.pins[onPal.id] !== undefined);
    expect(seen.length).toBeGreaterThan(0);
    for (const f of seen) expect(f.pins[onPal.id]).toBe(PPM);
    const dead = frames.filter((f) => f.pins[noBranch.id] !== undefined);
    expect(dead.length).toBeGreaterThan(0);
    for (const f of dead) expect(f.pins[noBranch.id]).toBe(0);
  });

  it('a pin the fog holds that fired in every case reads 1 000 000 exactly, however many cases', () => {
    // Chapter 1, a card on a fogged crew cat in the morning: several cases, every one fired
    const setup = fogSetup(ch1Coarse, 4);
    const pin = cardPin('something_shiny', { cat: 'gavrila' }, 200);
    let w = initialWave(setup, ['marti']);
    let checked = 0;
    while (w.lantern.sim.tick < 260) {
      const next = advance(setup, w, [pin], ['marti']);
      const f = frameOf(setup, w, next, undefined, [pin]);
      if (
        w.lantern.sim.tick > 205 &&
        w.fog.cases.length > 1 &&
        !w.lantern.live.includes('gavrila')
      ) {
        expect(f.pins[pin.id]).toBe(PPM);
        checked += 1;
      }
      w = next;
    }
    expect(checked).toBeGreaterThan(0);
  }, 120_000);
});
