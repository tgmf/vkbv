# Playtest kit (for Tagir)

This is how Gate A is judged. It is written for you, not for the coding model, except
§4, which M8 implements.

## 1. Who and how many

Five people who have not seen the game, one at a time, 30 minutes each, in person or
on a shared screen with their face and voice. Mix: two who play systemic or card
games, two who mostly read or watch stories, one who rarely plays. By default every
tester gets `?rule=pinned`. If you want to compare card rules, give testers 2 and 4
`?rule=discard` (or `spent`) and note it.

## 2. Script

1. "This is an early build with placeholder art. I'm testing the game, not you.
   Please think out loud. I won't answer questions while you play." Nothing else. Do
   not explain time, ghosts, cards or the goal.
2. Start a new game with a fresh seed. Stay silent for 20 minutes. If they are stuck
   for three full minutes, note it and give the smallest nudge ("what does the
   timeline do?"); mark the session as nudged.
3. At 20 minutes, or at the end screen, stop them mid-action and ask, in this order:
   - "Tell me what happened in the game so far."
   - "What are the faint copies of the cats?"
   - "If you went back and gave the crew the tea card at nine instead, what do you
     think would happen?" (or another intervention they have not tried)
   - "Who was in control?"
   - "Do you want to keep going?" Then let them, and watch what they do first.
4. Export the telemetry from the debug panel and save it with your notes.

## 3. The criteria and how to score them

| Criterion | Pass for one tester when | Source |
| --- | --- | --- |
| Scrolls back unprompted to try a different card | at least one pin behind the furthest tick they had reached, after seeing a fray, with no nudge | telemetry `card_played.behindLimit` + your notes |
| Can roughly predict an intervention | their answer to the "what would happen" question matches, in direction, what the game then does | your notes; try it in front of them |
| Tells what happened as a story | their retelling uses characters and reasons ("he wouldn't go out because…"), not a list of mechanics | your notes |
| Wants to continue after 20 minutes | says yes and acts on it within 10 seconds | your notes |
| Computing ahead feels instant | no visible wait after any edit, waves included | telemetry `recompute` + your eyes |
| Uses the waves on purpose (proposed sixth) | steers Marti toward something, keeps him away from it, or uses Gaze on it, to change how it turns out, and can say so | your notes + telemetry `power_used` |

Gate A passes when four of five testers pass at least four of the first five
criteria. Record the sixth separately; it tells you whether the wave model earns its
cost. Fewer passes: write down the single biggest obstacle you saw, change one thing,
run two more testers. After two such rounds without a pass, stop and rethink the loop
before spending on art.

Also write down, for every tester: where they first got stuck; which hint they needed
and which they ignored; the first thing they said about Marti; whether they noticed
that cards on Marti do little; what they thought the ghosts were; whether they read
the break alert; anything they laughed at.

## 4. Numbers from telemetry (`summarizeSession`)

| Number | Definition |
| --- | --- |
| `minutesPlayed` | last event time minus first, in minutes, summed over the page loads (sessions) in the buffer |
| `reachedAnchor` | an `anchor_reached` event exists |
| `minutesToAnchor` | time of the first `anchor_reached`, counted as `minutesPlayed` is |
| `pins`, `withdrawals`, `moves`, `lures`, `gazes` | counts |
| `scrollBacks` | count of `scroll_back` events |
| `pinsBehindLimit` | count of `card_played` with `behindLimit` true |
| `pinsBehindLimitAfterFray` | the same, counting only those after the first `fray_seen` |
| `luresBeforeFirstMartiOut` | lure placements before the first `story_watched` of `door_lure.out` |
| `breakAlerts`, `breakAlertsConfirmed` | counts |
| `recomputeMedianMs`, `recomputeMaxMs` | from `recompute` events |
| `hintsShown` | list of hint ids in order |
| `objectsInspected` | count of distinct `inspect` objects |
| `cta` | list of `cta_click` values |

Gate B (the closed beta) uses the same numbers across 20 to 30 remote sessions: share
reaching the anchor, median `minutesPlayed`, share with `pinsBehindLimitAfterFray >= 1`,
share with any `cta`.
