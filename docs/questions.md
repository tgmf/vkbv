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
Answer:

<!-- Gate notes and answers go above this line. -->
