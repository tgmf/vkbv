// The shuttle (04 §6, 06 §3): how the playhead may move, as pure rules the UI asks. Forward at up to
// `player.observeMaxTps` is playback and watches each tick; faster forward behind the lantern edge, and
// backward at any speed, is scrubbing and watches nothing; at the edge forward is always live playback,
// capped at `player.observeMaxTps`. The timeline can be clicked only at or before the playhead.
import type { Content } from '../content/schemas/content';
import type { RecomputeResult } from '../sim/types';

/** The shuttle's state: paused, or running one way at `player.shuttleTps[speed]`. */
export type Shuttle = { dir: 'pause' } | { dir: 'fwd' | 'back'; speed: number };

export type ShuttleKey = 'fwd' | 'back' | 'pause' | 'play';

export const PAUSED: Shuttle = { dir: 'pause' };

/**
 * A press (06 §3, §8): forward (L) or back (J) steps up one speed that way, starting again at the
 * first from the other direction or from pause; K pauses; Space plays at the first speed, or pauses.
 */
export function press(c: Content, s: Shuttle, key: ShuttleKey): Shuttle {
  const top = c.tuning.player.shuttleTps.length - 1;
  switch (key) {
    case 'pause':
      return PAUSED;
    case 'play':
      return s.dir === 'pause' ? { dir: 'fwd', speed: 0 } : PAUSED;
    case 'fwd':
    case 'back':
      return s.dir === key ? { dir: key, speed: Math.min(s.speed + 1, top) } : { dir: key, speed: 0 };
    default: {
      const never: never = key;
      throw new Error(`unknown key ${String(never)}`);
    }
  }
}

/** Ticks per real second the shuttle asks for, before the cap at the edge; 0 when paused. */
export const shuttleTps = (c: Content, s: Shuttle): number =>
  s.dir === 'pause' ? 0 : (c.tuning.player.shuttleTps[s.speed] ?? 0);

/**
 * Moving forward from tick t: whether it watches (playback, `observe`) or scrubs, and its rate.
 * Behind the edge a speed above `player.observeMaxTps` scrubs; at the edge it is live playback at
 * most `player.observeMaxTps`.
 */
export function forward(
  c: Content,
  s: Shuttle,
  t: number,
  edge: number,
): { watch: boolean; tps: number } {
  const tps = shuttleTps(c, s);
  const max = c.tuning.player.observeMaxTps;
  if (s.dir !== 'fwd') return { watch: false, tps: 0 };
  if (t >= edge) return { watch: true, tps: Math.min(tps, max) };
  return { watch: tps <= max, tps };
}

/**
 * The furthest tick forward movement may reach now: while a re-run streams, the last tick that has
 * arrived (02 §3); otherwise one past the edge while live playback can extend it (the timeline has
 * not ended), else the edge.
 */
export function forwardLimit(
  edge: number,
  end: RecomputeResult['end'],
  streamedUpTo: number | null,
): number {
  if (streamedUpTo !== null) return Math.min(streamedUpTo, edge);
  return end.kind === 'limit' ? edge + 1 : edge;
}

/** Whether a click or drag on the timeline may move the playhead to `tick` (06 §3). */
export const clickable = (playhead: number, tick: number): boolean => tick >= 0 && tick <= playhead;
