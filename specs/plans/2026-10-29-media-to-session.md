# Move photos and videos into a session, list those without a session (#91)

Status: implemented
Date: 2026-10-29

## Scope

- In the photo view (swipe modal in `MediaView`) and in the player (`MediaPlayerView`): "Move to session" and "Remove from session", for media with `can_edit`.
- A filter "Not in a session" on the archer's media page (`/media?owner=`).
- Several at once: select in the grid, move or remove together.
- A hint on the session screen: unattached photos and videos taken near its time, one tap "Add" each.
- Media still in the upload queue: moving changes the queue item (#84), incl. the race with an upload in progress.
- The delete-session confirmation says the photos and videos stay.
- Out of scope: a bulk endpoint (Q4), moving an already uploaded clip into a session that is still waiting to upload (Q3).

## What is there already (checked in the code)

- `server/media/models.py`: `Media.session` FK, `null=True`, `on_delete=SET_NULL`. Test `test_the_clip_stays_when_its_session_goes` covers it.
- `server/media/views.py` `MediaDetailView.put`: a repeated `PUT /api/media/<id>/` on an existing clip goes through `get_media(write=True)` (`can_change`, else 403) and `MediaWriteSerializer.validate` keeps only `note` and `session`. The view is **multipart only** (`MultiPartParser, FormParser`), so "clear" is `session=""`, not JSON `null`.
- **Clearing already works and is tested**: `test_a_repeat_can_change_only_the_note_and_the_session` sends `{"session": ""}` and gets `None`. Moving into another archer's session is refused (`validate_session`, `test_the_session_must_be_the_archers`, so far only on create). `SessionRefField` resolves ids of merged sessions.
- `server/media/access.py` `can_change`: the archer, whoever uploaded it, **and** a coach of a managed profile (`can_write_sessions_of`). The issue lists only the first two; the third is right and stays. A coach cannot change an archer's own clip (`test_a_coach_cannot_change_or_delete_an_archers_own_clip`).
- **`MediaFilter` cannot ask for "no session"**: `fields = ["owner", "session", "kind"]` makes `session` a `ModelChoiceFilter`; django-filter skips empty values, so `?session=` returns everything (not "no session", as the issue suggests). An unknown id (a waiting session) is 400. No `taken_at` range filter.
- **Issue claim wrong: "notes on a frame point to the media, not to the session".** `server/notes/serializers.py` lines 145 to 148 copy `media.session` into `Note.session` when a note on a photo or frame is written, and refuse a note whose session differs from the clip's. `session` is in `IMMUTABLE`. `NotesSection` on `SessionDetailView` lists notes by `session`. So after a move the clip's notes would still show on the old session and not on the new one, unless the server moves them too (Server 2).
- `server/training/merge.py` `merge()` already moves `Media` and `Note` rows from loser to winner with `.update(session=...)`; `OPEN_SESSION_CAP = 4 h`.
- `src/lib/media-queue.ts`: `QueuedMedia.session`; `mediaForm` appends `session` only when set; `sendMedia` turns a 400 on `session` into `withoutSession` (`dropSession` then sets it to null and it is sent again); `drainMedia` calls `done(id)` with the id only. `renameSession` follows merges.
- `src/composables/useMedia.ts`: `blocked = item.session !== null && log.sessionWaiting(item.session)`. So a **queued** item moved into a waiting session is fine: it just waits. The issue's "can not be moved there yet" is only true for media already on the server. No "move" action yet; `done` removes the item and its files.
- `src/views/MediaView.vue`: one page for `?session=` and `?owner=` (and `?pick=` from `EvaluationEditView`). The photo view is its `IonModal` (footer with Notes and Delete). Queued items are filtered by `session` or by owner; grid grouped by day (`media-days.ts`). No selection.
- `src/views/MediaPlayerView.vue`: server clips only; previous/next from `/api/media/?session=` or `?owner=` (query of the grid); Delete for `clip.can_edit`.
- Session screens: `TrainingSessionView.vue` (own and coach-opened sessions, local log) and `SessionDetailView.vue` (server, read-only, coaches). Delete: `session.deleteConfirm` ("Tap again to delete this session"), used in `TrainingSessionView` (twice) and `SessionEndsView`.
- `GET /api/sessions/` has `owner`, `started_after`, `started_before` filters; no pagination.

## Decisions (need Tim's confirmation)

1. **Q1, notes of a moved clip.** Recommended: the server moves them with the clip: in the same transaction, `Note.objects.filter(media=media).update(session=new, end=None)` (end cleared, since an end belongs to the old session). Reason: otherwise the old notes stay on the old session's page while new notes on the same clip land on the new one (line 146 copies the clip's current session). Alternative: leave notes alone (the issue's assumption), then fix the notes list to follow `note.media.session`; more code, two sources of truth.
2. **Q2, "nearby" window for the hint.** Recommended: `taken_at` from `started_at − 1 h` to `(ended_at ?? started_at + 4 h) + 1 h`. The 4 h is `OPEN_SESSION_CAP`, so the hint and the merge agree about how long an open session lasts. 1 h covers warming up and photos taken on the way home. Alternative: the whole local day of the session (simpler, but a morning and an evening session would both claim the same photos).
3. **Q3, uploaded clip into a waiting session.** Recommended: not now. The picker shows a waiting session greyed with "Still uploading, try again in a moment". Reason: the session usually reaches the server within seconds; queuing a "move only" item for a clip that has no files on the phone needs a second kind of queue item. Queued clips can go into a waiting session (they already wait for it).
4. **Q4, bulk endpoint.** Recommended: no. Multi-select sends one `PUT` per clip, one after another, and reports how many failed. Selections are a handful; the per-clip `can_change` and `validate_session` checks stay in one place.
5. **Q5, sessions in the picker.** Recommended: own media (`owner` is me) from the local log (`useLog().sessions`, works offline, includes waiting ones); an archer's media from `GET /api/sessions/?owner=<id>&started_after=&started_before=` with 30 days either side of `taken_at`, plus "Show older". Order: the session whose window (Q2) contains `taken_at`, or else is closest to it, first; then newest first. The clip's current session is marked and not selectable.
6. **Q6, where the hint shows.** Recommended: both `TrainingSessionView` and `SessionDetailView` (a coach looks at an archer's session there), only media with `can_edit`, plus queued items on this phone with `session === null` and the same owner. Hidden when there are none; collapsed to one line ("3 photos and videos from around this time are not in a session") with a tap to show thumbnails.
7. **Q7, the filter on the archer's page.** Recommended: two chips at the top of `MediaView` in owner mode, "All" and "Not in a session" (`ChipGroup`), not a separate section. In session mode no chips.

## Server

1. `media/views.py` `MediaFilter`: `without_session = BooleanFilter(field_name="session", lookup_expr="isnull")`; `taken_after` / `taken_before` (`IsoDateTimeFilter` on `taken_at`, `gte` / `lt`) for the hint (Q2). Keep `session` as is.
2. `media/views.py` `put`, update branch: when `session` is in `data` and differs, save the clip and move its notes (Q1) in `transaction.atomic`.
3. Nothing to change in `can_change` and `validate_session`; add tests that pin them (below).
4. Docstring of `put` and the filter help texts (they land in the API types).
5. `npm run types:api` afterwards.

## App

1. `src/lib/media-queue.ts`:
   - `QueuedMedia.uploaded?: true`: the files are on the server, only `session` (and `note`) still have to go.
   - `mediaForm`: for `uploaded` items only `session` (as `""` when null) and `note`, no files; for new items as now.
   - `drainMedia`: `done(item)` gets the item that was sent (the snapshot), not only the id.
   - New pure `afterUpload(items, sent): QueuedMedia[]`: the current item gone → unchanged; its `session` equals `sent.session` → remove it; differs (moved while uploading) → keep it, set `uploaded: true`, so the next run sends a session-only `PUT`. This is the race fix: the form of a running upload is already built with the old session, and today `done` would drop the item and the move with it.
   - New pure `moveQueued(items, ids, session)`.
   - `withoutSession` for an `uploaded` item (target session deleted meanwhile): `dropSession` as now, the next run clears it on the server.
2. `src/composables/useMedia.ts`: `done` uses `afterUpload`; files are removed only when the item leaves the queue (an `uploaded` item keeps its preview until then); `send` skips `loadFiles` for `uploaded` items; new action `move(ids, session)` for queued items. `blocked` unchanged (it covers moving into a waiting session).
3. `src/lib/media-move.ts` (new, no Vue): `nearWindow(session)` (Q2), `isNear(takenAt, session)`, `pickerOrder(sessions, takenAt)` (Q5). Message keys only.
4. `src/composables/useMoveMedia.ts` (new, small): `move(items, session | null)`: queued ones via `useMedia().move`, server ones via `api.PUT('/api/media/{media_id}/', { bodySerializer: () => form with session })`, sequential; returns `{ moved, failed }`.
5. `src/components/SessionPicker.vue` (new): `IonModal` with the sessions (Q5), "Remove from session" at the bottom when the clip has one, waiting sessions greyed (Q3) for server clips.
6. `MediaView.vue`:
   - Footer of the photo view: "Move to session" / "Remove from session" for queued items and `remote.can_edit`, not while preparing and not in `?pick=` mode.
   - Grid: "Select" button (owner and session mode, not `?pick=`); in select mode a tap toggles a check mark on the tile, a bottom bar shows "n selected", "Move to session", "Remove from session" (session mode only), "Cancel". Only selectable: queued items and `can_edit` server items; preparing tiles are not.
   - Owner mode: chips "All" / "Not in a session" (Q7); "Not in a session" asks the server with `without_session=true` and filters queued items by `session === null`.
   - After a move: `reload()`; in session mode the moved items leave the grid.
7. `MediaPlayerView.vue`: "Move to session" / "Remove from session" next to Delete for `clip.can_edit`. After a move in session mode, the clip drops out of the siblings: stay on it, previous/next keep the old list until the next visit (simplest), or go back to the grid. Recommended: stay.
8. `src/components/UnattachedHint.vue` (new): props `owner`, `session` (`id`, `started_at`, `ended_at`); loads `GET /api/media/?owner=&without_session=true&taken_after=&taken_before=` with `useRemote` (no polling) plus queued items from `useMedia`; thumbnails with "Add" each, and "Add all". Used in `TrainingSessionView` (all three layouts, below the media link; for the ends layout only the one-line form, the screen must not scroll) and `SessionDetailView` (Q6). For a waiting local session the "Add" works for queued items only (Q3), server items show the waiting text.
9. Delete confirmation: `session.deleteConfirm` en "Tap again to delete this session. Its photos and videos stay, without a session." de "Nochmal tippen, um dieses Training zu löschen. Fotos und Videos bleiben, ohne Training." One key, so `SessionEndsView` gets it too. Check it fits on the button at phone width; if not, a `muted` line under the button instead.
10. Locales `en.ts` and `de.ts` under `media`: `moveToSession` ("Move to session" / "In ein Training verschieben"), `removeFromSession` ("Remove from session" / "Aus dem Training nehmen"), `pickSession`, `currentSession`, `sessionWaiting` ("Still uploading, try again in a moment" / "Wird noch hochgeladen, gleich nochmal versuchen"), `showOlder`, `select`, `selected` (plural), `notInSession` ("Not in a session" / "Ohne Training"), `all`, `moved` / `moveFailed` (plural), `nearby` (plural: "{n} photo or video from around this time is not in a session | {n} photos and videos ..."), `add`, `addAll`. German wording to check with Tim.

## Tests

Server (`cd server && uv run pytest`), `media/tests/test_media.py`:
- Move an existing clip into another session of the same archer: 200, `session` changed.
- Move into another archer's session: 400 on `session`, clip unchanged (the existing test covers only the upload).
- Clear with `session=""`: `null` (exists; add the GET afterwards).
- A coach moves a clip they uploaded: 200. A coach moves the archer's own clip: 403. A coach of a managed profile moves its clip: 200.
- Moving into a merged session's old id lands in the winner.
- `?owner=<id>&without_session=true` lists only clips without a session; `without_session=false` only those with; `taken_after` / `taken_before` bounds.
- Notes follow the clip (Q1): a frame note with the old session gets the new one, `end` cleared; cleared session gives `null`; a new note on the moved clip is accepted (`notes/tests`).
- Several clips: three `PUT`s, one refused (another archer's session), the other two moved (the selection is per clip on the server; this is the "selection of several" test from the issue).

App (Vitest):
- `src/lib/media-queue.test.ts`: `afterUpload` removes an unchanged item, keeps a moved one as `uploaded`, ignores one removed meanwhile; `mediaForm` for an `uploaded` item has `session` (also `""`) and no files; `drainMedia` passes the sent snapshot to `done`; the race end to end with a `send` that moves the item before resolving, then a second run sends the session-only form; `withoutSession` on an `uploaded` item.
- `src/lib/media-move.test.ts`: `nearWindow` for finished and open sessions (cap), edges included/excluded; `pickerOrder` puts the containing session first, then newest first.
- `src/locales/locales.test.ts` covers the new keys.

## Docs

- `specs/design/media-and-video-player.md`: moving, the filter, the hint, notes follow the clip, queue `uploaded` items.
- `specs/design/offline-sync.md`: the session-only queue item and the race.
- `specs/design/screens.md`: media page select mode and filter, session hint.
- `CHANGELOG.md`.

## Order

- [x] 1. Answers to Q1 to Q7.
- [x] 2. Server: filters, notes follow the clip, tests; `npm run types:api`.
- [x] 3. Queue: `uploaded` items, `afterUpload`, `moveQueued`, `useMedia.move`; tests. (Can ship alone: no UI yet.)
- [x] 4. `media-move.ts`, `useMoveMedia`, `SessionPicker`; move in the photo view and the player; locales.
- [x] 5. `MediaView`: "Not in a session" chips and select mode.
- [x] 6. `UnattachedHint` on both session screens.
- [x] 7. Delete-session text.
- [ ] 8. Docs (done), `type-check`, `npm test`, `pytest` (done); phone test still to do: move a photo while its upload runs (airplane mode on and off mid-upload).

## Risks

- The race fix relies on the server applying `session` on a repeated `PUT` of an existing clip. It does today (`validate` keeps `note` and `session`); a test pins it.
- An old app version that uploads a clip after a newer app moved it on another phone can move it back: the upload of an existing id sets `session` again. Rare (same clip, two phones); accepted [inferred].
- `useRemote` per hint without polling: a clip uploaded on another phone shows only on the next visit.
