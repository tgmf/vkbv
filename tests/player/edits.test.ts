// Edits (04 §4): the preview's break alert, committing reopened facts, and pins an edit leaves past the
// new lantern edge. The tiny world, seed 3, through the worker's host. `poke` is made unique here.
import { describe, expect, it } from 'vitest';
import { readChapterDir } from '../../src/cli/files';
import { TUNING_FILE } from '../../src/content/chapter1';
import { movePin, playCard, usePower, withdraw } from '../../src/player/actions';
import { reachOf } from '../../src/player/frontier';
import { TINY_DIR } from '../sim/helpers';
import { driver } from '../helpers/playthrough';
import { inHand } from './helpers';

const chapter = readChapterDir(TINY_DIR);
const cards = chapter.cards as { cards: { id: string; unique: boolean }[] };
const files = {
  chapter: {
    ...chapter,
    cards: { cards: cards.cards.map((x) => ({ ...x, unique: x.id === 'poke' })) },
  },
  tuning: TUNING_FILE,
  pinsets: { sets: {} },
};
const paid = (f: { summary: { paidBy: Record<string, string[]> } }) =>
  Object.values(f.summary.paidBy).some((x) => x.length > 0);

describe('edits (04 §4)', () => {
  it('an edit that pulls the edge back: breaks, reopened facts, pins past the new edge', () => {
    const d = driver(files);
    d.start(3, 3);
    d.player = inHand({ ...d.player, charge: 100 }, 'scare', 'poke');
    d.playTo(7);
    d.act((p, v, c) => usePower(p, v, c, { power: 'glow', place: 'home.room' }));
    const glow = d.player.pins[0]?.id ?? '';
    d.playTo(30);
    // the hero went out under the glow: lured watched and paid by it; story 50 from 26
    const lured = d.player.watched.filter((f) =>
      f.summary.storylets.some((k) => k.startsWith('lured.')),
    );
    expect(lured.length).toBeGreaterThan(0);
    expect(lured.every((f) => f.summary.paidBy[f.summary.storylets[0] ?? '']?.includes(glow))).toBe(
      true,
    );
    expect(reachOf(d.view.frames, 50)).toBe(26);
    expect(d.player.frontier.pastTicks).toBe(4);

    // at the edge (30): an ordinary card, a unique card and a power
    d.act((p, v, c) => playCard(p, v, c, { card: 'scare', target: { place: 'home.room' } }));
    d.act((p, v, c) => playCard(p, v, c, { card: 'poke', target: { cat: 'hero' } }));
    d.act((p, v, c) => usePower(p, v, c, { power: 'gaze', place: 'home.room' }));
    expect(d.player.pins.map((x) => x.tick)).toEqual([7, 30, 30, 30]);
    const [, scare, poke, gaze] = d.player.pins;
    const charge = d.player.charge;
    const paidKeys = d.player.paid;
    const watchedBefore = d.player.watched;

    // the glow two ticks earlier: the beat comes at 6, so the edge is 6 + 4 = 10
    d.scrubTo(5);
    const r = d.act((p, v, c) => movePin(p, v, c, { pin: glow, tick: 5 }));
    const preview = r.preview;
    if (!preview || !r.notice) throw new Error('no preview');
    expect(preview.edge).toBe(10);
    // the preview reports the paid facts that reopen, and the pins that move, before the edit lands
    expect(preview.breaks.length).toBeGreaterThan(0);
    expect(preview.breaks.every(paid)).toBe(true);
    expect(preview.breaks.some((f) => f.tick > 10)).toBe(true); // a paid fact past the new edge
    expect(r.notice.breaks).toEqual(preview.breaks);
    expect(r.notice.moves).toEqual([
      { pin: poke?.id, to: 10 },
      { pin: gaze?.id, to: 10 },
    ]);
    expect(r.notice.alert).toBe(true);
    // every watched fact past the new edge is reopened, without a test
    const past = watchedBefore.filter((f) => f.tick > 10);
    expect(past.length).toBe(19); // ticks 11..29
    for (const f of past) expect(preview.reopened).toContainEqual(f);

    // committed: reopened facts gone (none past the edge), unpaid ones marked, nothing paid back
    expect(d.player.watched.some((f) => f.tick > d.view.edge)).toBe(false);
    for (const f of preview.reopened) expect(d.player.watched).not.toContainEqual(f);
    expect(d.player.marks.changedUnwatched).toEqual(
      [...new Set(preview.reopened.filter((f) => !paid(f)).map((f) => f.tick))].sort(
        (a, b) => a - b,
      ),
    );
    expect(d.player.charge).toBe(charge - 10); // moving the glow cost its price again; no refund
    expect(d.player.paid).toEqual(paidKeys);
    // pins past the new edge: the ordinary card back in the hand, the unique card and the power at the edge
    expect(d.player.pins.find((x) => x.id === scare?.id)).toBeUndefined();
    expect(d.player.cards['scare']?.zone).toBe('hand');
    expect(
      d.player.pins.filter((x) => x.id === poke?.id || x.id === gaze?.id).map((x) => x.tick),
    ).toEqual([10, 10]);
    expect(d.player.playhead).toBe(5);
  });

  it('a paid fact an edit would reopen is a break; committing it pays nothing back', () => {
    const d = driver(files);
    d.start(3, 3);
    d.player = { ...d.player, charge: 100 };
    d.playTo(7);
    d.act((p, v, c) => usePower(p, v, c, { power: 'glow', place: 'home.room' }));
    d.playTo(30);
    const charge = d.player.charge;
    const glow = d.player.pins[0]?.id ?? '';
    // withdrawing the glow: the hero no longer goes out, so every lured fact reopens
    const r = d.act((p, v, c) => withdraw(p, v, c, { pin: glow }));
    expect(r.preview?.breaks.length).toBeGreaterThan(0);
    expect(r.notice?.breaks.every(paid)).toBe(true);
    for (const f of r.preview?.breaks ?? []) expect(d.player.watched).not.toContainEqual(f);
    expect(d.player.charge).toBe(charge); // nothing refunded, nothing paid back
  });
});
