// The debug panel's Player tab (06 §10): each button as a pure function.
import { describe, expect, it } from 'vitest';
import { DEBUG_ACTIONS, debugAction } from '../../src/player/debug';
import type { PlayerState } from '../../src/player/state';
import { ch1 } from '../sim/helpers';
import { game } from './helpers';

const c = ch1;

describe('the Player tab (06 §10)', () => {
  const p: PlayerState = {
    ...game(c, 4),
    charge: 250,
    paid: ['inspect:odds_jar', 'rain'],
    marks: { changedUnwatched: [12] },
    cards: { ...game(c, 4).cards, box: { zone: 'pinned', pin: 'pin1' } },
  };

  it('reveal all reveals every place, sorted', () => {
    expect(debugAction(p, c, 'revealAll').revealed).toEqual(c.nodes.map((n) => n.id).sort());
  });

  it('unlock all puts every unfound card in the hand, test cards included, and keeps the rest', () => {
    const q = debugAction(p, c, 'unlockCards');
    for (const def of c.cards)
      expect(q.cards[def.id]?.zone).toBe(def.id === 'box' ? 'pinned' : 'hand');
    expect(c.cards.some((d) => !d.demo)).toBe(true);
  });

  it('+100 charge, up to the cap', () => {
    expect(debugAction({ ...p, charge: 100 }, c, 'charge').charge).toBe(200);
    expect(debugAction(p, c, 'charge').charge).toBe(c.economy.charge.cap);
  });

  it('clear paid and clear watched', () => {
    expect(debugAction(p, c, 'clearPaid').paid).toEqual([]);
    const q = debugAction(p, c, 'clearWatched');
    expect(q.watched).toEqual([]);
    expect(q.marks.changedUnwatched).toEqual([]);
  });

  it('never changes its input', () => {
    const copy = JSON.parse(JSON.stringify(p)) as PlayerState;
    for (const a of DEBUG_ACTIONS) debugAction(p, c, a);
    expect(p).toEqual(copy);
  });
});
