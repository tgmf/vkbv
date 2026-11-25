// The road solutions (05 §5.1) played by hand on the game's seed (the first vetted seed, 4), through
// the worker's own code, with the actions the interface sends and in the order a player can reach them:
// the morning cards on the roadworks only once Marti's walk has revealed it. On seed 4 Marti never voices
// teaCraving, so `empty_teapot` is never found and its pin is left out (docs/questions.md M6-1).
import { expect } from 'vitest';
import { CHAPTER1_FILES, PINSETS_FILE, TUNING_FILE } from '../../src/content/chapter1';
import { parsePinSets } from '../../src/content/load';
import { inspect, playCard, usePower } from '../../src/player/actions';
import { byLog } from '../../src/player/state';
import type { Pin } from '../../src/sim/types';
import { driver, type Driver } from '../helpers/playthrough';

export const GAME_SEED = 4;
const OBJECTS = ['melmans_whistle', 'chipped_teacup', 'odds_jar', 'flea_comb', 'old_box'];

/** A pin as the pin sets write it, without its id and sequence. */
const shape = (x: Pin) =>
  x.kind === 'power'
    ? `${x.power}@${x.place}@${x.tick}`
    : `${x.card}@${Object.values(x.target)[0] ?? ''}@${x.tick}${x.special ? '!' : ''}`;

export function byHand(set: 'road_tea' | 'road_box' | 'road_both'): Driver {
  const d = driver({ chapter: CHAPTER1_FILES, tuning: TUNING_FILE, pinsets: PINSETS_FILE });
  const ok = (r: { error?: string }) => expect(r.error).toBeUndefined();
  d.start(GAME_SEED, GAME_SEED);
  d.playTo(60);
  for (const object of OBJECTS) ok(d.act((p, v, c) => inspect(p, v, c, { object })));

  // the primes and the lure, after the rain has started (05 §5.1's ticks)
  d.playTo(700);
  ok(
    d.act((p, v, c) =>
      playCard(p, v, c, { card: 'irresistible_junk', target: { object: 'odds_jar' } }),
    ),
  );
  d.playTo(715);
  ok(d.act((p, v, c) => usePower(p, v, c, { power: 'lure', place: 'flat.door' })));
  d.playTo(2000);
  expect(d.player.revealed).toContain('town.roadworks');

  // back to the morning: the roadworks take cards now
  if (set !== 'road_box') {
    d.scrubTo(180);
    ok(
      d.act((p, v, c) =>
        playCard(p, v, c, { card: 'tea_break', target: { place: 'town.roadworks' } }),
      ),
    );
  }
  if (set !== 'road_tea') {
    d.scrubTo(200);
    ok(d.act((p, v, c) => playCard(p, v, c, { card: 'box', target: { place: 'town.roadworks' } })));
  }
  d.playTo(2000);

  // the log is the pin set's, but for the card this seed never gives
  expect(d.player.cards['empty_teapot']?.zone).toBe('unfound');
  const sets = parsePinSets(PINSETS_FILE, d.c);
  const want = (sets[set] ?? []).filter((x) => x.kind !== 'card' || x.card !== 'empty_teapot');
  expect(d.player.pins.map(shape)).toEqual(byLog(want).map(shape));
  return d;
}
