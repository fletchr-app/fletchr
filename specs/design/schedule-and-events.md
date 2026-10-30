# Team schedule and training events

Status: implemented online (#104, phases 1 to 5); offline use is open (phase 6, after #84)
Date: 2026-10-30
Plan: [2026-10-30-trainer-session.md](../plans/2026-10-30-trainer-session.md). Decision: [0008](../adrs/0008-events-are-labels.md).

A team has a schedule. A coach adds notes and photos to a team training without opening a session per archer, and an archer can say a session was part of that training. An event is a **label**, not a shared session: every archer keeps their own session.

## Model

- **TrainingSlot**: a weekly training of a team (weekday, local start and end time, IANA time zone, location, name, valid from and until, an optional pause). Its occurrences are computed (`training/schedule.py`), not stored, with the local time kept across a DST change.
- **TrainingEvent**: a real row. Either an occurrence of a slot that was made real (linked to, cancelled or moved), or a one-off (kind `training | competition | camp`, any start and end, may span days). Occurrence rows have `slot` and `date`; the id is `uuid5(slot id, date)` and `(slot, date)` is unique, so every phone and the server agree on it before the row exists.
- **Links**: `TrainingSession.event`, `Note.event`, `Media.event` (all optional, `SET_NULL`). Notes also have `at`, the time they are about (now by default, earlier for a note written afterwards).
- **Lazy materialisation**: a write that names an occurrence sends `event` (the uuid5) plus `event_slot` and `event_date`. The server checks the id, that the caller may use the team's events, and then makes the row (`resolve_event`). Nothing is made for a caller who may not use the team.

## Links and suggestions

- Nothing is linked by time alone. The app suggests the training whose time overlaps the session (or the note's `at`, or the photo's `taken_at`) and the user confirms or picks "None" (`src/lib/schedule.ts`). Exactly one overlap is preselected, else nothing is. Cancelled trainings are not suggested.
- An archer links their own session (`SessionWriteSerializer.event`; the coach who opened a session may set it too). A coach links a note or a photo of an archer in a team they coach. A note on a photo or frame takes the photo's event when none is sent; if a clip's event changes, its notes of that team follow.
- `core.access.can_tag(user, team, archer)` is the rule: a coach of the team for an archer of that team (`note_teams`), or the archer themselves when they train in the team.

## Reading

- **A linked session** lists, next to its own rows, the event rows of its archer that are in no session (`rows_of_session`, used by the `?session=` filter of notes and media). Visibility stays per note, so an archer reads only `shared` notes.
- **Without a linked session** (opted out, or a profile without an account): `GET /api/events/mine/?archer=` lists the events that have rows the caller may see, in no session, and no linked session of that archer. They show as rows in the training list and on the archer's page, and open the event view.
- **Event view** (`/events/:id`): for a coach the archers who took part (`/archers/`: linked sessions, notes, media), all notes and media; with `?archer=` one archer's rows, a note form and "Put into a session". `POST /api/events/<id>/attach/ {archer, session}` puts the loose rows of that archer into one of their sessions; they keep their `event`.
- **Agenda** (`/team/:id/agenda`, `GET /api/events/agenda/?team=&from=&to=`, at most 120 days): occurrences and events together, cancelled ones listed with `cancelled`. Coaches cancel (refused with 409 while something is linked), move, add a one-off, and add a note or photo for an archer. The slot editor is in the team settings.

## Rules worth knowing

- Slots and events are written by coaches and admins of the team, read by every member.
- The times of a slot cannot change in place once a later occurrence is a row (409): the app offers "change from <day>", which ends the old slot the day before and starts a new one.
- Deleting a slot keeps its rows as one-offs. A training from a slot is cancelled, not deleted.
- A merge of two sessions keeps the loser's `event` where the winner has none (`FILLED_FIELDS`). Claiming a profile and the account transfer carry the links along.

## Not built

Offline use (cached agenda, notes queued with an event) waits for #84 and its team cache. A session upload that the server refuses because of its event is not retried without it (a photo is). Calendar grid and iCal (#106, #107), tournament results, group notes that every participant reads.
