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
Update 2026-11-25 (item 13, `tests/budget/rerun.test.ts`): the re-run that `07` §4 now measures (edit at
08:00, edge at 12:00, Marti live) takes 72 ms to the first frames (budget 100) at 111 ticks/s (budget 120)
with the default knobs; `minStatePpm` 3000 gives 156, 2 bands 138 (calibration with them not run). The
fog's steps take 78% of the time. Tagir allows precompute at chapter load if needed.
Update 2026-11-25 (M4, item 2): the three settings measured side by side; `docs/handoff/M4.md` has the full
tables. Re-run budget (`npm run bench`, every pin set, seeds 1–3 medians; budget 100 ms, 120 ticks/s):
| knobs | first frames | ticks/s | observe median / mean | calibration, 400 seeds (`road_both`; `untouched`) | time |
| --- | --- | --- | --- | --- | --- |
| 1000/3 (default) | 71–115 ms | 84–101 | 2.8 / 13.1 ms | rates pass; 3 bucket misses (roadBlocked 10–20%, 50–60%, 70–80%); 1 (roadBlocked 60–70%) | 1 360 s |
| 3000/3 | 50–71 ms | 144–168 | 1.8 / 9.1 ms | roadBlocked rate misses (38.4 vs 57.5; 24.0 vs 40.5); 6 bucket misses each | 849 s |
| 1000/2 | 57–66 ms | 137–148 | 2.0 / 9.2 ms | anchor.meeting rate misses (43.7 vs 31.3), every bucket passes; 1 (roadBlocked 40–50%: 45.3 vs 34.2) | 1 005 s |
`bands` also sets the decision-trigger keys of live cats, so 1000/2 changes single histories (the reference)
too: `martiOut` observed 67.3% against 66.5%, and every golden single history would change. 3000/3 changes
the fog only.
Chosen (Tagir, 2026-11-25, M4): keep 1000/3. The budget stays short (the numbers above); M2-1 stays open.

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

## M2-7 — Whole-band boredom in the fog            (status: answered)
Where: `03` §13.2 (boredom always banded), `src/sim/fog.ts`; knob `fog.boredomWhole` (default false)
Question: In the fog, boredom rises by moving a fraction of every state's mass up a band each step,
so nearly all mass "changes key" and decides every step, and the top band's midpoint (833 at
3 bands) never reaches the 1000 a live cat reaches. Should the fog carry each state's exact boredom
instead (no mass splits; a decision only when a band changes)?
Measured (seed 1, whole day; 60-seed calibration, `untouched`):
| knobs | boredom | all fogged | Marti live | 08:00–12:00 live | states | road blocked (obs. 41.7%) |
| --- | --- | --- | --- | --- | --- | --- |
| 1000/3 | fraction (spec) | 14.2 s | 5.6 s | 203 ticks/s | 1265 | 13.8% |
| 1000/3 | whole | 19.4 s | 4.7 s | 177 ticks/s | 1667 | 22.1% |
| 100/4 | fraction (spec) | 31.2 s | 13.4 s | 57 ticks/s | 3410 | — |
| 100/4 | whole | 39.2 s | 14.7 s | 52 ticks/s | 4223 | — |
Whole bands are not faster: states differ by exact boredom, so there are more of them (like the old
timers), and fewer of them are shared. They are more accurate: the fog no longer under-tires.
Options seen: (a) keep the spec (fraction of mass moves); (b) whole bands (`fog.boredomWhole`);
(c) keep fractions but read the top band as full boredom (1000) in decisions, the part of the bias
whole bands fix, at no cost.
Chosen for now: (a), the knob stays off. Recommendation: (c), measured before choosing.
Answer: Tagir, 2026-11-22: a saturated top band. New knob `fog.saturatedBandFrom` (default 950, per-mille): n − 1 equal bands below it, one band from it to 1 000, each read at its own midpoint. `fog.boredomWhole` stays as an experiment knob, off.

## M2-8 — The fog's road counter misses calibration            (status: answered)
Where: `07` §3; `03` §13.6 (counters as mean and variance); `docs/handoff/M2.md`
Question: Calibration (60 seeds, `untouched`) passes for the crew, the shop and Rokko, but road
blocked depends on a race: the crew must reach 800 units of work before the rain. Holding the
counter in whole units lost work (fixed: millionths of a unit). Now the fogged crew work about 9%
faster than the reference (777 vs 714 by 11:00; spread sd 59 vs 70), so road blocked is predicted at
14% against 42% observed (22% with whole-band boredom). A small bias in the mean flips most of the
mass across the threshold.
Options seen: (a) fix the remaining bias at its source (boredom read at band midpoints, M2-7 (c),
and look for other sources) and measure again; (b) make "road done before the rain" a link, so the
cases carry it (needs a third link; `fog.maxLinks` is 2 by your instruction); (c) hold threshold
counters as a distribution (buckets) instead of mean and variance.
Chosen for now: (a), next.
Answer: Tagir, 2026-11-22: fix the bias at its source after M2-7 (measure the crew against the reference hour by hour, find the decision that diverges). No third link; `fog.maxLinks` stays 2. Only if the mean work is right and road blocked still fails: threshold counters as a spread of values, behind a knob. Road blocked must pass calibration (07 §3) before M2 is done.
Update 2026-11-25: the counter's spread, not its bias, was the main error: the counter was one mean and
variance per case, apart from the states that worked. Fixed by `fog.counterByChain` (on): chain states and
the race storylet's states carry their work. The bias that remains is about 1.7 points of the crew's time
(shorter tea breaks, almost no wandering); road blocked's rates pass at 400 seeds, its middle buckets read
10–16 points low (`docs/handoff/M2.md`, item 12). Not chased further (M2-23).

## M2-9 — Shuttle follow-ups            (status: answered)
Where: `06` §3, §8; `04` §6; `05` §4; `docs/glossary.md`; `docs/milestones/M5-viewer.md`
Question: The shuttle (2026-11-22) is in the spec and the glossary. Three loose ends:
1. **Glossary:** please copy the new "Shuttle" row of `docs/glossary.md` into the master glossary doc.
2. **`player.playSpeedsTps`** (the old speed toggle) has no use left: play runs at the first shuttle speed. Remove it?
3. **The M5 brief** still lists "speeds, jump" for the timeline and "Space, arrows, Home, End" for the keyboard. It should say shuttle, J/K/L, ← and →, and Home.
Options seen: (2) remove the knob, or keep it as play's speed; (3) update M5 when M5 starts.
Chosen for now: the knob stays unused; M5 is unchanged until you say.
Answer: Tagir, 2026-11-22: (1) Tagir copies the row; (2) remove `player.playSpeedsTps` (done); (3) M5 corrected now; "jump to the edge" kept as a playtest option behind `flags.jumpToEdge`, off by default.

