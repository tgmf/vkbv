# M2 — The wave: fog and lantern

**Goal:** the wave of `03` §13–§18 in the worker: the readers index, cat chains and
cases in the fog, the one decision function with conditions in ppm, the lantern
(live cats, placement, release, dwell), forward and backward passes, Gaze, imposed
facts on re-run, fray, frames, the re-run from checkpoints to the frontier limit, seed
vetting. Calibrated against the reference simulation and within budget.

Changed 2026-11-21: the weighted histories of the earlier M2 (splitting, merging,
trimming, rejuvenation, lineage) are retired. See the design doc, World model › Fog
and lantern, and the glossary's Waves section. M1's single-history engine stays as it
is: it is the lantern's `step` and the reference simulation.

Changed 2026-11-22: the lantern edge. Marti is simulated directly at every tick the
player can reach; nothing past the lantern edge is drawn. An edit re-runs the lantern
from the edit tick to the frontier limit, streamed (`03` §13.1, §17; `04` §6). The
projection is now internal: the whole-day projection for vetting, calibration and
balance, and strain.

**Read first:** `03` §1, §12–§18 (and §4, §8–§10, which the fog reuses), `07` §3, §4,
`02` §3, `04` §2.

## Build

0. Hysteresis decisions in `step` (`03` §8.2, decided 2026-11-22): decision keys,
   triggers, the margin, boredom instead of `activityLeft`, `forcedLeft` for `delay`,
   and the shared decision cache. This changes single-history behaviour on purpose:
   update M1's golden files with `npm run golden:update` once, after this item alone,
   and name this decision as the reason in the handoff note.
1. Conditions return ppm (`03` §13.3). Refactor `conditions.ts` and `scores.ts` so
   every condition returns 0..1 000 000 and every score term and gate uses it. In
   single-history mode the results must be identical to those after item 0 (golden
   hashes unchanged by this item).
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
8. `observe.ts` for Gaze and imposed facts on re-run (`03` §15.4, §15.5). Playback
   observation comes in M3.
9. `frames.ts` (`03` §16, including `samples` by backward sampling) and
   `recompute.ts`: checkpoints; the re-run from the edit tick to the frontier limit,
   the fray or the end, with the frontier as an input (`03` §17, `04` §6), streaming
   its frames; results with `edge`, `end`, `reopened`, `gazeFacts`, `stats`;
   projections (whole-day, and from the edge for strain). `vet.ts` (`04` §2). The
   main storylets derived at load (`03` §12.2).
10. The worker: `init`, `vet`, `recompute` (preview and committed, streaming `rerun`
    messages), `commit`, `debugHistory`, per `02` §3. A headless entry point running
    the same code in Node for tests and scripts.
11. `npm run sim -- --fog`: runs the lantern from tick 0 to the end with no frontier
    limit (a headless playback) and prints, per hour, the number of cases, live cats
    and fog states; the probability of each storylet state and requirement item; the
    strain; and the end. `--projection` prints the same for the whole-day projection.
12. The quick calibration test and `npm run calibrate` (`07` §3).
13. A re-run benchmark test (`07` §4).

## Acceptance

- [ ] Hysteresis (item 0): on the tiny world a cat keeps its activity until a trigger
      fires and an activity beats it by the margin; boredom rises at the activity's
      rate and resets on a switch; a `delay` ends after `forcedLeft`; the golden files
      were updated once, with this decision as the reason in the handoff note.
- [ ] After item 0, the golden hashes and single-history tests pass unchanged through
      the ppm refactor and the new `step` arguments. The other intended change: initial
      gauges use scope `s0:<cat>` in every stream (`03` §5), so single histories in
      streams other than 0 start from the seed's stats; the handoff note lists any
      expected file that moved and why.
- [ ] The decision cache: results with the cache on and off are byte-identical; the
      handoff note gives the hit rate and decision calls per re-run.
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
- [ ] Imposed facts: re-running after an edit forces watched cats back into place
      when their chain allows it; a fact that cannot hold is reported in `reopened`.
- [ ] Gaze: a power pin with `collapse` fixes, at each of its ticks, what the circle
      holds; the same pins give the same pick; the facts are in `gazeFacts`.
- [ ] Anchor: with conditioning on, a projection's case weights lean toward cases
      that reach the anchor; strain is the unconditioned probability; a projection
      frays below `fog.frayBelowPpm`, and the lantern frays when `fraysIf` holds in it.
- [ ] Re-run: on the tiny world it stops just before a never-watched main storylet
      would reach Marti, just before progress passes `frontier.story`, and after
      `frontier.pastTicks` ticks past `reach` (one test each); a side storylet does not
      stop it; it never passes the fray or the end; a timeline that never reaches the
      story limit runs to the fray or the end. The main storylets of Chapter 1 are the
      list in `03` §12.2.
- [ ] A re-run from a checkpoint gives byte-identical results to one from tick 0, and
      a re-run in one go gives the same lantern as one advanced a tick at a time
      (property tests over 20 random pin sets).
- [ ] Vetting is deterministic and stores the vetted seed; two seeds with different
      seeded stats can get different verdicts (test on the tiny world).
- [ ] Quick calibration passes. `npm run calibrate` passes; its table is in the
      handoff note. If it does not, the handoff note shows which events and buckets
      miss, with numbers, and the question is in `docs/questions.md`.
- [ ] The re-run budget holds (`07` §4), or the handoff note says where the time goes
      and which fog knob values meet it (calibration still passing).
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
