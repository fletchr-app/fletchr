# Work offline, sync both ways after reconnecting (#84)

Status: phases 0, 1, 1b, 3 and 4 implemented; phase 2 (shared `useSync`, `/sync` list, optional caches) and phase 5 (equipment pull, optional evaluations) open; not checked on a phone
Date: 2026-10-29

## Scope

- The conventions of #84 for every synced entity: ids made by the app, repeatable `PUT /<entity>/<uuid>/`, pull with `updated_after` plus tombstones, one shared pull step, one written conflict rule per entity, one place for waiting/failed/conflicting items, server checks access again on upload.
- Entities, first round: sessions/ends/volume both ways (#82), media both ways with play before upload (#83), notes with drawings queued (#83), equipment, evaluations, team/members/roster as a read-only cache.
- Phased so the foundation ships first. Local-only mode (#93) needs more than the store: a local user later uploads everything once when they make an account, which is a one-way sync. So #93 needs Phase 1 (store, owner key, app-made ids), Phase 1b (upload path: equipment with app-made revision ids, notes queue, upload order, archer's own notes on the server) and the 410 fix (Phase 0). It does not need the pull step, tombstones, conflict rules, team caches or evaluations.
- Priority: Phase 0, 1, 1b, 3 (sessions both ways), 4 (media). Phase 2 (pull step) is needed by 3 and 4 but its team caches and Phase 5 evaluations are **optional**: build them only when someone asks (local-only users have neither, and coaches on a range log rather than browse rosters).
- Out of scope: a sync engine (as in the issue), statistics offline (server-computed, see Q10), push updates. Scoring on the device for #93 is not in this plan (see Risks).

Markers: **[fact]** checked in the code, **[inferred]** my reading, not checked by running anything, **[check]** verify before relying on it.

## What is there already (checked in the code)

- `src/lib/local-store.ts`: `get/set/remove` of a string per key. Native: `@capacitor/preferences`; browser: `localStorage`. **[fact]** On Android every key goes into one SharedPreferences file, group `CapacitorStorage` (`node_modules/@capacitor/preferences/android/.../PreferencesConfiguration.java`). So each `set` of the log rewrites the file that holds every other store too. **[inferred]** Fine for today's log; not for notes with drawings, equipment, evaluations and team caches on top.
- `useLog`: one JSON blob per key `log:<url>:<userId>`, written on every `dispatch`. `LogState` holds sessions, the op queue, `nextRev`, `lastPull` and an equipment cache (`Equipment`: active bows and arrow sets with **numeric** revision ids, refreshed by `fetchEquipment`).
- `useMedia`: queue under `media:<url>:<userId>`; files in `Directory.Data/media-queue/<id>.file|thumb`, **not** keyed by account (fine, ids are UUIDs). Both stores reset in memory when the key changes; the old account's data stays on the device under its key **[fact]**, nothing shows it.
- `useAuth`: `status` is `loading | signedOut | signedIn`; `userId` read from the access token. `signOut` only drops tokens. **[fact]** No store is cleared on sign-out; `deleteMyAccount` removes the log key, not the media key.
- `src/lib/log-sync.ts` `pull`: `GET /api/sessions/?owner=&updated_after=` and `GET /api/sessions/gone/`; takes over only sessions opened for you without results. `lastPull` is the newest server stamp. Triggers live in `useLog` (sign-in, `appStateChange`, `networkStatusChange`).
- `drain`: one op at a time, oldest first; `401`/`5xx`/no connection ends the run; other errors mark the op failed. `drainMedia` passes over items whose session is still queued (`blocked`).
- Server, sessions **[fact]**: `TrainingSession`, `End`, `Shot`, `VolumeEntry` have UUID pks; `TrainingSession.updated_at` (`auto_now`) is bumped by `touch()` on every end and volume write and delete. `SessionTombstone` (id, owner, `merged_into`, at); `PUT` to a deleted id is 410, the phone drops the session (`sessionGone`). Every `PUT` checks access (`can_write_sessions_of`, `visible_sessions`), so "server re-checks on upload" already holds for sessions and media.
- Server, others **[fact]**:
  - `Media`: UUID pk, **no `updated_at`**, no tombstone.
  - `Note`: **int pk**, `updated_at`, `ModelViewSet` with POST/PATCH (no PUT). Only coaches can write (`"Only coaches can write notes"`, `notes/serializers.py`), `team` is required.
  - `Bow`, `ArrowSet` and their revisions: **int pks**, **no `updated_at`**; revisions are made by the server (`record_revision`) when tracked fields change; sessions refer to `bow_revision` / `arrow_set_revision` by int id; delete is 409 once used.
  - `Evaluation`: int pk, `updated_at`, POST/PATCH; template versions int.
- `useRemote` is used in 22 files; no cache.

## Problems with the issue's approach

1. **Equipment has no app-made id either** (the issue names only notes and evaluations). Worse, sessions point at a server-made revision id. Equipment made or changed offline needs app-made ids for the revisions too, or a session logged with it cannot be uploaded (Q7).
2. **Notes are coach-only on the server.** #84/#83 queue coach notes. #93 lists "notes with drawings" for an archer alone, which the server does not allow at all today. That is a model change (own notes, no team), not a sync question (Q6).
3. **`updated_after` with `gt` on `auto_now` can miss rows** **[inferred]**: `auto_now` is set in Python before the write; with SQLite a request that took its stamp earlier can commit after a later one, and the phone has already moved past it. Needs an overlap on pull (Q9).
4. **Tombstones do not cover lost access.** A coach removed from a team gets no tombstone for that archer's sessions (`gone` filters by `archers_visible_to`). For read-only caches, replace the whole list instead of deltas (Phase 2).
5. **"Conflicting" needs detection.** With last write wins per item there is nothing to detect except delete against edit and refused uploads. Showing conflicts in general needs a base version per item, which is close to a sync engine. Recommended: no general detection in the first round (Q4).
6. **410 drops results today** **[fact]**: a session deleted on one phone while another logs ends offline loses those ends without a word (`sessionGone` removes session and queue). Should become a conflict the archer resolves (Q11).
7. **All stores in one SharedPreferences file** (above). The foundation should move off it before more entities land (Q1).

The phases below assume the recommended answers to the **Open questions** at the end.

## Phase 0: 410 must not drop results (ships alone, before everything else)

Today a 410 removes the session and its queued ends silently (problem 6). Fix it without the rest of Q11's machinery.

- [x] `sessionGone` in `useLog`/`log-model.ts`: when the session has queued ends or volume, keep it, mark it as `gone` and stop uploading it; `SyncBanner` shows it with "Keep as a new session" (new id, all items queued again) or "Discard". A session without unsent items is dropped as today.
- [x] Tests: `log-sync.test.ts` (410 with queued ends gives `gone`, not a drop; 410 without unsent items drops), `log-model.test.ts` (keep as new session renames and requeues).
- [x] Phase 3 later reuses this state for the pull side of Q11.

## Phase 1: local-store foundation (ships alone)

Progress: the store owner key, the file store with the Preferences migration, `useKeyedStore` and its use in `useLog` and `useMedia` are done (first PR). Second PR: `useAuth.storeOwner` (used by `useLog` and `useMedia`), the sign-out prompt, and account deletion removing the queued media. Third PR: the server `uid` fields on equipment, revisions and notes (migrations in three steps, read-only in the API, `record_revision` takes an app-made uid; evaluations are optional and not included). Fourth PR (Phase 1b, server part for equipment): `PUT` by uid for bows and arrow sets with `revision_uid`, and session writes by `bow_revision_uid` / `arrow_set_revision_uid`. Fifth PR (Phase 1b, app part for equipment): the equipment store, upload queue and read, the equipment screens on the store, and sessions naming equipment by uid. Sixth PR (Phase 1b, server part for notes): `PUT /api/notes/<uid>/`, and notes about yourself (no team, always private; `Note.team` is optional). Seventh PR (Phase 1b, app part for notes): the notes queue (`useNotes`), writing a note through it, notes shown as waiting, uploaded after their photo or session. Eighth PR: the screens for an archer's own notes (a Notes page for sessions on the phone, private notes on own photos and clips). Phase 1b is done except changing or deleting a note offline. Those two stores are not built yet on purpose: the equipment store needs the server uids to copy server items in, and a notes store without its queue would be code nothing uses. They come with the upload path (Phase 1b).

Goal: every entity store is keyed by a **store owner**, not by a server user; stores are files, not one SharedPreferences blob; notes and equipment have app-made ids and a device store. No two-way sync, no tombstones.

App:
- [x] `src/lib/store-owner.ts` (new, pure): `type StoreOwner = { kind: 'account'; server: string; userId: string } | { kind: 'local'; id: string }`; `ownerKey(o)` gives `<url>:<userId>` for accounts (**same string as today**, so existing logs and queues load without a migration) and `local:<uuid>` for local. `storeKey(name, owner)` gives `log:…`, `media:…`, `equipment:…`, `notes:…`.
- [x] `useAuth`: `storeOwner` computed (null while `loading` or signed out). `local` stays unused until #93; the type and key exist now so #93 only adds the state.
- [x] `src/lib/local-store.ts`: native backend to `Filesystem` JSON files in `Directory.Data/stores/<key>.json` (write to `.tmp`, then rename). On first `get` of a key that is not a file yet, read it from `Preferences`, write the file, remove the preference. Browser stays `localStorage`. `keys(prefix)` and `move(from, to)` (for #93's upgrade and for listing other owners' data). Atomic rename on Android **[check]** (`Filesystem.rename` within one directory).
- [x] `src/composables/useKeyedStore.ts` (new): the load/persist/`loaded` logic now copied in `useLog` and `useMedia` (watch key, generation counter, save on change). Debounced save (one write per tick) **[inferred]** needed once drawings are in a store.
- [x] `useLog`, `useMedia`: use `storeOwner` + `useKeyedStore`. `pull`, `flush`, `refreshEquipment` still need `status === 'signedIn'`; with a `local` owner they do nothing.
- [x] Equipment store `src/lib/equipment-store.ts` (new, pure reducer) + `src/composables/useEquipment.ts`: records `{ uid, kind: 'bow' | 'arrowSet', fields, is_active, revisions: [{ uid, number, fields }], server_id? }`. A local edit that changes a tracked field adds a revision with an app-made uid (same rule as `record_revision`). Server items are copied in with their uids (needs the server change below). Replaces `LogState.equipment`; `load` of an old `LogState` moves its cache over and drops the field. Field lists from `server/equipment/models.py`; keep them in one TS constant beside `equipment-fields.ts`.
- [x] `Gear` gets `bow_revision_uid` / `arrow_set_revision_uid`; `send` sends the numeric ids while they are known (server items), as today. A session with gear that exists only on the device is a Phase 5 problem; in account mode, equipment is still created online in this phase (`BowView`, `ArrowSetView` unchanged).
- [x] Notes store `src/lib/note-store.ts` (new, pure) + `src/composables/useNotes.ts`: `{ id (uuid), archer, team: number | null, session?, end?, media?, frame?, time_ms?, drawing?, body, visibility, updated_at }`. `team: null` leaves room for #93's own notes (Q6). No upload in this phase; screens keep posting to the server.
- [x] Sign-out and account switch (Q2): stores stay under their owner key; read-only caches are removed on sign-out (none exist yet; the hook goes into `useAuth.signOut`). `SettingsView`: when something is waiting, sign-out asks first ("n items have not been uploaded. They stay on this phone and go up when you sign in again."). `deleteMyAccount` also removes the media key and its files (today it removes only the log) **[fact]**.

Server (small, additive; needed by Phases 2 to 5, not by #93 alone):
- [x] `equipment/migrations/0002_uids.py`: `uid` `UUIDField` on `Bow`, `ArrowSet`, `BowRevision`, `ArrowSetRevision`. Three steps for SQLite (Django's "unique field" recipe): add nullable, `RunPython` backfill `uuid4`, alter to `unique=True`. `record_revision` takes an optional uid.
- [x] `notes/migrations/0006_uid.py`: same for `Note.uid`.
- [x] Serializers: `uid` read-only in `BowSerializer`, `ArrowSetSerializer`, revision serializers, `NoteSerializer`, `SessionSerializer` setup block.
- [x] `npm run types:api`.

Tests:
- [x] `store-owner.test.ts`: account key equals today's `log:<url>:<userId>` form; local key; no collision between a local id and an account.
- [x] `local-store` migration: a key in Preferences moves to a file once, then reads from the file (mock `Filesystem` and `Preferences`).
- [x] `equipment-store.test.ts`: a field change adds a revision, a non-tracked change does not, numbers count up, old `LogState.equipment` is moved over.
- [x] `note-store.test.ts`: save, edit (drawing changes, immutable fields refused like `IMMUTABLE`), remove.
- [x] `log-model.test.ts`, `log-sync.test.ts`, `media-queue.test.ts` unchanged and green.
- [x] Server: migration backfills unique uids; uids are stable across a revision; `pytest`.
- [ ] Phone: upgrade an installed app with a waiting session; it loads and uploads after the update.

## Phase 1b: upload path (moved forward from Phases 2, 4 and 5; needed by #93)

Goal: everything a local-only user creates can be uploaded once, in the right order, after an account exists. Also makes equipment and notes created offline work for normal accounts. No pull, no tombstones.

Server:
- [x] `PUT /api/bows/<uuid:uid>/`, `/api/arrow-sets/<uuid:uid>/` with `revision_uid`: the server writes the revision with the app's uid (Q7). The session write accepts `bow_revision_uid` and `arrow_set_revision_uid` besides the int ids, so a session logged with offline equipment uploads after it. Revision `number` is renumbered by the server on upload (display only, see Risks).
- [x] `PUT /api/notes/<uuid:uid>/` (create or update, safe to repeat), same checks as `NoteSerializer.validate`; int routes kept for one release (Q3). A note on a media id that is not there yet is 400 on `media`, which the app treats as "wait".
- [x] Archer's own notes (Q6, now decided here because the upgrade upload needs it): `Note.team` nullable, `team = null` means a private note of its author about themselves; only the author sees it. Coach rules unchanged. Migration, `can_see_note` rule, tests (a coach never sees it, another archer never sees it).
- [x] `npm run types:api`.

App:
- [x] Upload order (decided, not open): equipment, then sessions/ends/volume, then media, then notes. Each later queue passes over items whose parent is still queued (the `blocked` rule of `drainMedia`, generalised) in `drain` order inside `useLog`; the move to a shared `useSync` happens in Phase 2.
- [x] Equipment queue in `useEquipment`: create and edit on the device with app-made uids (Phase 1 store), upload by `PUT`; `BowView`, `ArrowSetView`, `EquipmentListView` read and write the store. Delete of used equipment stays refused (409 kept as failed with the server's message).
- [x] Notes queue in `useNotes`: `PUT` by uid after its media and session; 403 is failed with the server's message and kept on the device; deleting a queued clip asks, then deletes its queued notes. `NewNote.vue`, `NoteRow.vue`, `NotesSection.vue`, `LatestNotes.vue` write to the store and list server notes plus queued ones.
- [x] `SyncBanner`: counts per kind (waiting, failed) and "Give up" per item. The full `/sync` list view stays in Phase 2.

Tests: offline new bow, session with it, both upload in order; revision uid kept; repeated note `PUT` creates once; note on another archer's media refused; own note invisible to coaches; note waits for its media.

Not covered here, decided in #93: what happens when the account that receives the upload already has data of its own (merge, refuse or ask).

## Phase 2: shared pull step, read-only caches, sync status (pull step required by 3 and 4; caches optional)

- [ ] `src/lib/pull.ts` (new, pure): runs registered pull steps in order, each `(api, owner, since) => actions | null`; one `since` per entity in a `sync:<owner>` store. Overlap: asks with `since − 60 s` and applies idempotently (Q9).
- [ ] `src/composables/useSync.ts` (new): owns the triggers now in `useLog` (sign-in, `appStateChange`, `networkStatusChange`): pull everything, then drain the queues in order (below). `useLog` and `useMedia` register their pull and drain; their own `App`/`Network` listeners go.
- [ ] Upload order from Phase 1b moves into `useSync`; evaluations go last.
- [ ] **Optional:** read-only caches: team list, members, roster (`useTeams`, `TeamOverview`, `TeamManageView` sources). Full replace on each pull, no deltas, so lost access removes rows (problem 4). Store `cache:<owner>:<name>`, removed on sign-out. Build when a coach asks for it.
- [ ] **Optional (with the caches):** `useRemote` gets a `cache` key: show the cached value at once and mark it "as of <time>" when offline. Only for the cached entities, not all 22 files (Q10).
- [ ] `SyncBanner` becomes the one place: conflicts added to the counts, and a link to a list (`/sync`, new `SyncView.vue`) when more than one kind is involved. Locales `sync.*` in `en.ts` and `de.ts`.

Server: none.

Tests:
- [ ] `pull.test.ts`: order, overlap, one failing step does not move its `since`, the others still apply.
- [ ] Drain order: a note whose media is queued waits; a media item whose session is queued waits (exists, keep).
- [ ] Cache: replace drops a member that is gone; sign-out removes caches, keeps queues.

## Phase 3: sessions both ways (rest of #82)

Progress: done in the ninth PR. Decided with Tim: upload order decides (no edit timestamps), the first pull on a new phone takes the whole history, a deleted session with waiting results asks as in Phase 0. No `sessionConflict` action was needed: the `gone` state of Phase 0 is the conflict. A pull that raced with a finished upload is dropped (`uploads` counter in `useLog`).

- [x] `pull` takes all own sessions changed elsewhere (not only `isOpenedForMe`), fetches details for those, and applies them with the rule below. Coach view of others' sessions stays online (`useRemote`).
- [x] Conflict rule, sessions (Q4), written into `offline-sync.md`: last write wins per item (session metadata, each end with its shots, each volume entry), as today on the server. On pull, an item with a pending local op is not overwritten (the op goes up and wins). An end that the server no longer has and that has no pending op is removed (detail replaces the list; no end tombstones needed, because `touch()` bumps the session on end deletes **[fact]**).
- [x] Delete against edit (Q11): the push side is done in Phase 0. Here the pull side: a tombstone or `gone` for a session with pending ops uses the same state and banner choices.
- [x] `log-model.ts`: the `pulled` action applies the rule (`mergePulled`).

Server: none required. Optional: `?ids=` on the session detail or a `?include=ends` on the list to avoid one request per changed session **[inferred]** worth it only if pulls get slow.

Tests: `log-model.test.ts` (pulled detail does not overwrite a pending end; removes a gone end; keeps local-only ends), `log-sync.test.ts` (410 with queued results gives a conflict), server test that end delete bumps `updated_at` (pins it).

## Phase 4: media both ways and notes queue (#83)

Progress: server part done in the tenth PR. Decided with Tim: the phone keeps the list and thumbnails of pulled media, not the video files (they stream online); one shared `core.Tombstone`; server first, then the app pull, then the player. The tombstone goes to the people who may keep a copy (the clip's owner; a note's author, and the archer if they can read it), not to coaches, who read online. Extras the plan did not list: `updated_at` is also set where code uses `update()` (session delete, merge, claim, move of a clip's notes), notes on a deleted clip get their own tombstones, and a note that stops being shared gets one for the archer.

Server:
- [x] `media/migrations/0003_updated_at.py`: `Media.updated_at` (`auto_now`), backfill from `created_at`.
- [x] Tombstones (Q8): `core.Tombstone(kind, uid, owner, at)` with `core/migrations/0009_tombstone.py`; written on media and note delete; `GET /api/gone/?kind=&updated_after=`. `SessionTombstone` stays (it carries `merged_into`).
- [x] `MediaFilter.updated_after`.
- [x] Notes: `NoteFilter.updated_after` (the `PUT` route is in Phase 1b).
- [x] `npm run types:api`.

App:
Progress: the media pull is the eleventh PR. It is a separate store (`useMediaLibrary`, `library:` key) and not part of `useMedia`: the queue holds what is waiting, the library what the server has, and `MediaView` shows the queue first and the library when offline. List and thumbnails only (decided with Tim). The notes pull and the player for queued clips follow as their own PRs.

Progress, notes: the copy is in `note-library.ts` and `useNoteLibrary`. Queued notes are never in the copy, so a pull cannot overwrite them; a delete on another device removes the note at the next pull. Screens use `library.list(query)`: server first, the copy when the server cannot be reached.

- [x] `useMedia` pull: own media changed since, plus tombstones; queued items untouched.
- [x] Play before upload, per #83 (three PRs, decided with Tim: play queued items [done]; notes and drawings on your own queued items [done, own items only, taking back instead of editing]; keep uploaded photos and clips with a size cap [done, third PR; only what this phone uploaded, no background download]): player opens a queue id from the local file. Details belong in #83's own plan; this plan only provides the store and the order.
- [x] Notes pull: notes about you and by you changed since, plus tombstones (`useNoteLibrary`, a separate store like the media library, twelfth PR). Read only offline: editing and deleting stay online (decided with Tim).
- [x] Conflict rule, media and notes: last write wins per item; a queued item is not overwritten by a pull; a tombstone removes the local copy unless it has a pending op, then it is a conflict (like Phase 3).

Tests: server (repeated note `PUT` creates once; note on another archer's media refused; tombstone on delete; `updated_after`), app (`note-store` queue order, wait on media, conflict on tombstone with pending edit).

## Phase 5: equipment pull, and evaluations (evaluations optional)

Server:
- [ ] `equipment/migrations/0003_updated_at.py`: `updated_at` on `Bow`, `ArrowSet`; filter `updated_after`; tombstones on delete (`core.Tombstone`). (The `PUT` routes and revision uids are in Phase 1b.)
- [ ] **Optional:** `evaluations/migrations/0003_uid.py` (`uid`, same three steps), `PUT /api/evaluations/<uuid:uid>/`, `updated_after`, tombstones. Templates stay online, versions cached read-only.
- [ ] `npm run types:api`.

App:
- [ ] `useEquipment` pull (the queue is in Phase 1b).
- [ ] **Optional:** evaluations: `useEvaluations` store and queue; `EvaluationEditView`, `EvaluationListView`, `EvaluationView`, `useEvaluationDraft` (the draft becomes the queued item).
- [ ] Conflict rule, equipment: last write wins on the item's fields; revisions only add, never conflict. Evaluations: last write wins per evaluation.

Tests: equipment edited on a second phone arrives; tombstone removes a deleted bow; (optional) evaluation repeated `PUT` creates once.

## Docs (each phase)

- `specs/design/offline-sync.md`: store owner and keys, file store, pull step, upload order, one conflict rule per entity.
- `specs/design/data-model.md`: `uid` fields, `updated_at`, `core.Tombstone`.
- ADR `specs/adrs/0006-local-store-keyed-by-owner.md` (Phase 1) and `0007-conflict-rules.md` (Phase 3); `specs/adrs/index.md`.
- `CHANGELOG.md`.

## Order and dependencies

- [x] 1. Answers to the open questions.
- [x] 2. Phase 0 (410 fix), alone and first.
- [x] 3. Phase 1 (app); its server part can go in the same release or the next.
- [x] 4. Phase 1b (needs Phase 1 stores and server uids). **#93 can start after this**, plus the scoring check (Risks).
- [ ] 5. Phase 2 pull step (needs Phase 1 store keys); caches only on demand.
- [x] 6. Phase 3 (needs Phase 2 pull step).
- [x] 7. Phase 4 (needs Phase 2 pull step). Can run beside Phase 3.
- [ ] 8. Phase 5 equipment pull; evaluations only on demand.
- [ ] 9. Per phase: `npm run type-check`, `npm test`, `cd server && uv run pytest`, phone test in airplane mode.

## Risks

- File store migration runs on every installed phone with possibly unsent sessions. A bug there loses results. Keep the Preferences value until the file has been read back once **[inferred]**; test on a phone before release.
- Old app versions keep using int routes for notes and equipment; self-hosted servers may update later than the app (`SELFHOSTING.md`). Keep int routes until a release note says otherwise (Q3).
- `uid` beside an int pk means two ids per row for a while; every new route must use `uid`, or ids get mixed **[inferred]**.
- Equipment revisions made on two phones offline get two revisions with the same number. Recommended: the server renumbers on upload (number is display only), the uid stays **[inferred]**.
- Last write wins can lose an edit made on a second device to the same end. Accepted for the first round; a phone rarely edits an end another phone logged.
- **Scoring on the device (for #93) is not in this plan.** The server recomputes every score; a local-only app must score alone. If `src/lib` scoring differs from the server for any target face, scores change at upload. Before #93: a shared fixture of positions and expected scores per face, run against both sides **[check]**.
- Storage grows with caches and (from #83) kept media files; nothing is cleared yet (Q5).

## Open questions (could not be settled from the code or the issue)

1. **Q1, store backend.** Recommended: JSON files per store in `Directory.Data` (Phase 1), migrated from Preferences. Reason: one SharedPreferences file holds all keys today **[fact]**; SQLite (`@capacitor-community/sqlite`) is a native plugin and more code for data that is read whole anyway.
2. **Q2, sign-out and account switch.** Recommended: queues and own data stay under their owner key and resume on the next sign-in of that account; caches of other people's data are removed on sign-out; sign-out with waiting items asks first. Another account on the same phone never sees them. Alternative: wipe on sign-out (loses unsent results, rejected).
3. **Q3, int pk or uuid pk for notes, equipment, evaluations.** Recommended: add `uid` (unique), keep the int pk, new `PUT` routes by uid, int routes for one release. Changing the pk on SQLite rebuilds tables and every FK to revisions (sessions' setups) **[inferred]**.
4. **Q4, session conflict rule.** Recommended: last write wins per item, pending local ops are not overwritten by a pull, no general conflict detection; only delete against edit is a conflict (Q11).
5. **Q5, storage limits, what is cleared first.** Recommended: never queued or local-only data; first caches of other people's data, then kept files of uploaded media (oldest first). Show the space used in Settings; no automatic limit in the first round, since nothing measured yet says one is needed.
6. **Q6, archer's own notes (#93).** The server allows coach notes only. Decided: the note store allows `team: null` (Phase 1) and the server gets the model change in Phase 1b (own notes, author = archer, private), because the upgrade upload of a local-only user needs it.
7. **Q7, offline equipment revisions.** Recommended: the app makes revision uids and the server keeps them, so a session that names a revision made offline uploads without a lookup.
8. **Q8, tombstones.** Recommended: one `core.Tombstone(kind, uid, owner, at)` for media, notes, equipment, evaluations; `SessionTombstone` stays because of `merged_into`.
9. **Q9, missed rows on `updated_after`.** Recommended: pull with a 60 s overlap and idempotent apply. Alternative: a server-side change counter (exact, more server code). 60 s is a guess **[check]** against how long a write request takes on the real server.
10. **Q10, which `useRemote` screens get a cache.** Recommended: only the first-round entities (team, members, roster, plus the entity screens of Phases 4 and 5). Statistics, ranking, progress and coach views of other archers stay online.
11. **Q11, 410 for a session with unsent results.** Recommended: a conflict in the banner ("Keep as a new session" or "Discard") instead of today's silent drop.
12. **Q12, keep #83's play-before-upload UI in this plan or in #83's own.** Recommended: #83's own plan; this one only gives it the store, the order and the notes queue.
