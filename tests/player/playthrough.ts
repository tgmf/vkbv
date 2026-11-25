// The scripted first playthrough (01 §3), headless, through the worker's own code. Requested seed 1,
// played on its vetted seed (Tagir, 2026-11-25). Each played-card rule runs it in its own file.
//
// What the vetted seed does (docs/handoff/M3.md): Marti's teaCraving starts at 632, above its voice
// threshold (600), so it never crosses it and `empty_teapot` is never found; with that craving
// (noFreshTea) and the tale he overhears (itchy) he already has two primes, so the unprimed lure
// brings him out at once and the 01 §3 beat "turns back, prime him" does not happen here.
import { expect } from 'vitest';
import { CHAPTER1_FILES, PINSETS_FILE, TUNING_FILE } from '../../src/content/chapter1';
import { inspect, playCard, usePower } from '../../src/player/actions';
import { driver } from '../helpers/playthrough';
import { tuning } from '../sim/helpers';

export const VETTED_1 = 49598663;
const OBJECTS = ['melmans_whistle', 'chipped_teacup', 'odds_jar', 'flea_comb', 'old_box'];
const CARDS = ['something_shiny', 'tea_break', 'irresistible_junk', 'sudden_flea', 'box'];

const zones = (cards: Record<string, { zone: string }>, ids: string[]) =>
  ids.map((id) => cards[id]?.zone);

export function playthrough(rule: 'pinned' | 'spent' | 'discard', vetLive: boolean): void {
  const d = driver(
    { chapter: CHAPTER1_FILES, tuning: TUNING_FILE, pinsets: PINSETS_FILE },
    { player: { ...tuning.player, playedCardRule: rule } },
  );
  const seed = vetLive ? d.vet(1) : VETTED_1;
  expect(seed).toBe(VETTED_1);

  // 1. A new game: the lantern edge at 0, nothing found, nothing paid.
  d.start(1, seed);
  expect([d.view.edge, d.player.playhead, d.player.charge]).toEqual([0, 0, 0]);

  // 2. Watch: the town is ghosts; Marti potters in the flat.
  d.playTo(60);
  expect(d.player.watched).toHaveLength(60);
  expect(d.player.revealed.every((n) => n.startsWith('flat.'))).toBe(true);

  // 3. Inspect the five objects in the flat: five stories, five cards.
  for (const object of OBJECTS)
    expect(d.act((p, v, c) => inspect(p, v, c, { object })).error).toBeUndefined();
  expect(d.player.journal.stories).toEqual(OBJECTS);
  expect(zones(d.player.cards, CARDS)).toEqual(CARDS.map(() => 'hand'));

  // ... and try two on Marti. They go where the rule sends them.
  expect(
    d.act((p, v, c) => playCard(p, v, c, { card: 'something_shiny', target: { cat: 'marti' } }))
      .error,
  ).toBeUndefined();
  d.playTo(100);
  expect(
    d.act((p, v, c) => playCard(p, v, c, { card: 'sudden_flea', target: { cat: 'marti' } })).error,
  ).toBeUndefined();
  expect(zones(d.player.cards, ['something_shiny', 'sudden_flea'])).toEqual([rule, rule]);

  // The town is not revealed: no card can go on the roadworks yet.
  expect(
    d.act((p, v, c) =>
      playCard(p, v, c, { card: 'tea_break', target: { place: 'town.roadworks' } }),
    ).error,
  ).toBe('placeNotRevealed');

  // 4. Play on: the rain starts (the charge floor), the boat leaves, the timeline frays.
  d.playTo(2000);
  expect(d.view.end).toEqual({ kind: 'fray', tick: 1075 });
  expect(d.player.playhead).toBe(1075);
  expect(d.player.paid).toContain('rain');
  expect(d.player.charge).toBe(100);
  expect(d.player.anchorWatched).toBe(false);

  // 5. Scroll back and place the lure at the front door (available since the rain started).
  d.scrubTo(715);
  const lure = d.act((p, v, c) => usePower(p, v, c, { power: 'lure', place: 'flat.door' }));
  expect(lure.error).toBeUndefined();
  expect(d.player.charge).toBe(0);
  // the re-run stops before Marti steps out, new story (martiOut) the frontier has not seen
  expect(d.view.end).toEqual({ kind: 'limit', tick: 725 });
  expect(lure.notice?.alert).toBe(false); // nothing paid reopens, no pin moves
  // every fact from the lure on reopens, all unpaid: his own part changes at once (he heads for
  // the door), and those past the new edge reopen without a test
  expect(d.player.marks.changedUnwatched).toHaveLength(1075 - 715);
  d.playTo(2000);

  // 6–8. He walks out, the town is revealed, the road is blocked, he follows the chain: the strike.
  const states = d.player.watched.flatMap((f) => f.summary.storylets);
  for (const s of [
    'door_lure.at_door',
    'door_lure.out',
    'blocked_road.toward_steps',
    'chain_on_beach.following',
    'under_the_boat.meeting',
  ])
    expect(states).toContain(s);
  expect(d.player.anchorWatched).toBe(true);
  expect(d.view.end).toEqual({ kind: 'anchor', tick: 790 });
  expect(d.player.revealed).toContain('town.roadworks');
  expect(d.player.frontier.story).toBe(100);

  // 7. Back to the morning: the roadworks take cards now.
  d.scrubTo(180);
  expect(
    d.act((p, v, c) =>
      playCard(p, v, c, { card: 'tea_break', target: { place: 'town.roadworks' } }),
    ).error,
  ).toBeUndefined();
  d.scrubTo(200);
  expect(
    d.act((p, v, c) => playCard(p, v, c, { card: 'box', target: { place: 'town.roadworks' } }))
      .error,
  ).toBeUndefined();
  d.playTo(2000);
  expect(d.view.end).toEqual({ kind: 'anchor', tick: 790 }); // the same strike: the road was blocked anyway
  expect(d.player.anchorWatched).toBe(true);
  expect(zones(d.player.cards, ['tea_break', 'box'])).toEqual([rule, rule]);
  if (rule === 'discard') {
    // the town and the beach, each first revealed, drew a card: the two discarded on Marti came back
    expect(d.player.reshuffles).toBe(1);
    expect(zones(d.player.cards, ['something_shiny', 'sudden_flea'])).toEqual(['hand', 'hand']);
  }
  // no hook was voiced on this seed: empty_teapot was never found
  expect(d.player.journal.hooks).toEqual([]);
  expect(d.player.cards['empty_teapot']?.zone).toBe('unfound');
}
