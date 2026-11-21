# All Cats Fear Water — Glossary

Nov 20, 2026 · @Tagir

One meaning per term, used the same way in the design doc, the build pack, code and conversation. A term not listed here is not yet a defined concept; add it before relying on it.

## Open conflicts

Terms still used in more than one way. Until Tagir settles a row, agents ask instead of picking a meaning. The other 26 conflicts were settled on 2026-11-20 in the [decisions brief](https://claude.ai/artifact/FgKuqkfQGcjLqCs2nC3sjJ) and are folded into the entries below.

| # | Term | What conflicts | Status |
| --- | --- | --- | --- |
| 1 | The mountain village | Anchor list: "the village on top of the mountain". Lore: Vysoty is a tree village, Dolgoty a valley ringed by mountains. | Tagir: another village, not yet named. |
| 2 | When a watched fact reopens | Glossary: when an edit makes it impossible. Decisions note: only when the player knowingly breaks the chain. Design doc: "impossible or very unlikely", with a threshold knob. | Undecided. |
| 3 | Watched fact | Glossary: a fact (a named event) collapsed by observation. Build pack spec 03 §15.2: everything the followed protagonist perceives at one tick, a watched moment that may hold no story fact at all. | Undecided. |

## World and roles

| Term | Definition | Notes |
| --- | --- | --- |
| Filter | A world-wide will-programming that makes cats predictable: fear of water, no thoughts of magic, no conflict, the world kept as it is. Deterministic, so it is indifferent to time. | Lore and mechanics at once: Filter strength sets how random a cat's choices are (see Filter dial). |
| Glowing cats | The dying will of Catlantis's rulers, which runs the Filter. Not persons but a program. | The player controls them only in the final chapter, where the reveal happens. |
| Player | The Filter's programming: steers cats with cards and powers, and scrolls along time. Not a character in the world. | Does not consciously know its goal until the finale. |
| Protagonist | A named cat the player can follow: Marti, then Rokko, then Litta. | A cat becomes a protagonist for collapse purposes only once the player first follows it (see Protagonist collapse). |
| Filtered cat | A cat under strong Filter: narrow distributions, near-certain choices. | Most townsfolk. |
| Awakened cat | A cat the Filter barely holds, or one in a place where the Filter is jammed or absent: wide distributions, open choices. | Resists programming: the player's nudges move it less. Full game: its free choices use true randomness and go into the choice log. |
| Filter dial | The per-cat (and per-place) strength of the Filter. Sets the temperature T in every choice and storylet transition. | Low T = predictable, nudges matter more. High T = free, nudges matter less. |

## Names and places

One English and one Russian form per name, taken from the character and encyclopedia docs. Spellings marked open wait on the writer (see Open conflicts).

| English | Russian | Don't write | Notes |
| --- | --- | --- | --- |
| Marti | Марти | Marty | Protagonist 1. Grey with white stripes, glasses, knitted scarf. |
| Rokko | Рокко | Rocco | Protagonist 2. Ginger. Dream magic. |
| Litta | Литта | Lita | Protagonist 3. Earth magic. |
| Lunna | Лунна | Luna; Аферистка and Неизвестная as names | Marti's sister. A named character, not a protagonist. |
| Agata | Агата | Agatha | Named character. Her echolocation survey found what turns out to be Catlantis. |
| Melman | Мелман |  | Marti's late grandfather. Source of Melman's whistle. |
| Maxi | Макси |  | Actress in Livanu. Not Maxxy. |
| glowing cats | Светящиеся коты (СК), Хранители порога | Shining Cats, SC | Lowercase in English prose. |
| the Filter | Фильтр |  | Capitalized in both languages. |
| Catlantis | Котлантида | Katlantis | Flying island-state, sunk 4,000 years ago. |
| Catlants | котланты | Katlants | Its people and rulers. |
| the Catoclysm | Котоклизм |  | The battle with the dragon that sank Catlantis and made the Filter. |
| the dragon | дракон (водный дракон) |  | Freedom, will and nature. Imprisoned under Catlantis. |
| the Resistance | Сопротивление |  | Founded by Marti's parents. Jams the Filter with music. |
| battery | батарейка |  | A gifted cat that powers the glowing cats. Reinforced-Filter endings make Marti or Rokko one. |
| worm of doubt | червячок сомнения |  | Left in the Filter by repentant Catlants. |
| herbalists | травницы |  | Earth-magic practitioners of Dolgoty. |
| Son-Marta-Klekot | Сон-Марты-Клекот |  | Marti and Rokko's home town, chapter 1, named after its founder Marta Klekot's dream. Not Son-Marty-Klekot. |
| Livanu | Ливану |  | Port city: Theatre of New Forms, university, Professor Sebastian's lab. |
| Vysoty, Shiroty, Dolgoty | деревни Высоты, Широты, Долготы |  | Island villages, transliterated. In Dolgoty mountains weaken the Filter. |
| the Reckless | «Отважный» |  | The party's research vessel. Acquiring it is an anchor. |
| Alvin | «Алвин» |  | Professor Sebastian's bathyscaphe. |
| tea keeper |  | tea-shop keeper | Chapter 1. Keeps the tea shop on Marti's usual way. |
| road crew |  | road workers, the crew | Chapter 1. The cats fixing the road. The place is the roadworks. |

## Time and structure

| Term | Definition | Notes |
| --- | --- | --- |
| Timeline | The one time axis of the whole game; each chapter is a stretch of it. All threads, pins and facts sit on it. | Not "a run": there are no separate runs, only edits to one timeline. |
| Tick | One step of simulation time. | Demo: 1 tick = 1 game minute, 900 ticks per chapter (knob). |
| Playhead | The tick the player is currently viewing, always at or behind the lantern edge. |  |
| Playback (play mode) | Moving the playhead forward at normal speed or paused. Only during playback can protagonists collapse what they perceive. |  |
| Scrubbing | Scrolling fast by dragging the playhead. Shows a blur and observes nothing. |  |
| Scroll | Any move of the playhead along time, forward or back: playback or scrubbing. | Replaces rewind and time travel. |
| Chapter | A stretch of story ending at an anchor, computed on its own. | Demo = Chapter 1. |
| Anchor | The canon event that ends a chapter (Chapter 1: Marti meets Rokko under the boat). Shown first as a teaser. | Treated as already seen by default (knob), so unwatched waves lean toward it. The final chapter has no anchor. |
| Teaser | The anchor shown before the chapter is played, like a "three months earlier" opening. | The whole game is a flashback. Not the same as a locked thread. |
| Locked thread | A protagonist's thread shown but not yet playable, like Rokko's at the end of the demo. |  |
| Frontier | How far the story has been played. **Story limit:** the highest story progress ever watched, in any timeline (the chapter plus progress on its anchor's requirement tree). **Time past it:** the most ticks ever played after the story limit was reached; it resets to 0 when the story limit rises. Plus the set of storylets ever watched. | Changed only by playback; re-runs and scrubbing never change it. Measured from the last beat, not the clock: a beat an edit delays is reachable at once, however long it now takes. |
| Frontier limit | Where a re-run stops: just before the first of a never-watched main storylet becoming perceivable to the followed protagonist, progress passing the story limit, or more ticks past the story limit than were ever played there. Never past the fray or the chapter's end. After an edit it becomes the lantern edge. | Side storylets never stop a re-run; they are shown and pay only in playback. A timeline that never reaches the story limit runs on to the fray or the end. Replaces "scrub limit". |
| Lantern edge | The end of the followed protagonist's played thread in the current timeline, and the end of the scrubber, always on its right. Live playback extends it; after an edit it moves to the frontier limit. | Nothing is drawn or placed past it. Pins an edit leaves past it: ordinary cards return to the hand; unique cards and powers move to the edge, with a warning before the edit lands. The bar rescales to keep the edge on the right; it grows freely for the first 36 ticks. |
| Re-run | After an edit, the lantern simulated again from the edit tick to the frontier limit, streamed into the scrubber like a video buffering. | How the player sees an edit's consequences without replaying. Records and pays nothing; playback over its ticks does. Repeat by default holds inside it. |
| Main storylet, side storylet | A storylet in the anchor's requirement tree; any other authored storylet. | Only new main story stops a re-run. |
| Requirement tree | The facts that must happen for the anchor to happen, in their dependencies. | Expressible as a pattern (see Story sifting). |
| Thread | One protagonist's line through the timeline. | Rokko and Litta add threads to the same timeline, not new runs. |
| Following | Choosing which thread the camera and collapse focus on. |  |
| Repeat by default | Scrolling back and playing again re-fires every pin, and watched facts hold, so the same day replays unless the player changes something. |  |
| Seed | The number that fixes all randomness of a world. Carried in the URL. |  |
| Seed vetting | At the start, the seed's world is checked once with no player input for enough reachable story (authored storylets, the anchor). A failing seed is replaced deterministically by the next candidate. | Never adjusted again during play. A bookmarked seed always gives the same vetted world. |
| Bookmark | A moment saved as a URL: seed + log + playhead + player state (specials used, journal, revealed map, frontier, payouts already paid). |  |
| Log | Everything the player has put on the timeline (pins, powers). The saved state; everything else is recomputed from seed + log. |  |

## Waves

| Term | Definition | Notes |
| --- | --- | --- |
| Wave | Anything not yet watched that could still turn out several ways, held as a probability. | The player sees waves as ghosts. |
| Probability | The chance of something, from the fog's forward pass; 1 or 0 for watched facts. | Calibrated by construction: collapses draw from it. |
| Recompute | After an edit or a lantern write, the forward pass reruns from that tick on. | Runs in a Web Worker. |
| Observation (watching) | A followed protagonist perceiving an event during playback. The camera never observes. | Scrubbing never observes. |
| Collapse | An event becoming a fixed fact. |  |
| Sampling | How observation works: the outcome is drawn from the current odds (keyed by seed, log and event); only the visible facts are recorded; the backward pass then updates linked unwatched events. | Same inputs, same outcome; in the full game, awakened cats' free choices replay from the choice log. |
| Testing | Checking that a fact imposed rather than drawn now is still possible: the anchor, or a fact watched before an edit. It fails when its probability reaches zero. | The only place the system can fail (fray, break). |
| Watched fact | A fact collapsed by observation. Stays fixed unless an edit makes it impossible. |  |
| Imposed fact | A fact the odds must keep possible without drawing it now: the anchor, earlier watched facts. |  |
| Observation gradient | Three levels: protagonist perception (collapse); causal neighbourhood (narrows by conditioning); everything else (pure wave). | Dreams never collapse. |
| Protagonist collapse | What a followed protagonist perceives collapses, whether or not the camera is on them. Their future choices stay open. Starts when the player first follows them, and covers only stretches played on their thread. |  |
| Backward conditioning | Updating unwatched events before and after a fact so they agree with it: Bayes back through cat chains and links (the backward pass). | Observation order is not time order. |
| Calibration | Shown probabilities match observed frequencies. Holds by construction since 2026-11-21; tests now measure collapses with no consistent past, card direction, and the fog against the reference simulation (single full histories). |  |
| Determinism | Same seed + log gives the same result in every browser: counter-based RNG keyed by seed, cat, tick, purpose; fixed-point maths; a precomputed σ table, never `Math.exp`. |  |
| Perception | What a protagonist can sense at a tick: sight and hearing, reduced by rain, walls and distance. Can differ per character (Rokko follows several voices at once). Each event records what was perceivable. | Decided 2026-11-20. The only thing that collapses waves. |
| Lantern | The area around a protagonist where the world is simulated tick by tick and perceived events collapse; the fog lies beyond. Crisp inside, ghosts outside, shrinking in the rain. Two lanterns when protagonists split up. | Signature look. |
| Fog | Everything outside the lanterns, held as probabilities and computed, never simulated. | Decided 2026-11-21. The player sees it as ghosts. |
| Cat chain | One unwatched cat's probability over activity states, tick by tick. A state is an activity plus his changing stats in bands. | Code: chain. |
| Activity | What a cat is doing, tied to a place (fishing at the pier). Walking between places is an activity too. | Defined once in a shared activity catalogue; no routine per cat. |
| Decision function | The one function that turns drives into odds of choosing each activity. The fog calls it on banded stats, the lantern on exact stats. | Never reimplemented for the fog. |
| Link | A shared yes/no cause read by several cats or storylets: the weather, the cart, a meeting with a lasting effect. Everything that reads it is computed per case. | Not "node": node is the code name for a place. |
| Expected company | The expected number of cats at a place at a tick, from the chains. Drives meetings and pressure in the fog. | Exact once perceived. |
| Contributor heap | For each flag, its top 3–5 sources of probability (pair, place, window, amount). Links are built from it when a consequence is perceived. | Size is a knob. |
| Readers index | Built at load: for each flag, which storylets, formulas, detectors and decisions read it. | Decides which meetings become links in advance. |
| Base flag | A flag set directly as a declared effect of a rule (gossip sets knowsTale). | Belongs to a cat, an object or place, or the world. |
| Derived flag | A flag set by an event detector that matches a combination of events. | Matched for real in the lantern, estimated from its ingredients in the fog. |
| Forward pass, backward pass | Forward: carrying probability through chains, links and formulas to get the odds. Backward: Bayes from a perceived fact back to its causes, then forward again. | Together: forward–backward. |
| Placement | Turning a perceived cat from probability into a live cat on an authored spot of his place, then a dwell of a few ticks before his lantern AI decides. | Dwell is a knob. |
| Local cause | An explanation invented when no consistent past is found, touching nothing else ("he just felt like fishing"). | Fallback; how often it fires is measured. |
| Hysteresis | A cat keeps doing what it is doing until a trigger fires and another activity beats the current one by the margin (activities.stickiness). No in-between flicker. | Decided 2026-11-22. Activities have no timers. |
| Decision key | Everything a cat's decision reads: activity, place, the bands of the gauges it reads, the values of the conditions it reads, its offers. A change of key is a trigger; decisions are cached by key. | Shared by fog and lantern. |
| Boredom | A gauge that rises while a cat stays at its activity and lowers that activity's score; reset on a switch. It is what ends an activity. | An activity's ticks [lo, hi] set how fast it rises. |

## Characters and storylets

| Term | Definition | Notes |
| --- | --- | --- |
| Drive | A hidden value that pushes a cat's next move. The umbrella for traits, deep drives and hooks (see Psychology of cats). All cats share the generic ones; named characters add unique hooks. | Values hidden; drive keys are highlighted in dialogue. Never called a tendency. |
| Hook | A concrete drive a cat can voice (tea craving, question itch, fear of water), shared or character-specific. A discovered hook is listed in the journal. |  |
| Initial stats | A cat's gauge values at the start. Part of the wave: the seed sets their spread, and watching the cat narrows them. Hidden. | Decided 2026-11-20. Gives a short phase of learning who Marti is this time. |
| Utility score | An integer score a cat gives each option it could take. |  |
| Noise | Seeded randomness added to scores, sized by the Filter dial. The noise is what the waves are made of. |  |
| Stickiness | A bonus for keeping the current activity or goal, so cats don't flicker between choices. |  |
| Storylet | An authored small state machine (3–7 states) with gates, scored transitions and consequences. Storylets trigger each other through their effects. | Tagir's babies: highlighted in assist mode until first seen. |
| Role | A slot in a storylet filled at runtime ("the keeper", "whoever is near the boat"). |  |
| Gate | A hard condition for whether a storylet or transition is possible at all: place, time window, a required fact. | Only for possibility, never for likelihood. |
| Score term | One integer contribution to a transition's likelihood, from a drive, relation, fact or pin. |  |
| Choice transition | A cat decides: softmax over its scores for each exit, including "do nothing". | Same mechanic as free behaviour. |
| Hazard transition | The world rolls a per-tick rate (the keeper opens the shop, the crew arrives). | The only place pacing may act. |
| σ(score / T) | How a score becomes a probability. T comes from the Filter dial. | +2 on a 50/50: 73% at T = 2, 88% at T = 1. |
| Consequence | What an outcome writes. Immediate: sim state. Seeded: facts and drives that later scores read. Player-facing: charge, card draws. | Consequences are evidence: watching an effect runs the backward pass to its likely causes. |
| Pacing | Changing the world's odds (hazard rates, which eligible storylet fires), never a cat's stats, and only on unwatched events. In practice done once, through seed vetting. | "The story must be told": the nature of fiction, not the glowing cats. |

## Psychology of cats

From the design doc's Agents and Cast sections. Most of it is out of the demo; the Notes column says so.

| Term | Definition | Notes |
| --- | --- | --- |
| Gauge | Any integer value on a cat: a trait, a deep drive or a hook. | Build pack: 0..1000. Cards shift gauges. |
| Trait | One of a cat's Big Five values: openness, conscientiousness, extraversion, agreeableness, neuroticism. Slow, near-static; weights how its drives respond. | Shared by all cats. Never the moral path. |
| Temperament | A cat's five traits together. |  |
| Deep drive | One of SDT's three needs: autonomy, competence, relatedness. Signed: positive is satisfied, negative frustrated. | Not in the demo. |
| Shared hooks | The hooks every cat has: fear of water, box pull, sunbeam tax. | The Filter holds fear of water narrowest of all. |
| Unique hooks | Two or three hooks per named character (Marti: tea craving, pocket weight, question itch). | Each passes three tests: events move it, it changes choices, the cat can voice it. |
| Drive key | The word a cat uses when it voices a drive, highlighted in dialogue. | How often and how sharply it comes up hints at intensity. |
| Moral path | How a named cat builds a moral self: Marti salvages, Rokko curates, Litta protests and returns, Agata complies then surpasses, Lunna audits and rebuilds. Carries Schwartz values. | A canon invariant: drives behaviour, never broken. |
| Long-term goal | One to three per protagonist, computed from deep drives only. | Not in the demo. Stored per cat. |
| Goal band | The margin another goal must win by before a cat switches (two thresholds). Width varies per cat. | Also "goal hysteresis". Stickiness is its demo form. |
| Willpower | How much a single intervention can change a cat's behaviour. Protagonists' is very high: cards barely move them, but a well-timed card at a tipping point can. | A separate value per cat: the Filter dial sets randomness, willpower sets resistance. |
| Named character | A cat with a name, unique hooks and a moral path: the protagonists plus Lunna, Agata and others. | Lure works on named and unfiltered cats. |
| Townscat | An unnamed cat. Variety comes from its own traits and drive weights; no unique hooks. | Most are filtered. |
| Background population | Cats held only as aggregate waves per group or place, not simulated one by one. | Full game. |
| Party | Marti, Rokko, Litta and whoever travels with them. |  |
| Awakening | A cat slipping the Filter's hold: its choices widen, and cards bound to it die. | Bad for the player's grip. |
| Undermining | A hook pushed repeatedly loses its own pull, so the cat comes to need the push. | SDT cognitive evaluation. Not in the demo. |
| Internalization | Where a motivation sits: external, introjected, identified, integrated. Integrated ones slip out of the player's control. | Not in the demo. |
| Causality orientation | A cat's lean: autonomous, controlled or impersonal. Filtered cats lean controlled. | Not in the demo. |
| Impersonal | Apathetic and drifting after over-control. A route to the distracted-or-lost ending. | Proposed. |
| Relationship | Closeness and autonomy support between two named characters. Controlling relationships damage both. | Not in the demo. |
| Noticing a hook | A cat recognising its own hook, which then pulls a little less. Marti does it alone; others need a breakthrough. | Proposed. Not in the demo. |

## Story sifting

Terms borrowed from research on curated emergent narrative (Ryan; Kreminski's Felt and Winnow), adapted to the fog and lantern.

| Term | Definition | Notes |
| --- | --- | --- |
| Event | Something the sim emits at a tick: who, what, to whom, where. | Raw material. |
| Fact | An event or derived event that other rules can read: storylet gates, patterns, the anchor's requirement tree. | Can be watched (fixed) or still a wave. |
| Story sifting | Recognising story-worthy sequences in a stream of events. |  |
| Event detector | A rule that names a pattern in sim state over a time window (Marti got soaked, a near miss) and emits it as a fact. | Implemented as a pattern. |
| Pattern | An ordered list of event clauses with variables (`?guest`, `?host`) that must stay consistent, plus unless clauses. Compiled to a small state machine. | Winnow-style semantics, our own TypeScript engine. |
| Kernel | A pattern's ordered event clauses. |  |
| Unless clause | An event that, occurring between two given kernel events, kills the match. |  |
| Partial match | A pattern matched up to some stage, with its bindings. A story in progress. |  |
| Stage | How many kernel clauses a partial match has matched. | Anchor pattern stage = frontier progress. |
| Fork | When an event fits a match's next clause, a child match takes it while the parent stays, so other readings stay alive. | Once all non-event variables are bound, advance in place instead. |
| Pool | The set of live partial matches. In the lantern it is part of the logged state and its hash; in the fog each stage carries a probability. | Pruned of stale matches, matches with a missing cat, and per-pattern overflow. |
| Pattern signature | The stage reached in each tracked pattern: a fact in the lantern, a probability per stage in the fog. | No longer used for trimming (retired 2026-11-21). |
| Match probability | The chance that a match is at a given stage, estimated in the fog from its ingredients. | Drives highlights. |
| Highlight (assist) | A marker on a place or cat for a partial match tied to the anchor, a paid event or an unseen authored storylet. Opacity = match probability. | Settings toggle. |

## Player layer

| Term | Definition | Notes |
| --- | --- | --- |
| Card | An otherworldly nudge the player plays on a cat, an object or a place. Scrolling time never changes the hand. |  |
| Deck | The player's chosen card set. The seed fixes the draw order, so scrolling can't fish for better cards. |  |
| Hand | Cards available to play now. |  |
| Draw source | Where new cards come from: anchors when first reached, frontier progress, world events, secrets, inspected objects. | Each pays out once. |
| Pin | A played card or placed power as it sits on the timeline at a tick and target. A played card is its pin. | Pins are the log. |
| Character card | A card whose pin follows its cat, wherever the cat is at that tick. |  |
| Place card | A card whose pin stays on its spot at its tick. |  |
| Fizzle | A pin whose target isn't there does nothing, shows why, and fires again whenever the target returns. |  |
| Withdraw | Taking a pin off the timeline. An ordinary card returns to the hand at no cost. |  |
| Move | Dragging a pin to another tick. Same as withdraw plus play. |  |
| Ordinary card | Free to pin, withdraw and move. |  |
| Unique card | Never returns to the hand once played; its pin stays and fires whenever its target is there. | Mostly protagonist or anchor cards. One-off cards are unique. |
| Special | A once-per-playthrough effect from playing a card on the object it came from (Marti blows Melman's whistle). Recorded outside time; not restored by scrolling. |  |
| Inspect | Looking closer at an object: tells its story and, the first time, gives a card. | Not a log entry. |
| Journal | The record of discovered hooks and inspected objects. |  |
| Power | A stronger act paid with charge. Chapter 1 powers: the lure, and Gaze (proposed, in the demo for testing). |  |
| Lure | Projecting a glowing cat into the world: it pulls named and unfiltered cats to follow. | Works better on a primed Marti. |
| Gaze | A power that collapses what a small circle around a chosen spot holds, for a few ticks. Samples from the current odds; never picks the outcome. Costs charge; its events earn no payouts and count as paid. | Proposed 2026-11-20; in the demo for testing. Not the retired viewport collapse: a paid, deliberate act. |
| Prime | A condition that makes the lure work better (high question itch, no fresh tea, light pockets). | About two of three needed. |
| Charge | What powers cost. Paid when a power is placed; never refunded; moving or re-placing pays again. The only cost of experimenting. | A floor when the rain starts guarantees one lure. Knob to test: withdrawing a continuous card claws back the charge it earned. |
| Payout | Charge earned the first time a kind of event is watched (storylet state, detector type), scaled by pressure. Collapsed storylets and anchor progress pay charge; exploring (map, regions, characters, hooks, secrets) pays cards. | Keyed by kind, not by history, so breaking chains can't farm it. |
| Pressure | The external pressure the player's cards put on one cat (per hook in the full game). Total pressure, the sum over cats present, scales payouts. Never used for pacing. |  |
| Revealed map | Places the player has seen, in any timeline. Cards can be played only there. | Knowledge, not observation. |
| Paid event | A watched event with a card or power on it. | Guarded by break alerts. |
| Assist mode | Settings toggle for highlights: the anchor, paid events, unseen authored storylets. |  |

## Cards, powers and deck beyond the demo

| Term | Definition | Notes |
| --- | --- | --- |
| Collection | Every card the player has ever found. Outside time. |  |
| Deck cap | The most cards the deck may hold. Grows at anchors (for example 8 in chapter 1, 2 more per anchor), with a hand of 3–4. | Proposed. No cap in the demo. |
| Packing | Choosing the deck from the collection. In chapter 1, at the door, mirrored by Marti emptying his pockets. | Proposed. |
| Swap | Trading a newly found card for one in the deck, only at the moment of finding. | Proposed. Hubs are not swap places. |
| Rebuild | Re-choosing the whole deck from the collection at an anchor or a trading place. |  |
| Trading place | A place to change the collection: the witch's hut (exchange) and the forge (mint new cards). | Full game. |
| Card kind | Instant (its nudge decays), continuous (holds while it runs) or one-off. | Under pins, one-off = unique; instant and continuous only say how long an effect lasts. |
| Bound card | A card tied to one cat, and maybe one hook: Irresistible Junk, Empty Teapot (Marti). |  |
| Universal card | A card with no bound cat. Never dies. |  |
| Dead card | A bound card whose cat is awakened at the tick it would be played. Computed, never stored. | Not in the demo. |
| Evolution | A condition-based change of some cards into others. | Not in the demo. |
| Draw pile, discard pile, draw event | The older card cycle: played cards go to the discard pile and come back through draw events. | Kept only as the `discard` playtest rule; pins replace it. |
| Effect primitive | One of the building blocks the engine runs: interrupt, gauge shift, attract, repel, social spread, delay, move, trigger storylet, set flag. | A card that needs more gets a new primitive, not custom code. |
| Effect layers | What a card's effect combines: an action (interruption), gauge shifts, a social ripple, pressure. | Proposed. |
| Interruption | A momentary action that pauses a cat's own decisions (groom, sneeze, look at the glint). Adds more pressure; high willpower can shrug it off. |  |
| Saturation | How a card's gauge effect scales: linear, logistic or off. | To test. |
| Card definition, card instance | The static content of a card; the player's copy of it, outside time. | Code terms. A played instance is a pin. |
| Filter pulse | Power: everyone in an area becomes more predictable for a while, and no one dreams there that night. | Proposed. Not in the demo. |
| Listen | Power: reveals one of a cat's hooks for the journal. | Proposed. Not in the demo. |
| Charge floor | The top-up when the rain starts that guarantees one lure. | Demo tutorial crutch, on. Variant to test: the rain starting pays charge as a payout event. |

## Failure and feedback

| Term | Definition | Notes |
| --- | --- | --- |
| Fray | The first tick from which the anchor's probability is zero. The playhead stops there. | Anchor-level failure. Chapter 1: Rokko leaves when the rain stops. |
| Break | A watched, paid event that no longer happens after an edit. | Event-level. Costs only the frontier progress it gave. |
| Break alert | Warning, shown before an edit lands, that it would break a paid event. Information only, no penalty. |  |
| Changed, unwatched | A quiet mark on a thread for a watched but unpaid event that shifted after an edit. | No alert. |
| Ripple | The visible spread of an edit's consequences from the edited tick forward. | Also the recompute's progress made visible. |
| Ghost | The drawing of a wave: faint possible versions of a cat, path or event. |  |
| Edit feedback | What every change shows: story dots pulsing on the timeline, the ripple, the protagonist's previous path, the end of the bar changing. | Core of the game; never reduced to a toast. |

## Map, sea and dreams

| Term | Definition | Notes |
| --- | --- | --- |
| Place | A spot on the map a card or pin can sit on. | `node` in code; say place in prose. |
| Object | A thing in a place that can be inspected and played on (Melman's whistle, the box). | Its own card's special fires on it. |
| Region | A seamless area from room to city scale, reached by long journeys. Opened regions are islands on the world map. | Full game. The ship is a moving region. |
| Zoom tier | One of four views: room, street, district or city, world map. Presentation only: zoom never changes what collapses. | Full game. |
| World map | The illustrated top view: opened regions, regions in fog, travel routes. | Full game. |
| Fog | Unrevealed map. Cards can't be played there. | Opposite of revealed map. |
| Viewport | What is on screen. Free to pan anywhere; pure presentation that shows the wave and never collapses anything. |  |
| Cluster | Overlapping cats drawn as one marker; the focused cat or the card's target draws on top. |  |
| Salience | The ranking that decides which cats the map shows at rest, within a display budget. |  |
| Magnifying ring | The ring that spreads clusters and enlarges cats a held card can affect. |  |
| Presence strip | Timeline marks showing when actable cats were at the spot under a held card. | Build pack UI term. |
| Story dot | A mark on the timeline for an observed story event. | Pulses in edit feedback. |
| District mood | Signs over rooftops showing a group's state (storm clouds, Zzz, brawl dust). | Experiment. |
| Voyage | A sea journey: the ship is a social pressure cooker and the Filter is at its strongest. | Full game. |
| Dream plane | Where dreams happen. The Filter can't reach it, and neither can cards. Dreams never collapse. | Full game. |
| Dream avatar | The figure a dreamer projects into the waking world. The Filter, and so the player, can see it. | Rokko spies on Maxi this way. |
| Dream effect | A dream changing the world or the deck without a card: reshuffle, block, transform, or add a dream card. | Proposed. Not undone by scrolling. |
| No-Filter area, jammed area | A place where the Filter is weakened or blocked (Dolgoty's valley, shielded by mountains) or jammed (Resistance music). Cats there act as awakened. | Lore: музыкальная интерференция. |

## Story arc, endings and meta

| Term | Definition | Notes |
| --- | --- | --- |
| Story engine | The system that arranges small authored pieces into an emergent order. It never writes prose. |  |
| Canon policy | Canon holds only at focal points: invariants (moral paths), anchors, and the goal. Everything between is emergent. |  |
| Goal (canon) | Marti, Rokko and Litta encountering the glowing cats. Not an anchor. | Different from a cat's long-term goal. Whether an untouched timeline that reaches it is canon: decided after playtests. |
| Strike | The moment an anchor happens, from the lightning image: the path varies, the strike is inevitable. | "The strike lands" = the anchor is watched. |
| Tutorial | Everything before the first anchor (Marti meets Rokko). | Chapter 1, the demo. |
| Planned anchors | Marti meets Rokko; they meet Litta; acquiring the Reckless; the Catlantis expedition; arriving at the mountain village; discovering the glowing cats' hidden fortress; entering the dream. | The mountain village is still to be named (Open conflicts 1). |
| Final chapter | The dream of Catlantis in its last moments. No anchor and no Filter yet; the player controls only the glowing cats; a timer (the city sinking) bounds it, and it can be repeated. |  |
| Commitment point | The moment the city meets the sea. Crossing it, behind a warning, fixes the ending. |  |
| Ending | Derived from state, not authored as a list. Ranges from destroying the Filter to reinforcing it with Marti, Rokko or both as its battery; getting distracted or lost is one too. |  |
| Post-game | What follows the ending: a pure witness to a whimsical world if the Filter fell; unlimited cards if it was reinforced. |  |
| Reveal | The finale showing the player what their role was. Foreshadowed, never moralized. |  |
| Meta moment | A cat sensing the force acting on it. Read as a joke first, literally after the reveal. About 5–6 per playthrough. | Never mentions games, saves or players. |
| Déjà vu | A cat reaching a moment close to one watched in an abandoned timeline and feeling it. | Not in the demo. |
| Residue | The faint nudge déjà vu leaves behind. Saved with the player's state. | Proposed. |
| Abandoned timeline | A version of events the player watched and then edited away. |  |
| Playthrough | One whole game from start to ending. A second playthrough is the conscious one. | Replaces "run" for specials. |
| Choice log | A record of awakened cats' free choices, kept like player actions. | Full game. Awakened cats' choices use true randomness (decided 2026-11-20). |
| Untouched timeline | A seed's timeline with nothing in the log: the cats left to themselves. | Replaces "unassisted run". |

## Build and production

| Term | Definition | Notes |
| --- | --- | --- |
| Demo | Chapter 1 in the browser: Marti alone, up to meeting Rokko under the boat in the rain. |  |
| Graybox | The first, placeholder-art build of the demo, for playtests. | Milestones M0–M8. |
| Dressing | The pass that adds final art, sound and text to the graybox. | Milestones M9–M10. |
| Gate A, Gate B | Go/no-go checks: is the loop fun in placeholder shapes; do strangers finish the dressed demo. |  |
| Build pack | The instructions for coding models: CLAUDE.md, specs 01–07, milestone briefs, prompts, tuning file. | Out of date since 2026-11-19. |
| Knob | A tunable number in `content/tuning.json`, shown in the debug panel. | Balance changes never need code. |
| Recorded solution | A saved log that must reach the anchor; replayed in tests with expected state hashes. | Replaces "solution run". |
| State hash | A fingerprint of simulation state. Used to check replays. | A changed hash needs a written reason. |
| Handoff note | `docs/handoff/M<n>.md`: what a milestone built, how it was checked, deviations, open questions. |  |
| Writer marker | A placeholder on an unwritten line. Release fails while any remain. |  |
| Extension point | A seam left clean for a full-game feature that the demo doesn't build. | Build nothing behind it. |
| Engine checkpoint | The decision after the demo: stay in TypeScript, Godot or Unreal. | Late May 2027. |

## Retired terms

Words that came up and were dropped. Don't use them; use the replacement.

| Retired term | Use instead | Why |
| --- | --- | --- |
| Run, second run, replay | Edit, thread, repeat by default | There is one timeline; following another protagonist adds a thread. |
| Time travel, rewind | Scrolling along time | The Filter is indifferent to time; nothing travels. |
| Dormant pin | Fizzle | A pin with no target simply does nothing until the target returns. |
| Staking, gambling a card | (none) | Cards are free; charge is the only cost of experimenting. |
| Refund of charge | (none) | Charge is never refunded. |
| Fray (for a single event) | Break | Fray is reserved for the anchor. |
| 64 histories | (none) | Histories retired 2026-11-21. |
| Once per run | Once per playthrough | "Run" is retired; the build pack's own text already says "once per game". |
| Shining Cats, SC | glowing cats | One English name for Светящиеся коты. |
| Marty | Marti | One spelling for the cat. |
| Unravel, unravelling | Fray | Same thing under two names in the design doc and build pack. |
| Story tick | Payout event | Tick is the simulation step. |
| Node (in prose) | Place | `node` stays as the code name. |
| Play record (in prose) | Pin | `play record` stays as the code name. |
| Tendency | Drive (for cats), probability or wave (for the world) | It meant both. |
| Director, dramatic pressure | Pacing (seed vetting) and the anchor as an imposed fact | No ongoing director. Pressure is the cards' pressure on cats. |
| Scrub limit | Frontier limit | Scrubbing is only one way to scroll. |
| Unassisted run | Untouched timeline | "Run" is retired. |
| Locked teaser | Locked thread | Teaser is the anchor glimpse at a chapter's start. |
| Ghost (for the previous path) | Previous path | Ghost is reserved for waves. |
| Trait (for the moral path), character traits | Moral path | Trait means a Big Five value. |
| Magic point | (none) | Dropped for now; cards go on cats, objects and places. |
| Katlants, Maxxy, Son-Marty-Klekot | Catlants, Maxi, Son-Marta-Klekot | Settled 2026-11-20. |
| Viewport collapse | Perception | Panning would collapse the whole map for free. |
| Not looking is a tactic | Keeping protagonists away is a tactic | Looking costs nothing; moving a protagonist costs cards and story. |
| History, candidate history | Fog (computed) and lantern (simulated) | Retired 2026-11-21: 128 simulated days cost about 70 s per edit. |
| Weight, split, merge, importance floor, cap, early cut | (none) | They described histories. |
| Particles | Forward–backward | Retired 2026-11-21 with histories. |
