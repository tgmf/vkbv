# 03 — Simulation

The simulation turns `(content, seed, log, watched facts)` into a **wave**: a set of
weighted candidate histories of the chapter, recorded tick by tick. It knows nothing
about the hand, charge, the journal or the screen.

This file has two halves. §1–§11 define **one history**: state, one step, and every
condition, score and effect in the content language. §12–§17 define **the wave**:
how histories split, merge, are trimmed, are observed and are conditioned on the
anchor. The content format is the one in `src/content/data/ch1/` (see `05`); every
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
| `s<stream>:<catId>` | a cat's sampled noise, with that cat's stream in the history (§13): initial gauges, activity choices, durations, places |
| `s<stream>:world` | sampled world noise, with the history's world stream: `chance` effects, `randomNode` |
| `s<stream>:branch` | branch outcomes when running a single history (§12.4) |
| `wave` | resampling (§14) |
| `obs` | observation and Gaze sampling (§15) |

`hashState(state)`: FNV-1a 32-bit (the first loop of `hash32`, no finalizer) over the
canonical JSON of the state (object keys sorted recursively, no whitespace), as 8
lowercase hex digits. Vectors: `{}` gives `5465b825`; `{"a":1,"b":[2,3]}` gives
`2c571be4`. An implementation may compute it faster, but a test must show it equals
this definition on a full Chapter 1 state.

### 1.1 Probabilities, σ and softmax

Probabilities are integers in **ppm** (parts per million, 0..1 000 000). Weights are
integers; the whole wave sums to `WAVE_TOTAL = 1 000 000 000`.

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
**decision ticks**: `tick % decisionEveryTicks === 0`.

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
`factIfPerceivedBy`, object `onPerceived`) and by observation (§15). It is the only
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
fact (if given). This happens once per history; the state records it as the fact
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
  activityLeft: number;                     // ticks left at the place; 0 = finished
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

The initial state of a history whose streams are all `s` (§13):

- weather `dry`; no facts; flags from `world.initialFlags` (absent = none); counters
  from `world.counters[*].start`;
- each cat at its `start` node, activity `startActivity` with `activityLeft` sampled
  as for a free choice (§8.2) and `control: 'free'`; `base[g] = lo + rand(seed,
  "s<s>:<cat>", 0, "init:<g>", hi − lo + 1)` for every trait and hook range in
  cast.json, then clamped to the gauge's range (hooks start at least at `hooks.floor`); everything else empty or zero;
- every storylet inactive; every pool empty; `anchor` both null.

Initial stats are therefore **part of the wave**: each starting history has its own
draw, and watching the cats narrows which survive.

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
      activity (`activityLeft = 0`, activity `none`, `control: 'free'`); otherwise
      start the edge (`left = of = minutes / tickMinutes`), shift `route`, emit
      `depart`;
   f. else if at its `activityPlace` (or it is null) and `activityLeft > 0`: run the
      activity's `while` effects whose `everyTicks` (default 1) divides
      `t − activityStart`; `activityLeft -= 1`; at 0 run `onFinish`, emit
      `activityFinished { cat, activity }`.
4. **Storylets.** Activation, then one transition at most per storylet (§9). Choice
   exits are branch points.
5. **Detectors.** Advance every pool (§10.3).
6. **Free decisions.** For each cat with `control: 'free'`, no interrupt, standing at
   a node, and not the actor of an open storylet choice (§9.2): decide (§8.2) if it is
   a decision tick, or its activity just finished, or it arrived this tick with an
   empty route, or an effect asked it to decide now (§9.3).
7. **Perception.** Go through this tick's events in emission order and apply what
   cats perceive (§4): `heard`, hook `onEvent`, `factIfPerceivedBy`, `socialSpread`
   hops (§9.3), object `onPerceived` (checked for every object every tick).
8. **Anchor.** If the anchor fact is set and `reachedAt` is null, set it. If
   `anchor.fraysIf` holds and `deadAt` is null and `reachedAt` is null, set `deadAt`.

The returned state has `tick + 1`. Interventions at tick `t` change `states[t + 1]`,
never `states[t]`.

**Branch points.** Phases 2 and 4 can meet an outcome the content leaves to chance
(a hazard firing, a cat choosing an exit). `branch` is the list of outcomes already
decided for this tick, in the order the branch points are met. When `step` meets a
branch point beyond the end of that list, it stops and returns `branchPoint: { key,
options: { label, ppm }[] }` without a state. The caller decides how to resolve it:
the wave splits (§13); a single history samples (§12.4). `step` must be a pure
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

A cat's `activities` list (cast.json) names the activities it may choose. At a
decision (phase 6):

