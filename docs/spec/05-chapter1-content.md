# 05 — Chapter 1 content

Chapter 1's content is data in `src/content/data/ch1/`. It is the **Chapter 1 test
slice** (`acfw-ch1-slice`, 2026-11-21), copied into this pack unchanged except for the
additions in §2. The engine in `03` was specified against it.

**What this content is.** Placeholder, not canon, and not balanced. It is
deliberately busier than the real chapter will be (12 cats, chaos storylets), so it
pushes the wave model, perception and storylets hard. It is what the graybox runs
until Tagir replaces it. You implement the engine against it; you do not edit it.
If the content seems wrong or unbalanced, measure it (§5), report it in
`docs/questions.md`, and carry on.

## 1. Files

| File | Contents |
| --- | --- |
| `world.json` | Day from 05:40, 900 one-minute ticks; rain start and stop as hazards in windows; perception multipliers; Marti's three primes; the `roadwork` counter (target 800) |
| `map.json` | 28 nodes in 3 regions (flat, town, beach), 31 edges in minutes; positions in metres. `roadworks_pass` closes when `roadBlocked` |
| `cast.json` | 12 cats. `core: true` marks the minimal set (Marti, Rokko, Prasha, Gavrila, Bublik); the other 7 are chaos |
| `hooks.json` | 3 shared hooks, Marti's 3, Rokko's 3; rise and decay rules; voice lines |
| `activities.json` | 23 free behaviours; `stickiness` (the hysteresis margin), `decisionEveryTicks` (how often decision triggers are checked); an activity's `ticks: [lo, hi]` sets how fast it tires, not a duration (`03` §8.2) |
| `objects.json` | 15 objects: the 5 card objects in the flat, a kettle and shelf, town props, the chain, the boat, a bottle |
| `cards.json` | The 6-card demo deck (`demo: true`) plus 3 test cards (`demo: false`) |
| `powers.json` | Lure (100 charge) and Gaze (40 charge, 6 m, 5 ticks) |
| `storylets.json` | 16 storylets: 8 required, 2 special-effect ones, 6 chaos |
| `detectors.json` | 7 patterns: soaked, near miss, waited under the awning, streets empty, and others |
| `anchor.json` | Requirement tree with weights summing to 100; frays when Rokko leaves before the meeting |
| `economy.json` | Charge payouts per storylet state and per detector; the charge floor at rain start; cards from exploring |
| `text/en.json`, `text/ru.json` | Every content text key in both languages |

`src/content/data/tuning.json` holds the engine's knobs (§4). Interface text lives in
`src/content/data/ui/en.json` and `ui/ru.json` (`06` §11).

The schemas in `src/content/schemas/` are written from these files and from `03`.
Every key in the files has a meaning in `03`, except those listed in §3.

## 2. Additions to the slice

These were added when the slice was copied into the pack. They are part of the
content now.

| File | Addition | Why |
| --- | --- | --- |
| `world.json` → `perception` | `"openWindowSightPerMille": 0` | `03` §4 needs a sight multiplier for open windows; 0 keeps the town unseen from the flat |

## 3. Keys the engine reads differently or not at all

| Key | Treatment |
| --- | --- |
| `*.note`, `status` | Comments. Ignored; the schema allows them |
| `cards[].demo` | `false` cards are not in the demo deck: never `grantsCard`, never in the hand, except through the debug panel's "unlock test cards" |
| `cast[].core` | Read only when `tuning.content.castMode` is `"core"`: then non-core cats are removed at load, and storylets whose required roles cannot bind never activate. Default `"full"` |
| `cast[].look` | Graybox colours and accessories for the cut-out placeholder (`06` §2) |
| `cast[].lockedThread` | Rokko's thread is shown locked after the anchor (`04` §5) |
| `hooks[].effects` (pocketWeight) | A design note, not data. Ignored. Do not implement it; it is listed in `docs/questions.md` as Q-content-1 |
| `powers[].leadTo` | Out of the demo. The schema accepts it; the engine ignores it. Extension point: a power pin may later carry `leadTo: NodeId` |
| `anchor.afterAnchor` | `lockedThread` and `endKey` are read by the UI (`06` §9) |
| `economy.cardsFromExploring.inspectObject` | A note; inspecting uses `objects[].grantsCard` (`04` §8) |
| `world.engineFacts` | Facts the engine sets itself (`03` §7) |
| `world.tags` | The tag vocabulary; validation rejects tags not listed |

