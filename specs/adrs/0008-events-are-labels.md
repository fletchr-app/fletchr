# A team training is a label on sessions, notes and media, not a shared session

status: accepted
date: 2026-10-30

## Context and Problem Statement

A coach at a team training wants to add notes and photos for the whole group without opening a session for every archer first (#104). Archers keep logging their own sessions, with their own times and results. How does the training connect to what they and the coach record?

## Considered Options

- **Coach-created sessions per archer** (the #82 way): works, but one session per archer per training, and the coach must know who is there.
- **One shared session** with all participants: the archers' own sessions then clash with it (results, merging, times) and a participant list has to be kept.
- **Time-window matching**: show whatever overlaps. Cheap, but a coach's photo at 17:55 or an archer who came late is linked or not by chance, and nothing can be corrected.
- **A label plus an explicit link**: a team schedule of weekly slots and one-off events; sessions, notes and media carry an optional `event`. The app suggests the event by time and the user confirms or picks none.

## Decision Outcome

The last option. Occurrences of a slot are computed and become rows only when something links to them, is cancelled or moved (id `uuid5(slot, date)`), so a phone can link to one before the server has a row. A session linked to an event also shows the same archer's notes and media of that event that are in no session. Visibility stays per note.

## Consequences

- Every list that filters by session has to use the shared filter (`rows_of_session`); old apps see the event rows on a linked session but cannot choose events.
- An archer who picks "None" by habit loses the link. The event view and "Put into a session" (`POST /api/events/<id>/attach/`) cover that.
- Time zones matter: occurrences use the slot's zone, so the server needs `tzdata`.
- Changing the times of a slot whose later occurrences are rows is refused; the coach ends it and starts a new one.
