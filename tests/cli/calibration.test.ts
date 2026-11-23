// Calibration's checks (07 §3) on hand-made pairs, and one seed's pairs on the tiny world.
import { describe, expect, it } from 'vitest';
import { judge, seedPairs, type Pair } from '../../src/cli/calibration';
import { powerPin, tiny } from '../sim/helpers';

/** `n` pairs of one event at chance p, `hits` of them happened. */
const pairs = (event: string, n: number, p: number, hits: number, fog = true): Pair[] =>
  Array.from({ length: n }, (_, i) => ({ seed: i + 1, event, p, hit: i < hits, fog }));

describe('calibration (07 §3)', () => {
  const cal = tiny.tuning.calibration; // tolerance 10%, at least 20 pairs a bucket

  it('rates: a miss fails the full run, not the quick one', () => {
    const off = pairs('e', cal.minPerBucket - 1, 500_000, cal.minPerBucket - 1); // 50% vs 100%
    expect(judge(tiny, off, false)).toMatchObject({ rateMisses: 1, bucketMisses: 0, pass: false });
    expect(judge(tiny, off, true)).toMatchObject({ rateMisses: 1, bucketMisses: 0, pass: true });
  });

  it('buckets: a full bucket off by more than the tolerance fails both runs; a small one is not judged', () => {
    const off = [...pairs('a', cal.minPerBucket, 950_000, 10), ...pairs('b', 1, 950_000, 1)];
    // the rate of `a` misses too; the bucket (90–100%) holds a and b
    expect(judge(tiny, off, true)).toMatchObject({ bucketMisses: 1, pass: false });
    expect(judge(tiny, off.slice(2), true)).toMatchObject({ bucketMisses: 0, pass: true }); // 19 pairs
    const lantern = pairs('a', cal.minPerBucket, 950_000, 10, false); // not fog events: no bucket
    expect(judge(tiny, lantern, true).bucketMisses).toBe(0);
  });

  it('passes when chances and outcomes agree', () => {
    const fine = [...pairs('a', 40, 500_000, 20), ...pairs('b', 40, 1_000_000, 40)];
    expect(judge(tiny, fine, false)).toMatchObject({ rateMisses: 0, bucketMisses: 0, pass: true });
  });

  it('one seed: a fact the lantern holds is certain and no fog event; the same seed gives the same pairs', () => {
    const pins = [powerPin('glow', 'home.room', 0)];
    const a = seedPairs(tiny, pins, 1, ['heroOut']);
    expect(a).toEqual(seedPairs(tiny, pins, 1, ['heroOut']));
    expect(a).toEqual([{ seed: 1, event: 'heroOut', p: 1_000_000, hit: a[0]?.hit, fog: false }]);
  });
});
