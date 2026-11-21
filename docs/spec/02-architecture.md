# 02 — Architecture

The repository already has a scaffold (Vite, TypeScript strict, Solid 2.0, a WebGL2
canvas, a Web Worker bridge, Zod content checks). This pack builds on it. Where the
scaffold and this file disagree, this file wins, and M0 brings the scaffold into line.

## 1. Stack (allowlist)

| Concern | Choice | Notes |
| --- | --- | --- |
| Language | TypeScript, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` | as in `tsconfig.json` |
| Build | Vite | static output, `base: './'` so the build runs from any folder, including an itch.io zip |
| UI | Solid 2.0 (`solid-js`, `@solidjs/web`, `@solidjs/vite-plugin`) | Solid 2 APIs only; see the rules in `CLAUDE.md` |
| World view | three.js, one orthographic scene | behind `SceneRenderer` (§4); graybox from M5 |
| Simulation host | one Web Worker | `src/bridge/sim.worker.ts` |
| Content validation | Zod | schemas in `src/content/schemas/` are the single source of content types |
| Unit tests | Vitest | Node environment |
| Browser tests | Playwright | Chromium in CI; all three engines before release |
| Lint/format | ESLint flat config (typescript-eslint, eslint-plugin-solid), Prettier | import rules with `no-restricted-imports` (§2) |

Runtime dependencies allowed: `solid-js`, `@solidjs/web`, `three`, `zod`. Dev
dependencies: what `package.json` already has, plus `@playwright/test` and
`@types/three` (added in M0). Nothing else without Tagir's approval. Pin exact
versions. Node version from `.nvmrc`. If an API you remember does not match the
installed version, read the package's own docs in `node_modules` or its website; do
not guess.

No CSS framework. Plain CSS with custom properties from `src/ui/theme.css`.

## 2. Folders and import rules

```
src/
  sim/         rng.ts math.ts exp-table.ts hash.ts space.ts perception.ts
               conditions.ts scores.ts effects.ts cats.ts storylets.ts sifting.ts
               pins.ts step.ts history.ts readers.ts fog.ts lantern.ts observe.ts
               frames.ts recompute.ts vet.ts phi-table.ts types.ts
  player/      state.ts actions.ts rewards.ts frontier.ts save.ts
  bridge/      protocol.ts sim.worker.ts client.ts
  render/      SceneRenderer.ts three/ (graybox implementation)
  ui/          Solid components, theme.css
  content/     schemas/ (Zod) load.ts data/
               data/tuning.json
               data/ch1/  world.json map.json cast.json hooks.json activities.json
                          objects.json cards.json powers.json storylets.json
                          detectors.json anchor.json economy.json text/en.json text/ru.json
               data/ui/   en.json ru.json
  i18n/        t.ts
  telemetry/   events.ts sinks.ts summary.ts
  cli/         sim.ts
scripts/       content.ts validate-content.ts gen-exp-table.ts gen-phi-table.ts balance.ts
               calibrate.ts
tests/         *.test.ts, golden/, fixtures/, e2e/
docs/          glossary, spec, milestones, handoff, questions, decisions
```

Allowed imports:

| From | May import |
| --- | --- |
| `sim` | `sim`, types from `content/schemas` |
| `player` | `player`, `sim` (pure functions and types), `content` |
| `bridge` | `sim`, `player`, `content` |
| `render` | `content` and `sim` types only (`import type`), `three` |
| `ui` | `bridge`, `player`, `render`, `i18n`, `telemetry`, `content` types |
| `telemetry`, `i18n` | themselves only |
| `cli`, `scripts` | `sim`, `player`, `content` |

Enforced with `no-restricted-imports` per folder in `eslint.config.js`. `src/sim` and
`src/player` are also banned from `Math.random`, `Date`, `performance`, `crypto`,
`window`, `document`, `navigator`, `self`, timers, `fetch` and `postMessage` (the
scaffold already does this for `src/sim`; extend it to `src/player`).
`player/save.ts` takes a storage object as a parameter instead of touching
`localStorage`. Only `src/bridge` calls `postMessage`.

## 3. Data flow

```
content JSON ──parse + cross-check──▶ Content (frozen)  ── loaded in the worker and the main thread

main thread                                         worker
───────────                                         ──────
PlayerState (pins, watched, seed, …)
   │ edit (play, withdraw, move, power)
   ├── recompute {pins, watched, frontier, preview} ▶ re-run from the last checkpoint ≤ edit tick
   │                                                 to the frontier limit (03 §17)
   │◀─────── rerun {upTo, frames} … ──────────────┤  streamed while it runs
   │◀─────── result {frames, edge, end, reopened, …} ┘ (03 §17)
   │ break alert if a paid fact would reopen; then commit
   │ playback tick t → t+1
   ├──────── observe {t, cat} ────────────────────▶ at the lantern edge: advance the lantern one
   │                                                 tick, place cats, apply evidence
   │◀─────── {watchedFact, frames} ───────────────┘  (03 §15.2)
   ▼
