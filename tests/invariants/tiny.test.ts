// 03 §18 invariants on the tiny world: seeds 1-50 x streams 0-31, 20 random pin sets, a fizzling pin.
import { describe, it } from 'vitest';
import { cardPin, tiny } from '../sim/helpers';
import { checkFizzle, checkPinned, checkUnpinned } from './check';

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

describe('tiny world invariants', () => {
  it(
    'seeds 1-50, streams 0-31',
    () => checkUnpinned(tiny, range(1, 50), range(0, 31), false),
    120_000,
  );
  it('20 random pin sets', () => checkPinned(tiny, range(1, 20)), 120_000);
  it('a pin invalid in every history changes only its fizzle', () =>
    checkFizzle(tiny, cardPin('nap_now', { cat: 'hero' }, 10), range(1, 10)));
});