```
candidates = activities in the cat's list whose `gate` holds and that have a place
score(a)   = score terms of a (§10.2)
             + (a.id === cat.activity && cat.activityLeft > 0 ? activities.stickiness : 0)
             + attract/repel offers that name a (§9.3)
p          = softmax(scores, cat.temperatureTenths)
choice     = sample(p, rand(seed, "s<stream>:<cat>", t, "act", 1_000_000))
```

This is **sampled noise**, not a branch: each history rolls its own, with that cat's
stream. If the
choice is the current, unfinished activity, nothing changes. Otherwise the cat
switches: `activity = choice`, `activityLeft = lo + rand(…, "dur:<a>", hi − lo + 1)`
from the activity's `ticks: [lo, hi]`, `activityPlace` = the place selector's pick,
`route = path(here, place)`; if it is already there `route` is empty. If no path or no
place exists, the activity is not a candidate.

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
still, `activityLeft = 0`), `goTo` (§9.3), `attracted` and `repelled` (§9.3). They
have no score terms of their own and are never chosen by a free decision except
through an offer.

### 8.3 Who controls a cat

`control` decides whether phase 6 runs for the cat.

- `free`: it makes free decisions.
- `storylet`: a storylet effect gave it a `goTo` or `startActivity`. It walks and
  performs as told; when that activity finishes (or it arrives at a `goTo` target with
  an empty route), `control` returns to `free` and it decides at once.
