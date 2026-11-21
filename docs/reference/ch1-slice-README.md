# Chapter 1 test slice: a chaotic bit of catworld

Placeholder content for running the engine. Nothing here is canon. It isn't balanced either: it's deliberately busy, so it pushes the wave model, perception and storylets harder than the real chapter will.

`node tools/validate.mjs` checks cross-references: every node, cat, role, fact, flag, event, card, storylet state and text key resolves. Today it reports 0 errors.

**Schema.** This is a proposed shape, written against the glossary (2026-11-20), not against the old build pack's specs. Either adapt the loader to it or treat it as input for rewriting specs 03–07.

## What's in it

| File | Contents |
| --- | --- |
| `world.json` | Day from 05:40, 900 ticks of 1 minute; rain start and stop as hazards; perception multipliers; Marti's three primes; the roadwork counter (800) |
| `map.json` | 28 nodes in 3 regions (flat, town, beach), 31 edges in minutes. Positions are in metres for the graybox. `roadworks_pass` closes when `roadBlocked` |
| `cast.json` | 12 cats. `core: true` marks the minimal set (Marti, Rokko, Prasha, Gavrila, Bublik); the other 7 are chaos |
| `hooks.json` | 3 shared hooks, Marti's 3, Rokko's 3; rise and decay rules; voice lines |
| `activities.json` | 23 free behaviours, scored by integer terms; softmax over score / T plus stickiness |
| `objects.json` | 15 objects: the 5 card objects in the flat, a kettle and shelf, town props, the chain, the boat, a bottle |
| `cards.json` | The 6-card demo deck plus 3 test cards (`demo: false`) |
| `powers.json` | Lure (100 charge) and Gaze (40 charge, 6 m, 5 ticks) |
| `storylets.json` | 16 storylets: 8 required, 2 special-effect ones, 6 chaos |
| `detectors.json` | 7 patterns: soaked, near miss, waited under the awning, streets empty, and others |
| `anchor.json` | Requirement tree with weights summing to 100; frays when Rokko leaves before the meeting |
| `economy.json` | Charge payouts per storylet state and per detector; charge floor at rain start |
| `text/en.json`, `text/ru.json` | 201 keys plus a few UI hints, fully written in both languages |

## Routes to the anchor (what the engine should discover)

1. **Road block.** The crew doesn't finish before the rain and the trench stays open. Marti takes the awning, then the Sea Steps, sees the chain glint, follows the chain, and finds Rokko under the boat.
2. **Closed shop.** The road is fine, but Prasha closes early in the rain. Marti goes down the slipway to the pier stump, along the tideline, and to the boat.
3. **Dead ends (fray):**
   - the shop is open and Marti settles in with tea
   - Marti turns home at the barrier
   - Marti retreats from the chain and never comes back
   - Rokko runs home, or leaves when the rain stops, or gives up on the sand pillow

Things that should collide:
- Gavrila's tea break: the Tea Break card plays on the roadworks as a place.
- Semyon's Catlantis tale: Marti only hears it through the open window while it's dry, which is a prime.
- Kuzya's parcel boxes: they appear in random streets and pull every cat.
- Grisha shouting for help with the laundry.
- Ogryzok swapping junk for Marti's pocket contents.
- Pelageya's paw in the rain: a tiny, unexplained awakening hint.

Balance notes:
- **Core-only road block.** With only the 5 core cats there are 2 workers, which means about 400 minutes of work, so the road is always blocked. With all 4 workers, the expected slack before the rain is about 70–100 minutes, which is the intended setting.
- **Crew chatter is full-cast only.** It needs Semyon (non-core). In core mode it never binds.
- **Hearing Semyon is a knife-edge.** It works only through the open window while dry: Marti's hearing is 50 m × 0.9, about 45 m, against about 43.6 m to the roadworks. That's on purpose, as a perception test.

## Condition and effect language (DSL)

References:
- `self`: the acting cat.
- `@role`: a role bound in a storylet.
- A bare id: a cat or node.
- Gauges: `who.name`, where `name` is a hook or a Big Five letter (O C E A N), from 0 to 1000.

**Conditions:**

| Condition | Meaning |
| --- | --- |
| `all` / `any` / `not` | Combine other conditions |
| `fact` | A fact is true |
| `flag` (optionally `at` a node or cat) | A flag is set |
| `gauge` + `gte` / `lte` / `lt` | A gauge comparison |
| `at` + `node` / `tag` / `region` | A cat's location |
| `near: [a, b]` + `m` | Two cats (or a cat and a node) within that many metres |
| `clock: ["HH:MM","HH:MM"]` | Time window; it may wrap past midnight |
| `weather: "rain"` / `"dry"` | Current weather |
| `power: id` + `near` + `m` | A placed power within that many metres of a cat |
| `pin: cardId` + `near` + `m` | A card pin within that many metres of a cat |
| `state: [storylet, state]` | A storylet is in that state |
| `counter` + comparison | A world counter comparison |
| `heard: event` + `by` | A cat perceived that event |
| `countCats` + `eq` | How many cats match a filter |
| `bound: @role` | An optional role got a cat |
| `activityFinished: [cat, activity]` | That cat just finished that activity |
| `card` + `special` | That card's special effect was just played |

**Score terms:**

| Term | Effect |
| --- | --- |
| `{ base }` | Starting score |
| `{ if, add }` | Add when the condition holds |
| `{ gauge, per, add }` | Add `floor(gauge / per) * add`; an optional `if` gates it |
| `{ primeCount: cat, add }` | Add `add` for each satisfied prime |
| Hazard terms `{ if, addPerMille }` | Raise the per-tick hazard rate |

**Effects (storylet `onEnter`):**
- Facts and flags: `fact`, `flag` + `value` (or `ttl`, optionally `at`).
- Gauges: `gauge` + `add` / `set` (optionally `holdTicks`).
- Movement and activity: `goTo: [cat, node]` with `route` set to `shortest`, `via`, or `edgesTagged`; `startActivity: [cat, activity]`; `stop`; `interrupt: [cat, action, ticks]`.
- Events: `emit` (optionally `radiusM` and `factIfPerceivedBy`).
- Other: `trigger` (start a storylet), `chance` (per-mille).

**Card primitives:** `interrupt`, `gaugeShift`, `attract`, `repel`, `socialSpread`, `delay`, `move`, `triggerStorylet`, `setFlag`. Gaze adds `collapse`, its own primitive.

**Exits:**
- `choice`: the actor softmaxes over its exits plus staying (`stayScore`, default 0), with score / T.
- `hazard`: per-mille chance per tick.
- `auto`: fires as soon as its gate holds.
