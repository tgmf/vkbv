// The frontier and the lantern edge in play (04 §6), through the worker's host: a new game's edge is 0;
// live playback extends the edge and keeps it equal to the frontier limit; playback moves the frontier,
// scrubbing and re-runs never do; an edit that delays the beat keeps it reachable.
import { describe, expect, it } from 'vitest';
import { readChapterDir } from '../../src/cli/files';
import { TUNING_FILE } from '../../src/content/chapter1';
import { movePin, usePower } from '../../src/player/actions';
import { reachOf } from '../../src/player/frontier';
import { fogSetup } from '../../src/sim/fog';
import { rerunAll } from '../../src/sim/recompute';
import { TINY_DIR, tiny } from '../sim/helpers';
import { driver, type Driver } from '../helpers/playthrough';

const files = { chapter: readChapterDir(TINY_DIR), tuning: TUNING_FILE, pinsets: { sets: {} } };

/** The edge a fresh re-run of the player's log, watched facts and frontier would give. */
const limitOf = (d: Driver): number =>
  rerunAll(fogSetup(tiny, d.player.seed), null, {
    pins: d.player.pins,
    watched: d.player.watched,
    frontier: d.player.frontier,
  }).result.edge;

describe('the frontier in play (04 §6)', () => {
  it('playback moves it, scrubbing and re-runs never do, and the edge stays the frontier limit', () => {
    const d = driver(files);
    d.start(5, 5);
    expect([d.view.edge, d.player.frontier]).toEqual([
      0,
      { story: 0, pastTicks: 0, storylets: [] },
    ]);
    d.player = { ...d.player, charge: 100 }; // the debug panel's +100 charge
    d.playTo(10);
    // nothing on the requirement tree yet: reach is tick 0, the story limit 0, ten ticks past it
    expect(d.player.frontier).toEqual({ story: 0, pastTicks: 10, storylets: [] });
    expect([d.view.edge, limitOf(d)]).toEqual([10, 10]);

    // the glow at the edge: its re-run ends at the tick whose step shows the new story (M3-2)
    const before = d.player.frontier;
    const glow = d.act((p, v, c) => usePower(p, v, c, { power: 'glow', place: 'home.room' }));
    expect(glow.error).toBeUndefined();
    expect(d.player.frontier).toEqual(before); // a re-run never changes it
    expect([d.view.edge, d.player.pins[0]?.tick]).toEqual([10, 10]);

    d.playTo(25);
    // lured watched at 10 (tempted and out in one step); heroOut holds from 11: progress 50, reach 11, 14 ticks past it
    expect(d.player.watched.find((f) => f.tick === 10)?.summary.storylets).toEqual([
      'lured.out',
      'lured.tempted',
    ]);
    expect([d.view.frames[10]?.progress, d.view.frames[11]?.progress]).toEqual([0, 50]);
    expect(d.player.frontier).toEqual({ story: 50, pastTicks: 14, storylets: ['lured', 'shift'] });
    expect([d.view.edge, limitOf(d)]).toEqual([25, 25]);

    // scrubbing changes nothing but the playhead, and sends nothing
    const sent = d.sent;
    const kept = { ...d.player };
    d.scrubTo(12);
    expect({ ...d.player, playhead: 25 }).toEqual(kept);
    expect(d.sent).toBe(sent);

    // an edit that delays the beat: the glow moved from 10 to 13 makes heroOut hold from 21; the
    // story limit stays reachable, 14 ticks past the new reach
    d.scrubTo(13);
    const id = d.player.pins[0]?.id ?? '';
    d.act((p, v, c) => movePin(p, v, c, { pin: id, tick: 13 }));
    expect(reachOf(d.view.frames, 50)).toBe(21);
    expect(d.view.edge).toBe(21 + 14);
    expect(d.player.frontier).toEqual({ story: 50, pastTicks: 14, storylets: ['lured', 'shift'] });
    // playing on extends pastTicks from the new reach; the story limit never goes down
    d.playTo(40);
    expect(d.player.frontier).toEqual({
      story: 50,
      pastTicks: 40 - 21,
      storylets: ['lured', 'shift'],
    });
    expect([d.view.edge, limitOf(d)]).toEqual([40, 40]);
  });
});
