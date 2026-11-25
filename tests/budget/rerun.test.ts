// The re-run budget (07 §4), through the worker's own code (`createHost`) in Node: after an edit at
// 08:00 with the lantern edge at 12:00 (Marti live, the other cats in the fog), the first streamed
// frames within `budgets.recomputeMs` (median), then at least `budgets.rerunTps`. The test fails above
// 3× the time or below a third of the rate. Every pin set of 05 §5.1 (M4), seeds 1-3. Run alone:
// `npm run bench` (`FOG=minStatePpm,bands npm run bench` measures other fog knobs, tests/budget/knobs.ts).
import { describe, expect, it } from 'vitest';
import { createHost } from '../../src/bridge/host';
import type { Request, WorkerToMain } from '../../src/bridge/protocol';
import { CHAPTER1_FILES, PINSETS_FILE, TUNING_FILE } from '../../src/content/chapter1';
import { parsePinSets } from '../../src/content/load';
import { mainStorylets } from '../../src/sim/readers';
import type { Pin } from '../../src/sim/types';
import { c, knobs, more } from './knobs';

const sets = parsePinSets(PINSETS_FILE, c);
const card = parsePinSets({ sets: { x: ['box@town.roadworks@140'] } }, c)['x']?.[0];
const EDIT = 140; // 08:00
const EDGE = 380; // 12:00
const frontier = { story: 0, pastTicks: EDGE, storylets: mainStorylets(c) };
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

/** One seed: the pin set committed, then the edit previewed; its timings. */
function rerunAt(base: readonly Pin[], seed: number) {
  if (!card) throw new Error('no card');
  const out: { at: number; m: WorkerToMain }[] = [];
  const queue: (() => void)[] = [];
  const host = createHost(
    { chapter: CHAPTER1_FILES, tuning: TUNING_FILE, pinsets: PINSETS_FILE },
    {
      post: (m) => out.push({ at: performance.now(), m }),
      schedule: (fn) => queue.push(fn),
      now: () => performance.now(),
    },
  );
  let id = 0;
  const send = (m: Request) => host.receive({ ...m, reqId: ++id });
  const drain = () => {
    for (let fn = queue.shift(); fn; fn = queue.shift()) fn();
  };
  send({ kind: 'init', tuning: more });
  send({ kind: 'recompute', seed, pins: [...base], watched: [], frontier, preview: false });
  drain();
  out.length = 0;
  const pins = [...base, { ...card, id: 'edit', seq: 100 }];
  const t0 = performance.now();
  send({ kind: 'recompute', seed, pins, watched: [], frontier, preview: true });
  drain();
  const patches = out.flatMap((o) => (o.m.kind === 'rerun' ? [{ at: o.at, m: o.m }] : []));
  const result = out.find((o) => o.m.kind === 'result')?.m;
  if (result?.kind !== 'result') throw new Error('no result');
  const first = patches[0];
  const changed = patches.find((p) => p.m.upTo >= EDIT);
  const from = first?.m.frames.from ?? 0;
  const r = result.result;
  return {
    edge: r.edge,
    from,
    firstMs: (first?.at ?? t0) - t0,
    editMs: (changed?.at ?? t0) - t0,
    totalMs: r.stats.ms,
    tps: ((r.edge - from + 1) * 1000) / Math.max(1, r.stats.ms),
  };
}

describe('the re-run budget (07 §4)', () => {
  it.each(Object.keys(sets))(
    '%s: first frames and ticks per second after an edit at 08:00, the edge at 12:00',
    (name) => {
      const runs = [1, 2, 3].map((seed) => rerunAt(sets[name] ?? [], seed));
      for (const r of runs) expect(r.edge).toBe(EDGE);
      const { recomputeMs, rerunTps } = c.tuning.budgets;
      const firstMs = median(runs.map((r) => r.firstMs));
      const tps = median(runs.map((r) => r.tps));
      console.log(
        `re-run budget, ${name}, ${knobs}: first frames ${firstMs.toFixed(0)} ms (budget ${recomputeMs}), ` +
          `${tps.toFixed(0)} ticks/s (budget ${rerunTps}); per seed: ` +
          runs
            .map(
              (r, i) =>
                `${i + 1}: first ${r.firstMs.toFixed(0)} ms, tick ${EDIT} at ${r.editMs.toFixed(0)} ms, ` +
                `${r.totalMs} ms for ${r.edge - r.from + 1} ticks (${r.tps.toFixed(0)}/s)`,
            )
            .join('; '),
      );
      expect(firstMs).toBeLessThanOrEqual(3 * recomputeMs);
      expect(tps).toBeGreaterThanOrEqual(rerunTps / 3);
    },
    300_000,
  );
});
