// Player actions (04 §1, §3–§8): pure functions `(player, view, content, args) -> { player, error? }`.
// `view` is the latest re-run result the UI holds. An action never mutates its input; one that changes
// `pins` is an edit, which the UI sends to the worker as a preview (04 §4). A refused action returns
// the player unchanged and the reason.
import type { Content } from '../content/schemas/content';
import { followedCats } from '../sim/readers';
import type {
  CardId,
  CatId,
  NodeId,
  ObjectId,
  Pin,
  PinId,
  PowerId,
  RecomputeResult,
  WatchedFact,
} from '../sim/types';
import { frontierAfter } from './frontier';
import { reward } from './rewards';
import {
  addSorted,
  byLog,
  frameAt,
  type CardZone,
  type PlayerState,
  type PlayerView,
  type Reward,
} from './state';

export type Refusal =
  | 'cardNotInHand'
  | 'placeNotRevealed'
  | 'objectHidden'
  | 'catNowhereRevealed'
  | 'wrongCat'
  | 'noBranch'
  | 'pastEdge'
  | 'chargeShort'
  | 'unique'
  | 'specialUsed'
  | 'notAvailable'
  | 'notFollowable'
  | 'noPin'
  | 'notAtPlayhead';

export interface ActionResult {
  player: PlayerState;
  error?: Refusal;
  rewards?: Reward[];
}

export type Target = { cat: CatId } | { object: ObjectId } | { place: NodeId };

const no = (player: PlayerState, error: Refusal): ActionResult => ({ player, error });

/** P(visible) of an object at a tick: its frame's chance, certain without `visibleWhen`. */
function visibleAt(c: Content, view: PlayerView, tick: number, id: ObjectId): number {
  const o = c.object[id];
  if (!o) return 0;
  if (!o.visibleWhen) return 1_000_000;
  return frameAt(view, tick)?.visible[id] ?? 0;
}

/** Checks an object can be looked at or played on now: its place revealed, it visible (04 §3.1, §8). */
function objectRefusal(c: Content, p: PlayerState, view: PlayerView, id: ObjectId): Refusal | null {
  const o = c.object[id];
  if (!o || !p.revealed.includes(o.node)) return 'placeNotRevealed';
  if (visibleAt(c, view, p.playhead, id) <= 0) return 'objectHidden';
  return null;
}

/** Pins at the playhead get the next sequence number; the log stays sorted. */
const withPin = (p: PlayerState, make: (id: PinId, seq: number) => Pin): PlayerState => {
  const seq = p.nextSeq;
  const pin = make(`pin${seq}`, seq);
  return { ...p, pins: byLog([...p.pins, pin]), nextSeq: seq + 1 };
};

/** Inspect an object (04 §8): the first time, its story joins the journal and its card the hand. */
export function inspect(
  p: PlayerState,
  view: PlayerView,
  c: Content,
  { object }: { object: ObjectId },
): ActionResult {
  const refused = objectRefusal(c, p, view, object);
  if (refused) return no(p, refused);
  const key = `inspect:${object}`;
  if (p.paid.includes(key)) return { player: p, rewards: [] };
  const card = c.object[object]?.grantsCard;
  const gives = card !== undefined && p.cards[card]?.zone === 'unfound';
  const player: PlayerState = {
    ...p,
    paid: addSorted(p.paid, key),
    journal: { ...p.journal, stories: [...p.journal.stories, object] },
    cards: gives ? { ...p.cards, [card]: { zone: 'hand' } } : p.cards,
  };
  return { player, rewards: [{ key, ...(gives && { cards: [card] }) }] };
}

/**
 * Play a card at the playhead (04 §3.1). On the card's own source object, the first time, the pin is
 * the special (the UI has shown its confirm step). Where the card goes depends on the played-card
 * rule; a unique card is spent under every rule.
 */
