# Merge the photo viewer in the grid into the media player (#159)

Status: implemented in the PR for #159 with step 3 reduced to preloading (neighbour photos are fetched under the link from the list and the player keeps that link; the detail request still runs for each photo and the listed object is not shown before it); not yet tried on a phone
Date: 2026-11-06

Goal: one full-screen view for photos and clips, the player (`MediaPlayerView.vue`, `/media/:id`). The grid in `MediaView.vue` opens photos there, as it already does for clips, and its swipe viewer (`IonModal`) goes away. Nothing the viewer can do today is lost.

Marks: **fact** = read in the code (file:line, as of `432d38f`), **inferred** = follows from the code but not run, **unsure** = needs a check.

## What is there

### Who opens which screen

- Fact: grid tile tap: clips go to the player with `?session=` or `?owner=` (and `?pick=`), photos open the viewer (`MediaView.vue:358-371`). Without an account a queued item goes to `/local-media/:id` (`MediaView.vue:361`).
- Fact: the viewer's notes icon closes the modal and pushes the player; back re-opens the viewer on the same photo (`openNotes`, `reopen`, `comeBackTo`, `MediaView.vue:441-455`, called from `onIonViewWillEnter` at `:118`).
- Fact: other ways into the player: Home tiles (`profile.ts:53`, `useProfile.ts:92` with `?owner=`), note links (`media-notes.ts` `noteLink`, `?frame=`), push notifications (`push-target.ts:28`), evaluation frame links (`EvaluationView.vue:60`). None opens the viewer.
- Fact: a queued photo on Home (signed in) links to `/media`, the grid, not to the photo (`profile.ts:53`, tested in `profile.test.ts:51`). Comment there: "A photo opens on the media page".
- Fact: `LocalMediaView.vue` (`/local-media/:id`) is the screen for local mode (no account): file on the phone, local notes and drawings. It is not part of this merge and keeps working as it is.

### What the viewer has that the player lacks

- Fact: swipe between photos: a scroll-snap strip with one slide per photo (`MediaView.vue:620-625`, styles `:743-764`). The player has previous/next buttons only (`MediaPlayerView.vue:617-622`).
- Fact: photos that failed while being prepared (`preparing` with `error`) are in the viewer's list (`MediaView.vue:341`), show their error in the footer (`:630`) and can be deleted (`:461-468`). They have no id the player knows (`preparing-<uuid>`, not in the queue).
- Fact: the upload error of a queued item (`queued.error`) shows in the viewer footer (`MediaView.vue:630`). The player does not show it.
- Fact: the "Not in a session" filter (`?unattached`, `MediaView.vue:88-89`) limits the grid and therefore the viewer's swipe list. The player's previous/next ignore it: `playerSiblings` gets only `session` or `owner` (`MediaPlayerView.vue:108-114`, `queued-clip.ts:45-54`).
- Fact: offline, the viewer shows what the phone knows (`savedList` from `useMediaLibrary`, thumbnails used as `file_url`, `MediaView.vue:151-157`). The player offline opens a photo only if `kept.has(id)`, else throws `offline` (`MediaPlayerView.vue:95-100`), and its sibling list falls back to queued items only (`:112-113`).
- Fact: the viewer has all `file_url`s from the list, so a swipe shows the next photo at once. The player does `GET /api/media/{id}/`, notes and teams for each photo it goes to (`MediaPlayerView.vue:90-104`, `:131-145`).
- Fact: after a delete the viewer closes and the grid stays (`MediaView.vue:476`); the player goes back (`MediaPlayerView.vue:492`, `:497`). Same place in the end.

### What the player has that the viewer lacks (why it should be the one)

- Fact: drawing, notes sheet, notes waiting to upload, training link (`MediaEvent`), opened by note links with `?draw=` and `?frame=`. The viewer only shows saved drawings (`DrawnPicture`, `MediaView.vue:622`).

### Order

- Fact: the grid order is queued, then preparing, then the server list in its order (`MediaView.vue:161-165`); `byDay` keeps the order (`media-days.ts:11-20`); the server orders `-taken_at, -created_at` (`server/media/models.py:83`). The player's order is queued, then the server list (`queued-clip.ts:49-54`). So both agree, except for preparing tiles (inferred: they are not openable in the player anyway).

### Tests

- Fact: `queued-clip.test.ts` (clipOfQueued, playerSiblings), `media-notes.test.ts`, `media-days.test.ts`, `player.test.ts`, `profile.test.ts`, `useClipVisibility.test.ts`, `locales.test.ts`. No component tests of either view.