## 4. Tuning (`tuning.json`)

Every number the engine needs that is not content. Starting values are guesses that
have **not** been checked against a model of this content; M4 measures them.

| Key | Start | Meaning |
| --- | --- | --- |
| `content.castMode` | `"full"` | `"full"` or `"core"` (§3) |
| `waves.checkpointEvery` | 30 | ticks between checkpoints of the lantern (`03` §17) |
| `waves.anchorConditioning` | true | the anchor treated as already seen, in projections (`03` §14; open, `docs/questions.md` M2-2) |
| `fog.stepTicks` | 5 | ticks per fog step (`03` §13.2) |
| `fog.minStatePpm` | 1000 | chain states below this are dropped (adopted 2026-11-22 after calibration; was 100) |
| `fog.bands` | 3 | bands per changing gauge, the top one saturated (adopted 2026-11-22; was 4) |
| `fog.saturatedBandFrom` | 950 | the saturated top band starts here (`03` §13.2) |
| `fog.maxBandedGauges` | 3 | banded gauges per cat; the rest are mean-field |
| `fog.gateThresholdPpm` | 500000 | a gate holds in the fog at this probability (`03` §13.3) |
| `fog.maxLinks` | 2 | links besides the weather (`03` §13.5) |
| `fog.linkFloorPpm` | 50000 | a lasting meeting effect becomes a link above this, about 5% |
| `fog.contributors` | 4 | contributor heap size per fact, flag and `heard` |
| `fog.frayBelowPpm` | 1000 | the lantern, and a projection, fray below this chance of reaching the anchor (`03` §16) |
| `fog.exactTolerancePpm` | 20000 | tiny-world exactness test (`03` §18) |
| `fog.ppmQuantum` | 50000 | fog probabilities in decision keys are rounded down to this (`03` §8.2) |
| `behaviour.boredomWeight` | 4 | score taken from the current activity at full boredom (`03` §8.2) |
| `lantern.releaseAfterTicks` | 30 | ticks unperceived before a live cat returns to the fog (`03` §13.4) |
| `lantern.dwellTicks` | 5 | ticks a placed cat keeps its activity before deciding (`03` §15.1) |
| `observation.reopenBelowPpm` | 0 | when a watched fact reopens (open question; keep 0) |
| `sifting.maxMatchesPerPattern` | 8 | pool size per detector |
| `pressure.decayPerTick` | 2 | |
| `pressure.cap` | 2000 | |
| `voice.cooldownTicks` | 60 | |
| `voice.radiusM` | 10 | how far a voiced line carries |
| `charge.floorOn` | true | the charge floor at rain start |
| `charge.multCapPm` | 3000 | cap on the pressure multiplier |
| `frontier.countAtPpm` | 500000 | a requirement counts toward progress at 50% |
| `vetting.solutions` | `["road_tea", "road_box", "road_both"]` | the recorded solutions vetting runs (`04` §2): pin sets of §5.1. Tagir may add variants (e.g. the lure at other ticks) |
| `vetting.requireFacts` | `["crewArrived", "rainStarted", "rokkoUnderBoat"]` | must have this chance in the solving run (`04` §2) |
| `vetting.minPpm` | 300000 | |
| `vetting.minStoryletShare` | set by Tagir | share of authored storylets the solutions' runs must enter (`04` §2) |
| `vetting.fog` | coarser fog knobs | `fog.minStatePpm` and `fog.bands` for live vetting of a typed or bookmarked seed |
| `vetting.maxCandidates` | 20 | |
| `player.playedCardRule` | `"pinned"` | `pinned`, `spent` or `discard` (`04` §3) |
| `player.shuttleTps` | `[4, 16, 64, 256]` | shuttle speeds in ticks per real second, either direction (`06` §3) |
| `player.observeMaxTps` | 16 | forward at up to this speed is playback and observes; faster behind the edge is a scrub |
| `timeline.minSpanTicks` | 36 | the bar spans at least this many ticks; past it, it rescales to keep the lantern edge on the right (`06` §3) |
| `end.afterAnchorTicks` | 15 | ticks shown after the meeting |
| `render.focusLayerHz` | 3 | `06` §2; at most 3 |
| `render.focusSamples` | 8 | coherent trajectories offered to the focus layer (`03` §16) |
| `render.displayBudget` | 24 | most cat markers drawn at rest (`06` §2) |
| `budgets.recomputeMs` | 100 | from an edit to the re-run's first streamed frames (`07` §4) |
| `budgets.rerunTps` | 120 | ticks per second a re-run streams at, at least (`07` §4) |
| `flags.telemetry` | true | |
| `flags.assist` | false | assist-mode highlights default |
| `flags.jumpToEdge` | false | a "jump to the edge" button and End key, for playtests only (`06` §3) |

