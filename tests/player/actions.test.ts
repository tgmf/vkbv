// Player actions (04 §3–§8): every refusal reason of every action, purity, specials, and charge that is
// never refunded. The tiny world and Chapter 1, with views from real re-runs.
import { describe, expect, it } from 'vitest';
import { readChapterDir } from '../../src/cli/files';
import { loadChapter } from '../../src/content/load';
import {
  advance,
  follow,
  inspect,
  movePin,
  playCard,
  setPlayhead,
  usePower,
  withdraw,
  type ActionResult,
} from '../../src/player/actions';
import type { PlayerState, PlayerView } from '../../src/player/state';
import type { Content } from '../../src/sim/types';
import { ch1, TINY_DIR, tiny, tuning } from '../sim/helpers';
import { game, inHand, newGameView, revealing, viewOf } from './helpers';

const view = viewOf(tiny);
const ch1View: PlayerView = newGameView(ch1);

/** Runs an action and checks it did not touch its input (04 §10: actions are pure). */
function pure(p: PlayerState, act: (p: PlayerState) => ActionResult): ActionResult {
  const before = structuredClone(p);
  const r = act(p);
  expect(p).toEqual(before);
  const again = act(structuredClone(before));
  expect(again).toEqual(r);
  return r;
}

const refused = (r: ActionResult, why: string, p: PlayerState) => {
  expect(r.error).toBe(why);
  expect(r.player).toBe(p);
};

/** The tiny world with `poke` unique, for the unique-card rules. */
const uniqueTiny: Content = (() => {
  const files = readChapterDir(TINY_DIR);
  const cards = files.cards as { cards: { id: string; unique: boolean }[] };
  return loadChapter(
    { ...files, cards: { cards: cards.cards.map((x) => ({ ...x, unique: x.id === 'poke' })) } },
    tuning,
  );
})();

describe('playCard refusals (04 §3.1)', () => {
  const p = inHand(game(tiny), 'scare', 'nap_now', 'send', 'magnet', 'hold');

  it('card not in hand', () => {
    const g = game(tiny);
    refused(
      pure(g, (x) => playCard(x, view, tiny, { card: 'scare', target: { place: 'home.room' } })),
      'cardNotInHand',
      g,
    );
  });

  it('place not revealed', () => {
    refused(
      pure(p, (x) => playCard(x, view, tiny, { card: 'scare', target: { place: 'street.b' } })),
      'placeNotRevealed',
      p,
    );
  });

  it('object hidden', () => {
    // the crate shows only once crateShown holds; at tick 0 it cannot
    const q = revealing(p, 'street.b');
    expect(view.frames[0]?.visible['crate']).toBe(0);
    refused(
      pure(q, (x) => playCard(x, view, tiny, { card: 'magnet', target: { object: 'crate' } })),
      'objectHidden',
      q,
    );
  });

  it('cat nowhere revealed', () => {
    refused(
      pure(p, (x) => playCard(x, view, tiny, { card: 'send', target: { cat: 'pal' } })),
      'catNowhereRevealed',
      p,
    );
    expect(
      playCard(p, view, tiny, { card: 'send', target: { cat: 'hero' } }).error,
    ).toBeUndefined();
  });

  it('wrong bound cat', () => {
    refused(
      pure(p, (x) => playCard(x, view, tiny, { card: 'nap_now', target: { cat: 'hero' } })),
      'wrongCat',
      p,
    );
  });

  it('missing branch', () => {
    refused(
      pure(p, (x) => playCard(x, view, tiny, { card: 'hold', target: { place: 'home.room' } })),
      'noBranch',
      p,
    );
  });

  it('past the lantern edge', () => {
    const q = { ...p, playhead: view.edge + 1 };
    refused(
      pure(q, (x) => playCard(x, view, tiny, { card: 'scare', target: { place: 'home.room' } })),
      'pastEdge',
      q,
    );
  });

  it('special already used, when the card has no other branch for its object', () => {
    const q = inHand(game(tiny), 'shift');
    const first = playCard(q, view, tiny, { card: 'shift', target: { object: 'mat' } });
    expect(first.error).toBeUndefined();
    expect(first.player.pins[0]).toMatchObject({ special: true });
    const back = withdraw(first.player, view, tiny, { pin: first.player.pins[0]?.id ?? '' }).player;
    expect(back.specialsUsed).toEqual(['shift']); // withdrawing does not restore it
    refused(
      pure(back, (x) => playCard(x, view, tiny, { card: 'shift', target: { object: 'mat' } })),
      'specialUsed',
      back,
    );
  });
});

