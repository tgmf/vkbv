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

<!-- Gate notes and answers go above this line. -->