export function playCard(
  p: PlayerState,
  view: PlayerView,
  c: Content,
  { card, target }: { card: CardId; target: Target },
): ActionResult {
  const def = c.card[card];
  if (!def || p.cards[card]?.zone !== 'hand') return no(p, 'cardNotInHand');
  if (p.playhead > view.edge) return no(p, 'pastEdge');
  const onSource = 'object' in target && def.special?.on === target.object;
  const special = onSource && !p.specialsUsed.includes(card);
  const branch = 'cat' in target ? def.on.cat : 'object' in target ? def.on.object : def.on.place;
  if (!branch && !special) return no(p, onSource ? 'specialUsed' : 'noBranch');
  if ('place' in target && !p.revealed.includes(target.place)) return no(p, 'placeNotRevealed');
  if ('object' in target) {
    const refused = objectRefusal(c, p, view, target.object);
    if (refused) return no(p, refused);
  }
  if ('cat' in target) {
    if (def.bound !== null && def.bound !== target.cat) return no(p, 'wrongCat');
    const ghosts = frameAt(view, p.playhead)?.cats[target.cat] ?? [];
    if (!ghosts.some((g) => g.p > 0 && p.revealed.includes(g.node)))
      return no(p, 'catNowhereRevealed');
  }
  const rule = c.tuning.player.playedCardRule;
  const zone: CardZone = def.unique ? 'spent' : rule;
  let player = withPin(p, (id, seq) => ({
    id,
    seq,
    tick: p.playhead,
    kind: 'card',
    card,
    target,
    special,
  }));
  const pin = player.pins.find((x) => x.seq === p.nextSeq)?.id;
  player = {
    ...player,
    cards: { ...player.cards, [card]: zone === 'pinned' && pin ? { zone, pin } : { zone } },
    specialsUsed: special ? addSorted(player.specialsUsed, card) : player.specialsUsed,
  };
  return { player };
}

/** Place a power at the playhead (04 §3.2): paid now, never refunded. */
export function usePower(
  p: PlayerState,
  view: PlayerView,
  c: Content,
  { power, place }: { power: PowerId; place: NodeId },
): ActionResult {
  const def = c.power[power];
  if (!def) return no(p, 'notAvailable');
  if (p.playhead > view.edge) return no(p, 'pastEdge');
  if (!p.revealed.includes(place)) return no(p, 'placeNotRevealed');
  if (!(frameAt(view, p.playhead)?.powers.includes(power) ?? false)) return no(p, 'notAvailable');
  if (p.charge < def.cost) return no(p, 'chargeShort');
  const player = withPin({ ...p, charge: p.charge - def.cost }, (id, seq) => ({
    id,
    seq,
    tick: p.playhead,
    kind: 'power',
    power,
    place,
  }));
  return { player };
}

/** Take a pin off the timeline (04 §3.3): an ordinary card returns to the hand under rule `pinned`. */
export function withdraw(
  p: PlayerState,
  _view: PlayerView,
  c: Content,
  { pin }: { pin: PinId },
): ActionResult {
  const x = p.pins.find((y) => y.id === pin);
  if (!x) return no(p, 'noPin');
  if (x.kind === 'card' && c.card[x.card]?.unique) return no(p, 'unique');
  const pins = p.pins.filter((y) => y.id !== pin);
  if (x.kind === 'power') return { player: { ...p, pins } }; // charge is never refunded
  const held = p.cards[x.card];
  const back = held?.zone === 'pinned' && held.pin === pin;
  return {
    player: { ...p, pins, cards: back ? { ...p.cards, [x.card]: { zone: 'hand' } } : p.cards },
  };
}

/** Move a pin to another tick up to the edge (04 §3.3): free for cards, the full cost again for powers. */
export function movePin(
  p: PlayerState,
  view: PlayerView,
  c: Content,
  { pin, tick }: { pin: PinId; tick: number },
): ActionResult {
  const x = p.pins.find((y) => y.id === pin);
  if (!x) return no(p, 'noPin');
  if (tick < 0 || tick > view.edge) return no(p, 'pastEdge');
  if (x.kind === 'card' && c.card[x.card]?.unique) return no(p, 'unique');
  let charge = p.charge;
  if (x.kind === 'power') {
    const cost = c.power[x.power]?.cost ?? 0;
    if (charge < cost) return no(p, 'chargeShort');
    charge -= cost;
  }
  const pins = byLog(p.pins.map((y) => (y.id === pin ? { ...y, tick } : y)));
  return { player: { ...p, pins, charge } };
}

/** Follow a protagonist (04 §5): the demo follows Marti only; every other cat is refused. */
export function follow(
  p: PlayerState,
  _view: PlayerView,
  c: Content,
  { cat }: { cat: CatId },
): ActionResult {
  if (!followedCats(c).includes(cat)) return no(p, 'notFollowable');
  return { player: { ...p, followed: [cat] } };
}

