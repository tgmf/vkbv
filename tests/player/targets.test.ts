// What a held card or power can do (06 §3–§5): valid targets agree with the actions, hold refusals, the
// special's confirm step, the presence strip, and pins' fired status on the timeline.
import { describe, expect, it } from 'vitest';
import { movePin, playCard, usePower, type Target } from '../../src/player/actions';
import {
  handOf,
  heldRefusal,
  isLocked,
  piles,
  holdRefusal,
  needsConfirm,
  pinStatus,
  presence,
  targetKinds,
  targetsOf,
  type Held,
} from '../../src/player/targets';
import type { PlayerState, PlayerView } from '../../src/player/state';
import { PPM } from '../../src/sim/math';
import type { Content, Pin } from '../../src/sim/types';
import { cardPin, ch1Coarse, powerPin, tiny } from '../sim/helpers';
import { game, inHand, revealing, viewOf } from './helpers';

const view = viewOf(tiny);
const everyTarget = (c: Content): Target[] => [
  ...c.cats.map((x) => ({ cat: x.id })),
  ...c.objects.map((x) => ({ object: x.id })),
  ...c.nodes.map((x) => ({ place: x.id })),
];

/** The targets on which the action itself succeeds. */
function bruteForce(p: PlayerState, v: PlayerView, c: Content, held: Held) {
  const out = { cats: [] as string[], objects: [] as string[], places: [] as string[] };
  for (const target of everyTarget(c)) {
    const r =
      'card' in held
        ? playCard(p, v, c, { card: held.card, target })
        : 'place' in target
          ? usePower(p, v, c, { power: held.power, place: target.place })
          : { error: 'noBranch' };
    if (r.error) continue;
    if ('cat' in target) out.cats.push(target.cat);
    else if ('object' in target) out.objects.push(target.object);
    else out.places.push(target.place);
  }
  return out;
}

describe('targets of a held card or power (06 §4, §5)', () => {
  it('are exactly the targets the actions accept, at many ticks and states', () => {
    const cards = tiny.cards.map((x) => x.id);
    const base = inHand(game(tiny), ...cards);
    const states: PlayerState[] = [
      base,
      revealing(base, ...tiny.nodes.map((n) => n.id)),
      { ...revealing(base, 'street.b', 'street.c'), charge: 7, specialsUsed: ['shift'] },
    ];
    let valid = 0;
    for (const s of states)
      for (const tick of [0, 10, 25, 40, view.edge]) {
        const p = { ...s, playhead: tick };
        const helds: Held[] = [
          ...cards.map((card) => ({ card })),
          ...tiny.powers.map((x) => ({ power: x.id })),
        ];
        for (const held of helds) {
          const got = targetsOf(p, view, tiny, held);
          expect(got).toEqual(bruteForce(p, view, tiny, held));
          valid += got.cats.length + got.objects.length + got.places.length;
        }
      }
    expect(valid).toBeGreaterThan(50);
  });

  it('a power held over a cat or an object is refused: powers go on places', () => {
    const p = { ...game(tiny), charge: 100 };
    expect(heldRefusal(p, view, tiny, { power: 'gaze' }, { cat: 'hero' })).toBe('noBranch');
    expect(heldRefusal(p, view, tiny, { power: 'gaze' }, { place: 'home.room' })).toBeNull();
  });

  it('hold refusals: a card not in hand, past the edge, charge short, a power not available', () => {
    const p = inHand(game(tiny), 'scare');
    expect(holdRefusal(p, view, tiny, { card: 'poke' })).toBe('cardNotInHand');
    expect(holdRefusal(p, view, tiny, { card: 'scare' })).toBeNull();
    expect(holdRefusal({ ...p, playhead: view.edge + 1 }, view, tiny, { card: 'scare' })).toBe(
      'pastEdge',
    );
    expect(holdRefusal({ ...p, charge: 4 }, view, tiny, { power: 'gaze' })).toBe('chargeShort');
    expect(holdRefusal({ ...p, charge: 5 }, view, tiny, { power: 'gaze' })).toBeNull();
    expect(holdRefusal({ ...p, charge: 99 }, view, tiny, { power: 'nope' })).toBe('notAvailable');
    const noPowers: PlayerView = {
      ...view,
      frames: view.frames.map((f) => ({ ...f, powers: [] })),
    };
    expect(holdRefusal({ ...p, charge: 99 }, noPowers, tiny, { power: 'gaze' })).toBe(
      'notAvailable',
    );
  });

  it('the special needs the confirm step only on its own source object, the first time', () => {
    const p = inHand(game(tiny), 'shift', 'poke');
    expect(needsConfirm(p, tiny, { card: 'shift' }, { object: 'mat' })).toBe(true);
    expect(needsConfirm(p, tiny, { card: 'shift' }, { cat: 'hero' })).toBe(false);
    expect(needsConfirm(p, tiny, { card: 'poke' }, { object: 'mat' })).toBe(false);
    expect(needsConfirm(p, tiny, { power: 'gaze' }, { place: 'home.room' })).toBe(false);
    const used = { ...p, specialsUsed: ['shift'] };
    expect(needsConfirm(used, tiny, { card: 'shift' }, { object: 'mat' })).toBe(false);
  });

  it('target kinds come from the card’s branches and its special', () => {
    expect(targetKinds(tiny, 'poke')).toEqual(['cat', 'object', 'place']); // its special is on the bell
    expect(targetKinds(tiny, 'scare')).toEqual(['place']);
    expect(targetKinds(tiny, 'nope')).toEqual([]);
  });
});

