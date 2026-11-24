# M8 — Playtest build

**Goal:** a private link Tagir can put in front of five people, with everything needed
to judge Gate A.

**Read first:** `06-ui.md` §10; `07-quality.md` §4, §6, §7; `docs/playtest-kit.md`.

## Build

1. The debug panel with all its tabs (`06` §10). Move the M5 dev mode into it and
   delete `?dev=1`.
2. Telemetry: every event in `07` §6, the in-memory sink, JSON export, and the remote
   sink behind `VITE_TELEMETRY_URL` with its notice and off switch.
3. `summarizeSession(events)` producing the numbers in `docs/playtest-kit.md` §4,
   shown in the Telemetry tab and included in the export.
4. `?rule=pinned|spent|discard` and `?seed=` for playtest setup, recorded in
   `session_start`.
5. Accessibility pass against `06` §8; fix what fails.
6. Size check and budget enforcement in CI; deploy to GitHub Pages; the manual itch.io
   workflow (do not run it).
7. A crash screen: an error boundary with a plain message, "copy details" (error,
   seed, pins, watched facts, tuning version) and reload.

Notes from M2 (2026-11-25):
- Strain is a projection to the end of the day: 19–70 s on Chapter 1 (`docs/handoff/M2.md`,
  item 11). `recompute`'s `strain` flag computes it with every re-run; the plan says how
  the Wave tab keeps re-runs fast while it is open.
- Timing tests run alone (`npm run bench`, Vitest project `budget`); a CI machine's
  numbers differ from a desktop's.
- A simulated-only world for testing (`docs/questions.md` M2-22) waits for Tagir's
  decision on when to build it; if he puts it in the playtest build, it is a tuning
  switch shown in this panel.

## Acceptance

- [ ] Changing a tuning value in the panel changes the next recompute; "copy as JSON"
      produces a valid `tuning.json`.
- [ ] Loading a pin set from the Pin sets tab reproduces its golden playback.
- [ ] The Wave tab shows cases, live cats and fog states per tick, strain, local
      causes and the last recompute time.
- [ ] A scripted session produces every telemetry event at least once, and
      `summarizeSession` returns the expected numbers (unit test).
- [ ] With no `VITE_TELEMETRY_URL`, no network request is made (Playwright).
- [ ] Keyboard-only and reduced-motion checks pass; contrast checked.
- [ ] Bundle size and load budgets hold. `npm run e2e` passes on Chromium, Firefox and
      WebKit locally; differences are in the handoff note.
- [ ] `dist/` zipped is under 5 MB and runs from a sub-path.

## Out of scope

Art, sound, the bookmark URL, public analytics accounts.
