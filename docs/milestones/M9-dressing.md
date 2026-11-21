# M9 — Dressing (needs Tagir's input before it starts)

**Goal:** the public look and sound, with game rules untouched. Every golden,
calibration and browser test passes unchanged at the end.

**Blocked until Tagir fills in `docs/art-brief.md`**: the character pipeline (Spine,
Rive, or the fallback of cut-out stills with drive-driven ears and tails) and its
runtime package; the asset list and naming; fonts and licences; the palette; the
audio files; final English and Russian text for every line. If it is missing, stop and
ask.

**Read first:** `docs/art-brief.md`, `02` §4, §6, `06-ui.md` §2, §9.

## Build

1. A theme layer: CSS custom properties for colour, type and spacing; the graybox
   theme stays as the fallback and as the `graybox` build.
2. An asset manifest (`src/content/data/assets/assets.json`: key → file, size, anchor)
   and a loader with progress. Action keys the simulation emits (interrupt actions,
   activities) map to assets through the manifest.
3. The dressed `SceneRenderer`: same orthographic camera; painted places; cats in the
   chosen pipeline, with drive-driven layers (ears, tail, posture) derived in the
   renderer from the frame (presentation only); ghosts and the lantern restyled, not
   removed. A new runtime dependency is named in the plan and waits for approval.
4. Illustrated teaser and end screen; card faces; icons.
5. `src/audio`: rain ambience, interface sounds, one strike cue; volume setting;
   nothing plays before the first user gesture.
6. The final text in both languages. A test fails the dressed build if any writer
   marker remains.

## Acceptance

- [ ] `VITE_BUILD=graybox` is unchanged. `VITE_BUILD=dressed` passes the same
      first-playthrough browser test.
- [ ] No file in `src/sim` or `src/player` changed in this milestone.
- [ ] 60 fps while scrubbing on the weakest target named in the art brief.
- [ ] The zip respects itch.io's limits (under 1 000 files, no file over 200 MB,
      under 500 MB extracted) and the brief's load budget.
- [ ] Reduced motion and text size still work with the new theme.

## Out of scope

New mechanics, new cards, new storylets, balance changes.