rewards (player/rewards.ts) → PlayerState
playhead + frac (UI) → SceneView → SceneRenderer
```

Rules:

- The wave (lantern and fog) lives only in the worker. The main thread holds `PlayerState` and the
  latest **result** (frames, end, gaze facts, stats). Frames are derived and never
  saved.
- The UI drives time: playback runs on `requestAnimationFrame` in `src/ui` with a
  real-time accumulator; the worker never runs a clock. (The scaffold's fixed-step
  worker loop is removed in M0.)
- Every request carries a `reqId`. The UI drops results older than the latest request.
  While a re-run streams, the timeline shows the new frames up to `upTo` and nothing
  past it, and the playhead cannot pass `upTo`. The break alert waits for the final
  `result`; Cancel restores the previous result.
- Observation requests are queued in tick order; playback waits (stays on the last
  tick) if an observation has not returned.

`src/bridge/protocol.ts` is the single source of truth for messages:

```ts
type MainToWorker =
  | { kind: 'init'; reqId: number; tuning?: Partial<Tuning> }
  | { kind: 'vet'; reqId: number; requestedSeed: number }
  | { kind: 'recompute'; reqId: number; seed: number; pins: Pin[]; watched: WatchedFact[];
      frontier: PlayerState['frontier']; preview: boolean }   // a re-run (03 §17)
  | { kind: 'commit'; reqId: number }                      // make a preview the current wave
  | { kind: 'observe'; reqId: number; tick: number; cat: CatId }
  | { kind: 'debugHistory'; reqId: number; tick: number; index: number }; // index 0: the lantern state; i > 0: reference histories (stream i)
type WorkerToMain =
  | { kind: 'ready'; reqId: number }
  | { kind: 'vetted'; reqId: number; seed: number }
  | { kind: 'rerun'; reqId: number; upTo: number; frames: FramesPatch }   // streamed progress
  | { kind: 'result'; reqId: number; result: RecomputeResult }
  | { kind: 'observed'; reqId: number; fact: WatchedFact; frames: FramesPatch }
  | { kind: 'history'; reqId: number; state: SimState; events: SimEvent[] }
  | { kind: 'error'; reqId: number; message: string };
```

Frames for 900 ticks can be large. Send them as compact arrays and transfer
`ArrayBuffer`s where it helps; the shape is an implementation choice recorded in
`docs/decisions.md`, as long as the renderer gets what §4 lists.

## 4. Renderer interface

```ts
interface SceneView {                  // what the renderer gets every animation frame
  tick: number;                        // integer tick at the playhead
  frac: number;                        // 0..1 inside the tick (presentation only)
  frame: Frame;                        // 03 §16, at tick
  next: Frame | null;                  // at tick + 1, for interpolation
  lanterns: { cat: CatId; pos: [number, number]; sightM: number }[];
  revealed: ReadonlySet<NodeId>;
  held: Highlight | null;              // valid targets while a card or power is held
  previousPath: [number, number][] | null;   // after an edit (06 §6)
  settings: { focusLayer: boolean; assist: boolean; reducedMotion: boolean };
}
interface SceneRenderer {
  mount(canvas: HTMLCanvasElement): void;
  render(view: SceneView, dtMs: number): void;
  pick(x: number, y: number): Pick | null;   // what is under a screen point
  resize(width: number, height: number): void;
  dispose(): void;
}
```

`frac` and all floating-point maths live only in `render` and `ui`. Picks report what
was hit (cat, object, place); they never decide a game rule.

For browser tests, the UI mirrors the scene into an accessible, visually hidden list
of targets (cats, objects, places) with `data-testid` (`cat-marti`, `place-town.roadworks`,
`object-melmans_whistle`, `card-tea_break`, `pin-<id>`, `playhead`) and, for cats,
`data-node` (the most likely place) and `data-activity` attributes. Tests assert on
these, not on pixels.

## 5. Content loading

`src/content/load.ts` parses every file with its Zod schema, resolves the cast mode
(`05` §3), then runs cross-checks and throws one error listing every problem:

- every id referenced anywhere exists: nodes, regions, cats, roles, hooks, traits,
  activities, objects, cards, powers, storylets and their states, detectors, counters,
  tags (`world.tags`), text keys;
- every fact used in a condition is produced somewhere (an effect, a detector, an
  `onPerceived`, `world.engineFacts`), and every flag used is set somewhere; events
  used are emitted somewhere (warnings, as in the slice's validator, for
  events nothing listens to);
- every choice exit in one state names the same actor role;
- the map is connected; edge minutes are positive integers; every number is an
  integer; gauge ranges lie in `[0, 1000]`;
- `text/en.json` and `text/ru.json` have the same key set, as do `ui/en.json` and
  `ui/ru.json`.

`docs/reference/ch1-slice-validate.mjs` (the slice's validator) is the reference for
these checks; port them, do not call it. `npm run content:check` runs the loader in Node. The app runs it at startup
(in both threads) and shows a plain error screen listing the problems if it fails.

## 6. Build variants and flags

- `import.meta.env.VITE_BUILD` is `graybox` or `dressed`.
- Feature flags come from `tuning.json → flags` and can be overridden by URL query for
  testing (`?flag.assist=1`). No other configuration mechanism.
- `?seed=`, `?rule=` (played-card rule) and `?debug=1` are read by the UI.
- The debug panel is in every build behind `?debug=1` or the backquote key.