## The three questions

1. **Swiping in the player.** Recommendation: yes, a simple swipe on the picture that calls `goTo(-1/+1)`, not while drawing (decided later: photos and clips, see Decisions). Without it, people who look through a training's photos in the grid lose something they use today (inferred, not asked). Work, inferred: small (a pointer handler on `.stage`, about 40 lines, plus a tested threshold function in `src/lib/player.ts`). `DrawingLayer` has `pointer-events: none` unless drawing (`DrawingLayer.vue:176-179`), so the stage gets the touches. Not for clips: the tape and the canvas are dragged there. A strip that follows the finger, like the viewer's, is much more work (one stage per neighbour with its own drawing layer and notes; inferred about a day plus phone tuning) and is not recommended now.
2. **Queued photos.** They open: `queuedItem` loads the file (`MediaPlayerView.vue:70-81`, `clipOfQueued`), notes wait (`:141`), visibility and move work with `queued` (`:503`, `:513`), delete removes from the queue (`:490-493`). Missing: the upload error (add it), the failed-while-preparing tiles (need a new place, see step 4), and the `unattached` filter for previous/next (step 2). Unsure: what the player shows when the upload finishes while it is open: `queuedItem` turns undefined, notes reload from the server (`:140`), the picture stays on the blob URL; the comment at `:57` says that is intended. Check on the phone.
3. **`?pick`.** Only clips can be picked: "Use this frame" is shown for videos only (`MediaPlayerView.vue:570`), `finishPick` takes a frame (`useEvaluationDraft.ts:29`). In pick mode the viewer only hides move, visibility and Select (`MediaView.vue:486`, `:505`, `:553`); delete is still offered. The player already hides move and visibility while `choosing` (`MediaPlayerView.vue:502`, `:504`). Decided: photos are dimmed in pick mode and do not open (step 6); the grid keeps passing `pick` for clips (`MediaView.vue:365`). Inferred: `choosing` also needs `frameDraft.picking` set (`:45`); with a stale `?pick` the move icon shows, same as for clips today.

## Approach

**Recommended (A): merge, with a simple swipe and the gaps closed.** The grid pushes `/media/:id` for every openable item with the grid's query; the viewer, `openNotes`, `reopen`, the strip and its styles go (about 200 lines out of `MediaView.vue`, inferred). One place for actions, as #157 wanted.

Alternatives:

- **B: merge without swipe.** Less work, buttons only. Trade-off: a visible step back for browsing a session's photos.
- **C: merge with a follow-the-finger strip in the player.** Closest to today's feel, most work and most risk in the drawing and notes code that is keyed on `currentId`.
- **D: do not merge.** Keep both, with `MediaActions` shared already. Trade-off: the remaining doubles (notes button rules `MediaView.vue:408-422` vs `MediaPlayerView.vue:148-155`, delete rules, footer texts, `useClipVisibility` wiring) keep drifting; each change to photo actions is done twice. Fine if the swipe feel matters more than the upkeep. Note: the viewer cannot draw, so a coach goes through two screens in D.

Trade-offs of A to know about: page push animation instead of a modal; the player is themed (light page, black stage) where the viewer was all black; a per-photo server round trip instead of an instant swipe (step 3 eases it).

## Steps (A)

