# M10 — Release hardening

**Goal:** the dressed build is safe to put in front of strangers.

**Read first:** `07-quality.md` §4–§7; the release checklist in Tagir's roadmap (ask
for the current copy).

## Build

1. **Bookmark:** "Copy link to this moment" encodes the player state (`04` §9: seed,
   pins, playhead, watched facts, specials used, journal, revealed map, frontier,
   payouts paid) as base64url of deflate-compressed JSON (`CompressionStream`) in the
   URL fragment. Opening one offers "Open this day" without overwriting the local save
   until confirmed. Invalid links are ignored with a notice.
2. Save migration: `migrate(saved)` keyed on `v` and the tuning `version`; a save from
   the Gate B build loads or is reset with a clear message.
3. Cross-browser fixes for current Chrome, Firefox, Safari and Edge; touch sanity on
   one iOS and one Android browser (playable; layout need not be optimised).
4. Remote telemetry notice and off switch verified; crash screen verified.
5. Page metadata: title, description, social preview image, favicon, `lang`.
6. `npm run build:itch` (itch.io zip) and a self-hosted target.

## Acceptance

- [ ] A bookmark opened in a private window reproduces the same day, playhead and
      watched facts.
- [ ] `npm run e2e` passes on Chromium, Firefox and WebKit in CI.
- [ ] Lighthouse accessibility score of 90 or more on the play page.
- [ ] The first-playthrough test passes against the itch.io zip served from a sub-path.
- [ ] No console errors on any target browser during a full playthrough.

## Out of scope

Store pages, marketing assets, the Steam desktop build.
