# Team schedule and training events: shared label for sessions, notes and media (#104)

Status: planned
Date: 2026-10-30
Updated: 2026-10-30 (reworked after the design discussion: events are a shared label, not a shared session)

## Scope

- A team gets a **schedule** of weekly `TrainingSlot`s. Their occurrences are computed, not stored.
- A **`TrainingEvent`** is a real row: a materialised (or cancelled, or moved) occurrence of a slot, or a one-off (tournament, extra training, camp).
- **No shared session.** Each archer keeps their own `TrainingSession`; `TrainingSession.event` links it to an event. Coach notes and media carry `event` too. A session linked to an event shows that archer's notes and media of the event.
- **Linking is explicit.** The app suggests an event by time, the user confirms or picks "None". Nothing is linked by overlap alone.
- **Lazy materialisation**: an occurrence becomes a row the first time something links to it, or when it is cancelled or moved. Id `uuid5(slot.id, date)` plus unique `(slot, date)`.
- Coach UI: agenda per team and a slot editor in team settings.
- Online first; offline (cached schedule, event notes) after #84 Phase 1b and its team cache.
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
- [ ] `TrainingSlot`: `id` UUID pk (app-made, `editable=False`), `team` FK `core.Team` (`CASCADE`, `related_name="slots"`), `weekday` (0 = Monday to 6), `start_time`, `end_time` (local `TimeField`s), `time_zone` (IANA name, max 64, validated with `zoneinfo.ZoneInfo`), `location` (150, blank), `name` (100, blank, e.g. "Squad"), `valid_from` (date), `valid_until` (date, null), `pause_from`/`pause_until` (dates, null, both or none), `created_at`, `updated_at` (`auto_now`). `end_time <= start_time` is refused (no slot over midnight) **[inferred]** good enough for trainings.
- [ ] `TrainingEvent`: `id` UUID pk, `team` FK (`CASCADE`, `related_name="events"`), `kind` (`training | competition | camp`), `name` (150, blank), `start`, `end` (aware datetimes, `end > start`, may span days), `location` (150, blank), `time_zone`, `slot` FK `TrainingSlot` (`null=True`, `SET_NULL`, `related_name="events"`), `date` (null; the occurrence date in the slot's time zone), `cancelled` (bool), `created_at`, `updated_at`. Constraints: `UniqueConstraint(fields=["slot", "date"], condition=Q(slot__isnull=False))`; `CheckConstraint`: `slot` and `date` both set or both null. Ordering `start`.
- [ ] `TrainingSession.event` FK `TrainingEvent` (`null=True, blank=True, SET_NULL, related_name="sessions"`). No uniqueness per archer and event: a multi-day tournament has one session per day **[inferred]**.

`training/schedule.py` (new, no views):
- [ ] `occurrence_id(slot_id, date)`: `uuid.uuid5(slot_id, date.isoformat())`.
- [ ] `occurrences(slots, start_date, end_date)`: per slot every date with the right weekday inside `valid_from`/`valid_until`, outside the pause; start and end from `datetime.combine(date, time, ZoneInfo(tz))`, so DST does not shift the local time.
- [ ] `agenda(teams, start, end)`: occurrences merged with real events of those teams; a row with the same `(slot, date)` replaces the virtual one; cancelled rows stay in the list with `cancelled=True` (the agenda shows them, suggestions skip them).
- [ ] `materialise(slot, date)`: `get_or_create(slot=slot, date=date, defaults={id: occurrence_id(...), team, kind="training", name=slot.name, start, end, location, time_zone})` in `transaction.atomic`; on `IntegrityError` (two phones at once) read the existing row. Refuses a date that is not an occurrence of the slot.
- [ ] `resolve_event(event_id, slot_id, date, user)`: the event row for a write that names an event: existing row, or `materialise` when `slot_id`/`date` are given and `event_id == occurrence_id(slot_id, date)`; otherwise 400. Shared by sessions, notes and media.

`notes/models.py`, `media/models.py`:
- [ ] `Note.event`, `Media.event`: FK `training.TrainingEvent`, `null=True, blank=True, SET_NULL, related_name="notes"` / `"media"`.
- [ ] `Note.at`: `DateTimeField(default=timezone.now)`: what time the note is about (defaults to now, can be set to a past time). Backfilled from `created_at`.

Migrations (numbers collide with the offline-sync plan, see Risks):
- [ ] `training/0003_schedule.py`: `TrainingSlot`, `TrainingEvent`, `TrainingSession.event`, constraints.
- [ ] `notes/0006_note_event_at.py`: `event`; `at` added nullable, `RunPython` copies `created_at`, then not null with default.
- [ ] `media/0002_media_event.py`.
- [ ] `tzdata` in `server/pyproject.toml` (`uv add tzdata`) unless the image check shows zoneinfo is there.

Other server places:
- [ ] `training/merge.py`: `"event_id"` in `FILLED_FIELDS`. Both with different events: the winner keeps its own; the loser's notes and media keep their `event`.
- [ ] `core/claims.py` `claim_profile`: nothing to change, links ride along with the rows **[inferred]**; covered by a test.
- [ ] `privacy/export.py`: `event` (id, name, start) on exported sessions, notes and media. `privacy/services.py` delete: nothing extra (events and slots belong to the team) **[inferred]**.
- [ ] Admin: register `TrainingSlot`, `TrainingEvent` (list: team, kind, start, cancelled).

## API (serializers, views, access)

Access (`core/access.py`):
- [ ] `can_plan(user, team)`: `is_coach_in(user, team)` (coach or admin). Writes slots and events, cancels, moves.
- [ ] `visible_teams_for_schedule(user)` = `teams_of(user)`: every member reads the team's slots and events.
- [ ] `can_tag(user, event, archer)`: `event.team in note_teams(user, archer)` for coaches; for the archer themselves (own session or own media): a member of `event.team`.

Slots (`training/views.py`, `serializers.py`, `urls.py`):
- [ ] `GET /api/slots/?team=`: members of the team.
- [ ] `PUT /api/slots/<uuid>/`: create or update, safe to repeat; `can_plan`. Times, weekday, time zone change only while no future occurrence is materialised; otherwise 409 with "end this slot and add a new one from <date>" (Q1 below). `valid_until`, pause, name, location can always change.
- [ ] `DELETE /api/slots/<uuid>/`: `can_plan`. Materialised events stay as one-offs (`slot` null, `date` null by the check constraint, so the delete clears `date` in the same transaction).

Events:
- [ ] `GET /api/events/agenda/?team=&from=&to=`: `agenda()` for the given team or all the user's teams; range at most 120 days. Each item: `id` (the uuid5 for a virtual one), `virtual`, `slot`, `date`, `team`, `team_name`, `kind`, `name`, `start`, `end`, `location`, `time_zone`, `cancelled`. Used by the agenda and the suggestions.
- [ ] `GET /api/events/<uuid>/`: a real event; members of the team, else 404.
- [ ] `PUT /api/events/<uuid>/`: `can_plan`. One-off: create or update. Occurrence: body has `slot` and `date`; id must be `occurrence_id`; creates by `materialise` and applies the changes (move: new `start`/`end`/`location`; `slot` and `date` stay, so the virtual occurrence stays replaced). `cancelled: true` is 409 when the event has linked sessions, notes or media ("Move it instead"). `end <= start` 400.
- [ ] `DELETE /api/events/<uuid>/`: `can_plan`, one-offs only and only without links (409 otherwise); a materialised occurrence is cancelled, not deleted.
- [ ] `GET /api/events/<uuid>/archers/`: coaches of the team: per archer of the event (linked session, or a note or media row with this event) the linked session ids and counts of notes and media. Archers get 403.
- [ ] `GET /api/events/mine/?archer=&from=&to=`: events that have rows **the requester may see** about that archer and no linked session of that archer, with counts. Notes counted through the same Q as `NoteViewSet.get_queryset`, media through `visible_media`. Feeds the history rows; a coach-only note alone never lists an event for the archer.

Sessions:
- [ ] `SessionWriteSerializer.event` (nullable, writable) plus write-only `event_slot`, `event_date`, resolved by `resolve_event`. The owner sets it; `event` joins `COACH_FIELDS` so the coach who opened the session can set it. Leaving the field out keeps the server's value (partial semantics of the current PUT for unsent fields **[check]**). The owner must be a member of `event.team` (archer or coach with `also_shoots`), else 400.
- [ ] `SessionSerializer`, `SessionSummarySerializer`: `event` and read-only `event_info` (`name`, `kind`, `start`, `team_name`).
- [ ] `SessionFilter.event`.

Notes (`notes/serializers.py`, `notes/views.py`):
- [ ] `NoteSerializer`: `event` (+ write-only `event_slot`, `event_date`) and `at`. On create: `can_tag`; `team` defaults to `event.team` and must equal it if sent. `event` is changeable by the author (PATCH, not in `IMMUTABLE`): it is a label, not a place. A note on a photo or frame copies `media.event` when no event is sent (next to the copy of `media.session`).
- [ ] `NoteFilter`: `event`, `at_after`, `at_before`, and a custom `session` method: `Q(session=s) | Q(event=s.event_id, archer=s.owner_id, session__isnull=True)` when `s.event_id` is set; merged ids resolved via `resolve_session_id` (today `session` is a `ModelChoiceFilter` that would 400 on a merged id **[inferred]**).
- [ ] Coach-only notes do not reveal anything new: the archer reads events of their teams anyway; counts and lists for the archer only include notes they may read (the queryset above).

Media (`media/serializers.py`, `media/views.py`, `media/access.py`):
- [ ] `MediaWriteSerializer.event` (+ `event_slot`, `event_date`): on create, and on a repeat as a third changeable field beside `note` and `session`. Requires `can_tag(request.user, event, owner)`. When the clip's event changes, its notes without their own event follow (same transaction).
- [ ] `MediaSerializer.event` read-only; `MediaFilter`: `event`, the same custom `session` method as notes, `not_in_event` (UUID) so `UnattachedHint` skips clips already shown through the link.

Afterwards:
- [ ] Help texts on every new field (they land in the API types).
- [ ] `npm run types:api` (regenerates `src/lib/openapi.yaml` and `src/lib/api-types.ts`).

## How reading works

- **Linked session** (`SessionDetailView`, `TrainingSessionView`): `NotesSection` asks `?archer=&session=`, the media link `?session=`; both include the event rows of that archer through the server filter. No list changes in the app; one line "Training: <name>, <date>" with Change/Unlink for the owner.
- **Archer opted out, or managed profile without a session**: `GET /api/events/mine/?archer=` gives events with visible rows and no linked session; they become history rows (`sessionRows`, new `events` argument) labelled with the event name or kind and the date, `to: /events/<id>?archer=<id>`. Items with neither event nor session stay where they are today (media "Not in a session", notes on the archer page).
- **Event view** `EventView.vue` (`/events/:id`): coach without `?archer=`: event header, the archers from `/archers/` with links, all notes (`?event=`) and media (`?event=`) they may see. With `?archer=` (archer or coach): that archer's notes and media of the event, plus "Put into a session" (manual attach, Phase 5).
- Merge, claim and transfer keep every link because nothing is copied, plus the `FILLED_FIELDS` line **[inferred]**.

## App

`src/lib/` (no Vue):
- [ ] `src/lib/schedule.ts`: `suggestEvents(agenda, at, opts)`: non-cancelled items whose `[start, end]` contains `at` (for a session: the session's own `[started_at, ended_at]` overlaps the event's `[start, end]`; a session being created has only its start, so it is `[start, start]`). The archer's own times are never changed by the event. **Known gap [inferred]:** an archer who starts before the event begins and has no end yet gets no suggestion; the event can be linked afterwards (Phase 5 attach), or the suggestion re-offered when the session ends; several teams give several; `opts.preferKind` puts `competition` first for a competition session; sorted by start. Message keys for kind labels. No time-zone arithmetic here: the server computes occurrences.
- [ ] `log-model.ts`: `LogSession.event?: { id: string; slot?: string; date?: string } | null` (left out when not chosen, like `gear`); `updateSession` patch allows `event`.
- [ ] `log-sync.ts`: sends `event`, `event_slot`, `event_date` when set; `null` when the user chose "None" after a link.
- [ ] `media-queue.ts`: `QueuedMedia.event?`, `event_slot?`, `event_date?`; `mediaForm` appends them.
- [ ] `session-rows.ts`: `events` argument, rows of kind `event`.

Composables:
- [ ] `src/composables/useAgenda.ts`: `useRemote` around `GET /api/events/agenda/` for the user's teams, today minus 1 day to plus 8 weeks; one shared instance for the suggestion screens.

Archer side (Phase 2):
- [ ] `NewSessionView.vue`: after type and time, a `ChipGroup` "Training" with the suggestions from `suggestEvents(agenda, start)` plus "None". Default: the single suggestion when there is exactly one, else nothing chosen **[inferred]** (Q2). Hidden when the agenda has nothing or is not loaded (offline). Also for `?open=1` (coach opens for an archer): suggestions from the archer's teams that the coach shares.
- [ ] `TrainingSessionView.vue` and `SessionDetailView.vue`: event line, "Change" (same chips) and "None".

Coach side (Phase 3):
- [ ] `NewNote.vue`: optional `at` (now by default, a time picker for "about earlier"); event chips from `suggestEvents(agenda, at)` filtered to teams in `writable` (`/api/notes/teams/`), plus "None"; when an event is picked, the team chip follows the event's team. On a session screen the session's event is preselected.
- [ ] `NoteRow.vue`: event shown and changeable by the author.
- [ ] `MediaView.vue` `where()`: adds the suggested event for `taken_at` when no session is given; a chip on the upload sheet to change it. 400 on `event` (archer left the team) drops the event and resends **[inferred]**, like `withoutSession`.
- [ ] `MediaPlayerView.vue`: event line, change.
- [ ] `UnattachedHint.vue`: `not_in_event=<session.event>`.
- [ ] `TrainingListView.vue`, `ArcherSessionsView.vue`: fetch `/api/events/mine/?archer=` and pass to `sessionRows`.
- [ ] `EventView.vue` and route `/events/:id` in `src/router/index.ts` (`meta.title`, `meta.auth: 'in'`); read `route.params`/`route.query` once in setup.

Agenda and slot editor (Phase 4):
- [ ] `AgendaView.vue` (`/team/:id/agenda`): upcoming 8 weeks and the past 4 weeks, by day; tap opens a sheet: Cancel (refused with the server's message when linked), Move (start, end, location), Add note / Add media (to the archer picker of the team, event preselected), Open event. "+" adds a one-off (kind, name, start, end, location). Link from `TeamOverview` and `TeamManageView`.
- [ ] `SlotEditor` section in `TeamManageView.vue` for coaches: list of slots, add/edit (weekday, start, end, location, name, time zone defaulting to `Intl.DateTimeFormat().resolvedOptions().timeZone`, valid from/until, pause). On 409: offer "Change from <date>" (sets `valid_until` on the old slot, creates a new one).

i18n (`src/locales/en.ts`, `de.ts`, new blocks `schedule` and `event`; German wording to check with Tim):
- [ ] `schedule`: `title`, `slots`, `addSlot`, `weekday`, `from`, `until`, `pause`, `timeZone`, `changeFrom`, `agenda`, `oneOff`, `cancel`, `cancelled`, `cancelRefused`, `move`, `noSlots`.
- [ ] `event`: `kind.training` / `competition` / `camp`, `suggest` "Training", `none` "None", `linked`, `change`, `unlink`, `inHistory`, `archers` (plural), `notes`/`media` counts, `attach` "Put into a session".
- [ ] Server texts via `gettext` (`server/locale/`, `de`): new validation and 409 messages. See `specs/steering/i18n.md`.

## Tests

Server (`cd server && uv run pytest`), new `training/tests/test_schedule.py`, `test_events.py`, plus additions:
- [ ] `occurrences`: weekday, `valid_from`/`valid_until`, pause; a slot at 18:00 Europe/Berlin gives 16:00 UTC in summer and 17:00 UTC in winter (local 18:00 on both sides of the DST change).
- [ ] `agenda`: a real row replaces its virtual occurrence; a cancelled one is listed with `cancelled`.
- [ ] `materialise`: repeat gives one row with id `occurrence_id`; two concurrent calls (simulated `IntegrityError`) give one row; a wrong date 400; a wrong id for slot/date 400.
- [ ] Access: archer reads slots and agenda of their team, 404 for another team; archer `PUT` slot/event 403; coach of the team may; coach of another team 404.
- [ ] Cancel with a linked session, note or media: 409. Move keeps `slot`/`date`. Delete slot: events stay, `slot` and `date` null.
- [ ] Session `PUT` with `event` + `event_slot`/`event_date`: materialises and links; repeat links once; owner not in the team 400; field left out keeps the link; coach-opened session may set it.
- [ ] Note with `event`: team from the event; archer not in the team 400; `at` defaults to now; PATCH `event` by the author; frame note copies the clip's event.
- [ ] Media with `event`: allowed for an archer of the team; change on repeat moves its notes' event.
- [ ] `?session=` lists for notes and media include the owner's event rows without a session; never another archer's rows; visibility unchanged (archer sees only `shared`).
- [ ] `events/mine/`: an event with only coach-only notes is not listed for the archer, is for the coach; a linked session hides it.
- [ ] Merge: loser with `event`, winner without: winner gets it (`test_merge.py`).
- [ ] Claim of a managed profile keeps session, note and media links.
- [ ] `test_transfer_guard.py` stays green.

App (Vitest, `npm test`):
- [ ] `schedule.test.ts`: overlap edges, cancelled skipped, several teams, competition first.
- [ ] `session-rows.test.ts`: event rows sorted with sessions.
- [ ] `log-sync.test.ts`: `event` sent only when set, `null` after "None".
- [ ] `media-queue.test.ts`: `mediaForm` sends the event fields; 400 on `event` drops it and resends.
- [ ] `locales` parity test covers the new keys; `npm run type-check`.

Phone: team with two slots, an archer in two teams picks one of two suggestions; a coach adds notes and a photo to three archers at the same training (one linked, one opted out, one managed profile); cancel refused after that; DST week checked in the agenda.

## Docs

- [ ] `specs/design/schedule-and-events.md` (new): slots, occurrences, lazy materialisation, explicit links and suggestions, reading rule, visibility, tournaments, offline. Add to `specs/design/index.md`.
- [ ] `specs/design/data-model.md`: slots, events, `event` on sessions, notes, media, `Note.at`; fix the notes visibility list (`private` is missing **[fact]**).
- [ ] `specs/design/roles-and-access.md`: who edits the schedule, who reads it, who tags rows.
- [ ] `specs/design/media-and-video-player.md`, `specs/design/screens.md`: event chips, agenda, event view, history rows.
- [ ] ADR `0008-events-are-labels.md` (after the offline-sync plan's 0006/0007): Context, Considered Options (coach-created per-archer sessions, one shared session, time-window matching, label plus explicit link), Decision, Consequences. Update `specs/adrs/index.md`.
- [ ] `CHANGELOG.md`: feature, new endpoints, migrations, `tzdata`, "old apps show event rows on linked sessions but cannot choose events".
- [ ] `SELFHOSTING.md`: nothing unless `tzdata` changes the image **[inferred]**.

## Phases

### Phase 1: server models, materialisation, API (ships alone)

- [ ] Models, migrations, `schedule.py`, `tzdata`, admin, `FILLED_FIELDS`, export.
- [ ] Slot and event endpoints, agenda, `archers/`, `mine/`.
- [ ] `event` on sessions, notes, media; `Note.at`; filters with the linked rows; `not_in_event`.
- [ ] Tests; `npm run types:api`.

### Phase 2: archer links a session (online)

- [ ] `schedule.ts`, `useAgenda`, `LogSession.event`, `log-sync` fields.
- [ ] Suggestion in `NewSessionView`; event line and change on both session screens.
- [ ] Slots are created in the Django admin until Phase 4 **[inferred]** acceptable for a first test team.

### Phase 3: coach notes and media, history, event view

- [ ] `NewNote` (`at`, event chips), `NoteRow`, `MediaView`/`MediaPlayerView` event, queue fields, `UnattachedHint` filter.
- [ ] History rows from `events/mine/`; `EventView` and route; locales.

### Phase 4: agenda and slot editor

- [ ] `AgendaView`, cancel/move/one-off, slot section in `TeamManageView`; locales.

### Phase 5: manual attach (#91 refactor)

- [ ] Extract `move_to_session(media, session)` from `MediaDetailView.put` into `media/moves.py`; behaviour pinned by the #91 tests (`test_media.py`, `test_frame_notes.py`).
- [ ] `POST /api/events/<uuid>/attach/` `{ archer, session }`: sets `session` on that archer's event rows without one (notes `.update`, media through `move_to_session`); rows keep `event`. Owner of the session or a coach of `event.team`; idempotent.
- [ ] "Put into a session" on `EventView` (`SessionPicker`). Moves earlier only if Phase 3 shows the opt-out case needs it.

### Phase 6: offline (after #84 Phase 1b and the team cache of its Phase 2)

- [ ] Depends on the offline-sync plan's Phase 2 team cache, which that plan marks **optional**: it becomes required here (update that plan when this phase starts).
- [ ] Cache the agenda per owner (`cache:<owner>:agenda`, full replace on pull) so `NewSessionView` and `NewNote` suggest offline. A session or clip queued with `event` + `event_slot`/`event_date` materialises on upload; no separate event queue needed for virtual occurrences.
- [ ] Event notes offline need app-made note ids and `PUT /api/notes/<uuid>/` (offline-sync Phase 1b, not built **[fact]**); the notes queue carries `event`, `event_slot`, `event_date`.
- [ ] Agenda edits (cancel, move, one-off, slots) stay online.

## Order

- [ ] 1. Phase 1, `pytest`, `types:api`.
- [ ] 2. Phase 2, `type-check`, `npm test`, phone test. Release.
- [ ] 3. Phase 3, release. Phase 4 can follow in the same release if small.
- [ ] 4. Phase 5 when needed.
- [ ] 5. Phase 6 after offline-sync Phase 1b and the team cache.
- [ ] 6. Docs and `CHANGELOG.md` per phase.

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
