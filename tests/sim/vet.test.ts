// Seed vetting (04 §2): recorded solutions run as whole-day runs; candidates in a fixed order.
import { describe, expect, it } from 'vitest';
import { readChapterDir } from '../../src/cli/files';
import { loadChapter } from '../../src/content/load';
import { fogSetup } from '../../src/sim/fog';
import { hash32 } from '../../src/sim/rng';
import type { Content, Pin } from '../../src/sim/types';
import { wholeDayRun } from '../../src/sim/recompute';
import { checkSeed, vet } from '../../src/sim/vet';
import { TINY_DIR, tuning } from './helpers';

/** The tiny world, its vetting asking only for the hero out (it has no crew, rain or Rokko). */
const tinyVet = (more: Partial<typeof tuning.vetting> = {}): Content =>
  loadChapter(readChapterDir(TINY_DIR), {
    ...tuning,
    vetting: { ...tuning.vetting, requireFacts: ['heroOut'], ...more },
  });

/** A tiny solution: the glow brings the hero out, a rumour at pal's street reaches pal. */
const solution: Pin[] = [
  { id: 'g', seq: 1, tick: 0, kind: 'power', power: 'glow', place: 'home.room' },
  {
    id: 'r',
    seq: 2,
    tick: 1,
    kind: 'card',
    card: 'rumour',
    target: { place: 'street.b' },
    special: false,
  },
];

describe('seed vetting (04 §2)', () => {
  it('seeds with different seeded stats can get different verdicts', () => {
    // the tiny world's stats are fixed; this variant draws the hero's itch (a prime of the glow)
    const files = readChapterDir(TINY_DIR);
    const cast = structuredClone(files.cast) as {
      cats: { id: string; hooks: Record<string, [number, number]> }[];
    };
    const hero = cast.cats.find((x) => x.id === 'hero');
    if (hero) hero.hooks['itch'] = [0, 1000];
    const c = loadChapter(
      { ...files, cast },
      { ...tuning, vetting: { ...tuning.vetting, requireFacts: ['heroOut'] } },
    );
    expect(fogSetup(c, 1).seeded['hero']?.['itch']).not.toBe(
      fogSetup(c, 2).seeded['hero']?.['itch'],
    );
    const fail = checkSeed(c, 1, [solution]);
    const pass = checkSeed(c, 2, [solution]);
    expect(fail.solvable).toBe(false);
    expect(fail.pass).toBe(false);
    expect(pass).toEqual({ seed: 2, solvable: true, storylets: pass.storylets, pass: true });
    expect(pass.storylets).toBeGreaterThanOrEqual(2);
  });

  it('is deterministic and keeps a passing requested seed', () => {
    const c = tinyVet();
    const a = vet(c, 1, [solution]);
    expect(a).toEqual(vet(c, 1, [solution]));
    expect(a.seed).toBe(1);
    expect(a.verdicts.map((v) => v.seed)).toEqual([1]);
  });

  it('replaces a failing seed by the next candidate, hash32(requested|vet|k)', () => {
    const c = tinyVet();
    const r = vet(c, 3, [solution]);
    const order = r.verdicts.map((v) => v.seed);
    expect(order[0]).toBe(3);
    order.slice(1).forEach((s, i) => expect(s).toBe(hash32(`3|vet|${i + 1}`)));
    expect(r.verdicts.slice(0, -1).every((v) => !v.pass)).toBe(true);
    expect(r.verdicts[r.verdicts.length - 1]?.pass).toBe(true);
    expect(r.seed).toBe(order[order.length - 1]);
    expect(vet(c, 3, [solution])).toEqual(r);
  });

  it('keeps the requested seed when no candidate passes', () => {
    const c = tinyVet();
    const cap = {
      ...c,
      tuning: { ...c.tuning, vetting: { ...c.tuning.vetting, maxCandidates: 3 } },
    };
    const r = vet(cap, 3, [[]]); // untouched: the hero never goes out
    expect(r.seed).toBe(3);
    expect(r.verdicts.map((v) => v.pass)).toEqual([false, false, false]);
  });

  it('needs enough authored story: min(minStorylets, share of the authored ones)', () => {
    const strict = tinyVet({ minStorylets: 99, minStoryletSharePerMille: 1000 });
    const v = checkSeed(strict, 1, [solution]);
    expect(v.solvable).toBe(true);
    expect(v.pass).toBe(v.storylets >= strict.storylets.length);
  });

  it('a vetted seed is solved by a recorded solution played at the game’s knobs (M4-1)', () => {
    const c = tinyVet();
    for (const requested of [1, 2, 3]) {
      const { seed, verdicts } = vet(c, requested, [solution]);
      if (!verdicts.at(-1)?.pass) continue; // none passed: the requested seed is kept
      const w = wholeDayRun(fogSetup(c, seed), solution);
      expect(w.lantern.sim.anchor.reachedAt).not.toBeNull();
    }
  });
});
