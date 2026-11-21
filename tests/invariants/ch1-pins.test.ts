// 03 §18 invariants on Chapter 1 with 20 random pin sets, and a pin that fizzles in every history.
import { it } from 'vitest';
import { cardPin, ch1 } from '../sim/helpers';
import { checkFizzle, checkPinned } from './check';

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

it('20 random pin sets', () => checkPinned(ch1, range(1, 20)), 600_000);
it(
  'irresistible_junk on Prasha (bound to Marti) changes only its fizzle',
  () => checkFizzle(ch1, cardPin('irresistible_junk', { cat: 'prasha' }, 100), range(1, 5)),
  600_000,
);
