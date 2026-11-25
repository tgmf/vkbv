// The frontier (04 §6): how far the story has been played. It changes only in playback; re-runs and
// scrubbing never touch it. Measured from the last beat, not the clock.
import type { Frame, Frontier, WatchedFact } from '../sim/types';
import { addSorted } from './state';

/** reach: the first tick of the current timeline whose progress reaches the story limit, or null. */
export function reachOf(frames: readonly Frame[], story: number): number | null {
  const i = frames.findIndex((f) => f.progress >= story);
  return i < 0 ? null : i;
}

/**
 * The frontier after a playback advance to tick t (04 §6), `fact` being the watched fact of the tick
 * just played: new story raises the limit and restarts the ticks past it; otherwise the ticks past
 * `reach` can only grow; every storylet the fact shows joins the storylets ever watched.
 */
export function frontierAfter(
  frontier: Frontier,
  frames: readonly Frame[],
  t: number,
  fact: WatchedFact,
): Frontier {
  const progress = frames[t]?.progress ?? 0;
  let { story, pastTicks } = frontier;
  if (progress > story) {
    story = progress;
    pastTicks = 0;
  } else {
    const reach = reachOf(frames, story);
    if (reach !== null && t >= reach) pastTicks = Math.max(pastTicks, t - reach);
  }
  const ids = fact.summary.storylets.map((k) => k.slice(0, k.indexOf('.')));
  return { story, pastTicks, storylets: addSorted(frontier.storylets, ...ids) };
}
