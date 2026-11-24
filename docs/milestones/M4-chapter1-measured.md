# M4 — Chapter 1, measured

**Goal:** the Chapter 1 content runs as a wave end to end, its golden playbacks are
recorded, and its balance is measured and reported so Tagir can decide.

**Read first:** `05-chapter1-content.md`, `07` §2–§4, `01` §3, `docs/handoff/M2.md`
(items 12 and 13).

## Where M2 left things (2026-11-25)

- The pin sets are data in `src/content/data/pinsets.json` (M1.5); golden single
  histories exist (`tests/golden/single-history.test.ts`); B1 is in the invariant tests
  and B8 in `tests/ch1.test.ts`; `npm run balance` is still a placeholder.
- Calibration (B9) is a tool and a baseline (Tagir, M2-23): at 400 seeds every rate
  passes; `roadBlocked`'s middle buckets read 10–16 points low (the crew's pace gap); the
  quick run is not in `npm run check`. One full run takes 30–40 minutes on 20 processes.
- The re-run budget (`07` §4, `npm run bench`) with the default fog knobs (1000/3): 72 ms
  to the first frames (budget 100), 111 ticks/s (budget 120). Knobs that meet it
  (3000/3: 156 ticks/s; 1000/2: 138) have not been calibrated. Tagir allows precompute
  at chapter load (while the intro plays) if the budget needs it.
- A whole-day run takes about 11 s alone (20 s with every core busy); reuse the
  parallel runner of `scripts/calibrate.ts` for `npm run balance`.

## Build

1. Golden playbacks (`07` §2) for every pin set in `pinsets.json`, seeds 1 to 3, next
   to the golden single histories; `npm run golden:update` covers both.
2. Fog knobs: the re-run budget for every pin set and a full calibration, with the
   default knobs and with the candidates above. Report both; Tagir chooses (M2-1).
3. `npm run balance`: measures B2 to B7 over seeds 1 to 50 and prints a table with
   each property, its measured value, and pass or fail. It does not fail the build.
4. B9: the full calibration table with the chosen knobs; the quick run joins
   `npm run check` only if it passes.
5. `npm run content:check -- --todos` lists every text key that still holds a writer
   marker; `-- --actions` lists every interrupt action and activity each cat can show
   (for the art brief).
6. The handoff note includes: the balance table; the full calibration table; re-run
   times (`npm run bench`) with the chosen fog knobs; cases, live cats and fog states per hour for `untouched` and `road_both`;
   and, for each failing balance property, what in the content causes it (traces,
   not opinions).

## Acceptance

- [ ] B1 and B8 pass on Chapter 1; B9's full table is in the handoff, each miss
      explained by a trace (M2-23: misses are recorded, not chased).
- [ ] Golden playbacks pass and are stable across two runs.
- [ ] `npm run balance` runs in under five minutes and prints every property.
- [ ] Every failing balance property is a question in `docs/questions.md` with its
      measured value and the trace that explains it. Content and tuning are
      unchanged.
- [ ] The re-run budget (`npm run bench`) holds for every pin set with the chosen fog
      knobs, or the handoff gives the numbers and the question is in M2-1.

## Out of scope

Any change to `src/content/data/ch1/`. Any UI.
