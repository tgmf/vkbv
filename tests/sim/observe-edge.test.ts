// Live playback at the lantern edge (03 §15.2, 04 §6): `extendEdge` moves the edge one tick, gives the
// same lantern, frames and watched facts as a re-run over the same ticks, and keeps every fogged
// cat's chain summing to 1 000 000.
import { describe, expect, it } from 'vitest';
import { fogSetup, type Fog, type FogSetup } from '../../src/sim/fog';
import { canonicalJson, hashState } from '../../src/sim/hash';
import { extendEdge, rerunAll, type Timeline } from '../../src/sim/recompute';
import type { Frontier, Pin } from '../../src/sim/types';
import { ch1, powerPin, tiny } from './helpers';

/** A new game's frontier: the re-run stops at tick 0 (04 §6). */
const fresh: Frontier = { story: 0, pastTicks: 0, storylets: [] };

/** A new game's timeline, then live playback to `until`. */
function play(setup: FogSetup, pins: Pin[], until: number): Timeline[] {
  let tl = rerunAll(setup, null, { pins, watched: [], frontier: fresh });
  const out = [tl];
  while (tl.result.edge < until) {
    const next = extendEdge(setup, tl);
    if (!next) break;
    tl = next;
    out.push(tl);
  }
  return out;
}

const chainSums = (fog: Fog): number[] =>
  fog.cases.flatMap((fc) => Object.values(fc.cats).map((x) => x.chain.reduce((a, e) => a + e.p, 0)));

describe('live playback at the edge (03 §15.2)', () => {
  it('a new game starts at edge 0, and each extension moves the edge one tick', () => {
    const tls = play(fogSetup(tiny, 1), [], 40);
    expect(tls[0]?.result.edge).toBe(0);
    tls.forEach((tl, i) => {
      expect(tl.result.edge).toBe(i);
      expect(tl.result.frames).toHaveLength(i + 1);
      expect(tl.views).toHaveLength(i + 1);
      expect(tl.views[i]?.['hero']?.tick).toBe(i); // the edge's fact, for the next observe
    });
  });

  it('gives the same lantern, frames and watched facts as a re-run over the same ticks', () => {
    for (const seed of [1, 2, 3]) {
      const pins = [powerPin('glow', 'home.room', 10)];
      const setup = fogSetup(tiny, seed);
      const live = play(setup, pins, 40).at(-1);
      // the re-run's frontier after watching to 40 with lured seen: it runs to the same tick
      const seen: Frontier = { story: 1000, pastTicks: 0, storylets: setup.main };
      const re = rerunAll(fogSetup(tiny, seed), null, { pins, watched: [], frontier: seen });
      if (!live) throw new Error('no timeline');
      const n = live.result.edge + 1;
      expect(canonicalJson(live.result.frames)).toBe(canonicalJson(re.result.frames.slice(0, n)));
      expect(canonicalJson(live.views)).toBe(canonicalJson(re.views.slice(0, n)));
      expect(canonicalJson(live.checkpoints.map((w) => hashState(w.lantern.sim)))).toBe(
        canonicalJson(
          re.checkpoints.filter((w) => w.lantern.sim.tick < n).map((w) => hashState(w.lantern.sim)),
        ),
      );
    }
  });

  it('the same seed, pins and tick give the same watched fact', () => {
    const pins = [powerPin('glow', 'home.room', 10)];
    const a = play(fogSetup(tiny, 4), pins, 30).at(-1);
    const b = play(fogSetup(tiny, 4), pins, 30).at(-1);
    expect(b?.views).toEqual(a?.views);
  });

  it('stops where the timeline ends, and never mutates its input', () => {
    const setup = fogSetup(tiny, 1);
    const tls = play(setup, [], 200);
    const last = tls.at(-1);
    if (!last) throw new Error('no timeline');
    expect(last.result.end.kind).not.toBe('limit');
    expect(extendEdge(setup, last)).toBeNull();
    const before = canonicalJson(tls[5]?.result);
    extendEdge(setup, tls[5] as Timeline);
    expect(canonicalJson(tls[5]?.result)).toBe(before);
  });

  it('every fogged cat’s chain sums to 1 000 000 after each observed tick (Chapter 1, seed 1)', () => {
    const setup = fogSetup(ch1, 1);
    for (const tl of play(setup, [], 40)) {
      for (const s of chainSums(tl.edgeWave.fog)) expect(s).toBe(1_000_000);
      expect(tl.edgeWave.fog.cases.reduce((a, fc) => a + fc.weight, 0)).toBe(1_000_000_000);
    }
  }, 60_000);
});
