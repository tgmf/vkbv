# 07 — Quality: tests, budgets, telemetry, release checks

## 1. Test layers

| Layer | Tool | What it covers | Runs in |
| --- | --- | --- | --- |
| Unit | Vitest | `sim` and `player` functions, content loading, i18n key checks | `npm run check` |
| Property | Vitest | the invariants in `03` §18 and `04` §10 over seeds 1 to 50 | `npm run check` |
| Golden | Vitest | headless playbacks of the pin sets in `05` §5 (§2 below) | `npm run check` |
| Calibration | script | shown probabilities against outcomes (§3) | `npm run calibrate` (full), `npm run calibrate -- --quick` (small; in `npm run check` since M4, where it passed: `docs/questions.md` M2-23) |
| Budget | Vitest | the re-run budget (§4), `tests/budget/` | `npm run bench`, run alone at the end of `npm run check` |
| Balance | script | the B-properties of `05` §5.2, measured and printed, not enforced (Tagir, M4) | `npm run balance` |
| Browser | Playwright | the app loads, a scripted first playthrough reaches the anchor, no console errors | `npm run e2e` |

Rules:

- `sim` and `player` need a test for every branch of every effect, primitive,
  condition, score term, exit kind and clause kind, and for every refusal reason of
  every action.
- UI components need no unit tests. Browser tests cover them through `data-testid`
  and the accessible target list (`02` §4).
- A bug fix starts with a failing test that reproduces it.
- Balance properties become tests only when Tagir says so in `05` §5 (`B1` and `B8`
  are tests from the start; `B9` is calibration, §3: `npm run calibrate`, whose quick run
  is in `npm run check` since M4, `docs/questions.md` M2-23). B2 to B7 stay measured only; the
  minimum bar of `05` §5.2 (solvable, every card visibly does something) is tests (Tagir, 2026-11-25).

## 2. Golden files

For each pin set in `05` §5.1 and seeds 1, 2, 3 (the pins are data in
`src/content/data/pinsets.json`, decisions.md M1.5):
`tests/golden/<name>.s<seed>.expected.json` holds the result of a
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
  "fog": { "60": { "cases": 6, "live": 2, "states": 410 }, "120": { "cases": 12, "live": 3, "states": 655 } }
}
```

`watchedHash` is `hash32` of the canonical JSON of the full watched-facts list.
`checkpoints[t]` is `hash32` of the canonical JSON of the checkpoint at `t`: the
lantern's `hashState` and the fog's cases with their weights and chains (canonical
order). `watched` lists the first watched tick of every storylet
state and detector. The readable parts exist so a changed hash shows what moved.

`npm run golden:update` rewrites the expected files. The handoff note must say which
files changed and why. Never edit an expected file by hand.

## 3. Calibration

The wave is only worth showing if its probabilities are honest. The fog's odds hold by
construction for what is watched (every collapse draws from them); calibration checks
that the fog, an approximation, stays close to the reference simulation.

`calibrate(seeds, pinSet, events)`: for each seed,

1. run the **whole-day run** (`03` §13.1) with the pin set, conditioning **off**: Marti
   live from tick 0 on stream 0, every other cat in the fog (Tagir, 2026-11-23: Marti is
   never fogged). Read each event's **forecast** `p`: 1 000 000 if the lantern holds it;
   otherwise its probability in the fog just before the protagonists' perception first
   moves it by `calibration.observedPpm` (what the ghosts showed before the run learned
   it), or at the end of the run if it never does (`docs/questions.md` M2-26);
2. run one **reality**: the reference simulation, a single history (`03` §12.4) in
   stream `100000 + seed`, and record whether each event happened. Its starting stats
   are the seed's (`03` §5), and its weather is the run's: the weather's branch points
   are drawn as the lantern draws them (scope `s0:branch`), so the run's odds and the
   reality share the world the run made concrete. Only its other rolls use that stream.

Two checks:

- **Rates**, every event: over all seeds, the mean of `p` and the share of realities in
  which the event happened differ by at most `calibration.tolerancePpm`. Marti's events
  are judged only here: his run and the reality are two independent samples of him, so a
  single seed's pair says nothing. The full run (`calibration.seeds`) must pass it; the
  quick run prints it (with 60 seeds the sampling error alone is near the tolerance).
- **Buckets**, fog events only: an event is a fog event in a seed's run when no
  storylet that sets it (`03` §12.2) has a role for a followed protagonist or ran live
  in that run's lantern. Group those
  `(p, outcome)` pairs into ten buckets by `p`. For every bucket with at least
  `calibration.minPerBucket` pairs, the mean of `p` and the share of outcomes that
  happened must differ by at most `calibration.tolerancePpm`.

| Knob | Start |
| --- | --- |
| `calibration.seeds` (full run) | 400 |
| `calibration.seedsQuick` (`npm run calibrate -- --quick`) | 60 |
| `calibration.minPerBucket` | 20 |
| `calibration.tolerancePpm` | 100000 |
| `calibration.observedPpm` | 10000 |

Pin set `road_both`, events `crewArrived`, `roadBlocked`, `shopClosedEarly`,
`rokkoUnderBoat`, `martiOut`, `anchor.meeting`. A second run uses `untouched`. A calibration failure is a bug in the fog, or an approximation in `03` §13 that does
not hold for this content. Report which events and buckets miss, with numbers, in the
handoff note and `docs/questions.md`; never change content or tolerance to make it
pass.

## 4. Budgets

| What | Budget | Checked by |
| --- | --- | --- |
| Re-run after an edit at 08:00 with the lantern edge at 12:00 (Marti live, the other cats in the fog, 240 ticks), in a worker | first streamed frames within `budgets.recomputeMs` (100 ms), median, on a developer laptop; then at least `budgets.rerunTps` (120) ticks per second; the test fails above 3× the time or below a third of the rate | Vitest (Node, same code as the worker: `tests/budget/rerun.test.ts`, `npm run bench`) and the debug panel |
| Observe one tick in playback (at the lantern edge: advance the lantern and fog one tick) | ≤ `budgets.observeMs` (5 ms) median; the test fails above 3× | Vitest (`tests/budget/observe.test.ts`, `npm run bench`) |
| Frame time while scrubbing, all 12 cats with ghosts | 60 fps on a mid-range laptop; no long task over 50 ms | Playwright (`tests/e2e/frame-time.spec.ts`, on the GPU when there is one; it records the renderer, and checks 60 fps only on a hardware renderer: CI has none, so there it records the numbers), noted in the handoff from a local run |
| JavaScript, graybox build | ≤ 400 kB gzipped (three.js included) | build script prints sizes; CI fails above |
| First load, local production build | interactive ≤ 3 s | Playwright |
| Console | no errors or warnings during the scripted run | Playwright |

If the re-run budget cannot be met, measure where the time goes (cases, states per
cat, fog steps) and report it in the handoff note with the values of `fog.maxLinks`,
`fog.minStatePpm` and `fog.bands` that meet it, checking that calibration still passes.
Do not change the algorithm in `03` to get there; ask.

## 5. Browser tests

`tests/e2e/first-playthrough.spec.ts` drives the real interface through the intended first
run of `01` §3 with seed 1 and debug hooks only for the seed and playback speed:
inspect the five objects, pin a card on Marti, play to the fray, place the lure
unprimed, prime and place it again, watch the walk, scroll to the morning, pin cards
on the roadworks, play forward to the anchor, see the end screen. A screenshot at each
step into `test-results/`.

Script what the vetted seed does, not the reference story word for word (`docs/questions.md`
M3-3, M3-4; the headless `tests/player/playthrough.ts` is the model). Seed 1 is vetted to
49598663, where `empty_teapot` can never be found (Marti's teaCraving starts above its voice
threshold), the unprimed lure already brings him out (17:45) and he meets Rokko at 18:50, so
there is no "turns back, prime him" step; the morning cards on the roadworks change nothing
there. A morning edit on the roadworks can reopen Marti's own later facts (he overhears the
crew's tale through the window): assert the marks and break alerts it gives, never "nothing
reopens".

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
| `recompute` | ms, ticks re-run, cases, live cats (every 10th, and every one over budget) |
| `anchor_reached` | realSeconds, pins, withdrawals, scrollBacks, powers, gazes |
| `cta_click` | which |
| `session_end` | realSeconds, frontier.story, lanternEdge, anchorWatched |

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
