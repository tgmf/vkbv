// Test vectors from spec 03 §1 and §1.1.
import { describe, expect, it } from 'vitest';
import { EXP } from '../src/sim/exp-table';
import { PHI } from '../src/sim/phi-table';
import { hashState } from '../src/sim/hash';
import { clamp, isqrt, mulPm, probAtLeast, sample, softmax } from '../src/sim/math';
import { hash32, rand } from '../src/sim/rng';

describe('rng', () => {
  it.each([
    ['', 2872998923],
    ['a', 444641715],
    ['1|marti|0|choice', 648401016],
    ['1|marti|420|choice', 2287249445],
    ['42|worker_a|133|noise:work', 2803703836],
  ])('hash32(%j) = %i', (key, expected) => expect(hash32(key)).toBe(expected));

  it('rand vectors', () => {
    expect(rand(1, 'marti', 0, 'choice', 41)).toBe(38);
    expect(rand(1, 'marti', 420, 'choice', 41)).toBe(34);
    expect(rand(42, 'worker_a', 133, 'noise:work', 1000)).toBe(836);
  });
});

describe('hashState', () => {
  it('vectors', () => {
    expect(hashState({})).toBe('5465b825');
    expect(hashState({ b: [2, 3], a: 1 })).toBe('2c571be4');
  });
});

describe('EXP table', () => {
  it('has 1201 entries and the spec vectors', () => {
    expect(EXP).toHaveLength(1201);
    const vectors: [number, number][] = [
      [0, 65536],
      [1, 64884],
      [50, 39750],
      [69, 32871],
      [100, 24109],
      [200, 8869],
      [500, 442],
      [1000, 3],
      [1179, 0],
    ];
    for (const [k, v] of vectors) expect(EXP[k], `EXP[${k}]`).toBe(v);
  });

  it('is non-increasing integers', () => {
    for (let k = 1; k < EXP.length; k++) {
      expect(Number.isInteger(EXP[k])).toBe(true);
      expect(EXP[k]).toBeLessThanOrEqual(EXP[k - 1] ?? 0);
    }
  });
});

describe('softmax', () => {
  it('vectors', () => {
    expect(softmax([2, 0], 20)).toEqual([731062, 268938]);
    expect(softmax([2, 0], 10)).toEqual([880802, 119198]);
    expect(softmax([1, -1, 0], 20)).toEqual([506482, 186320, 307198]);
  });

  it('always sums to 1 000 000', () => {
    expect(softmax([5, 5, 5], 13).reduce((a, b) => a + b)).toBe(1_000_000);
    expect(softmax([0, -200], 10)).toEqual([1_000_000, 0]);
  });
});

describe('sample', () => {
  it('returns the first index whose running sum exceeds r', () => {
    const p = [731062, 268938];
    expect(sample(p, 0)).toBe(0);
    expect(sample(p, 731061)).toBe(0);
    expect(sample(p, 731062)).toBe(1);
    expect(sample(p, 999_999)).toBe(1);
  });
});

describe('integer helpers', () => {
  it('mulPm and clamp', () => {
    expect(mulPm(300, 150)).toBe(45);
    expect(mulPm(-7, 500)).toBe(-3);
    expect(clamp(1200, 0, 1000)).toBe(1000);
    expect(clamp(-1, 0, 1000)).toBe(0);
  });

  it('isqrt is floor(sqrt(n))', () => {
    for (const n of [0, 1, 2, 3, 4, 15, 16, 17, 99, 100, 1_000_000, 2 ** 52]) {
      const r = isqrt(n);
      expect(r * r).toBeLessThanOrEqual(n);
      expect((r + 1) * (r + 1)).toBeGreaterThan(n);
    }
  });
});

describe('PHI table (03 §13.7)', () => {
  it('has 401 entries and the standard normal CDF at known points', () => {
    expect(PHI).toHaveLength(401);
    const vectors: [number, number][] = [
      [0, 500000],
      [50, 691462],
      [100, 841345],
      [196, 975002],
      [200, 977250],
      [300, 998650],
      [400, 999968],
    ];
    for (const [k, v] of vectors) expect(PHI[k], `PHI[${k}]`).toBe(v);
  });

  it('is non-decreasing integers', () => {
    for (let k = 1; k < PHI.length; k++) {
      expect(Number.isInteger(PHI[k])).toBe(true);
      expect(PHI[k]).toBeGreaterThanOrEqual(PHI[k - 1] ?? 0);
    }
  });

  it('P(X >= x) for a counter: certain with no variance, mirrored below the mean', () => {
    expect(probAtLeast(5, 0, 5)).toBe(1_000_000);
    expect(probAtLeast(4, 0, 5)).toBe(0);
    // mean 10, variance 4 (sd 2): P(X >= 12) uses z = (10 − 12 + ½)/2 = −0.75
    expect(probAtLeast(10, 4, 12)).toBe(1_000_000 - (PHI[75] ?? 0));
    // P(X >= 9): z = (10 − 9 + ½)/2 = 0.75
    expect(probAtLeast(10, 4, 9)).toBe(PHI[75]);
    expect(probAtLeast(0, 1, 100)).toBe(1_000_000 - (PHI[400] ?? 0));
  });
});
