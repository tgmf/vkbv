// The minimum bar of 05 §5.2 (Tagir, 2026-11-25): every card of the demo deck visibly does something.
// A card passes when one of its pins (any branch, its special included, any target), placed at 08:00 on
// the first offline-vetted seed, changes what the player sees within the next three hours: the visible
// ghosts (each cat's place, activity and interrupt at `VISIBLE_PPM` or more) or the events that happen
// at that chance (speech bubbles included) in some frame. Cards on Marti alone may do nothing visible:
// willpower is a teaching beat (03 §8.4).
import { describe, expect, it } from 'vitest';
import vettedSeeds from '../../src/content/data/ch1/vetted-seeds.json';
import { fogSetup } from '../../src/sim/fog';
import { mainStorylets } from '../../src/sim/readers';
import { rerunAll } from '../../src/sim/recompute';
import type { Frame, Pin } from '../../src/sim/types';
import { ch1 } from './helpers';

const SEED = vettedSeeds.seeds[0] ?? 1;
const AT = 140; // 08:00
const WINDOW = 180; // three hours
const VISIBLE_PPM = 100_000; // a ghost or an event at 10% or more is drawn plainly

const setup = fogSetup(ch1, SEED);
const frontier = { story: 0, pastTicks: AT + WINDOW, storylets: mainStorylets(ch1) };
const base = rerunAll(setup, null, { pins: [], watched: [], frontier });

/** What a frame shows plainly: events at the visible chance, each cat's visible ghosts. */
const shown = (f: Frame | undefined): string =>
  JSON.stringify([
    Object.entries(f?.happens ?? {})
      .filter(([, p]) => p >= VISIBLE_PPM)
      .map(([k]) => k)
      .sort(),
    Object.entries(f?.cats ?? {}).map(([id, gs]) => [
      id,
      gs
        .filter((g) => g.p >= VISIBLE_PPM)
        .map((g) => `${g.node}|${g.activity}|${g.interrupt ?? ''}`)
        .sort(),
    ]),
  ]);

/** Every pin a card could be: each branch's targets, then its special, in content order. */
function pinsOf(card: (typeof ch1.cards)[number]): Pin[] {
  const pin = (target: Extract<Pin, { kind: 'card' }>['target'], special = false): Pin => ({
    id: 'probe',
    seq: 1,
    tick: AT,
    kind: 'card',
    card: card.id,
    target,
    special,
  });
  return [
    ...(card.on.cat ? ch1.cats.filter((x) => !card.bound || x.id === card.bound) : []).map((x) =>
      pin({ cat: x.id }),
    ),
    ...(card.on.object ? ch1.objects : []).map((o) => pin({ object: o.id })),
    ...(card.on.place ? ch1.nodes : []).map((n) => pin({ place: n.id })),
    ...(card.special ? [pin({ object: card.special.on }, true)] : []),
  ];
}

/** The first of a card's pins that changes what the player sees, or null. */
function visiblePin(card: (typeof ch1.cards)[number]): Pin | null {
  for (const pin of pinsOf(card)) {
    const r = rerunAll(setup, base, { pins: [pin], watched: [], frontier });
    const end = Math.min(r.result.edge, base.result.edge);
    for (let t = AT + 1; t <= end; t++)
      if (shown(r.result.frames[t]) !== shown(base.result.frames[t])) return pin;
  }
  return null;
}

describe('minimum bar: every demo card visibly does something (05 §5.2)', () => {
  it.each(ch1.cards.filter((x) => x.demo).map((x) => x.id))(
    '%s',
    (id) => {
      const card = ch1.card[id];
      if (!card) throw new Error(`no card ${id}`);
      const pin = visiblePin(card);
      expect(pin, `no pin of ${id} changes what the player sees`).not.toBeNull();
    },
    300_000,
  );
});
