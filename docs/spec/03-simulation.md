# 03 — Simulation

The simulation turns `(content, seed, log, watched facts)` into a **wave**: everything
not yet watched, held as a **lantern** (Marti and the cats he perceives, simulated
tick by tick) inside a **fog** (everyone and everything else, computed as
probabilities). It knows nothing about the hand, charge, the journal or the screen.

This file has two halves. §1–§11 define **one history**: state, one step, and every
condition, score and effect in the content language; the lantern runs exactly this.
§12–§18 define **the wave**: the fog's cat chains and cases, placement where fog
becomes fact, observation, and the re-run after an edit (decided 2026-11-21; it
replaces the weighted histories of the 2026-11-21 pack; the lantern edge and re-runs
decided 2026-11-22). The content format is the one in `src/content/data/ch1/` (see `05`); every
key named here appears there.

Words follow the glossary (`docs/glossary.md`). In code, a place is a `node`.

## 1. Numbers and randomness

Everything stored in simulation state is an integer. There are no floats anywhere in
`src/sim`, including intermediate values that are stored or compared.

```ts
// src/sim/math.ts
export const mulPm = (a: number, pm: number): number => Math.trunc((a * pm) / 1000);
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const isqrt = (n: number): number => { /* floor(sqrt(n)) by integer Newton iteration; n <= 2^52 */ };
```

```ts
// src/sim/rng.ts — copy exactly
export function hash32(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}
/** Integer in [0, maxExclusive). Keys must be ASCII. */
export function rand(seed: number, scope: string, tick: number, purpose: string, maxExclusive: number): number {
  return hash32(`${seed}|${scope}|${tick}|${purpose}`) % maxExclusive;
}
```

Test vectors (in `rng.test.ts`):

| Call | Result |
| --- | --- |
| `hash32("")` | 2872998923 |
| `hash32("a")` | 444641715 |
| `hash32("1|marti|0|choice")` | 648401016 |
| `hash32("1|marti|420|choice")` | 2287249445 |
| `hash32("42|worker_a|133|noise:work")` | 2803703836 |
| `rand(1, "marti", 0, "choice", 41)` | 38 |
| `rand(1, "marti", 420, "choice", 41)` | 34 |
| `rand(42, "worker_a", 133, "noise:work", 1000)` | 836 |

Randomness is **counter-based**: a number depends only on who asks, when and why,
never on how many numbers were drawn before. Never introduce a sequential generator.
Scopes used by the simulation:

| Scope | Used for |
| --- | --- |
| `s<stream>:<catId>` | a cat's sampled noise: activity choices, durations, places. Stream 0 in the lantern; other streams only in single-history mode (§12.4). Initial gauges always use `s0:<catId>` (§5) |
| `s<stream>:world` | sampled world noise: `chance` effects, `randomNode`. Stream 0 in the lantern |
| `s<stream>:branch` | branch outcomes in single-history mode and in the lantern (§12.4) |
| `obs` | placement, observation and Gaze (§15) |
| `render` | focus samples for the renderer (§16); never read by the simulation |

`hashState(state)`: FNV-1a 32-bit (the first loop of `hash32`, no finalizer) over the
canonical JSON of the state (object keys sorted recursively, no whitespace), as 8
lowercase hex digits. Vectors: `{}` gives `5465b825`; `{"a":1,"b":[2,3]}` gives
`2c571be4`. An implementation may compute it faster, but a test must show it equals
this definition on a full Chapter 1 state.

### 1.1 Probabilities, σ and softmax

Probabilities are integers in **ppm** (parts per million, 0..1 000 000). The fog's
case weights are integers summing to `WAVE_TOTAL = 1 000 000 000` (§13.5).

`src/sim/exp-table.ts` holds a constant array `EXP` of 1 201 integers,
`EXP[k] = round(65536 · e^(−k/100))` for `k = 0..1200`. It is generated once by
`scripts/gen-exp-table.ts` and committed; nothing computes an exponential at runtime.
Vectors: `EXP[0] = 65536`, `EXP[1] = 64884`, `EXP[50] = 39750`, `EXP[69] = 32871`,
`EXP[100] = 24109`, `EXP[200] = 8869`, `EXP[500] = 442`, `EXP[1000] = 3`,
`EXP[1179] = 0`.

```
softmax(scores[], tTenths) -> ppm[]
  m    = max(scores)
  k_i  = trunc((m - s_i) * 1000 / tTenths)      // x in hundredths, >= 0
  e_i  = k_i > 1200 ? 0 : EXP[k_i]
  p_i  = trunc(e_i * 1_000_000 / Σe)
  the remainder 1_000_000 - Σp goes to the first option with the highest score
```

`tTenths` is the Filter dial ×10 (`cast.json` `temperatureTenths`: 10 = filtered,
40 = awakened). Check: scores `[2, 0]` at `tTenths = 20` give `[731062, 268938]`
(σ(1) = 73%); at `tTenths = 10` they give `[880802, 119198]`; scores `[1, −1, 0]` at
`tTenths = 20` give `[506482, 186320, 307198]`. These three vectors are tests.

`sample(ppm[], r)` with `r` in `[0, 1 000 000)` returns the first index whose running
sum exceeds `r`.

## 2. Time

Tick 0 is `world.startClock` (05:40). One tick is `world.tickMinutes` (1) game minute;
the chapter has `world.ticks` (900) ticks. A clock condition `["HH:MM","HH:MM"]` holds
when the tick's clock time is in `[from, to]`, both inclusive; if `to < from` the
window wraps past midnight. `decisionEveryTicks` (activities.json, 5) sets the
**decision ticks**: `tick % decisionEveryTicks === 0`, the ticks on which decision
triggers are checked (§8.2).

## 3. Space

`map.json`: regions, nodes `{ id, region, pos: [x, z], tags }` in metres, and
undirected edges `{ id?, a, b, minutes, walls?, door?, tags?, when? }`. An edge
without `id` has the id `` `${a}__${b}` ``. An edge with `when` is **open** while the
condition holds and **closed** otherwise.

- **Position** of a cat at a node is the node's `pos`; on an edge from `p` to `q` with
  `left` of `of` ticks remaining it is
  `p + trunc((q − p) · (of − left) / of)` per axis (integer metres).
- **Distance** between two positions is compared squared, never rooted, except where
  this spec calls `isqrt`.
- **Paths.** `path(from, to, opts)` is Dijkstra on `minutes`; ties are broken by the
  lexicographically smaller sequence of node ids. A cat plans as if every edge were
  open, except edges in its `knowsClosed`. `opts.via: NodeId[]` plans through each via
  node in order. `opts.edgesTagged: tag` uses only edges carrying that tag; if no such
  path exists it falls back to the normal path.
- **Indoor and outdoor.** A node is indoor if tagged `indoor`, otherwise outdoor. A
  cat on an edge counts as standing at the edge's nearer end (the far end once
  `of − left > left`).
- **Spaces.** Indoor nodes joined by edges with `walls: 0` form one space. All outdoor
  nodes form the space `outside`. Every other indoor node is its own space.

Region restriction: an activity's place selector (§8.2) only considers nodes in the
cat's current region unless the selector names a `node`, a `region` or is
`randomNode`. That is what keeps Marti in his flat when he wants a box.

## 4. Perception

One function, `perceives(state, catId, source, sense, world)`, answers whether a cat
can sense something this tick. It is used by the simulation (`heard`, hook `onEvent`,
`factIfPerceivedBy`, object `onPerceived`) and by observation and placement (§15). It is the only
place where sight and hearing are computed.

