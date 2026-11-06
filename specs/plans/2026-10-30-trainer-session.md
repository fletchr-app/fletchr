# Team schedule and training events: shared label for sessions, notes and media (#104)

Status: phases 1 to 5 implemented (PR for #104); phase 6 (offline) implemented 2026-11-06 (19929f7, in Unreleased); its checklist below is not ticked yet
Date: 2026-10-30
Updated: 2026-10-30 (reworked after the design discussion: events are a shared label, not a shared session); 2026-11-05 (Phase 6 rewritten)

## Scope

- A team gets a **schedule** of weekly `TrainingSlot`s. Their occurrences are computed, not stored.
- A **`TrainingEvent`** is a real row: a materialised (or cancelled, or moved) occurrence of a slot, or a one-off (tournament, extra training, camp).
- **No shared session.** Each archer keeps their own `TrainingSession`; `TrainingSession.event` links it to an event. Coach notes and media carry `event` too. A session linked to an event shows that archer's notes and media of the event.
- **Linking is explicit.** The app suggests an event by time, the user confirms or picks "None". Nothing is linked by overlap alone.
- **Lazy materialisation**: an occurrence becomes a row the first time something links to it, or when it is cancelled or moved. Id `uuid5(slot.id, date)` plus unique `(slot, date)`.
- Coach UI: agenda per team and a slot editor in team settings.
- Online first; offline (cached schedule, suggestions and links without a connection) in Phase 6, which builds the team cache of #84.
- Out of scope: calendar grid and iCal feed (#106), results and rankings of tournaments, group notes that every participant reads, statistics per event, evaluations linked to an event.

Markers: **[fact]** checked in the code, **[inferred]** my reading, not checked by running anything, **[check]** verify before relying on it.

## What is there already (checked in the code)

- `TrainingSession` (`server/training/models.py`): UUID pk made by the app, `owner`, `opened_by`, `type` (`scoring | volume | technique | competition`, empty for a coach-opened one), `started_at`, `ended_at`, `location`, `updated_at` **[fact]**. Migrations up to `training/0002_open_sessions` **[fact]**.
- `SessionDetailView.put` (`training/views.py`): create or update, safe to repeat; modes `full` (owner, or coach of a managed profile via `can_write_sessions_of`), `metadata` (the coach who opened it, `COACH_FIELDS`), `fill` (repeat to a merged id) **[fact]**. Runs `merge_if_possible` when times change **[fact]**.
- `training/merge.py`: `merge()` moves `Media` and `Note` by `session`, copies `FILLED_FIELDS` (no `event`) where the winner is empty; `OPEN_SESSION_CAP = 4 h` **[fact]**.
- `Note` (`server/notes/models.py`): **int pk**, `team` required (`CASCADE`), `author`, `archer`, `session`/`end` (`SET_NULL`), `media` (`CASCADE`), visibility `private | coach_only | shared`, `created_at`, no time field of its own **[fact]**. Migrations up to `notes/0005_media_cascade` **[fact]**.
- `NoteSerializer.validate`: only coaches; team from `note_teams(coach, archer)`; a note on media copies `media.session`; `IMMUTABLE` = team, archer, session, end, media, frame, time_ms **[fact]**. `NoteViewSet`: POST/PATCH/DELETE, no PUT; `NoteFilter` Meta fields only **[fact]**. Read rule in `get_queryset`: coaches of the team see all but others' private notes, the archer sees `shared` notes about them **[fact]**.
- `Media` (`server/media/models.py`): UUID pk made by the app, `owner`, `uploaded_by`, `session` (`SET_NULL`), `taken_at`, no team **[fact]**. Only `media/0001_initial` **[fact]**. `visible_media`, `can_add_for`, `can_change` in `media/access.py` **[fact]**.
- #91's move code is inline in `MediaDetailView.put`: on a session change it saves the clip and runs `media.coach_notes.update(session=media.session, end=None)` in one transaction **[fact]**.
- `core/access.py`: `teams_of`, `is_coach_in`, `is_admin_in`, `archers_visible_to`, `note_teams` **[fact]**. `Team` has `name`, `show_ranking`, no time zone **[fact]**. `TeamMember.role` `archer | coach | admin`, `also_shoots` **[fact]**.
- `core/transfer.py` lists every FK to User, guarded by `test_transfer_guard.py` **[fact]**. The new models below add no FK to User, so nothing to add there **[inferred]**.
- Server `TIME_ZONE = "UTC"`, `USE_TZ = True` **[fact]**. `tzdata` is in `uv.lock` only for Windows, and the image is `python:3.14-slim` **[fact]**; whether the slim image has `/usr/share/zoneinfo` **[check]**. Safer: add `tzdata` as a dependency.
- App: sessions are created on the device (`NewSessionView.vue` → `useLog().startSession`) and uploaded by `log-sync.ts` with `PUT /api/sessions/<id>/` **[fact]**. `LogSession` leaves out fields the user did not set, so an upload does not clear the server's value (`gear`, `details`) **[fact]**.
- App: `NewNote.vue` posts `archer`, `team`, `session`, `media`/`frame`/`time_ms`/`drawing` **[fact]**; `NotesSection` lists `?archer=&session=` **[fact]**; `MediaView.where()` gives `{ owner, session }` for the queue **[fact]**; `UnattachedHint` lists `without_session` media around the session time **[fact]**; `useMoveMedia` and `SessionPicker` exist (#91) **[fact]**.
- App: history lists are `TrainingListView` (own) and `ArcherSessionsView` (coach), both via `sessionRows(local, remote, gone)` in `src/lib/session-rows.ts` **[fact]**. Team settings: `TeamManageView.vue` (`/team/:id`) **[fact]**; Team tab: `TeamListView` with `TeamOverview` **[fact]**.
- App has no `uuid` package; `src/lib/uuid.ts` wraps `crypto.randomUUID` **[fact]**. The app gets virtual ids from the server (see API), so it needs no uuid5 **[inferred]**.
- `CHANGELOG.md` exists **[fact]**. ADRs 0001 to 0005 exist; 0006 and 0007 are reserved by the offline-sync plan **[fact]**.

## Changes from issue #104

The issue text is outdated in these points:
- It describes one coach-started `TrainingEvent` (team, coach, started_at, ended_at) that the coach starts and ends live. Now: a team schedule of slots, computed occurrences, and event rows made lazily or for one-offs. No "start/stop" and no `coach` field.
- "While an event is active, notes and media get `event` set": now the app **suggests** the event by time and the coach confirms or changes it; nothing is set implicitly.
- "An archer's session with that event shows the rows": still true, but the session link is chosen by the archer at session creation (suggested), not set by the coach.
- "Session merges need no extra handling": wrong. `TrainingSession.event` is lost in a merge unless `event_id` joins `FILLED_FIELDS`.
- "Trainer session <date>" entry: replaced by event rows in history (event name and date) for items whose archer has no linked session; managed profiles need no session at all.
- The open questions 1 to 4 are answered: one team per event; participation is derived from links (no participant list); explicit link with suggestion; visibility stays per note.

## Data model (server)

`training/models.py`:
- [x] `TrainingSlot`: `id` UUID pk (app-made, `editable=False`), `team` FK `core.Team` (`CASCADE`, `related_name="slots"`), `weekday` (0 = Monday to 6), `start_time`, `end_time` (local `TimeField`s), `time_zone` (IANA name, max 64, validated with `zoneinfo.ZoneInfo`), `location` (150, blank), `name` (100, blank, e.g. "Squad"), `valid_from` (date), `valid_until` (date, null), `pause_from`/`pause_until` (dates, null, both or none), `created_at`, `updated_at` (`auto_now`). `end_time <= start_time` is refused (no slot over midnight) **[inferred]** good enough for trainings.
- [x] `TrainingEvent`: `id` UUID pk, `team` FK (`CASCADE`, `related_name="events"`), `kind` (`training | competition | camp`), `name` (150, blank), `start`, `end` (aware datetimes, `end > start`, may span days), `location` (150, blank), `time_zone`, `slot` FK `TrainingSlot` (`null=True`, `SET_NULL`, `related_name="events"`), `date` (null; the occurrence date in the slot's time zone), `cancelled` (bool), `created_at`, `updated_at`. Constraints: `UniqueConstraint(fields=["slot", "date"], condition=Q(slot__isnull=False))`; `CheckConstraint`: `slot` and `date` both set or both null. Ordering `start`.
- [x] `TrainingSession.event` FK `TrainingEvent` (`null=True, blank=True, SET_NULL, related_name="sessions"`). No uniqueness per archer and event: a multi-day tournament has one session per day **[inferred]**.

`training/schedule.py` (new, no views):
- [x] `occurrence_id(slot_id, date)`: `uuid.uuid5(slot_id, date.isoformat())`.
- [x] `occurrences(slots, start_date, end_date)`: per slot every date with the right weekday inside `valid_from`/`valid_until`, outside the pause; start and end from `datetime.combine(date, time, ZoneInfo(tz))`, so DST does not shift the local time.
- [x] `agenda(teams, start, end)`: occurrences merged with real events of those teams; a row with the same `(slot, date)` replaces the virtual one; cancelled rows stay in the list with `cancelled=True` (the agenda shows them, suggestions skip them).
- [x] `materialise(slot, date)`: `get_or_create(slot=slot, date=date, defaults={id: occurrence_id(...), team, kind="training", name=slot.name, start, end, location, time_zone})` in `transaction.atomic`; on `IntegrityError` (two phones at once) read the existing row. Refuses a date that is not an occurrence of the slot.
- [x] `resolve_event(event_id, slot_id, date, user)`: the event row for a write that names an event: existing row, or `materialise` when `slot_id`/`date` are given and `event_id == occurrence_id(slot_id, date)`; otherwise 400. Shared by sessions, notes and media.

`notes/models.py`, `media/models.py`:
- [x] `Note.event`, `Media.event`: FK `training.TrainingEvent`, `null=True, blank=True, SET_NULL, related_name="notes"` / `"media"`.
- [x] `Note.at`: `DateTimeField(default=timezone.now)`: what time the note is about (defaults to now, can be set to a past time). Backfilled from `created_at`.

Migrations (numbers collide with the offline-sync plan, see Risks):
- [x] `training/0003_schedule.py`: `TrainingSlot`, `TrainingEvent`, `TrainingSession.event`, constraints.
- [x] `notes/0008_note_event_at.py`: `event`; `at` added nullable, `RunPython` copies `created_at`, then not null with default.
- [x] `media/0002_media_event.py`.
- [x] `tzdata` in `server/pyproject.toml` (`uv add tzdata`) unless the image check shows zoneinfo is there.

Other server places:
- [x] `training/merge.py`: `"event_id"` in `FILLED_FIELDS`. Both with different events: the winner keeps its own; the loser's notes and media keep their `event`.
- [x] `core/claims.py` `claim_profile`: nothing to change, links ride along with the rows **[inferred]**; covered by a test.
- [x] `privacy/export.py`: `event` (id, name, start) on exported sessions, notes and media. `privacy/services.py` delete: nothing extra (events and slots belong to the team) **[inferred]**.
- [x] Admin: register `TrainingSlot`, `TrainingEvent` (list: team, kind, start, cancelled).

## API (serializers, views, access)

Access (`core/access.py`):
- [x] `can_plan(user, team)`: `is_coach_in(user, team)` (coach or admin). Writes slots and events, cancels, moves.
- [x] `visible_teams_for_schedule(user)` = `teams_of(user)`: every member reads the team's slots and events.
- [x] `can_tag(user, event, archer)`: `event.team in note_teams(user, archer)` for coaches; for the archer themselves (own session or own media): a member of `event.team`.

Slots (`training/views.py`, `serializers.py`, `urls.py`):
- [x] `GET /api/slots/?team=`: members of the team.
- [x] `PUT /api/slots/<uuid>/`: create or update, safe to repeat; `can_plan`. Times, weekday, time zone change only while no future occurrence is materialised; otherwise 409 with "end this slot and add a new one from <date>" (Q1 below). `valid_until`, pause, name, location can always change.
- [x] `DELETE /api/slots/<uuid>/`: `can_plan`. Materialised events stay as one-offs (`slot` null, `date` null by the check constraint, so the delete clears `date` in the same transaction).

Events:
- [x] `GET /api/events/agenda/?team=&from=&to=`: `agenda()` for the given team or all the user's teams; range at most 120 days. Each item: `id` (the uuid5 for a virtual one), `virtual`, `slot`, `date`, `team`, `team_name`, `kind`, `name`, `start`, `end`, `location`, `time_zone`, `cancelled`. Used by the agenda and the suggestions.
- [x] `GET /api/events/<uuid>/`: a real event; members of the team, else 404.
- [x] `PUT /api/events/<uuid>/`: `can_plan`. One-off: create or update. Occurrence: body has `slot` and `date`; id must be `occurrence_id`; creates by `materialise` and applies the changes (move: new `start`/`end`/`location`; `slot` and `date` stay, so the virtual occurrence stays replaced). `cancelled: true` is 409 when the event has linked sessions, notes or media ("Move it instead"). `end <= start` 400.
- [x] `DELETE /api/events/<uuid>/`: `can_plan`, one-offs only and only without links (409 otherwise); a materialised occurrence is cancelled, not deleted.
- [x] `GET /api/events/<uuid>/archers/`: coaches of the team: per archer of the event (linked session, or a note or media row with this event) the linked session ids and counts of notes and media. Archers get 403.
- [x] `GET /api/events/mine/?archer=&from=&to=`: events that have rows **the requester may see** about that archer and no linked session of that archer, with counts. Notes counted through the same Q as `NoteViewSet.get_queryset`, media through `visible_media`. Feeds the history rows; a coach-only note alone never lists an event for the archer.

Sessions:
- [x] `SessionWriteSerializer.event` (nullable, writable) plus write-only `event_slot`, `event_date`, resolved by `resolve_event`. The owner sets it; `event` joins `COACH_FIELDS` so the coach who opened the session can set it. Leaving the field out keeps the server's value (partial semantics of the current PUT for unsent fields **[check]**). The owner must be a member of `event.team` (archer or coach with `also_shoots`), else 400.
- [x] `SessionSerializer`, `SessionSummarySerializer`: `event` and read-only `event_info` (`name`, `kind`, `start`, `team_name`).
- [x] `SessionFilter.event`.

Notes (`notes/serializers.py`, `notes/views.py`):
- [x] `NoteSerializer`: `event` (+ write-only `event_slot`, `event_date`) and `at`. On create: `can_tag`; `team` defaults to `event.team` and must equal it if sent. `event` is changeable by the author (PATCH, not in `IMMUTABLE`): it is a label, not a place. A note on a photo or frame copies `media.event` when no event is sent (next to the copy of `media.session`).
- [x] `NoteFilter`: `event`, `at_after`, `at_before`, and a custom `session` method: `Q(session=s) | Q(event=s.event_id, archer=s.owner_id, session__isnull=True)` when `s.event_id` is set; merged ids resolved via `resolve_session_id` (today `session` is a `ModelChoiceFilter` that would 400 on a merged id **[inferred]**).
- [x] Coach-only notes do not reveal anything new: the archer reads events of their teams anyway; counts and lists for the archer only include notes they may read (the queryset above).

Media (`media/serializers.py`, `media/views.py`, `media/access.py`):
- [x] `MediaWriteSerializer.event` (+ `event_slot`, `event_date`): on create, and on a repeat as a third changeable field beside `note` and `session`. Requires `can_tag(request.user, event, owner)`. When the clip's event changes, its notes without their own event follow (same transaction).
- [x] `MediaSerializer.event` read-only; `MediaFilter`: `event`, the same custom `session` method as notes, `not_in_event` (UUID) so `UnattachedHint` skips clips already shown through the link.

Afterwards:
- [x] Help texts on every new field (they land in the API types).
- [x] `npm run types:api` (regenerates `src/lib/openapi.yaml` and `src/lib/api-types.ts`).

## How reading works

- **Linked session** (`SessionDetailView`, `TrainingSessionView`): `NotesSection` asks `?archer=&session=`, the media link `?session=`; both include the event rows of that archer through the server filter. No list changes in the app; one line "Training: <name>, <date>" with Change/Unlink for the owner.
- **Archer opted out, or managed profile without a session**: `GET /api/events/mine/?archer=` gives events with visible rows and no linked session; they become history rows (`sessionRows`, new `events` argument) labelled with the event name or kind and the date, `to: /events/<id>?archer=<id>`. Items with neither event nor session stay where they are today (media "Not in a session", notes on the archer page).
- **Event view** `EventView.vue` (`/events/:id`): coach without `?archer=`: event header, the archers from `/archers/` with links, all notes (`?event=`) and media (`?event=`) they may see. With `?archer=` (archer or coach): that archer's notes and media of the event, plus "Put into a session" (manual attach, Phase 5).
- Merge, claim and transfer keep every link because nothing is copied, plus the `FILLED_FIELDS` line **[inferred]**.

## App

`src/lib/` (no Vue):
- [x] `src/lib/schedule.ts`: `suggestEvents(agenda, at, opts)`: non-cancelled items whose `[start, end]` contains `at` (for a session: the session's own `[started_at, ended_at]` overlaps the event's `[start, end]`; a session being created has only its start, so it is `[start, start]`). The archer's own times are never changed by the event. **Known gap [inferred]:** an archer who starts before the event begins and has no end yet gets no suggestion; the event can be linked afterwards (Phase 5 attach), or the suggestion re-offered when the session ends; several teams give several; `opts.preferKind` puts `competition` first for a competition session; sorted by start. Message keys for kind labels. No time-zone arithmetic here: the server computes occurrences.
- [x] `log-model.ts`: `LogSession.event?: { id: string; slot?: string; date?: string } | null` (left out when not chosen, like `gear`); `updateSession` patch allows `event`.
- [x] `log-sync.ts`: sends `event`, `event_slot`, `event_date` when set; `null` when the user chose "None" after a link.
- [x] `media-queue.ts`: `QueuedMedia.event?`, `event_slot?`, `event_date?`; `mediaForm` appends them.
- [x] `session-rows.ts`: `events` argument, rows of kind `event`.

Composables:
- [x] `src/composables/useAgenda.ts`: `useRemote` around `GET /api/events/agenda/` for the user's teams, today minus 1 day to plus 8 weeks; one shared instance for the suggestion screens.

Archer side (Phase 2):
- [x] `NewSessionView.vue`: after type and time, a `ChipGroup` "Training" with the suggestions from `suggestEvents(agenda, start)` plus "None". Default: the single suggestion when there is exactly one, else nothing chosen **[inferred]** (Q2). Hidden when the agenda has nothing or is not loaded (offline). Also for `?open=1` (coach opens for an archer): suggestions from the archer's teams that the coach shares.
- [x] `TrainingSessionView.vue` and `SessionDetailView.vue`: event line, "Change" (same chips) and "None".

Coach side (Phase 3):
- [x] `NewNote.vue`: optional `at` (now by default, a time picker for "about earlier"); event chips from `suggestEvents(agenda, at)` filtered to teams in `writable` (`/api/notes/teams/`), plus "None"; when an event is picked, the team chip follows the event's team. On a session screen the session's event is preselected.
- [x] `NoteRow.vue`: event shown and changeable by the author.
- [x] `MediaView.vue` `where()`: adds the suggested event for `taken_at` when no session is given; a chip on the upload sheet to change it. 400 on `event` (archer left the team) drops the event and resends **[inferred]**, like `withoutSession`.
- [x] `MediaPlayerView.vue`: event line, change.
- [x] `UnattachedHint.vue`: `not_in_event=<session.event>`.
- [x] `TrainingListView.vue`, `ArcherSessionsView.vue`: fetch `/api/events/mine/?archer=` and pass to `sessionRows`.
- [x] `EventView.vue` and route `/events/:id` in `src/router/index.ts` (`meta.title`, `meta.auth: 'in'`); read `route.params`/`route.query` once in setup.

Agenda and slot editor (Phase 4):
- [x] `AgendaView.vue` (`/team/:id/agenda`): upcoming 8 weeks and the past 4 weeks, by day; tap opens a sheet: Cancel (refused with the server's message when linked), Move (start, end, location), Add note / Add media (to the archer picker of the team, event preselected), Open event. "+" adds a one-off (kind, name, start, end, location). Link from `TeamOverview` and `TeamManageView`.
- [x] `SlotEditor` section in `TeamManageView.vue` for coaches: list of slots, add/edit (weekday, start, end, location, name, time zone defaulting to `Intl.DateTimeFormat().resolvedOptions().timeZone`, valid from/until, pause). On 409: offer "Change from <date>" (sets `valid_until` on the old slot, creates a new one).

i18n (`src/locales/en.ts`, `de.ts`, new blocks `schedule` and `event`; German wording to check with Tim):
- [x] `schedule`: `title`, `slots`, `addSlot`, `weekday`, `from`, `until`, `pause`, `timeZone`, `changeFrom`, `agenda`, `oneOff`, `cancel`, `cancelled`, `cancelRefused`, `move`, `noSlots`.
- [x] `event`: `kind.training` / `competition` / `camp`, `suggest` "Training", `none` "None", `linked`, `change`, `unlink`, `inHistory`, `archers` (plural), `notes`/`media` counts, `attach` "Put into a session".
- [x] Server texts via `gettext` (`server/locale/`, `de`): new validation and 409 messages. See `specs/steering/i18n.md`.

## Tests

Server (`cd server && uv run pytest`), new `training/tests/test_schedule.py`, `test_events.py`, plus additions:
- [x] `occurrences`: weekday, `valid_from`/`valid_until`, pause; a slot at 18:00 Europe/Berlin gives 16:00 UTC in summer and 17:00 UTC in winter (local 18:00 on both sides of the DST change).
- [x] `agenda`: a real row replaces its virtual occurrence; a cancelled one is listed with `cancelled`.
- [x] `materialise`: repeat gives one row with id `occurrence_id`; two concurrent calls (simulated `IntegrityError`) give one row; a wrong date 400; a wrong id for slot/date 400.
- [x] Access: archer reads slots and agenda of their team, 404 for another team; archer `PUT` slot/event 403; coach of the team may; coach of another team 404.
- [x] Cancel with a linked session, note or media: 409. Move keeps `slot`/`date`. Delete slot: events stay, `slot` and `date` null.
- [x] Session `PUT` with `event` + `event_slot`/`event_date`: materialises and links; repeat links once; owner not in the team 400; field left out keeps the link; coach-opened session may set it.
- [x] Note with `event`: team from the event; archer not in the team 400; `at` defaults to now; PATCH `event` by the author; frame note copies the clip's event.
- [x] Media with `event`: allowed for an archer of the team; change on repeat moves its notes' event.
- [x] `?session=` lists for notes and media include the owner's event rows without a session; never another archer's rows; visibility unchanged (archer sees only `shared`).
- [x] `events/mine/`: an event with only coach-only notes is not listed for the archer, is for the coach; a linked session hides it.
- [x] Merge: loser with `event`, winner without: winner gets it (`test_merge.py`).
- [x] Claim of a managed profile keeps session, note and media links.
- [x] `test_transfer_guard.py` stays green.

App (Vitest, `npm test`):
- [x] `schedule.test.ts`: overlap edges, cancelled skipped, several teams, competition first.
- [x] `session-rows.test.ts`: event rows sorted with sessions.
- [x] `log-sync.test.ts`: `event` sent only when set, `null` after "None".
- [x] `media-queue.test.ts`: `mediaForm` sends the event fields; 400 on `event` drops it and resends.
- [x] `locales` parity test covers the new keys; `npm run type-check`.

Phone: team with two slots, an archer in two teams picks one of two suggestions; a coach adds notes and a photo to three archers at the same training (one linked, one opted out, one managed profile); cancel refused after that; DST week checked in the agenda.

## Docs

- [x] `specs/design/schedule-and-events.md` (new): slots, occurrences, lazy materialisation, explicit links and suggestions, reading rule, visibility, tournaments, offline. Add to `specs/design/index.md`.
- [x] `specs/design/data-model.md`: slots, events, `event` on sessions, notes, media, `Note.at`; fix the notes visibility list (`private` is missing **[fact]**).
- [x] `specs/design/roles-and-access.md`: who edits the schedule, who reads it, who tags rows.
- [x] `specs/design/media-and-video-player.md`, `specs/design/screens.md`: event chips, agenda, event view, history rows.
- [x] ADR `0008-events-are-labels.md` (after the offline-sync plan's 0006/0007): Context, Considered Options (coach-created per-archer sessions, one shared session, time-window matching, label plus explicit link), Decision, Consequences. Update `specs/adrs/index.md`.
- [x] `CHANGELOG.md`: feature, new endpoints, migrations, `tzdata`, "old apps show event rows on linked sessions but cannot choose events".
- [x] `SELFHOSTING.md`: nothing unless `tzdata` changes the image **[inferred]**.

## Phases

### Phase 1: server models, materialisation, API (ships alone)

- [x] Models, migrations, `schedule.py`, `tzdata`, admin, `FILLED_FIELDS`, export.
- [x] Slot and event endpoints, agenda, `archers/`, `mine/`.
- [x] `event` on sessions, notes, media; `Note.at`; filters with the linked rows; `not_in_event`.
- [x] Tests; `npm run types:api`.

### Phase 2: archer links a session (online)

- [x] `schedule.ts`, `useAgenda`, `LogSession.event`, `log-sync` fields.
- [x] Suggestion in `NewSessionView`; event line and change on both session screens.
- [x] Slots are created in the Django admin until Phase 4 **[inferred]** acceptable for a first test team.

### Phase 3: coach notes and media, history, event view

- [x] `NewNote` (`at`, event chips), `NoteRow`, `MediaView`/`MediaPlayerView` event, queue fields, `UnattachedHint` filter.
- [x] History rows from `events/mine/`; `EventView` and route; locales.

### Phase 4: agenda and slot editor

- [x] `AgendaView`, cancel/move/one-off, slot section in `TeamManageView`; locales.

### Phase 5: manual attach (#91 refactor)

- [x] Extract `move_to_session(media, session)` from `MediaDetailView.put` into `media/moves.py`; behaviour pinned by the #91 tests (`test_media.py`, `test_frame_notes.py`).
- [x] `POST /api/events/<uuid>/attach/` `{ archer, session }`: sets `session` on that archer's event rows without one (notes `.update`, media through `move_to_session`); rows keep `event`. Owner of the session or a coach of `event.team`; idempotent.
- [x] "Put into a session" on `EventView` (`SessionPicker`). Moves earlier only if Phase 3 shows the opt-out case needs it.

### Phase 6: offline

Rewritten 2026-11-05 after a phone test (Dev app, signed in as a coach, server not reachable): Home, the training list, the new-session form and gear fill from the device; the Team tab is blank, so the agenda cannot be reached; the new-session form has no "Training" row although a training covers the time (online it is offered and preselected). Not tested: notes and photos queued with a link and their upload; linking an offline session to its training afterwards.

Depends on: offline-sync Phase 1b (done **[fact]**) and the team cache of its Phase 2, which that plan marked optional. **The team cache is now required** and is built in this phase (offline-sync plan updated).

What is there already:
- [x] App-made note ids and `PUT /api/notes/<uuid>/` are built (offline-sync Phase 1b) **[fact]**: `note-sync.ts` `sendNote`, queue in `useNotes`. The old line here said they were not.
- [x] The link rides in every queue: `LogSession.event`, `QueuedMedia.event`, `QueuedNote.event` are an `EventLink` (`id`, plus `slot` and `date` for an occurrence that is no row yet, from `linkOf`) **[fact]**. `log-sync.ts`, `media-queue.ts` (`appendEvent`) and `note-sync.ts` send `event`, `event_slot`, `event_date` **[fact]**.
- [x] No event queue: the first upload that names an occurrence makes the row (`resolve_event` → `materialise`, `get_or_create` on `(slot, date)`, id `uuid5`), later ones find it **[fact]**.
- [x] Upload order: sessions, then photos and clips, then notes; a note waits for its photo or session (`useNotes.blocked`), a photo for its session **[fact]**.
- [x] Refused link **[fact]**: a 400 with an `event` key makes a session (`log-sync.ts` `withoutEvent` → `dropEvent`, since 317dc32) and a photo or clip (`media-queue.ts`) upload again without the link. A note is marked failed with the server's message and stays on the phone (`note-sync.ts`). So "a session is not retried without its event, a photo is" (design doc) is stale: today it is the note that is not.
- [x] `materialise` refuses a date that is no longer an occurrence (slot ended by "change from <date>", or paused) with a 400 on `date`, not on `event` (`training/schedule.py`) **[fact]**. None of the three queues reads that as a refused link, so the item is marked failed **[fact]**. A deleted slot gives "No such event" on `event` **[fact]**.
- [x] A training cancelled after the phone saw it can still be linked: `resolve_event` does not look at `cancelled` **[fact]**.

Gaps found in the code:
- `useAgenda` keeps the agenda in memory only, from yesterday to 8 weeks ahead **[fact]**. Cold start offline: nothing to suggest (the phone test). Also online: a session backdated by more than a day (allowed up to `MAX_BACKDATE_DAYS` = 31) gets no suggestion, and neither does "Change" on an older session (`SessionEvent`) **[fact]**.
- `useTeams` is in memory only **[fact]**: cold start offline gives an empty Team tab.
- `AgendaView` reads the team, the agenda and the members with `useRemote`, no copy **[fact]**.
- A coach's chips for another archer (`NewSessionView ?for=`, `MediaView ?owner=`, `NewNote`) are filtered by `GET /api/notes/teams/?archer=` **[fact]**. Offline that answer is missing: no chips, and `NotesSection` hides the note form for another archer altogether **[fact]**. See Q3.

Cache (the team cache of offline-sync Phase 2):
- [x] New store `schedule` (`StoreName` in `store-owner.ts`, key `schedule:<owner>` like the other stores, through `useKeyedStore`). Holds `{ teams, members, agenda, from, to, pulledAt }`; only for an account (no key in local mode). Composable `useScheduleCache.ts`.
- [x] `teams`: `GET /api/teams/` (your teams with `my_role`). Own teams only, no roster stats. Members: see Q3.
- [x] `agenda`: `GET /api/events/agenda/` without `team` (all your teams, one request), window today − 31 days to today + 88 days (Q2). These are the server's occurrences merged with the event rows, so cancelled and moved trainings are in it.
- [x] Full replace on every pull, no deltas: a training cancelled or moved elsewhere, and a team you left, are gone after the next pull (problem 4 of the offline-sync plan). A failed pull keeps the copy.
- [x] The phone does not compute occurrences from cached slots; it keeps the server's agenda (Q1). No slot cache.
- [x] Pure part `src/lib/schedule-cache.ts` (no Vue): `pulled(pull, at)` (a full replace needs no old state), `itemsFor(state, { team?, from, to })`, `covers(state, from, to)`, plus `noteTeams(state, archer)` (Q3) and `pullSchedule(api, at)` (teams, agenda, then members of coached teams; null when any request fails).
- [x] Kept under its owner key on sign-out, like the libraries; removed with the account (`log.onAccountDeleted`) (Q7). Done the other way, as Q7 says once Q3 adds members: removed on sign-out (`addBeforeSignOut`, now a list) and with the account.

When it is pulled:
- [x] One pull, teams then agenda **[inferred]** (a team you left drops its trainings in the same step): on sign-in, on resume (`appStateChange`), on reconnect (`networkStatusChange`), the same triggers as `useLog` and `useMediaLibrary`. Keep the 5 min max age, except after a schedule write (`useSchedule.changed`) and after creating, joining or leaving a team (`useTeams.load`).
- [x] `useAgenda` and `useTeams` read the store at start, so the copy is there before the first pull answers.

Suggestions and links:
- [x] `useAgenda.suggest` reads the cached items. `NewSessionView`, `SessionEvent` (link afterwards), `NewNote` and `MediaView` already show the chips when something is suggested **[fact]**, so they need no change of their own **[inferred]**.
- [x] A link chosen offline is an `EventLink` from the cached item, with `slot` and `date` for a virtual one **[fact]** (`linkOf`); it is queued with the session, photo or note as today.
- [x] Coach for another archer: the teams to offer come from the cache (Q3).
- [x] Refused link: one rule for sessions, photos and notes (Q4).

Agenda screen:
- [x] `TeamListView` lists the cached teams; the roster in `TeamOverview` stays online **[check]** what it shows offline (expected: its "could not load" line). Roster offline not checked on a phone.
- [x] `AgendaView` offline: read-only from the cache, filtered by team, list and month modes. A muted line "Saved on this phone, as of <time>" (like `notes.offlineList`); a month outside the window says it is not on the phone. Detection as in `useNoteLibrary.list`: server first, the copy when the request fails.
- [x] Hidden offline: "+", Cancel, Move, Add note, Add media, Open event (`EventView` is online, and `useAgendaActions.row` makes a virtual training a row with a `PUT` before opening it **[fact]**).
- [ ] Connection banner (PR 147, may not be merged yet): the red banner says the server is out of reach; the agenda line says what is shown and from when. The line does not depend on the banner and does not repeat "no connection" **[inferred]**. Not done here: the banner (`useConnection`, `ConnectionBanner.vue`) is on `develop` but not on this branch; the agenda line is written without it.
- [x] Agenda edits (cancel, move, one-off, slots) stay online. `useSchedule` already answers "server not reachable" **[fact]**.
- [x] Locales: `schedule.savedAsOf`, `schedule.notOnPhone` (`en.ts`, `de.ts`).

Tests:
- [x] `schedule-cache.test.ts`: a pull replaces (a cancelled-elsewhere training and the trainings of a left team are gone), a failed pull keeps the copy, `itemsFor` by team and range, `covers`, the window stays under 120 days.
- [x] `store-owner.test.ts`: the `schedule` key.
- [x] `schedule.test.ts`: a cached virtual item gives a link with `slot` and `date`; a cancelled one is not suggested.
- [x] `note-sync.test.ts`: a refused link uploads the note without it (if Q4 as recommended). `log-sync.test.ts`, `media-queue.test.ts`: a 400 on `date` counts as a refused link, or the server test below. Server route taken, so `log-sync`/`media-queue` need no change (they already read `event`).
- [x] `useAgenda.test.ts` (new, mocks for `useAuth`, `local-store`, `@capacitor/app`, `@capacitor/network`, as in `useDeviceCalendar.test.ts`): start with the server unreachable suggests from the store; a pull writes the store; a failed pull keeps it; another owner starts empty; resume pulls again. Written as `useScheduleCache.test.ts` (it covers `useAgenda` and `useTeams` too).
- [x] Server (if Q4 takes the server route): `materialise` refusing a date is a 400 on `event`. `resolve_event` checks the date before `materialise`; test in `test_event_links.py`.
- [ ] Phone, Dev app, one online start, then airplane mode:
  - Team tab lists the teams; the agenda opens read-only with the "as of" line and no edit buttons.
  - New session at a training time: "Training" is offered and preselected. A session backdated two weeks is offered its training.
  - Coach: a note about an archer and a photo for them, both linked to the training; both wait. After reconnecting: session, photo, note go up in that order, the server has one event row, the event view shows both. (Untested case 1.)
  - A session made offline without a link, linked afterwards on its screen ("Change"), then reconnect: the link arrives. (Untested case 2.)
  - Refused link: end the slot in the browser with "change from", log offline at the old time, reconnect: the session uploads without the link, nothing stays failed (Q4).
  - Cold start with the server down but the network on (red banner): same results as airplane mode.

Open questions (recommended answers):
1. **Q1, occurrences on the phone or the server's agenda?** Cache the server's agenda. Computing on the phone needs a TypeScript copy of `occurrences`, `is_occurrence` and `occurrence_times` with IANA zones and DST, plus `uuid5` (SHA-1; the app has only `crypto.randomUUID` **[fact]**), and must stay equal to the server forever. It only pays for dates outside the window, which a training log rarely needs.
2. **Q2, window size.** Today − 31 days to today + 88 days: one request (the server allows 120 days **[fact]**), covers backdating (31 days) and the agenda list (4 weeks back, 8 ahead). The month view of a further month needs a connection. Also fixes the online gap for backdated sessions.
3. **Q3, coach notes about another archer offline.** With "own teams only, no roster" this does not work: the note form needs `notes/teams` **[fact]**, and the archer's page cannot even be reached with the Team tab's roster offline **[inferred]**. Recommended: also cache the members of the teams you coach (user id, name, role, `also_shoots`, from `/api/teams/<id>/members/`; no statistics). `note_teams` is "teams I coach where the person is an archer or a coach who shoots" **[fact]**, so the phone can work out the teams from that, and the agenda's "Add note / Add media" archer picker works offline too. If that is too much, accept that a coach writes offline notes only on screens opened before the connection went (Ionic keeps them alive) and say so in the plan.
4. **Q4, the server refuses a link.** Same rule for all three: upload without the link, keep the item, no failure. Notes get `withoutEvent` like sessions and photos (the note keeps its team). The server answers a date that is no longer an occurrence on `event`, not `date` (one line in `materialise` or `resolve_event`), so old apps benefit too. No notice: the item is still there, the link is a label, and the history shows it without one.
5. **Q5, link a session afterwards offline?** Yes: `SessionEvent` uses the same suggestions, the change is a queued session `PUT` **[fact]**. Covered by the window in Q2.
6. **Q6, a training cancelled after the phone cached it.** Accept the link (the server does today **[fact]**). The coach sees it on the cancelled training and can move it instead. Not worth a server rule.
7. **Q7, sign-out.** Keep the copy under its owner key (only your teams' schedule and your coached teams' members; another account never sees it). Offline-sync Q2 says caches of other people's data go on sign-out: if Q3 adds members, remove the store on sign-out instead (`setBeforeSignOut` holds only one hook today **[fact]**, `usePush` uses it, so it needs a list).
8. **Q8, size limit for the cached agenda?** No. About 17 weeks × a few slots per team, a few hundred items of a few hundred bytes **[inferred]**, under 100 KB. Revisit if a club with many teams shows up.

## Order

- [x] 1. Phase 1, `pytest`, `types:api`.
- [ ] 2. Phase 2, `type-check`, `npm test`, phone test. Release.
- [x] 3. Phase 3, release. Phase 4 can follow in the same release if small.
- [x] 4. Phase 5 when needed.
- [ ] 5. Phase 6 (offline-sync Phase 1b is done): Q1 to Q8 answered; then the `schedule` store and pull with `useTeams` and `useAgenda` on it (Team tab and suggestions offline); then the read-only agenda; then the refused-link rule (Q4). `type-check`, `npm test`, `pytest` if the server changes, the phone checklist in airplane mode. Release.
- [x] 6. Docs and `CHANGELOG.md` per phase.

## Risks

- **Two ways into a session** (direct `session`, or `event` plus a linked session): every list that filters by session must use the shared filter method. Keep one helper (`rows_of_session(qs, session)`) for notes, media and export **[inferred]**.
- **Slot edits after materialisation**: changing times would leave materialised rows on the old times. Mitigated by refusing in-place edits once future rows exist (Q1).
- **Time zones**: occurrences use the slot's zone; a phone in another zone sees times converted. `tzdata` must be present on the server **[check]**.
- **Suggestion is wrong or ignored**: an archer who picks "None" by habit loses the link; the event row in history and manual attach (Phase 5) cover it.
- **Changed `?session=` meaning** for old apps: they see event rows on a linked session (good) and cannot tell them apart **[inferred]**.
- **Cancel refused** when something is linked: a coach who tagged by mistake must change the tag first. The 409 text says which rows block it.
- **Migration numbers** collide with the offline-sync plan (`notes/0006_uid`, `media/0002_updated_at`); whichever lands second renumbers.
- **Multi-day events and `OPEN_SESSION_CAP`**: unrelated (merge uses session windows only) **[inferred]**.

## Decisions (answered 2026-10-30)

1. **Editing a slot that has materialised future rows.** Refuse the in-place edit (409) and offer "change from <date>": the old slot gets `valid_until`, a new slot starts on that date. Past rows keep their times. The archer's own session times are independent of the event times.
2. **Session suggestion.** Preselect when exactly one occurrence overlaps, else nothing; "None" always visible. Match by overlap of the session's own times with the event window, no extra margin.
3. **Guest archers at a tournament.** Out of scope. A guest joins the team (invite) or the coach keeps a managed profile.
4. **Orphan items without event and without session.** No new row type. They stay under "Not in a session" and on the archer page, grouped by day with a date heading.
