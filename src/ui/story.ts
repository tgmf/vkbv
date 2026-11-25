// What the timeline's story track shows (06 §3): a dot at the tick of each watched storylet state or
// detector that has a payout or a text line; the anchor, once watched, a lightning mark. Unwatched
// story is never shown. Shared by the timeline and edit feedback (06 §6).
import type { WatchedFact } from '../bridge/protocol';
import type { Content } from '../content/schemas/content';

export interface StoryDot {
  t: number;
  anchor: boolean;
}

export function storyDots(c: Content, watched: readonly WatchedFact[]): StoryDot[] {
  const payouts = c.economy.payouts;
  const dots: StoryDot[] = [];
  for (const f of watched) {
    const shown =
      f.summary.storylets.some((s) => {
        const [id, state] = s.split('.');
        const def = c.storylet[id ?? ''];
        return (
          payouts.storyletState[s] !== undefined ||
          (state !== undefined && def?.states[state]?.textKey !== undefined)
        );
      }) || f.summary.detectors.some((d) => payouts.detector[d] !== undefined);
    const anchor = f.summary.factsSet.includes(c.anchor.id);
    if (shown || anchor) dots.push({ t: f.tick, anchor });
  }
  return dots;
}
