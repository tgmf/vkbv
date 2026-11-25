# All Cats Fear Water — Chapter 1 demo

A browser demo of a story-simulation game. You play an unseen force (the Filter) that
nudges independent cats with cards and powers, and scroll freely along the timeline of
one day. Chapter 1 ends when Marti meets Rokko under a boat on the beach, in the rain.

Built with Vite, TypeScript (strict), Solid 2.0, three.js (from milestone M5) and a
Web Worker that runs a deterministic, integer-only simulation.

## Run it

Needs the Node version in `.nvmrc`.

```sh
npm install
npx playwright install chromium   # once, for the browser tests
npm run dev                       # http://localhost:5173
```

Open with `?debug=1`, or press the backquote key, to see every tuning knob with its
description. Open with `?dev=1` for the dev page: the viewer with every place revealed (switch it
off with "reveal all"), a seed field (played as typed, not vetted), one of the spec's pin sets, and,
while paused, the state at the playhead: the event log, every live cat's activity and gauges, the
running storylets, facts and flags; stream 0 is the lantern, stream i the reference history i.
Keys: Space plays or pauses, J and L shuttle back and forward (press again to go faster), K pauses,
← and → step a tick, Home goes to the start.

## Commands

| Command                                         | What it does                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`                                   | Dev server                                                                      |
| `npm run check`                                 | Typecheck, lint, unit tests, timing tests, quick calibration, content check (about 12 min). Must pass before every commit |
| `npm run test`                                  | Unit tests only                                                                 |
| `npm run bench`                                 | The timing tests alone (the re-run and observe budgets)                         |
| `npm run e2e`                                   | Builds, then runs the Playwright tests against the build served from a sub-path |
| `npm run build`                                 | Production build into `dist/` (prints the gzipped JS size; fails above 400 kB)  |
| `npm run content:check`                         | Validates tuning and text files                                                 |
| `npm run gen:exp-table`                         | Regenerates `src/sim/exp-table.ts` (never needed unless the spec changes)       |
| `npm run sim -- --seed 1`                       | One headless history: an event trace and the final state hash (`--fog`: the wave hour by hour) |
| `npm run balance`                               | The balance properties of `05` §5.2 over 50 seeds (about 30 min)                |
| `npm run calibrate`                             | Calibration of the fog against the reference simulation (`--quick`: 60 seeds)   |
| `npm run vet -- --count N`                      | Vets candidate seeds offline into `src/content/data/ch1/vetted-seeds.json`       |
| `npm run golden:update`                         | Rewrites the golden files (needs a written reason)                              |

## Where things are

- `src/content/data/tuning.json`: every engine knob. Each is documented in its schema,
  `src/content/schemas/tuning.ts`.
- `src/content/data/ch1/`: Chapter 1 content (placeholder test slice).
- `src/sim/`: the pure simulation. `src/player/`: the player's state and rules.
  `src/bridge/`: the worker and its protocol. `src/render/`: the three.js world view.
  `src/ui/`: the Solid interface.
- `docs/`: the glossary, the spec, milestone briefs, handoff notes, questions and
  decisions. The milestones run in order from `docs/milestones/M0-scaffold.md`.