```
base     = sense === 'sight' ? cat.perception.sightM : cat.perception.hearingM
range_mm = base * 1000
if space(cat) != space(source):                       // §3
  for each endpoint E (the cat, then the source) whose node is indoor:
    if E's node is tagged 'window' and weather is dry:
      pm = sense=='hearing' ? openWindowHearingPerMille : openWindowSightPerMille
    else if E's node has an edge with door: true to an outdoor node:
      pm = sense=='hearing' ? doorHearingPerMille : wallSightPerMille
    else:
      pm = sense=='hearing' ? wallHearingPerMille : wallSightPerMille
    range_mm = mulPm(range_mm, pm)
if raining and (either endpoint is outdoor):
  range_mm = mulPm(range_mm, sense=='hearing' ? rainHearingPerMille : rainSightPerMille)
if source has radiusM (a sound): range_mm = min(range_mm, radiusM * 1000)
perceived = (d_m * 1000)^2 <= range_mm^2        // d_m^2 from integer positions
```

The multipliers are in `world.json → perception`. `openWindowSightPerMille` is 0 in
Chapter 1, so Marti hears the street through the open window but sees nothing of the
town from his flat.

Sources:

| Source | Position | Sense |
| --- | --- | --- |
| a cat | its position | sight |
| an object | its node | sight |
| an event with `radiusM` | its source position | hearing |
| any other event | its source position | sight |

A cat always perceives events it emitted, events addressed to it (`to`), events whose
source is its own position, and the weather. A cat also perceives every event of a
storylet in which it holds a role.

An event with no `at`, `from` or `to` is emitted at the position of the cat whose
activity, hook or storylet role produced it (for a storylet: its first bound role).

Objects with `onPerceived: { by, emit, fact? }`: in phase 7, the first tick that cat
perceives the object by sight, emit the event from the object's node and set the
fact (if given). This happens once per history (once per chapter in the lantern); the state records it as the fact
`perceived:<objectId>`.

`voices` (cast.json): how many separate sound events a cat can follow in one tick.
When more sound events reach it than `voices`, it perceives the nearest `voices` of
them (ties by emission order). Rokko has 3; everyone else 1.

## 5. State of one history

```ts
interface SimState {
  tick: number;
  weather: { now: 'dry' | 'rain'; startedAt: number | null; stoppedAt: number | null };
  facts: string[];                          // sorted, set semantics, never removed
  flags: Record<string, Flag>;              // key: name, or name@scope (scope = node or cat id)
  counters: Record<string, number>;
  cats: Record<CatId, CatState>;            // keys in cast.json order
  storylets: Record<StoryletId, StoryletRun>;
  pools: Record<DetectorId, PartialMatch[]>;
  effects: RunningEffect[];                 // in creation order
  pins: Record<PinId, 'pending' | 'fired' | 'expired'>;
  anchor: { reachedAt: number | null; deadAt: number | null };
}
interface Flag { value: number; until: number | null }   // value: integers; true = 1. Expired flags are removed
interface CatState {
  pos: { at: NodeId } | { from: NodeId; to: NodeId; edge: EdgeId; left: number; of: number };
  route: NodeId[];                          // nodes still to visit after the current edge
  activity: ActivityId;                     // 'none' at start of day if startActivity absent
  boredom: number;                          // 0..1000; rises while at the current activity's place, reset on a switch (§8.2)
  forcedLeft: number;                       // ticks left of a card's `delay` (§9.3); 0 = none
  activityStart: number;                    // tick the activity was chosen
  activityPlace: NodeId | null;             // chosen place, null = here
  control: 'free' | 'storylet' | 'forced';  // who decides what it does next (§8.3)
  interrupt: null | { action: string; left: number; by: string };
  base: Record<GaugeId, number>;            // traits O C E A N and hooks, [hooks.floor, 1000]
  initial: Record<GaugeId, number>;         // base at tick 0, for decay `toward: "initial"`
  mods: GaugeMod[];                         // temporary offsets, in creation order
  pressure: number;                         // >= 0
  touchedBy: PinId[];                       // sorted, pins whose effects reached this cat
  knowsClosed: EdgeId[];                    // sorted
  heard: string[];                          // sorted event names this cat has perceived
  voiceAt: Record<GaugeId, number>;         // last tick each hook voiced
}
interface GaugeMod { gauge: GaugeId; add: number; left: number; decayPerTick: number; pin: PinId | null }
interface StoryletRun {
  state: string | null;                     // null = inactive
  enteredAt: number;
  roles: Record<string, CatId[]>;           // single roles hold one id
  ended: boolean;                           // reached a terminal state at least once
}
```

The **value** of a gauge is `clamp(base + Σ mods.add, floor, 1000)` where `floor` is
`hooks.json → floor` for hooks and 0 for traits. Traits never change in the demo.

The initial state of a history whose streams are all `s` (the lantern uses `s = 0`):

- weather `dry`; no facts; flags from `world.initialFlags` (absent = none); counters
  from `world.counters[*].start`;
- each cat at its `start` node, activity `startActivity` with `boredom: 0` and
  `control: 'free'`; `base[g] = lo + rand(seed,
  "s0:<cat>", 0, "init:<g>", hi − lo + 1)` for every trait and hook range in
  cast.json, then clamped to the gauge's range (hooks start at least at `hooks.floor`); everything else empty or zero;
- every storylet inactive; every pool empty; `anchor` both null.

**The seed fixes every cat's starting stats.** Initial gauges are drawn in scope
`s0:<cat>` whatever the history's stream, so every stream, the lantern and the fog start
from the same stats for a given seed; streams differ only in behaviour. The fog's
uncertainty is behaviour, weather and hazards, never who a cat is (decided
2026-11-21, replacing "initial stats are part of the wave").

## 6. One step

`step(content, seed, streams, state, pins, branch) -> { state, events, branchPoint? }`
advances one tick. Phases run in this order; inside a phase cats go in cast order,
storylets and detectors in file order, effects in creation order, pins in log order
`(tick, seq)`.

1. **Pins.** Apply every pin whose `tick === t`, and re-check every `pending` pin
   (§11). Then advance running effects (§9.3) and remove expired flags and mods.
2. **Weather.** Evaluate the weather hazard for the current weather (§7). A branch
   point.
3. **Bodies.** For each cat:
   a. hooks: apply every `rise` and `decay` rule whose condition holds and whose
      `perTicks` divides `t` (§10); then every mod: `left -= 1`, `add` moves toward 0
      by `decayPerTick`; drop mods with `left === 0` or `add === 0`;
   b. `pressure = max(0, pressure − tuning.pressure.decayPerTick)`;
   c. if `interrupt`: `left -= 1`, clear at 0. Nothing else for this cat this tick;
   d. if on an edge: `left -= 1`; at 0 the cat arrives (`pos = { at: to }`, event
      `arrive`);
   e. else if `route` is non-empty: if the edge to `route[0]` is closed, emit
      `blocked`, add the edge to `knowsClosed`, clear `route`, and end the current
      activity (activity `none`, `control: 'free'`, a decision trigger); otherwise
      start the edge (`left = of = minutes / tickMinutes`), shift `route`, emit
      `depart`;
   f. else if at its `activityPlace` (or it is null): run the activity's `while`
      effects whose `everyTicks` (default 1) divides `t − activityStart`; add the
      activity's boredom rate to `boredom` (§8.2), capped at 1000. If
      `control === 'forced'`: `forcedLeft -= 1`, and at 0 the delay ends (§8.3).
4. **Storylets.** Activation, then one transition at most per storylet (§9). Choice
   exits are branch points.
5. **Detectors.** Advance every pool (§10.3).
6. **Free decisions.** For each cat with `control: 'free'`, no interrupt, standing at
   a node, and not the actor of an open storylet choice (§9.2): on a decision tick,
   check its triggers (§8.2); arriving with an empty route, a returned control or an
   effect asking it to decide now (§9.3) trigger at once.
7. **Perception.** Go through this tick's events in emission order and apply what
   cats perceive (§4): `heard`, hook `onEvent`, `factIfPerceivedBy`, `socialSpread`
   hops (§9.3), object `onPerceived` (checked for every object every tick).
8. **Anchor.** If the anchor fact is set and `reachedAt` is null, set it. If
   `anchor.fraysIf` holds and `deadAt` is null and `reachedAt` is null, set `deadAt`. In
   the lantern `fraysIf` is read on the lantern's own state only (what the fog holds
   counts as not set); the lantern's fray also follows the fog's odds (§16).

