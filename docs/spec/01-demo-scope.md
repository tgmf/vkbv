# 01 — Demo scope

## 1. What the demo is

A single-page browser game, playable in 15 to 25 minutes on first try. Chapter 1 of
*All Cats Fear Water*: Marti alone, up to meeting Rokko under the boat in the rain.

- **Place:** the town of Son-Marta-Klekot: Marti's flat, the town's streets, the beach.
- **Time:** one day from 05:40, 900 one-minute ticks. Marti starts at the same early
  hour as Rokko and spends most of the morning at home while the town outside runs as
  ghosts.
- **Cast:** the content in `05`: Marti (the protagonist), Rokko, the tea keeper, the
  road crew and the townscats of the test slice.
- **Goal (the anchor):** Marti meets Rokko under the upturned boat on the beach while
  it rains. Rokko waits there until, a couple of hours after the rain stops, he takes
  the boat out to sea; the player has to get Marti there before that. Left alone, Marti
  never leaves his flat and the timeline frays when the boat leaves (Tagir, 2026-11-23).
- **The world is a wave.** Everything not yet watched is drawn as ghosts. Marti and
  the cats he perceives form the **lantern**, simulated tick by tick; everything else
  is the **fog**, computed as probabilities (`03` §13). Only what Marti perceives
  during playback becomes fact. The camera is free and never collapses anything.
- **Player:** the Filter's programming, not a character. The player watches,
  inspects objects in the flat to find cards, pins cards on cats, objects and places,
  uses two powers (the lure, which projects a glowing cat, and Gaze, which fixes a
  small circle of the world into fact), and scrolls back and forth through the part of
  the day already played. Every pin sits on the one timeline; after an edit the day is
  re-run from the pins up to where the story was played (the frontier limit).

There are two builds from the same code:

| Build | Purpose | Look |
| --- | --- | --- |
| `graybox` (M0 to M8) | Private playtests that decide whether the loop works, waves included | Coloured shapes in the final orthographic camera, cats as flat cut-out billboards, system font |
| `dressed` (M9, M10) | Public release | Illustrated scenes, character art, sound, written text |

Nothing in the graybox may depend on final art. Everything the dressed build
replaces sits behind the renderer interface, the theme, the text files and the audio
module.

## 2. What the demo must teach

The first playthrough must lead the player through these, in this order, without a
text tutorial (`06` §7):

1. Cats act on their own; you can simply watch.
2. What no one has watched is still open: the town is ghosts until Marti sees it.
3. Objects tell stories and give cards.
4. Cards pinned directly on a protagonist barely change him.
5. Pressure from cards raises charge payouts.
6. A power used near a protagonist can tip him.
7. You can scroll back and change the past.
8. Cards on other cats, on objects and on places work much better.
9. Cause and effect cross time: a morning pin changes the afternoon.
10. Cats still make their own decisions (Marti chooses to follow the chain).
11. The anchor: the chapter ends when the meeting is watched.

## 3. The intended first playthrough (reference story)

This is the path most players should find. It is a guide, not a script in the code;
everything below must emerge from the rules in `03` to `05`.

1. The teaser shows the beach, the boat, rain, two cats. Cut to 05:40 in the flat.
2. The player watches Marti potter, make tea, tinker. Outside the windows the town is
   ghosts. Marti voices his tea craving: the journal records the hook and a card
   arrives.
3. The player inspects the five objects in the flat and gets five cards, tries some on
   Marti. Little happens, but the charge payouts start to grow.
4. The player plays on, faster. Around 17:00 it rains; around 22:00 it stops, and a
   couple of hours later, near midnight, Rokko takes the boat out to sea and the timeline
   frays.
5. The rain's start made the lure affordable. The player scrolls back and places it at
   the front door; the day re-runs up to the new story and stops. Playing on, Marti goes
   to the door and turns back. The player learns to prime him (an empty kettle, light
   pockets, a strong question itch) and tries again. Marti steps out.
6. He walks his usual way toward the tea shop and the town is revealed. The road is
   open: either the shop is open and he settles in with tea, or it closed early and he
   may wander to the sea. Usually the timeline still frays.
7. The player scrolls back to the morning, now able to pin cards on the roadworks, and
   finds the crew there as ghosts. Cards on the crew and the place work well. If the
   crew falls far enough behind, the rain stops them and the trench stays open.
8. The player plays forward. Marti meets the barrier, turns toward the Sea Steps,
   notices the chain in the sand, follows it to the boat. Rokko is there. The strike
   lands.
9. End screen. The timeline stays open so the player can try other ways, and Rokko's
   thread appears, locked.

## 4. Out of scope (do not build)

Each of these is in the full design and deliberately absent. Do not add partial
versions. Where an extension point is named, keep it clean and build nothing behind
it.

| Not in the demo | Extension point to keep |
| --- | --- |
| Following Rokko or Litta (a second lantern) | `PlayerState.followed`; `follow(cat)` refuses all but Marti |
| Awakened cats with true randomness, the choice log | the `rand` scopes in `03` §1; nothing else |
| SDT layers, undermining, internalization, long-term goals | none |
| Déjà vu, residue, characters noticing their hooks, meta moments | none |
| Dreams, sea voyages, the world map, other regions, zoom tiers | `map.json` regions |
| Deck cap, packing, swaps, rebuilds, evolution, dead cards, trading places | `PlayerState.cards` zones |
| Powers other than the lure and Gaze (Filter pulse, Listen) | `powers.json` list |
| The lure's `leadTo` (dragging it to a destination) | the field in `powers.json`, ignored |
| Background population (aggregate waves for crowds) | none |
| Other chapters, endings, the final chapter | none |
| Accounts, backend, multiplayer, cloud saves | none |
| Mobile-first layout | Pointer Events only; no hover-only actions |
| Skeletal animation, Spine or Rive | `SceneRenderer` (`02` §4), added in M9 |

## 5. Platform targets

- Desktop Chrome, Firefox, Safari, Edge, current and previous major version. WebGL2.
- Minimum viewport 1280×720. Layout must not break down to 1024×640.
- Mouse, trackpad, touch and pen through Pointer Events. Keyboard for the timeline
  and targets (`06` §8). No gamepad.
- English and Russian from the first milestone with text. English is the source.

## 6. Words

`docs/glossary.md` is the project's glossary: one meaning per term, used in docs,
code and conversation. Use its words. If you need a term that is not there, or one of
its **Open conflicts** matters to your task, do not pick a meaning: ask in
`docs/questions.md`.

Code names that differ from the prose words:

| Prose | Code |
| --- | --- |
| place | `node` (`NodeId`) |
| pin | `Pin` (the log entry; "play record" in older notes) |
| the Filter dial | `temperatureTenths` |
| a noise stream (0 in the lantern; others in single-history mode) | `stream` |
| frontier limit | `frontierLimit` |
| lantern edge | `lanternEdge` (a re-run result's `edge`) |
| re-run | `rerun` |
| fray | `end.kind === 'fray'` |
