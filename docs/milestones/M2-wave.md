# M2 — The wave

**Goal:** the wave of `03` §13–§17 in the worker: splitting, merging, trimming,
lineage, imposed facts, Gaze, anchor conditioning, fray, frames, recompute from
checkpoints, seed vetting. Calibrated and within budget.

**Read first:** `03` §12–§18, `07` §3, §4, `02` §3, `04` §2.

## Build

1. `wave.ts` (expansion of branch points into children, child ids, merge by state
   hash, renormalisation, lineage DAG), `trim.ts` (`03` §14), `observe.ts` (grouping
   by digest, sampling, pruning through the DAG; used here by imposed facts and Gaze,
   and by playback in M3), `frames.ts` (`03` §16, including `samples`),
   `recompute.ts` (checkpoints, resume, results with `reopened`, `gazeFacts`,
   `stats`), `vet.ts` (`04` §2).
2. The worker: `init`, `vet`, `recompute` (preview and committed), `commit`,
   `debugHistory`, per `02` §3. A headless entry point running the same code in Node
   for tests and scripts.
3. `npm run sim -- --waves`: prints, per hour, the number of histories, the
   probability of each storylet state and requirement item, and the strain; and the
   end.
4. The quick calibration test and `npm run calibrate` (`07` §3).
5. A recompute benchmark test (`07` §4).

## Acceptance

- [ ] Splitting is exact: for a storylet choice and a hazard on the tiny world, the
      children's weights equal the probabilities times the parent's weight, up to
      truncation; weights sum to `WAVE_TOTAL` after every tick.
- [ ] Merging and trimming: identical states merge; over the cap, every signature
      group above the floor keeps a history; systematic resampling is deterministic
      (property test).
- [ ] Noise follows streams: after a pin that affects only the crew, Marti's activity
      sequence is unchanged in every history whose streams survive.
- [ ] Rejuvenation copies keep followed cats' streams, give every other cat and the
      world new ones, and split weights exactly; the result is deterministic.
- [ ] Imposed facts: a watched fact passed into a recompute prunes histories at its
      tick; an impossible one is reported in `reopened` and pruning is skipped.
- [ ] Gaze: a power pin with `collapse` leaves, at each of its ticks, only histories
      that agree on the circle's view; the same pins give the same pick; the facts
      are in `gazeFacts`.
- [ ] Conditioning: on the tiny world with an anchor, conditioned probabilities match
      a brute-force enumeration of all branch outcomes to within 1 000 ppm. With no
      history reaching the anchor the end is `fray` at the last alive tick; with early
      cut on, dead histories stop being simulated.
- [ ] Recompute from a checkpoint gives byte-identical results to a recompute from
      tick 0 (property test over 20 random pin sets).
- [ ] Vetting is deterministic and stores the vetted seed.
- [ ] Quick calibration passes. `npm run calibrate` passes; its table is in the
      handoff note.
- [ ] The recompute budget holds, or the handoff note gives the largest `waves.cap`
      that meets it and `tuning.json` is set to it (calibration still passing).
- [ ] Every invariant in `03` §18 has a test.

## Out of scope

Playback observation and rewards (M3), any UI.

## Pitfalls

- Re-running `step` per branch outcome is the reference behaviour. If you clone state
  at branch points instead, keep a test that compares both.
- Watch for integer overflow: `weight × ppm` stays below 2^53 only if weights stay
  ≤ `WAVE_TOTAL`.
- Calibration failing means the wave is wrong, not the content.