describe('specials (04 §3.1)', () => {
  it('the first pin on the source object is the special, a second is not, a withdrawal does not restore it', () => {
    const p = inHand(game(ch1), 'something_shiny');
    const a = pure(p, (x) =>
      playCard(x, ch1View, ch1, { card: 'something_shiny', target: { object: 'melmans_whistle' } }),
    );
    const pinA = a.player.pins[0];
    expect([pinA?.kind === 'card' && pinA.special, a.player.specialsUsed]).toEqual([
      true,
      ['something_shiny'],
    ]);
    const w = withdraw(a.player, ch1View, ch1, { pin: pinA?.id ?? '' }).player;
    expect(w.cards['something_shiny']?.zone).toBe('hand');
    expect(w.specialsUsed).toEqual(['something_shiny']);
    const b = playCard(w, ch1View, ch1, {
      card: 'something_shiny',
      target: { object: 'melmans_whistle' },
    });
    const pinB = b.player.pins[0];
    expect([b.error, pinB?.kind === 'card' && pinB.special]).toEqual([undefined, false]);
  });
});

describe('usePower, withdraw, movePin (04 §3.2, §3.3)', () => {
  it('power refusals: past the edge, place not revealed, not available, charge short', () => {
    const p = { ...game(tiny), charge: 5 };
    refused(
      pure(p, (x) => usePower(x, view, tiny, { power: 'glow', place: 'home.room' })),
      'chargeShort',
      p,
    );
    refused(
      pure(p, (x) => usePower(x, view, tiny, { power: 'gaze', place: 'street.a' })),
      'placeNotRevealed',
      p,
    );
    const late = { ...p, playhead: view.edge + 1 };
    refused(
      pure(late, (x) => usePower(x, view, tiny, { power: 'gaze', place: 'home.room' })),
      'pastEdge',
      late,
    );
    // Chapter 1's lure is available only once the rain has started (04 §3.2)
    const q = { ...game(ch1), charge: 300 };
    expect(ch1View.frames[0]?.powers).toEqual(['gaze']);
    refused(
      pure(q, (x) => usePower(x, ch1View, ch1, { power: 'lure', place: 'flat.door' })),
      'notAvailable',
      q,
    );
    expect(usePower(q, ch1View, ch1, { power: 'gaze', place: 'flat.door' }).player.charge).toBe(
      260,
    );
  });

  it('charge is never refunded: a withdrawal returns nothing, a move costs the full cost again', () => {
    const p = { ...game(tiny), charge: 30 };
    const placed = pure(p, (x) =>
      usePower(x, view, tiny, { power: 'glow', place: 'home.room' }),
    ).player;
    expect(placed.charge).toBe(20);
    const pin = placed.pins[0]?.id ?? '';
    expect(pure(placed, (x) => withdraw(x, view, tiny, { pin })).player).toMatchObject({
      charge: 20,
      pins: [],
    });
    const moved = pure(placed, (x) => movePin(x, view, tiny, { pin, tick: 3 })).player;
    expect([moved.charge, moved.pins[0]?.tick]).toEqual([10, 3]);
    const twice = movePin(moved, view, tiny, { pin, tick: 4 }).player;
    expect(twice.charge).toBe(0);
    refused(
      pure(twice, (x) => movePin(x, view, tiny, { pin, tick: 5 })),
      'chargeShort',
      twice,
    );
  });

  it('a unique card’s pin cannot be withdrawn or moved; moves stay within the edge; unknown pins', () => {
    const v = viewOf(uniqueTiny);
    const p = inHand(game(uniqueTiny), 'poke', 'scare');
    const r = playCard(p, v, uniqueTiny, { card: 'poke', target: { cat: 'hero' } });
    expect(r.player.cards['poke']?.zone).toBe('spent');
    const pin = r.player.pins[0]?.id ?? '';
    refused(
      pure(r.player, (x) => withdraw(x, v, uniqueTiny, { pin })),
      'unique',
      r.player,
    );
    refused(
      pure(r.player, (x) => movePin(x, v, uniqueTiny, { pin, tick: 1 })),
      'unique',
      r.player,
    );
    const s = playCard(p, v, uniqueTiny, { card: 'scare', target: { place: 'home.room' } }).player;
    const id = s.pins[0]?.id ?? '';
    refused(
      pure(s, (x) => movePin(x, v, uniqueTiny, { pin: id, tick: v.edge + 1 })),
      'pastEdge',
      s,
    );
    expect(movePin(s, v, uniqueTiny, { pin: id, tick: v.edge }).player.pins[0]?.tick).toBe(v.edge);
    refused(
      pure(s, (x) => withdraw(x, v, uniqueTiny, { pin: 'nope' })),
      'noPin',
      s,
    );
    refused(
      pure(s, (x) => movePin(x, v, uniqueTiny, { pin: 'nope', tick: 0 })),
      'noPin',
      s,
    );
  });

  it('played-card rules: pinned returns to the hand on withdrawal; spent and discard do not', () => {
    for (const rule of ['pinned', 'spent', 'discard'] as const) {
      const c = {
        ...tiny,
        tuning: { ...tiny.tuning, player: { ...tiny.tuning.player, playedCardRule: rule } },
      };
      const p = inHand(game(c), 'scare');
      const played = playCard(p, view, c, { card: 'scare', target: { place: 'home.room' } }).player;
      expect(played.cards['scare']?.zone).toBe(rule);
      const back = withdraw(played, view, c, { pin: played.pins[0]?.id ?? '' }).player;
      expect(back.cards['scare']?.zone).toBe(rule === 'pinned' ? 'hand' : rule);
    }
  });
});

