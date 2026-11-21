// 03 §18 invariants and B1 on Chapter 1, seeds 1-50, streams 24-27 (one of eight files run in parallel).
import { it } from 'vitest';
import { ch1 } from '../sim/helpers';
import { checkUnpinned } from './check';

it(
  'Chapter 1, seeds 1-50, streams 24-27: integers, gauge ranges, JSON, B1',
  () =>
    checkUnpinned(
      ch1,
      Array.from({ length: 50 }, (_, i) => i + 1),
      [24, 25, 26, 27],
      true,
    ),
  600_000,
);
