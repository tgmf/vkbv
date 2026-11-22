// Pins on fogged targets (03 §11, §13.6), temporary mods shifting back (03 §13.2), socialSpread hops
// in the fog (03 §9.3) and the 03 §18 invariants for pins.
import { describe, expect, it } from 'vitest';
import { readChapterDir } from '../../src/cli/files';
import { BOREDOM } from '../../src/sim/cats';
import pinsets from '../../src/content/data/pinsets.json';
import { loadChapter, parsePinSets } from '../../src/content/load';
import {
  fogSetup,
  fogStep,
  initialFog,
  WAVE_TOTAL,
  type ChainState,
  type Fog,
  type FogCase,
  type FogSetup,
} from '../../src/sim/fog';
import { flagChance } from '../../src/sim/fog-quantities';
import type { Content, Pin } from '../../src/sim/types';
import { cardPin, ch1Coarse, powerPin, tiny, TINY_DIR, tuning } from './helpers';

/** Steps a projection `n` times with the pins. */
function run(setup: FogSetup, fog: Fog, pins: Pin[], n: number): Fog {
  let f = fog;
  for (let i = 0; i < n; i++) f = fogStep(setup, f, undefined, true, null, pins);
  return f;
}

const only = (fog: Fog): FogCase => {
  const fc = fog.cases[0];
  if (!fc || fog.cases.length !== 1) throw new Error('expected one case');
  return fc;
};

const chain = (fog: Fog, id: string) => only(fog).cats[id]?.chain ?? [];
const massOf = (fog: Fog, id: string, test: (s: ChainState) => boolean) =>
  chain(fog, id).reduce((a, e) => a + (test(e.s) ? e.p : 0), 0);
const meanOf = (fog: Fog, id: string, g: string) => only(fog).cats[id]?.mean[g];

interface Editable {
  cards: { cards: { id: string; on: Record<string, Record<string, unknown>[]> }[] };
  hooks: { hooks: { id: string; decay?: unknown }[] };
}

/** The tiny world with its files edited for one test, and fog knobs overridden. */
function variant(edit: (files: Editable) => void, fog: Partial<typeof tuning.fog> = {}): Content {
  const files = structuredClone(readChapterDir(TINY_DIR));
  edit(files as unknown as Editable);
  return loadChapter(files, { ...tuning, fog: { ...tuning.fog, ...fog } });
}

const card = (f: Editable, id: string) => {
  const found = f.cards.cards.find((x) => x.id === id);
  if (!found) throw new Error(`no card ${id}`);
  return found;
};

describe('pins on fogged cats (03 §13.6)', () => {
  it('an interrupt moves the whole chain; willpower shortens a direct one (03 §8.4)', () => {
    const setup = fogSetup(tiny, 1);
    const onPal = cardPin('poke', { cat: 'pal' }, 2);
    const onHero = cardPin('poke', { cat: 'hero' }, 3);
    // poke: interrupt 10 ticks. pal (willpower 0): 2 steps, one left after this step. hero
    // (willpower 850): mulPm(10, 150) = 1 tick, one step, over by the end of this step.
    const next = run(setup, initialFog(setup, ['hero', 'pal']), [onPal, onHero], 1);
    const jumping = (s: ChainState) =>
      s.interrupt?.action === 'jump' && s.interrupt.leftSteps === 1;
    expect(massOf(next, 'pal', jumping)).toBe(1_000_000);
    expect(massOf(next, 'hero', (s) => s.interrupt !== null)).toBe(0);
    expect(only(next).q.pins).toEqual({
      [onPal.id]: { fired: 1_000_000, fizzled: 0 },
      [onHero.id]: { fired: 1_000_000, fizzled: 0 },
    });
  });

  it('an interrupt with a radius from a place moves only the mass inside it', () => {
    const setup = fogSetup(tiny, 1);
    const fog = initialFog(setup, ['bystander', 'pal']);
    // poke on street.a: radius 5. The bystander naps at street.a; pal walks from street.b (20 m).
    const plain = run(setup, fog, [], 1);
    const poked = run(setup, fog, [cardPin('poke', { place: 'street.a' }, 0)], 1);
    // interrupted for its one step, the bystander's nap did not tire, so it keeps napping
    const fresh = (x: ChainState) => x.activity === 'nap' && x.bands[BOREDOM] === 0;
    expect(massOf(poked, 'bystander', fresh)).toBe(1_000_000);
    expect(massOf(plain, 'bystander', fresh)).toBe(0);
    expect(chain(poked, 'pal')).toEqual(chain(plain, 'pal'));
  });

  it('a delay holds the cat in its activity where it stands, then it decides (03 §8.3)', () => {
    const setup = fogSetup(tiny, 1);
    // nap_now: delay 6 ticks = 2 steps. pal starts walking from street.b to work at street.c.
    const pin = cardPin('nap_now', { cat: 'pal' }, 0);
    const one = run(setup, initialFog(setup, ['pal']), [pin], 1);
    const held = (s: ChainState) =>
      s.control === 'forced' && s.activity === 'nap' && s.place === 'street.b' && s.forced === 1;
    expect(massOf(one, 'pal', held)).toBe(1_000_000);
    const two = run(setup, one, [pin], 1);
    expect(massOf(two, 'pal', (s) => s.control === 'forced' || s.forced !== undefined)).toBe(0);
  });

  it('a move sends the whole chain there as a forced goTo', () => {
    const setup = fogSetup(tiny, 1);
    // send: goTo street.d. street.b → street.a → street.d: 2 + 3 minutes and a tick per edge, 7
    // ticks: two steps walking (forced), then it stands there free.
    const pin = cardPin('send', { cat: 'pal' }, 0);
    const one = run(setup, initialFog(setup, ['pal']), [pin], 1);
    const going = (s: ChainState) =>
      s.activity === 'goTo' && s.control === 'forced' && s.walk?.path.at(-1) === 'street.d';
    expect(massOf(one, 'pal', going)).toBe(1_000_000);
    const two = run(setup, one, [pin], 1);
    const there = (s: ChainState) => s.place === 'street.d' || s.walk?.from === 'street.d';
    expect(massOf(two, 'pal', there)).toBe(1_000_000);
    expect(massOf(two, 'pal', (s) => s.control === 'forced')).toBe(0);
  });
});