- [ ] 1. Player: show the upload error of a queued item (`queuedItem.error`, `text-danger`, like the viewer footer). No new text: the message is stored with the item.
- [ ] 2. Sibling list follows the grid: `playerSiblings(queued, listed, { session, owner, unattached }, me)` drops queued items with a session when `unattached`; the player asks `/api/media/` with `without_session: true` then. The grid passes `unattached=1` in the query when its chip is on. Offline: listed comes from `library.known({ session, withoutSession })` like the grid's `savedList`. Tests in `queued-clip.test.ts`: unattached drops queued items with a session; order unchanged.
- [ ] 3. Faster previous/next: keep the full `Media` objects from the sibling list; `goTo` shows the listed object at once (the detail GET still runs and replaces it), and the neighbour photos are preloaded (`new Image().src`). Offline fallback for a photo that is not kept: the library thumbnail as `file_url` (what the viewer shows today). Fact: the list returns full `Media` with `can_edit` (`api-types.ts:2293`, used by the grid at `MediaView.vue:461`). Inferred: the detail GET could be skipped for listed photos; keep it at first for a fresh signed link and the training info.
- [ ] 4. Failed preparing tiles: a tap on such a tile in the grid opens an alert with the error and Delete/Cancel (`media.couldNotAdd` as header, `common.delete`, `common.cancel`; no new keys). Tiles still being prepared stay untappable.
- [ ] 5. Swipe: `swipeStep(dx, dy, ms)` in `src/lib/player.ts` returns -1, 0 or 1 (horizontal, at least 60 px, more sideways than up, within 600 ms; numbers are guesses). Tests in `player.test.ts`. In the player: pointer handlers on `.stage` when `!drawing && !notesOpen`, for photos and clips (decided); for a clip not on the tape or the jog strip, check on the phone that it does not clash with scrubbing; ignore touches starting within 24 px of the screen edges (Android back gesture, later iOS swipe-back).
- [ ] 6. Grid opens the player for photos: `open()` pushes `/media/:id` for photos and clips with `session`/`owner`, `unattached`, `pick`. In pick mode (`pick` set) photo tiles are dimmed and a tap does nothing (decided; photos as evidence: #161). Remove the modal, `photos`, `viewKey`, `strip`, `full`, `loadFull`, `placeStrip`, `swiped`, `photoNotes`, `writable`, `loadNotes`, `shapesOf`, `notesButton`, `notesCount`, `fit`, `openNotes`, `reopen`, `close`, `remove`, `canDelete`, the viewer's visibility and move computeds, `deleteError`, viewer styles and unused imports. `reload()` and `consent.reload()` on re-entry stay. Keep `moveTo` for the multi-select.
- [ ] 7. Home: a queued photo links to `/media/<id>` (`profile.ts:53`), update the comment and `profile.test.ts:51`. Unsure whether own remote tiles should carry `?owner=` for previous/next (today they do not); decide with step 2.
- [ ] 8. Texts: remove `media.openNotes` from `en.ts` and `de.ts` (only the viewer uses it, `MediaView.vue:601`). Keep `media.close` (used by `SessionPicker.vue:88`). For the offline preview (step 3) an icon on the picture, no visible text (decided); its accessibility label is a new key `media.previewOnly`, en "Only the preview is on this phone", de "Nur die Vorschau ist auf diesem Handy".
- [ ] 9. Design doc `media-and-video-player.md`: the bullets on actions as icons and coach notes on a photo describe the viewer; rewrite to "the grid opens the player". Index of plans updated.
- [ ] 10. `npm run type-check`, `npm test`.

## Risks

- Browsing a session's photos gets slower on mobile data (three requests per photo: detail, notes, teams; `teams` reloads on every `clip` change, `MediaPlayerView.vue:142-145`, though it only depends on the owner). Step 3 and caching teams by owner help.
- The swipe can fight the Android back gesture or catch a drag meant for something else. Edge margin and threshold need trying.
- Sibling list is read once at mount; after a move under `?session=`, the moved photo stays in previous/next until the player is opened again (inferred, minor; same for clips today).
- Ionic keeps the grid alive under the player; the grid must not read the query in a `computed` (it does not, `MediaView.vue:66-68`).
- Removing the viewer drops the all-black look; some may find the player's light page around the photo worse (taste, not checked).

## Try on the phone

- Grid of a training: open a photo, swipe and use the buttons both ways, at the first and last photo, with and without drawings.
- Same with "Not in a session" on: previous/next stays inside the filter.
- A queued photo (Wi-Fi off): opens from the file, notes can be written, it uploads while open, back to the grid.
- A queued photo with an upload error: error shown, delete works.
- A photo that failed while being prepared: tap, error, delete.
- Offline: a kept photo, a photo that is not kept (preview), previous/next.
- Coach on an archer's photo: notes, drawing, no eye, no move unless allowed.
- Evaluation: choose a frame, open a photo in the grid on the way, back, then a clip, "Use this frame".
- Drawing on a photo: a swipe while drawing does not change the photo; Android back gesture from the edge still goes back.
- Home tile of a queued photo opens that photo.

## Decisions (Tim, 2026-11-06)

1. **A**: merge, with a simple swipe.
2. **Swipe for photos and for clips.** On a clip the swipe is on the picture only, not on the tape or the jog strip, and not while drawing. Inferred: no clash, because only the tape has pointer handlers (`MediaPlayerView.vue:575`); check on the phone first. If it does, fall back to photos only and say so here.
3. **After a delete: back to the grid.**
4. **Pick mode: photos are dimmed in the grid and do not open.** Picking a photo as evidence is a separate feature, issue #161.
5. **Offline preview of a photo that is not kept: no text.** A small icon on the preview, with an accessibility label only. The icon is "cloud off" (`cloudOfflineOutline` in ionicons).