The returned state has `tick + 1`. Interventions at tick `t` change `states[t + 1]`,
never `states[t]`.

**Branch points.** Phases 2 and 4 can meet an outcome the content leaves to chance
(a hazard firing, a cat choosing an exit). `branch` is the list of outcomes already
decided for this tick, in the order the branch points are met. When `step` meets a
branch point beyond the end of that list, it stops and returns `branchPoint: { key,
options: { label, ppm }[] }` without a state. The caller decides how to resolve it:
a single history and the lantern sample (§12.4); the fog carries the probabilities instead (§13). `step` must be a pure
function of its arguments, so re-running it with a longer `branch` list reproduces
everything before that point exactly. An implementation may clone state at branch
points instead of re-running, if tests show the results are identical.

## 7. Weather

`world.weather`: `initial`, `rainStart` and `rainStop`, each `{ window: [from, to],
perMille, minDurationTicks? }`.

- While dry and rain has not started: if the clock is inside `rainStart.window`, a
  hazard of `perMille` per tick (a branch point: `rain` / `stay`). At the last tick of
  the window the rain starts with certainty.
- While raining: once `minDurationTicks` have passed since it started and the clock is
  inside `rainStop.window`, a hazard of `perMille`; at the window's last tick it stops
  with certainty.
- Starting sets `weather.now = 'rain'`, `startedAt`, fact `rainStarted`, event
  `rainStarted`. Stopping sets `dry`, `stoppedAt`, fact `rainStopped`, event
  `rainStopped`. Rain does not start again in the chapter.

## 8. Cats

### 8.1 Gauges in conditions and scores

`who.name` reads a gauge: `who` is `self`, `@role` or a cat id; `name` is a hook id or
a trait letter (`O C E A N`). A cat without that gauge reads 0.

### 8.2 Free behaviour

Decided 2026-11-22: **hysteresis, not timers.** A cat keeps doing what it is doing
until a decision trigger fires and another activity beats the current one by the
hysteresis margin. Activities have no duration; how long one lasts emerges from the
cat's drives and its boredom.

A cat's `activities` list (cast.json) names the activities it may choose.

**Decision key.** The canonical JSON of: the cat; its current activity and place; the
band index (the bands of §13.2, with the saturated top band) of every
gauge read by the gates and score terms of the current activity and of the candidates,
`boredom` included; the value of every other condition those gates and score terms
read (0 or 1 000 000 for live things; for fog quantities, ppm rounded down to a
multiple of `tuning.fog.ppmQuantum`); and the offers it holds (§9.3).

**Triggers**, checked on decision ticks (phase 6): the cat's decision key differs from
the key of its last decision; it arrived with an empty route; its interrupt ended; a
`delay` ended; control returned from a storylet; an effect asked it to decide now
(§9.3). Arriving, a returned control and "decide now" also trigger at once, off
decision ticks.

**At a trigger:**

```
candidates = activities in the cat's list, other than the current one, whose `gate`
             holds and that have a place, plus offered activities (§9.3)
cur        = score(current) − trunc(boredom × behaviour.boredomWeight / 1000)
             (−∞ when the current activity is `none`, or its gate no longer holds,
             or it has no place)
better     = candidates with score(a) > cur + activities.stickiness
if better is empty: nothing changes
p          = softmax(scores of better, cat.temperatureTenths)
choice     = sample(p, rand(seed, "s<stream>:<cat>", t, "act", 1_000_000))
```

`activities.stickiness` is the hysteresis margin. `score(a)` is §10.2's score terms
plus offers that name `a`. This is **sampled noise**, not a branch: a live cat rolls
it with its stream; the fog splits the mass over `better` instead (§13.3). The
decision key is recorded as the cat's last key whether or not it switched.