describe('temporary mods shift back (03 §13.2)', () => {
  it('a decaying mod on a mean-field gauge shifts back in equal parts', () => {
    const setup = fogSetup(tiny, 1);
    expect(setup.banded['hero']).not.toContain('itch'); // hero's itch is mean-field
    const pins = [cardPin('poke', { cat: 'hero' }, 0)];
    // itch 300; poke adds mulPm(300, 150) = 45 decaying by 10 a tick: 5 ticks, one step.
    // itch also decays 1 every 4 ticks: ticks 0 and 4 in the first step, tick 8 in the second.
    const one = run(setup, initialFog(setup, ['hero']), pins, 1);
    expect(meanOf(one, 'hero', 'itch')).toBe(300 + 45 - 2);
    expect(only(one).q.mods).toEqual([
      { cat: 'hero', gauge: 'itch', left: 45, leftSteps: 1, mass: 1_000_000, hold: false },
    ]);
    const two = run(setup, one, pins, 1);
    expect(meanOf(two, 'hero', 'itch')).toBe(300 + 45 - 2 - 45 - 1);
    expect(only(two).q.mods).toEqual([]);
  });

  it('a held mod shifts back whole at its end', () => {
    const setup = fogSetup(tiny, 1);
    // hold: itch + mulPm(200, 150) = 30 for 20 ticks = 4 steps. Itch steers nothing the hero does
    // here, so the runs with and without it differ by exactly the mod.
    const fog = initialFog(setup, ['hero']);
    const pins = [cardPin('hold', { cat: 'hero' }, 0)];
    const diffs: number[] = [];
    let a = fog;
    let b = fog;
    for (let i = 0; i < 6; i++) {
      a = run(setup, a, pins, 1);
      b = run(setup, b, [], 1);
      diffs.push((meanOf(a, 'hero', 'itch') ?? 0) - (meanOf(b, 'hero', 'itch') ?? 0));
    }
    expect(diffs).toEqual([30, 30, 30, 30, 0, 0]);
  });

  it('a decaying mod on a banded gauge moves bands, then each step shifts a share back', () => {
    // poke's gauge shift aimed at boxPull (banded for the bystander), boxPull without its decay,
    // 4 bands (edges 20/330/640/950) and no state floor, so only the mod moves the band.
    const c = variant(
      (f) => {
        const cat = card(f, 'poke').on['cat'] ?? [];
        cat[1] = { prim: 'gaugeShift', gauge: 'boxPull', add: 300, decayPerTick: 10 };
        const box = f.hooks.hooks.find((h) => h.id === 'boxPull');
        if (box) delete box.decay;
      },
      { bands: 4, minStatePpm: 1 },
    );
    const setup = fogSetup(c, 1);
    expect(setup.banded['bystander']).toContain('boxPull');
    const pins = [cardPin('poke', { cat: 'bystander' }, 0)];
    // boxPull 100 is in band 0 (width 310): +300 moves trunc(300e6 / 310) = 967 741 ppm up.
    const one = run(setup, initialFog(setup, ['bystander']), pins, 1);
    const up = (f: Fog) => massOf(f, 'bystander', (s) => s.bands['boxPull'] === 1);
    expect(up(one)).toBe(967_741);
    // 30 ticks of decay = 6 steps: 50 back each step moves trunc(50e6 / 310) = 161 290 ppm of the
    // upper band down (renormalising after the cat's decision may move a few ppm).
    const two = run(setup, one, pins, 1);
    expect(
      Math.abs(up(two) - Math.trunc((967_741 * (1_000_000 - 161_290)) / 1_000_000)),
    ).toBeLessThan(10);
    expect(only(two).q.mods[0]).toMatchObject({ left: 250, leftSteps: 5 });
  });

  it("a storylet's held gauge effect on a fogged cat is recorded to shift back", () => {
    const setup = fogSetup(tiny, 1);
    // shift.chosen: { gauge: @boss.boxPull, add: 50, holdTicks: 5 } on pal: one step.
    let fog = initialFog(setup, ['hero', 'pal', 'bystander']);
    let found = false;
    for (let i = 0; i < 12 && !found; i++) {
      fog = run(setup, fog, [], 1);
      for (const fc of fog.cases)
        for (const m of fc.q.mods) {
          expect(m).toMatchObject({
            cat: 'pal',
            gauge: 'boxPull',
            left: 50,
            leftSteps: 1,
            hold: true,
          });
          expect(m.mass).toBeGreaterThan(0);
          found = true;
        }
    }
    expect(found).toBe(true);
  });
});