- `forced`: a card's `delay` or `interrupt`-like effect holds it in an activity
  (§9.3). Returns to `free` when that activity finishes.

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
| `{ goTo: [who, node], route?, via?, tag? }` | plans a path (§3; `route`: `shortest`, `via`, `edgesTagged`), sets activity `goTo` with `activityLeft = 1` at the target, `control: 'storylet'`. For a list role, every cat |
| `{ startActivity: [who, a] }` | starts activity `a` as a free choice would, but `control: 'storylet'` |
| `{ stop: who }` | clears `route`; if on an edge, the cat finishes that edge first; activity `none`, `activityLeft = 0`, `control: 'free'` |
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
| `delay { ticks: [lo, hi], action }` | the target cat performs activity `action` where it stands for a sampled number of ticks, `control: 'forced'` |
| `move { to }` | `goTo` for the target cat |
| `triggerStorylet { storylet }` | activates it (`ifTarget: cat` = only if that cat is among the affected) |
| `setFlag { flag, at?, ticks?, onlyObjects? }` | sets the flag (scoped to the target place or object's node when `at: "$target"`) for `ticks` |
| `collapse { radiusM, ticks }` | Gaze. Not a state change: it schedules observation samples (§15.3) |

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

The **pattern signature** of a history is the highest stage reached in each pool.

A detector **involves** the cats named in its clauses (`at`, `near`, `except`). With
no cat named, it involves everyone (used for perception in §15).

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
fizzle in another.

## 12. One history, end to end

### 12.1 The chapter

`runHistory` starts from the initial state and steps until tick `world.ticks`, or
until `tuning.end.afterAnchorTicks` ticks after `anchor.reachedAt`, or the tick
`anchor.deadAt` is set when early cut is on (§16).

### 12.2 The anchor

`anchor.json`: `requirements` (a tree of `all`/`any` of facts with weights),
`fraysIf` (a condition) and the anchor fact (its id). A history **reaches** the
anchor when the anchor fact is set; it is **dead** from the tick `fraysIf` first holds
without the anchor fact, or at the last tick of the chapter if it never reached it.

### 12.3 Requirement progress

`progressOf(state)` = Σ weights of requirement items satisfied in that state (an `any`
group counts once, when any member holds).

### 12.4 Single-history mode

For tests, the CLI and calibration, `runHistory(content, seed, stream, pins)` gives
every cat and the world that one stream, and resolves every branch point by sampling: `sample(options, rand(seed,
"s<stream>:branch", t, key, 1_000_000))`. It returns the per-tick states and events.
The wave (§13) never uses this; it splits instead.

## 13. The wave

A **history** is `{ id, streams, weight, state }`. `streams` maps every cat, and
`world`, to an integer stream: the key of its sampled noise (§1). The wave at tick `t`
is the list of histories alive at `t`, in canonical order (§14). Weights are integers
summing to `WAVE_TOTAL` after every renormalisation. `streamsKey` is the canonical
JSON of `streams`.

**Start.** `tuning.waves.initialHistories` = `N` histories; history `i` has every
stream set to `i`, id `i` as 8 hex digits, and weight `WAVE_TOTAL / N` (the remainder to
history 0).

**Each tick**, for every history:

1. run `step` with an empty branch list; while it returns a branch point, expand
   every option with probability > 0 (depth first, in option order), extending the
   branch list. Each finished leaf is a **child** with weight
   `trunc(parent.weight × Π ppm / 1_000_000^k)`, computed one factor at a time with
   truncation, the rounding remainder given to the first leaf;
2. children keep the parent's `streams`; a child's `id` is
   `hash32(parent.id + "|" + t + "|" + branchLabels.join(","))` as 8 hex digits.

Then, over all children of all histories:

3. **merge**: children with the same `hashState(state)` and the same `streamsKey`
   become one; weights add; it keeps the smallest `id`;
4. **imposed facts**: apply watched facts and Gaze samples for this tick (§15);
5. **rejuvenate**: if step 4 dropped histories and fewer than
   `tuning.waves.rejuvenateBelow` remain, copy each survivor into
   `ceil(initialHistories / count)` copies. Copy 0 is the original; copy `j > 0` gets,
   for every cat that is not followed and for `world`, the stream
   `hash32(oldStream + "|" + t + "|" + j) % 2^31`, and the id
   `hash32(parent.id + "|" + t + "|copy" + j)`. Weights are split equally (remainder to
   copy 0). This only changes rolls after `t`, whose distribution is the same for any
   stream, so it is a valid move: it restores variety among unwatched cats after
   watching Marti has narrowed the wave to his own behaviour;
6. **trim**: if more than `tuning.waves.cap` remain, resample (§14);
7. renormalise to `WAVE_TOTAL` (scale every weight with `trunc`, remainder to the
   first history in canonical order).

**Lineage.** For every history at `t + 1` record its parents at `t` with the share of
each parent's weight it received. A child of a split has one parent; a merged history
has several; a resampled history has the one it was copied from. This DAG drives
conditioning (§16) and fast pruning (§15.2).

Sampled noise uses the **streams**, never the id. So a split does not change a cat's
later rolls, and an edit that does not touch a cat's inputs leaves its behaviour
unchanged in every history. Followed protagonists never get new streams. This is what
makes "repeat by default" hold.

## 14. Trimming

When the wave exceeds `cap` after merging:

1. **Group** histories by pattern signature plus the state of every storylet
   (inactive or its state name) plus the weather.
2. Order groups by total weight, descending (ties by the group key).
3. Every group of weight ≥ `tuning.waves.floorPpm` × `WAVE_TOTAL` / 1 000 000 (the
   importance floor, about 2%) gets one slot. Then smaller groups get one slot each in
   order while slots remain. Groups left without a slot are dropped.
4. The remaining slots go to the kept groups in proportion to their weight (largest
   remainder, ties by group order).
5. Within a group of `n` histories with `k < n` slots, **systematic resampling**:
   sort by `(stateHash, streamsKey)`; positions `u_j = offset + j × W / k` with
   `offset = rand(seed, "wave", t, "resample:" + groupKey, W / k)`; each position
   keeps the history whose cumulative weight range contains it; kept copies get weight
   `W / k` (remainder to the first). A history picked twice is kept once with double
   weight.

Canonical order of a wave: by `(stateHash, streamsKey, id)`.

## 15. Observation and Gaze

### 15.1 What a protagonist perceives

For a followed protagonist `P` in history `h` at tick `t`, the **perceived view**
`view(h, P, t)` is the canonical JSON of:

- `P`'s own position, activity, interrupt action, and the storylet states it holds a
  role in;
- every other cat `P` perceives by sight (§4): its id, position and activity;
- every event of tick `t` that `P` perceives, with the fields that sense reveals
  (sight: everything; hearing only: the event name and, for `voice`, the hook);
- the weather.

Gauges, flags and counters are never part of a view: initial stats narrow only
through behaviour. `digest(view)` is `hash32` of that JSON.

### 15.2 Watching (playback)

During playback the player layer calls `observe(t, P)` (`04` §6) once per tick that
passes. The worker:

1. groups the histories at `t` by `digest`; each group's weight is its conditioned
   weight (§16) or, when the timeline is frayed, its raw weight;
2. samples a group: `sample(groupPpm, rand(seed, "obs", t, "watch:" + P + ":" +
   logHash, 1_000_000))`, groups in ascending digest order. `logHash` = `hash32` of
   the canonical JSON of the pins with `tick <= t`;
3. drops every history at `t` not in that group, and through the lineage DAG every
   weight at `t' > t` that flowed only from dropped histories (weights flowing from
   several parents shrink by the dropped parents' shares);
4. rejuvenates the survivors as in §13 step 5, then recomputes reach (§16) and the
   frames, so earlier ticks narrow too (backward conditioning). The copies' futures
   are simulated from `t` on: this is the one case where observation re-simulates;
   it costs at most one recompute from `t` with the current histories;
5. returns a **watched fact** `{ tick, cat: P, digest, summary }`. `summary` lists
   what the view shows that the UI and payouts need: storylet states entered
   (`"storyletId.state"`), detectors completed, the facts those set at `t`
   (`factsSet`), other events by name, cats seen, `nodesSeen` (nodes `P` perceives
   by sight, each node a sight source at its position), and for each storylet state
   or detector its `paidBy`: the union over the group's
   histories of the `touchedBy` pins of the cats bound to its roles (or involved in
   the detector). It also carries `totalPressure`: the weighted mean, over the group,
   of the summed pressure of all cats.

Sampling can never empty the wave. Same seed, pins and tick give the same pick.

### 15.3 Gaze

A power pin with the `collapse` primitive (Gaze) samples during the computation
itself, at each of its ticks `pin.tick .. pin.tick + ticks − 1`, with a view made of
everything within `radiusM` metres of the place, ignoring walls and weather: cats
(id, position, activity) and events. Sampling purpose `"gaze:" + pin.id + ":" + t`
(no log hash, so unrelated edits keep the pick when the odds allow it). The facts it
fixes are recorded in the timeline as `gazeFacts` and count as paid (`04` §7). They
earn no payouts.

### 15.4 Imposed facts (testing)

Watched facts are passed into every recompute. At a watched fact's tick, histories
whose digest differs are dropped (step 4 of §13). If that would drop every history,
the fact is **impossible**: it is skipped and reported as `reopened` in the result.
If what survives has less than `tuning.observation.reopenBelowPpm` of the weight
before testing, the fact is also reopened and nothing is dropped. The default is 0
(reopen only when impossible). When a watched fact reopens is an open question
(glossary, Open conflicts 2): keep the knob, do not change its default.

## 16. Anchor conditioning, fray and frames

**Reach.** Walking the lineage DAG backward from the last tick:
`reach(h) = 1 000 000` for a history that reached the anchor, 0 for a dead one, and
for every other history the share-weighted mean of its children's `reach` (in ppm,
`trunc`).

**Conditioning.** With `tuning.waves.anchorConditioning` on (the anchor treated as
already seen) and at least one history reaching the anchor, a history's
**conditioned weight** is `mulPpm(weight, reach)`. Everything the player sees and
every probability shown is computed from conditioned weights. With the knob off, or
when no history reaches the anchor, raw weights are used.

**Early cut.** With conditioning on, a history stops being simulated the tick it dies
(its reach is 0 anyway). Its frames up to that tick are kept.

**Fray.** If no history reaches the anchor, the timeline is **frayed** at the last
tick at which any history was still alive. The timeline ends there.

**Strain** (for the debug panel only): the raw weight share of histories that reach
the anchor. Whether it feeds the frontier is an open question; do not use it anywhere
else.

**Frames.** For each tick the worker aggregates what the renderer and the player
layer need (`02` §4): per cat, the distinct `(position, activity, interrupt)` with
their summed conditioned weights in ppm; per event kind and storylet state, the
probability it happens at that tick; the probability it is raining; the probability
each requirement item holds; and `samples`: up to `tuning.render.focusSamples`
histories with the highest conditioned weight (ties by canonical order), each with its
cats' position and activity and its weight, for the renderer's focus layer (`06` §2).
Frames are recomputed from stored per-history views
whenever weights change (an observation, a recompute); they never hold history state.

## 17. Recompute

The wave keeps a **checkpoint** (the full list of histories) every
`tuning.waves.checkpointEvery` ticks. After an edit at tick `e` (a pin added, moved
or withdrawn), the worker resumes from the last checkpoint at or before `e`, replays
with the new pins and every watched fact, and recomputes to the end. Ticks before the
checkpoint are untouched. After a watched fact is added, only §15.2 runs: pruning,
and a re-simulation from that tick only when it rejuvenates.

A recompute returns `{ frames, end, reopened, breaks, gazeFacts, stats }` where `end`
is `{ kind: 'anchor' | 'fray' | 'chapterEnd', tick }` and `stats` holds history
counts per tick, recompute time and strain (debug only).

## 18. What must always hold (tests)

- Same content, seed, pins and watched facts → identical recompute results, on every
  run and in every browser engine the e2e suite covers.
- Every number in every state is an integer; every gauge value is within its range;
  weights sum to `WAVE_TOTAL` after every tick.
- Adding a pin at tick `t` leaves every frame before `t` unchanged when no watched
  fact after `t` reopens.
- A pin that is invalid in every history leaves the wave identical to the wave
  without it, except for its `fizzle` events.
- Splitting is exact: for a single storylet transition, the children's weights equal
  the softmax or hazard probabilities times the parent's weight, up to truncation.
- Observation never empties the wave; the same inputs pick the same group.
- **Calibration** (`07` §3): over many seeds, a probability shown at one tick matches
  how often the event then happens, bucket by bucket.
- With an empty log, for seeds 1 to 50, Marti is in region `flat` at every tick in
  every history.
