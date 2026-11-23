// Observation (03 §15.2, §15.4, §15.5): watched facts, imposed facts on a re-run, Gaze.
import { describe, expect, it } from 'vitest';
import { readChapterDir } from '../../src/cli/files';
import { loadChapter } from '../../src/content/load';
import { fogSetup, fogStates, type FogSetup } from '../../src/sim/fog';
import { hashState } from '../../src/sim/hash';
import { advance, initialWave, type Wave } from '../../src/sim/lantern';
import { watch } from '../../src/sim/observe';
import { catNode, catPos, nodePos, within } from '../../src/sim/space';
import type { Content, Pin, WatchedFact } from '../../src/sim/types';
import { cardPin, powerPin, tiny, TINY_DIR, tuning } from './helpers';

const glow = powerPin('glow', 'home.room', 0);

/** The tiny world with the fog's approximations off: the bystander's chain spreads (lantern.test). */
const fine: Content = loadChapter(readChapterDir(TINY_DIR), {
  ...tuning,
  fog: {
    ...tuning.fog,
    stepTicks: 1,
    bands: 490,
    saturatedBandFrom: 1000,
    minStatePpm: 1,
    boredomWhole: true,
  },
});

/** Every wave of a lantern run with the hero followed, and the hero's watched fact of each tick. */
function run(
  setup: FogSetup,
  pins: Pin[],
  until: number,
  watched: WatchedFact[] = [],
  w0: Wave = initialWave(setup, ['hero']),
): { waves: Wave[]; facts: WatchedFact[] } {
  const waves = [w0];
  const facts: WatchedFact[] = [];
  let w = w0;
  while (w.lantern.sim.tick < until) {
    w = advance(setup, w, pins, ['hero'], watched);
    waves.push(w);
    facts.push(watch(setup, w.lantern.sim, w.tickEvents, w.lantern.live, 'hero'));
  }
  return { waves, facts };
}

describe('the watched fact (03 §15.2)', () => {
  it('shows the hero’s own part, the cats it sees, and is the same for the same seed and pins', () => {
    const setup = fogSetup(tiny, 1);
    const a = run(setup, [glow], 30);
    const b = run(fogSetup(tiny, 1), [glow], 30);
    expect(b.facts).toEqual(a.facts);
    for (const [i, f] of a.facts.entries()) {
      const w = a.waves[i + 1];
      if (!w) continue;
      expect(f.tick).toBe(w.lantern.sim.tick - 1);
      const hero = w.lantern.sim.cats['hero'];
      expect(f.summary.self.node).toBe(hero && catNode(hero));
      // every cat seen is live, as it stands
      for (const seen of f.summary.cats) {
        expect(w.lantern.live).toContain(seen.cat);
        const cs = w.lantern.sim.cats[seen.cat];
        expect([cs && catNode(cs), cs?.activity]).toEqual([seen.node, seen.activity]);
      }
    }
    // the hero goes out and sees pal and the bystander (the run above, seed 1)
    expect(a.facts.some((f) => f.summary.cats.length === 2)).toBe(true);
    expect(JSON.parse(JSON.stringify(a.facts))).toEqual(a.facts);
  });

  it('the digest changes with the view', () => {
    const { facts } = run(fogSetup(tiny, 1), [glow], 30);
    const digests = new Set(facts.map((f) => f.digest));
    expect(digests.size).toBe(facts.length); // the tick is part of what is digested
  });
});

describe('imposed facts on a re-run (03 §15.5)', () => {
  it('an unedited re-run with its watched facts is the same run, and nothing reopens', () => {
    for (const seed of [1, 2, 3]) {
      const a = run(fogSetup(fine, seed), [glow], 40);
      const b = run(fogSetup(fine, seed), [glow], 40, a.facts);
      expect(b.waves.at(-1)?.reopened).toEqual([]);
      expect(b.waves.map((w) => hashState(w.lantern.sim))).toEqual(
        a.waves.map((w) => hashState(w.lantern.sim)),
      );
    }
  });

  it('an edit that changes the hero’s own path reopens the facts it changed', () => {
    const a = run(fogSetup(tiny, 1), [glow], 30);
    // without the lure the hero stays in: its watched walk outside cannot hold
    const b = run(fogSetup(tiny, 1), [], 30, a.facts);
    const reopened = b.waves.at(-1)?.reopened ?? [];
    const outside = a.facts.filter((f) => !f.summary.self.node.startsWith('home.'));
    expect(outside.length).toBeGreaterThan(0);
    for (const f of outside) expect(reopened).toContainEqual(f);
    expect(run(fogSetup(tiny, 1), [], 30, a.facts).waves.at(-1)?.reopened).toEqual(reopened);
  });

  it('an edit on a watched cat forces it back into place where its chain allows it', () => {
    // a scare at street.a early on moves the bystander's odds; on these seeds its watched state keeps
    // some mass, so the re-run forces it back where its own draw would show it elsewhere
    let forced = 0;
    for (const seed of [3, 5, 7]) {
      const a = run(fogSetup(fine, seed), [glow], 40);
      const edit = [glow, cardPin('scare', { place: 'street.a' }, 2)];
      const free = run(fogSetup(fine, seed), edit, 40);
      const b = run(fogSetup(fine, seed), edit, 40, a.facts);
      expect(run(fogSetup(fine, seed), edit, 40, a.facts).facts).toEqual(b.facts);
      const reopened = b.waves.at(-1)?.reopened ?? [];
      for (const [i, f] of a.facts.entries()) {
        const kept = !reopened.some((r) => r.tick === f.tick);
        const view = b.facts[i];
        if (!kept || !view) continue;
        // a fact that holds is what the re-run shows: every cat it saw stands and acts as seen
        for (const seen of f.summary.cats) expect(view.summary.cats).toContainEqual(seen);
        // without the watched facts the edited run shows something else here: forced
        const without = free.facts[i]?.summary.cats ?? [];
        if (
          f.summary.cats.some((x) => !without.some((y) => JSON.stringify(y) === JSON.stringify(x)))
        )
          forced += 1;
      }
    }
    expect(forced).toBeGreaterThan(0);
  }, 120_000);
});

