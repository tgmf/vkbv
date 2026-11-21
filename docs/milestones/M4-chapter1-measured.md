# M4 — Chapter 1, measured

**Goal:** the Chapter 1 content runs as a wave end to end, its golden playbacks are
recorded, and its balance is measured and reported so Tagir can decide.

**Read first:** `05-chapter1-content.md`, `07` §2–§4, `01` §3.

## Build

1. The pin sets of `05` §5.1 as `tests/golden/<name>.pins.json`.
2. Golden playbacks for every pin set, seeds 1 to 3 (`07` §2), and
   `npm run golden:update`.
3. `npm run balance`: measures B2 to B7 over seeds 1 to 50 and prints a table with
   each property, its measured value, and pass or fail. It does not fail the build.
4. Tests for B1, B8 and B9 (calibration) on Chapter 1.
5. `npm run content:check -- --todos` lists every text key that still holds a writer
   marker; `-- --actions` lists every interrupt action and activity each cat can show
   (for the art brief).
6. The handoff note includes: the balance table; the full calibration table; recompute
   times with the chosen fog knobs; cases, live cats and fog states per hour for `untouched` and `road_both`;
   and, for each failing balance property, what in the content causes it (traces,
   not opinions).

## Acceptance

- [ ] B1, B8 and B9 pass on Chapter 1.
- [ ] Golden playbacks pass and are stable across two runs.
- [ ] `npm run balance` runs in under five minutes and prints every property.
- [ ] Every failing balance property is a question in `docs/questions.md` with its
      measured value and the trace that explains it. Content and tuning are
      unchanged.
- [ ] The recompute budget holds for every pin set with the chosen fog knobs.

## Out of scope

Any change to `src/content/data/ch1/`. Any UI.