Every key is editable in the debug panel. A number used by the engine that is not in
content or here is a bug.

## 5. Pin sets, golden playbacks and balance

The design intent for Chapter 1 is below. Because the content is not balanced, M4
**measures** each property and reports the numbers; it does not tune content to make
them pass. Properties that hold become tests. For those that do not, Tagir decides
(change content, change the property, or accept), and the decision goes into this
file.

Clock to tick: `tick = minutes since 05:40`. 06:00 = 20, 08:00 = 140, 11:00 = 320,
13:00 = 440, 13:05 = 445, 17:00 = 680, 17:30 = 710.

### 5.1 Pin sets

Pins are written `card@target@tick` or `power@place@tick`.

| Name | Pins |
| --- | --- |
| `untouched` | none |
| `lure_unprimed` | `lure@flat.door@445` |
| `lure_one_prime` | `irresistible_junk@odds_jar@430` (special); `lure@flat.door@445` |
| `lure_primed` | `empty_teapot@kettle@300`; `irresistible_junk@odds_jar@430` (special); `lure@flat.door@445` |
| `road_tea` | `lure_primed` plus `tea_break@town.roadworks@180` |
| `road_box` | `lure_primed` plus `box@town.roadworks@200` |
| `road_both` | `lure_primed` plus `tea_break@town.roadworks@180`, `box@town.roadworks@200` |
| `late_lure` | `road_both` with the lure moved to `@710` |
| `cards_on_marti` | `tea_break@marti@100`; `something_shiny@marti@200` |

### 5.2 Properties

Measured over seeds 1 to 50, with the vetted seed, one whole-day run per seed (`03`
§13.1: Marti live from tick 0, every other cat in the fog; Tagir, 2026-11-23). An event's
probability is its chance by the end of the run, raw (conditioning off) unless stated,
averaged over the seeds; for Marti's own events that is the share of seeds whose run has
them. "Frays" is the lantern's fray (`03` §16).

| Id | Property | Kind |
| --- | --- | --- |
| B1 | `untouched`: Marti is in region `flat` at every tick of the whole-day run | structural, a test from M2 |
| B2 | `lure_unprimed`: P(`martiOut` by 14:30) ≤ 15% | balance |
| B3 | `lure_one_prime`: P(`martiOut` by 14:30) ≤ 35% | balance |
| B4 | `lure_primed`: P(`martiOut` by 14:30) ≥ 60% | balance |
| B5 | Over the non-empty subsets of {`tea_break@town.roadworks@180`, `box@town.roadworks@200`, `sudden_flea@gavrila@220`, `something_shiny@town.roadworks@240`}, added to `lure_primed`: no single pin gives P(`roadBlocked` at rain start) ≥ 50%; at least 3 subsets do | balance |
| B6 | `road_tea`, `road_box`, `road_both`: the timeline does not fray on at least 45 of 50 seeds | balance |
| B7 | `late_lure` frays on at least 45 of 50 seeds (the window closes) | balance |
| B8 | `cards_on_marti`: the direct `teaCraving` shift from `tea_break` is exactly +45 (300 × 15%); the `questionItch` shift from `something_shiny` is exactly +18 | structural, a test from M2 |
| B9 | Calibration (`07` §3) | structural, a test from M2 |

### 5.3 Golden playbacks

For each pin set and seeds 1, 2, 3: a **headless playback** from tick 0 to the end,
observing every tick with Marti followed (`03` §15.2), recorded as
`tests/golden/<name>.s<seed>.expected.json` (`07` §2). These are alarms for
unintended behaviour changes, not proof of balance.

## 6. Text

Every content text key exists in `text/en.json` and `text/ru.json`. The slice's lines
are placeholders written for the slice, not the writer's text; M9 replaces them
(`docs/art-brief.md` §5). Never write story text, jokes or lore yourself. A key the
engine needs that has no text gets `[[TODO writer: what this line should do]]` in
both languages.

Names follow the glossary: Marti (Марти), Rokko (Рокко), Son-Marta-Klekot
(Сон-Марты-Клекот), Melman (Мелман), glowing cats (светящиеся коты), the Filter
(Фильтр).
