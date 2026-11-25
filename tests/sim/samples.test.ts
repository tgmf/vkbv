// The focus layer's samples (03 §16, docs/questions.md M5-1): coherent trajectories of the fogged cats,
// drawn backward from the edge by mass among the ghosts within one fog step's walk.
import { describe, expect, it } from 'vitest';
import { fogSetup, type FogSetup } from '../../src/sim/fog';
import { canonicalJson } from '../../src/sim/hash';
import { extendEdge, rerunAll, type Timeline } from '../../src/sim/recompute';
import { samplesOf, stepReachM } from '../../src/sim/samples';
import { dist2 } from '../../src/sim/space';
import type { Frontier, Ghost, Pin } from '../../src/sim/types';
import { ch1Coarse, powerPin, tiny } from './helpers';

const open = (setup: FogSetup): Frontier => ({ story: 1000, pastTicks: 0, storylets: setup.main });
const fresh: Frontier = { story: 0, pastTicks: 0, storylets: [] };
const glow = (): Pin => powerPin('glow', 'home.room', 3);

/** Each trajectory's ghost of a cat at tick t, or null where the cat is live there. */
function ghostOf(tl: Timeline, t: number, id: string, k: number): Ghost | null {
  const frame = tl.result.frames[t];
  const i = tl.result.samples[t]?.cats[id]?.[k];
  if (!frame) throw new Error(`no frame ${t}`);
  if (i === undefined) return null;
  const g = frame.cats[id]?.[i];
  if (!g) throw new Error(`sample ${i} of ${id} at ${t} is not a ghost`);
  return g;
}

/** Steps of fogged trajectories (to the next tick's ghost, or live ghost) and how many are in reach. */
function steps(tl: Timeline, setup: FogSetup) {
  const reach = stepReachM(setup.c);
  const K = setup.c.tuning.render.focusSamples;
  let all = 0;
  let near = 0;
  for (let t = 0; t < tl.result.edge; t++)
    for (const { id } of setup.c.cats)
      for (let k = 0; k < K; k++) {
        const a = ghostOf(tl, t, id, k);
        if (!a) continue;
        const b = ghostOf(tl, t + 1, id, k) ?? tl.result.frames[t + 1]?.cats[id]?.[0];
        if (!b) continue;
        all += 1;
        if (dist2(a.pos, b.pos) <= reach * reach) near += 1;
      }
  return { all, near };
}

describe('samples (03 §16, M5-1)', () => {
  it('give every fogged cat focusSamples ghost indices at every tick, and live cats none', () => {
    for (const seed of [1, 2, 3]) {
      const setup = fogSetup(tiny, seed);
      const tl = rerunAll(setup, null, { pins: [glow()], watched: [], frontier: open(setup) });
      const K = tiny.tuning.render.focusSamples;
      expect(tl.result.samples).toHaveLength(tl.result.edge + 1);
      tl.result.samples.forEach((s, t) => {
        const frame = tl.result.frames[t];
        if (!frame) throw new Error('no frame');
        expect(s.cases).toHaveLength(K);
        for (const { id } of tiny.cats) {
          const ghosts = frame.cats[id] ?? [];
          const live = ghosts.length === 1 && ghosts[0]?.p === 1_000_000 && !s.cats[id];
          if (live) continue;
          const idx = s.cats[id];
          expect(idx).toHaveLength(K);
          for (const i of idx ?? []) expect(i).toBeLessThan(ghosts.length);
        }
      });
      expect(JSON.parse(JSON.stringify(tl.result.samples))).toEqual(tl.result.samples);
    }
  });

  it('are the same for the same inputs, and from a checkpoint as from tick 0', () => {
    const setup = fogSetup(tiny, 2);
    const a = rerunAll(setup, null, { pins: [glow()], watched: [], frontier: open(setup) });
    const b = rerunAll(setup, null, { pins: [glow()], watched: [], frontier: open(setup) });
    expect(canonicalJson(a.result.samples)).toBe(canonicalJson(b.result.samples));
    // an edit at 40 replays from a checkpoint; samples match a re-run from scratch
    const pins = [glow(), powerPin('gaze', 'street.c', 40)];
    const fromCheckpoint = rerunAll(setup, a, { pins, watched: [], frontier: open(setup) });
    const fromZero = rerunAll(setup, null, { pins, watched: [], frontier: open(setup) });
    expect(canonicalJson(fromCheckpoint.result.samples)).toBe(
      canonicalJson(fromZero.result.samples),
    );
  });

  it('move each step within one fog step’s walk, almost always', () => {
    for (const seed of [1, 2, 3]) {
      const setup = fogSetup(tiny, seed);
      const tl = rerunAll(setup, null, { pins: [glow()], watched: [], frontier: open(setup) });
      const { all, near } = steps(tl, setup);
      expect(all).toBeGreaterThan(0);
      expect(near / all).toBeGreaterThan(0.95);
    }
  });

  it('are drawn again after a placement during live playback, else carried a tick forward', () => {
    const setup = fogSetup(tiny, 3);
    let tl = rerunAll(setup, null, { pins: [glow()], watched: [], frontier: fresh });
    let placements = 0;
    while (tl.result.edge < 60) {
      const next = extendEdge(setup, tl);
      if (!next) break;
      const placed = next.edgeWave.lantern.live.some((id) => !tl.edgeWave.lantern.live.includes(id));
      const n = tl.result.samples.length;
      expect(next.result.samples).toHaveLength(n + 1);
      if (placed) {
        placements += 1;
        expect(next.result.samples).toEqual(samplesOf(setup, next.result.frames, next.trace));
      } else
        next.result.samples.slice(0, n).forEach((s, i) => expect(s).toBe(tl.result.samples[i]));
      tl = next;
    }
    expect(tl.result.edge).toBeGreaterThan(20);
    expect(placements).toBeGreaterThan(0);
    const { all, near } = steps(tl, setup);
    expect(all).toBeGreaterThan(0);
    expect(near / all).toBeGreaterThan(0.9);
  });

  it('spread a fogged crew cat over its likely ghosts on Chapter 1 (a cloud, not one copy)', () => {
    const setup = fogSetup(ch1Coarse, 4);
    const tl = rerunAll(setup, null, {
      pins: [],
      watched: [],
      frontier: { story: 0, pastTicks: 300, storylets: setup.main }, // edge 05:40 + 300
    });
    // over the morning, the fogged cats' trajectories spread over several ghosts at some ticks …
    const fogged = ch1Coarse.cats.map((x) => x.id).filter((id) => id !== 'marti');
    let spread = 0;
    const counts: number[] = [];
    for (let u = 20; u <= tl.result.edge; u++)
      for (const id of fogged) {
        const idx = tl.result.samples[u]?.cats[id] ?? [];
        if (new Set(idx).size >= 2) spread += 1;
        for (const i of idx) counts[i] = (counts[i] ?? 0) + 1;
      }
    expect(spread).toBeGreaterThan(0);
    // … and the likeliest ghost (index 0) is drawn more often than any other
    expect(counts[0] ?? 0).toBeGreaterThan(Math.max(...counts.slice(1).map((x) => x ?? 0)));
  });
});
