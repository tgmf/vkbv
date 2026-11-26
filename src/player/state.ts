// The player's state (04 §1): everything that is saved. The player exists outside time: scrolling never
// changes the hand, the charge, the journal, the revealed map or the frontier.
import type { Content } from '../content/schemas/content';
import type {
  CardId,
  CatId,
  Frame,
  Frontier,
  NodeId,
  ObjectId,
  Pin,
  PinId,
  RecomputeResult,
  WatchedFact,
} from '../sim/types';
import { followedCats } from '../sim/readers';

export type CardZone = 'unfound' | 'hand' | 'pinned' | 'spent' | 'draw' | 'discard';

export interface PlayerState {
  v: 2;
  seedRequested: number;
  seed: number; // after seed vetting (04 §2)
  pins: Pin[]; // the log, sorted by (tick, seq)
  nextSeq: number;
  cards: Record<CardId, { zone: CardZone; pin?: PinId }>;
  drawPile: CardId[]; // order of the cards in zone 'draw' (rule 'discard' only)
  reshuffles: number;
  specialsUsed: CardId[]; // once per playthrough
  charge: number;
  paid: string[]; // payout keys already paid (04 §7), sorted
  watched: WatchedFact[]; // sorted by (tick, cat)
  followed: CatId[];
  revealed: NodeId[]; // sorted
  journal: { hooks: string[]; stories: ObjectId[] };
  frontier: Frontier;
  anchorWatched: boolean;
  playhead: number; // always 0..lanternEdge
  marks: { changedUnwatched: number[] }; // ticks of watched, unpaid facts that reopened
  seen: string[]; // shown once per playthrough: the hints, 'teaser', 'end' (06 §7, §9), sorted
}

/** What the player layer reads of the latest re-run result, as the UI holds it (04 §1). */
export type PlayerView = Pick<RecomputeResult, 'frames' | 'edge' | 'end' | 'gazeFacts'>;

/** What a payout gave, for the UI to animate (04 §7). */
export interface Reward {
  key: string;
  charge?: number;
  cards?: CardId[];
  revealed?: NodeId[];
  hook?: string;
}

/**
 * A new game (04 §1): every card unfound, the starting charge, the regions revealed at start, Marti
 * followed, the playhead and the frontier at 0 (so the lantern edge is 0). The seed is chosen and
 * vetted outside `src/player`.
 */
export function newGame(c: Content, seedRequested: number, seed: number): PlayerState {
  const cards: PlayerState['cards'] = {};
  for (const card of c.cards) cards[card.id] = { zone: 'unfound' };
  const open = c.regions.filter((r) => r.revealedAtStart).map((r) => r.id);
  return {
    v: 2,
    seedRequested,
    seed,
    pins: [],
    nextSeq: 1,
    cards,
    drawPile: [],
    reshuffles: 0,
    specialsUsed: [],
    charge: c.economy.charge.start,
    paid: [],
    watched: [],
    followed: followedCats(c),
    revealed: c.nodes
      .filter((n) => open.includes(n.region))
      .map((n) => n.id)
      .sort(),
    journal: { hooks: [], stories: [] },
    frontier: { story: 0, pastTicks: 0, storylets: [] },
    anchorWatched: false,
    playhead: 0,
    marks: { changedUnwatched: [] },
    seen: [],
  };
}

/** The frame at the playhead, if the view holds one. */
export const frameAt = (view: PlayerView, tick: number): Frame | undefined => view.frames[tick];

/** Inserts into a sorted list of strings or numbers, without duplicates. */
export function addSorted<T extends string | number>(list: readonly T[], ...xs: T[]): T[] {
  const out = [...list];
  for (const x of xs) if (!out.includes(x)) out.push(x);
  return out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Pins in log order (tick, seq). */
export const byLog = (pins: readonly Pin[]): Pin[] =>
  [...pins].sort((a, b) => a.tick - b.tick || a.seq - b.seq);
