# M3 — Observation and the player layer, headless

**Goal:** everything in `04-player-layer.md`, playback observation (`03` §15.2) and
links on demand (`03` §15.3) as
pure, tested functions, driven headless. No UI.

**Read first:** `04-player-layer.md`, `03` §11, §13–§17, `01` §3.

## Build

1. Worker `observe` (`03` §15.2): at the lantern edge, advance the lantern and the
   fog one tick (placement or negative evidence, §15.1); behind it, read the lantern
   the re-run already computed; return the watched fact. Links on demand from
   contributor heaps (§15.3).
2. `player/state.ts` (`newGame`), `player/actions.ts` (`inspect`, `playCard`,
   `withdraw`, `movePin`, `usePower`, `follow`, `setPlayhead`, `advance`,
   `applyPreview`), `player/rewards.ts`, `player/frontier.ts`, `player/save.ts`.
3. `tests/helpers/playthrough.ts`: a headless driver that holds a `PlayerState` and
   the latest result, applies actions, previews and commits edits, and can
   `playTo(tick)` (advance in playback, observing every tick, live past the lantern
   edge) or `scrubTo(tick)` (clamped to the edge).
4. A scripted playthrough with seed 1 that follows `01` §3 step by step, asserting the
   player-layer consequences.

## Acceptance

- [ ] Every refusal reason of every action has a test (card not in hand, place not
      revealed, object hidden, cat nowhere revealed, wrong bound cat, missing branch,
      past the lantern edge, charge short, unique pin moved or
      withdrawn, special already used).
- [ ] Observation: the same seed, pins and tick give the same watched fact; every
      fogged cat's chain still sums to 1 000 000 after it; scrubbing calls nothing.
- [ ] The fog stays open: after watching 05:40 to 09:00 on seed 1, the crew's ghosts at
      09:00 still spread over at least two places (unless Marti has seen them), and
      every one of Marti's watched facts holds.
- [ ] Links on demand: on the tiny world, perceiving a fact whose cause is a meeting in
      the fog raises the probability that the listed contributor was at that place in
      that window (Bayes worked by hand in the test); an unlisted cause counts in
      `stats.localCauses`.
- [ ] Repeat by default: watch the morning to 10:00, scroll back to 07:00, pin
      `tea_break` on `town.roadworks`: the re-run reaches 10:00 again; play to 10:00:
      every watched fact of Marti's morning still holds and nothing reopens.
- [ ] Breaks: a watched fact with a non-empty `paidBy` that an edit would reopen is
      reported by the preview; committing removes it and pays nothing back; unpaid
      reopened facts land in `marks.changedUnwatched`.
- [ ] Payouts: each key pays once; playing the same ticks again pays nothing; a state
      first watched under pressure pays more than its base (numbers in the test);
      Gaze facts pay nothing; the charge floor applies at the watched rain start, and
      the variant switch moves it to the `rain_started` payout.
- [ ] Charge is never refunded: withdrawing a power pin returns nothing; moving it
      costs the full cost again and is refused when charge is short.
- [ ] Frontier (`04` §6): a new game's lantern edge is 0; live playback extends it
      and keeps it equal to the frontier limit; playback updates `story`, `pastTicks`
      and `storylets` as `04` §6 says (numbers in the test); an edit that delays the
      beat keeps it reachable, `pastTicks` beyond it; scrubbing and re-runs never
      change the frontier; `story` never decreases.
- [ ] Past the new edge: an edit that pulls the edge back returns ordinary cards past
      it to the hand and moves unique and power pins to the edge, with the warning in the
      preview; every watched fact past it is reopened, no watched fact remains past the
      edge, and a paid one shows in the preview's `breaks`.
- [ ] Specials: the first pin on the source object sets `special: true`; a second does
      not; withdrawing it does not restore it.
- [ ] Rules `spent` and `discard` work through the same script; the reshuffle order is
      identical for the same seed and differs for another.
- [ ] Revealing: watching Marti walk reveals the places he sees; a card cannot be
      pinned on `town.roadworks` before that and can after.
- [ ] Save, reload, continue: deep-equal state; a corrupted string loads as null.
- [ ] The scripted playthrough reaches the anchor with `anchorWatched === true`, or,
      if the content does not allow it on seed 1, the handoff note says where it
      stops and why (and Tagir is asked in `docs/questions.md`).

## Out of scope

Any UI, telemetry, balance measurement (M4).
