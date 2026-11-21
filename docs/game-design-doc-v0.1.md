# All Cats Fear Water — Game Design Doc v0.1

Oct 9, 2026 · @Tagir

## Vision

A story engine set in the world of the series, not an adaptation of the books. Marti, Rokko, Litta and the rest of the party live their own lives; the player is the will of the glowing cats, shaping the Filter and the flow of magic around them.

- The player can do nothing and simply watch the characters act, or intervene and see what changes.
- Time is a dimension to scroll along, not a playback: look ahead to see consequences, go back to change causes.
- Every playthrough should differ, and none should feel like a pure optimization task.

### Design pillar: the player against their role

The player is the Filter, the will of the glowing cats to control the cats. Every system rewards control: better cards, sharper foresight, outcomes you can steer. So the ending that is "good" for the player's role, a reinforced Filter and a deterministic world, is the worst for the cats, and the free world the cats need means the player gives up everything.

- **No character to hide behind.** The role has no persona, so the will is simply the player's own.
- **The player doesn't know their role.** As the programming, they have no conscious knowledge of the goal. Their main motivation is the reward for tightening control; the second is the anchor teasers.
- **Foreshadow, then reveal in the finale.** Hints are placed throughout. The reveal comes in the final confrontation, when the player takes the role of the glowing cats themselves and so acquires consciousness. The final choice is the only one made with full knowledge.
- **The temptation must be real.** Control stays genuinely fun and genuinely rewarded.
- **Never moralize.** No narrator says control is bad; the tension comes from the mechanics alone.
- **Fair play.** The mechanics are honest throughout. The reveal recontextualizes what the player did rather than contradicting it, and attentive players can piece it together early.
- **A second playthrough is a conscious one.** Knowing the truth, the player can resist control from the start.

### Meta moments

Characters sometimes sense the force acting on them. Players will first read these as postmodern fourth-wall jokes; after the reveal they turn out to be literal. The ironic reading comes first, the sincere one after.

- **No real fourth-wall breaks.** Characters never mention games, saves, screens or players. They sense a presence, a pressure, a pull. Every moment must work when read literally.
- **Sparing.** About 5–6 episodes per full playthrough, rare early and denser as awakening spreads. Many moments qualify; the engine picks only the strongest candidates and spaces them out. They come from the state, not a script (only after edits, only in characters loose enough to feel them), so players who manipulate heavily see more of them. Per-character cooldowns, never two in one scene, never where they would undercut the emotion, and a pool of varied lines so none repeats. They never explain themselves.
- **The wall closes at both ends.** In the free world no one senses the player any more; in the reinforced world no one can.

#### Déjà vu

- **Trigger.** After the player changes the past, a character who reaches a moment closely resembling one observed in an abandoned timeline may feel it.
- **Who.** Anyone, unnamed cats included, but the Filter suppresses it: awakened and low-Filter characters feel it most, heavily filtered ones rarely.
- **Strength grows with fiddling.** The more often the player has replayed and changed that moment, the stronger the déjà vu.
- **How it shows.** A line ("Haven't we already had this conversation?", "Funny, I was sure it would rain today"), a hesitation, finishing someone's sentence, or choosing differently: "Last time I… no, wait."
- **Residue (proposed).** Déjà vu leaves a faint nudge, such as slight wariness toward what went badly in the abandoned timeline. The past remembers a little. Because this depends on the player's history of timelines, it is saved with the player's state.
- **Why it is literal.** The whole game is a replayed memory, and the cats are feeling the replay.

#### Characters noticing their hooks

- **Depends on traits.** Marti, used to analysing and reflecting, notices the pattern directly once a hook has been nudged repeatedly: "Why do I keep going on about tea?" Other cats need an event or a breakthrough, such as a dream, a confrontation, or a friend pointing it out.
- **It can spread (proposed).** Marti telling Rokko that he always argues when everyone agrees counts as a breakthrough for Rokko.
- **Noticing loosens the hook (proposed).** A noticed hook pulls a little less, so cards on it lose some force: self-awareness as a small gain in autonomy.

### Writing guidelines

The aim is even a fraction of Adventure Time's sincerity. Every storylet is checked against these.

- **Play the absurd straight.** No cat treats its world as silly; the banana raft is simply the best raft available. The whimsy is for the player, never for the characters.
- **Melancholy under the whimsy.** The cartoonish world sits on Catlantis drowning and four thousand years of the Filter. Whimsy never explains the catastrophe away.
- **Gags that turn out to be wounds.** Running jokes may later be recontextualized, as the meta moments are by the reveal.
- **Leave sadness unfixed.** Characters can stay hurt, and epilogues don't soften tragic endings.
- **Make room for quiet.** Small scenes with no stakes, like bad tea on a ship deck at night, carry as much as set pieces.

## Canon policy

Canon is acknowledged only at focal points; everything between them is emergent.

| Level | What it is | Rule |
| --- | --- | --- |
| Invariants | Character traits: how each cat builds a moral self (Marti salvages, Rokko curates, Litta protests and returns, Agata complies then surpasses, Lunna audits and rebuilds) | Never broken; they drive behaviour rather than script it |
| Anchors | Marti meeting Rokko (the first anchor; everything before it is the tutorial), them meeting Litta, Acquiring of the Reckless, the Catlantis expedition, arriving to the village on top of the mountain, discovering of the glowing cats hidden fortress, entering the dream&#32; | Pre-observed: the story is conditioned to reach them; who, why, when and in what state is emergent |
| Goal | Marti, Rokko and Litta encountering the glowing cats | Not an anchor. The final chapter is an open sea of endings the player settles into, from destroying the Filter to reinforcing it; getting distracted or lost is one of them |

An unassisted run that reaches the glowing cats may itself be canon.

## Time model

This is not time travel. The Filter is deterministic will-programming, so the world is time-agnostic and the player scrolls along the time dimension instead of restarting.

- **Lightning image.** A story develops like lightning from two points that meet in the middle: the path is variable, the strike is inevitable. A chapter ends at its anchor, where the lightning hits the ground.
- **What the player does.** Watch, or change something and scroll to the end of the chapter or the game; then scroll back anywhere, change something else, and compare.
- **Presentation.** Continuous time is preferred. Discrete moments are a fallback only if continuous presentation proves too expensive.
- **Endings.** An open final chapter, with endings ranging from destroying the Filter to embracing and reinforcing it, including getting distracted or lost. The player chooses, dressed as the characters' choice.

### Frontier

The player can scroll only through what has been reached naturally.

