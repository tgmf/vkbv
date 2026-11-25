# M5 — Viewer: the world as a wave, and the timeline

**Goal:** watch any pin set in the browser: the three.js world with the lantern and
ghosts, the timeline, playback that observes, scrubbing that does not. No cards in
hand yet.

**Read first:** `06-ui.md` §1–§3, §8, §12; `02` §3, §4; `03` §14, §16;
`docs/questions.md` M2-21.

## Where M2 left things (2026-11-25)

- The worker streams a re-run as `rerun` patches every `waves.streamEveryMs` (50 ms),
  then a `result`; `src/bridge/client.ts`: `request(msg, onRerun)`. Frames are plain
  objects: about 40 kB a patch, 2.7 MB for a re-run to 12:00. `observe` comes from M3.
- Frames carry filtered ghosts only. Their `samples` (backward sampling, `03` §16) and
  the smoothing of past ghosts (`03` §14 step 3) were deferred to this milestone
  (M2-21): the fog does not record which state led to which. Building them costs the
  re-run (`npm run bench`, 111 of 120 ticks/s); the plan says how, with an estimate,
  and the handoff gives the measured cost.
- Seed 1 under `road_both` does not reach the meeting (Marti goes back in at the door);
  the acceptance item below needs a seed on which it does (`npm run sim -- --seed N
  --pinset road_both --fog` shows it).

## Where M3 left things (2026-11-25)

- `observe {tick, cat}` answers `observed {fact, frames, gazeFacts, edge, end}`: behind the
  edge the stored fact (no frames); at the edge the edge moves one tick and `frames`
  holds its frame. `src/player` has every action; the headless driver
  (`tests/helpers/playthrough.ts`) shows the whole loop: edits previewed with
  `previewNotice` (the break alert), committed with `applyPreview`, then, if pins moved
  to the edge, one more `recompute` with them.
- Live playback costs 2–3 ms a tick, but every fifth tick also steps the fog: 50–140 ms.
  At `player.observeMaxTps` (16, 62 ms a tick) the slowest ones stall; playback must
  wait for the reply, not skip it (`02` §3). Measure frame time with playback running.
- Frames carry `visible` (objects' P(visible)) and `powers` (available at the tick):
  opacity of objects with `visibleWhen` (`06` §2) and the power buttons read them.

## Where M4 left things (2026-11-25)

- Fog knobs stay 1000/3 (Tagir). The re-run budget is not met: 84–101 ticks/s (budget
  120), first frames 71–115 ms (100), on every pin set; observe at the edge 2.8 ms median,
  mean 13 ms, slowest about 100 ms (M2-1, open). Budget frame time with that in mind, and
  build `samples` and smoothing (item 8) knowing the re-run has no spare speed.
- Golden playbacks of every pin set, seeds 1–3, are in `tests/golden/<set>.s<seed>.expected.json`.
  The acceptance item below can use them: under `road_both`, requested seed 1 (vetted
  49598663) meets Rokko at 18:50, and so do seeds 2 and 3 (vetted 3762896133 and 3754479982).
  The note in "Where M2 left things" about seed 1 not reaching the meeting is out of date.
- Live vetting of a typed seed now runs at the game's own knobs (`docs/questions.md` M4-1):
  slower (tens of seconds to a few minutes), but a vetted seed is solvable as played.
- `npm run check` now also runs the quick calibration (about 4 minutes on every core) and the
  minimum-bar tests (`05` §5.2: solvable, every card visibly does something); the whole
  check takes about 12 minutes. B2–B7 are measured by `npm run balance` and not enforced.
- Open, bears on the ghosts: interrupts of 2–6 ticks on fogged cats (`tea_break`,
  `something_shiny`) do not show; they may be lost inside a 5-tick fog step (`docs/questions.md`
  M4-5).

## Build

1. A Solid store holding: content, `PlayerState`, the latest result, playhead and
   `frac`, playback state and speed, settings. Never copy simulation state into it
   tick by tick; read frames from the latest result.
2. `render/SceneRenderer.ts` and `render/three/`: the orthographic scene in the final
   camera, places as boxes, edges as paths, fog, cats as cut-out billboards with
   their `look` colours, the lantern, ghosts with additive glow and clustering, the
   focus layer, the display budget, interpolation, objects, rain, barriers, running
   lure and Gaze effects, speech bubbles. Pan, zoom, follow toggle. `pick()`.
3. The accessible target list mirrored from the scene, with `data-testid`,
   `data-node` and `data-activity` (`02` §4).
4. The timeline: ruler, weather band, story dots, pins (read only), playhead,
   the lantern edge (the bar's right end, rescaling past `timeline.minSpanTicks`),
   re-runs streaming in, fray, changed-unwatched marks, play/pause and the shuttle
   (`06` §3: clicking only at or before the playhead, J/K/L speeds both ways, playback
   up to `player.observeMaxTps`, faster forward a scrub), keyboard. "Jump to the edge" only
   behind `flags.jumpToEdge` (off by default), kept for playtests.
5. The playback loop on `requestAnimationFrame` with a real-time accumulator; each
   tick passed in playback calls `observe` (M3) and applies rewards; scrubbing only
   moves the playhead.
6. For this milestone only, a dev mode behind `?dev=1`: everything revealed and a
   dropdown that loads any pin set from `05` §5.1. It moves into the debug panel in
   M8.
7. The layout of `06` §1 with empty hand and side-panel areas.
8. Frames' `samples` and smoothed past ghosts (see above), used by the focus layer.

## Acceptance

- [ ] Loading `road_both` and pressing play shows, legibly: Marti at home with the town
      as ghosts, the rain arriving, the lure, Marti's walk with the lantern revealing
      places, the barrier, the chain, the meeting.
- [ ] Before anything is watched, the crew at the roadworks are ghosts whose
      likeliest copies read strongest; after Marti watches them they are solid.
- [ ] Panning the camera across the whole map changes nothing in `watched` (a
      Playwright test asserts it).
- [ ] Dragging the playhead anywhere up to the lantern edge updates the scene within
      one frame and observes nothing; it cannot pass the edge; playback observes every
      tick it passes and extends the edge when it reaches it.
- [ ] `untouched` shows the fray when the boat leaves (`boatLeft`, about 23:25);
      playback stops there.
- [ ] Keyboard: Space, J, K, L, ←, → and Home work as `06` §8 says; End jumps to the edge
      only with `flags.jumpToEdge`.
- [ ] The timeline cannot be clicked or dragged ahead of the playhead; the shuttle steps up a
      speed per press; forward faster than `player.observeMaxTps` behind the edge observes
      nothing; during a re-run forward waits at the last tick that has arrived.
- [ ] A Playwright test loads `road_both`, plays to five ticks, and checks Marti's
      `data-node` against the headless playback.
- [ ] Reduced motion turns off the focus layer and pulsing; ghosts stay, with static
      opacity.
- [ ] 60 fps while scrubbing with all 12 cats (noted in the handoff with the machine);
      no console errors; layout holds at 1280×720 and 1024×640.

## Out of scope

Hand, cards, powers, inspect, journal, hints, teaser, end screen, debug panel.

## Pitfalls

- The camera and the renderer never call `observe`.
- Floats stay in `render` and `ui`.
- Frames can be large: render from them, do not copy them per tick.
