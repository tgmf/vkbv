// Shared helpers for player-layer tests: views from real re-runs, and player states set up by hand
// (the debug panel's "reveal all" and "unlock all cards" do the same).
import { addSorted, newGame, type PlayerState, type PlayerView } from '../../src/player/state';
import { fogSetup } from '../../src/sim/fog';
import { rerunAll } from '../../src/sim/recompute';
import type { Content, Frontier, Pin } from '../../src/sim/types';

/** A view of the timeline of `pins`, run to the fray or the end (a frontier that never limits). */
export function viewOf(c: Content, pins: Pin[] = [], seed = 1): PlayerView {
  const setup = fogSetup(c, seed);
  const open: Frontier = { story: 100_000, pastTicks: 0, storylets: setup.main };
  return rerunAll(setup, null, { pins, watched: [], frontier: open }).result;
}

export const game = (c: Content, seed = 1): PlayerState => newGame(c, seed, seed);

export const inHand = (p: PlayerState, ...cards: string[]): PlayerState => {
  const next = { ...p.cards };
  for (const id of cards) next[id] = { zone: 'hand' };
  return { ...p, cards: next };
};

export const revealing = (p: PlayerState, ...nodes: string[]): PlayerState => ({
  ...p,
  revealed: addSorted(p.revealed, ...nodes),
});

/** A new game's view: the re-run stops at tick 0 (04 §6). */
export function newGameView(c: Content, seed = 1): PlayerView {
  const fresh: Frontier = { story: 0, pastTicks: 0, storylets: [] };
  return rerunAll(fogSetup(c, seed), null, { pins: [], watched: [], frontier: fresh }).result;
}
