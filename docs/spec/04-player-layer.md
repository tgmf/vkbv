# 04 — Player layer

The player exists outside time. Scrolling never changes the hand, the charge, the
journal, the revealed map or the frontier. This layer owns everything that is saved.
It never simulates: it holds pins and watched facts, asks the wave (`03`) for
results through the bridge, and turns what is watched into rewards.

## 1. State

```ts
interface PlayerState {
  v: 2;
  seedRequested: number;
  seed: number;                          // after seed vetting (§2)
  pins: Pin[];                           // the log, sorted by (tick, seq)  (03 §11)
  nextSeq: number;
  cards: Record<CardId, { zone: 'unfound' | 'hand' | 'pinned' | 'spent' | 'draw' | 'discard'; pin?: PinId }>;
  drawPile: CardId[];                    // order of cards in zone 'draw' (rule 'discard' only)
  reshuffles: number;
  specialsUsed: CardId[];                // once per playthrough
  charge: number;
  paid: string[];                        // payout keys already paid (§7), sorted
  watched: WatchedFact[];                // sorted by (tick, cat)       (03 §15.2)
  followed: CatId[];                     // ['marti'] in the demo
  revealed: NodeId[];                    // sorted
  journal: { hooks: GaugeId[]; stories: ObjectId[] };
  frontier: {                            // how far the story has been played (§6)
    story: number;                       // story limit: highest progress ever watched
    pastTicks: number;                   // most ticks ever played past the story limit
    storylets: StoryletId[];             // storylets ever watched, sorted
  };
  anchorWatched: boolean;
  playhead: number;                      // always 0..lanternEdge (§6)
  marks: { changedUnwatched: number[] }; // ticks of watched, unpaid facts that reopened
}
```

All changes go through pure functions in `src/player/actions.ts`:
`(player, view, content, args) -> { player, error? }`, where `view` is the latest
re-run result held by the UI (frames, edge, end, gazeFacts). Actions never mutate their
input. An action that changes `pins` returns the new pins; the UI then asks the worker
for a recompute (§4).

A new game: all cards `unfound`, `charge = economy.charge.start`, `revealed` = every
node of a region with `revealedAtStart: true`, `followed = ['marti']`, `playhead = 0`,
`frontier = { story: 0, pastTicks: 0, storylets: [] }` (so the lantern edge is 0),
everything else empty. The requested seed comes from the UI (`?seed=` or random);
`src/player` never generates one.

## 2. Seed vetting

Every seed the game offers must be **solvable** with the player's actions and must make
enough of the chapter's **authored story** reachable (Tagir, 2026-11-23,
`docs/questions.md` M2-17). Solvability cannot be computed for every seed, so vetting
uses a sufficient check: the chapter's **recorded solutions**, pin sets that solve it
in the intended ways. Marti's choices are keyed by seed and tick, not by the log, so a
seed's whole-day run under a solution is exactly what a player playing those pins gets.

```
for k in 0 .. tuning.vetting.maxCandidates - 1:
  candidate = k == 0 ? requested : hash32(requested + "|vet|" + k)
  for each recorded solution in tuning.vetting.solutions (pin sets of 05 §5.1):
       the whole-day run (03 §13.1: Marti live from tick 0, the other cats in the fog)
       with the solution's pins and no watched facts, conditioning off, with the
       candidate's seeded stats (03 §5)
  solvable: at least one solution's run reaches the anchor (the lantern holds the
       anchor fact) and, in that run, every fact of tuning.vetting.requireFacts has a
       chance by the end (03 §13.1) of at least tuning.vetting.minPpm
  story: over all the solutions' runs, the share of authored storylets entered is at
       least tuning.vetting.minStoryletShare; a storylet counts when the lantern ran
       it, or when a state other than its start has a chance in the fog of at least
       tuning.vetting.minPpm
  pass if solvable and story
take the first candidate that passes; if none does, take the requested seed
```

The check is sufficient, not necessary: a rejected seed may be solvable some other way,
and is simply replaced by the next candidate.

