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
  frontier: number;                      // highest progress ever reached (§6)
  anchorWatched: boolean;
  playhead: number;
  marks: { changedUnwatched: number[] }; // ticks of watched, unpaid facts that reopened
}
```

All changes go through pure functions in `src/player/actions.ts`:
`(player, view, content, args) -> { player, error? }`, where `view` is the latest
recompute result held by the UI (frames, end, gazeFacts). Actions never mutate their
input. An action that changes `pins` returns the new pins; the UI then asks the worker
for a recompute (§4).

A new game: all cards `unfound`, `charge = economy.charge.start`, `revealed` = every
node of a region with `revealedAtStart: true`, `followed = ['marti']`, `playhead = 0`,
everything else empty. The requested seed comes from the UI (`?seed=` or random);
`src/player` never generates one.

## 2. Seed vetting

Before the first recompute of a new game, the worker vets the seed once (pacing):

```
for k in 0 .. tuning.vetting.maxCandidates - 1:
  candidate = k == 0 ? requested : hash32(requested + "|vet|" + k)
  compute the untouched timeline (no pins, no watched facts, conditioning off)
  pass if, for every fact in tuning.vetting.requireFacts, the raw probability that
       it holds by the chapter's end is >= tuning.vetting.minPpm
take the first candidate that passes; if none does, take the requested seed
```

The result is stored as `seed` and never changed during play. A bookmarked seed is
always the vetted one, so it always gives the same world.

## 3. Pins: playing, withdrawing, moving

### 3.1 Playing a card

`playCard(cardId, target)` adds a pin at `tick = playhead`. Allowed when all hold:

- the card's zone is `hand`;
- `playhead <= frontierLimit` (§6) and the timeline has not ended before it;
- the card has a branch for the target kind (`on.cat`, `on.object`, `on.place`, or
  the target is the card's `special.on` object);
- place target: the node is in `revealed`;
- object target: its node is in `revealed` and it is visible with probability > 0 in
  the frame at the playhead;
- cat target: `bound` is null or that cat, and the cat stands at a revealed node with
  probability > 0 in the frame at the playhead. (A character card follows its cat:
  in each history the pin acts wherever the cat is.)

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
`revealed`, `playhead <= frontierLimit`, and the power targets `place`. Subtract the
cost and add a power pin at the playhead. Charge is **never refunded**: withdrawing a
power pin returns nothing, and moving it (`movePin`) costs the full cost again and is
refused when charge is short. A power pin that fizzles keeps what was paid.

### 3.3 Withdrawing and moving

`withdraw(pinId)` removes a pin (refused for unique cards). `movePin(pinId, tick)`
changes its tick, keeps its `seq`, re-sorts (refused for unique cards; within
`0..frontierLimit`). For cards, moving is free; for powers it pays again.

### 3.4 Draws (rule `discard` only)

A draw event of size `n` repeats `n` times: if no card is in `draw`, move every
`discard` card to `draw`, ordered by `hash32(seed + "|reshuffle|" + reshuffles + "|" +
cardId)` ascending, increment `reshuffles`; then move the first card of `drawPile` to
`hand`. Draw events of size 1 happen on every exploring payout (§7: a region revealed,
a hook discovered). Under the other rules nothing is drawn.

## 4. Edits, break alerts and reopened facts

Every action that changes `pins` is an **edit**. The UI sends the new pins with the
current watched facts to the worker as a **preview**. The result says which watched
facts would reopen (`03` §15.4).

- A reopened watched fact is **paid** if its `summary` has a non-empty `paidBy` for
  any storylet state or detector, or it is a Gaze fact. If any paid fact would
  reopen, the UI shows a **break alert** before the edit lands (`06` §6): it lists
  what would no longer happen and offers Confirm and Cancel. It is information only;
  confirming costs nothing extra.
- On commit, reopened facts are removed from `watched`. The ticks of reopened
  **unpaid** facts are added to `marks.changedUnwatched` (a quiet mark, no alert).
- Payouts already paid stay paid (they are keyed by kind, `§7`). The frontier never
  decreases.

## 5. Following

`followed` lists the protagonists whose perception collapses the wave during
playback. In the demo it is always `['marti']`. After the anchor, Rokko's thread is
shown as a **locked thread** (`06` §9); following him is out of scope. Keep the field
and the `follow(cat)` action signature; the action refuses every cat but Marti.

## 6. Frontier

```
P_t(item)    = conditioned probability (03 §16) that a requirement item holds at t
               (watched facts make it 1)
progress(t)  = Σ weight of requirement items with P_t(item) >= tuning.frontier.countAtPpm
frontierLimit = the largest t such that progress(t') <= frontier for every t' <= t
                (and t <= the timeline's last tick, or its fray tick)
```

- **Scrubbing** (dragging the playhead, stepping, jumping) is clamped to
  `0..frontierLimit`.
- **Playback** may advance one tick past the limit at a time. After each advance,
  `frontier = max(frontier, progress(playhead))`.
- An edit that makes progress happen earlier moves the limit earlier in clock time.
  That is intended.
- When playback watches the anchor (§7), `anchorWatched = true`.

The player can drag freely through everything already earned; new story progress
has to be watched as it happens.

## 7. Playback, observing and rewards

When the playhead advances in **playback** from `t` to `t + 1`, the UI asks the
worker to `observe(t, cat)` for each followed cat, unless `watched` already has a fact
for `(t, cat)`. Scrubbing observes nothing. The worker returns the watched fact; the
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

**Repeat by default.** Pins stay on the timeline and fire again on every recompute;
watched facts are imposed on every recompute. Scrolling back and pressing play shows
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
- Scrubbing never changes `charge`, `paid`, `watched`, `revealed`, `journal` or
  `frontier`.
- `frontier` never decreases.
- Save, load, continue: deep-equal state; a corrupted string loads as null.
