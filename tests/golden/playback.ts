// Golden playbacks (07 §2, 05 §5.3): for a pin set and a requested seed, the seed vetted live (as the
// worker vets a typed seed, 04 §2), then a headless playback: a new game's re-run (edge 0), then live
// playback at the edge, observing every tick with Marti followed, to the end (`extendEdge`, what the
// worker's `observe` does at the edge). The readable parts show what moved when a hash changes.
import { beforeAll, describe, expect, it } from 'vitest';
import { PINSETS_FILE } from '../../src/content/chapter1';
import { parsePinSets } from '../../src/content/load';
import { fogSetup } from '../../src/sim/fog';
import { canonicalJson, hashState } from '../../src/sim/hash';
import { extendEdge, rerunAll, type Timeline } from '../../src/sim/recompute';
import { hash32 } from '../../src/sim/rng';
import type { Content } from '../../src/sim/types';
import { vet, vettingContent } from '../../src/sim/vet';
import { ch1 } from '../sim/helpers';

/** Ticks of the readable checkpoint hashes and fog sizes (07 §2's example). */
const EVERY = 60;

export const sets = parsePinSets(PINSETS_FILE, ch1);

/** The requested seed vetted live, with the recorded solutions of `vetting.solutions` (04 §2). */
export function vetted(c: Content, requested: number): number {
  const solutions = c.tuning.vetting.solutions.map((name) => sets[name] ?? []);
  return vet(vettingContent(c), requested, solutions).seed;
}

/** One playback, as `07` §2's expected file. */
export function playback(c: Content, name: string, requested: number, seed: number): string {
  const setup = fogSetup(c, seed);
  const frontier = { story: 0, pastTicks: 0, storylets: [] };
  let tl: Timeline = rerunAll(setup, null, { pins: sets[name] ?? [], watched: [], frontier });
  for (let next = extendEdge(setup, tl); next; next = extendEdge(setup, tl)) tl = next;

  const facts = tl.views.flatMap((v) => Object.values(v));
  const watched: Record<string, number> = {};
  for (const f of facts)
    for (const key of [...f.summary.storylets, ...f.summary.detectors]) watched[key] ??= f.tick;
  const every = c.tuning.waves.checkpointEvery;
  const checkpoints: Record<number, string> = {};
  for (const w of tl.checkpoints) {
    const t = w.lantern.sim.tick;
    if (t % EVERY !== 0) continue;
    const cases = w.fog.cases.map((fc) => ({
      weight: fc.weight,
      chains: Object.fromEntries(Object.entries(fc.cats).map(([id, x]) => [id, x.chain])),
    }));
    checkpoints[t] = hex(hash32(canonicalJson({ lantern: hashState(w.lantern.sim), cases })));
  }
  if (EVERY % every !== 0) throw new Error('checkpoints do not fall on the golden ticks');
  const { stats } = tl.result;
  const fog: Record<number, { cases: number; live: number; states: number }> = {};
  for (let t = 0; t <= tl.result.edge; t += EVERY)
    fog[t] = { cases: stats.cases[t] ?? 0, live: stats.live[t] ?? 0, states: stats.states[t] ?? 0 };
  const out = {
    seed: requested,
    vettedSeed: seed,
    end: tl.result.end,
    watchedHash: hex(hash32(canonicalJson(facts))),
    checkpoints,
    watched,
    fog,
  };
  return JSON.stringify(out, null, 1) + '\n';
}

const hex = (h: number) => h.toString(16).padStart(8, '0');

/** One seed's golden files, a test per pin set of `05` §5.1 (one file per seed, run in parallel). */
export function goldenPlaybacks(requested: number): void {
  describe(`golden playbacks, requested seed ${requested}`, () => {
    let seed = 0;
    beforeAll(() => {
      seed = vetted(ch1, requested);
    }, 300_000);
    it.each(Object.keys(sets))(
      '%s',
      async (name) => {
        await expect(playback(ch1, name, requested, seed)).toMatchFileSnapshot(
          `./${name}.s${requested}.expected.json`,
        );
      },
      300_000,
    );
  });
}