**Switching** from the current activity: run its `onFinish`, emit
`activityFinished { cat, activity }` (so `activityFinished` means "left that
activity"), then `activity = choice`, `boredom = 0`, `activityStart = t`,
`activityPlace` = the place selector's pick, `route = path(here, place)`; if it is
already there `route` is empty. If no path or no place exists, the activity is not a
candidate.

**Boredom** rises by the activity's rate each tick the cat is at its place: rate =
`max(1, trunc(1000 × 2 / (lo + hi)))` from the activity's `ticks: [lo, hi]`, which now
sets how fast the activity tires (boredom reaches 1000 after about the middle of that
range), not a duration. Built-ins have rate 0.

**Decision cache.** Within one recompute, the softmax result (`better` and `p`) is
memoised by decision key plus the temperature; the lantern and the fog share the cache.
It is cleared when pins or tuning change. Results with and without the cache are
identical (a test). Only the draw is per tick.

**Place selectors** (`at`), resolved when the activity starts:

| Selector | Picks |
| --- | --- |
| `{ node }` | that node; `$home` = the cat's `home`; `$here` = where it stands |
| `{ tag, region? }` | the nearest node (by path minutes, ties by node order) carrying the tag, or holding an object carrying it; `region: "$homeRegion"` = the home's region |
| `{ anyOf: [...] }` | the nearest node any listed selector would pick |
| `{ flag }` | a node where that scoped flag is set |
| `{ neighbour: true, region? }` | a node one edge away, sampled with purpose `place:<a>` |
| `{ nearest: [tag, ...] }` | the nearest node carrying any of the tags |
| `{ nearCat: true, m }` | where the nearest other cat within `m` metres stands; not a candidate if none |
| `{ randomNode: { region, tag } }` | a node sampled uniformly from those matching, purpose `place:<a>` |

Built-in activities, available to every cat without being listed: `none` (stand
still; it loses to any candidate at the next trigger), `goTo` (§9.3), `attracted` and `repelled` (§9.3). They
have no score terms of their own and are never chosen by a free decision except
through an offer.

### 8.3 Who controls a cat

`control` decides whether phase 6 runs for the cat.

- `free`: it makes free decisions.
- `storylet`: a storylet effect gave it a `goTo` or `startActivity`. It walks and
  performs as told; when its boredom reaches 1000 (or it arrives at a `goTo` target
  with an empty route), `control` returns to `free` and it decides at once.
- `forced`: a card's `delay` holds it in an activity for `forcedLeft` ticks (§9.3).
  Returns to `free` when `forcedLeft` reaches 0, and decides at once.

A cat that is the **actor** of an open choice exit (§9.2) makes no free decision while
that exit is open; the storylet's choice replaces it.

### 8.4 Willpower and direct effects

An effect is **direct** when it comes from a card pinned on that cat (target `cat`).
Direct `interrupt` ticks and direct `gaugeShift` `add` amounts are multiplied by
`(1000 − willpower) / 1000` with `mulPm`. `set` is never reduced. Effects reaching a
cat through a place, an object, `attract`, `socialSpread`, a storylet or an activity
are indirect and never reduced. Marti's willpower is 850, so a card on Marti does 15%
of what it says. This is a teaching beat of the demo and must stay true.

## 9. Storylets

A storylet is a small state machine (`storylets.json`). It is **inactive** until its
`trigger` holds; then it **activates**: roles bind, it enters its `start` state, and
it runs until it reaches a state with no exits (terminal), which ends it.

### 9.1 Activation and roles

In phase 4, for each inactive storylet whose trigger holds (and, if `once: true`, that
has never run): bind roles in the order written, then enter `start`. If a required
role cannot bind, it stays inactive and is tried again next tick. A storylet with
`once: false` may activate again after it ended, the next tick its trigger holds.
`triggerStorylet` and `trigger` effects activate a storylet immediately, ignoring its
trigger (but not `once`); if it is already active, nothing happens.

| Role spec | Binds |
| --- | --- |
| `{ cat }` | that cat |
| `{ roleTag }` | the first cat in cast order with that role |
| `{ roleTag, bind: "all" }` | every cat with that role (a list role) |
| `{ nearCat: "@r", m, bind: "nearest", optional? }` | the nearest cat, not already bound, within `m` metres of role `@r`; an optional role may stay empty |

Trigger kinds that are events rather than states — `card` + `special`,
`activityFinished` — hold only on the tick the event happened.

### 9.2 States and exits

Entering a state records `enteredAt`, runs its `onEnter` effects in order, and emits
`storylet { id, state, roles }` at the position of the first bound role (or of the
actor of the transition that led here). Each tick (phase 4) an active storylet looks
at its current state's exits and takes at most one transition:

1. **auto** exits, in order: the first whose `gate` holds fires. No branching.
2. **hazard** exits whose gate holds: each has a rate `perMille + Σ terms`
   (`{ if, addPerMille }`), clamped to 0..1000. If the rates sum above 1000 they are
   scaled down proportionally. The outcomes `exit_i` with probability `rate_i` and
   `stay` with the rest form a **branch point**.
3. **choice** exits: only on decision ticks, only if no auto or hazard exit fired,
   and only if the actor is standing at a node with no interrupt. The options are the
   choice exits whose gate holds, plus **stay** with score `stayScore` (default 0).
   `p = softmax(scores, actor.temperatureTenths)` where each exit's score is
   `score.base + Σ terms` (§10.2). A **branch point**. A choice exit is **open** while
   its gate holds, whether or not it is a decision tick.

A state's exits all name the same actor role; content validation rejects anything
else.

### 9.3 Effects

Storylet `onEnter`, activity `while` and `onFinish`, hook rules and cards share these.

**Storylet effects** (one key each):

| Effect | Does |
| --- | --- |
| `{ fact }` | adds the fact |
| `{ flag, value?, ttl?, at? }` | sets `flag@<node>` (or the unscoped `flag`) to `value` (default 1; `true`/`false` = 1/0); `ttl` ticks of life. `at` names a node, or a cat, meaning the node it stands at |
| `{ gauge: "who.g", add? , set?, holdTicks? }` | `set` writes `base`; `add` writes `base`, unless `holdTicks` is given, then adds a mod of that length with no decay |
| `{ counter, add }` | adds to a counter (used by `while`) |
| `{ goTo: [who, node], route?, via?, tag? }` | plans a path (§3; `route`: `shortest`, `via`, `edgesTagged`), sets activity `goTo` (arriving at the target with an empty route ends it), `control: 'storylet'`. For a list role, every cat |
| `{ startActivity: [who, a] }` | starts activity `a` as a free choice would, but `control: 'storylet'` |
| `{ stop: who }` | clears `route`; if on an edge, the cat finishes that edge first; activity `none`, `control: 'free'` |
| `{ interrupt: [who, action, ticks] }` | sets `interrupt` for `ticks` |
| `{ emit, at?, from?, to?, radiusM?, factIfPerceivedBy? }` | emits event `emit` at node `at`, or at cat `from`'s position, or addressed to cat `to`; `factIfPerceivedBy: { cat: fact }` adds the fact if that cat perceives it (phase 7) |
| `{ trigger: storyletId }` | activates that storylet |
| `{ chance: pm, ...effect }` | applies the rest of the effect with probability `pm`/1000, sampled with purpose `chance:<n>` in scope `s<stream>:world` |

**Card and power primitives** (`prim`). The target is a cat, an object (acts at its
node) or a place. `target: "marti"` inside a special overrides the target. Inside
`scale` terms, a gauge without `who.` is read from the cat being offered, and
`{ primeCount: cat, add }` works as in §10.2. A card's pin **runs** while any running
effect it created is in `state.effects`; an instant card with none runs only on the tick
it fires.

| Primitive | Does |
| --- | --- |
| `interrupt { action, ticks: [lo, hi], radiusM? }` | the target cat (or every cat within `radiusM` of the place) gets `interrupt` for a sampled number of ticks; direct on a cat target (§8.4) |
| `gaugeShift { gauge, add?, set?, decayPerTick?, holdWhileRunning?, ticks?, ifHasGauge? }` | on the target cat: `set` writes `base`; `add` with `decayPerTick` adds a mod that shrinks by that much per tick; with `holdWhileRunning` adds a mod of `ticks` length; otherwise writes `base`. `ifHasGauge`: skip cats without it |
| `attract { radiusM, strength, ticks, scale? }` | a running effect at the place for `ticks`: every cat within `radiusM` (straight-line) that the power's `affects` allows (absent = every cat) gets an offer: the activity `attracted` (walk to the place, stay until the effect ends) added to its candidates with score `strength + scale terms`. Affected cats decide at once on the first tick |
| `repel { radiusM, strength, ticks }` | the mirror: an offer of `repelled` (walk to the nearest node outside the radius) with score `strength` |
| `socialSpread { event, radiusM, hops }` | emits `event` at the target with `radiusM`. In phase 7, every cat that perceives it for the first time re-emits it from its own position next tick with `hops − 1`, while `hops > 0` |
| `delay { ticks: [lo, hi], action }` | the target cat performs activity `action` where it stands for a sampled number of ticks (`forcedLeft`), `control: 'forced'` |
| `move { to }` | `goTo` for the target cat |
| `triggerStorylet { storylet }` | activates it (`ifTarget: cat` = only if that cat is among the affected) |
| `setFlag { flag, at?, ticks?, onlyObjects? }` | sets the flag (scoped to the target place or object's node when `at: "$target"`) for `ticks` |
| `collapse { radiusM, ticks }` | Gaze. Not a state change: it schedules observation samples (§15.4) |

Running effects (`attract`, `repel`, timed flags from cards) are listed in
`state.effects` with `left` ticks; phase 1 counts them down and removes them at 0.

A card pinned on a cat adds the card's `pressure` to that cat (cap
`tuning.pressure.cap`). A card on a place or object adds it to every cat its effect
reaches. Every cat a pin's effect reaches gets the pin id in `touchedBy`.

## 10. Conditions, scores, hooks, detectors

### 10.1 Conditions

| Condition | Holds when |
| --- | --- |
| `all`, `any`, `not` | as named |
| `{ fact }` | the fact is set |
| `{ flag, at? }` | the flag is set and non-zero; with `at`, the flag scoped to that node, or to the node that cat stands at |
| `{ gauge: "who.g", gte?, lte?, lt? }` | gauge comparison |
| `{ at: who, node? , tag?, region? }` | the cat stands at that node / a node with that tag / in that region (on an edge: its nearer end) |
| `{ near: [a, b], m }` | two cats, or a cat and a node, within `m` metres |
| `{ clock: [from, to] }` | §2 |
| `{ weather: "rain" \| "dry" }` | current weather |
| `{ power: id, near: who, m }` | a running effect created by a pin of that power sits at a place within `m` metres of the cat |
| `{ pin: cardId, near: who, m }` | a running effect (`state.effects`) created by a pin of that card sits at a place within `m` metres of the cat |
| `{ state: [storylet, state] }` | that storylet is in that state |
| `{ counter, gte?, lt?, eq? }` | counter comparison |
| `{ heard: event, by: who }` | the cat has perceived that event this chapter |
| `{ countCats: { tag?, notTag?, except? }, eq }` | the number of cats (not in `except`) standing at nodes with `tag` and without `notTag` |
| `{ bound: "@role" }` | the optional role holds a cat |
| `{ activityFinished: [who, a] }` | that cat finished that activity this tick |
| `{ card, special: true }` | that card's special was pinned this tick |
| `{ activity: who, is }` | the cat's current activity |

### 10.2 Score terms

| Term | Adds |
| --- | --- |
| `{ base }` | its value (once per score) |
| `{ if, add }` | `add` when the condition holds |
| `{ gauge, per, add, if? }` | `trunc(value / per) * add`, only when `if` holds (if given) |
| `{ primeCount: cat, add }` | `add` × the number of `world.primes` that hold for that cat |

### 10.3 Hooks

`hooks.json`: each hook has `rise` and `decay` rules and a `voice`.

- `{ when?, perTicks, add }`: when `when` holds (or always) and `t % perTicks === 0`,
  add to `base`.
- `{ onEvent, add }`: in phase 7, when the cat perceives that event.
- `decay { when?, perTicks, add, toward? }`: as a rise; `toward: "initial"` stops at
  the cat's initial base value instead of the floor.
- **Voice.** When a hook's value crosses `over` upward (or `under` downward), and
  `tuning.voice.cooldownTicks` have passed since `voiceAt[hook]`, the cat emits
  `voice { cat, hook, line }` with `radiusM = tuning.voice.radiusM`; the line is
  sampled from `lines` (or `linesOver`) with purpose `voice:<hook>`.

### 10.4 Detectors (story sifting)

`detectors.json`: each detector is a **pattern** whose `kernel` is an ordered list of
clauses, with optional `unless` clauses. Completing the kernel sets fact `emits` and
emits event `detector { id }`. A detector fires at most once per history.

Clauses:

- `{ holds: cond, forTicks: n }`: the condition holds on `n` consecutive ticks.
- `{ event: name, at? }`: that event is emitted this tick (at that node, if given).
- `withinTicks: w` on a clause: it must complete within `w` ticks of the previous
  clause completing.
- `unless: [{ fact, between: [i, j] }]`: the fact becoming set while the match is at
  a stage `i <= stage < j` kills the match.

A **partial match** is `{ stage, stageTick, count }`. A history's **pool** for a
detector holds its live partial matches, sorted, part of the state and its hash. Each
tick, for each match: if the next clause is an event clause and the event happened,
a **fork**: a copy advances, the original stays (the stage-0 match is implicit and
always present). A `holds` clause advances in place: `count` grows while the condition
holds and resets when it does not; at `forTicks` the match advances. Matches past
their `withinTicks` window, or killed by `unless`, are dropped. A pool keeps at most
`tuning.sifting.maxMatchesPerPattern` matches, dropping the oldest `stageTick` first.

A detector **involves** the cats named in its clauses (`at`, `near`, `except`). With
no cat named, it involves everyone (used for perception in §15). In the fog,
detectors are estimated (§13.6).

## 11. Pins in the simulation

Pins are the log (`04` §3):

```ts
type Pin =
  | { id: PinId; seq: number; tick: number; kind: 'card'; card: CardId;
      target: { cat: CatId } | { object: ObjectId } | { place: NodeId }; special: boolean }
  | { id: PinId; seq: number; tick: number; kind: 'power'; power: PowerId; place: NodeId };
```

At its tick (phase 1), a pin is **valid** if:

- card on a cat: the card has an `on.cat` branch, `bound` is null or that cat;
- card on an object: `on.object` exists (or this is the special), the object is
  visible (`visibleWhen` holds, if given), and, if a primitive of that branch lists
  `onlyObjects`, the object is in that list;
- card on a place: `on.place` exists;
- power: always.

A valid pin fires: its effects run (the special's effects instead, when `special` is
true and the target is the card's `special.on` object), its state becomes `fired`,
and it emits `pinFired { pin }`. An invalid pin becomes `pending` and emits
`fizzle { pin, reason }` (`noBranch`, `wrongCat`, `hidden`); a pending pin is
re-checked every tick and fires the first tick it is valid. Pending pins expire at
the chapter's end. Validity is per history, so a pin can fire in one history and
fizzle in another; in the fog it is evaluated per chain state (§13.6).

## 12. One history, end to end

### 12.1 The chapter

`runHistory` starts from the initial state and steps until tick `world.ticks`, or
until `tuning.end.afterAnchorTicks` ticks after `anchor.reachedAt`.

### 12.2 The anchor

`anchor.json`: `requirements` (a tree of `all`/`any` of facts with weights),
`fraysIf` (a condition) and the anchor fact (its id). A history **reaches** the
anchor when the anchor fact is set; it is **dead** from the tick `fraysIf` first holds
without the anchor fact, or at the last tick of the chapter if it never reached it.

A **main storylet** is one with an effect (`fact`, or `factIfPerceivedBy` on an
`emit`) that sets a fact named in the requirement tree, the anchor fact included; every
other storylet is a **side storylet**. The list is derived at load, never authored
(Chapter 1: `door_lure`, `blocked_road`, `usual_route`, `chain_on_beach`,
`tideline_wander`, `rokko_morning`, `under_the_boat`). Only main storylets stop a
re-run (`04` §6).

### 12.3 Requirement progress

`progressOf(state)` = Σ weights of requirement items satisfied in that state (an `any`
group counts once, when any member holds).

### 12.4 Single-history mode

For tests, the CLI, calibration and the lantern, `runHistory(content, seed, stream,
pins)` gives every cat and the world that one stream, and resolves every branch point
by sampling: `sample(options, rand(seed, "s<stream>:branch", t, key, 1_000_000))`. It
returns the per-tick states and events. Every cat is live (§13.4). Single-history
mode is the **reference simulation**: calibration (`07` §3) compares the fog's odds
against it.

## 13. The wave: fog and lantern

Decided 2026-11-21 (design doc, World model › Fog and lantern). It replaces the
weighted histories of the 2026-11-21 pack.

The wave is everything not yet watched. It has two parts:

- the **lantern**: Marti and the cats he perceives, simulated by `step` (§6) on one
  concrete state, as in single-history mode;
- the **fog**: every other cat and every world quantity nobody live has fixed, held as
  probabilities and **computed**, never simulated.

Displayed odds only need to be plausible, not exact: every collapse draws its outcome
from them, so they are honest by construction. Where the fog is an approximation,
this section says so. Calibration (`07` §3) measures how far it drifts from the
reference simulation.

### 13.1 The lantern edge and the projection

- The **lantern edge** (glossary) is the last tick of the current timeline's lantern.
  On ticks `0 .. lanternEdge` the lantern exists: Marti is live and simulated
  directly from tick 0, the weather is concrete (sampled as in §12.4 with stream 0),
  and placed cats are live (§15). The fog holds every other cat. The playhead never
  passes the lantern edge, and nothing past it is drawn, placed or observed.
- The edge moves in two ways only: **live playback** at the edge advances the lantern
  one tick at a time (§15.2), and a **re-run** after an edit simulates the lantern again
  from the edit tick to the frontier limit (§17, `04` §6). A new game starts with
  `lanternEdge = 0`.
- **Marti is never fogged** (Tagir, 2026-11-23, `docs/questions.md` M2-15). He is always
  observed: every run of the chapter, in play or not, simulates him live in the lantern
  from tick 0.
- A **whole-day run** advances the lantern from tick 0 to the chapter's end with an
  empty frontier limit and nobody watching: Marti live on stream 0, every other cat in
  the fog, placement, release and fog events drawn into the lantern exactly as in a
  re-run (§15.1), the pins of its log applied, no watched facts. It stops at the
  lantern's fray (§16) or the chapter's end. It serves seed vetting (`04` §2),
  calibration (`07` §3) and the balance measures (`05` §5.2). An event's **chance by the
  end of a whole-day run** is 1 000 000 if the lantern holds it, and otherwise its
  probability in the fog (the cases by weight). Marti's own events are therefore 0 or
  1 000 000 per seed: one sampled Marti, not a distribution.
- A **projection from tick `t`** advances the fog alone from `t` to the chapter's end:
  every cat live at `t`, Marti included, becomes a point mass at its live state. It is
  computed, never drawn, and serves only `strain` in the debug panel (§14).

### 13.2 Cat chains

A **cat chain** is a probability distribution over **chain states** for one cat, held
per case (§13.5) and advanced in **fog steps** of `tuning.fog.stepTicks` ticks (5, the
decision interval). Frames for the ticks inside a step use that step's distribution.

A chain state is:

```ts
interface ChainState {
  activity: ActivityId;          // includes 'none' and the built-ins of §8.2
  place: NodeId;                 // where the activity happens (the place selector's pick)
  walk: null | { from: NodeId; path: NodeId[]; leftSteps: number; ofSteps: number };
  bands: Record<GaugeId, number>;// band index of each banded gauge, boredom included (below)
  interrupt: null | { action: string; leftSteps: number };   // also a card's `delay`
  control: 'free' | 'storylet' | 'forced';
}
```

- **Probabilities** are integers in ppm per case; each cat's chain sums to 1 000 000 in
  every case. Products truncate; the remainder of a renormalisation goes to the first
  state in canonical order (the canonical JSON of the state, sorted).
- **Sparse.** Only states with mass are stored. After every step, states below
  `tuning.fog.minStatePpm` are dropped and the cat's chain renormalised.
- **No activity timers** (§8.2, decided 2026-11-22). A state has no "time left" at
  its activity: boredom, always banded, rises at the activity's rate and moves mass
  band by band, and switching follows §8.2's triggers. Only travel and card timers
  count down, in steps (`ceil(ticks / stepTicks)`): walking uses the path of §3, its
  position interpolated along the path as in §3; interrupts and `delay` spread their
  sampled duration uniformly over `leftSteps`.
- **Bands.** A gauge that changes during the day (hooks, pressure) is banded: its range
  is cut into `tuning.fog.bands` bands, `n − 1` equal bands from the gauge's floor up to
  `tuning.fog.saturatedBandFrom` (950) and one narrow **saturated band** from there to
  1 000; its value in conditions is the band's own midpoint, so a gauge at its cap reads
  about 975 (decided 2026-11-22, `docs/questions.md` M2-7). A change of `add` walks the
  mass across each whole band it covers, then moves `trunc(rest × 1 000 000 / width)` ppm
  of it one band further, using each band's own width. At most `tuning.fog.maxBandedGauges` gauges per cat are banded:
  those read by the scores or gates of the cat's activities and of storylets it can
  hold a role in, in hooks.json order. Boredom is banded in addition and does not count
  toward that limit. The cat's other changing gauges and all traits
  are **mean-field**: one expected value per cat and case, updated by the same rules.
- **Initial distribution.** At tick 0 each cat is at its `start` with
  `startActivity`, boredom in band 0, and its seeded stats (§5): each banded gauge's mass sits in the band holding its seeded
  value, and traits and mean-field gauges hold their seeded values. Protagonists are
  live from tick 0 with the same stats.
- **Rise and decay.** A hook rule that would add `add` to a gauge over a step moves
  `trunc(add × 1 000 000 / bandWidth)` ppm of each state's mass to the next band (or
  the previous one for a negative add), scaled by the ppm of the rule's `when`
  condition. Temporary mods from effects shift bands the same way when applied and
  shift back at their expiry (a decaying mod shifts back in equal parts each step).

### 13.3 The decision function

There is **one** decision function, used by the lantern and the fog. Every condition
of §10.1 returns a probability in ppm instead of a boolean:

- in the lantern, about live things, it returns 0 or 1 000 000, so the arithmetic is
  exactly the boolean arithmetic of §8 to §10;
- about anything in the fog (a fogged cat, a fog fact, flag, counter or storylet
  state), it returns that quantity's probability at this tick in the current case
  (§13.6).

Score terms use the ppm: `{ if, add }` adds `trunc(add × ppm / 1 000 000)`; a
`gauge` term reads the gauge's value (live) or band midpoint (banded) or expected value
(mean-field). A **gate** holds when its ppm is at least `tuning.fog.gateThresholdPpm`
(500 000). `all` multiplies ppm (independence assumed), `any` is `1 − Π(1 − p)`, `not`
is `1 − p`.

Fog decisions follow §8.2's triggers; nothing is polled. On a decision step the fog
calls the decision function only for mass whose decision key changed: mass that moved
into another band of a gauge its decision reads (boredom included), the states of a cat
whose world-condition values changed bucket (`fog.ppmQuantum`) this step, and mass that
arrived or whose interrupt, `delay` or storylet control ended. All other mass keeps its
activity without a call. A deciding state's mass stays where it is with the share for
"nothing changes" and is split over `better` by the same softmax as §8.2, with offers;
results come from the shared decision cache (§8.2). A candidate's place is the place
selector's pick from the state's place; a selector that samples (`neighbour`,
`randomNode`) splits the mass evenly over its candidates. `nearCat` picks the node
where the nearest other cat most likely stands.

The fog never reimplements the decision function, the place selectors or the score
terms: it calls the same code with fog inputs.

### 13.4 Live and fogged cats

Up to the lantern edge each cat is either **live** (part of the lantern) or **fogged**:

- Marti, and every followed protagonist, is live at every tick up to the lantern edge.
- A fogged cat becomes live when it is **placed** (§15.1).
- A live cat that no protagonist has perceived for `tuning.lantern.releaseAfterTicks`
  ticks is **released**: at the next step boundary it returns to the fog as a point
  mass at its live state (bands from its exact gauges).

The lantern state is `{ sim: SimState, live: CatId[], dwell: Record<CatId, number>,
heldStorylets: StoryletId[] }`. `step` gets `live` and `heldStorylets` as arguments:
phases 3 and 6 skip cats that are not live, and phase 4 skips storylets held by the
fog. In single-history mode every cat is live and no storylet is held, so `step`
behaves exactly as in M1 (the M1 golden hashes must not change).

A storylet is **held by the fog** while any of its bound roles (or, before
activation, any role it would bind) is a fogged cat. It runs in the lantern once every
role is live, or once a protagonist perceives one of its events; then its state is
drawn from its fog distribution (purpose `"storylet:" + id`, §15.1) and it continues
live. When a role's cat is released, the storylet returns to the fog as a point mass at
its current state.

### 13.5 Cases and links

A **case** is an assignment of values to the shared causes: the **weather** state
(`dry`, `rain`, `stopped`) and each **link**. The fog holds a list of cases, each with
an integer weight (all cases sum to `WAVE_TOTAL = 1 000 000 000`) and, conditioned on
that case, every fogged cat's chain and every fog quantity. Cats are independent given
the case; correlation between cats comes only through cases. (This is a factored
forward pass in the style of Boyen and Koller.)

- **Weather.** Up to the lantern edge the weather is concrete and there is one weather
  case. In a projection the weather case moves by the hazards of §7, using the exact
  start-time distribution for `minDurationTicks` (the weather alone is tracked tick by
  tick with its start tick; cats only see the three states).
- **Links** are boolean facts or storylet states read by several cats, so that the
  readers agree on them. At load, the **readers index** lists, for every fact, flag and
  storylet state, which conditions read it (activity scores and gates, storylet gates
  and exits, hook rules, detectors, the anchor's requirement tree). The links are the
  facts and storylet states read by at least two different cats or by the anchor's
  requirement tree, ranked by the number of readers (ties by file order), at most
  `tuning.fog.maxLinks`.
- **Splitting.** In a case where a link is false, let `m` (ppm) be the probability
  that its causes set it during this step, computed in that case. The case splits: a
  new case where it is true takes `trunc(weight × m / 1 000 000)`, the false case
  keeps the rest; both inherit the same chains and quantities. From then
  on every reader evaluates the link as 0 or 1 000 000 in that case. Cases with the
  same assignment merge: weights add, chains mix by weight.
- **Meetings.** Two fogged cats meet through **expected company**: the chance both
  are at a place is the product of their masses there. A storylet or effect that needs
  them together fires with that probability. Its effect on a banded gauge is an
  average nudge (`p × add`). A lasting effect (a fact, flag or `heard`) that something
  reads, once its probability passes `tuning.fog.linkFloorPpm` (about 5%), is promoted
  to a link if a slot is free. Otherwise each fact, flag and `heard` keeps a
  **contributor heap**: its top `tuning.fog.contributors` sources (storylet or effect,
  cats, place, window, ppm added). §15.3 builds links from the heap on demand.
- **Pressure** in the fog sums the expected number of cats present.

The number of cases is at most 3 × 2^`maxLinks`.

### 13.6 Fog quantities

Every world quantity the lantern has not fixed is a probability per case:

| Quantity | In the fog |
| --- | --- |
| a fact | P(set by this tick); never decreases |
| a flag (scoped or not) | P(set now), with its `until` handled per contributing effect |
| a counter | expected value and variance (integers); `{ counter, gte }` uses the committed `PHI` table on the standardised distance (§13.7) |
| a storylet's state | a distribution over `inactive`, its states and `ended`; roles bound as below |
| an event | P(emitted at each place this step) |
| `heard` for a cat | P(the cat has perceived the event); never decreases |
| a detector | P(completed by this tick), estimated (below) |
| the anchor | P(reached by this tick) and P(dead by this tick) |

- **Storylets in the fog.** Activation: the cumulative activation probability is the
  running maximum of the trigger's ppm. Roles bind as in §9.1; a dynamic role
  (`nearCat`) binds the cat most likely to satisfy it at activation (ties in cast
  order); an optional role binds only if that likelihood passes the gate threshold.
  Auto exits move the mass of the state times the gate's ppm when the gate passes the
  threshold; hazard exits use §9.2's rates with terms scaled by ppm; choice exits use the
  decision function on decision steps, times the probability that the actor is
  available (standing at a node, no interrupt). Entering a state applies its effects
  with that state's entering mass `m`: a fact or flag gains `m`; a cat-directed effect
  (`goTo`, `startActivity`, `interrupt`, `gauge`, `stop`) moves `m` of that cat's chain
  mass (independence assumed); an emitted event gains `m` at its place.
- **Detectors in the fog** are estimated as the product, over the kernel's clauses in
  order, of the highest probability each clause's condition or event reaches inside its
  window. `unless` clauses are ignored. Only detectors that something reads, or that a
  requirement item names, are estimated.
- **Perception between fogged cats** (`heard`, hook `onEvent`, `factIfPerceivedBy`,
  `socialSpread`) uses the **place perception table**: for every pair of nodes, each
  sense and each of `dry` and `rain`, whether §4 `perceives` would hold between cats
  standing there. It is built once at load. A walking cat counts as standing at the
  nearer end of its current edge.
- **Pins on fogged targets** apply their primitives as mass moves: `interrupt` and
  `delay` move the targeted mass into an interrupted state for the sampled duration
  (a uniform split over the range); `gaugeShift` shifts bands; `attract` and `repel`
  add offers to the decision function; `setFlag` and `triggerStorylet` act on fog
  quantities. Willpower (§8.4) reduces direct effects as in the lantern. A pin on a cat
  acts on the whole chain wherever the cat is; validity (§11) is evaluated per state and
  the invalid share produces `fizzle` with that probability.

### 13.7 Numbers

`src/sim/phi-table.ts` holds `PHI[k] = round(1 000 000 · Φ(k / 100))` for
`k = 0..400`, Φ the standard normal CDF, generated by `scripts/gen-phi-table.ts` and
committed. `P(X ≥ x)` for a counter with mean `μ` and variance `v` is
`z = trunc((μ − x + ½) × 100 / isqrt(v))` (scaled to integers), `PHI[min(|z|, 400)]`
mirrored for negative `z`; with `v = 0` it is 0 or 1 000 000. Everything else in the fog
uses the integer rules of §1.

### 13.8 Randomness

Randomness in the lantern is §1's with stream 0 for every live cat and the world.
The fog has no randomness of its own: it carries probabilities. Draws that turn fog
into fact use scope `obs` (§15). The scopes `s<stream>:*` with other streams are used
only by single-history mode.

## 14. Forward and backward passes

**Forward pass.** From a checkpoint, advance the lantern one tick and the fog one step
whenever a step boundary passes, in this order per tick: the lantern's `step` (§6)
with live cats and lantern storylets; the fog step (weather case, links, storylets,
chains, quantities, events, perception between fogged cats); then the lantern edge
(§15.1). Lantern effects on the fog (an event emitted, a fact set, a cat spooked) are
applied to the fog in the same tick; fog quantities read by live cats are read as ppm
(§13.3). In a projection there is no lantern: only fog steps.

**Backward pass.** When evidence arrives at tick `t` (a placement, a negative
observation, a watched fact, a Gaze sample, or the anchor treated as already seen):

1. **Cases.** Each case's weight is multiplied by the likelihood of the evidence in
   that case, then all weights are renormalised to `WAVE_TOTAL`. This is exact Bayes
   over cases: seeing Ogryzok at the pier raises the cases in which the cart did not
   come, and with them the cats that read that link.
2. **Chains.** In each case, the observed cat's chain at `t` is conditioned on the
   evidence (the states that disagree get 0, the rest renormalised).
3. **Smoothing.** The same cat's earlier fog steps, back to where it was last live or
   to tick 0, are re-weighted by the forward–backward rule so earlier ghosts agree
   with what was seen. This only changes frames of past ticks, so an implementation may
   defer it until those frames are requested.
4. **Forward again.** The fog is re-advanced from `t` with the new weights.

**Anchor treated as already seen.** With `tuning.waves.anchorConditioning` on, a
projection's case weights are multiplied by P(anchor reached | case) at the chapter's
end, so unwatched odds lean toward the anchor. Chains inside a case are not
re-weighted (an approximation). With the knob off, or when no case reaches the anchor,
raw weights are used. **Strain** (debug panel only) is the unconditioned P(anchor) of a
projection from the lantern edge, computed only while the debug panel is open.

Open (`docs/questions.md` M2-2): nothing past the lantern edge is drawn, so
conditioning a projection no longer changes anything the player sees. Until Tagir
settles it, the knob stays and acts on projections only.

## 15. Observation and Gaze

### 15.1 Placement

Every tick the lantern advances (in live playback or in a re-run), after `step`, for
each followed protagonist `P` and each fogged cat `c`, in cast order:

1. `q` = the probability, over `c`'s chain in the current case mixture, that `P`
   perceives `c` by sight (§4, from `c`'s state position).
2. Draw `r = rand(seed, "obs", t, "place:" + P + ":" + c, 1 000 000)`. No log hash:
   unrelated edits keep the same draw where the odds allow it.
3. If `r < q`, **place** `c`: pick a state among those `P` would perceive, in
   proportion to mass, with a second draw (purpose `"pick:" + P + ":" + c`). Make `c`
   live: position and activity from that state; boredom and each banded gauge drawn
   uniformly within its band, and mean-field gauges set to their expected value
   (purpose `"gauge:" + c + ":" + g`); traits are the seeded ones (§5); flags and `heard` set where their probability is at least 500 000.
   `c` gets `dwell = tuning.lantern.dwellTicks`: while it is above 0, phase 6 makes no
   free decision for `c` (it keeps its activity) and it counts down each tick. Then
   apply the evidence "`c` is in that state at `t`" by the backward pass (§14).
4. Otherwise apply the **negative evidence** "`P` does not see `c` at `t`" by the
   backward pass: the states `P` would perceive get 0.

Storylets held by the fog collapse the same way when they become live (§13.4): a
state is drawn from their distribution, purpose `"storylet:" + id`, then evidence is
applied. Events emitted in the fog that `P` would perceive are drawn per place with
purpose `"event:" + name + ":" + node`; drawn ones are emitted into the lantern as if
live, the rest are negative evidence.

If no state is consistent with what is already fixed (every candidate has 0 mass), try
the next state in canonical order; if none exists, the placement uses a **local
cause**: the cat is placed in the activity it is seen doing with no change to anything
else, and `stats.localCauses` counts it.

### 15.2 Watching (playback)

During playback the player layer calls `observe(t, P)` (`04` §7) once per tick that
passes. If `t` is the lantern edge, the worker first advances the lantern and the fog
one tick (§14, placement §15.1) and the edge moves to `t + 1`; otherwise the lantern at
`t` already exists (from earlier playback or a re-run) and nothing is recomputed. It
returns a **watched fact** `{ tick, cat: P, digest, summary }`. The perceived view and its
`digest` are as before: `P`'s own position, activity, interrupt and storylet states;
every cat `P` perceives by sight with its position and activity; every event of tick
`t` `P` perceives, with the fields that sense reveals; the weather. `summary` lists
what the view shows that the UI and payouts need: storylet states entered
(`"storyletId.state"`), detectors completed, the facts those set at `t` (`factsSet`),
other events by name, cats seen, `nodesSeen` (nodes `P` perceives by sight, each node a
sight source at its position), and for each storylet state or detector its `paidBy`:
the `touchedBy` pins of the live cats bound to its roles (or involved in the
detector). It also carries `totalPressure`: the summed pressure of all live cats plus
the expected pressure of the fogged ones.

The same seed, pins and tick give the same watched fact. A re-run places cats exactly
as playback would (the draws of §15.1 do not depend on whether anyone watches), so
playing over re-run ticks watches what the re-run showed; only playback records watched
facts and pays (`04` §7).

### 15.3 Links on demand

When a placement or a watched event shows a lasting effect (a fact, flag or `heard`)
whose cause is in the fog and is not a link, the worker builds links from that
quantity's contributor heap: each listed source becomes a link (while slots allow),
the fog is recomputed from the earliest source's window, and the evidence is applied
again. Seeing that Grisha knows the tale then makes Semyon more likely to have been at
the bakery around 10:00. Sources that are not listed are explained by a local cause.

### 15.4 Gaze

A power pin with the `collapse` primitive (Gaze) draws, at each of its ticks
`pin.tick .. pin.tick + ticks − 1`, everything within `radiusM` metres of the place,
ignoring walls and weather: each fogged cat is placed or not by §15.1's rule with that
circle instead of `P`'s perception (purpose `"gaze:" + pin.id + ":" + t + ":" + c`).
Gazed cats are fixed at those ticks as evidence; they do not become live unless a
protagonist perceives them. The facts it fixes are recorded as `gazeFacts`, count as
paid (`04` §7) and earn no payouts.

### 15.5 Imposed facts (replay)

Watched facts are passed into every re-run (repeat by default). After an edit at tick
`e`, the re-run replays from the checkpoint at or before `e` with the new pins and the
same draws. At each watched fact's tick it reaches, it compares the lantern's view with
the fact:

- Parts about cats other than `P` that differ: if the cat's chain (or, for a live cat
  that the edit changed, its chain from the tick it diverged) gives the watched
  position and activity a probability above 0, the cat is **forced** into that state
  (placed with that state instead of a draw) and the evidence is applied.
- Parts about `P` itself, or forced parts with probability 0, make the fact
  **impossible**: it is skipped and reported as `reopened`.
- `tuning.observation.reopenBelowPpm` (default 0) reopens a fact whose forced parts
  together have less than that probability. When a watched fact reopens is an open
  question (glossary, Open conflicts 2): keep the knob, do not change its default.

**Facts past the new edge.** A watched fact belongs to its tick, and an edit can move
when things happen. Every watched fact after the tick where the re-run stops is
**reopened without a test**: the story it saw now happens at other ticks, or past the
edge where nothing is computed. The re-run reports them in `reopened`, and the paid ones
in `breaks`, so the break alert lists them before the edit lands (`04` §4). No watched
fact ever lies past the lantern edge. (Tagir, 2026-11-22; replaces option (a) of
`docs/questions.md` M2-4.)

## 16. Fray and frames

**Fray.** (Tagir, 2026-11-23, `docs/questions.md` M2-16.) Whether the anchor can still
be reached depends on everything the player might yet do, so it is never computed.
The fray is instead the chapter's **point of no return**: its `fraysIf` (Chapter 1:
Rokko has left or run home, and they have not met), a fact about the world that no
player action undoes (content must keep it so). P(alive) = 1 000 000 − P(dead), where
P(dead) is the fog's
probability, over its cases by weight, that `fraysIf` has held without the anchor fact
by `t` (§13.6, the running maximum per case), each case reading what the lantern holds
as fact. The lantern frays at the first tick where P(alive) is below
`tuning.fog.frayBelowPpm` (1 000): at once when `fraysIf` holds on the lantern's own
facts, never once the lantern holds the anchor fact, and at the chapter's last tick if
the anchor was not reached by then. An unwatched fact that is merely likely never ends
the timeline. The timeline ends at the fray: neither playback nor a re-run passes it.
A projection frays the same way on its own cases (`docs/questions.md` M2-12).

**Frames.** For each tick up to the lantern edge the worker aggregates what the renderer and the player layer
need (`02` §4): per cat, the distinct `(position, activity, interrupt)` with their
probabilities in ppm (a live cat has one at 1 000 000); per event kind and storylet
state, the probability it happens at that tick; the probability it is raining; the
probability each requirement item holds; and `samples`: `tuning.render.focusSamples`
coherent trajectories for the renderer's focus layer (`06` §2), made by drawing a case
by weight and then backward-sampling each fogged cat's chain in that case (purpose
`"focus:" + k`, scope `render`, never `obs`). Frames are derived and never saved.

