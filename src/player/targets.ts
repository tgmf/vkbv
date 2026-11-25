// What a held card or power can do (06 §3–§5), as rules the UI asks: which targets are valid now, why
// something cannot be held, whether a play needs the special's confirm step, the presence strip, and how
// a pin on the timeline fired. The UI computes none of this itself (06 §12).
import type { Content } from '../content/schemas/content';
import { PPM } from '../sim/math';
import type { CardId, CatId, NodeId, ObjectId, Pin, PowerId } from '../sim/types';
import { cardRefusal, isSpecial, powerRefusal, type Refusal, type Target } from './actions';
import type { PlayerState, PlayerView } from './state';

/** A card or power the player holds. */
export type Held = { card: CardId } | { power: PowerId };

/** The valid targets of a held card or power at the playhead (06 §4: ringed; everything else dims). */
export interface Targets {
  cats: CatId[];
  objects: ObjectId[];
  places: NodeId[];
}

/** Why a card or power cannot be held now, or null (06 §5: a power button disabled with the reason). */
export function holdRefusal(
  p: PlayerState,
  view: PlayerView,
  c: Content,
  held: Held,
): Refusal | null {
  if ('power' in held) return powerRefusal(p, view, c, held.power, null);
  if (p.cards[held.card]?.zone !== 'hand') return 'cardNotInHand';
  return p.playhead > view.edge ? 'pastEdge' : null;
}

/** Why the held card or power cannot go on a target now, or null when it can. */
export function heldRefusal(
  p: PlayerState,
  view: PlayerView,
  c: Content,
  held: Held,
  target: Target,
): Refusal | null {
  if ('card' in held) return cardRefusal(p, view, c, held.card, target);
  if (!('place' in target)) return 'noBranch'; // powers target places (05: powers.json `targets`)
  return powerRefusal(p, view, c, held.power, target.place);
}

/** Every valid target of a held card or power, in content order. */
export function targetsOf(p: PlayerState, view: PlayerView, c: Content, held: Held): Targets {
  const ok = (target: Target) => heldRefusal(p, view, c, held, target) === null;
  return {
    cats: c.cats.map((x) => x.id).filter((cat) => ok({ cat })),
    objects: c.objects.map((x) => x.id).filter((object) => ok({ object })),
    places: c.nodes.map((x) => x.id).filter((place) => ok({ place })),
  };
}

/** Whether pinning a held card on a target is its special, which needs the confirm step (06 §6). */
export const needsConfirm = (p: PlayerState, c: Content, held: Held, target: Target): boolean =>
  'card' in held && isSpecial(p, c, held.card, target);

/** The kinds of target a card can go on (06 §4: the card's target hint). */
export function targetKinds(c: Content, card: CardId): ('cat' | 'object' | 'place')[] {
  const def = c.card[card];
  if (!def) return [];
  const out: ('cat' | 'object' | 'place')[] = [];
  if (def.on.cat) out.push('cat');
  if (def.on.object || def.special) out.push('object');
  if (def.on.place) out.push('place');
  return out;
}

/** The cats a held card or power can act on at a place (docs/questions.md M6-4). */
function actable(c: Content, held: Held): CatId[] {
  if ('card' in held) {
    const def = c.card[held.card];
    if (!def?.on.cat) return c.cats.map((x) => x.id);
    return c.cats.map((x) => x.id).filter((id) => def.bound === null || def.bound === id);
  }
  const affects = c.power[held.power]?.affects;
  return c.cats
    .filter(
      (x) =>
        !affects ||
        affects.kinds.includes(x.kind) ||
        (affects.orTemperatureTenthsGte !== undefined &&
          x.temperatureTenths >= affects.orTemperatureTenthsGte),
    )
    .map((x) => x.id);
}

/**
 * The presence strip (06 §3, docs/questions.md M6-4): for every tick up to the edge, in ppm, how likely
 * a valid target of the held card or power is at the spot under the pointer. A place: at least one cat
 * the held thing can act on stands there (cats independent). A cat: it stands at a revealed place, if
 * the held card can go on it. An object: it is visible, if the held card can go on it.
 */
export function presence(
  p: PlayerState,
  view: PlayerView,
  c: Content,
  held: Held,
  spot: Target,
): number[] {
  const out: number[] = [];
  const cats = actable(c, held);
  const card = 'card' in held ? c.card[held.card] : undefined;
  for (let t = 0; t <= view.edge; t++) {
    const f = view.frames[t];
    if (!f) {
      out.push(0);
      continue;
    }
    if ('place' in spot) {
      let none = PPM; // P(no actable cat there), in ppm
      for (const id of cats) {
        const here = (f.cats[id] ?? []).reduce((a, g) => a + (g.node === spot.place ? g.p : 0), 0);
        none = Math.trunc((none * (PPM - Math.min(PPM, here))) / PPM);
      }
      out.push(PPM - none);
    } else if ('cat' in spot) {
      const ok = card?.on.cat && (card.bound === null || card.bound === spot.cat);
      const ghosts = f.cats[spot.cat] ?? [];
      const at = ghosts.reduce((a, g) => a + (p.revealed.includes(g.node) ? g.p : 0), 0);
      out.push(ok ? Math.min(PPM, at) : 0);
    } else {
      const o = c.object[spot.object];
      const ok = card && (card.on.object || card.special?.on === spot.object);
      out.push(ok && o ? (o.visibleWhen ? (f.visible[spot.object] ?? 0) : PPM) : 0);
    }
  }
  return out;
}

/** Why a pin fizzled (03 §11), read from the pin and the content. */
export type FizzleReason = 'noBranch' | 'wrongCat' | 'hidden';

/** How a pin on the timeline fired (06 §3): hollow, half-filled or full. */
export interface PinStatus {
  /** P(it fizzled at its own tick), ppm; null while no frame after its tick has arrived. */
  fizzled: number | null;
  reason: FizzleReason | null;
  /** The first tick after its own by which it has surely fired, when it fizzled first. */
  firesAt: number | null;
}

/** Why a pin would fizzle (03 §11), the same checks in the same order as the simulation's. */
function reasonOf(c: Content, pin: Pin): FizzleReason {
  if (pin.kind === 'power') return 'noBranch';
  const card = c.card[pin.card];
  const tg = pin.target;
  if ('cat' in tg)
    return card?.on.cat && card.bound !== null && card.bound !== tg.cat ? 'wrongCat' : 'noBranch';
  if ('place' in tg) return 'noBranch';
  return c.object[tg.object]?.visibleWhen ? 'hidden' : 'noBranch';
}

/** A pin's status from the frames after its tick (`Frame.pins`, 03 §16). */
export function pinStatus(view: PlayerView, c: Content, pin: Pin): PinStatus {
  let fizzled: number | null = null;
  let firesAt: number | null = null;
  for (let t = pin.tick + 1; t <= view.edge; t++) {
    const fired = view.frames[t]?.pins[pin.id];
    if (fired === undefined) continue;
    if (fizzled === null) fizzled = PPM - fired;
    if (fizzled === 0) break;
    if (fired >= PPM) {
      firesAt = t;
      break;
    }
  }
  return { fizzled, reason: fizzled ? reasonOf(c, pin) : null, firesAt };
}
