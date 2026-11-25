// `road_box` played by hand on the game's seed (M6 acceptance; docs/questions.md M6-1).
import { expect, it } from 'vitest';
import { byHand } from './by-hand';

it('road_box played by hand on seed 4 reaches the anchor', () => {
  const d = byHand('road_box');
  expect(d.view.end).toEqual({ kind: 'anchor', tick: 790 });
  expect(d.player.anchorWatched).toBe(true);
}, 600_000);
