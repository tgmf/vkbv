# M7 — Chapter flow: teaser, hints, strike, end screen

**Goal:** a first-time player with no instructions gets from the teaser to the end
screen, and the graybox is complete as a game.

**Read first:** `01` §2, §3; `06-ui.md` §7, §9; `07` §5.

## Build

1. Teaser (`06` §9), skippable, shown once per new game.
2. The hint system and every hint in `06` §7: one at a time, once per playthrough,
   dismissible, anchored near their subject, stored in the save.
3. Strike sequence, end screen with the three environment-driven buttons and "Keep
   playing", and Rokko's locked thread.
4. New game flow with confirm; seed from `?seed=` or drawn from
   `src/content/data/ch1/vetted-seeds.json` (`04` §2); a typed seed is vetted live before
   the first recompute, with a short "preparing the day" state. Measured in M2: a seed
   that fails takes tens of seconds (seed 1 becomes 49598663 after about 20 s). Work for
   the first re-run may be done while the teaser plays (precompute at chapter load is
   allowed, Tagir 2026-11-25).
5. Settings: language, text size, reduced motion, focus layer, assist mode, new game.
6. Russian for every interface string and hint.
7. `tests/e2e/first-playthrough.spec.ts` and `tests/e2e/smoke.spec.ts` (`07` §5).

## Acceptance

- [ ] The first-playthrough browser test passes with seed 1 and saves a screenshot per step.
- [ ] Each hint appears under its trigger and never twice; no hint blocks input; with
      every hint dismissed the game is fully playable.
- [ ] After the end screen, "Keep playing" leaves the day open: the player can
      withdraw a pin, see the timeline fray, restore it and watch the anchor again
      without a second end screen (the `sandbox` hint shows once).
- [ ] Rokko's thread shows locked after the anchor, with its line on hover.
- [ ] A button whose URL variable is unset is not rendered.
- [ ] Reloading at any step of the first playthrough restores the same state, including which
      hints were shown and every watched fact.
- [ ] No text a character speaks mentions games, saves, screens or players; no hint
      tells the story or judges the player.
- [ ] `ui/ru.json` has no English left.

## Out of scope

Debug panel, telemetry, deploy, art, sound.