/** Scrub: move the playhead within 0..edge (04 §6). Observes nothing, changes nothing else. */
export function setPlayhead(
  p: PlayerState,
  view: PlayerView,
  _c: Content,
  { tick }: { tick: number },
): ActionResult {
  if (tick < 0 || tick > view.edge) return no(p, 'pastEdge');
  return { player: { ...p, playhead: tick } };
}

const sameFact = (a: WatchedFact, b: WatchedFact): boolean => a.tick === b.tick && a.cat === b.cat;

/**
 * Playback from the playhead t to t + 1 (04 §7): `fact` is the worker's watched fact of t (none when
 * `watched` already holds one). A new fact is recorded and pays; the frontier moves (04 §6); a tick
 * marked changed-unwatched is cleared once watched again.
 */
export function advance(
  p: PlayerState,
  view: PlayerView,
  c: Content,
  { fact }: { fact: WatchedFact | null },
): ActionResult {
  const t = p.playhead;
  if (t + 1 > view.edge) return no(p, 'pastEdge');
  if (fact && (fact.tick !== t || !p.followed.includes(fact.cat))) return no(p, 'notAtPlayhead');
  let player: PlayerState = { ...p, playhead: t + 1 };
  if (!fact || p.watched.some((f) => sameFact(f, fact))) return { player, rewards: [] };
  const watched = [...p.watched, fact].sort(
    (a, b) => a.tick - b.tick || (a.cat < b.cat ? -1 : a.cat > b.cat ? 1 : 0),
  );
  player = {
    ...player,
    watched,
    frontier: frontierAfter(p.frontier, view.frames, t + 1, fact),
    marks: { changedUnwatched: p.marks.changedUnwatched.filter((x) => x !== t) },
  };
  const r = reward(c, player, fact);
  return { player: r.player, rewards: r.rewards };
}

const factKey = (f: WatchedFact): string => `${f.tick}|${f.cat}|${f.digest}`;
const isPaid = (f: WatchedFact): boolean =>
  Object.values(f.summary.paidBy).some((ids) => ids.length > 0);

/** What the break alert lists before an edit lands (04 §4, 06 §6). */
export interface PreviewNotice {
  breaks: WatchedFact[]; // paid watched facts that would reopen
  moves: { pin: PinId; to: number }[]; // unique and power pins the new edge would move
  alert: boolean; // whether the edit waits for Confirm or Cancel
}

/** The break alert of a preview (04 §4): paid facts that would reopen, and pins that would move. */
export function previewNotice(p: PlayerState, c: Content, result: RecomputeResult): PreviewNotice {
  const moves = p.pins
    .filter((x) => x.tick > result.edge && (x.kind === 'power' || c.card[x.card]?.unique))
    .map((x) => ({ pin: x.id, to: result.edge }));
  return { breaks: result.breaks, moves, alert: result.breaks.length > 0 || moves.length > 0 };
}

/**
 * Commit a previewed edit (04 §4): reopened facts leave `watched` (the unpaid ones' ticks are marked);
 * pins past the new edge leave that stretch: an ordinary card returns to the hand (any rule), a unique
 * card's pin and a power pin move to the edge at no cost; the playhead stays within the edge. Payouts
 * stay paid, and the frontier is unchanged.
 */
export function applyPreview(
  p: PlayerState,
  _view: PlayerView,
  c: Content,
  { result }: { result: RecomputeResult },
): ActionResult {
  const edge = result.edge;
  const gone = result.reopened.map(factKey);
  const unpaid = result.reopened.filter((f) => !isPaid(f)).map((f) => f.tick);
  const cards = { ...p.cards };
  const pins: Pin[] = [];
  for (const x of p.pins) {
    if (x.tick <= edge) pins.push(x);
    else if (x.kind === 'power' || c.card[x.card]?.unique) pins.push({ ...x, tick: edge });
    else cards[x.card] = { zone: 'hand' };
  }
  return {
    player: {
      ...p,
      pins: byLog(pins),
      cards,
      watched: p.watched.filter((f) => !gone.includes(factKey(f))),
      marks: { changedUnwatched: addSorted(p.marks.changedUnwatched, ...unpaid) },
      playhead: Math.min(p.playhead, edge),
    },
  };
}
