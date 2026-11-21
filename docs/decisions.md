# Technical decisions

One line each, newest last: `M<n>  what was decided  — why`.

M0  `SimState`, `SimEvent`, `RecomputeResult`, `FramesPatch` in `src/sim/types.ts` are minimal placeholders so `protocol.ts` can be written verbatim — M1/M2 complete them from `03` §5, §16, §17.
M0  Lint fixtures live in `tests/lint-fixtures/<folder>/` and get the same rule blocks as `src/<folder>/`; `npm run lint` ignores them and `tests/lint.test.ts` lints them with `ignore: false`, type-aware rules off — fixtures must break rules without breaking the build.
M0  The import table of `02` §2 is data (`IMPORT_TABLE`) in `eslint.config.js`; `src/main.tsx` is the composition root and is unrestricted; `src/bridge` is the only folder without the `postMessage` ban.
M0  The tuning debug list (`?debug=1` or backquote) is built from the Zod schema's `.describe()` texts via `tuningRows()`; it is developer-only, so its labels are not translated. Read-only until M8.
M0  The scaffold's palette content kind (`data/palettes`, `schemas/palette.ts`) was removed with the WebGL placeholder that was its only user.
M0  `client.ts` drops a reply whose `reqId` is not the latest request of its kind; the dropped promise never settles.
M0  `npm run e2e` serves `dist/` with a 30-line Node server (`tests/e2e/serve.ts`) mounted at `/some/sub/path/`, which proves the sub-path requirement without another dependency.