## M2-10 — Offers that exist with a probability below 1 in the fog            (status: open)
Where: `src/sim/fog.ts` (`caseCtx`, `// QUESTION(M2-10)`); `03` §13.6 ("`attract` and `repel` add offers to the decision function")
Question: In the fog a running effect from a pin exists with the probability that the pin fired. Places and
powers always fire, but an object pin fires with P(the object is visible), and a pin on a cat puts its
effect where the cat might stand. How should the shared decision function see an offer that exists with
P < 1?
Options seen: (a) the offer counts when its P reaches `fog.gateThresholdPpm`, like a gate; (b) the deciding
mass splits by P: that share decides with the offer, the rest without it (two decisions per state while
such an effect runs).
Chosen for now: (a). No Chapter 1 pin set has such an effect (the lure and the place cards fire for sure),
so calibration does not depend on the choice.
Answer:

## M2-11 — Promoting a lasting effect to a link            (status: open)
Where: `03` §13.5 ("promoted to a link if a slot is free"), knob `fog.linkFloorPpm`
Question: A fact, flag or `heard` that something reads becomes a link once its probability passes
`fog.linkFloorPpm`, if a link slot is free. In Chapter 1 both `fog.maxLinks` slots (2) are taken at load by
`crewArrived` and `martiOut`, so promotion can never happen. Build it now?
Options seen: (a) build it now: needs link kinds for flags (with their `until`) and `heard`, besides facts
and storylet states, and a per-fog link list instead of the one fixed at load; (b) build it when a chapter
has a free slot.
Chosen for now: (b). Contributor heaps are built (they also serve links on demand, `03` §15.3, M3).
Answer:

## M2-12 — When a projection frays            (status: open)
Where: `03` §16 ("a projection frays at the first tick from which the anchor's probability of being
reached is below `fog.frayBelowPpm`"); `src/sim/backward.ts` (`projectToEnd`)
Question: A projection holds no evidence, so P(anchor reached by the end) is one number for the whole day,
not one per tick. Which tick is the fray?
Options seen: (a) the fog's version of `03` §12.2's "dead": P(alive at t) = 1 − P(`fraysIf` has held
without the anchor by t), and at the chapter's end P(reached); the fray is the first tick where it is below
the floor. It bounds the anchor's chance from above, and matches the lantern's dead in expectation;
(b) only "frays or not", at the end, from P(reached).
Chosen for now: (a). Measured on Chapter 1, seeds 1–3: `road_both` P(anchor) 14–15%, no fray; `late_lure`
and `untouched` P(anchor) 0, fray at the end (tick 900): Rokko leaves in about 73% of cases, so P(alive)
stays about 27% all day. Whether a projection frays (B6, B7) is clear either way; its tick will usually be
the end.
Answer:

## M2-13 — Exactness on the tiny world: a deterministic cat is exact, a stochastic one is not yet            (status: open)
Where: M2 acceptance ("with one fogged cat and no links, the fog's marginals match an exact enumeration
of single histories within `fog.exactTolerancePpm`"); `tests/sim/lantern.test.ts`
Question: Single histories sample choices as counter-based noise, so they cannot be enumerated; the test
uses many streams of the fogged cat (Tagir, 2026-11-22). With the fog's approximations switched off
(1-tick steps, exact boredom, 490 bands, no state floor) the fogged bystander matches its single
histories exactly (0 ppm at every tick checked, 200 streams). The hero, whose choices vary, does not: at
06:08 the fog gives wander 84.3% against 88.7% over 4 000 streams (sampling sd about 0.5%); later ticks
are within 5–6 points, two departure ticks differ more. Something in a stochastic decision or in how the
live cats around a fogged one behave still differs from the lantern.
Options seen: (a) investigate before M2 is done (start: the hero's first decision, 06:05, fog vs lantern
inputs); (b) accept the bystander test as the acceptance check and leave the hero as a known gap.
Chosen for now: (b) in the test; (a) recommended.
Answer:
Update 2026-11-24: the stochastic cat's mismatch is mostly M2-24 (a storylet state's own flag read as the
case-wide chance) and M2-25 (walkers and closing edges); with both worked around, the tiny world's fog
matches its histories (`tests/sim/counter-by-chain.test.ts`).

## M2-14 — martiOut under road_both after the walking fix            (status: answered)
Where: `07` §3; `src/sim/fog.ts` (`pathTicks`); `docs/handoff/M2.md`
Question: Fogged cats walked one tick per edge faster than live ones (the lantern starts each edge the tick
after it stands at its first node); fixed in step 6. With it, 60-seed calibration: `untouched` passes
(road blocked 45.6% vs 43.3%); `road_both` misses one bucket (40–50%: 46.8% predicted vs 62.3%
observed) because martiOut falls from 62.5% to 56.9% against 71.7% observed, and the anchor to 2.4% vs
6.7%. Road blocked under road_both is 62.8% vs 60.0%.
Options seen: (a) find the source (compare fogged Marti hour by hour around the lure, as for M2-8);
(b) accept until the lantern carries Marti in play (the projection is only for vetting, calibration and
balance).
Chosen for now: none; (a) is next.
Update 2026-11-23 (with M2-15, Marti never fogged): investigated with Marti live, 100 seeds, road_both,
against the reference. Cause: Marti never heard the fog-held `crew_chatter` (crewChatterHeard 0% vs 100%,
questionItch 632 vs 898 at the lure), because fog events never reached the lantern and fog-held storylet
effects on a live cat were dropped. Fixed (`03` §13.4, §15.1): fog events a protagonist would perceive are
drawn into the lantern and a fog-held storylet that emitted one runs live. martiOut is now 67% vs 66%;
crewChatterHeard 87% vs 100% (the fog's crew break), itch 852 vs 898. The fogged-Marti gap no longer
matters (M2-15). New finding: M2-16.
Answer: Tagir, 2026-11-23: the remaining gap (the tale reaches Marti in 87% of seeds, 100% in the
reference) is acceptable: the player may be able to steer Marti to hear it in those seeds.

## M2-15 — Marti is never fogged            (status: spec updated)
Where: `03` §13.1 (the whole-day projection: "no cat live, Marti in the fog"), `04` §2 (vetting),
`07` §3 (calibration: "no cat live, protagonists in the fog"), `05` §5.2 (balance)
Question: Should any whole-day run hold Marti in the fog?
Answer: Tagir, 2026-11-23: no. Marti is always observed/collapsed; every whole-day run (vetting,
calibration, balance) starts with him simulated live in the lantern (stream 0), the other cats in the
fog. Consequences to settle in the spec: Marti's own events are 0 or 1 per seed in such a run, so
calibration checks them as rates over seeds against the reference, and the fog's other events as
probabilities; vetting reads Marti's requirement facts from the lantern run. martiOut is investigated
as live-vs-reference rates (M2-14).
Spec updated 2026-11-23 at Tagir's request: `03` §13.1 (the whole-day run; projections only for strain),
§18 (B1), `04` §2, `05` §5.2, `07` §3 (rates for every event, buckets for fog events only, no `atTick`).

## M2-16 — The lantern frays on a fog probability            (status: spec updated)
Where: `03` §16 ("the lantern frays at the tick `fraysIf` holds in it (a gate, §13.3)"); `src/sim/step.ts`
phase 8; `docs/handoff/M2.md` (Marti live, road_both)
Question: Chapter 1's `fraysIf` is "Rokko left or ran home, and no meeting". With Marti live and Rokko in
the fog, the gate holds once the fog's P(Rokko left or ran home) passes 50%, and the timeline ends there
(seeds 3, 5, 10 under road_both: 13:05–13:20), although Marti has seen neither and Rokko is still there in
up to half the cases. Nothing was collapsed. Should the lantern fray only on what it holds as fact?
Options seen: (a) as specified: a gate on the fog's odds; (b) the lantern frays when `fraysIf` holds on
the lantern's own state only (fog quantities read as 0), i.e. only once the facts are collapsed; (c) the
lantern frays when the fog's P(anchor still reachable) falls below `fog.frayBelowPpm` (the glossary's
"probability is zero").
Chosen for now: (a), unchanged.
Answer: Tagir, 2026-11-23: (c). Spec updated (`03` §6 phase 8, §16, `05` §4): the lantern frays at the
first tick where the fog's P(alive) is below `fog.frayBelowPpm`, at once when `fraysIf` holds on its own
facts, and at the chapter's end without the anchor. Seeds 3, 5, 10 under road_both now run to the end.

## M2-17 — Vetting asks for facts an untouched Marti never sets            (status: spec updated)
Where: `04` §2 ("pass if, for every fact in the anchor's requirement tree … and requireFacts …")
Question: Vetting runs the untouched timeline (no pins). In it Marti stays home (B1), so the requirement
facts that need him out (`martiOut`, `martiOutInRain`, …, `anchor.meeting`) are 0 in every candidate, and
every seed fails: vetting then always keeps the requested seed. This was so with fogged Marti too.
Options seen: (a) vet only the requirement facts that do not depend on Marti, plus `requireFacts`
(Chapter 1: the crew, the rain, Rokko under the boat); (b) vet with a pin set that sends Marti out
(e.g. `lure_primed`) instead of the untouched timeline; (c) vet only `vetting.requireFacts`.
Chosen for now: none (vetting is not built yet).
Answer: Tagir, 2026-11-23: the wording was wrong: an untouched timeline can do nothing. Each seed must
be solvable with the player's actions and have at least a portion of its authored storylets reachable
with them. Chosen: reference solutions (recorded solutions run as whole-day runs; solvable if one reaches
the anchor; story if their runs enter at least `vetting.minStoryletShare` of the authored storylets).
Spec updated: `04` §2, `05` §4. Tagir: the story threshold is "min(2, 10%)" (`vetting.minStorylets` 2,
`vetting.minStoryletSharePerMille` 100); the recorded solutions stay the three pin sets for now (they can
be wildly different). The glossary's "Seed vetting" row is rewritten at Tagir's request; copy it into the
master glossary.
Note: a run that reaches the anchor has entered all 7 main storylets, so "story" always holds once a seed
is solvable; counting side storylets only would make it bite.
Fray (same day): Tagir pointed out that the anchor's reachability cannot be computed (it depends on the
player's future actions). The fray never computes it: it is the chapter's point of no return
(`fraysIf`). `03` §16 and the glossary's "Fray" row reworded to say so.

## M2-18 — Chapter 1's point of no return: the boat leaves            (status: content changed; follow-ups open)
Where: `src/content/data/ch1/anchor.json` (`fraysIf`), `storylets.json` (Rokko's leaving), `world.json`
(`ticks`), `05` §5.2 (B7)
Decision: Tagir, 2026-11-23: Rokko does not go home. He waits, and a couple of hours after the rain is
over (closer to midnight) he leaves with the boat for the sea. The player has to get Marti there before
that. Rokko is unwatched until they meet, so the fog never declares his waiting over; a departure timed
from the rain's stop is a world fact the lantern holds concretely, so the fray is exact.
Spec updated: `01` §1 and §3, `03` §16, `05` §1, glossary "Fray".
Content changes this needs (Tagir's files, not made by the coding model):
1. `anchor.json` `fraysIf`: the boat has left (a new fact) and no meeting, instead of
   `rokkoLeft`/`rokkoRanHome`.
2. `storylets.json`: Rokko's leaving (`rokkoLeft`, `rokkoRanHome`, his `goTo` to the netmaker's attic,
   lines ~324–329) replaced by the boat leaving a fixed time after `rainStopped` (a world timing the
   lantern holds, not Rokko's free choice).
3. The timing: the rain stops between 13:20 and 17:00, so "a couple of hours after" is about
   15:20–19:00; "closer to midnight" would need a longer delay and a longer day than `world.ticks` 900
   (05:40–20:40).
4. B7 (`late_lure` at 17:30 frays on 45 of 50 seeds) may no longer hold with a later departure.
Answer: Tagir, 2026-11-23: edit the content; the rain starts around 17:00 and ends around 22:00.
Done (at Tagir's request): `world.json` rain windows 16:30–17:30 and 21:30–22:30, the day to 00:40
(`ticks` 1140); detector `boat_sails` emits `boatLeft` 120 dry ticks after `rainStopped`; `fraysIf` is
`boatLeft` without the meeting; Rokko no longer runs home or climbs back to town (`runs_home`, `left`
and their text removed); from the beach or under the boat he `sails` when the boat leaves (text: a
writer marker). Engine: a detector naming no cat runs in the lantern (decisions.md). Golden files
updated for this. Headless runs with Marti live: every day frays at 23:23–23:30.
Open follow-ups (Tagir's content):
- the `05` §5.1 pin sets were timed for the midday rain: under `road_both` Marti goes out at 13:05 but
  no seed of 1–4 reaches the anchor (Rokko goes under the boat only when it rains);
- the roadworks race: the crew reach 800 units long before a 17:00 rain, so the road is rarely
  blocked and `blocked_road` (a main storylet) rarely happens;
- the charge floor comes at rain start (17:00), so the lure is affordable late in the day;
- B2–B7 and calibration need measuring again once the pin sets are retimed.
Follow-ups answered (Tagir, same day): the lure is available only at rain, since Marti leaves only after
the rain starts (`powers.json` lure `availableWhen: { fact: rainStarted }`, `04` §3.2); the roadworks are
longer: 1740 units instead of 800, the work done by the rain's start in 43% of reference days (the old
untouched blocked rate; 100 seeds, 1473–1969 units at rain start). Pin sets retimed (`05` §5.1): the
lure at 17:35 (715), its primes kept as far before it (570, 700), `late_lure` at 23:58 (1098); B2–B4
read "by 19:00". Check, 8 seeds of road_both: anchor reached 3 with Marti live, 2 in the reference;
the road blocked in 6 of 8 reference days.

## M2-19 — totalPressure without the fogged cats            (status: open)
Where: `03` §15.2 ("`totalPressure`: the summed pressure of all live cats plus the expected pressure of
the fogged ones"); `src/sim/observe.ts` (`watch`), marked `QUESTION(M2-19)`
Question: the fog does not track pressure (decisions.md, M2: pressure and `touchedBy` of fogged cats are
not computed), so a watched fact has no expected pressure for fogged cats.
Options seen: (a) the live cats' sum only; (b) a mean-field pressure per fogged cat (pressure from pins
landing on its chain, decaying as in `03` §11), mixed over the cases.
Chosen for now: (a). It only matters once payouts and the UI read `totalPressure` (M3).
Answer:

## M2-20 — What an imposed fact compares            (status: open)
Where: `03` §15.5; `src/sim/observe.ts` (`imposed`), `src/sim/lantern.ts` (`advance`), marked
`QUESTION(M2-20)`
Question: §15.5 compares the lantern's view with the watched fact part by part. Three parts are
simplified:
1. a live cat the edit changed (it was placed before the fact's tick and no longer stands or acts as
   watched): §15.5 re-derives "its chain from the tick it diverged"; the lantern keeps no such chain, so
   the fact reopens;
2. cats the re-run shows that the fact did not: ignored (the fact said nothing about them);
3. the parts are P's own position, activity and interrupt and each seen cat's node and activity; the
   fact's storylet states, detectors, events and facts are not compared (they follow from the cats in the
   cases tested so far).
Options seen for 1: (a) reopen (chosen for now); (b) keep each live cat's fog chain from its placement
on, so an edit can force it back. Measured on the tiny world with the approximations off (seeds 1–8, a
`scare` at street.a at tick 2 as the edit, 40 ticks of the hero's facts each): 31 facts that the edit
changed held by forcing a cat back, 59 reopened (54 of them on seeds 1, 2 and 8, where the edited cat was
already live or the watched state had no mass left).
Answer:

## M2-21 — Frames' samples and smoothing            (status: answered)
Where: `03` §16 (`samples` by backward sampling), `03` §14 step 3 (smoothing, deferred to frame requests); `src/sim/frames.ts`
Question: backward sampling a fogged cat's chain and smoothing past ghosts both need to know which chain state led to which. The fog does not record it: every step merges equal states, and cases split and merge. How should M2 item 9 build them?
Options seen: (a) defer both to M5, where the renderer's focus layer is their only user; frames carry filtered ghosts; (b) approximate backward sampling without records (a state that could lead to the later one, by mass), no smoothing; (c) record per step the joint mass (state before → after) per case and cat, and case lineage: exact samples, and smoothing at the end of each re-run, at a cost to the fog's hot path and memory.
Answer: Tagir, 2026-11-23: (a). Frames in M2 have no `samples` and are not smoothed; both are built in M5.

## M2-22 — A simulated-only world for testing            (status: answered; to schedule)
Where: `03` §13 (fog and lantern), `src/sim/lantern.ts`, tuning; the UI's drawing of the unwatched world (M5)
Question: Tagir asked for an option to switch the unwatched world between the wave and plain
simulation, the unwatched part hidden as in a fog of war. What would it be, and when?
Sketch: every cat live from tick 0 (M1's `step`, already the lantern's), none in the fog, live cats
never released, behind a tuning switch (for example `world: 'wave' | 'concrete'`; not "fog of war":
"fog" already has two meanings in the glossary). Everything downstream works unchanged: frames (one
ghost at 1 000 000 per cat), the re-run, checkpoints, the frontier limit, the worker; requirement odds
become 0 or 1 000 000. `lantern.ts` needs a separate "keep live" set: `followed` also drives the frontier
limit and placement. What it changes in play: the unwatched world is fixed by the seed, no ghosts, Gaze
becomes a peek, and vetting and the `05` §5 balance numbers are measured on the wave only. Uses: A/B
playtests of the wave, a fallback if the re-run budget (`07` §4) fails, debugging.
Answer: Tagir, 2026-11-23: add a simulated-only version for testing. Not part of M2 item 11; when to
build it (after item 13's budget numbers, or with the playtest build) and what the UI draws in it wait
for Tagir. Needs a spec line and a glossary name.

## M2-23 — How much to calibrate on test content            (status: answered)
Where: M2 acceptance ("Quick calibration passes. `npm run calibrate` passes"); `07` §3; M2 item 12
Question: Chapter 1's content is test content, replaced for the alpha. Calibration measures the fog
against the reference simulation, not the content, but some misses come from an approximation not
fitting this content. How much of item 12 to do now?
Options seen: (a) the tool and a baseline: a parallel runner, one full run recorded, only general fog
bugs fixed, content-specific misses recorded and not chased, the quick test in `npm run check` only if it
passes; (b) as briefed, every miss chased; (c) defer calibration to the alpha content.
Answer: Tagir, 2026-11-24: (a). M2's calibration acceptance item is relaxed accordingly.
Baseline (2026-11-24, 400 seeds, default knobs; tables in `docs/handoff/M2.md`): every event passes its rate
in both pin sets but `roadBlocked` under `untouched` (28.9% vs 40.5%); every bucket passes but the low ones
of `roadBlocked`: 0–10% sees 28.7% (`road_both`) and 17.3% (`untouched`) blocked where the fog says about
1%, and 20–30% (`untouched`) 36.7% vs 25.0%. The fog is overconfident on the crew's race against the rain:
the counter held as mean and variance (`03` §13.6, M2-8). The quick run (60 seeds) fails on `untouched`
(the same 0–10% bucket, and `shopClosedEarly` 80–90%, which passes at 400 seeds), so it stays out of
`npm run check`.
Follow-up (answered 2026-11-25): Tagir chose to fix the road after all. Counters carried by chains and race
storylets (`fog.counterByChain`, on), the merge fix, the race-split fact fix and forecasts in calibration
(M2-26). Final 400 seeds: every rate passes, the low buckets pass; the fog under-predicts a blocked road by
about 10–16 points in the middle buckets (the pace gap). Tables in `docs/handoff/M2.md`.
Update 2026-11-25 (M4, knobs 1000/3 kept): the full run is as at the end of M2 (rates pass; `road_both`
misses roadBlocked 10–20%, 50–60%, 70–80%, `untouched` 60–70%). The quick run (60 seeds) passes: no bucket
misses, since those buckets hold fewer than 20 pairs at 60 seeds; its rate misses (`road_both` roadBlocked
46.0 / 60.0, martiOut 58.3 / 71.7; `untouched` shopClosedEarly 81.0 / 68.3) are not decisive there. As the
brief says, it joined `npm run check` (about 4 minutes on every core).

## M2-24 — A storylet state and the flag its own onEnter set            (status: open)
Where: `03` §13.6 (storylets and flags in the fog); `src/sim/fog.ts`; found 2026-11-24 on the tiny world
Question: the fog holds a flag as P(set) per case, independent of the storylet state that set it.
Tiny `shift`: entering `chosen` sets `busy` at the boss for 10 ticks, and `chosen`'s only exit (auto,
back to `idle`) waits for `not busy`. In single histories `shift` stays in `chosen` 10 ticks. In the fog
half the storylet enters `chosen`, so `busy` is 50%, so the exit sends half of `chosen` back each tick
(50%, 25%, 12.5% …); `idle` keeps the boss the actor of an open choice, so 98% of pal's free decisions
are blocked and pal keeps working. Probably most of M2-13's stochastic mismatch. No Chapter 1 storylet
has a state whose exits read what its own onEnter set (checked), so the road is not affected.
Options seen: (a) for the mass in a storylet state, read what that state's own onEnter set for sure as
certain (with its ttl from the entering tick); (b) leave it until content needs it.
The flag's length is already kept (each flag part has its `until`); what is missing is the link between
the flag and the mass that set it: the exit reads the case's P(busy) = 50% where the mass in `chosen` has
P(busy) = 100% until tick 21. Sharper (a), 2026-11-25: while a state's own onEnter flags with a ttl can
still hold, keep that state's mass split by entry step (2–3 cohorts for a 10-tick flag at 5-tick
steps) and read its exit gates per cohort with those flags certain until entry + ttl. The same lesson as
the road (M2-8): keep the history of the mass with the mass, not as one number per case.
Tagir, 2026-11-25: keep this and M2-25 tracked into later milestones; fix before content needs them.
Answer:

## M2-25 — A fogged walker does not notice an edge that closes            (status: open)
Where: `03` §13.2 (walks in chains); `src/sim/fog.ts`; found 2026-11-24 on the tiny world
Question: a fogged cat walks a path fixed when it started; an edge whose `when` stops holding meanwhile
does not block it. In single histories the cat is `blocked` at the edge and decides again (tiny: the
gate closes when `workDone`; 21% of pal's histories turn back at tick 26, the fog's none do). In Chapter 1
the only such edge is `roadworks_pass`, closed by `roadBlocked`, after the race.
Options seen: (a) at each step, mass about to cross an edge whose `when` fails (in ppm) stops there,
learns the edge closed and decides; (b) leave it until content needs it.
Tagir, 2026-11-25: keep tracked into later milestones; fix before content needs it.
Answer:

## M2-26 — Calibration when the run's protagonist observes the event            (status: answered)
Where: `07` §3 (each event's chance "by the end of the run"); `src/cli/calibration.ts`
Question: a whole-day run is a lantern run: what Marti perceives is placed and conditions the fog. With
`fog.counterByChain` on, the road's odds at the rain are honest (seed 20, `road_both`: 70% blocked, the
reference 81%), but the lure takes Marti out at 17:35; at 17:53 he perceives a crew cat, it is placed,
and the case where the road is not done drops to 0. The end-of-run p (about 0) is then what his run
happened to see, not a forecast, while the reality is an independent history: 57 `road_both` seeds sit
at p ≈ 12.6% with 64.9% blocked. Before the switch the fog was about 99% "done" at the rain, so his look
rarely moved anything. How should calibration read p?
Options seen: (a) the forecast: the event's chance just before the protagonists' perception first moves
it by `calibration.observedPpm`, else its chance at the end; every seed stays in the check; (b) leave
the seeds where the run observed the event out of the bucket check; simpler, but it drops the seeds
players create (cards, the lure) and may bias the rest.
Answer: Tagir, 2026-11-25: (a). `advance` and `wholeDayRun` take an observer that sees each tick's fog
before evidence; `calibration.observedPpm` = 10 000.

## M3-1 — Links on demand            (status: answered; revisit later)
Where: `03` §15.3; `src/sim/lantern.ts` (`wouldLinks`)
Question: Chapter 1's two link slots are taken at load (`roadDone`, `crewArrived`), so links on demand
could never build a link there; building them means a per-fog link list, a "source" link kind and a
replay of the fog from the source's window. Build now?
Answer: Tagir, 2026-11-25: no. Keep the contributor heaps. A perceived consequence whose cause is only in
the fog is a local cause (`stats.localCauses`) and is recorded with the heap's top contributor and its
weight (`stats.wouldLink`); M4 reports the local-cause rate and how many had a strong contributor (say
above 20%). Optional, not built: let a local cause name the top contributor for the story only, behind a
knob off by default (it can contradict itself if that cat is seen elsewhere later; nothing displays it
before M5). One test for the fallback. Spec: `03` §15.3 "deferred past the demo; link slots are fixed at
load" (done).
Revisit when M4's numbers are high, or a later chapter has a free slot. A cheaper first step then: a
load-time link observed down to one case frees its slot from that tick (if Marti sees the crew arrive,
`crewArrived` no longer needs one); building a link still needs the replay from the source's window, but
a window after the slot frees keeps the replay short.
Built (M3): the detected consequence is the `heard` a placed cat takes from the fog with a heap source (a
storylet's own state events excepted).

## M3-2 — A pin at the edge cut by its own re-run            (status: answered, spec updated)
Where: `04` §6 (frontier limit) and §4 (pins past the new edge); `src/sim/recompute.ts` (`rerun`)
Question: a pin placed at the edge tick E that starts a never-watched main storylet in the step from E:
the limit as built in M2 ("every tick up to the edge shows no new main storylet") put the edge at E − 1,
then §4 moved the new pin to E − 1, which started the story earlier again; the playhead ended past the edge.
Options seen: (a) for the main-storylet rule, the edge is the tick whose step shows the new story;
(b) exempt the edit's own pins from moving; (c) decide later.
Answer: Tagir, 2026-11-25: (a). `04` §6 updated; M2's frontier-limit test now expects the edge at the
tick of the first watched fact showing `lured` (it was the tick before).

## M3-3 — Repeat by default reopens Marti's morning on seed 1            (status: tracked as test matter)
Where: M3 acceptance ("pin `tea_break` on `town.roadworks` at 07:00 … every watched fact of Marti's
morning still holds and nothing reopens"); `tests/player/ch1.test.ts`
Measured (seed 1, Marti watched 05:40–10:00, then `tea_break@town.roadworks` at 07:00): the re-run reaches
10:00 again, every fact before 09:00 holds, and 49 facts from 09:00 on reopen (`03` §15.5: Marti's own
part differs). Trace: with the tea break the crew break at 07:20, Semyon tells the tale, and Marti, who
holds a role in `crew_chatter`, overhears it through the window (M1-2): `crew_chatter.tale` at 100,
`overheard` at 101, `scoffed` at 114; his `questionItch` is 1000 at 09:00 instead of 730, and
`look_out_window` (which reads it) keeps him from `nap_sunbeam`: he reads instead. The edit genuinely
changes his morning. The same at 07:00 or 08:00; at 08:40 from 08:55. `box` on the roadworks at 07:00
reopens nothing, and the test shows repeat by default with it.
Also seen: the fact at 07:21 that the edit left standing (Marti in the same place, same activity) still
says he heard nothing, though in the new timeline he overheard the tale then: a kept fact keeps its old
summary, because only position and activity are compared (M2-20 part 3).
Options seen: (a) accept: the acceptance item assumed an edit Marti cannot notice, and this content lets
him notice it; (b) M1-2 (b) or (c), so the tale reaches Marti only through the window's real perception
(then it may still reach him: he is at the window); (c) change the brief's edit for the test.
Chosen for now: the test asserts what happens (edge 10:00, facts before 09:00 hold, the trace) and shows
"nothing reopens" with `box`.
Answer: Tagir, 2026-11-25: not blocking; track it as test matter. Tests assert what the seed does; notes
where tests meet it: `07` §5, the M7 brief.

## M3-4 — Vetting passes seeds whose recorded solutions use a card the player cannot find            (status: tracked as test matter)
Where: `04` §2 (vetting runs the recorded solutions' pins directly); `05` §5.1 (`lure_primed` pins
`empty_teapot`, found only by watching Marti voice `teaCraving`, `05` economy `discoverHook`)
Measured: seed 1 vets live to 49598663. There Marti's `teaCraving` starts at 632, above its voice threshold
(600); a voice needs an upward crossing, so it never voices in the watched day and `empty_teapot` is never
found. The three recorded solutions all pin it. The seed is still solvable: with that craving
(`noFreshTea`) and the tale he overhears (`itchy`) Marti already has two primes, and the unprimed lure
alone brings him out at 17:45 and to the meeting at 18:50 (the road is blocked anyway). So on this seed
01 §3's "he goes to the door and turns back; prime him" beat does not happen, and the morning cards on
the roadworks change nothing. The scripted playthrough (`tests/player/playthrough.ts`) follows what the
seed does.
Options seen: (a) vetting also checks that each pin's card can be obtained in the run (inspected objects
are always reachable; hook cards need the hook voiced); (b) recorded solutions use only cards from
objects; (c) a hook whose seeded value starts above `over` voices once early (content or engine); (d)
accept, and judge the teaching beats per seed in M4.
Answer: Tagir, 2026-11-25: vetting cannot check every player action, even on the tiny world, so (a) is
out. Not blocking; track it as test matter: scripted playthroughs follow what the vetted seed does.
Notes where tests and playtests meet it: `07` §5, the M7 and M8 briefs, the M4 brief.

## M4-1 — Live vetting's coarse knobs pass seeds that play at the default knobs cannot solve            (status: answered, fixed)
Where: `04` §2 ("a typed or bookmarked seed is vetted live … with the coarser fog knobs `tuning.vetting.fog`");
`05` §4 `vetting.fog` (20 000 / 2); `src/sim/vet.ts` (`vettingContent`); the golden playbacks
(`tests/golden/*.s2`, `*.s3`)
Measured: requested seeds 2 and 3 pass live vetting as they are (a recorded solution reaches the anchor at
20 000 / 2). Played at the default knobs (1000 / 3), no road set reaches the anchor on either:
on seed 2 (`road_both`) Marti goes to the door at 17:35 and back inside at 17:50 (`door_lure.back_inside`);
on seed 3 (`road_tea`) he goes out, meets the barrier, reaches the beach at 18:03 and is soaked, but no
`chain_on_beach` follows; both fray when the boat sails (00:30). The offline list, vetted at the default
knobs, rejects both (`vetted-seeds.json` starts 4, 6, 7). Two causes are possible, not separated yet:
`fog.bands` also sets live cats' decision-trigger keys (decisions.md, 2026-11-22), so 2 bands simulate a
different Marti, not only a coarser fog; and Marti's conditions read the coarser fog's odds.
Options seen: (a) `vetting.fog` keeps the game's `bands` and coarsens only `minStatePpm` (measure its time
and agreement with the offline list); (b) live vetting uses the default knobs (slower behind the loading
indicator: tens of seconds to minutes per typed seed); (c) accept: a typed seed is a sufficient check of a
different world, and may fray.
Chosen for now: (c), unchanged; golden playbacks and `npm run balance` vet live as the worker does, so
B6 on seeds 1–50 includes such seeds.
Answer: Tagir, 2026-11-25: fix it. Done: live vetting runs at the game's own fog knobs; `vetting.fog` and `vettingContent` are gone (`04` §2, `05` §4). Measured (requested 1–6, 18 runs side by side): the game's knobs take 33–156 s (1 to 5 candidates); 3 bands with the coarse state floor still disagreed with them on seeds 3 and 5, so only the game's knobs vet the world that is played. A typed or bookmarked seed now waits tens of seconds to a few minutes behind the loading indicator; a new game draws from the offline list (already vetted at these knobs; 4 and 6 checked again). Golden playbacks of seeds 2 and 3 updated with this as the reason: they vet to 3762896133 and 3754479982, and every road set reaches the anchor on both. Tests: `tests/sim/vet.test.ts` (a vetted seed is solved by a recorded solution played at the game's knobs), the golden files' "solvable".

## M4-2 — B2 and B3: the "unprimed" lure is usually primed once already            (status: answered, spec updated)
Where: `05` §5.2 B2 (`lure_unprimed`: P(martiOut by 19:00) ≤ 15%), B3 (`lure_one_prime` ≤ 35%);
`ch1/world.json` primes; `ch1/hooks.json` `questionItch`; `ch1/storylets.json` `door_lure`
Measured (`npm run balance`, seeds 1–50 vetted live, knobs 1000/3): B2 **30.0%** (15/50), B3 **64.0%**
(32/50); B4 passes (82.0%, ≥ 60%).
Trace (scratch run of the same 50 vetted seeds, Marti's gauges at 17:35 when the lure is placed):
`itchy` (questionItch ≥ 600) holds on 42 of 50 seeds (median 843, 10 seeds at the cap 1000), `noFreshTea` on
4, `lightPockets` on none. The itch rises 1 every 2 ticks while Marti stands at a window and 80 per
`chatter.heard`, and decays only 1 every 6 ticks, so a day at home raises it. So `lure_unprimed` is one prime
on 38 seeds (14 go out) and two on 4 (1 out), none out with 0 primes (8 seeds); `lure_one_prime` (the junk
special sets `lightPockets`) is two primes on 38 (24 out), three on 4 (4 out), one on 8 (4 out).
`door_lure`'s exits score `primeCount × 2`, so the property's "unprimed" and "one prime" are one and two
primes in practice. Seed 1 (vetted 49598663): itch 1000 at 17:35, out at 17:45.
Options seen: (a) change the content (the itch's window rise or decay, or the `itchy` threshold) so the
morning does not prime him; (b) change B2/B3 to count primes as they stand at the lure; (c) accept.
Chosen for now: none; content and tuning unchanged.
Answer: Tagir, 2026-11-25: accepted: Chapter 1 is placeholder content. B2–B7 stay measured (`npm run balance`, printed in each handoff) and are not enforced. What is enforced is a minimum bar: the chapter is solvable on every vetted seed, and every card of the demo deck visibly does something (`05` §5.2, `07` §1; tests `tests/golden/playback.s*.test.ts` "solvable" and `tests/sim/cards-visible.test.ts`). Spec updated. Measured again after the M4-1 fix (seeds vetted at the game's knobs): B2 34.0%, B3 66.0%, B4 94.0%, B5 no subset ≥ 50% (`tea_break` 44.0–44.9%, the rest 29.0–29.8%), B6 44 / 39 / 44 of 50, B7 50/50; a recorded solution solves every one of the 50 seeds (`docs/handoff/M4.md`, After review).

## M4-3 — B5: no subset of the road pins blocks the road on average            (status: answered, spec updated)
Where: `05` §5.2 B5; `ch1/cards.json` (`tea_break`, `box`, `sudden_flea`, `something_shiny`);
`ch1/map.json` `town.roadworks` (tags `outdoor`, `box`); `ch1/hooks.json` `boxPull`
Measured (`npm run balance`): P(roadBlocked) at the first fog step that sees the rain, mean over 50 seeds,
`lure_primed` plus: `tea_break` 42.8%, `box` 29.1%, `sudden_flea` 29.1%, `something_shiny` 29.9%; any subset
with `tea_break` 42.8–44.0%, any without it 29.1–29.9%. **0 subsets reach 50%** (B5 needs at least 3, and no
single pin).
Trace: the reference simulation agrees (scratch: 10 vetted seeds × 20 streams of `runHistory`, road blocked
by the day's end): base 40.0%, `tea_break` 57.5%, `box` 40.0%, `sudden_flea` 40.5%, `something_shiny` 39.0%.
So it is the content, not the fog. (The fog reads 11–15 points lower than these histories, on a different
seed sample: the pace gap of M2-8.)
- `box` changes nothing at all (the crew's activities 08:00–12:00 are identical): `town.roadworks` itself is
  tagged `box` (and holds the `crate_stack`, tagged `box`), so `boxPull`'s rise (+6 a tick at a `box` place)
  keeps every crew cat at the cap 1000 all morning without the card (seed 49598663 stream 1: 1000 at 09:00
  with and without it); the card's `boxHere` flag adds nothing, and `work_road` still outscores `sit_in_box`.
- `sudden_flea` grooms one cat for 6–15 ticks (0.3% of the crew's morning), `something_shiny` attracts for 20
  ticks (0.4%): against 1 740 units of work over the day, too little to matter.
- `tea_break` raises the crew's tea break share from 12.1% to 18.1% of the morning: the only lever.
Options seen: (a) content: the roadworks' `box` tag (or the crate) and the other cards' strength; (b) change
B5; (c) accept.
Chosen for now: none; content and tuning unchanged.
Answer: Tagir, 2026-11-25: accepted: Chapter 1 is placeholder content. B2–B7 stay measured (`npm run balance`, printed in each handoff) and are not enforced. What is enforced is a minimum bar: the chapter is solvable on every vetted seed, and every card of the demo deck visibly does something (`05` §5.2, `07` §1; tests `tests/golden/playback.s*.test.ts` "solvable" and `tests/sim/cards-visible.test.ts`). Spec updated. Measured again after the M4-1 fix (seeds vetted at the game's knobs): B2 34.0%, B3 66.0%, B4 94.0%, B5 no subset ≥ 50% (`tea_break` 44.0–44.9%, the rest 29.0–29.8%), B6 44 / 39 / 44 of 50, B7 50/50; a recorded solution solves every one of the 50 seeds (`docs/handoff/M4.md`, After review).

## M4-4 — B6: the road solutions fray on 15–18 of 50 seeds            (status: answered, spec updated)
Where: `05` §5.2 B6 (`road_tea`, `road_box`, `road_both` do not fray on at least 45 of 50 seeds)
Measured (`npm run balance`): does not fray `road_tea` **35/50**, `road_box` **32/50**, `road_both`
**35/50**.
Trace (scratch: `road_both`'s whole-day runs of its 15 fraying seeds, the lantern's storylets at the end):
- Marti never goes out (the lure takes him to the door; `door_lure` back to `home`): requested 2, 5, 8,
  18, 32, 42, 45, 47 (8 seeds); 6 of them (2, 5, 8, 18, 32, 42) are among B4's 9 seeds without `martiOut` by 19:00;
- out, road blocked, but `blocked_road` ends in `turn_home` (30, 36) or `detour_square` (16, 41): 4 seeds;
- out, road blocked, toward the Sea Steps and on the beach, but no `chain_on_beach` (3): 1 seed;
- out, road open, `usual_route` ends in `go_home` (9, 46): 2 seeds.
Every one frays when the boat sails (`boat_sails`, between 23:31 and 00:30). Five of the eight "never out"
seeds are their own vetted seed (2, 18, 32, 42, 45 pass live vetting as they are); the offline vetting at
the game's knobs rejects 2, 18, 32 and 42 (M4-1) and passes 45 (that list was made in M2, before M3's
changes). `road_box` frays on 18 seeds, 3 more than `road_tea`; `box` alone leaves the
road as `lure_primed` does (M4-3).
Options seen: (a) content (the lure's pull on a primed Marti, the detour and turn-home exits, the chain);
(b) vetting at the game's knobs (M4-1), so a vetted seed is one the solutions solve as played; (c) change
B6; (d) accept.
Chosen for now: none; content and tuning unchanged.
Answer: Tagir, 2026-11-25: accepted: Chapter 1 is placeholder content. B2–B7 stay measured (`npm run balance`, printed in each handoff) and are not enforced. What is enforced is a minimum bar: the chapter is solvable on every vetted seed, and every card of the demo deck visibly does something (`05` §5.2, `07` §1; tests `tests/golden/playback.s*.test.ts` "solvable" and `tests/sim/cards-visible.test.ts`). Spec updated. Measured again after the M4-1 fix (seeds vetted at the game's knobs): B2 34.0%, B3 66.0%, B4 94.0%, B5 no subset ≥ 50% (`tea_break` 44.0–44.9%, the rest 29.0–29.8%), B6 44 / 39 / 44 of 50, B7 50/50; a recorded solution solves every one of the 50 seeds (`docs/handoff/M4.md`, After review).

## M4-5 — Short interrupts on fogged cats do not show            (status: answered, deferred to the playtests)
Where: `03` §13.2 (interrupts in chains, counted in fog steps), §13.6 (pins on fogged targets);
`tests/sim/cards-visible.test.ts`; found while probing for the minimum bar (M4)
Measured (seed 4, card at 08:00 on each cat, frames of the next three hours compared with no card):
`sudden_flea` (groom 6–15 ticks) changes some fogged cat's visible ghosts, on 11 cats; `tea_break`
(stretch 2–4 ticks, plus a craving shift) and `something_shiny` on a cat (look at glint 3–6 ticks,
plus an itch shift) change nothing visible on any cat. On Marti, willpower reduces them to nothing,
as intended (`03` §8.4). An interrupt shorter than a fog step (`fog.stepTicks`, 5) may be lost:
the fog counts it in whole steps and frames inside a step read that step's distribution. Not traced;
it does not stop either card passing the minimum bar (both pass through other branches).
Options seen: (a) trace it (one fogged cat, a 3-tick interrupt at a step boundary, its ghosts tick by
tick) and fix the fog if it drops what a live cat would show; (b) leave it until playtests show the
cards feel dead on other cats.
Chosen for now: none; tracked with the other open fog issues.
Answer: Tagir, 2026-11-25: (b), leave it until the playtests (M8, Gate A): trace it then if the cards feel dead on other cats.

## M5-1 — How to build frames' samples and smoothing            (status: answered)
Where: `03` §14 step 3, §16; `docs/milestones/M5-viewer.md` item 8; M2-21
Question: the fog keeps no record of which state led to which. (a) Record every transition in the fog's
hot path (exact; estimated 15–30% off the re-run); (b) approximate: keep per tick each case's links and
weight and each fogged cat's ghost masses, and treat "could have come from" (same place and activity, or
within one fog step's walk) as the transition; sample backward by mass from the edge.
Answer: Tagir, 2026-11-25: (b), "just a cloud of possible positions".

## M5-2 — `?dev=1` was already the M1.5 inspector            (status: answered)
Where: `docs/milestones/M5-viewer.md` item 6; `docs/milestones/M1.5-inspector.md`
Answer: Tagir, 2026-11-25: merge the inspector into `?dev=1`: one dev page, with a seed field as the
inspector had.

## M5-3 — The seed before M7's new-game flow            (status: answered)
Where: `04` §2; `docs/milestones/M7-chapter-flow.md` item 4
Question: live vetting of a typed seed and the new-game flow are M7's. Which seed does M5's viewer play?
Answer: Tagir, 2026-11-25: until M7, the viewer plays the first seed of `vetted-seeds.json`, and the dev
page has a seed field whose value is played as typed (not vetted). Chapter 1 is placeholder content.

## M5-4 — L is both "shuttle forward" and "hold the lure"            (status: answered, spec updated)
Where: `06` §8
Answer: Tagir, 2026-11-25: L is shuttle forward only. `06` §8 updated: G holds Gaze; the lure is held
from its button (or Tab to it), with no letter key of its own.

<!-- Gate notes and answers go above this line. -->