describe('the presence strip (06 §3, docs/questions.md M6-4)', () => {
  const p = revealing(inHand(game(tiny), 'poke', 'nap_now', 'magnet'), 'street.a', 'street.b');

  it('over a place: P(at least one cat the held thing can act on stands there), per tick', () => {
    const strip = presence(p, view, tiny, { card: 'poke' }, { place: 'street.a' });
    expect(strip).toHaveLength(view.edge + 1);
    strip.forEach((x, t) => {
      const f = view.frames[t];
      let none = PPM;
      for (const cat of tiny.cats) {
        const here = (f?.cats[cat.id] ?? []).reduce(
          (a, g) => a + (g.node === 'street.a' ? g.p : 0),
          0,
        );
        none = Math.trunc((none * (PPM - here)) / PPM);
      }
      expect(x).toBe(PPM - none);
    });
    expect(strip.some((x) => x > 0)).toBe(true);
    // a card bound to pal counts only pal there
    const bound = presence(p, view, tiny, { card: 'nap_now' }, { place: 'street.a' });
    bound.forEach((x, t) =>
      expect(x).toBe(
        (view.frames[t]?.cats['pal'] ?? []).reduce(
          (a, g) => a + (g.node === 'street.a' ? g.p : 0),
          0,
        ),
      ),
    );
    // the glow affects protagonists only
    const glow = presence(p, view, tiny, { power: 'glow' }, { place: 'home.room' });
    glow.forEach((x, t) =>
      expect(x).toBe(
        (view.frames[t]?.cats['hero'] ?? []).reduce(
          (a, g) => a + (g.node === 'home.room' ? g.p : 0),
          0,
        ),
      ),
    );
  });

  it('over a cat: P(at a revealed place) if the card can go on it; over an object: P(visible)', () => {
    const pal = presence(p, view, tiny, { card: 'poke' }, { cat: 'pal' });
    pal.forEach((x, t) =>
      expect(x).toBe(
        (view.frames[t]?.cats['pal'] ?? []).reduce(
          (a, g) => a + (p.revealed.includes(g.node) ? g.p : 0),
          0,
        ),
      ),
    );
    expect(
      presence(p, view, tiny, { card: 'nap_now' }, { cat: 'hero' }).every((x) => x === 0),
    ).toBe(true);
    const crate = presence(p, view, tiny, { card: 'magnet' }, { object: 'crate' });
    crate.forEach((x, t) => expect(x).toBe(view.frames[t]?.visible['crate'] ?? 0));
    expect(
      presence(p, view, tiny, { card: 'magnet' }, { object: 'mat' }).every((x) => x === PPM),
    ).toBe(true);
    expect(presence(p, view, tiny, { power: 'gaze' }, { cat: 'pal' }).every((x) => x === 0)).toBe(
      true,
    );
  });

  it('Chapter 1: held over the roadworks in the afternoon, it shows the crew there in the morning', () => {
    const c = ch1Coarse;
    const v = viewOf(c, [], 4);
    const q = { ...revealing(inHand(game(c, 4), 'tea_break'), 'town.roadworks'), playhead: 560 };
    const strip = presence(q, v, c, { card: 'tea_break' }, { place: 'town.roadworks' });
    const morning = strip.slice(80, 320); // 07:00–11:00
    expect(Math.max(...morning)).toBeGreaterThan(500_000);
    expect(Math.max(...strip.slice(0, 10))).toBeLessThan(Math.max(...morning));
  }, 120_000);
});

