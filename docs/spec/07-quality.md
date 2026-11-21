# 07 — Quality: tests, budgets, telemetry, release checks

## 1. Test layers

| Layer | Tool | What it covers | Runs in |
| --- | --- | --- | --- |
| Unit | Vitest | `sim` and `player` functions, content loading, i18n key checks | `npm run check` |
| Property | Vitest | the invariants in `03` §18 and `04` §10 over seeds 1 to 50 | `npm run check` |
| Golden | Vitest | headless playbacks of the pin sets in `05` §5 (§2 below) | `npm run check` |
| Calibration | Vitest | shown probabilities against outcomes (§3) | `npm run check` (small), `npm run calibrate` (full) |
| Balance | script | the B-properties of `05` §5.2, measured and printed | `npm run balance` |
| Browser | Playwright | the app loads, a scripted first playthrough reaches the anchor, no console errors | `npm run e2e` |

Rules:

- `sim` and `player` need a test for every branch of every effect, primitive,
  condition, score term, exit kind and clause kind, and for every refusal reason of
  every action.
- UI components need no unit tests. Browser tests cover them through `data-testid`
  and the accessible target list (`02` §4).
- A bug fix starts with a failing test that reproduces it.
- Balance properties become tests only when Tagir says so in `05` §5 (`B1`, `B8`, `B9`
  are tests from the start).

## 2. Golden files

For each pin set in `05` §5.1 and seeds 1, 2, 3: `tests/golden/<name>.pins.json`
holds the pins; `tests/golden/<name>.s<seed>.expected.json` holds the result of a
headless playback (vetting on, Marti followed, observing every tick from 0 to the
end):

```json
{
  "seed": 1,
  "vettedSeed": 1,
  "end": { "kind": "anchor", "tick": 534 },
  "watchedHash": "8 hex digits",
  "checkpoints": { "60": "…", "120": "…" },
  "watched": { "door_lure.at_door": 447, "door_lure.out": 452, "blocked_road.facing": 461 },
  "historyCount": { "60": 40, "120": 87 }
}
```

`watchedHash` is `hash32` of the canonical JSON of the full watched-facts list.
`checkpoints[t]` is `hash32` of the canonical JSON of the wave at `t` as a sorted list
of `[stateHash, weight]`. `watched` lists the first watched tick of every storylet
state and detector. The readable parts exist so a changed hash shows what moved.

`npm run golden:update` rewrites the expected files. The handoff note must say which
files changed and why. Never edit an expected file by hand.

## 3. Calibration

The wave is only worth showing if its probabilities are honest.

`calibrate(seeds, pinSet, atTick, events)`: for each seed,

1. compute the wave with the pin set, conditioning **off**, and read the predicted
   probability `p` that each event in `events` has happened by the chapter's end, as
   seen from tick `atTick` (the frame's requirement and fact probabilities);
2. run one **reality**: a single history (`03` §12.4) in stream `100000 + seed`,
   which is not among the wave's streams, and record whether each event happened.

Group all `(p, outcome)` pairs into ten buckets by `p`. For every bucket with at least
`calibration.minPerBucket` pairs, the mean of `p` and the share of outcomes that
happened must differ by at most `calibration.tolerancePpm`.

| Knob | Start |
| --- | --- |
| `calibration.seeds` (full run) | 400 |
| `calibration.seedsQuick` (in `npm run check`) | 60 |
| `calibration.minPerBucket` | 20 |
| `calibration.tolerancePpm` | 100000 |

Pin set `road_both`, `atTick` 140 (08:00), events `crewArrived`, `roadBlocked`,
`shopClosedEarly`, `rokkoUnderBoat`, `martiOut`, `anchor.meeting`. A second run uses
`untouched` at tick 20. A calibration failure is a bug in the wave, not in the
content: never change content or tolerance to make it pass.

## 4. Budgets

| What | Budget | Checked by |
| --- | --- | --- |
| Recompute after an edit at 12:00 with `waves.cap` histories, in a worker | median ≤ `budgets.recomputeMs` (100 ms) on a developer laptop; the test fails above 3× that | Vitest (Node, same code as the worker) and the debug panel |
| Observe one tick in playback | ≤ 5 ms median | Vitest |
| Frame time while scrubbing, all 12 cats with ghosts | 60 fps on a mid-range laptop; no long task over 50 ms | manual, noted in the handoff |
| JavaScript, graybox build | ≤ 400 kB gzipped (three.js included) | build script prints sizes; CI fails above |
| First load, local production build | interactive ≤ 3 s | Playwright |
| Console | no errors or warnings during the scripted run | Playwright |

If the recompute budget cannot be met at `waves.cap = 128`, lower the cap in
`tuning.json`, record the largest cap that meets the budget in the handoff note, and
check that calibration still passes. Do not change the algorithm in `03` to get
there; ask.

## 5. Browser tests

`tests/e2e/first-playthrough.spec.ts` drives the real interface through the intended first
run of `01` §3 with seed 1 and debug hooks only for the seed and playback speed:
inspect the five objects, pin a card on Marti, scroll to the fray, place the lure
unprimed, prime and place it again, watch the walk, scroll to the morning, pin cards
on the roadworks, play forward to the anchor, see the end screen. A screenshot at each
step into `test-results/`.

`tests/e2e/smoke.spec.ts`: load, no console errors, timeline visible, Space toggles
playback, the language switch changes the town name, reload restores the save,
panning the camera does not change `watched`.

## 6. Telemetry

One module, `src/telemetry`, with `track(name, props)`. Events carry a session id
(random per page load), a counter and elapsed real milliseconds. No personal data, no
cookies.

| Event | Props |
| --- | --- |
| `session_start` | build, locale, seed, vettedSeed, playedCardRule, viewport |
| `inspect` | object, tick |
| `card_played` | card, targetKind, tick, special, behindLimit (tick at least 30 below the highest tick ever played through) |
| `pin_moved` / `pin_withdrawn` | kind, fromTick, toTick |
| `power_used` | power, tick, place |
| `break_alert` | count, confirmed |
| `reopened` | count paid, count unpaid |
| `scroll_back` | fromTick, toTick (a move back of 30 ticks or more) |
| `fray_seen` | tick |
| `hint_shown` | id |
| `recompute` | ms, histories (every 10th, and every one over budget) |
| `anchor_reached` | realSeconds, pins, withdrawals, scrollBacks, powers, gazes |
| `cta_click` | which |
| `session_end` | realSeconds, frontier, anchorWatched |

Sinks: an in-memory buffer (always; shown in the debug panel; JSON export) and
`navigator.sendBeacon` batches to `VITE_TELEMETRY_URL` when it is set and
`flags.telemetry` is true. With a remote sink, show a one-line notice with an off
switch in settings on first load. The graybox uses local export only.

## 7. Continuous integration

GitHub Actions on every push: clean install, `npm run content:check`, `npm run check`,
`npm run build`, size check, `npm run e2e` (Chromium). On `main`: deploy `dist/` to
GitHub Pages. A manual workflow uploads `dist/` to itch.io with butler using a
repository secret; never run it from a coding session.

## 8. Definition of done for any milestone

- Every acceptance item in the brief was checked in this session, and the check is in
  the handoff note.
- `npm run check` and `npm run build` pass. From M5 on, `npm run e2e` passes.
- No new dependency, no skipped test, no TODO in code other than writer markers and
  recorded `QUESTION` markers.
- Text is in both locale files. `npm run content:check` passes.
- The handoff note exists.
