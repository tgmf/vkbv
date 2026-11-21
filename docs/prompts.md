# Prompts

Copy these as they are. Replace `<n>` and `<file>`.

## 1. Kickoff (coding model, new session, clean branch `m<n>-…`)

```
You are implementing milestone M<n> of the All Cats Fear Water demo.

Read, in this order and in full: CLAUDE.md, docs/glossary.md, every file in
docs/spec/, docs/milestones/<file>, every file in docs/handoff/, docs/decisions.md and
docs/questions.md.

Then write a plan and stop. The plan lists: the files you will create or change, the
tests you will write and which acceptance item each one covers, anything in the brief,
spec or glossary you find unclear or contradictory, and anything you intend NOT to do
because it is out of scope. Do not write code until I reply "go".

Rules that matter most: implement the spec exactly and do not design; if two documents
disagree, ask instead of choosing; simulation code is deterministic, integer-only and
pure, with randomness keyed as spec 03 §1 says; every number comes from content or
tuning.json; never weaken a test or hand-edit a golden file; never edit
src/content/data/ch1/; ask before adding a dependency; stop when this one milestone's
acceptance list is fully checked and the handoff note is written.
```

## 2. Plan check (stronger model, optional, before saying "go")

```
Here is a plan for milestone M<n> of a project. Attached: CLAUDE.md,
docs/glossary.md, docs/spec/*, the milestone brief, and the plan.

Check the plan against the brief's acceptance list, the spec and the glossary.
Report only:
1. acceptance items the plan does not cover;
2. places where the plan contradicts the spec, the glossary or CLAUDE.md;
3. work in the plan that is out of scope;
4. answers to the questions the plan raises, if the spec already answers them (cite
   the file and section).
Do not rewrite the plan.
```

## 3. Review (stronger model, after the coding session)

```
Review this diff for milestone M<n>. Attached: CLAUDE.md, docs/glossary.md,
docs/spec/*, the milestone brief, docs/handoff/M<n>.md, and the diff.

For each acceptance item, say whether the diff and its tests actually demonstrate it,
citing the test. Then list, most serious first:
- any randomness, time, floats, Math.exp/log/sqrt/pow, or unordered iteration in
  src/sim or src/player;
- random numbers keyed by anything other than the scopes in spec 03 §1 (in particular,
  noise keyed by history id instead of stream);
- anything in src/ui or src/render that changes which histories survive (the camera
  must never collapse anything);
- any gameplay number or rule in TypeScript instead of content or tuning, or in
  src/ui;
- edits to src/content/data/ch1/;
- tests that were weakened, skipped or changed to fit the code; golden files changed
  without a stated cause;
- behaviour that differs from the spec, with the spec section;
- words that contradict docs/glossary.md;
- code that goes beyond the brief.
Do not comment on style. Do not suggest new features.
```

## 4. Fix round (coding model, same branch)

```
Read CLAUDE.md, docs/glossary.md, docs/spec/, docs/milestones/<file> and
docs/handoff/M<n>.md. The review of M<n> found the problems below. For each one, write
a failing test that shows it (where a test is possible), then fix it. Do not change
anything else. Update the handoff note when done.

<paste the review findings>
```

## 5. Bug found while playing (coding model)

```
Read CLAUDE.md, docs/glossary.md and docs/spec/. A bug was found by playing the
build.

Seed (vetted): <seed>   Tuning version: <version>   Rule: <pinned|spent|discard>
Pins and watched facts (debug panel, Player tab → copy): <paste>
What happened at tick <t>: <description>
What the spec says should happen: <file and section, or "unsure">

First reproduce it headless (npm run sim, with --waves if it involves ghosts,
observation or probabilities) and show me the trace around that tick. Then write a
failing test, then fix. If the spec is silent or the behaviour matches the spec, stop
and tell me; do not change the design.
```

## 6. Balance change (no coding session needed)

Knobs: open the debug panel, change values in the Tuning tab, play, then "copy as
JSON" over `src/content/data/tuning.json`. Content: edit the files in
`src/content/data/ch1/` yourself, then run `npm run content:check`,
`npm run balance` and `npm run check`. If a golden playback changes, run
`npm run golden:update` and note why in your commit. If a balance test now fails,
either the property no longer reflects what you want (edit `05` §5, then have a model
update the test) or the change went too far.
