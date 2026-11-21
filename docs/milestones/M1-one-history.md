# M1 — Engine: one history

**Goal:** the simulation of `03` §1–§12 for a single history, running the whole
Chapter 1 content headless. No wave yet: branch points are sampled (`03` §12.4).

**Read first:** `03-simulation.md` (all of it, twice), `05` §1–§3, `02` §2, §5.

## Build

1. Zod schemas for every file in `src/content/data/ch1/` and inferred types; the
   loader's cross-checks (`02` §5), ported from `docs/reference/ch1-slice-validate.mjs`.
   Cast mode `full` / `core` (`05` §3).
2. `space.ts` (positions, paths with `via` and `edgesTagged`, spaces, known closed
   edges), `perception.ts` (`03` §4), `conditions.ts`, `scores.ts`, `effects.ts`
   (storylet effects and card primitives), `cats.ts` (gauges, mods, hooks, voice,
   free behaviour, control), `storylets.ts` (activation, roles, exits), `sifting.ts`
   (detectors and pools), `pins.ts` (validity, pending, specials), weather, and
   `step.ts` with the eight phases and branch points (`03` §6).
3. `history.ts`: initial state per stream, `runHistory` in single-history mode.
4. A tiny test world in `tests/fixtures/tiny/`: a handful of places with one closable
   edge, one indoor space with a window, three cats (one protagonist with willpower
   850), a few activities, one storylet with auto, hazard and choice exits and an
   optional role, one detector with `withinTicks` and `unless`, test cards covering
   every primitive, one power with `attract` and one with `collapse`.
5. `src/cli/sim.ts`: loads content, a seed, a stream and an optional pins file;
   prints one line per event (`tick type details`) and the final state hash.
   `--from`, `--to`, `--cat` filter the output.

## Acceptance

- [ ] `npm run content:check` passes on the Chapter 1 content with 0 errors; a
      dangling id, a non-integer, a disconnected map, an unknown tag or a missing text
      key each fail with one error listing every problem.
- [ ] A unit test for every condition, score term, storylet effect, card primitive,
      exit kind, role kind, place selector and detector clause, on the tiny world.
- [ ] Willpower: a direct `gaugeShift` +300 on a cat with willpower 850 adds 45; the
      same card on a place reaching that cat adds 300. B8 (`05` §5.2) passes on the
      Chapter 1 content.
- [ ] Perception: on Chapter 1, Marti at `flat.window_nook` hears an event with
      `radiusM` 60 at `town.roadworks` while dry and not while raining; at
      `flat.study` he does not hear it; he never sees `town.lane_n` from the flat.
- [ ] Paths: a cat walks to a closed edge it did not know about, emits `blocked`,
      learns it and re-plans; `edgesTagged` follows tagged edges; `via` passes the via
      nodes in order.
- [ ] Storylets: auto beats hazard beats choice; choices only on decision ticks; a
      cat with an open choice exit makes no free decision; a terminal state ends the
      storylet; `once: false` re-activates.
- [ ] Branch points: re-running `step` with a longer branch list reproduces every
      event before the branch point exactly (property test over 50 seeds).
- [ ] The invariants of `03` §18 that concern one history pass on the tiny world and
      on Chapter 1 for seeds 1 to 50, streams 0 to 31, and for 20 pin sets generated
      with `rand`. B1 holds in every one of those single histories.
- [ ] `npm run sim -- --seed 1` on Chapter 1 runs the whole day and prints a readable
      trace; the same command twice gives the same final hash.

## Out of scope

The wave (splitting, merging, trimming, observation, conditioning), the player
layer, any UI.

## Pitfalls

- Phase order matters: storylets run after bodies and before free decisions, so a cat
  that arrives somewhere can react to the storylet its arrival triggered in the same
  tick.
- Pins at tick `t` change `states[t + 1]`, never `states[t]`.
- Never iterate `Object.keys` of state to drive behaviour. Iterate content arrays.
- Noise is keyed by stream (`s<stream>:<cat>`), never by anything that changes when a
  branch is taken.