describe('offers in the fog (03 §9.3, §13.3)', () => {
  it('an attract reaches the cats in its radius and they walk there', () => {
    const setup = fogSetup(tiny, 1);
    // magnet on street.b: radius 30, score 5 + O/500 = 6. The bystander naps at street.a (20 m)
    // and tires in this step, so fetch (score 1) also beats its nap: softmax([6, 1]) at T = 1 is
    // EXP[500] = 442 against 65 536, so 993 300 + the remainder 1 and 6 699 (03 §1.1).
    const pins = [cardPin('magnet', { place: 'street.b' }, 0)];
    const one = run(setup, initialFog(setup, ['bystander']), pins, 1);
    const lured = (s: ChainState) => s.activity === 'attracted' && s.place === 'street.b';
    expect(massOf(one, 'bystander', lured)).toBe(993_301);
    expect(massOf(one, 'bystander', (s) => s.activity === 'fetch')).toBe(1_000_000 - 993_301);
    expect(only(one).q.effects.map((e) => [e.kind, e.place, e.p])).toEqual([
      ['attract', 'street.b', 1_000_000],
    ]);
    // the effect lasts 10 ticks (gone from tick 9): by the step at tick 10 the cat is free again
    const three = run(setup, one, pins, 2);
    expect(massOf(three, 'bystander', (s) => s.activity === 'attracted')).toBe(0);
    expect(only(three).q.effects).toEqual([]);
  });

  it('a repel sends the cats in its radius to the nearest place outside it', () => {
    const setup = fogSetup(tiny, 1);
    // scare on street.a: radius 10. home.door is 10 m away (inside); street.b is 2 minutes away.
    const pins = [cardPin('scare', { place: 'street.a' }, 0)];
    const one = run(setup, initialFog(setup, ['bystander']), pins, 1);
    const away = (s: ChainState) => s.activity === 'repelled' && s.place === 'street.b';
    // score 5 against fetch's 1 (the tired nap loses to both): softmax([5, 1]) at T = 1 is
    // EXP[400] = 1200 against 65 536, so 982 018 + the remainder 1 and 17 981 (03 §1.1)
    expect(massOf(one, 'bystander', away)).toBe(982_019);
    expect(massOf(one, 'bystander', (s) => s.activity === 'fetch')).toBe(1_000_000 - 982_019);
  });

  it('an offer born this step is a trigger: mass that would not decide decides at once', () => {
    const setup = fogSetup(tiny, 1);
    // One step to record the bystander's conditions, then it stands at street.a doing nothing
    // (`none` does not tire, so without a trigger it keeps doing nothing).
    const first = run(setup, initialFog(setup, ['bystander']), [], 1);
    const idle: ChainState = {
      activity: 'none',
      place: 'street.a',
      walk: null,
      bands: { ...(chain(first, 'bystander')[0]?.s.bands ?? {}), [BOREDOM]: 0 },
      interrupt: null,
      control: 'free',
    };
    const cat = only(first).cats['bystander'];
    if (!cat) throw new Error('no bystander');
    cat.chain = [{ s: idle, p: 1_000_000 }];
    const still = run(setup, first, [], 1);
    expect(massOf(still, 'bystander', (s) => s.activity === 'none')).toBe(1_000_000);
    const lured = run(setup, first, [cardPin('magnet', { place: 'street.b' }, 7)], 1);
    expect(massOf(lured, 'bystander', (s) => s.activity === 'attracted')).toBeGreaterThan(900_000);
  });

  it('triggerStorylet with ifTarget fires with the chance its target was reached', () => {
    const setup = fogSetup(tiny, 1);
    const fog = initialFog(setup, ['hero']);
    const inactive = (f: Fog) =>
      f.cases.reduce(
        (a, fc) =>
          a + Math.trunc(((fc.q.storylets['lured']?.p['inactive'] ?? 0) * fc.weight) / WAVE_TOTAL),
        0,
      );
    // glow (radius 10, protagonists) at the hero's room: reached for sure, `lured` activates
    expect(inactive(run(setup, fog, [powerPin('glow', 'home.room', 0)], 1))).toBe(0);
    // at street.c (42 m away): not reached, nothing activates
    expect(inactive(run(setup, fog, [powerPin('glow', 'street.c', 0)], 1))).toBe(1_000_000);
  });
});

