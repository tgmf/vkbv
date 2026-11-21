# M0 — Scaffold and guardrails

**Goal:** bring the existing repository scaffold into line with `02-architecture.md`,
with every rule in `CLAUDE.md` enforced by tooling, so later sessions cannot break
determinism or boundaries by accident.

**Read first:** `CLAUDE.md`, `02-architecture.md`, `03` §1, `07` §1, §4, §7.

The repository already has Vite, TypeScript strict, Solid 2.0, a WebGL2 canvas
placeholder, a worker bridge with a fixed-step loop, a sequential PRNG and per-kind
Zod content checks. Keep what fits; replace what this brief says.

## Build

1. Dependencies: add `three`, `@types/three` and `@playwright/test` at their current
   stable versions, pinned exactly. This brief is the approval for these three; no
   others.
2. Folder tree from `02` §2, with a placeholder `index.ts` where a folder is empty.
   Remove `src/sim/prng.ts`, the scaffold's `step.ts`, `replay.ts` and `types.ts`
   demo state, and the fixed-step loop in `src/bridge/sim.worker.ts`. Replace the
   replay golden test with the vectors below.
3. `src/bridge/protocol.ts` with the message types of `02` §3. The worker answers
   `init` with `ready` and every other request with `error: "not implemented"`.
   `client.ts`: a typed request/response client with `reqId`s that drops stale
   results.
4. ESLint: extend the scaffold's `src/sim` restrictions to `src/player`; add the
   import table of `02` §2 with `no-restricted-imports`; ban `Math.exp`, `Math.log`,
   `Math.sqrt` and `Math.pow` in `src/sim` and `src/player`. Fixture files under
   `tests/lint-fixtures/` that break each rule, and a test that runs ESLint on them
   and expects each error.
5. `src/sim/math.ts` (`mulPm`, `clamp`, `isqrt`, `softmax`, `sample`), `src/sim/rng.ts`,
   `src/sim/hash.ts` exactly as in `03` §1; `scripts/gen-exp-table.ts` and the
   generated, committed `src/sim/exp-table.ts`. All test vectors from `03` §1.
6. `src/content/data/tuning.json` (from the pack) with its Zod schema; `load.ts`
   validates it and names the key in every error. The `ch1/` files are present but
   validated from M1 on; `content:check` skips them in M0.
7. `src/i18n/t.ts`: `t(key, params?)`, locale switch, missing key returns `⟦key⟧` and
   logs once. `src/content/data/ui/en.json` and `ru.json` with `ui.town` only
   ("Son-Marta-Klekot" / "Сон-Марты-Клекот").
8. `src/main.tsx`: a plain shell (top bar with the town name and a language switch,
   an empty area where the world view will go). Remove the WebGL2 placeholder
   drawing.
9. Scripts from the command table in `CLAUDE.md`. `npm run sim`, `balance` and
   `calibrate` print "not available until M1/M2/M4".
10. Vitest and Playwright set up; one Playwright test that the page shows the town
    name and switches language.
11. GitHub Actions workflow from `07` §7 (deploy and itch.io steps commented out with a
    note for Tagir).
12. A plain `README.md` for humans: what this is, how to run it.

## Acceptance

- [ ] `npm run check`, `npm run build`, `npm run e2e` pass on a clean clone.
- [ ] All RNG, hash, `EXP` and softmax vectors from `03` §1 pass.
- [ ] Importing `solid-js` or `three` from `src/sim` fails lint; `Math.random`,
      `Date.now` or `Math.exp` in `src/sim` or `src/player` fails lint;
      `postMessage` outside `src/bridge` fails lint. The fixture test proves each.
- [ ] Changing a tuning value to `1.5` or a string makes `npm run content:check` fail
      with a message naming the key.
- [ ] The built `dist/index.html` opens from any sub-path.
- [ ] The worker starts, answers `init` with `ready`, and nothing in the worker runs a
      timer.

## Out of scope

Any game logic, any real UI, the three.js scene (M5), content beyond `tuning.json`
and `ui.town`.
