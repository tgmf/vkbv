# Art and audio brief (Tagir fills this in before M9)

M9 does not start until every section below has content.

## 1. Character pipeline
Chosen after the pipeline test: `Spine` | `Rive` | fallback: cut-out stills with
drive-driven ears and tails (decided 2026-11-20 as the public-look fallback).
Runtime package and version, if any:
Weakest target machine for the 60 fps check:

## 2. Assets
For each: key, file name, pixel size, anchor point.
- Places: Marti's flat (study, kitchen, window nook, hall, door), the town streets and
  buildings of `map.json`, the beach with the boat and the chain
- Characters: every cat in `cast.json` that stays in the final Chapter 1 cast; at
  least Marti, Rokko, the tea keeper and the road crew
- Actions each character needs: idle, walk, and every interrupt action and activity
  the content uses (list them with `npm run content:check -- --actions`)
- Drive-driven layers: ears, tail, posture states
- Ghost and lantern treatment: how possibilities and the lantern of certainty look
- Objects: the 15 in `objects.json`
- Card faces: six cards; two powers (lure, Gaze)
- Teaser and end-screen art
- Icons: activities, charge, powers, pins

## 3. Type and colour
Fonts and licences:
Palette (as CSS custom property values):

## 4. Audio
Rain ambience, interface sounds, strike cue, optional theme. File names and licences:

## 5. Text
Final English and Russian for every line. The slice's lines in
`src/content/data/ch1/text/` are placeholders: replace or approve each. Also every
`[[TODO writer: …]]` key (list them with `npm run content:check -- --todos`).

## 6. Load budget for the dressed build
Total download size target:
