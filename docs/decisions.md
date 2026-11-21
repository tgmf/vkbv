# Technical decisions

One line each, newest last: `M<n>  what was decided  — why`.

M0  `SimState`, `SimEvent`, `RecomputeResult`, `FramesPatch` in `src/sim/types.ts` are minimal placeholders so `protocol.ts` can be written verbatim — M1/M2 complete them from `03` §5, §16, §17.
M0  Lint fixtures live in `tests/lint-fixtures/<folder>/` and get the same rule blocks as `src/<folder>/`; `npm run lint` ignores them and `tests/lint.test.ts` lints them with `ignore: false`, type-aware rules off — fixtures must break rules without breaking the build.
M0  The import table of `02` §2 is data (`IMPORT_TABLE`) in `eslint.config.js`; `src/main.tsx` is the composition root and is unrestricted; `src/bridge` is the only folder without the `postMessage` ban.
M0  The tuning debug list (`?debug=1` or backquote) is built from the Zod schema's `.describe()` texts via `tuningRows()`; it is developer-only, so its labels are not translated. Read-only until M8.
M0  The scaffold's palette content kind (`data/palettes`, `schemas/palette.ts`) was removed with the WebGL placeholder that was its only user.
M0  `client.ts` drops a reply whose `reqId` is not the latest request of its kind; the dropped promise never settles.
M0  `npm run e2e` serves `dist/` with a 30-line Node server (`tests/e2e/serve.ts`) mounted at `/some/sub/path/`, which proves the sub-path requirement without another dependency.
M1  All Chapter 1 schemas live in one file, `src/content/schemas/chapter.ts` (a section per data file), instead of twelve small files; shared language in `schemas/dsl.ts` — easier to read side by side.
M1  `Condition`, `PlaceSelector` and `Requirement` types are written out once next to their schema because `z.lazy` recursion cannot be inferred; TS checks the two agree.
M1  `load.ts` derives the lookups once (edge ids `a__b`, adjacency, each place's space, door-to-outdoor flag, object tags; records by id) and deep-freezes `Content`. Cross-checks are in `content/check.ts`.
M1  `src/content/chapter1.ts` imports the Chapter 1 JSON statically so the app, the worker and Node tools load the same set; `src/cli/files.ts` (Node only) reads other folders such as the tiny world. `src/cli` is type-checked by `tsconfig.node.json`.
M1  `step` takes either the list of decided branch outcomes (it throws an internal signal at the first undecided one and returns `branchPoint`) or a resolver function that samples as it goes; single-history mode uses the resolver, a test checks both agree.
M1  Path results are memoised in a `PathMemo` object owned by the caller and passed through `Ctx` (no module state); the same inputs give the same paths, so behaviour is unchanged (same hashes).
M1  `cloneState` copies what a step mutates and shares what it never changes (`initial`) or only replaces (flag entries, roles, pool matches); a test checks it equals a JSON round-trip and that stepping never changes its input.
M1  State has one field beyond `03` §5: `echoes`, the socialSpread re-emissions waiting for next tick. A terminal storylet state stays in `StoryletRun.state` (with `ended: true`), so `{ state: [s, terminal] }` holds after the end.
M1  Events beyond `03` §2's list, for traces and conditions: `fact` (a fact newly set), `activity` (an activity chosen, with its place), `interrupt`; `pinFired` carries `card` and `special`. Weather changes are global named events `rainStarted` / `rainStopped`.
M1  Hook voices compare the gauge value at the end of phase 3a with the step's input state, so a crossing caused by a pin in phase 1 still voices.
M1  A `blocked` edge counts as the activity ending: the cat decides again in phase 6 of the same tick (with the edge now known closed).
M1  A decaying mod gets `left = ceil(|add| / decayPerTick)`; `attracted` ends when its attract effect is gone; running effects count down in phase 1 including those created that tick.
M1  The start activity at tick 0 is chosen while building the initial state; its `activity` event is not part of any tick.
M1  The 03 §18 sweep over Chapter 1 (seeds 1–50 × streams 0–31) is split into eight test files by stream so Vitest runs them in parallel; `tests/invariants/check.ts` steps without keeping every state.
M1.5  The dev inspector talks to the worker through its own message pair (`inspect` / `inspected`), not `debugHistory`, because it needs a seed, a stream and a pin set; the worker keeps the last inspected history and answers each tick with a small `InspectView`. M8 folds it into the debug panel.
M1.5  The `05` §5.1 pin sets are data in `src/content/data/pinsets.json`, in the spec's notation (`!` marks a special), parsed by `parsePinSets` in `load.ts`; `npm run sim -- --pinset <name>` uses them too.
M1.5  The inspector's log shows the events of the ticks before the one viewed (they led to the state on the map); `events[t]` happen after `states[t]`.
—   2026-11-21 (Tagir, spec change) `03` §12–§18, `M2`, `M3`, `05` §4 tuning, `07` §2–§4 and the glossary rewritten for fog and lantern; weighted histories (split, merge, trim, rejuvenate, lineage) are retired — 128 histories × 12 cats measured about 70 s per recompute against a 100 ms budget.
M2  Conditions: `chance(ctx, cond, scope)` returns ppm (`03` §13.3); `test` is the gate (`chance ≥ fog.gateThresholdPpm`). Score and hazard terms, including `primeCount` and gated `gauge` terms, scale by the ppm with `trunc(add × ppm / 1e6)`.
M2  `step` takes an optional last argument `{ live, held }`. Fogged cats are skipped in phases 3, 6 and 7 (they perceive only through the fog), and a detector that involves a fogged cat is left to the fog (Tagir approved both defaults, 2026-11-21). Keeping fogged cats out of live storylets is the lantern's job: it holds every storylet that a fogged cat could bind.
M2  Golden single histories live in `tests/golden/single-history.expected.json` as a Vitest file snapshot; `npm run golden:update` is `vitest run tests/golden --update`.
