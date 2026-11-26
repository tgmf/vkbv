// Teaching without a tutorial (06 §7): when each hint shows, as pure functions over what the controller
// gathers. At most one hint is visible; each shows once per playthrough (its id joins `PlayerState.seen`
// when it appears); a hint triggered while another is visible waits its turn. Hints are presentation:
// they decide no game rule. Timings and the storylet states they watch are knobs (`tuning.flow`).
import type { Frame } from '../bridge/protocol';
import type { Tuning } from '../content/schemas/tuning';

export const HINTS = [
  'watch',
  'ghosts',
  'inspect',
  'card',
  'barely',
  'scroll',
  'fray',
  'power',
  'notready',
  'morning',
  'others',
  'gaze',
  'sandbox',
] as const;
export type HintId = (typeof HINTS)[number];

/** What the triggers read. */
export interface HintFacts {
  /** The day has started: the teaser is over and the first re-run has arrived. */
  playing: boolean;
  /** Real milliseconds of playback so far. */
  playbackMs: number;
  /** Ticks the playhead moved forward since the player first scrolled back; null before that. */
  ticksAfterBack: number | null;
  /** Objects inspected so far. */
  inspected: number;
  /** Cards in the hand now, and cards found so far (any zone but `unfound`). */
  hand: number;
  found: number;
  /** Real milliseconds since the first card landed on a protagonist; null before that. */
  sincePinnedOnProtagonist: number | null;
  playhead: number;
  /** The playhead stands at a fray. */
  atFray: boolean;
  charge: number;
  lureCost: number;
  gazeCost: number;
  /** A lure has been placed in this playthrough. */
  lurePlaced: boolean;
  /** Every `storylet.state` watched so far. */
  watchedStates: ReadonlySet<string>;
  /** A card is held while a revealed non-protagonist cat is in view (`othersInView`). */
  heldWithOther: boolean;
  /** The end screen was closed. */
  endClosed: boolean;
}

/** Every hint whose trigger holds now, in table order (06 §7). */
export function triggered(f: HintFacts, k: Tuning['flow']): HintId[] {
  if (!f.playing) return [];
  const watched = (states: readonly string[]) => states.some((s) => f.watchedStates.has(s));
  const holds: Record<HintId, boolean> = {
    watch: true,
    ghosts: f.playbackMs >= k.ghostsAfterMs,
    inspect:
      f.ticksAfterBack !== null && f.ticksAfterBack >= k.inspectAfterTicks && f.inspected === 0,
    card: f.hand > 0,
    barely: f.sincePinnedOnProtagonist !== null && f.sincePinnedOnProtagonist >= k.barelyAfterMs,
    scroll: f.found >= k.scrollCards || f.playhead > k.scrollAfterTick,
    fray: f.atFray,
    power: f.charge >= f.lureCost,
    notready: watched(k.notreadyOn),
    morning: watched(k.morningOn),
    others: f.heldWithOther,
    gaze: f.lurePlaced && f.charge >= f.gazeCost,
    sandbox: f.endClosed,
  };
  return HINTS.filter((id) => holds[id]);
}

export interface HintState {
  /** Triggered, not yet shown, in the order they triggered. */
  queue: HintId[];
  visible: { id: HintId; until: number } | null;
}

export const NO_HINTS: HintState = { queue: [], visible: null };

/**
 * One update: newly triggered hints join the queue (never one already seen or waiting), the visible one
 * goes once its time is up, and the next waiting one shows and joins `seen`.
 */
export function stepHints(
  s: HintState,
  seen: readonly string[],
  fired: readonly HintId[],
  nowMs: number,
  hintMs: number,
): { state: HintState; seen: string[] } {
  const queue = [
    ...s.queue,
    ...fired.filter((id) => !seen.includes(id) && !s.queue.includes(id) && s.visible?.id !== id),
  ];
  let visible = s.visible && s.visible.until > nowMs ? s.visible : null;
  let nextSeen = [...seen];
  if (!visible && queue.length > 0) {
    const id = queue.shift() as HintId;
    visible = { id, until: nowMs + hintMs };
    nextSeen = [...seen, id].sort();
  }
  return { state: { queue, visible }, seen: nextSeen };
}

/** Dismissing the visible hint. */
export const dismissHint = (s: HintState): HintState => ({ ...s, visible: null });

/**
 * The `others` hint: is a revealed cat other than the protagonists in view? A cat is somewhere with a
 * probability; where the lantern reaches a revealed place, one roll against the cat's chance of standing
 * there says whether it is (Tagir, M7). `roll` gives numbers in [0, 1 000 000).
 */
export function othersInView(
  frame: Frame,
  protagonists: readonly string[],
  revealed: readonly string[],
  roll: () => number,
): boolean {
  const reached = new Set(
    frame.lanterns.flatMap((l) => l.seen).filter((n) => revealed.includes(n)),
  );
  for (const [cat, ghosts] of Object.entries(frame.cats)) {
    if (protagonists.includes(cat)) continue;
    const p = ghosts.filter((g) => reached.has(g.node)).reduce((a, g) => a + g.p, 0);
    if (p > 0 && roll() < p) return true;
  }
  return false;
}
