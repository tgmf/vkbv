# Project rules

Browser game prototype: Vite + TypeScript (strict) + Solid 2.0 UI + WebGL2 canvas + simulation in a Web Worker.

## Solid 2.0 only

This project uses **Solid 2.0** (`solid-js` + `@solidjs/web` + `@solidjs/vite-plugin`). Never use Solid 1.x APIs or patterns. In particular:

- `createResource`, `batch`, `startTransition` and `createMutable` were removed.
- `onMount` is now `onSettled`.
- `<Index>` is `<For keyed={false}>`.
- `use:` directives are replaced by ref factories (`ref={tooltip({...})}`).
- `classList` is folded into `class` (object/array forms).
- `render` and JSX types come from `@solidjs/web`, not `solid-js/web`.

Check the Solid 2.0 docs / migration guide (https://docs.solidjs.com) when unsure, and treat Solid dev-build diagnostics as errors to fix.

## Architecture

- `src/sim/` — pure, deterministic simulation. No DOM, no rendering, no UI or bridge imports, no `Math.random` / `Date.now` / `performance.now` / `crypto`. All randomness comes from the seeded PRNG in `src/sim/prng.ts`. Enforced by ESLint.
- `src/bridge/` — the typed main ↔ worker protocol (`protocol.ts`), the worker host (`sim.worker.ts`, owns timing) and the main-thread client (`client.ts`). Only this folder calls `postMessage`.
- `src/render/` — WebGL2 canvas. No renderer library chosen yet; don't add one without asking.
- `src/ui/` — Solid 2.0 overlay components.
- `src/content/` — game content as JSON in `src/content/data/<kind>/`, validated by Zod schemas in `src/content/schemas/` (register new kinds in `schemas/index.ts`).

## Rules

- The simulation in `src/sim` must stay pure and deterministic: no DOM, no rendering, no `Math.random`/`Date.now`; all randomness from the seeded PRNG.
- UI never holds simulation state; it only sends commands and reads snapshots via `src/bridge`.
- Game content lives in `src/content/data` as data, validated by Zod. No logic inside content files.
- A sim change that alters behaviour will change the golden replay hash in `tests/golden/`. Only update the hash when the change is intended, and say so.
- Before finishing any task: run `npm run typecheck`, `npm run lint`, `npm test` and `npm run validate-content`, and fix failures.