describe('world primitives in the fog', () => {
  it('setFlag at the target place lasts its ticks', () => {
    const setup = fogSetup(tiny, 1);
    const one = run(
      setup,
      initialFog(setup, ['hero']),
      [cardPin('mark', { place: 'street.b' }, 2)],
      1,
    );
    const q = only(one).q;
    expect(flagChance(q, 'marked@street.b', 11)).toBe(1_000_000);
    expect(flagChance(q, 'marked@street.b', 12)).toBe(0);
    expect(q.effects.map((e) => [e.kind, e.place, e.born, e.left])).toEqual([
      ['flag', 'street.b', 2, 10],
    ]);
  });

  it('socialSpread: first hearers re-emit next step while hops are left', () => {
    const setup = fogSetup(tiny, 1);
    // rumour on street.a: radius 30, one hop. The bystander stands there and hears it for sure.
    const pins = [cardPin('rumour', { place: 'street.a' }, 0)];
    const one = run(setup, initialFog(setup, ['hero', 'pal', 'bystander']), pins, 1);
    const q = only(one).q;
    expect(q.heard['bystander']?.['rumour']).toBe(1_000_000);
    expect(q.echoes.length).toBeGreaterThan(0);
    expect(q.echoes.every((e) => e.name === 'rumour' && e.hops === 0 && e.radiusM === 30)).toBe(
      true,
    );
    const fromBystander = q.echoes
      .filter((e) => e.source === 'bystander')
      .reduce((a, e) => a + e.p, 0);
    expect(fromBystander).toBeGreaterThan(999_990);
    // hops 0: the echoes are heard, and nobody echoes them again
    expect(only(run(setup, one, pins, 1)).q.echoes).toEqual([]);
  });
});

describe('pin validity in the fog (03 §11, §18)', () => {
  it('an object pin fizzles while the object is hidden and fires with P(visible) later', () => {
    // magnet's object branch without its `onlyObjects` limit, so it may target the crate
    // (visible when crateShown).
    const c = variant((f) => {
      const obj = card(f, 'magnet').on['object'] ?? [];
      obj[0] = { prim: 'setFlag', flag: 'rung', ticks: 5 };
    });
    const setup = fogSetup(c, 1);
    const pin = cardPin('magnet', { object: 'crate' }, 0);
    const one = run(setup, initialFog(setup, ['hero']), [pin], 1);
    expect(only(one).q.pins[pin.id]).toEqual({ fired: 0, fizzled: 1_000_000 });
    expect(only(one).q.effects).toEqual([]);
    only(one).q.facts['crateShown'] = 600_000; // the crate is now shown in 60% of the case
    const two = run(setup, one, [pin], 1);
    expect(only(two).q.pins[pin.id]).toEqual({ fired: 600_000, fizzled: 1_000_000 });
    expect(only(two).q.effects.map((e) => e.p)).toEqual([600_000]);
  });

  it('a pin invalid in every state leaves the wave identical except its fizzle record', () => {
    const setup = fogSetup(tiny, 1);
    const fog = initialFog(setup, ['hero', 'pal', 'bystander']);
    const pin = cardPin('nap_now', { cat: 'hero' }, 3); // bound to pal: wrongCat
    const strip = (f: Fog) => f.cases.map((fc) => ({ ...fc, q: { ...fc.q, pins: {} } }));
    const a = run(setup, fog, [pin], 8);
    const b = run(setup, fog, [], 8);
    expect(strip(a)).toEqual(strip(b));
    for (const fc of a.cases) expect(fc.q.pins[pin.id]).toEqual({ fired: 0, fizzled: 1_000_000 });
  });
});

