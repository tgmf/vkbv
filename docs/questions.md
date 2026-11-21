# Open design questions

The coding model adds questions here. Tagir answers here **and updates the spec**.

Format:

```
## M<n>-<k> — short title            (status: open | answered | spec updated)
Where: file and line, or spec section
Question:
Options seen:
Chosen for now (behind knob `…`, if any):
Answer:
```

## Q-content-1 — Pocket weight's effects note            (status: open)
Where: `src/content/data/ch1/hooks.json`, hook `pocketWeight`, key `effects`
Question: The note says light pockets raise wander and scavenge scores and heavy pockets
lower a run score. No activity in the content reads it, and "run" is not an activity.
Should it become score terms on specific activities?
Options seen: (a) leave it as a note; (b) add `gauge` terms to the named activities.
Chosen for now: (a). The engine ignores the key (`05` §3).
Answer:

## Q-content-2 — The lure's `leadTo`            (status: open)
Where: `src/content/data/ch1/powers.json`, power `lure`
Question: The slice lets the player drag a destination for the glowing cat. Is it in
the demo?
Options seen: (a) out of the demo, field ignored; (b) a power pin carries `leadTo`
and the glowing cat walks there.
Chosen for now: (a) (`01` §4).
Answer:

## Q-glossary-2 — When a watched fact reopens            (status: open)
Where: glossary, Open conflicts 2; `03` §15.4; knob `observation.reopenBelowPpm`
Question: Only when an edit makes it impossible, or also when it becomes very
unlikely, or only when the player knowingly breaks it?
Chosen for now: impossible only (`reopenBelowPpm = 0`). Do not change the default.
Answer:

## Q-frontier-1 — Strain            (status: open)
Where: `03` §16, `04` §6
Question: Should the frontier or a meter use strain (the unconditioned share of weight
reaching the anchor), given that the conditioned chance is always 100%?
Chosen for now: strain is shown only in the debug panel.
Answer:

## Q-gaze-1 — Gaze tuning            (status: open)
Where: `src/content/data/ch1/powers.json`, power `gaze`
Question: Cost, radius and duration. The slice says 40 charge, 6 m, 5 ticks.
Chosen for now: the slice's values. Gate A decides.
Answer:

