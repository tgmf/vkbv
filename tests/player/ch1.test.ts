// Chapter 1 in play, literal seed 1 (M3 brief): the fog stays open while Marti watches the morning,
// and repeat by default holds his watched morning through an edit behind the edge.
import { describe, expect, it } from 'vitest';
import { CHAPTER1_FILES, PINSETS_FILE, TUNING_FILE } from '../../src/content/chapter1';
import { playCard } from '../../src/player/actions';
import { driver } from '../helpers/playthrough';
import { inHand, revealing } from './helpers';

const files = { chapter: CHAPTER1_FILES, tuning: TUNING_FILE, pinsets: PINSETS_FILE };
const CREW = ['gavrila', 'bublik', 'pip', 'semyon'];

describe('Chapter 1, seed 1, in play', () => {
  it('the fog stays open: after watching 05:40 to 09:00 the crew are ghosts over several places', () => {
    const d = driver(files);
    d.start(1, 1);
    d.playTo(200); // 09:00
    expect([d.player.playhead, d.view.edge]).toEqual([200, 200]);
    const seen = new Set(d.player.watched.flatMap((f) => f.summary.cats.map((x) => x.cat)));
    const frame = d.view.frames[200];
    for (const id of CREW) {
      if (seen.has(id)) continue; // Marti saw him: he may be fact now
      const places = new Set((frame?.cats[id] ?? []).filter((g) => g.p > 0).map((g) => g.node));
      expect(places.size, id).toBeGreaterThanOrEqual(2);
    }
    // every one of Marti's watched facts holds: a re-run with them reopens none
    const again = d.rerun();
    expect(again.reopened).toEqual([]);
    expect(again.edge).toBe(200);
  }, 120_000);

  // The brief's edit (tea_break on the roadworks at 07:00) reaches Marti on seed 1: the crew's break
  // moves, Semyon tells the tale at 07:20 and Marti, a role of crew_chatter, overhears it through the
  // window (docs/questions.md M1-2); his questionItch reaches 1000 and at 09:00 he reads instead of
  // napping, so his own facts from 09:00 reopen (03 §15.5). Reported in docs/questions.md M3-3.
  it('repeat by default: an edit at 07:00 re-runs to 10:00; what Marti watched holds until the edit reaches him', () => {
    const d = driver(files);
    d.start(1, 1);
    d.playTo(260); // 10:00
    const morning = d.player.watched;
    expect(morning).toHaveLength(260);
    d.scrubTo(80); // 07:00
    // the roadworks revealed and the cards in hand by hand (the debug panel's reveal all and unlock)
    d.player = inHand(revealing(d.player, 'town.roadworks'), 'tea_break', 'box');
    const saved = d.player;

    // box on the roadworks does not reach Marti: nothing reopens, and the same morning plays again
    const box = d.act((p, v, c) =>
      playCard(p, v, c, { card: 'box', target: { place: 'town.roadworks' } }),
    );
    expect(box.error).toBeUndefined();
    expect(box.preview?.edge).toBe(260); // the re-run reaches 10:00 again
    expect(box.preview?.reopened).toEqual([]);
    d.playTo(260);
    expect(d.player.watched).toEqual(morning);
    expect(d.player.marks.changedUnwatched).toEqual([]);

    // tea_break: the re-run reaches 10:00; every fact before 09:00 holds; from 09:00 Marti's own part
    // differs, so those facts reopen
    d.player = saved;
    d.view = d.rerun();
    const tea = d.act((p, v, c) =>
      playCard(p, v, c, { card: 'tea_break', target: { place: 'town.roadworks' } }),
    );
    const preview = tea.preview;
    if (!preview) throw new Error('no preview');
    expect(preview.edge).toBe(260);
    const ticks = preview.reopened.map((f) => f.tick);
    expect(Math.min(...ticks)).toBe(200);
    expect(d.player.watched.filter((f) => f.tick < 200)).toEqual(
      morning.filter((f) => f.tick < 200),
    );
    // the trace: the tale reaches him at 07:20 in the new timeline, and not in the watched one
    const heard = (f: { summary: { storylets: string[] } } | undefined) =>
      f?.summary.storylets.includes('crew_chatter.overheard') ?? false;
    expect(morning.some(heard)).toBe(false);
    d.playTo(260);
    expect(heard(d.player.watched.find((f) => f.tick === 101))).toBe(false); // watched before the edit
    expect(
      d.player.watched.filter((f) => f.tick >= 200).map((f) => f.summary.self.activity)[0],
    ).not.toBe(morning[200]?.summary.self.activity);
  }, 120_000);
});
