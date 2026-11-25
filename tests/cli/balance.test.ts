// `npm run balance`'s table (05 §5.2) on hand-made seed measures.
import { describe, expect, it } from 'vitest';
import { BALANCE, judgeBalance, roadSubsets, type SeedBalance } from '../../src/cli/balance';

const names = roadSubsets().map((s) => s.join('+'));

/** `n` seeds; `i` → each measure. */
const seeds = (
  n: number,
  f: (i: number) => {
    out?: Record<string, boolean>;
    road?: number[];
    frayed?: Record<string, boolean>;
  },
): SeedBalance[] =>
  Array.from({ length: n }, (_, i) => {
    const x = f(i);
    return {
      seed: i + 1,
      vetted: i + 1,
      out: x.out ?? {},
      road: Object.fromEntries(names.map((name, k) => [name, x.road?.[k] ?? 0])),
      frayed: x.frayed ?? {},
    };
  });

const row = (runs: SeedBalance[], id: string, i = 0) =>
  judgeBalance(runs).filter((r) => r.id === id)[i];

describe('balance (05 §5.2)', () => {
  it('B5 reads 15 subsets of the four road pins, single pins first', () => {
    expect(names).toHaveLength(15);
    expect(roadSubsets()[0]).toEqual([BALANCE.roadPins[0]]);
    expect(roadSubsets()[14]).toEqual([...BALANCE.roadPins]);
  });

  it('B2-B4: shares of seeds with martiOut against at most / at least', () => {
    // 7 of 50 out (14%): B2 passes (≤ 15%), 8 of 50 (16%) fails; B4 needs 30 of 50
    const runs = (k: number) =>
      seeds(50, (i) => ({
        out: { lure_unprimed: i < k, lure_one_prime: i < k, lure_primed: i < k },
      }));
    expect(row(runs(7), 'B2')).toMatchObject({ pass: true, measured: '14.0% (7/50)' });
    expect(row(runs(8), 'B2')).toMatchObject({ pass: false, against: [1, 2, 3, 4, 5, 6, 7, 8] });
    expect(row(runs(17), 'B3')?.pass).toBe(true);
    expect(row(runs(18), 'B3')?.pass).toBe(false);
    expect(row(runs(30), 'B4')?.pass).toBe(true);
    expect(row(runs(29), 'B4')).toMatchObject({
      pass: false,
      against: seeds(50, () => ({}))
        .slice(29)
        .map((r) => r.seed),
    });
  });

  it('B5: no single pin at 50%, at least three subsets', () => {
    // index 0, 1, 3, 7: the single pins; 2 = the first two together
    const at = (blocks: number[]) =>
      seeds(4, () => ({ road: names.map((_, k) => (blocks.includes(k) ? 600_000 : 100_000)) }));
    expect(row(at([2, 4, 5]), 'B5')?.pass).toBe(true);
    expect(row(at([2, 4]), 'B5')?.pass).toBe(false); // two subsets only
    expect(row(at([0, 2, 4, 5]), 'B5')?.pass).toBe(false); // a single pin blocks the road
  });

  it('B6, B7: at least 45 of 50 seeds', () => {
    const runs = (k: number) =>
      seeds(50, (i) => ({
        frayed: { road_tea: i < k, road_box: i < k, road_both: i < k, late_lure: i >= k },
      }));
    expect(row(runs(5), 'B6')).toMatchObject({ pass: true, measured: '45/50' });
    expect(row(runs(6), 'B6', 2)).toMatchObject({ pass: false, against: [1, 2, 3, 4, 5, 6] });
    expect(row(runs(5), 'B7')).toMatchObject({ pass: true, measured: '45/50' });
    expect(row(runs(6), 'B7')?.pass).toBe(false);
  });
});