describe('pins on the timeline: how they fired (06 §3)', () => {
  it('a valid pin is full, one that never fires is hollow with its reason, a late one says when', () => {
    const glow = powerPin('glow', 'home.room', 1);
    const crate = cardPin('magnet', { object: 'crate' }, 2);
    const wrong = cardPin('nap_now', { cat: 'hero' }, 3);
    const pins: Pin[] = [glow, crate, wrong];
    const v = viewOf(tiny, pins);
    expect(pinStatus(v, tiny, glow)).toEqual({ fizzled: 0, reason: null, firesAt: null });
    expect(pinStatus(v, tiny, wrong)).toEqual({ fizzled: PPM, reason: 'wrongCat', firesAt: null });
    const c = pinStatus(v, tiny, crate);
    expect(c.fizzled).toBe(PPM);
    expect(c.reason).toBe('hidden');
    const firedAt = v.frames.findIndex((f) => f.pins[crate.id] === PPM);
    expect(c.firesAt).toBe(firedAt < 0 ? null : firedAt);
    // a pin past every frame has no status yet
    const late = cardPin('scare', { place: 'home.room' }, v.edge);
    expect(pinStatus(v, tiny, late)).toEqual({ fizzled: null, reason: null, firesAt: null });
  });

  it('moving a pin to where it fizzles: the frames say so', () => {
    const p = { ...revealing(inHand(game(tiny), 'magnet'), 'street.b'), playhead: 30 };
    const base = viewOf(tiny);
    const shown = base.frames.findIndex((f) => (f.visible['crate'] ?? 0) > 0);
    expect(shown).toBeGreaterThan(0); // the crate shows later on seed 1
    const at = { ...p, playhead: shown };
    const played = playCard(at, base, tiny, { card: 'magnet', target: { object: 'crate' } });
    expect(played.error).toBeUndefined();
    const pin = played.player.pins[0];
    if (!pin) throw new Error('no pin');
    const moved = movePin(played.player, base, tiny, { pin: pin.id, tick: 0 }).player.pins[0];
    if (!moved) throw new Error('no pin');
    const v = viewOf(tiny, [moved]);
    expect(pinStatus(v, tiny, moved).fizzled).toBeGreaterThan(0);
    expect(pinStatus(v, tiny, moved).reason).toBe('hidden');
  });
});

describe('the hand, the piles and locked pins (06 §3, §4)', () => {
  it('the hand is the cards in zone hand, in content order', () => {
    const p = inHand(game(tiny), 'scare', 'poke');
    expect(handOf(p, tiny)).toEqual(['poke', 'scare']);
    expect(handOf(game(tiny), tiny)).toEqual([]);
  });

  it('the piles show only under rule discard: the draw pile and the discard zone', () => {
    const p = game(tiny);
    expect(piles(p, tiny)).toBeNull();
    const discard = {
      ...tiny,
      tuning: {
        ...tiny.tuning,
        player: { ...tiny.tuning.player, playedCardRule: 'discard' as const },
      },
    };
    const q = {
      ...p,
      drawPile: ['poke'],
      cards: { ...p.cards, poke: { zone: 'draw' as const }, scare: { zone: 'discard' as const } },
    };
    expect(piles(q, discard)).toEqual({ draw: 1, discard: 1 });
  });

  it('a unique card’s pin is locked; others and powers are not', () => {
    const poke = tiny.card['poke'];
    if (!poke) throw new Error('no poke');
    const unique: Content = { ...tiny, card: { ...tiny.card, poke: { ...poke, unique: true } } };
    expect(isLocked(unique, cardPin('poke', { cat: 'hero' }, 1))).toBe(true);
    expect(isLocked(tiny, cardPin('poke', { cat: 'hero' }, 1))).toBe(false);
    expect(isLocked(tiny, powerPin('glow', 'home.room', 1))).toBe(false);
  });
});
