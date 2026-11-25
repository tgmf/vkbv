// The observe budget (07 §4), through the worker's own code (`createHost`) in Node: live playback at the
// lantern edge, one observe per tick (the lantern and the fog advanced one tick), median within
// `budgets.observeMs`. The test fails above 3× the time. Run alone: `npm run bench`.
import { describe, expect, it } from 'vitest';
import { createHost } from '../../src/bridge/host';
import type { Request, WorkerToMain } from '../../src/bridge/protocol';
import { CHAPTER1_FILES, PINSETS_FILE, TUNING_FILE } from '../../src/content/chapter1';
import { loadChapter, loadTuning } from '../../src/content/load';

const c = loadChapter(CHAPTER1_FILES, loadTuning(TUNING_FILE));
const TICKS = 240; // 05:40 to 09:40, live
const quantile = (xs: number[], q: number) =>
  [...xs].sort((a, b) => a - b)[Math.floor(xs.length * q)] ?? 0;
const median = (xs: number[]) => quantile(xs, 0.5);
const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length);

/** One seed: a new game, then live playback; the time of each observe. */
function observeTimes(seed: number): number[] {
  let last: WorkerToMain | null = null;
  const queue: (() => void)[] = [];
  const host = createHost(
    { chapter: CHAPTER1_FILES, tuning: TUNING_FILE, pinsets: PINSETS_FILE },
    { post: (m) => (last = m), schedule: (fn) => queue.push(fn), now: () => performance.now() },
  );
  let id = 0;
  const send = (m: Request) => {
    host.receive({ ...m, reqId: ++id });
    for (let fn = queue.shift(); fn; fn = queue.shift()) fn();
    return last;
  };
  send({ kind: 'init' });
  const frontier = { story: 0, pastTicks: 0, storylets: [] };
  send({ kind: 'recompute', seed, pins: [], watched: [], frontier, preview: false });
  const times: number[] = [];
  for (let t = 0; t < TICKS; t++) {
    const t0 = performance.now();
    const r = send({ kind: 'observe', tick: t, cat: 'marti' });
    times.push(performance.now() - t0);
    if (r?.kind !== 'observed' || r.edge !== t + 1)
      throw new Error(`observe ${t}: ${JSON.stringify(r)}`);
  }
  return times;
}

describe('the observe budget (07 §4)', () => {
  it('one observe at the lantern edge, median over 05:40 to 09:40', () => {
    const runs = [1, 2, 3].map(observeTimes);
    const ms = median(runs.flat());
    const { observeMs } = c.tuning.budgets;
    console.log(
      `observe budget: ${ms.toFixed(1)} ms median (budget ${observeMs}), mean ${mean(runs.flat()).toFixed(1)} ms, ` +
        `90th percentile ${quantile(runs.flat(), 0.9).toFixed(1)} ms; per seed: ` +
        runs
          .map(
            (r, i) =>
              `${i + 1}: median ${median(r).toFixed(1)} ms, max ${Math.max(...r).toFixed(0)} ms`,
          )
          .join('; '),
    );
    expect(ms).toBeLessThanOrEqual(3 * observeMs);
  }, 300_000);
});