## M1-1 — Do object tags count in `at` conditions?            (status: open)
Where: `src/sim/conditions.ts` (`at` with `tag`); `03` §8.2 vs §10.1
Question: A place selector `{ tag }` counts tags of objects standing at a place ("or holding an
object carrying it"); the `at … tag` condition says "a node with that tag". Read literally, Marti
sitting in the box at `flat.window_nook` (the `old_box` object carries `box`; the place does not)
does not satisfy `boxPull`'s rise rule `{ at: self, tag: box }`.
Options seen: (a) place tags only, as written; (b) count object tags in conditions too.
Chosen for now: (a).
Answer:

## M1-2 — Role holders perceive all of their storylet's events            (status: open)
Where: `src/sim/step.ts` (`always`); `03` §4 last rule; `ch1/storylets.json` `crew_chatter`
Question: `crew_chatter` binds Marti as a role so its effects can name him. By `03` §4 he then
perceives every event of that storylet, so `chatter.catlantis` always reaches him and the
`overheard` state follows the next tick, wherever he is. The slice's README calls this a
knife-edge perception test (only through the open window while dry). Seen on seed 1: overheard at
09:04 while Marti walked in the study.
Options seen: (a) keep `03` §4; (b) role holders perceive only `storylet` state events, not
named emits; (c) content: drop the `marti` role in `crew_chatter` (its `factIfPerceivedBy` and
gauge effect can name `marti` directly).
Chosen for now: (a), as specified.
Answer:

## M1-3 — `chance:<n>` keys every chance roll by its order in the tick            (status: open)
Where: `src/sim/effects.ts`; `03` §9.3 (`chance`)
Question: `n` counts chance effects in the tick, across all cats and storylets. An unrelated chance
effect earlier in the tick (e.g. another cat finishing `chat`) shifts every later roll, which works
against "noise keyed by who, when and why" (`03` §1, §13).
Options seen: (a) as written; (b) key by source and index, e.g. `chance:<cat or storylet>:<k>`.
Chosen for now: (a).
Answer:

## M1-4 — Can a storylet transition on the tick it activates?            (status: open)
Where: `src/sim/storylets.ts` (`storyletsPhase`); `03` §6 phase 4, §9.1
Question: "Activation, then one transition at most per storylet." Does a storylet that activates
in phase 4 also look at its start state's exits in the same phase?
Options seen: (a) no: activation is that storylet's step for the tick; (b) yes.
Chosen for now: (a). It delays every first transition by one tick (e.g. `parcel_drop`).
Answer:

## M1-5 — Performance needed for M2            (status: open, for planning)
Where: `07` §4 recompute budget
Measured: one Chapter 1 history (900 ticks, 12 cats) takes about 120 ms in Node (Vitest), so about
130 µs per history-tick. The M2 budget (an edit at 12:00, 128 histories, 100 ms) allows about
1.5 µs per history-tick before merging: roughly 80× short. Merging identical histories will help;
cheaper steps (fewer clones, incremental decisions) will be needed. M2's brief allows lowering
`waves.cap`, not changing `03`.
Answer:

## M2-1 — The fog is far over the recompute budget            (status: open)
Where: `07` §4; `03` §13.2; measured in `docs/handoff/M2.md`
Question: One fog step of one case costs 66 ms with the spec's knobs and 7 ms with the most
aggressive (`minStatePpm` 20 000, 2 bands); the budget allows about 1 ms (104 steps × up to 12
cases in 100 ms). `07` §4 says not to change the algorithm in `03` and to ask.
Options seen:
(a) keep the algorithm, make each state cheaper: decisions cached across steps and cases by
    what they read, integer-coded states instead of objects and JSON keys. Perhaps 5–10×; unsure.
(b) a coarser chain state (spec change): drop `leftSteps` and finish activities at a per-step
    hazard of 1/mean duration, so a cat has a few states per place instead of one per remaining
    step. Perhaps 5–10× fewer states; changes `03` §13.2 and what calibration measures.
(c) progressive recompute (spec change, `02` §3, `03` §17, `07` §4): steps near the edit first,
    the rest of the day streamed after.
(d) a larger budget.
Chosen for now: none; steps 4–8 wait.
Update 2026-11-22: the lantern edge (glossary) changes the case. An edit no longer
projects the rest of the day: it re-runs the lantern (Marti live) with the other cats
in the fog, streamed, so (c) is now the design. `07` §4 now asks for the first frames in
`budgets.recomputeMs` and at least `budgets.rerunTps` (120, a guess) ticks per second.
Marti's chain (about 440 of 2 534 states at 09:40) leaves the per-edit path. To be
measured again.
Answer:

## M2-2 — Anchor conditioning with nothing drawn past the lantern edge            (status: answered)
Where: `03` §14, `05` §4 `waves.anchorConditioning`; glossary Anchor ("unwatched waves lean toward it")
Question: Conditioning multiplied the projection's case weights by P(anchor | case). Nothing
past the lantern edge is drawn now, and vetting and calibration run with conditioning off, so
the knob changes nothing the player sees. Should unwatched odds up to the edge lean toward the
anchor?
Options seen:
(a) keep it on projections only (it then affects nothing in play);
(b) after each re-run, project from the edge and multiply the case weights of the fog from the
    edit tick on by P(anchor | case). That costs a whole projection per edit, and placements in
    the re-run would have to use the previous projection's weights (otherwise placement and
    conditioning depend on each other);
(c) retire the knob.
Chosen for now: (a), behind `waves.anchorConditioning`.
Answer: Tagir, 2026-11-22: go with the defaults ("pls do").