## 17. Re-run

The worker keeps a **checkpoint** of the lantern state and the fog (cases, chains,
quantities) every `tuning.waves.checkpointEvery` ticks of the lantern. Every edit lies
at or before the lantern edge (pins sit at the playhead, `04` §3). After an edit at tick
`e`, the **re-run** replays the lantern and the fog from the last checkpoint at or
before `e` (§14, placement §15.1, imposed facts §15.5) and runs on, tick by tick, until
the first of:

- the **frontier limit** (`04` §6), which the worker evaluates on the lantern as it
  goes, from the frontier the request carries (`02` §3);
- the fray (§16);
- the chapter's end (§12.1).

The lantern edge becomes that tick. The re-run **streams**: it sends frames to the UI
as it advances (`02` §3), so the scrubber fills from `e` like a video buffering. It
observes nothing, records nothing and pays nothing (§15.2). Frames before `e` are
unchanged, except where the backward pass smooths them (§14).

Live playback at the edge (§15.2) advances the lantern one tick and runs nothing else.

A re-run returns `{ frames, edge, end, reopened, breaks, gazeFacts, stats }` where `edge`
is the new lantern edge and `end` is `{ kind: 'anchor' | 'fray' | 'chapterEnd' |
'limit', tick }`: how the lantern ends (`'limit'` when it stopped at the frontier limit;
its tick is the edge). `stats` holds, per tick, the number of cases, live cats and fog
states, plus re-run time, strain and `localCauses` (debug only).