**Where it runs.** Vetting a candidate costs one whole-day run per solution, too slow
for a page load. `npm run vet` vets seeds offline and writes the list of vetted seeds
(`src/content/data/ch1/vetted-seeds.json`); a new game draws its seed from that list.
Only a seed the player types (`?seed=`) or a bookmark is vetted live, in the worker,
behind a loading indicator, with the coarser fog knobs `tuning.vetting.fog`.

The result is stored as `seed` and never changed during play. A bookmarked seed is
always the vetted one, so it always gives the same world.

## 3. Pins: playing, withdrawing, moving

### 3.1 Playing a card

`playCard(cardId, target)` adds a pin at `tick = playhead`. Allowed when all hold:

- the card's zone is `hand`;
- `playhead <= lanternEdge` (§6);
- the card has a branch for the target kind (`on.cat`, `on.object`, `on.place`, or
  the target is the card's `special.on` object);
- place target: the node is in `revealed`;
- object target: its node is in `revealed` and it is visible with probability > 0 in
  the frame at the playhead;
- cat target: `bound` is null or that cat, and the cat stands at a revealed node with
  probability > 0 in the frame at the playhead. (A character card follows its cat:
  the pin acts wherever the cat is, live or in the fog, `03` §13.6.)

If the target is the card's `special.on` object and the card is not in
`specialsUsed`, the UI first shows the special's confirm step (`06` §6). On confirm,
the pin gets `special: true` and the card joins `specialsUsed`. Withdrawing that pin
does **not** restore the special. Specials are once per playthrough.

What happens to the card depends on `tuning.player.playedCardRule`:

| Rule | On play | On withdraw |
| --- | --- | --- |
| `pinned` (default) | zone `pinned`; the card is its pin | pin removed, zone `hand` |
| `spent` | zone `spent` | pin removed, card stays spent |
| `discard` | zone `discard` | pin removed, card stays in discard; draws in §3.4 |

A **unique** card (`unique: true`) goes to `spent` under every rule, and its pin
cannot be withdrawn or moved: it stays and fires whenever its target is there.

### 3.2 Powers

`usePower(powerId, place)`: allowed when `charge >= power.cost`, the place is in
`revealed`, `playhead <= lanternEdge`, and the power targets `place`. Subtract the
cost and add a power pin at the playhead. Charge is **never refunded**: withdrawing a
power pin returns nothing, and moving it (`movePin`) costs the full cost again and is
refused when charge is short. A power pin that fizzles keeps what was paid.

### 3.3 Withdrawing and moving

`withdraw(pinId)` removes a pin (refused for unique cards). `movePin(pinId, tick)`
changes its tick, keeps its `seq`, re-sorts (refused for unique cards; within
`0..lanternEdge`). For cards, moving is free; for powers it pays again.

### 3.4 Draws (rule `discard` only)

A draw event of size `n` repeats `n` times: if no card is in `draw`, move every
`discard` card to `draw`, ordered by `hash32(seed + "|reshuffle|" + reshuffles + "|" +
cardId)` ascending, increment `reshuffles`; then move the first card of `drawPile` to
`hand`. Draw events of size 1 happen on every exploring payout (§7: a region revealed,
a hook discovered). Under the other rules nothing is drawn.

## 4. Edits, break alerts and reopened facts

Every action that changes `pins` is an **edit**. The UI sends the new pins with the
current watched facts and `frontier` to the worker as a **preview**: a re-run (`03`
§17), streamed into the scrubber as it goes. Its result says which watched facts would
reopen (`03` §15.5) and where the new lantern edge is.

- A reopened watched fact is **paid** if its `summary` has a non-empty `paidBy` for
  any storylet state or detector, or it is a Gaze fact. If any paid fact would
  reopen, the UI shows a **break alert** before the edit lands (`06` §6): it lists
  what would no longer happen and offers Confirm and Cancel. It is information only;
  confirming costs nothing extra.
- Watched facts after the new lantern edge are always reopened (`03` §15.5): they
  belong to their ticks, and the story there has moved. Paid ones are listed in the
  break alert like any other.
- On commit, reopened facts are removed from `watched`. The ticks of reopened
  **unpaid** facts are added to `marks.changedUnwatched` (a quiet mark, no alert).
- Payouts already paid stay paid (they are keyed by kind, `§7`). The frontier never
  decreases, and a re-run never changes it.
- **Pins past the new lantern edge.** On commit, every pin whose tick is after the new
  edge leaves that stretch: an ordinary card's pin is removed and the card returns to
  `hand` (under every played-card rule); a unique card's pin moves to the edge tick,
  keeping its `seq`; a power pin moves to the edge tick at no cost (`docs/questions.md`
  M2-3). Then `playhead = min(playhead, edge)`.
- **Warning for moved pins.** If the preview's edge would move any unique or power pin
  (its tick is after the new edge), the break alert shows before the edit lands even when
  no paid fact reopens. It lists each such pin and where it would move, with the same
  Confirm and Cancel (`06` §6). Ordinary cards returning to the hand need no warning.

## 5. Following

`followed` lists the protagonists whose perception collapses the wave during
playback. In the demo it is always `['marti']`. After the anchor, Rokko's thread is
shown as a **locked thread** (`06` §9); following him is out of scope. Keep the field
and the `follow(cat)` action signature; the action refuses every cat but Marti.

## 6. Frontier

```
P_t(item)   = probability that a requirement item holds at t in the current timeline
              (a fact set in the lantern makes it 1 000 000; otherwise the fog's odds, 03 §16)
progress(t) = Σ weight of requirement items with P_t(item) >= tuning.frontier.countAtPpm
reach       = the first tick of the current lantern with progress(t) >= frontier.story,
              or none if the current timeline never gets there
```

**The frontier** changes only in playback. After each playback advance to tick `t`:

```
if progress(t) > story:          story = progress(t); pastTicks = 0     (reach becomes t)
else if reach exists, t >= reach: pastTicks = max(pastTicks, t - reach)
storylets ∪= every storylet with a state in the watched fact's summary (03 §15.2)
```

Re-runs and scrubbing never change it. It is measured from the last beat, not the
clock: an edit that delays the beat that reached the story limit moves `reach` later,
and the player can still go `pastTicks` beyond it.

**The frontier limit** is where a re-run stops (`03` §17): the last tick `t` such that
every tick `t'` from the edit up to `t`

- shows Marti no main storylet (`03` §12.2) outside `frontier.storylets`: no state of
  one would appear in a watched fact at `t'`;
- has `progress(t') <= story`;
- has `t' - reach <= pastTicks`, when `reach` exists;

and never past the fray or the chapter's end. Side storylets never stop a re-run: they
are shown, and pay only in playback. A timeline that never reaches the story limit runs
on to the fray or the end.

**The lantern edge** (`03` §13.1) is where the current timeline's lantern ends. A re-run
puts it at the frontier limit; live playback at the edge moves it one tick at a time and
moves the frontier with it, so the edge and the frontier limit stay the same tick. It is
not saved: loading a save re-runs from tick 0 to the frontier limit.

- **Scrubbing** (dragging the playhead back, the shuttle backward at any speed, or forward
  faster than `player.observeMaxTps` behind the edge) moves only within `0..lanternEdge`
  and observes nothing. The timeline cannot be clicked or dragged ahead of the playhead
  (the shuttle, `06` §3).
- **Playback** is forward at up to `player.observeMaxTps`: behind the edge it watches what
  the lantern holds; at the edge it is live and extends the edge (`03` §15.2), at a speed
  capped at `player.observeMaxTps` and at what the simulation sustains. During a re-run
  forward movement waits at the last tick that has arrived.
- An edit that makes new story happen earlier moves the edge earlier in clock time.
  That is intended.
- When playback watches the anchor (§7), `anchorWatched = true`.

The player can drag freely through everything already played; new story has to be
watched as it happens.

## 7. Playback, observing and rewards

When the playhead advances in **playback** from `t` to `t + 1`, the UI asks the
worker to `observe(t, cat)` for each followed cat, unless `watched` already has a fact
for `(t, cat)`. Scrubbing observes nothing, and a re-run records and pays nothing:
playback over its ticks does. The worker returns the watched fact; the
player layer appends it and applies `reward(fact)`:

| Watched | Key | First time only |
| --- | --- | --- |
| a storylet state entered, with a payout in `economy.payouts.storyletState` | `sl:<id>.<state>` | pay charge |
| a detector completed, with a payout in `economy.payouts.detector` | `det:<id>` | pay charge |
| a requirement item of the anchor becoming true (a fact in `summary.factsSet` that the item names) | `req:<path>` | pay `economy.payouts.anchorRequirement` |
| the anchor fact in `summary.factsSet` | `anchor` | `anchorWatched = true` |
| the event `rainStarted` | `rain` | charge floor, below |
| the followed cat's `voice` for hook `h` | `hook:<h>` | add `h` to `journal.hooks`; give `economy.cardsFromExploring.discoverHook[h]`, if any |
| a node the followed cat sees (`summary.nodesSeen`) | `reveal:<node>` | add to `revealed`; the first node of a region also gives `revealRegion[region]`, if any |

**Paying charge:**

```
mult   = min(tuning.charge.multCapPm,
             1000 + trunc(summary.totalPressure / economy.pressureScale.per)
                    * economy.pressureScale.addPercent * 10)
gain   = mulPm(base, mult)
charge = min(economy.charge.cap, charge + gain)
```

**Charge floor:** when `rain` is first watched and `tuning.charge.floorOn` is true,
`charge = max(charge, economy.charge.floorAtRainStart)`, so one lure is always
affordable. With `economy.charge.variantRainStartPays` true, the floor is off and the
detector `rain_started` pays `floorAtRainStart` as an ordinary payout instead.

A key already in `paid` does nothing, so charge cannot be farmed by scrolling or by
breaking chains. **Gaze facts never pay.** A watched fact that reopens and is watched
again pays nothing new.

Observation returns the new player state plus a list of `Reward` records
(`{ key, charge?, cards?, revealed?, hook? }`) for the UI to animate.

**Repeat by default.** Pins stay on the timeline and fire again on every re-run;
watched facts are imposed on every re-run. Scrolling back and pressing play shows
the same day unless the player changes something.

## 8. Inspecting objects

`inspect(objectId)`: allowed when the object's node is revealed and the object is
visible with probability > 0 at the playhead. Not a pin; does not touch the wave.
First time: add the object to `journal.stories`; its `grantsCard` card moves from
`unfound` to `hand`; key `inspect:<id>` in `paid`. Later times only show the story.

## 9. Saving and the bookmark

`src/player/save.ts`: `serialize(player, settings) -> string`,
`deserialize(string) -> { player, settings } | null` (validated with Zod; any failure
returns null), `load(storage)`, `store(storage, …)` with a storage object passed in so
tests can use a fake. Key `acfw.ch1.v2`. The UI saves after every action and every 5
seconds of playback. Wave results are never saved; they are recomputed from `seed`,
`pins` and `watched`. A null load starts a new game with a one-line notice. Players
editing their save by hand is allowed: validate the shape, no checksums.

The **bookmark** (M10) is the same serialised player state (without settings) in the
URL fragment: seed, log, playhead, watched facts, specials used, journal, revealed
map, frontier, payouts already paid.

## 10. What must always hold (tests)

- Actions are pure: same inputs, same outputs; inputs never mutated.
- Every refusal reason of every action has a test.
- A payout key pays at most once per playthrough, whatever is scrolled, edited or
  re-watched.
- Charge only goes down when a power is placed or moved; it never goes up from a
  withdrawal.
- Scrubbing and re-runs never change `charge`, `paid`, `watched`, `revealed`, `journal`
  or `frontier`.
- `frontier.story` never decreases; `frontier.storylets` only grows.
- The playhead never passes the lantern edge; after every action the lantern edge equals
  the frontier limit.
- Save, load, continue: deep-equal state; a corrupted string loads as null.
