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

<!-- Gate notes and answers go above this line. -->
