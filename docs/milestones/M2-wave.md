# M2 — The wave: fog and lantern

**Goal:** the wave of `03` §13–§18 in the worker: the readers index, cat chains and
cases in the fog, the one decision function with conditions in ppm, the lantern
(live cats, placement, release, dwell), forward and backward passes, Gaze, imposed
facts on replay, fray, frames, recompute from checkpoints, seed vetting. Calibrated
against the reference simulation and within budget.

Changed 2026-11-21: the weighted histories of the earlier M2 (splitting, merging,
trimming, rejuvenation, lineage) are retired. See the design doc, World model › Fog
and lantern, and the glossary's Waves section. M1's single-history engine stays as it
is: it is the lantern's `step` and the reference simulation.

**Read first:** `03` §1, §12–§18 (and §4, §8–§10, which the fog reuses), `07` §3, §4,
`02` §3, `04` §2.

## Build

1. Conditions return ppm (`03` §13.3). Refactor `conditions.ts` and `scores.ts` so
   every condition returns 0..1 000 000 and every score term and gate uses it. In
   single-history mode the results must be identical to M1 (golden hashes unchanged).
2. `step` takes `live` and `heldStorylets` (`03` §13.4); with every cat live and none
   held it behaves exactly as in M1.
3. `readers.ts`: the readers index and link selection (`03` §13.5); the place
   perception table (`03` §13.6). Both built once at load.
4. `phi-table.ts` and `scripts/gen-phi-table.ts` (`03` §13.7), with test vectors in
   the style of `EXP`.
5. `fog.ts`: chain states, bands and mean-field gauges, fog steps, the decision
   function called with fog inputs, storylets, counters, events, `heard`, detectors,
   pins on fogged targets, cases (weather and links), splitting and merging cases,
   contributor heaps (`03` §13).
6. `lantern.ts`: the lantern state, placement, negative evidence, release, dwell,
   storylets moving between fog and lantern (`03` §13.4, §15.1).
7. The backward pass (`03` §14): case Bayes, chain conditioning, smoothing (may be
   deferred to frame requests), forward again; anchor conditioning and strain.
8. `observe.ts` for Gaze and imposed facts on replay (`03` §15.4, §15.5). Playback
   observation comes in M3.
9. `frames.ts` (`03` §16, including `samples` by backward sampling) and
   `recompute.ts` (checkpoints, projection, results with `reopened`, `gazeFacts`,
   `stats`), `vet.ts` (`04` §2).
10. The worker: `init`, `vet`, `recompute` (preview and committed), `commit`,
    `debugHistory`, per `02` §3. A headless entry point running the same code in Node
    for tests and scripts.
11. `npm run sim -- --fog`: prints, per hour, the number of cases, live cats and fog
    states; the probability of each storylet state and requirement item; the strain;
    and the end.
12. The quick calibration test and `npm run calibrate` (`07` §3).
13. A recompute benchmark test (`07` §4).

## Acceptance

- [ ] M1's golden hashes and single-history tests pass unchanged after the ppm
      refactor and the new `step` arguments.
- [ ] One decision function: for a live state and the matching point-mass chain
      state, the fog and the lantern produce the same choice probabilities (test).
- [ ] Chains: every cat's chain sums to 1 000 000 in every case after every step;
      case weights sum to `WAVE_TOTAL`; no float is stored (property test).
- [ ] Exactness on the tiny world: with one fogged cat and no links, the fog's
      marginals match an exact enumeration of single histories within
      `fog.exactTolerancePpm`; with one link, case weights after evidence equal Bayes'
      rule worked by hand.
- [ ] Bands: a hook rule moves mass between bands as `03` §13.2 says (numbers in the
      test); a temporary mod shifts back at expiry.
- [ ] Links: the readers index picks the links `03` §13.5 describes on Chapter 1 (list
      them in the handoff note); a link splits a case when it rises, and cases with the
      same assignment merge.
- [ ] Placement: on the tiny world, a cat is placed only in states with mass; the draw
      is the same for the same seed and tick whatever unrelated pins change; negative
      evidence removes the perceivable states; release returns a live cat to the fog
      after `lantern.releaseAfterTicks` unperceived ticks; dwell holds its activity.
- [ ] Imposed facts: replaying after an edit inside the played stretch forces watched
      cats back into place when their chain allows it; a fact that cannot hold is
      reported in `reopened`.
- [ ] Gaze: a power pin with `collapse` fixes, at each of its ticks, what the circle
      holds; the same pins give the same pick; the facts are in `gazeFacts`.
- [ ] Anchor: with conditioning on, case weights lean toward cases that reach the
      anchor; strain is the unconditioned probability; the projection frays below
      `fog.frayBelowPpm`, and the played stretch frays when `fraysIf` holds live.
- [ ] Recompute from a checkpoint gives byte-identical results to a recompute from
      tick 0 (property test over 20 random pin sets).
- [ ] Vetting is deterministic and stores the vetted seed.
- [ ] Quick calibration passes. `npm run calibrate` passes; its table is in the
      handoff note. If it does not, the handoff note shows which events and buckets
      miss, with numbers, and the question is in `docs/questions.md`.
- [ ] The recompute budget holds, or the handoff note says where the time goes and
      which fog knob values meet it (calibration still passing).
- [ ] Every invariant in `03` §18 has a test.

## Out of scope

Playback observation, links on demand and rewards (M3), any UI.

## Pitfalls

- The fog must call the same decision function, place selectors and score terms as
  the lantern. A simplified copy for the fog is the most likely bug in this milestone.
- Watch for integer overflow: `weight × ppm` stays below 2^53 only if weights stay
  ≤ `WAVE_TOTAL`.
- Calibration failing means the fog is wrong or one of its stated approximations does
  not hold for this content, not that the content is wrong.
- `scripts/_m2probe.ts` was written for the retired history design. Use it only to
  measure `step`; delete it or give it a real name before committing.
