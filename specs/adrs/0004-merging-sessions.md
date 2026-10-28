# Merging a coach's empty session with the archer's

status: accepted
date: 2026-10-29

## Context and Problem Statement

A coach opens a session for an archer to attach photos and notes ([#82](https://github.com/fletchr-app/fletchr/issues/82)). Seconds later the archer starts their own for the same training, each with an id its app made, often while offline. Without a merge the training is split in two, and the media sits on the empty one.

## Considered Options

- No merge, a manual "join" button.
- The phone merges (the archer's phone sees the coach's session after a pull).
- The server merges, after every write.
- The server merges, only when a session is created, its times change, or its first result arrives, by a rule on pairs.

## Decision Outcome

The last one. Only a session someone else opened for the owner and without results can lose; so no results are ever lost and two sessions the archer opened (two phones) never merge. Archer against coach: the archer's session wins, empty or not, so the archer's own id stays stable. Two coaches: the one with results, else the earlier start, then the smaller id (values from the app, not the arrival order, so the winner does not depend on which upload came first). The windows (`started_at` to `ended_at`, or 4 hours when open, `OPEN_SESSION_CAP`) must overlap. An empty session with more than one possible partner is left alone, so a coach's open session does not swallow a morning and an evening session. The loser's id stays as a tombstone pointing at the winner and is rewritten on each merge, so every lookup is one hop.

## Consequences

- With three sessions the result can depend on arrival order (the empty one merges into whichever partner it meets alone first). Accepted, rare.
- There is no undo. A wrong merge moves media and notes only.
- A coach's open session that is never ended reaches 4 hours; a competition day can be longer, then it stays separate.
- A phone that holds an old id learns it from the next upload (the answer carries the winner's id) or from `GET /api/sessions/gone/`.