- **What the frontier records (decided 2026-11-22).** How far the story has been played, changed only by playback. The *story limit* is the highest progress ever watched, in any timeline: the chapter number plus how much of the current anchor's requirement tree is satisfied. The *time past it* is the most ticks ever played after the story limit was reached; it resets to 0 when the story limit rises. The frontier also keeps the set of storylets ever watched. Time is measured from the last beat, not from the clock.
- **The scrubber is the lantern track.** It runs from the chapter start to the lantern edge, the end of Marti's played thread, so the protagonist is never shown undetermined. Nothing lies past the edge: no fog ahead, no pins or Gaze. Playback starts only behind it, and playing on extends it like recording tape.
- **Re-run after an edit.** The lantern is simulated again from the edit tick and streams into the scrubber like a video buffering. It stops just before the first of: a never-watched *main storylet* (one in the anchor's requirement tree) becoming perceivable to Marti, so new story is always played from its start; progress passing the story limit; or more ticks past the story limit than were ever played there. It never passes the fray or the chapter's end. A re-run records and pays nothing; playback over its ticks does.
- **What that means in play.** A beat an edit delays is reachable at once, however long it now takes: out at 200 and played to 250, then delayed to 500, the bar reaches 550. Finishing a beat, rewinding five ticks and editing gives only those five ticks past it. A strategy at tick 600 stays reachable on every re-run unless new main story starts first. *Side storylets* never stop a re-run; they are shown, and pay only when played. A timeline that never reaches the story limit (Marti stays home) runs on to the fray.
- **What an edit cuts.** A watched moment belongs to its tick, so watched moments past a new edge reopen, and paid ones raise the break alert. Pins past the new edge have no tick left to sit on: ordinary cards return to the hand; unique cards move to the edge, with a warning in the same alert; powers are open (withdrawn with the charge lost, or moved like unique cards).
- **The bar rescales.** The edge always sits on the right of the bar, with a short decorative band before the anchor's mark. The bar grows freely for the first 36 ticks, then rescales to fill the width, animated so pins and story dots can be followed.
- **Anchors are gates:** progress cannot pass an anchor until it has been watched during playback.
- **The anchor sits off the time axis (proposed).** It has no tick, so it stays the teaser, not a point on the scrubber. The band before it can carry a readout of the strike's chance; a fray shows as a break in the band.

A blurred forecast beyond the edge was considered and dropped (2026-11-21): fog ahead of the edge gives the player nothing to do.

### Anchors and chapters

- **The whole game is a flashback.** The glowing cats are replaying a past that has already happened; the player is inside that memory.
- **Anchors are pre-observed facts.** Each chapter anchor is treated as an observation already made, without a fixed time. The backward pass from it weights unwatched events by their chance of leading to it, so unobserved waves lean toward it.
- **Teasers.** Each chapter opens with a glimpse of its anchor, then cuts to earlier. What the teaser shows is fixed; what it hides stays open, so teaser detail is a design lever. The seed could vary which details are shown per run (proposed).
- **Timing is open.** An anchor has no date, only pacing pressure: the longer it hasn't happened, the more the director pushes.
- **Unravelling.** If an intervention or a free choice leaves no compatible history, the timeline unravels from the point of no return: the frontier can't pass it, and the ripple shows which change caused it.
- **No chapter screens.** A chapter is a stretch of one continuous timeline ending at its strike. Once the strike is watched, the next chapter's requirement tree, director pressure and conditioned anchor take over, and first-time rewards fire. Scrolling back across an anchor stays free, and edits ripple through it.
- **The final chapter is not an anchor.** It takes place in a hermetic space, the dream of Catlantis in its last moments, so time and space are tightly bounded. Instead of an anchor there is a timer: the city sinking into the sea. The player can repeat it as many times as they like until content with the resolution, and endings range from destroying the Filter to reinforcing it. Controls change: the player sees the story as the glowing cats actually present at that place and time, and controls only the glowing cats themselves. There is no Filter yet, so no one else can be steered, but the glowing cats are powerful mages and magic is at its peak, which makes it the place for overpowered magic cards. The characters are suddenly much stronger too, unbound by the Filter and with determination off the scale. The natural end is unavoidable: the city meets the sea, the characters wake up, and the game is over. What they achieved in that last dream transforms the whole world, shown in a short animated narration; events collapse as the narration plays, which hides the computation. The final chapter stays scrollable. Crossing the moment the city meets the sea is the commitment, behind an explicit warning: past this point events can no longer be changed, so scroll back now to change anything else. After the epilogue, the player can keep scrolling around the map and through time after the big change, including timeline progression past the finale. The narration collapses only what it shows; everything else stays a wave until the player looks. If the Filter was destroyed, the player's controls are taken away and they remain a pure witness to the most cartoonish, whimsical world: cats crossing the sea on a raft of bananas, fighting boars with tennis rackets. If the Filter was reinforced, the player gets unlimited cards and full freedom to change any aspect of any cat on the map. The player settles on one, dressed as the characters' choice. The central contradiction: a force that denies the characters choice has to make them choose.
- **Endings read the log (proposed).** The log records which choices were the player's interventions and which were the characters' own free choices, so an ending can reflect its means: a Filter-destroying ending reached through heavy manipulation lands differently from one the awakened characters chose freely.

### Endings

Endings are derived mechanically, not authored as a list. Reinforcing the Filter means Marti, Rokko or both take on the role of a new glowing cat, becoming its new battery. They can agree on it, or fight over it. A reinforced Filter controls minds so tightly that there is nothing left for dreams to sprout from: dreams disappear completely, and with them Rokko's dream magic.

| Who becomes a glowing cat | How | World after | Post-game |
| --- | --- | --- | --- |
| No one | — | Filter destroyed, free world | Pure witness to a whimsical world |
| Marti or Rokko | They agree | Filter reinforced; the other walks a controlled world | Player keeps controls |
| Marti | They fight | Filter reinforced; Rokko leaves alone, betrayed, his magic denied. The most tragic ending | Player keeps controls |
| Rokko | They fight | The mirror case (proposed) | Player keeps controls |
| Both | They agree | Filter at full strength; no protagonist left walking (proposed) | Unlimited cards, full freedom over every cat |

- **Means matter (proposed).** Whether the new glowing cat chose it or was pushed there by the player's cards is in the log, and the ending reflects it.
- **The battery shapes the Filter (proposed).** In reinforced endings, the post-game cards could carry the character of whoever became the battery.

* **Standing at the final choice.** Every named character's standing is derived from their hooks and drives. Narratively, Litta is enabling the dream in the real world, so she is absent at the moment of the final choice.

## Agents and the Filter

Characters are independent agents whose behavior comes from their traits; the Filter decides how predictable they are.

- **The Filter is a dial, not a switch.** It sets how wide each character's distribution of possible choices is (see World model).
- **Filtered characters** have narrow distributions: in the same situation they almost always choose the same thing. When observed, their choice is resolved from the seed and the context, so the same inputs always give the same result.
- **Awakened characters**, and anyone inside a no-Filter or jammed-Filter area, have wide distributions. When observed, their choice is resolved with real randomness, not the seed.
- **Choice log.** Once observed, a free choice is recorded like a player action, so the world stays reproducible from the seed plus the log. An awakened cat behaves like another player in a multiplayer replay.
- **Re-deciding.** A recorded choice stands while it remains possible. If an upstream edit makes it impossible or very unlikely, it reopens and the character decides again.

The resulting tension: control is easy over filtered characters, but the goal needs awakened ones.

### Drives and goals

Three layers, from fast to slow:

| Layer | What it is | Examples |
| --- | --- | --- |
| State | Quantities in the world that feed drives | Time since Marti's last tea |
| Drives | Needs and motivations, each a distribution; they shape the next move | Temperament (all cats): the Big Five. Deep drives (all cats): autonomy, competence, relatedness. Hooks: see Cast |
| Long-term goals | 1–3 per protagonist, derived from the balance of deep drives | Curiosity well above authoritarianism with low fear: travel and explore. Vice versa: study or teach at a university |

- **Deep drives and surface hooks.** Deep drives are few, abstract and slow-moving (trust, need for contradiction). Surface hooks are concrete, voiceable wants that feed them: tea craving feeds Marti's psychic stability; sleep quality feeds Rokko's dream magic. The player mostly acts through hooks.
- **A good drive passes three tests:** events can move it, it changes choices, and the character can voice it.
- **Coupling over count.** A few strongly linked drives make more story than many independent ones, and keep the wave model affordable.
- **Budget.** Every cat: the Big Five as temperament (slow, near-static), SDT's three deep drives (autonomy, competence, relatedness), and the shared hooks (fear of water, box pull, sunbeam tax). Named characters add values along their moral path and 2–3 unique hooks. Unnamed NPCs get variety from their own Big Five values and drive weights, with no unique hooks. Background population: aggregate waves per group or place. The fast, uncertain variables are mainly the hooks, which keeps the wave model affordable.
- **Growth.** Drives rise and fall day to day; their weights, and the goals derived from them, shift as characters live through things.
- **Goals have hysteresis.** Goals are computed from deep drives only, never daily ones. A character keeps its current goal until another wins by a clear margin (two thresholds, like a Schmitt trigger), so near-ties never make it stagger. A shrinking lead shows as waning enthusiasm and doubts in dialogue, a sign that a small nudge could tip it. Major life events can force a re-evaluation. Because of this, each character's current goal is stored. Band width per character (proposed): wider for Rokko, who curates what he inherited; narrower for Litta, who protests and escapes; wider for filtered characters, narrower for awakened ones.
- **Hidden values, highlighted keys.** Values are not shown by default; numbers or wave visuals may be tried as an experiment. When a character voices a drive in dialogue (Marti complaining there's no tea), the key is highlighted for the attentive player. How often and how sharply they bring it up hints at intensity.
- **Drive journal (proposed).** Discovered keys are kept outside time, like the revealed map.

#### SDT mechanics

Light versions of SDT's mini-theories, each kept only because it changes what a cat visibly does or says. Adopted as a direction; all of it needs extensive tuning.

| Mini-theory | In the engine | Cost |
| --- | --- | --- |
| Rewards and feedback (Cognitive Evaluation Theory) | Cards are external, controlling interventions. A hook pushed repeatedly loses some of its own pull, so the character comes to need the push. A card costs more than itself: it weakens that character's own motivation in the long run | One external-pressure value per hook |
| Internalization (Organismic Integration Theory) | A motivation sits on a scale: external, introjected, identified, integrated. External ones need constant pushing; integrated ones become the character's own and slip out of the player's control. Maps onto the moral paths | One level per hook or goal (4 steps) |
| Causality orientations | Each character leans autonomous, controlled or impersonal. Filtered cats lean controlled, awakened ones autonomous. Characters crushed by over-control turn impersonal: apathetic and drifting, a route into the distracted-or-lost ending | Three slow weights per character |
| Need satisfaction vs frustration | Deep drives are signed: positive is satisfied, negative frustrated. Frustration past a threshold unlocks compensating behaviour such as defiance, rigidity, or Lunna's competence as armour | The sign of each deep drive |
| Intrinsic vs extrinsic goals | Extrinsic goals (status, wealth, appearance) satisfy needs less, so characters chasing them stay hungry and easier to steer. The Filter favours them | A tag per long-term goal |
| Relationships | Relationships between named characters have closeness and autonomy support; controlling relationships damage both sides | Two values per relationship, named characters only |

## Cast (draft)

- **Temperament, all cats:** the Big Five (openness, conscientiousness, extraversion, agreeableness, neuroticism). It weights how each cat's drives respond.
- **Deep drives, all cats:** Self-Determination Theory's three needs: autonomy, competence, relatedness.
- **Named characters** add values (Schwartz) along their moral path, plus cartoonish surface hooks.
- **Every hook passes three tests:** events move it, it changes choices, and the character can voice it.

### Hooks every cat has

| Hook | Rises when | Changes choices | Voiced as | Feeds |
| --- | --- | --- | --- | --- |
| Fear of water | Near water, rain, sea travel | Avoids routes, refuses tasks, clings to dry company | Hissing at puddles; "Absolutely not." | Autonomy, inversely. The Filter holds it narrowest of all |
| Box pull | An open box, basket or crate nearby | Detours to sit in it, drops the task for a moment | "I'm not in the box. This is a coincidence." | Competence: a small, safe territory |
| Sunbeam tax | Warm light in reach, fatigue | Naps instead of acting, delays departures | "Five more minutes. The sun is still here." | All three, slowly (recovery) |

### Marti

Builds everything from salvage, with no parental inheritance. Temperament: high openness and agreeableness, low conscientiousness, middling neuroticism. Deep drives: relatedness starved; competence earned by making do. Values: self-direction, stimulation, universalism.

| Hook | Rises when | Changes choices | Voiced as | Feeds |
| --- | --- | --- | --- | --- |
| Tea craving | Hours since the last proper cup | Seeks kitchens, inns, anyone with a kettle; judgement slips when high | "Is there tea? Any tea? Even bad tea." | Relatedness: tea is how he shares time |
| Pocket weight | Picking up junk; drops when he gives things away or loses them | Light pockets: scavenges and dawdles. Heavy: confident but slow, refuses to run | "My pockets feel naked." Clinking with every step | Competence |
| Question itch | Each unexplained thing he notices | Detours to investigate, may abandon plans to scratch it | "Wait. Why is that door painted shut?" | Autonomy |

### Rokko

Recycles and curates inherited values; dream magic tied to water. Temperament: high conscientiousness, low extraversion, lower agreeableness, openness that blooms in dreams. Deep drives: relatedness to tradition; autonomy mostly in dreams. Values: tradition and security, with a contrary streak of self-direction.

| Hook | Rises when | Changes choices | Voiced as | Feeds |
| --- | --- | --- | --- | --- |
| Pillow standards | Bad bedding, noise, a rocking ship | Poor sleep weakens his dream magic and makes him prickly next day | "That is not a pillow. That is a rumor of a pillow." | Autonomy, through dreams |
| Contradiction itch | Everyone in the room agrees | Argues the other side, even against his own view | "Hold on. Has anyone considered we're all wrong?" | Autonomy |
| Swoon meter | Time near someone he admires | Poetic and clumsy; agrees too fast, which suppresses the contradiction itch | Overlong compliments, tripping over furniture | Relatedness |

### Litta

Protests and escapes, then returns to adopt, improve and teach her tradition: the mountain that receives the storm and redirects it. Temperament: high openness and conscientiousness, low agreeableness early on, middling neuroticism. Deep drives: autonomy dominant early; relatedness pulls her back. Values: self-direction against tradition, the axis her arc travels.

| Hook | Rises when | Changes choices | Voiced as | Feeds |
| --- | --- | --- | --- | --- |
| Itchy paws | Routine, rules, being told to wait | Packs up, wanders off, takes the risky road | Tapping, pacing; "We've been here three days." | Autonomy |
| Grumble reservoir | Swallowed objections | When full, bursts out and breaks with the group; released kindly, it turns into resolve | Muttering under her breath, then one big speech | Relatedness: the storm, redirected |
| Teacher's twitch | Seeing someone do something badly | Steps in to correct and teach, even mid-escape | "No, no. Give me that. Watch." | Competence |

### Lunna

Deconstructs and rebuilds from a fully audited inheritance and acts on her own; competence is armour over exhaustion. Temperament: high openness, conscientiousness and extraversion, low agreeableness, high neuroticism hidden underneath. Deep drives: autonomy at maximum, relatedness starved. Values: self-direction, achievement, power.

| Hook | Rises when | Changes choices | Voiced as | Feeds |
| --- | --- | --- | --- | --- |
| Denied yawns | Exhaustion builds | Pushes harder; at the peak she makes rare mistakes or snaps | Yawning and denying it: "I'm not tired, the air is boring." | Competence, as armour |
| Credit ledger | Being underestimated; drops when her skill is noticed | Takes reckless jobs to prove herself | Pointed reminders of what she pulled off | Competence |
| Marti blind spot | Time near Marti | Small, unacknowledged kindnesses she would deny | Gruff help; never accepts thanks | Relatedness |

### Agata

Complies, then surpasses. Temperament: high conscientiousness and agreeableness, lower openness. Deep drives: competence dominant. Values: conformity, moving toward achievement.

| Hook | Rises when | Changes choices | Voiced as | Feeds |
| --- | --- | --- | --- | --- |
| Gold-star hunger | Authority figures nearby; drops with praise | Follows rules exactly, volunteers for tasks | "Did I do it right?" | Competence |
| Checklist joy | Clear tasks completed | Calm and reliable; without tasks gets anxious and makes lists | Ticking things off aloud | Competence |
| Better-way itch | Watching an authority do it worse | Quietly does it better, then not so quietly | "With respect, there's a faster way." | Autonomy: her surpassing |

## World model: waves and observation

Most of the world is held as tendencies, not facts. Only what has been observed is fixed. Everything else, including events behind the frontier, stays a wave, constrained by what has been seen.

- **Waves.** A small set of coarse variables (attitudes between characters, tensions, rumours, regional magic pressure), each with a few discrete states and a probability over them. No tracking of every NPC's actions.
- **Cards nudge tendencies** rather than set flags. Nudges accumulate until the event is observed.
- **The Filter sets the spread.** Filtered characters have narrow distributions, close to certainty; awakened ones have wide ones. Dreams are waves that can never be observed directly.
- **Observation fixes a value.** Once seen, it cannot change without new input, so scrolling back and forth never re-rolls it.
- **Backward conditioning.** Unobserved events keep only the probabilities compatible with every observation so far. Observation order is not time order: perceiving a later moment constrains the unobserved moments before it.
- **Upstream edits.** Earlier observations stay fixed while they remain possible under the new causes; only those made impossible or very unlikely reopen. A trivial edit can't be used to escape an unwanted outcome.
- **Anchors are computation checkpoints**: the state carried past an anchor is summarized as distributions, so each chapter is computed on its own.
- **Off-screen collapses need explaining.** Storylets that narrate after the fact show the player why something resolved the way it did.

| Approach | How it works | Where it fits |
| --- | --- | --- |
| Particles | Weighted candidate histories are simulated forward; storylet branches split a history by their exact probabilities; each observation discards those that contradict it; a probability is the sum of surviving weights (see Probabilities and storylets) | Superseded 2026-11-21: 128 full days of 12 cats took about 70 s per edit. Retired; single histories with every cat simulated are the reference for checking the fog's odds |
| Forward–backward | Exact probabilities over discrete, chain-shaped variables, one pass forward and one backward | Chosen 2026-11-21 for the fog: one chain per cat, joined through links (see Fog and lantern) |

### Fog and lantern

Decided 2026-11-21. Only the lantern is simulated; the fog is arithmetic. This replaces recomputing the day as many weighted histories, which took about 70 s per edit against a 100 ms budget. Shown odds only need to be plausible: every collapse draws its outcome from them, so they are honest by construction.

| Part | What it is | Cost |
| --- | --- | --- |
| Fog | Each unwatched cat is a chain: a probability over activity states, tick by tick. Every activity is tied to a place; walking between places is an activity too, timed from the place map. Changing stats (boredom, willpower, the itch) are part of the state in 3–4 bands; static traits only set the switching odds. The seed fixes every cat's starting stats, so the fog's uncertainty is behaviour, weather and hazards, never who a cat is (2026-11-21). | One forward pass, milliseconds |
| Decision function | One function scores activities from drives (softmax over σ(score / T)). The fog calls it on banded stats, the lantern on exact stats and then rolls. Tuning it changes both. | Shared |
| Storylets and objects | Formulas over the chains. The road is fixed if the crew's work-ticks before the deadline reach the work needed. | Arithmetic |
| Links | Shared yes/no causes several cats read: the weather, the cart, a meeting with a lasting effect. Everything that reads a link is computed per case and mixed by weight. | Doubles per link in a cluster; cap 3–4 |
| Lantern | Marti and the cats he perceives, simulated tick by tick with real positions. Its events go into the log as facts. | 2–4 live cats |
| Collapse | At the lantern's edge a cat is perceived with the chance he is there. If drawn, he is placed on an authored spot, holds his activity for a few ticks (dwell), then runs live. | Per perception |
| Backward pass | From what was perceived, Bayes back through the cat's chain and its links, then forward again (forward–backward). Seeing Ogryzok fishing makes "the cart didn't come" likelier, which changes Grisha. | Linear in states |

- Cats need no routines. A shared activity catalogue says which drives each activity satisfies, which place affordances it needs, its gates and its typical length. Named cats and storylets add authored gates or weights.
- Unwatched cats meet through expected company: P(both at the place) × the rule's rate. A brief effect is an average nudge. A lasting effect becomes a link when it sets a flag something reads and passes about 5%. Otherwise each flag keeps a heap of its top 3–5 contributors (pair, place, window, amount), and links are built from it when a consequence is perceived.
- Pressure in the fog uses the expected number of cats present; it becomes exact once Marti sees the place.
- Base flags are declared effects of rules (gossip sets knowsTale). Derived flags come from event detectors: matched for real in the lantern, estimated from their ingredients in the fog. Flags belong to a cat, an object or place, or the world; events are global facts in the log. A readers index built at load lists who reads each flag.
- Every effect writes declared state: a stat, a flag or a position. A lint check at load enforces it, so the fog sees every way the world can change.
- Conditions are written in place, zone and affordance terms ("at the roadworks, sunlit, basking"), so one form works in fog and lantern. A truly metric condition needs a fog form, checked against the live sim by a test.
- A cat's own drives produce emergent behaviour in the fog. Physical incidents, such as Grisha stubbing his toe, exist only in a lantern, or as a local cause invented when a consequence is perceived.
- Every write from the lantern reruns the forward pass from that tick, so the fog always reflects what Marti did.
- A collapse with no consistent past takes the next path, then falls back to a local cause. How often that happens is measured.
- Bookmarks still replay: every draw and tie-break is keyed by seed and log.

### Observation

Observation is a gradient, not a switch:

1. **Protagonists:** what Marti, Rokko and Litta live through collapses even off-screen, so cards always act on a definite state. Their future choices stay open until they happen.
2. **Causal neighbourhood:** everything linked to an observed fact narrows through backward conditioning, without collapsing.
3. **Everything else:** pure waves. Dreams never collapse.

**Perception (decided 2026-11-20).** The viewport no longer collapses anything. An event collapses when a followed protagonist perceives it during playback: within that cat's sight and hearing, reduced by rain, walls and distance. Each event records what was perceivable (Marti hears the argument but doesn't see who started it). Perception can differ per character: Rokko follows several voices at once.

**The camera is free (decided 2026-11-20).** The viewport is pure presentation: it shows the wave and never touches it, so panning across the map is scouting possibilities, not seeing facts. Each protagonist is a lantern of certainty in a fog of possibility: crisp around them, ghost crowds beyond, the lantern shrinking in the rain. When Marti and Rokko split up there are two lanterns. Dropped: the viewport collapsing what it shows, which let the player collapse the whole map for free by panning.

- **The revealed map is knowledge, not observation.** It marks where cards can be played.
- **Playback is needed.** Scrubbing fast through time observes nothing; only playback lets protagonists collapse what they perceive.
- **Keeping protagonists away is a tactic.** Steering them away from a likely but unwanted event while shifting its odds is legitimate. It costs cards and story, unlike moving a camera.
- **Other characters' beliefs are waves.** What a non-protagonist witnessed off-screen stays open until observed, kept consistent by conditioning.

### Interventions ripple

- A new card reopens only the observations it makes impossible or very unlikely. The map is never covered again.
- The change spreads from the intervention toward the frontier as a ripple that narrows or shifts tendencies. Nothing collapses except where a followed protagonist perceives it.
- The ripple travels only as far as influence can reach (rumours, travel, magic flow), like a light cone. Events outside the cone stay as they were and are not recomputed.
- The frontier itself is the story limit, the time past it and the set of storylets watched, not a collapsed state.

How tendencies show: hidden values with highlighted keys in dialogue (see Drives and goals); signs in the world for places and groups (proposed).

### Probabilities and storylets

Decided 2026-11-20. Probabilities are real: a shown 30% happens about 30% of the time, every number traces back to named stats, facts and pins, and every outcome writes state that later choices read.

- **Two sources of uncertainty, one ledger.** Authored storylets (small state machines) read the same cat chains in the fog; events emerging in the lantern go into the log as facts (see Fog and lantern).
- **Gates for possible, scores for likely.** A storylet's hard gates cover only physical or narrative possibility: place, time window, a required fact. Everything else is an integer score term from drives, relations, facts and pins. Storylets have 3–7 states; depth comes from storylets triggering each other through their effects. Roles bind at runtime ("whoever is near the boat").
- **Two kinds of transition.** Choice: a cat decides by softmax over its scores, including "do nothing", the same mechanic as its free behaviour. Hazard: the world rolls a per-tick rate (the keeper opens the shop, the crew arrives).
- **Probability = σ(score / T), with T from the Filter dial.** The same nudge moves a filtered cat more than an awakened one: +2 on a 50/50 gives 73% at T = 2 and 88% at T = 1. The player's power is strongest where the Filter is strongest.
- **Event detectors** name patterns in sim state over a time window: Marti got soaked, a near miss, Marti waited out the rain under an awning. Detected events are facts like storylet outcomes: they can be observed, pay charge, and appear in gates and the anchor's requirement tree.
- **Consequences** are immediate (sim state), seeded (facts and drives that later scores read) or player-facing (charge, draws). Consequences are evidence: watching an effect runs the backward pass to its likely causes, so an unseen conversation can become near-certain after the fact.
- **Weighted histories** (superseded 2026-11-21). The day is no longer simulated as many weighted histories; see Fog and lantern.
- **Determinism.** Fixed-point weights and a precomputed σ table, never `Math.exp`, so a seed or a shared URL replays identically in every browser.
- **Calibration** (revised 2026-11-21). Outcomes are drawn from the shown odds, so they are calibrated by construction. The tests measure instead how often a collapse finds no consistent past, whether cards move the odds the right way, and how far the fog's odds sit from the reference simulation: single histories with every cat simulated.
- **Observation samples, it never tests.** Perceiving (or a Gaze) draws an outcome from the current weights (keyed by seed, log and event), records only the visible facts, and runs the backward pass from them, so linked unwatched events update. It never runs out of possibilities, and the same inputs replay the same outcome. Only imposed facts are tested: the anchor and facts watched before an edit. Every failure state, fray or break, comes from such a test.

### Threads

Decided 2026-11-20. More protagonists means more threads on the same timeline, not separate runs.

- **Following.** After the meeting the player can follow Rokko, and later Litta. Following switches which protagonist's perception collapses the wave on that thread. The camera follows them by default but stays free to pan anywhere. The idea comes from Mooncrash, but here the threads live through the same hours side by side, so what carries over between them is causality, not leftovers.
- **Protagonist collapse starts when the player first follows a character,** and covers only the stretches played on their thread. Until then their time is a wave, narrowed by what the others saw.
- **Repeat by default.** Pins are the record: scroll back, press play, and every pin fires as before while watched facts hold. Changing something takes a card.
- **Evidence motivates switching.** A thread leaves traces only the next one explains: wet paw prints, a near miss, road works that moved.
- **Pin targets.** Each card declares what it is attached to: character cards follow their cat, place cards stay on their spot at their time. A pin whose target isn't there fizzles, shows why, and fires again whenever the target returns.

### Breaks and frays

Decided 2026-11-20.

- **Watched facts stay collapsed** unless the player knowingly breaks the chain.
- **Paid events are guarded.** A watched event with a card or power on it that an edit would break gets an alert before the edit lands. The alert is information only, with no penalty. Other watched events may shift after an edit and get a quiet "changed, unwatched" mark on their thread.
- **Two words.** A fray is the first tick from which the anchor's probability is zero. A break is a watched, paid event that no longer happens.
- **Costs sit where the player commits, never on outcomes,** so exploring is never taxed (see Powers and Cards).

## Sea voyages

On a voyage the ship is a social pressure cooker, and the player is at the height of their power.

- **The Filter is at its strongest at sea**, because nothing obstructs it. Characters are at their most predictable, and the player, who represents the Filter, has carte blanche on social actions aboard.
- **The content of a voyage is social**: the party is confined together for weeks, so relationships, grudges, secrets and confidences carry the play. Little changes in the outside world.
- **Dreams are another plane**, unaffected by the Filter in any location. That is why Rokko can make his dream escapades without Filter jammers. Dreams stay free and nondeterministic for everyone.

### Dreams and the player

The player cannot reach the dream layer through cards. Instead, dreams interfere with the player's plans, changing the world or the deck without any card being played.

- **World effects (proposed):** overnight shifts in a character's beliefs, memories or relationships. They are logged like other free choices and reopen only if an earlier edit makes them impossible or very unlikely.
- **Deck effects (proposed):** reshuffling the draw order, blocking a card for one character, transforming a card, or slipping in a foreign dream card. They apply the first time the frontier passes the dream and are not undone by scrolling back.
- **Visibility (proposed):** the Filter can't see into dreams, so neither can the player. It can see the avatars a dreamer projects into the waking world, as when Rokko spies on Maxxy in his first dream in chapter two. Beyond that, the player sees that a dream happened and who dreamt, but not what happened in it.

## Story engine

The engine arranges small authored pieces into an emergent order; it does not generate prose.

- **Storylets**: small authored situations with preconditions on world and agent state, a cast of roles, and effects. Effects are declared as data, so the engine can also search backward from an anchor's requirements.
- **Anchors**: conditions the story must reach, plus conditions under which a branch can no longer reach them.
- **Director**: raises dramatic pressure so anchor preconditions become likely, without forcing them.
- **Few variables.** The world state stays small for speed; variety comes from combinations, not from the number of variables.

**Main risk:** emergent stretches that read as a list of events rather than a story. Defences are strong traits, enough authored storylets, and anchors that give everything direction.

## Player layer (outside time)

The player exists outside time: scrolling never changes their hand, their collection or the map they have revealed.

### Cards

- **Deck.** Compact, with composition chosen by the player. The seed sets the draw order, so scrolling back cannot fish for a better hand.
- **Draw sources.** Anchors when first reached, frontier progress, world events and secrets.
- **Special places.** For example, a witch's hut in a secluded part of the world to exchange cards, or a forge to mint new ones.
- **Unique cards.** Some cards can be played only once or are destroyed on use. These carry the stakes.
- **Experimenting is rewarded.** Scrolling back with better cards is smart play, not something to punish. A player with a far frontier may return to the beginning with a bigger deck.
- **Playing cards.** Cards are instant, continuous or one-off. Instant cards go to the discard pile right after they are played; continuous cards stay locked until their effect is over, then go to the discard pile, but scrolling back to before a continuous card's effect is over returns it to the hand; one-off cards are destroyed when played. When the draw pile is empty, the discard pile is shuffled back in. Cards can be played on cats and on objects, including magic points (see Card effects); this needs a lot of experimentation. Inspecting objects is a player action, in Marti's flat and throughout the world; an inspected object tells its story and gives a card. Playing a card on the object it came from grants a special one-time effect: Marti picks up Melman's whistle and blows it. The special effect is used up once per run, recorded outside time, and is not restored by scrolling back; the card stays in the deck as an ordinary card.
- **Pins (decided 2026-11-20).** Ordinary cards are free: a played card is its pin on the timeline; it fizzles when its target is absent, and it can be withdrawn to the hand or moved at no cost. Unique cards never return to the hand, but their pin stays and fires whenever its target is there. Specials stay once per run. For the demo this replaces the discard cycle above, which stays as a playtest comparison.

### Card effects

**Targets.** Some cards can only be played on cats (Sudden Flea). Others work on cats or objects, with a different effect on each:

- **On a cat:** a personal nudge, stronger the lower the cat's corresponding gauge. It works best on a cat that lacks the trait, and saturates on one that already has it.
- **On an object:** more control and a wider reach. Something Shiny played on an object attracts cats to it, and the cats who respond most are the ones who already have the trait.
- **On a card's source object:** its special one-time effect.

On a cat, a card changes who the cat is; on an object, it uses who the cats already are.

**Layers (proposed).** A card's effect combines up to four layers:

1. **Action:** a momentary interruption (groom, sneeze, look at the glint). It pauses the cat's own decisions rather than replacing them.
2. **Gauges:** lasting shifts to hooks or drives. Instant cards leave a nudge that decays; continuous cards hold an offset while they run.
3. **Social ripple:** nearby cats react (friends help groom, strangers back off, gossip spreads).
4. **Pressure:** always present and invisible; the source of both undermining and charge.

Interruptions are controlling: they add more pressure, pay more charge, and can be shrugged off by high willpower. Gauge nudges are subtle: less pressure, and they get around willpower, because the cat decides for itself. Whether a cat accepts an interruption depends on the card's force against its willpower and Filter; for awakened cats it is a free choice, drawn and logged.

**Saturation (to test).** Each card's effect on a cat's gauge follows a saturation setting: linear (strongest where the gauge is low), logistic (weak at both ends, strongest in the low-to-middle range), or off. Gauges are never completely empty. All three are switched during playtests to see how they change play.

### Powers

Besides cards, the Filter has a few magic actions: 2–3 powers, expensive but always available when there are enough resources.

- **Project a glowing cat.** A glowing cat appears in the world and immediately affects named and unfiltered characters, usually attracting them and making them follow. It works best on exactly the minds the Filter can't otherwise hold, and it is the one moment before the finale when the player becomes visible in the world, which makes it natural foreshadowing for the reveal.
- **Filter pulse (proposed).** Everyone in an area becomes more predictable for a while: a riot calms, a scene settles. It adds external pressure to everyone it touches, and no one dreams there that night.
- **Gaze (proposed; in the demo for testing, 2026-11-20).** The Filter fixes reality on purpose. The player points at a spot and a moment, and whatever a small circle there holds collapses into fact for a few ticks. It samples from the current odds like any observation; the player never picks the outcome. Uses: lock in favourable odds before later edits shift them; clear the fog so a card lands on a definite target; pull on the past, since a fixed fact narrows linked events backward. Costs charge. Events it collapses earn no payouts, so it can't loop, and they count as paid, so they get break alerts. Pairs with Filter pulse, which narrows the waves without collapsing them. A stronger cousin that chooses the outcome is reserved for the final chapter.
- **Listen (proposed).** Reveals one of a character's hooks for the journal without waiting for them to voice it. It could replace insight cards.
- **Resource.** Charge, earned per story tick from interference: the more cats under control, the more charge. Proposed measure: the total external pressure on cats, which every card adds; instant cards count briefly as their pressure decays, lasting effects for as long as they run. A story tick is a first-time progression event, each paying once per run: a resolved storylet, a newly opened part of the map, an anchor resolution, and possibly a newly met character, a discovered hook, a found secret, a requirement of the anchor satisfied for the first time, or a character's goal switch (proposed). Bigger ticks can pay more. Each storylet pays once, for its first resolution only, with no second attempts, so charge can't be squeezed out of every storylet before moving on. Because ticks only happen the first time, charge can't be farmed by scrolling.
- **Paying for powers (decided 2026-11-20).** Charge is paid when a power is placed and is never refunded, neither on withdrawal nor by scrolling back. Moving or re-placing a power pays again. A power pin that fizzles keeps its spent charge and fires again when its target returns. Charge is the only cost of experimenting. New story refills it; payouts are keyed by kind of event (storylet state or detector type), not by history, so breaking a chain on purpose can't farm it.
- **Knobs.** Cost of each power, charge income, area and duration of effects, how fast pressure decays, and whether withdrawing a continuous card claws back the charge it earned.

### Rewards: cards and charge

Cards and charge come from two separate lists of events, so the path the player takes trades one for the other.

- **Cards are understanding.** Precise, targeted tools with varied effects, limited in number and drawn in a seeded order. They are knowledge of how the programmed world works, so they come from discovering it: places, characters, hooks, secrets. Growing the collection means learning new ways to influence.
- **Charge is grip.** Raw, interchangeable power that accumulates and is spent on powers. It comes from progressing the story while holding cats under control.
- **The trade (proposed).** Wandering and exploring side paths yields cards; driving the main story under heavy control yields charge. Exploring teaches you, control feeds you, and freedom costs you: an awakened cat turns its cards into dead weight and pays less charge. Charge is never lost, only spent, up to a cap (proposed).

| Event (first time only) | Reward | Notes |
| --- | --- | --- |
| Opening a new region | Cards | A draw, possibly a new card |
| Revealing new parts of the map | Cards | Small, frequent |
| Meeting a new named or unique character | Cards |  |
| Discovering a hook | Cards | Possibly a card aimed at that hook |
| Finding a secret | Cards | Rare or unique cards |
| The witch's hut, the forge | Cards | Exchange and minting |
| A character awakening | Dead cards | Undesirable: cards bound to that cat become ineffective, because the knowledge no longer applies. They are tagged as dead and stay in the deck as dead weight until traded away |
| First sight of a dream avatar | Cards | Possibly a water or dream card |
| Resolving a side storylet (off the anchor's requirements) | Cards |  |
| Resolving a storylet on the anchor's requirements | Charge | Scaled by current pressure |
| An anchor requirement satisfied | Charge | A steady trickle between big events |
| Anchor resolution | Charge, plus draws and deck rebuild | The biggest payout |
| A goal switch pushed by the player | Charge | A life redirected under pressure |
| A goal switch the character reached freely | Nothing | Cards tied to the old goal may stop working |
| Calming a crowd or district | Charge |  |
| A cat turning impersonal | Charge, a lot | The darkest temptation (proposed) |

All rows except anchor resolution are proposals. Both paths need a minimum trickle of the other, so no playstyle starves completely.

### Revealed map

Playing a card does not need characters nearby, only that part of the map revealed, possibly in a previous timeline. Characters act as scouts: a branch where Marti wanders off and gets lost may be exactly the one that reveals the witch's hut.

### Map and regions

The world is a set of regions, each seamless from room to city scale: islands, some of them literal, that the characters reach after long journeys with nothing in between.

1. **Room:** full detail, readable faces; important buildings open as cutaways.
2. **Street or block:** simplified characters, baked crowds, buildings closed.
3. **District or city:** an illustrated, map-like view.
4. **World map:** illustrated, with opened regions as islands, unexplored ones in fog, and travel routes between them. Switching regions means zooming out to the world map and into another opened region, at any time while scrolling.

- **Time stays global.** Switching regions never moves time; the player just looks at another place at the same moment.
- **The camera follows the journey.** When the protagonists travel, the camera rides out to the world map, follows their ship along the route, and dives into the new region on arrival.
- **The ship is a region** that moves on the world map; zoomed in, it is a room-scale space of its own.
- **One set of tiers.** Zoom tiers double as levels of detail for observation and simulation.
- **Characters across scales.** Overlapping characters merge into clusters (a must); the focused character or the current card's target always draws on top. Any cat can be acted on at any time, protagonists included. Protagonists have willpower too high for a single intervention to change their behaviour meaningfully: low susceptibility to cards, wide goal bands, and the same undermining when pushed hard. Brute force fails, but a well-timed card at a tipping point can work. At rest, the map shows the cats that matter now, ranked by salience within a display budget: protagonists, cats near them, cats with active effects, unique roles such as traders and witches, cats with discovered hooks, and cats cast in active or upcoming storylets. The last softly draws the player toward the story before they know what it is. Picking up a card reveals every cat it can affect near the cursor, in a magnifying ring that spreads clusters and enlarges small cats, filtered by the card's own conditions. No tutorial needed.
- **District mood (experiment).** Cartoon signs over rooftops (storm clouds, Zzz, music notes, brawl dust clouds) vs an aggregate glow.

### Deck management

Start with the deck as agile as possible, and add constraints only if tension is missing.

- **Rebuild at anchors**, and/or keep every card once opened. A run is big enough that a different playstyle shouldn't need a new run.
- **Limited swap opportunities** between anchors may be enough of an economy. To test.
- **Characters affect the deck.** Awakening is a loss for the player: cards bound to an awakened cat become ineffective, because the knowledge no longer applies. They are tagged as dead, so the player doesn't have to discover it, and clog the deck until traded away, for example at the witch's hut. A card's status follows its cat's state at the moment it would be played: dead wherever the cat is awakened, effective again at moments before the awakening. The card is never removed or regained, only effective or not. Owning a card bound to a cat counts as a weak observation of that cat's awakening status, so its status is always definite while the rest of its off-screen life stays a wave: the Filter keeps tabs on the cats it has a hold on, and the card dying is the observation of the awakening. Universal cards never die, since there is always a valid target. Proposed: a continuous effect running when its cat awakens breaks, and the card goes to the discard pile.
- **Evolution, for some cards only.** Branching, condition-based evolutions, Pokémon-style, never a universal rule that locks a playstyle.
- **Rejected for now as too restrictive:** patron cards defining a deck's theme, and cards that grow toward their most frequent use.

**Deck size and swaps (proposed).** Every found card stays in the collection; the deck drawn from is capped and grows at anchors, for example 8 cards in chapter 1 and 2 more per anchor, with a hand of 3–4. Free swaps happen when a card is found: the player can swap the new card for any card in the deck, or leave it in the collection. A swapped-out card goes to the collection and stays out of the deck until the next anchor or trading place, where the deck can be rebuilt from the whole collection. Swapped-out cards don't return to their objects, and hubs are not free-swap places: since any revealed place can be viewed at any time, either would turn the deck cap into a nuisance rather than a constraint. In chapter 1 (proposed), the cap starts at the door: in the flat every found card is playable, and when Marti first steps out, the player packs a deck from what they found, mirrored by Marti emptying his pockets at the door, since he won't leave with full pockets. Swapping is tied to finding, not available at will, so the seeded draw keeps its meaning, and exploring is also how a player clears out dead cards. A card swapped in goes straight to the hand, and a swapped-out card in the hand leaves it.

## Tech

Prototype in TypeScript to test the UI and whether the core mechanics work; move to Unreal for cinematic presentation only if the game loop proves viable. The engine choice is made at that checkpoint.

- **Simulation core**: pure TypeScript, deterministic, fixed step, seeded RNG, no rendering imports. Runs headless in a Web Worker so it can compute ahead of what's shown.
- **State**: small and symbolic, snapshotted cheaply with structural sharing, so seeking to any moment is fast.
- **Content as data**: storylets, agents, anchors and cards in data files that survive an engine change.
- **Golden replay tests** from day one: a recorded log plus expected state hashes. They verify a future port; integer or fixed-point maths in the story sim keeps them exact across languages.
- **Presentation**: in the prototype, flat placeholders. The long-term vision is an isometric/3/4 world with a fixed camera. Named and nearby characters use skeletal or cut-out 2D, with hand-drawn swappable faces and animation layers driven by their drives (ears, tail, posture), so one walk cycle covers every combination of moods. Crowds and distant characters use flipbooks baked from the same rigs. Props and environment use single painted views. Rig views: front, 3/4 front, side, 3/4 back and back, the rest mirrored. Spine and Rive to be evaluated; check licensing and runtime support for web and Unreal.
- **Saves**: shareable, bookmarkable URLs (seed + log + time, plus the player's state) would be nice to have but are not essential; otherwise saves are stored conventionally. Players hacking saves into any situation is fine, even encouraged.

### Card data (draft)

Cards are content as data, built from a small set of effect primitives the engine runs (about eight for the prototype: interrupt, gauge shift, attract, repel, social spread, delay, move, trigger storylet). A card that can't be built from them is a signal to add a primitive, not to write custom code. There are three kinds of card data: the **definition** (static content, one per card), the **instance** (the player's copy, outside time), and the **play record** (an entry in the timeline log). Whether a card is dead is computed, never stored.

```ts
type CardDef = {
  id: string;                      // stable forever: saves depend on it
  name: TextKey; flavor: TextKey;  // localized string tables
  art: AssetKey; vfx?: AssetKey;
  kind: 'instant' | 'continuous' | 'oneOff';
  duration?: Ticks;                // continuous only
  bound?: { cat: CatId; hook?: HookId };              // absent = universal
  source?: { object: ObjectId; special: StoryletId };  // special effect is a tiny storylet
  targets: {
    cat?: TargetedEffect;          // absent = can't be played on cats
    object?: TargetedEffect & { radius: number };
  };
  tags: string[];
  evolves?: { into: string; when: Condition[] }[];
};

type TargetedEffect = {
  when?: Condition[];              // same Condition type as storylets
  action?: { anim: AnimKey; duration: Ticks; force: number };
  gauges?: { gauge: GaugeId; delta: number; decay: number;
             saturation: 'linear' | 'logistic' | false }[];
  social?: { radius: number; effect: SocialEffectId };
  pressure: number;
};

type CardInstance = { def: string; foundAt: TickId; specialUsed: boolean; evolvedTo?: string };
```

- **Animations are keys.** A card names an action (`groom`); each species' rig supplies it, and a cat can override it.
- **Objects grant cards** through their inspect data; storylets can grant cards as an effect.
- **Validation:** typed data checked by a runtime validator (for example Zod), so the writer's files are checked automatically.

## Prototype

A deliberately plain slice that answers design questions, not rendering ones.

**Scope (proposed):** Marti alone, through the tutorial stretch up to the first anchor, meeting Rokko; one location; three to five agents; a small storylet pool; a compact deck; time scrolling with a visible timeline. No production character renderer.

**Go/no-go criteria (proposed):**

- [ ] A playtester scrolls back unprompted to try a different card because they want a different outcome.
- [ ] After a few tries, testers can roughly predict what an intervention will do.
- [ ] Testers tell their run as a story, not a list of events.
- [ ] A 20-minute session ends with them wanting to continue.
- [ ] Computing ahead to the chapter's anchor feels instant.

### Chapter 1 (demo): requirement tree, draft

Anchor: Marti meets Rokko on the beach. Everything before it is the tutorial.

1. **Marti leaves the house, in the rain.** For a cat this is huge, even for Marti, potentially one of the most determined cats alive, which is why the glowing cats want him. The only way to get him out is the first power, projecting a glowing cat. Charge for it comes from story ticks in the house. Proposed: the lure works better on a primed Marti (high question itch, no fresh tea, light pockets).
2. **Marti crosses the town.** The streets are empty: no cat goes out in the rain except Marti. Out of the door, he heads forward instead of turning to the beach (proposed: toward his usual tea shop). This is where the player learns to scroll back and set up obstacles while it isn't raining yet: earlier that day, a group of cats is fixing the road, and they can be distracted so their works block the way forward, turning Marti toward the beach later. The road block should be solvable with many different cards and combinations, so no single solution is the correct one and the player sees that different approaches work. The walk also reveals the first map. It is the first time the player works through the surroundings rather than on Marti, and across time rather than in the moment. Proposed hints: leftover road-work tools and barriers in the rainy street, and the timeline marking moments when actable cats were at this spot whenever a card is picked up over it.
3. **Marti finds the chain on the beach** and follows it. A natural pull for his question itch.
4. **The chain leads to the boat.**
5. **Rokko is under the boat**, hopefully. Rokko's side is near-certain through anchor conditioning, so the tutorial doesn't need the player to work on him. Proposed: the rain is the clock. When it stops, Rokko leaves, so the obstacle and the timer are the same thing.

**Opening (decided 2026-11-20).** Marti starts at the same early hour as Rokko and spends most of the morning at home, inspecting objects and building the deck, while the town outside runs as ghosts seen through the windows. The first lesson is that what isn't watched stays open. Marti's run collapses little of the town, which leaves room for Rokko's thread later. Following Rokko comes after the demo; the demo can end on a locked teaser, but Rokko's way to the boat is simulated, not scripted.

Teaching order (proposed): teaser of the beach; watching Marti in his room, hooks voiced, and first cards from exploring his flat, where each object tells its story and gives a card (looking at Melman's whistle tells the story of Melman and gives Something Shiny); cards on Marti barely change him but build pressure and charge; scrolling ahead shows the timeline fraying when Rokko leaves; the power; the walk through town; the strike.

Without the player, Marti never leaves: chapter 1 is the one place where the story can't move on its own, which also seeds the reveal.

**What the demo teaches (the bare minimum):**

- [ ] Cards on a protagonist barely work
- [ ] Playing cards builds charge
- [ ] A power used on a protagonist
- [ ] Scrolling back in time
- [ ] Cards on other cats work much better
- [ ] Cause and effect across time
- [ ] Cats make their own decisions (Marti's curiosity and the chain)
- [ ] Anchor resolution

Optional storylets for lore and immersion (ideas): Marti's salvage shelf, where each object holds a small memory; the road workers' chatter in the morning, waving off Catlantis as an old tale; the tea-shop keeper before the rain; a townscat watching the rain with an odd longing. Each should show the Filter as an everyday absence rather than explain it.

**Marti's flat: objects and cards (draft).** Stories to be written.

| Object | Card | Card effect | Special effect on its object (once per run) | Role in chapter 1 |
| --- | --- | --- | --- | --- |
| Melman's whistle | Something Shiny | A glint draws a curious cat's attention | Marti blows the whistle | Proposed: the sound carries through the silent, rainy town and makes Rokko peek out from under the boat |
| Chipped teacup | Tea Break | A working group stops for tea | Marti makes himself tea | The road workers in the morning. A trap: a fresh cup makes Marti comfortable and the lure works worse |
| Jar of odds and ends | Irresistible Junk (bound to Marti) | He picks up something he can't leave behind | Marti empties his pockets into the jar | Priming: light pockets make him readier to go |
| Flea comb | Sudden Flea | Stops a cat to groom | Marti grooms until he's calm | Delaying a worker, or settling Marti |
| A box he never threw away | Box! | An empty box nobody can ignore | Marti sits in it | Blocking a path in the morning; a delay at home |

Plus one card from a discovered hook: **Empty Teapot** (bound to Marti), from his tea craving. Demo deck: these six cards. Kept out of the demo: Break in the Clouds and Old Song, which would skip or break chapter 1's lessons.

## Experiments

Everything below is meant to be tested and tuned rather than decided on paper. A hidden debug panel in the prototype should expose each knob, so mechanics can be watched working before they are tuned by feel.

### Tech

| Experiment | Test | Knobs |
| --- | --- | --- |
| Rendering stress test | One isometric scene, about 100 skeletal characters with drive-driven layers, a few hundred baked crowd sprites and a magic glow pass, on the weakest target hardware (integrated laptop GPU, Steam Deck). Pass: steady 60 fps | Internal resolution and upscaling, frame-rate cap, alpha-test vs blending, glow passes |
| Animation pipeline | One cat, one walk cycle, one emote, made as cut-out 2D (Spine or Rive) and as toon-shaded 3D, each with one drive-driven layer such as drooping ears; the animator tracks hours | Drawn vs mirrored directions, frames per animation, animating on twos, hand-drawn faces on 3D |
| Wave computation | Fog and lantern (decided 2026-11-21); measure recompute time per edit, how often a collapse finds no consistent past, and the fog's odds against the reference simulation | Link floor (about 5%), contributor heap size, cap per cluster, stat bands, dwell on collapse |

### Simulation

| Experiment | Test | Knobs |
| --- | --- | --- |
| Ripple | An edit spreads visibly and only as far as influence can reach; recompute feels instant | Propagation speeds (rumour, travel, magic), the probability below which an observation counts as very unlikely and reopens |
| Observation details | Zoom as level of detail; fast scrubbing observes nothing | Zoom levels and what each collapses, scrub-speed threshold for attention |
| Frontier as progress | Progress toward the anchor stays stable and never flickers | Weights in each anchor's requirement tree, blend of observed facts and expected values |
| Director and anchors | How often anchors happen unassisted, how often timelines unravel, and how often an unassisted run reaches the glowing cats | Pacing pressure and how fast it rises, unravel threshold |

### Player layer

| Experiment | Test | Knobs |
| --- | --- | --- |
| Played cards when scrolling back | Compare spent, movable, and withdrawn to the discard pile. Watch whether testers experiment freely and still tell their run as a story | Refund rule, cost of moving a card |
| Deck agility | Start as free as possible; add constraints only if tension is missing | Deck size, swap opportunities between anchors, unique single-use cards per chapter |
| Tendency visibility | Hidden values with highlighted keys vs numbers or wave visuals. Watch whether testers can predict outcomes, and whether they slide into optimizing | What is shown, keyword highlighting, intensity hints |
| Dreams and the deck | Dream disruptions feel like fate, not bugs | How often dreams reshuffle, block, transform or add cards |

### Characters

| Experiment | Test | Knobs |
| --- | --- | --- |
| SDT mechanics | Repeated pushing visibly hollows out a hook; over-control can tip a cat into apathy | How fast pressure builds, whether and how fast it recovers, internalization thresholds, the impersonal tipping point |
| Goal hysteresis | Goals never flicker; waning enthusiasm is noticeable before a switch | Band width per character, how strongly life events force re-evaluation |
| Noticing hooks | Marti notices on his own; others need a breakthrough | Repetitions before Marti notices, how far noticing spreads, how much a noticed hook loosens |

### Narrative

| Experiment | Test | Knobs |
| --- | --- | --- |
| Déjà vu | Testers first read it as a wink, and it still lands after the reveal | Budget (about 5–6 per playthrough), candidate scoring, residue strength |
| Teasers | How much a teaser can show before chapters feel predetermined | Teaser detail, per-run variation |
| Final loop | Repeating the finale stays interesting; the epilogue starts without a wait | Timer length, background epilogue precompute |

## Open questions

- [x] Which chapter anchors lie between meeting Rokko and the Catlantis expedition?
- [x] What happens to a played card when the player scrolls back before it: spent, movable, or withdrawn to the discard pile?
- [ ] When, where and how are cards played: on characters, objects, places, magic flow?
- [ ] How many swap opportunities between anchors keep the deck agile but meaningful?
- [ ] Which cards evolve, and under what conditions?
- [ ] How exactly do awakening characters change the deck?
- [ ] How often does an unassisted run reach the glowing cats, and should that run be canon?
- [ ] Final engine after the prototype: Unreal, Godot, or staying in TypeScript.
- [ ] Should cats' per-seed initial stats be part of the wave? Marti's watched actions would narrow them within a few scenes: a short "learning who Marti is this run" phase, at the cost of more histories.

* [ ] Which deep drives and surface hooks does each protagonist get?

- [x] Where does Litta stand in the final choice between Marti and Rokko?

1. &#32;Planned anchors atm are:\
Marti meeting Rokko (the first anchor; everything before it is the tutorial), them meeting Litta, Acquiring of the Reckless, the Catlantis expedition, arriving to the village on top of the mountain, discovering of the glowing cats hidden fortress, entering the dream
2. Cards can be instant, continuous or one-off. Instant go to discard pile right after they are played. Continuous are locked until their effect is over, and go to discard pile after that. When draw pile is empty Discard pile is shuffled back in. One-off cards are destroyed after they are played
3. TBD, but for now the idea is that the cards can only be played on cats and some rare magic points — need a lot of experimentation and clarification
4. TBD — that can only be decided with experimentation
5. TBD
6. TBD
7. &#32;TBD
8. TBD
9. TBD
10. All named characters have their standing derived from their hooks and drives. Narratively Litta is enabling their dream in the real world so she is absent in the moment of the final choice.
