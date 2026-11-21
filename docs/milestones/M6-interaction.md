# M6 — Interaction: hand, pins, inspect, powers, edits

**Goal:** the whole game is playable with mouse, touch and keyboard. Plain look, no
guidance yet.

**Read first:** `06-ui.md` §3–§8, §12; `04` §3–§8.

## Build

1. Hand: hold, drag and keyboard selection; target highlighting from
   `src/player`; the magnifying ring (ghosts included); cancel.
2. Pinning on a cat, an object or a place through `player/actions.ts`; refusals shown
   briefly at the target with the reason.
3. Pins on the timeline: icons, hollow or half-filled when fizzled, with reasons; drag
   to move; withdraw by × or Delete; unique pins locked.
4. The presence strip while a card or power is held.
5. Inspect panel, journal (hooks and stories), line log with drive keys highlighted.
6. Charge meter with power costs marked; Lure and Gaze buttons and their holds; Gaze's
   radius ring under the pointer.
7. The special confirm step and the break alert bar (`06` §6). Every edit goes through
   a preview first.
8. Edit feedback, all five parts, and pins past the new edge (`04` §4).
9. Rule `discard` display: draw and discard counts.

## Acceptance

- [ ] A person can play `road_tea`, `road_box` and `road_both` by hand without the
      debug panel; a Playwright test records `road_both`.
- [ ] Keyboard alone: a Playwright test pins one card on a cat and withdraws it, and
      places a power, using only keys.
- [ ] Touch emulation in Playwright: the same flows work.
- [ ] After watching Marti through the morning, pinning `tea_break` on
      `town.roadworks` at 07:40 shows changed story dots pulsing, the re-run refilling
      the bar as a ripple, Marti's previous path, and the end of the bar changing.
- [ ] An edit that would undo a watched paid fact shows the break alert first;
      Cancel leaves everything as it was; Confirm lands the edit.
- [ ] Holding a card over `town.roadworks` at 15:00 shows on the timeline when the
      crew were likely there in the morning.
- [ ] A fizzled pin is visibly different and explains itself.
- [ ] Gaze placed on the roadworks turns the ghosts there solid for its ticks, and the
      charge meter drops by its cost.
- [ ] The UI never computes validity itself: grep shows no rule logic in `src/ui`.

## Out of scope

Hints, teaser, strike, end screen, settings beyond language, debug panel, telemetry.
