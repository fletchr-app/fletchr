# Team schedule and training events

Status: implemented (#104, phases 1 to 6; phase 6 is the offline use, with the team cache of #84)
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
- `core.access.can_tag(user, team, archer)` is the rule: a coach of the team for an archer of that team (`note_teams`), or the archer themselves when they are a member of the team, whatever their role and `also_shoots` (a link is a label, not visibility). A team member who is refused gets "You cannot link this to that training"; anyone else gets "No such event", so other teams cannot be probed.

## Reading

- **A linked session** lists, next to its own rows, the event rows of its archer that are in no session (`rows_of_session`, used by the `?session=` filter of notes and media). Visibility stays per note, so an archer reads only `shared` notes.
- **Without a linked session** (opted out, or a profile without an account): `GET /api/events/mine/?archer=` lists the events that have rows the caller may see, in no session, and no linked session of that archer. They show as rows in the training list and on the archer's page, and open the event view.
- **Event view** (`/events/:id`): for a coach the archers who took part (`/archers/`: linked sessions, notes, media), all notes and media; with `?archer=` one archer's rows, a note form and "Put into a session". `POST /api/events/<id>/attach/ {archer, session}` puts the loose rows of that archer into one of their sessions; they keep their `event`.
- **Agenda** (`/team/:id/agenda`, `GET /api/events/agenda/?team=&from=&to=`, at most 120 days): occurrences and events together, cancelled ones listed with `cancelled`. Coaches cancel (refused with 409 while something is linked), move, add a one-off, and add a note or photo for an archer. The slot editor is in the team settings. The screen has a "List | Month" toggle (the choice is kept on the device, `agenda:mode`): the list is the last four and next eight weeks by day; the month is a grid (`MonthGrid.vue`, whole weeks from the locale's first weekday, up to three dots a day, cancelled ones hollow) that asks for the days of the grid only, and tapping a day lists its trainings below. Both use `AgendaDayList.vue` and `useAgendaActions.ts`, so the actions are the same; archers only get "Open". A multi-day event has a dot on every day it covers and says "until <date>". The days are device-local dates (`src/lib/calendar.ts`, stepped as calendar dates, so the 23 and 25 hour days of a time change stay one day); the server still computes the occurrences. Plan: [2026-10-31-calendar-view.md](../plans/2026-10-31-calendar-view.md).

## Rules worth knowing

- Slots and events are written by coaches and admins of the team, read by every member.
- The times of a slot cannot change in place once a later occurrence is a row (409): the app offers "change from <day>", which ends the old slot the day before and starts a new one.
- Deleting a slot keeps its rows as one-offs. A training from a slot is cancelled, not deleted.
- A merge of two sessions keeps the loser's `event` where the winner has none (`FILLED_FIELDS`). Claiming a profile and the account transfer carry the links along.

## Offline (phase 6)

- **The copy on the phone** (`src/lib/schedule-cache.ts`, `src/composables/useScheduleCache.ts`, store `schedule:<owner>`): your teams (`/api/teams/`), the server's agenda of all of them in one request from 31 days back to 88 days ahead (backdating and the agenda list both fit, under the 120-day limit), and the members of the teams you coach (id, name, role, `also_shoots`, managed; no address, no picture). The phone keeps what the server computed and never computes occurrences itself. Every pull replaces the whole copy, so a training cancelled or moved elsewhere and the trainings of a team you left are gone after it; a failed pull keeps it.
- **When**: on sign-in, when the app comes back to the front and when the connection returns (at most every five minutes), and at once after a schedule change here (`useSchedule`) or creating, joining or leaving a team (`useTeams.load`). Removed from the phone on sign-out (it holds other people's names; `addBeforeSignOut`) and with the account.
- **Readers**: `useTeams` (Team tab, tab bar) and `useAgenda` (the suggestions in the new session form, "Change" on a session, the note form, the media upload) read the copy, so all of them work offline and for sessions backdated up to a month. The teams a coach may write notes in for an archer come from the server, or from the cached members offline (`writableTeams`, the same rule as `note_teams`).
- **Agenda offline**: server first, the copy when the request fails or the server answers 5xx. Read only (no "+", no actions, nothing to tap), with the line "Saved on this phone, as of <time>"; a month outside the copy says it is not on the phone. Changes to the schedule stay online.
- **A link chosen offline** is an `EventLink` from the cached item (with `slot` and `date` for an occurrence that is no row yet) and is queued with the session, photo or note; the first upload that names it makes the row. A training cancelled after the phone saw it can still be linked.
- **A refused link** is the same for sessions, photos and notes: the item goes up again without the link and nothing stays failed. A date that is no longer an occurrence (the slot ended or pauses then) is answered on `event` (and `date`), like a training the archer can no longer use.

## Device calendar (#107, Android)

Settings, Teams: "Trainings in the phone's calendar" (a switch, with a reminder choice: none, 30 minutes, 1 hour, 1 day before). Turning it on asks for the calendar permission, makes a local calendar "Fletchr" (account name `fletchr`, no Google account, so it stays on this phone) and fills it from `GET /api/events/agenda/` (yesterday to 119 days ahead, all teams). Plan: `specs/plans/2026-10-31-device-calendar.md`.

- Every training and event that is not cancelled is one entry (not a repeating series: Android's calendar provider rejects cancelling one occurrence of a series in a local calendar, which a schedule needs for cancelled, moved and paused trainings). The agenda has every occurrence with its times, DST included, so the app does no date arithmetic.
- Every entry ends with a tag line `fletchr:event:<agenda id>:<hash>` in its description; the hash covers what we write. The phone's calendar therefore holds the state and a sync (`src/lib/device-calendar.ts`) is a diff: remove what is not wanted or changed, create what is missing. Entries without our tag, and entries before the window, are left alone.
- A sync runs after each schedule write on this phone, after leaving a team, on app start and resume (at most every 15 minutes), and when the reminder changes. One at a time. Turning the switch off, or signing out, deletes the calendar. Past trainings appear only from when the switch was turned on.
- Plugin: `@ebarooni/capacitor-calendar` (pinned), used only in `src/lib/device-calendar-native.ts`. The permissions `READ_CALENDAR` and `WRITE_CALENDAR` are in the manifest.

## Not built

Offline: the roster of the Team tab, the event view and every change to the schedule need a connection; the phone does not compute occurrences outside the cached window. Tournament results, group notes that every participant reads. An iCal feed per team (#106) is not planned: it needs a secret URL, a new way into the data; the device calendar (below) covers the need without one. A calendar over all of a person's teams is dropped until a coach with several teams asks (Phase 4 of the plan).