describe('perception in the fog (03 §4, §13.6)', () => {
  it('a role holder perceives every event of its storylet, wherever it stands (as in the lantern)', () => {
    // crew_chatter binds Marti as a role: the tale (chatter.catlantis, radius 60, from the crew)
    // reaches him in his flat in every share of the case where the storylet told it.
    const setup = fogSetup(ch1Coarse, 1);
    let fog = initialFog(
      setup,
      ch1Coarse.cats.map((x) => x.id),
    );
    while (fog.tick < 400) fog = fogStep(setup, fog);
    let told = 0;
    let heard = 0;
    for (const fc of fog.cases) {
      const p = fc.q.storylets['crew_chatter']?.p ?? {};
      const w = (x: number) => Math.trunc((x * fc.weight) / WAVE_TOTAL);
      told += w(1_000_000 - (p['inactive'] ?? 0) - (p['idle'] ?? 0));
      heard += w(fc.q.facts['crewChatterHeard'] ?? 0);
    }
    expect(told).toBeGreaterThan(100_000);
    expect(heard).toBeGreaterThanOrEqual(told - 1_000);
  }, 60_000);
});

describe('storylet effects that end at once (03 §8.2, §9.3)', () => {
  it('a goTo to where the cat stands ends in the step it lands, and the cat decides', () => {
    // roadworks_day sends the crew `goTo` the roadworks each time it re-enters `working` (after
    // the tea break of road_both): they already stand there, so that goTo ends at once.
    const pins = parsePinSets(pinsets, ch1Coarse)['road_both'] ?? [];
    const setup = fogSetup(ch1Coarse, 1);
    let fog = initialFog(
      setup,
      ch1Coarse.cats.map((x) => x.id),
    );
    let worked = 0;
    while (fog.tick < 260) {
      fog = fogStep(setup, fog, undefined, true, null, pins);
      for (const fc of fog.cases)
        for (const cat of Object.values(fc.cats))
          for (const e of cat.chain) {
            expect(e.s.activity === 'goTo' && e.s.walk === null && e.s.interrupt === null).toBe(
              false,
            );
            if (fog.tick > 190 && e.s.activity === 'work_road') worked += e.p;
          }
    }
    expect(worked).toBeGreaterThan(0);
  }, 60_000);
});

describe('Chapter 1 with pins (03 §18)', () => {
  it('road_both: chains sum to 1e6, weights to WAVE_TOTAL, integers only, JSON round trip', () => {
    const pins = parsePinSets(pinsets, ch1Coarse)['road_both'] ?? [];
    expect(pins.length).toBe(5);
    const setup = fogSetup(ch1Coarse, 1);
    let fog = initialFog(
      setup,
      ch1Coarse.cats.map((x) => x.id),
    );
    let fired = 0;
    while (fog.tick < 780) {
      fog = fogStep(setup, fog, undefined, true, null, pins);
      expect(fog.cases.reduce((a, fc) => a + fc.weight, 0)).toBe(WAVE_TOTAL);
      for (const fc of fog.cases)
        for (const cat of Object.values(fc.cats))
          expect(cat.chain.reduce((a, e) => a + e.p, 0)).toBe(1_000_000);
    }
    for (const fc of fog.cases)
      fired = Math.max(fired, ...pins.map((p) => fc.q.pins[p.id]?.fired ?? 0));
    expect(fired).toBe(1_000_000);
    // the lure at 715 (after the rain has started) brings the fogged Marti to the door; its gate { power: lure, near: @marti }
    // opens door_lure's choice and the walk out can follow
    const share = (get: (fc: FogCase) => number) =>
      fog.cases.reduce((a, fc) => a + Math.trunc((get(fc) * fc.weight) / WAVE_TOTAL), 0);
    expect(share((fc) => fc.q.storylets['door_lure']?.p['home'] ?? 0)).toBeLessThan(500_000);
    expect(share((fc) => fc.q.facts['martiOut'] ?? 0)).toBeGreaterThan(0);
    const json = JSON.stringify(fog);
    expect(JSON.parse(json)).toEqual(fog);
    JSON.parse(json, (_k, v: unknown) => {
      if (typeof v === 'number') expect(Number.isInteger(v)).toBe(true);
      return v;
    });
  }, 60_000);
});
