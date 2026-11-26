// Saving (04 §9): save, reload, continue gives the same state; anything that is not a valid save loads
// as null.
import { describe, expect, it } from 'vitest';
import { readChapterDir } from '../../src/cli/files';
import { TUNING_FILE } from '../../src/content/chapter1';
import { inspect, playCard } from '../../src/player/actions';
import {
  deserialize,
  load,
  SAVE_KEY,
  serialize,
  store,
  type Settings,
} from '../../src/player/save';
import { TINY_DIR } from '../sim/helpers';
import { driver } from '../helpers/playthrough';

const files = { chapter: readChapterDir(TINY_DIR), tuning: TUNING_FILE, pinsets: { sets: {} } };
const settings: Settings = {
  lang: 'ru',
  textSize: 125,
  reducedMotion: 'system',
  focusLayer: true,
  assist: false,
  volume: 80,
};

/** A fake storage, as `localStorage` would be. */
const memory = () => {
  const m: Record<string, string> = {};
  return {
    getItem: (k: string) => m[k] ?? null,
    setItem: (k: string, v: string) => void (m[k] = v),
    m,
  };
};

describe('save, reload, continue (04 §9)', () => {
  it('gives a deep-equal state, and continuing gives the same day', () => {
    const a = driver(files);
    a.start(1, 1);
    a.act((p, v, c) => inspect(p, v, c, { object: 'mat' }));
    a.playTo(12);
    a.act((p, v, c) => playCard(p, v, c, { card: 'shift', target: { cat: 'hero' } }));
    a.playTo(20);
    a.scrubTo(15);
    const storage = memory();
    store(storage, a.player, settings);
    expect(Object.keys(storage.m)).toEqual([SAVE_KEY]);
    const saved = load(storage);
    expect(saved).toEqual({ player: a.player, settings });
    // reload: a new session re-runs from tick 0 to the frontier limit, then plays on
    const b = driver(files);
    b.start(1, 1);
    if (!saved) throw new Error('no save');
    b.player = saved.player;
    b.view = b.rerun();
    expect(b.view.edge).toBe(a.view.edge);
    a.playTo(40);
    b.playTo(40);
    expect(b.player).toEqual(a.player);
  });

  it('a corrupted string loads as null', () => {
    const p = driver(files);
    p.start(1, 1);
    const good = serialize(p.player, settings);
    expect(deserialize(good)).toEqual({ player: p.player, settings });
    // what was shown once per playthrough comes back with it (06 §7, §9)
    const shown = { ...p.player, seen: ['end', 'teaser', 'watch'] };
    expect(deserialize(serialize(shown, settings))).toEqual({ player: shown, settings });
    for (const bad of [
      '',
      'not json',
      good.slice(0, -3),
      JSON.stringify({ player: p.player }),
      JSON.stringify({ player: { ...p.player, charge: 1.5 }, settings }),
      JSON.stringify({ player: { ...p.player, v: 1 }, settings }),
      JSON.stringify({ player: { ...p.player, seen: [1] }, settings }),
      JSON.stringify({ player: p.player, settings: { ...settings, textSize: 110 } }),
    ])
      expect(deserialize(bad)).toBeNull();
    expect(load(memory())).toBeNull();
  });
});
