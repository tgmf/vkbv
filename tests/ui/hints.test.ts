// The hints of 06 §7 (M7): each under its own trigger, at most one visible, never twice.
import { describe, expect, it } from 'vitest';
import { TUNING_FILE } from '../../src/content/chapter1';
import { loadTuning } from '../../src/content/load';
import type { Frame } from '../../src/bridge/protocol';
import {
  dismissHint,
  HINTS,
  NO_HINTS,
  othersInView,
  stepHints,
  triggered,
  type HintFacts,
  type HintId,
} from '../../src/ui/hints';

const k = loadTuning(TUNING_FILE).flow;

/** Nothing triggers but `watch` (the day has started). */
const quiet: HintFacts = {
  playing: true,
  playbackMs: 0,
  ticksAfterBack: null,
  inspected: 0,
  hand: 0,
  found: 0,
  sincePinnedOnProtagonist: null,
  playhead: 0,
  atFray: false,
  charge: 0,
  lureCost: 100,
  gazeCost: 40,
  lurePlaced: false,
  watchedStates: new Set(),
  heldWithOther: false,
  endClosed: false,
};

/** For each hint: facts just under its trigger, and just at it. */
const cases: Record<Exclude<HintId, 'watch'>, [Partial<HintFacts>, Partial<HintFacts>]> = {
  ghosts: [{ playbackMs: k.ghostsAfterMs - 1 }, { playbackMs: k.ghostsAfterMs }],
  inspect: [{ ticksAfterBack: k.inspectAfterTicks - 1 }, { ticksAfterBack: k.inspectAfterTicks }],
  card: [
    { hand: 0, found: 1 },
    { hand: 1, found: 1 },
  ],
  barely: [
    { sincePinnedOnProtagonist: k.barelyAfterMs - 1 },
    { sincePinnedOnProtagonist: k.barelyAfterMs },
  ],
  scroll: [
    { found: k.scrollCards - 1, playhead: k.scrollAfterTick },
    { found: k.scrollCards - 1, playhead: k.scrollAfterTick + 1 },
  ],
  fray: [{ atFray: false }, { atFray: true }],
  power: [{ charge: 99 }, { charge: 100 }],
  notready: [
    { watchedStates: new Set(['door_lure.at_door']) },
    { watchedStates: new Set(k.notreadyOn) },
  ],
  morning: [
    { watchedStates: new Set(['usual_route.leaving']) },
    { watchedStates: new Set([k.morningOn[1] ?? '']) },
  ],
  others: [{ heldWithOther: false }, { heldWithOther: true }],
  gaze: [
    { charge: 40, lurePlaced: false },
    { charge: 40, lurePlaced: true },
  ],
  sandbox: [{ endClosed: false }, { endClosed: true }],
};

describe('hint triggers (06 §7)', () => {
  it('none before the day starts; `watch` as soon as it has', () => {
    expect(triggered({ ...quiet, playing: false, atFray: true }, k)).toEqual([]);
    expect(triggered(quiet, k)).toEqual(['watch']);
  });

  for (const [id, [under, at]] of Object.entries(cases))
    it(`${id} shows under its own trigger only`, () => {
      expect(triggered({ ...quiet, ...under }, k)).toEqual(['watch']);
      expect(triggered({ ...quiet, ...at }, k)).toEqual(['watch', id]);
    });

  it('inspect: only while nothing has been inspected', () => {
    const f = { ...quiet, ticksAfterBack: k.inspectAfterTicks };
    expect(triggered({ ...f, inspected: 1 }, k)).toEqual(['watch']);
  });

  it('scroll: or three cards found', () => {
    expect(triggered({ ...quiet, found: k.scrollCards }, k)).toEqual(['watch', 'scroll']);
  });

  it('every hint of 06 §7 has a trigger', () => {
    expect(['watch', ...Object.keys(cases)].sort()).toEqual([...HINTS].sort());
  });
});

describe('one at a time, once per playthrough', () => {
  it('shows one, queues the rest, never shows a hint twice', () => {
    let s = NO_HINTS;
    let seen: string[] = [];
    const step = (fired: HintId[], now: number) => {
      ({ state: s, seen } = stepHints(s, seen, fired, now, 1000));
    };
    step(['watch', 'card'], 0);
    expect(s.visible?.id).toBe('watch');
    expect(seen).toEqual(['watch']);
    step(['watch', 'card', 'fray'], 500); // still visible; nothing new joins twice
    expect([s.visible?.id, s.queue]).toEqual(['watch', ['card', 'fray']]);
    step(['watch', 'card', 'fray'], 1000); // time is up: the next one shows
    expect([s.visible?.id, s.queue]).toEqual(['card', ['fray']]);
    s = dismissHint(s); // dismissed: the next one shows at once
    step([], 1001);
    expect([s.visible?.id, s.queue]).toEqual(['fray', []]);
    s = dismissHint(s);
    step(['watch', 'card', 'fray'], 2000); // their triggers still hold, but each was seen
    expect([s.visible, s.queue, seen]).toEqual([null, [], ['card', 'fray', 'watch']]);
  });

  it('a hint seen in an earlier session (a reload) never shows again', () => {
    const { state } = stepHints(NO_HINTS, ['watch'], ['watch'], 0, 1000);
    expect(state).toEqual(NO_HINTS);
  });
});

describe('others: a revealed cat in view, by one roll', () => {
  const frame = {
    lanterns: [{ cat: 'marti', rangeMm: 10_000, seen: ['town.a', 'town.b'] }],
    cats: {
      marti: [{ node: 'town.a', pos: [0, 0], activity: 'walk', interrupt: null, p: 1_000_000 }],
      semyon: [
        { node: 'town.b', pos: [0, 0], activity: 'work', interrupt: null, p: 300_000 },
        { node: 'town.c', pos: [9, 9], activity: 'work', interrupt: null, p: 700_000 },
      ],
    },
  } as unknown as Frame;

  it('rolls against the chance of standing where the lantern reaches a revealed place', () => {
    const revealed = ['town.a', 'town.b'];
    expect(othersInView(frame, ['marti'], revealed, () => 299_999)).toBe(true);
    expect(othersInView(frame, ['marti'], revealed, () => 300_000)).toBe(false);
    expect(othersInView(frame, ['marti'], ['town.a'], () => 0)).toBe(false); // not revealed
    expect(othersInView(frame, ['marti', 'semyon'], revealed, () => 0)).toBe(false); // protagonist
  });
});
