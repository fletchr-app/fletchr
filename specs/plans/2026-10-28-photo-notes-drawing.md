# Notes and drawing on photos (#81)

Status: implemented (not yet checked on a phone)
Date: 2026-10-28

## Scope

- A coach writes a note on a photo and draws on it (lines, angles, circles, five colours), in the same format and with the same checks as on a video frame (`server/notes/drawing.py`). `Note.media` is set, `frame` and `time_ms` stay empty.
- The photo opens in a view with the pencil and the notes sheet. The video player's parts are reused, not copied.
- The swipe view in `MediaView.vue` shows the saved drawings over the photo.
- The notes list shows a photo note with its photo and drawing.
- Same visibility and edit rules as frame notes. Only coaches (someone with a team in `note_teams`) write and draw; an archer reads what is shared with them.
- Out of scope: a photo as the evidence of an evaluation score (`EvaluationScore.media` + `frame`, video only), moving single shapes, comments (#25).

## What is there already (checked in the code)

- `notes.models.Note`: `media` (FK, `SET_NULL`), `frame`, `time_ms`, `drawing` (JSON). `media` changes to `CASCADE` (decision 6), a one-line migration; no other model change.
- `notes.serializers.NoteSerializer.validate`:
  - On create, a note with `media` **must** have a `frame` ("Say which frame the note is about"), and `frame` is checked against `media.frame_count`. A photo note is refused today.
  - A `drawing` needs a frame: `self.instance.frame` on update, `attrs["frame"]` on create ("A drawing belongs to a frame of a clip"). Both refuse a photo.
  - `media` is a `PrimaryKeyRelatedField(queryset=Media.objects.all())`. Access to the media is not checked directly: only `media.owner_id == archer.id` plus `note_teams(user, archer)`. Today that is the same set as `media.views.visible_media` (both are "archer or also-shooting coach in a team the user coaches"), so it holds, but by coincidence of two functions. A photo of someone you cannot see gets 400 ("This is not a photo or video of that archer" or "You cannot write notes about this person"), not 404.
  - `IMMUTABLE` keeps `media`, `frame`, `time_ms` fixed; the drawing can change. Fine for photos.
- `notes.views.NoteViewSet`: visibility (`get_queryset`) and `NotePermission` do not look at media. Photo notes get the same rules for free. `NoteFilter` has `media`.
- `privacy/export.py` `_note` exports `media`, `frame`, `time_ms`, `drawing`. Works for photo notes unchanged.
- `src/views/MediaPlayerView.vue` (route `/media/:id`, `meta.title: 'Video'`):
  - Already has a photo branch: `<img v-else-if="clip" :src="clip.file_url">` in `.stage`, without `.picture` box, `DrawingLayer` or controls. `MediaView.open()` never routes a photo there; photos open in the swipe modal.
  - Notes (`notes`, `teams` via `useRemote`), drawing state (`drawing`, `attached`, `tool`, `colour`, `startDrawing`, `finishDrawing`, `editDrawing`, `undo`), the toolbar and the notes sheet (`IonModal` with `NewNote` and `NoteRow`) are all inline in this one file (about 500 lines with CSS). The toolbar and the notes button sit inside `<template v-if="clip?.kind === 'video' && videoUrl">`.
  - `canDraw = clip.kind === 'video' && teams non-empty`. `frameNotes` keeps notes with a frame only. `siblings` keeps videos only.
  - `shape` (the picture's size for angles and circles) comes from the decoder or `<video>`, falling back to `clip.width/height`. `fitted()` sizes `.picture` in `.stage`.
- `src/views/MediaView.vue`: the swipe modal (`IonModal.viewer`, `.strip` of `<img class="slide">`) holds queued, preparing and uploaded photos. Only uploaded ones (`item.remote`) have an id on the server, so only they can have notes. No notes are loaded there.
- `src/components/DrawingLayer.vue` and `src/lib/drawing.ts`: independent of video. Points are fractions; `angleDegrees`/`circleRadii` need the real width and height. Usable as is.
- `src/components/NewNote.vue`: prop `frame?: { mediaId, frame, timeMs, drawing }`. No way to send `media` without a frame. Label `notes.newNoteOnFrame`.
- `src/components/NoteRow.vue`: shows no drawing at all, for any note. The frame link and "Add/Edit drawing" show only when `note.frame` is set and emit `jump`/`editDrawing`.
- **Bug found (not in the issue):** `NotesSection.vue` (session detail, archer page) renders `NoteRow` without `@jump` or `@edit-drawing`, so on those screens the frame link and "Add drawing"/"Edit drawing" of a frame note do nothing. Fix it here, since photo notes need a link from the list anyway.
- `src/lib/image.ts`: `prepareImage` scales to at most `PHOTO_MAX_SIDE` (2048), upright (`imageOrientation: 'from-image'`), and the thumbnail (320) keeps the proportions. `Media.width/height` are what the phone sent (the scaled size). Fractions of the picture fit the thumbnail as well (rounding below one pixel).
- App tests: Vitest on `src/**/*.test.ts`, all in `src/lib`, no component tests. `jsdom` is a dev dependency but unused; `@vue/test-utils` is not installed.

## Where the issue and the code disagree

1. "Drawing is shown ... in the notes list": no notes list shows drawings today, not even for video notes, and the `Note` API has no picture URL or media kind to draw over. This needs a server field (decision 3). For video notes a thumbnail is frame 0, not the noted frame, so they keep the frame link without a preview.
2. "One for a photo you cannot see refused": refused today with 400 through the owner check, not through a visibility check (see above). Decision 2 makes it explicit.
3. "App: drawing on a photo in the view": there is no setup for testing a view or component. See decision 5.
4. The issue reads as if photos had no viewer with an id route. The player route already loads photos by id and has an (unused) photo branch.

## Decisions

1. **View structure. Recommendation: photo branch in `MediaPlayerView`, with the shared parts split out of it into components.**
   - Split out: `src/components/DrawingToolbar.vue` (tools, colours, undo, cancel, done/save; props `tool`, `colour`, `count`, `saving`/label, `error`; emits) with its CSS, and `src/components/MediaNotesSheet.vue` (the `IonModal` sheet: "drawing attached" line, `NewNote`, `NoteRow` list, empty text). The drawing state stays in the view (one view, one state), or moves to a composable `useNoteDrawing` if the view still reads badly.
   - Photo branch: `.picture` box with `<img>` and `DrawingLayer` (same `fitted()` sizing; `shape` from `naturalWidth/Height` on `@load`, fallback `clip.width/height`), a controls row with previous/next photo, pencil and notes button. No readout, tape or speed.
   - Why there and not in the swipe modal: the route `/media/:id` loads one media by id, which the notes list needs as a link target (a photo note on the session page must open its photo; the modal lives inside `MediaView` and cannot be linked to). The sheet, toolbar and stage sizing exist there. Drawing inside the swipe strip would also need the horizontal scroll stopped while a finger draws, a nested sheet modal inside the modal, and per-slide sizing: more risk for the same result.
   - Cost: from the swipe view, "Notes" closes the modal and pushes `/media/:id`; back returns to the grid, not to the open photo. Open question A.
   - Rename the route title (`meta.title: 'Video'` to e.g. 'Photo or video') and the comment on top of the view.
2. **Visibility of the media on create.** In `NoteSerializer`, check `media` against `media.views.visible_media(user)` (move `visible_media` to `media/access.py` to avoid importing views into serializers) before the owner check, and answer 400 `{"media": ...}` with the same text as for an unknown id, so a UUID cannot be probed. Keeps the rule correct if `note_teams` and `archers_visible_to` ever drift apart.
3. **Picture in the note API.** Add read-only `picture` to `NoteSerializer`: `{kind, width, height, thumbnail_url, file_url} | null`, null when `note.media` is gone or the viewer cannot see it (e.g. a coach turned "also shoots" off after the note was written). `thumbnail_url` signed with `media.files.sign_link` as in `MediaSerializer._link` (move `_link` to a function both use). Compute the viewer's visible owner ids once per request in `get_serializer_context`, and `select_related("media")` in `get_queryset`, so a list has no query per note. Unsure: whether `file_url` is needed; the player fetches the media itself, so `thumbnail_url` may be enough.
4. **Server rule for a photo note.** `media.kind == "photo"`: `frame` and `time_ms` must be empty (400 `{"frame": "A photo has no frames"}`), `session` is taken from the photo as for clips. `media.kind == "video"`: as now. A `drawing` needs `media` (create: `attrs["media"]`; update: `instance.media_id`; with decision 6 a note never outlives its media). New message "A drawing belongs to a photo or a frame of a clip" replaces the old one.
6. **Deleting a photo or clip deletes its notes and drawings.** Change `Note.media` from `SET_NULL` to `CASCADE` (and the comment in `notes/models.py`, which says the note stays) plus a migration. Django then removes the notes on a direct delete and on any cascade (owner or team deleted). This reverses today's behaviour for clips (`test_the_note_stays_when_the_clip_is_deleted` in `test_frame_notes.py` becomes "is deleted with the clip"). Consequence: an archer who deletes their own media also removes the coaches' feedback on it. Check the delete confirmation says so, and check `privacy/` (delete-my-data, export) for code that assumes notes outlive media.
5. **App test for "drawing on a photo in the view".** Recommendation: put the photo/frame logic that decides what is shown into `src/lib/media-notes.ts` (no Vue) and test it there, plus a check on the phone. A real component test needs `@vue/test-utils`, `// @vitest-environment jsdom`, a stub for `setPointerCapture` and Ionic in jsdom (heavy). If wanted, test `DrawingLayer` alone (pointer down/move/up over a 2048 x 1536 box emits a line in fractions). Open question B.

## Server steps

1. `media/access.py`: move `visible_media(user)` here from `media/views.py` (re-import it in views); add `media_link(request, media, part)` (from `MediaSerializer._link`), used by `MediaSerializer` and `NoteSerializer`.
2. `notes/serializers.py`:
   - `media` help text: "A photo, or a clip with `frame`".
   - `validate()`: decision 2 (visibility), decision 4 (photo has no frame, video needs one, drawing needs media). Keep the order of checks so the existing messages and tests stay.
   - `picture` field (decision 3), `fields` list.
3. `notes/views.py`: `select_related("media")`; `get_serializer_context` adds the visible owner ids (`archers_visible_to(user).values_list("pk", flat=True)` as a set).
4. `notes/drawing.py`: docstring "on a frame of a clip" to "on a photo or a frame of a clip". `notes/models.py`: comments on `media` and `drawing`.
5. Translations (`specs/steering/i18n.md`): "A photo has no frames" ("Ein Foto hat keine Einzelbilder", check the word: the app says "Bild" for a frame, which clashes with a photo), "A drawing belongs to a photo or a frame of a clip" ("Eine Zeichnung gehört zu einem Foto oder einem Bild eines Videos"); remove the old msgid from `locale/translate_de.py`; `pybabel extract`, `update`, `translate_de.py`, `compile`. `core/tests/test_translations.py` must pass.
6. `npm run types:api` (regenerates `src/lib/openapi.yaml` and `src/lib/api-types.ts`; `Note` gets `picture`).
7. No version change and no `MIN_APP_VERSION` change: additive. An old server refuses a photo note with "Say which frame the note is about", which the app shows as the error.

## App steps

1. `src/lib/media-notes.ts` (new, tested): `isPhotoNote(note)` (`media` set, `frame` null), `notesOnPicture(notes, frame | null)` (frame notes at that frame for a video, all notes of the media for a photo), `drawnShapes(notes)` (flat `readDrawing(...).shapes`), `noteLink(note)` (`/media/<id>?frame=<n>` or `/media/<id>`, null without media).
2. `src/components/DrawingToolbar.vue` and `src/components/MediaNotesSheet.vue`: moved out of `MediaPlayerView.vue` (decision 1), with their CSS. The video branch uses them first, unchanged in behaviour.
3. `src/components/NewNote.vue`: replace the `frame` prop by `on?: { mediaId: string; frame?: number; timeMs?: number; drawing?: Drawing | null }` (or add `mediaId` beside `frame`); send `frame`/`time_ms` only for a video. Label: `notes.newNoteOnFrame` for a frame, new `notes.newNoteOnPhoto` for a photo.
4. `src/components/NoteRow.vue`:
   - "Add/Edit drawing" when `can_edit` and the note has `media` (photo or frame), not only a frame.
   - For a photo note with `picture`: the thumbnail in a small `.picture` box with a read-only `DrawingLayer` (`picture.width/height`), tappable (emit `open`).
   - Emits stay; the parent decides.
5. `src/components/NotesSection.vue`: handle `jump`, `editDrawing` and `open` by `router.push(noteLink(note))` (fixes the dead buttons above). Editing a drawing from the list opens the player; optional `?draw=<noteId>` to start in drawing mode (read once in setup, as the player reads `?frame=`).
6. `src/views/MediaPlayerView.vue`:
   - `isPhoto = clip.kind === 'photo'`. Photo branch per decision 1; `canDraw` without the video condition (`teams` non-empty and, for a video, the clip loaded).
   - `siblings` filters by the kind of the current item, so prev/next stays among photos or among videos.
   - Notes of the picture via `notesOnPicture(notes, isPhoto ? null : frame)`; the count on the notes button for a photo is all notes of the photo.
   - `editDrawing` calls `show()` only for a video. `release()` on media change also for photos (clears `attached` and `drawing`).
   - The `.here` line (note at this frame) also for a photo: the newest note.
   - `?pick=` (evaluation frame picking) stays video only.
7. `src/views/MediaView.vue` (swipe view):
   - Each slide: a box with `<img>` and a read-only `DrawingLayer` sized with `fitted(slideBox, width / height)` (slide size from one `ResizeObserver` on `.strip`; photo size from `remote.width/height`).
   - Drawings of the current photo: `GET /api/notes/?media=<id>` when `viewKey` changes, kept in a map by id while the modal is open (neighbours show theirs once swiped to). Not polled.
   - Footer: a "Notes" button (with count) for an uploaded photo when it has notes or the viewer may write (`/api/notes/teams/?archer=<owner>`, once per modal): closes the modal, then `router.push('/media/<id>', query as for videos)`.
   - Queued or preparing photos: no notes, no button.
8. `src/router/index.ts`: `meta.title` of `/media/:id`.
9. `src/locales/en.ts` and `de.ts` (same keys, `npm test` checks them):
   - `media.draw`: "Draw on this frame" is used for both; add `media.drawPhoto` ("Draw on this photo" / "Auf dem Foto zeichnen").
   - `media.notes`/`media.noNotes` say "clip": add `media.notesPhoto` ("Notes on this photo" / "Notizen zu diesem Foto"), `media.noNotesPhoto`.
   - `notes.newNoteOnPhoto` ("New note on this photo" / "Neue Notiz zum Foto"), `notes.openPhoto` ("Open photo" / "Foto öffnen"), `media.openNotes` for the swipe-view button.
   - `evaluations.serverOlder` mentions "a note on a video frame or a drawing": add "or a photo".
   - German texts by the style in `specs/steering/i18n.md` (du).
10. `npm run type-check`, `npm test`, `npm run build-only`, `npx cap sync android` (no new plugin), and a check on the phone: draw on a portrait and a landscape photo, angle degrees right in both, drawing at the same spot in player, swipe view and notes list, dark theme, archer sees only shared drawings, archer has no pencil.

## Tests

Server (`server/notes/tests/test_photo_notes.py`, helper `give(owner, "photo")` from `privacy/tests/test_media.py`):
- A coach's note with a drawing on a photo of `archer1` is accepted (201), `frame` and `time_ms` null, the drawing comes back normalised (colour lower case), `picture.kind == "photo"` with a thumbnail URL.
- A photo of `b_archer` (team B, not coached) is refused, about `b_archer` and about `archer1`; the answer does not tell an unknown id from an existing one.
- A photo with `frame` or `time_ms` is refused.
- The note takes the session of the photo.
- Visibility: shared photo note visible to `archer1`, coach-only not; `archer2` sees nothing; `?media=` lists the photo's notes.
- Archers cannot write a photo note (403).
- The author changes and removes the drawing (PATCH), the admin cannot (403); `media` cannot change.
- The notes of a photo are deleted with the photo (direct delete, and through a cascade from the owner), same for a clip (replaces the old "stays" test).
- `picture` is null for a viewer who can read the note but not the media (coach with "also shoots" turned off after the note).
- Existing tests in `test_frame_notes.py` stay green (`test_a_drawing_needs_a_frame` keeps passing: no media at all is still refused; rename it to "needs a picture").
- Query count of `GET /api/notes/` does not grow with the number of photo notes (`django_assert_max_num_queries`).
- Translations test.

App (Vitest, `src/lib/media-notes.test.ts`): `isPhotoNote`, `notesOnPicture` for a photo (all notes) and a frame (only that frame), `drawnShapes` with a null drawing, `noteLink` for photo and frame. Optional per decision 5: `DrawingLayer` component test.

## Docs

- `specs/design/media-and-video-player.md`: "Coach notes on a frame" also for photos; the photo opens in the player route; the swipe view shows drawings. Bump `Updated`.
- `specs/design/data-model.md`: notes: "optional media_id (+ frame number for a video)".
- `specs/design/roles-and-access.md`: coach row "write notes on archers, sessions, photos and video frames".
- `specs/design/screens.md`: line 20, "a specific video frame or photo".
- `CHANGELOG.md`; this plan's status and `index.md` when done; close #81.

## Order

1. Open questions answered.
2. Server: `media/access.py` moves, serializer rules, `picture`, tests, translations. `npm run types:api`.
3. App: split `DrawingToolbar` and `MediaNotesSheet` out of the player, no change in behaviour, check videos on the phone.
4. `media-notes.ts` with tests, `NewNote`, `NoteRow`, `NotesSection` fix, photo branch in the player.
5. Swipe view drawings and its Notes button. Locales.
6. Docs. `npm run type-check`, `npm test`, `cd server && uv run pytest`, check on the phone.

## Open questions

A. (decided: reopen, as recommended) **Back from the player to the swipe view.** Accept that back lands on the grid, or reopen the swipe modal at the same photo (remember `viewKey`, reopen in `onIonViewWillEnter`)? Recommendation: reopen, it is a few lines.
B. (decided: no component test, as recommended) **Component test.** Add `@vue/test-utils` for a `DrawingLayer` test, or keep tests in `src/lib` and check the view on the phone (recommended)?
C. (decided: not in the sheet, as recommended) **Notes list preview.** Show the photo with its drawing in every `NoteRow` (session page, archer page, notes sheet) or only on the session and archer pages? In the sheet the photo is already on screen above it, so a thumbnail there repeats it. Recommendation: not in the sheet.
D. (decided: "Einzelbild" only in the two new server messages; existing texts unchanged) **German word for frame.** The app says "Bild" for a video frame. With photos next to it, "Einzelbild" for frames may read clearer; changing it touches existing texts.

## Risks

- **Splitting the player** can break the video flow (drawing, notes sheet, picking a frame for an evaluation). Do it as its own step, no behaviour change, check on the phone before adding photos.
- **Deleted media.** Its notes go with it (decision 6), so no orphan with a drawing nobody can see. Side effect: an archer deleting their own photo or clip removes the coaches' written feedback. The delete confirmation for media with notes should say so (check what `MediaView` shows today). Mention it in the design doc.
- **Wrong picture size.** Angles use `width/height`. `Media.width/height` come from the client unchecked; use the image's `naturalWidth/Height` in the player and swipe view, the stored size only in the notes list (thumbnail). A photo uploaded by another client with wrong sizes gives wrong degrees in the list only.
- **Signed links in the notes list** expire after an hour (`MEDIA_LINK_SECONDS`); `NotesSection` polls every 10 s, so the URL is fresh, but every poll gives new URLs and the thumbnails load again. Check that it does not flicker; if it does, keep the old URL while the media id is unchanged.
- **Swipe-view requests.** One notes request per photo swiped to. Fine for a session's photos; for an archer with hundreds of photos it is still one per swipe, not per photo in the list.
- **Old server.** A new app on a 0.9.x server gets 400 for a photo note; the error text says which frame, which reads odd for a photo. The version banner already warns.