## 18. What must always hold (tests)

- Same content, seed, pins, watched facts and frontier → identical re-run results, on
  every run and in every browser engine the e2e suite covers.
- A re-run and live playback over the same ticks give the same lantern (same state
  hashes, same placements); playback only adds watched facts.
- A re-run stops at the frontier limit, the fray or the chapter's end, whichever comes
  first; the lantern edge is that tick, and no frame exists past it.
- Every number in every state is an integer; every gauge value is within its range;
  every cat's chain sums to 1 000 000 in every case; case weights sum to
  `WAVE_TOTAL`.
- Single-history mode is unchanged by this section: M1's golden hashes hold.
- Adding a pin at tick `t` leaves every frame before `t` unchanged when no watched
  fact after `t` reopens.
- A pin that is invalid in every state leaves the wave identical to the wave without
  it, except for its `fizzle` events.
- On the tiny world, with one fogged cat and no links, the fog's marginals equal an
  exact enumeration of that cat's single-history outcomes to within
  `tuning.fog.exactTolerancePpm`; with one link, the case weights after evidence equal
  Bayes' rule computed by hand.
- The fog and the lantern call the same decision function: a test feeds a live state
  and the matching point-mass chain state and gets the same probabilities.
- Hysteresis: a cat switches only at a trigger and only to an activity that beats the
  current one (minus boredom) by `activities.stickiness`; with no trigger the fog calls
  no decision for that mass.
- The decision cache changes nothing: recompute results with the cache on and off are
  byte-identical.
- Placement draws come from states with mass above 0, or are counted in
  `stats.localCauses`.
- **Calibration** (`07` §3): over many seeds, a probability shown at one tick matches
  how often the event happens in the reference simulation, bucket by bucket.
- With an empty log, for seeds 1 to 50, Marti is in region `flat` at every tick of the
  whole-day run (§13.1), to its end.