describe('inspect, follow, setPlayhead, advance (04 §5–§8)', () => {
  it('inspect: the first time gives the story and the card; refused unrevealed or hidden', () => {
    const p = game(tiny);
    const r = pure(p, (x) => inspect(x, view, tiny, { object: 'mat' }));
    expect(r.player.journal.stories).toEqual(['mat']);
    expect(r.player.cards['shift']?.zone).toBe('hand');
    expect(r.rewards).toEqual([{ key: 'inspect:mat', cards: ['shift'] }]);
    const again = inspect(r.player, view, tiny, { object: 'mat' });
    expect([again.player, again.rewards]).toEqual([r.player, []]);
    refused(
      pure(p, (x) => inspect(x, view, tiny, { object: 'bell' })),
      'placeNotRevealed',
      p,
    );
    const q = revealing(p, 'street.b');
    refused(
      pure(q, (x) => inspect(x, view, tiny, { object: 'crate' })),
      'objectHidden',
      q,
    );
  });

  it('follow refuses every cat but the protagonist (04 §5)', () => {
    const p = game(tiny);
    expect(follow(p, view, tiny, { cat: 'hero' }).player.followed).toEqual(['hero']);
    refused(
      pure(p, (x) => follow(x, view, tiny, { cat: 'pal' })),
      'notFollowable',
      p,
    );
    const c = game(ch1);
    refused(
      pure(c, (x) => follow(x, ch1View, ch1, { cat: 'rokko' })),
      'notFollowable',
      c,
    );
  });

  it('setPlayhead moves within 0..edge only, and changes nothing else', () => {
    const p = game(tiny);
    expect(pure(p, (x) => setPlayhead(x, view, tiny, { tick: 3 })).player).toEqual({
      ...p,
      playhead: 3,
    });
    refused(
      pure(p, (x) => setPlayhead(x, view, tiny, { tick: view.edge + 1 })),
      'pastEdge',
      p,
    );
    refused(
      pure(p, (x) => setPlayhead(x, view, tiny, { tick: -1 })),
      'pastEdge',
      p,
    );
  });

  it('advance: only the playhead’s fact, never past the edge', () => {
    const p = game(tiny);
    const fact = { tick: 1, cat: 'hero', digest: 0, summary: emptySummary };
    refused(
      pure(p, (x) => advance(x, view, tiny, { fact })),
      'notAtPlayhead',
      p,
    );
    const end = { ...p, playhead: view.edge };
    refused(
      pure(end, (x) => advance(x, view, tiny, { fact: null })),
      'pastEdge',
      end,
    );
  });
});

const emptySummary = {
  self: { node: 'home.room', activity: 'nap', interrupt: null },
  cats: [],
  storylets: [],
  detectors: [],
  factsSet: [],
  events: [],
  nodesSeen: [],
  paidBy: {},
  totalPressure: 0,
  weather: 'dry' as const,
};