describe('Gaze (03 §15.4)', () => {
  const circle = (setup: FogSetup, w: Wave, id: string, place: string, r: number) => {
    const states = fogStates(setup, w.fog, id);
    const inside = states
      .filter((x) => within(catPos(setup.c, x.cat), nodePos(setup.c, place), r))
      .reduce((a, x) => a + x.p, 0);
    return { inside, all: states.reduce((a, x) => a + x.p, 0) };
  };

  it('fixes what the circle holds at each of its ticks; the gazed cat stays fogged', () => {
    // seed 1: pal works at street.c from about tick 6, unseen until the hero comes at 14
    const setup = fogSetup(tiny, 1);
    const pin = powerPin('gaze', 'street.c', 7);
    const { waves } = run(setup, [glow, pin], 20);
    const last = waves.at(-1);
    const facts = last?.gazeFacts ?? [];
    expect(facts.map((f) => [f.tick, f.cat, f.node])).toEqual([
      [7, 'pal', 'street.c'],
      [8, 'pal', 'street.c'],
      [9, 'pal', 'street.c'],
    ]);
    for (const f of facts) {
      const w = waves.find((x) => x.lantern.sim.tick === f.tick);
      expect(w?.lantern.live).not.toContain(f.cat);
      expect(f.activity).toBe('work');
    }
  });

  it('a hit keeps only the gazed state; a miss rules the circle out; the same pins, the same picks', () => {
    let hits = 0;
    let misses = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const setup = fogSetup(fine, seed);
      // a scare at street.a splits the bystander between street.a (67%) and street.b by tick 9
      const scare = cardPin('scare', { place: 'street.a' }, 2);
      const pin = powerPin('gaze', 'street.a', 9);
      // nobody followed: only Gaze looks. Without the pin, the same fog up to its first tick
      const waves = (pins: Pin[]) => {
        let w = initialWave(setup, [], ['hero', 'pal']);
        const out = [w];
        while (w.lantern.sim.tick < 12) out.push((w = advance(setup, w, pins, [])));
        return out;
      };
      const gazed = waves([scare, pin]);
      const plain = waves([scare])[9];
      if (!plain) throw new Error('no tick 9');
      const before = circle(setup, plain, 'bystander', 'street.a', 6);
      for (const w of gazed) {
        const t = w.lantern.sim.tick;
        if (t < 9 || t >= 12) continue;
        const { inside, all } = circle(setup, w, 'bystander', 'street.a', 6);
        if (w.gazeFacts.some((f) => f.tick === t && f.cat === 'bystander')) {
          if (t === 9) hits += 1;
          expect(all - inside).toBeLessThanOrEqual(fine.cats.length); // truncation only
          const states = fogStates(setup, w.fog, 'bystander').filter((x) => x.p > 0);
          expect(new Set(states.map((x) => JSON.stringify(x.s))).size).toBe(1);
        } else {
          expect(inside).toBe(0);
          if (t === 9 && before.inside > 0) misses += 1;
        }
      }
      const last = gazed.at(-1);
      expect(last?.gazeFacts.every((f) => f.tick >= 9 && f.tick < 12)).toBe(true);
      // the same pins give the same picks; an unrelated pin changes none of them
      const other = waves([scare, pin, cardPin('mark', { place: 'street.d' }, 1)]).at(-1);
      expect(other?.gazeFacts).toEqual(last?.gazeFacts);
    }
    expect(hits).toBeGreaterThan(0);
    expect(misses).toBeGreaterThan(0);
  }, 120_000);
});
