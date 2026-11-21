// Golden single histories: the reference simulation (03 §12.4) for every 05 §5.1 pin set, seeds
// 1-3, stream 0. A changed hash needs a written reason; rewrite only with `npm run golden:update`.
import { expect, it } from 'vitest';
import { PINSETS_FILE } from '../../src/content/chapter1';
import { parsePinSets } from '../../src/content/load';
import { hashState } from '../../src/sim/hash';
import { runHistory } from '../../src/sim/history';
import { ch1 } from '../sim/helpers';

/** Ticks whose state hash is recorded besides the last one, so a change shows when it starts. */
const EVERY = 60;

it('matches tests/golden/single-history.expected.json', async () => {
  const sets = parsePinSets(PINSETS_FILE, ch1);
  const table: Record<string, unknown> = {};
  for (const [name, pins] of Object.entries(sets))
    for (const seed of [1, 2, 3]) {
      const h = runHistory(ch1, seed, 0, pins);
      const hashes: Record<number, string> = {};
      h.states.forEach((s, t) => {
        if (t % EVERY === 0 || t === h.states.length - 1) hashes[t] = hashState(s);
      });
      table[`${name}.s${seed}`] = { end: h.end, hashes };
    }
  await expect(JSON.stringify(table, null, 1) + '\n').toMatchFileSnapshot(
    './single-history.expected.json',
  );
}, 120_000);