## M2-3 — Power pins an edit leaves past the lantern edge            (status: answered)
Where: `04` §4; glossary Lantern edge ("powers: open")
Question: When an edit pulls the edge back, ordinary cards past it return to the hand and unique
cards move to the edge. What happens to a power pin?
Options seen: (a) it moves to the edge at no cost, like a unique card; (b) it is removed and its
charge is lost (charge is never refunded); (c) it is removed and its charge refunded (contradicts
"never refunded").
Chosen for now: (a).
Answer: Tagir, 2026-11-22: go with the defaults ("pls do").

## M2-4 — Watched facts past the new lantern edge            (status: answered, overridden)
Where: `03` §15.5, `04` §4
Question: A re-run stops at the frontier limit, so watched facts after it are not tested and the
break alert cannot list them.
Options seen: (a) keep them; test them when live playback reaches their tick; a paid one that
reopens then is a break with no alert before it; (b) reopen them all on commit and list the paid
ones in the break alert; (c) let a preview run past the frontier limit to the last watched fact,
only to test facts, then cut the frames at the limit (costs a longer re-run).
Chosen for now: (a).
Answer: Tagir, 2026-11-22: go with the defaults ("pls do"). **Overridden later the same
night (Tagir, 2026-11-22): (b).** A watched fact belongs to its tick, and an edit can move
when things happen, so testing old facts at their old ticks is wrong. On commit every
watched fact after the new edge is reopened without a test; the paid ones are listed in
the break alert before the edit lands; no watched fact ever lies past the edge. The build
pack (`instructions/acfw-build-pack`, `03` §15.5, `04` §4, M3) says this; apply it to
`docs/spec` when the pack is next installed. Do not switch back to (a).

## M2-5 — Decisions made while applying the lantern edge to the spec            (status: answered)
Where: `03` §12.2, §13.1, §17; `04` §4, §6; `02` §3; `06` §3; `05` §4
Question: The glossary of 2026-11-22 left these to me. Confirm or correct:
1. A main storylet is one with an effect that sets a fact in the requirement tree (Chapter 1:
   `door_lure`, `blocked_road`, `usual_route`, `chain_on_beach`, `tideline_wander`,
   `rokko_morning`, `under_the_boat`). "Perceivable to Marti" = a state of it would appear in
   his watched fact at that tick.
2. `reach` = the first tick of the current lantern whose progress is at least `frontier.story`;
   the frontier limit is `reach + pastTicks` unless a main storylet or new progress comes
   first. A new game starts with the edge at 0, so the player plays from the first tick.
3. The lantern edge is not saved: it always equals the frontier limit of the current timeline,
   and loading re-runs to it.
4. Every edit's preview streams; the break alert waits for the end of the re-run; Cancel
   restores the old frames.
5. Ordinary cards past the new edge return to the hand under every played-card rule.
6. The whole-day projection (Marti in the fog) stays for vetting, calibration and the balance
   measures B2–B7.
7. New knobs: `timeline.minSpanTicks` 36, `budgets.rerunTps` 120.
Chosen for now: as listed.
Answer: Tagir, 2026-11-22: go with the defaults ("pls do").

## M2-6 — Decision cache key vs exact decisions            (status: answered)
Where: `03` §8.2 (decision key, decision cache), §18
Question: The decision key holds gauge bands and fog ppm rounded to `fog.ppmQuantum`, and the
cache must not change results. A live cat's scores read exact gauges, and fog scores read
unrounded ppm, so one band-level key cannot index an exact result.
Options seen: (a) two keys: triggers on the band key; the cache on the decision's actual inputs
(exact live gauges, band midpoints in the fog), with the fog's condition ppm rounded to the
quantum in the decision itself; (b) cache by the band key and accept differences for live cats;
(c) live decisions read bands too.
Chosen for now: (a).
Answer: Tagir, 2026-11-22: (a), two keys.

<!-- Gate notes and answers go above this line. -->
