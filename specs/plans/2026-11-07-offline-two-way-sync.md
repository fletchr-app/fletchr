# Offline two-way sync, the rest of #84

Issue: #84. Follows [2026-10-29-offline-sync.md](2026-10-29-offline-sync.md) (phases 0 to 5) and the schedule cache of [#104 Phase 6](2026-10-30-trainer-session.md#phase-6-offline) (#148). Design: [offline-sync.md](../design/offline-sync.md).

Status: implemented 2026-11-07 (PR for #84). Tim took the recommended answer to all five open questions. Deviations from the steps below are listed at the end under "What was built differently". Phone: new evaluation, a change, the draft after the app was killed, and reading the copy were tried offline against the Dev server (0.24.0 build, the version gate lowered for the test); not tried: evidence from a clip that is still queued, a 410, the push.
Date: 2026-11-07

Markers: **[fact]** read in the code or docs (file:line), **[inferred]** my reading, not run, **[check]** verify before relying on it.

## Open questions (for Tim, before Step 1)

1. **Evaluations offline: build them, or close #84 without?** The issue lists them for the first round, the earlier plan made them optional. Recommended: build writing (new evaluation and edits queued, evidence waits for its clip) and a read copy of the evaluations about you and by you (Steps 6 to 8). Reason: a coach at the range without signal is the case the issue is about, and today a half filled form is lost when the app is killed (the draft is a module `ref`, `src/composables/useEvaluationDraft.ts:9`). Cost: the only part that needs a server change and a server release first. Alternative: close #84 after Step 5 and open a separate issue for evaluations.
2. **Own statistics offline for a signed-in archer.** Today the Statistics tab shows an error offline (`src/views/StatsView.vue:46-50` asks the server unless `isLocal`), although the phone holds the whole history (the first pull fetches it, `offline-sync.md:12`) and `src/lib/stats.ts` computes the same numbers for local mode. Recommended: use the device numbers as a fallback when the server cannot be reached, with an "as of" line (Step 4). Trade-off: the earlier plan kept statistics online (its Q10); the fixtures (`shared/stats-vectors.json`) make the two sides agree, so the risk is small.
3. **A session changed offline (notes, times, type) that was deleted on the other side.** Today the change is dropped without a word: `sessionGone` keeps a session only when ends or volume are waiting (`src/lib/log-model.ts:275-278`); found on a phone on 2026-11-03 (earlier plan, Phase 5). Recommended: keep it as `gone` for any waiting change, so the banner asks "Keep as a new session" or "Discard" as for results (Step 2). Trade-off: one more prompt in a rare case, against silent loss.
4. **Equipment changed offline that was deleted on the other side.** Today the queued change wins and the bow comes back with the same uid and a new integer id (checked on a phone, earlier plan Phase 5). Recommended: accept and write it down as the rule (nothing is lost, the archer can delete again). Alternative: `updated_at` and tombstones for equipment plus a prompt, a server change for a case that loses no data.
5. **Evaluations copy on sign-out.** Recommended: the queue of unsent evaluations stays under the account key (like notes), the read copy is removed on sign-out like the schedule cache (`src/composables/useScheduleCache.ts:94`), because it holds ratings of other people. Trade-off: a coach who signs out and in again offline has no copy until the next pull.

## What works offline today, per data type

| Data | Write offline | Read offline | Pull from server | Evidence |
|---|---|---|---|---|
| Sessions, ends, volume | yes, queue | yes | yes, `updated_after` + `/sessions/gone/` | **[fact]** `src/lib/log-sync.ts:152-180`, `src/composables/useLog.ts:258-276` |
| Media (own) | new and moving queued items; delete, move and visibility of uploaded ones online only | list and thumbnails (library), kept files up to the cap | yes, `updated_after` + `/gone/?kind=media` | **[fact]** `useMediaLibrary.ts:57-75`; online writes `useMoveMedia.ts:22`, `useClipVisibility.ts:32`, `MediaPlayerView.vue:549` |
| Notes | new notes queued; edit and delete of uploaded notes online only (decided with Tim, earlier plan Phase 4) | copy of notes about you and by you | yes, `updated_after` + `/gone/?kind=note` | **[fact]** `useNotes.ts:77-81`, `useNoteLibrary.ts:45-82`; online writes `NoteRow.vue:84,90`, `MediaPlayerView.vue:238` |
| Equipment (own) | yes, queue, app-made revision uids | yes | full list, no deltas, no tombstones | **[fact]** `useEquipment.ts:87-98`; no `updated_at` on `Bow`/`ArrowSet` (`server/equipment/models.py`) |
| Evaluations | no: `POST`/`PATCH` online (`EvaluationEditView.vue:133-134`), `POST` is not repeatable | no, `useRemote` without cache | no; no `uid`, no `updated_after`, no tombstone kind | **[fact]** `server/evaluations/models.py:43-69`, `views.py:113-126`; `Tombstone.Kind` is media and note only (`server/core/models.py:263-265`) |
| Teams, agenda, members of coached teams | no (schedule edits online, `useSchedule.ts`) | yes, schedule cache | full replace, 5 min max age | **[fact]** `useScheduleCache.ts:34-59` |
| Team roster (as archers see it) | n/a | no | no | **[fact]** `src/components/TeamRoster.vue:13` reads `/api/teams/{id}/roster/` with `useRemote` |
| Own profile | units only (pending flag, sent later); name, hand, picture online | name only | `GET /api/me/` | **[fact]** `useUnits.ts:22-40`, `useProfile.ts:165-179`, `ProfileView.vue:56` |
| Statistics (signed in) | n/a | no | no | **[fact]** `StatsView.vue:46-50` |
| Device calendar | n/a | the entries already in the phone's calendar stay | reads `/api/events/agenda/` from the server, not the schedule cache; offline sets status `offline` | **[fact]** `useDeviceCalendar.ts:47-52` |
| Coach views of other archers (profile, sessions, stats, ranking) | n/a | no | no | **[fact]** `useProfile.ts:77-86`, `useRemote` in 22 files; kept online on purpose (earlier plan Q10) |

Other facts that shape the steps:

- The media library and the notes copy pull on sign-in, on resume and after an upload, **not** when the connection returns (`useMediaLibrary.ts:84-87`, `useNoteLibrary.ts:85-88`); the log, equipment and schedule cache do (`useLog.ts:273`, `useEquipment.ts:174`, `useOnReconnect.ts`). **[fact]**
- No pull asks with an overlap: `since` is the newest stamp sent last time (`log-sync.ts:154,175`, `media-library.ts:56`, `note-library.ts:86`) and the server filters `gt` (`server/training/views.py:83`, `notes/views.py:56`, `media/views.py:45`, `core/gone.py:14`). **[fact]** The server runs SQLite with `transaction_mode: IMMEDIATE` and a 20 s lock timeout (`server/config/settings.py:113-119`), and `auto_now` is set before the write. **[inferred]** A request that took its stamp and then waited for the lock can commit after a later stamp the phone has already passed, so a row can be missed for good. Window: up to the 20 s timeout.
- `useSyncStatus` counts four queues and only the log's `gone` sessions as conflicts (`useSyncStatus.ts:16-24`). **[fact]**
- Every queued write is checked again by the server (access, visibility) for sessions, media, notes and equipment (earlier plan, "What is there already"). **[fact, from the plan, not re-read]**
- Upload order is per store with a `blocked` rule: equipment, sessions, media, notes (`useLog.ts:137`, `useNotes.ts:53-56`). **[fact]**
- `GET /api/health/` gives the server version to the app (`useServer.ts:75-100`). **[fact]**

**Unknowns**: how long a write request on the production server holds the lock in practice; whether Android Auto Backup restores ever happened for a tester; whether `adb shell cmd connectivity airplane-mode enable` works on Tim's phone without root **[check]**.

## Decisions (my recommendations; the open questions above override them)

1. **No central sync runner.** Kept as decided on 2026-11-03: each store pulls and drains itself. New entities follow the same shape (`useKeyedStore`, a pure reducer in `src/lib`, a `*-sync.ts` with `send` and `drain`, `useOnReconnect` for triggers).
2. **Conflict rule, one per entity, written into `offline-sync.md`.** Per record, last upload wins, a pull never overwrites an item with a waiting op. Per field merging is not done: it needs a base version per item, which is close to a sync engine. Sessions keep per item (session fields, each end, each volume entry), as today.
3. **Clock trust.** The phone's clock is never compared with the server's. Order comes from the order of uploads; `since` is always a server stamp. Unchanged from today.
4. **Edit against delete.** Sessions: ask (`gone`, Q3). Media, notes: a queued note on a deleted clip fails with the server's message, shown in the banner (today). Equipment: the edit wins (Q4). Evaluations: `PUT` to a deleted uid is 410 and the phone marks it `gone` with "Keep as new" or "Discard", like sessions.
5. **Pull overlap of 60 s** on every `updated_after` pull (sessions, media, notes, later evaluations): ask with `since - 60 s`, apply idempotently. 60 s covers the 20 s lock timeout with margin. Alternative: a server change counter (exact, but a server change for every entity). Cost of the overlap: changes of the last minute are fetched twice, for sessions one detail request each.
6. **Idempotency.** Every new write is `PUT /<entity>/<uid>/`. A repeated `PUT` with the same values changes nothing and sends no second push (as notes do today, `offline-sync.md:8`). Retry rule as today: no connection, 401 and 5xx keep the item queued; other 4xx mark it failed with the server's message; 410 is `gone`.
7. **Order.** Equipment, sessions, media, notes, evaluations. An evaluation waits while a clip or photo named as evidence is still in the media queue (the `blocked` rule of `useNotes`).
8. **Server before app.** Only evaluations need a server change. It is additive (new field, new route, new filter, new tombstone kind), so `MIN_APP_VERSION` stays (`specs/steering/releasing.md`, "App and server versions"). The server part ships in its own release first. The app uses the new route only when the server reports at least that version; against an older server it keeps today's online form.

## Steps

Each step is one PR and can be released alone. Steps 1 to 5 are app only.

### Step 0: baseline on the phone (no code)

- [ ] Run the airplane-mode checklist below against what is built today, on the Dev app and the Docker stack. Write the results into this plan. Anything broken becomes a fix before Step 1.

### Step 1: pull on reconnect, and the overlap (app only)

- [ ] `useMediaLibrary.ts`, `useNoteLibrary.ts`: replace the `appStateChange` listener with `useOnReconnect(() => void pull())`.
- [ ] `src/lib/sync-overlap.ts` (new, pure): `askSince(since?: string, overlapMs = 60_000)`.
- [ ] Use it in `log-sync.ts` `pull` (both the list and `/sessions/gone/`), `media-library.ts` `pullMedia`, `note-library.ts` `pullNotes`. `lastPull` stays the newest server stamp.
- [ ] Tests: `sync-overlap.test.ts`; `log-sync.test.ts` (the query carries `since - 60 s`; a session pulled twice with no waiting op gives the same state); `media-library.test.ts`, `note-library.test.ts` (an item pulled twice is one item; a tombstone seen twice is harmless).

### Step 2: no silent loss of a session change (app only, Q3)

- [ ] `log-model.ts` `sessionGone`: keep the session as `gone` when any non-delete op of it waits (session, end or volume), not only ends and volume.
- [ ] `keepGoneAsNew` already queues the session op; check that the waiting metadata goes up with the new id.
- [ ] Tests in `log-model.test.ts`: a tombstone for a session with only a queued metadata change gives `gone`; the double `sessionGone` case of 2026-11-03 still keeps it.

### Step 3: roster in the schedule cache (app only)

- [ ] `schedule-cache.ts`: `rosters: Record<string, RosterMember[]>` for every team you are in, read from `/api/teams/{id}/roster/` in `pullSchedule`, full replace like `members`. `EMPTY_SCHEDULE` gets `rosters: {}`; old files load through the `{ ...EMPTY_SCHEDULE, ...v }` merge (`useScheduleCache.ts:29`), so no migration.
- [ ] `TeamRoster.vue`: server first, the copy when the request fails, with the "as of" line the agenda uses. Pictures are links that the phone does not keep **[inferred]**, so offline shows the initials.
- [ ] Removed on sign-out with the rest of the cache (unchanged).
- [ ] Tests: `schedule-cache.test.ts` (roster replaced whole, a member who left is gone, old file without `rosters` loads).

### Step 4: own statistics from the device when offline (app only, Q2)

- [ ] `StatsView.vue` and `StatsHeatmapView.vue`, own statistics only (`/stats`, not `/archers/:id/stats`): when the server request fails, compute from the log (`computeStats`, `computeArrowStats` on `fromLog` of own sessions, `owner` unset), with an "as of the phone" line. Setups list stays online.
- [ ] Tests: a fallback test for the selection of sessions (sessions logged for another archer are left out).

### Step 5: docs for Steps 1 to 4

- [ ] `specs/design/offline-sync.md`: the conflict rule table per entity (Decisions 2 to 4), the overlap, roster cache, statistics fallback.
- [ ] `CHANGELOG.md`.
- [ ] If Q1 is "no": close #84 here, with a comment listing what stays online (end of this plan).

### Step 6: evaluations, server (server release first)

- [ ] `evaluations/migrations/000N_uid.py`: `Evaluation.uid`, three steps for SQLite (nullable, backfill `uuid4`, unique), as `notes/migrations/0006_uid.py` did.
- [ ] `PUT /api/evaluations/<uuid:uid>/`: create or update, same checks as `EvaluationSerializer` and `EvaluationPermission`; the author is the caller; another person's uid is 404; a deleted uid is 410 (tombstone lookup). Scores are replaced whole. A `media` the server does not have is a 400 on that field.
- [ ] Push: notify only on create with `shared` and on a change to `shared`, so a repeated `PUT` does not notify twice (`notify.evaluation_saved`, `notify.evaluation_shared`).
- [ ] `EvaluationFilter.updated_after` (`gt` on `updated_at`).
- [ ] `Tombstone.Kind.EVALUATION`; written on delete and when a shared one becomes coach only, for the archer and the author (who may have a copy); `GET /api/gone/?kind=evaluation`.
- [ ] `uid` read-only in `EvaluationSerializer`; `npm run types:api`.
- [ ] Tests: repeated `PUT` creates once and pushes once; `PUT` to a deleted uid is 410; a coach of another team gets 404 and nothing changes; access lost meanwhile (coach left the team) is refused; tombstone on delete and on unshare; `updated_after`.
- [ ] Release (next minor, e.g. 0.26.0) and deploy before Step 7 ships.

### Step 7: evaluations queue (app)

- [ ] `src/lib/evaluation-store.ts` (pure) and `useEvaluations` (`evaluations:<owner>`): queued evaluations `{ uid, archer, team, template_version, kind, date, comment, goals, visibility, scores, error?, gone? }`.
- [ ] `src/lib/evaluation-sync.ts`: `PUT` by uid; `blocked` while an evidence media is in the media queue and not uploaded; 410 gives `gone`.
- [ ] `EvaluationEditView.vue`: save goes to the queue when the server supports the route (version from `useServer`), else online as today. The draft is saved in the store while editing, so killing the app keeps it.
- [ ] Template versions: the form needs the team's current version on the phone. Cache it in the schedule cache per team you coach **[check]** size of a version.
- [ ] `useSyncStatus`: fifth kind `evaluations`, and its `gone` items as conflicts. `SyncView` lists them. Locales `sync.*`, `evaluations.*` in `en.ts` and `de.ts`.
- [ ] Account deletion removes the store (`onAccountDeleted`); sign-out keeps it and counts it in the sign-out prompt.
- [ ] Tests: `evaluation-store.test.ts`, `evaluation-sync.test.ts` (waits for its clip, 410 gives gone, 400 fails with message, retry on no connection).

### Step 8: evaluations read copy (app)

- [ ] `evaluation-library.ts` and `useEvaluationLibrary` (`evaluation-library:<owner>`): evaluations about you and by you, `updated_after` with overlap plus `/gone/?kind=evaluation`, triggers via `useOnReconnect`. Queued ones are not in the copy.
- [ ] `EvaluationListView.vue`, `EvaluationView.vue`: server first, the copy offline; edit, delete and share hidden offline (as for notes).
- [ ] Removed on sign-out (Q5) and with the account.
- [ ] Tests: pull applies twice idempotently; tombstone removes; queued item is not overwritten.
- [ ] Docs: `offline-sync.md`, `evaluations.md`, `data-model.md` (`uid`, tombstone kind), CHANGELOG ("Needs the new server").

## Verification on the phone (Step 0, and each step's own part)

Setup: the Docker stack on :8080 (`deploy/`), the Dev app `de.fletchr.app.dev` built in the main checkout with its `.env` and installed with `adb install -r` (never uninstall). The second device is the web app in a browser on the same account; server-side deletes through the API (the admin and `.delete()` behave differently for sessions, see the earlier plan). Airplane mode by hand, or `adb shell cmd connectivity airplane-mode enable|disable` **[check]**.

- [ ] Sessions: log ends offline, restart the app, reconnect: uploaded once. Change a session on both sides: the phone's queued change wins per item. Delete on the web, change only its notes on the phone offline: banner asks (after Step 2).
- [ ] Media: photo and clip offline, play before upload, note with drawing on it, reconnect: clip first, then note. Delete a clip on the web: gone from the phone's library after reconnecting without leaving the app (after Step 1).
- [ ] Notes: a note shared by a coach on the web appears on reconnect; an unshared one disappears.
- [ ] Equipment: offline edit against a web delete: comes back (Q4 rule).
- [ ] Team tab and roster offline after one online start (after Step 3).
- [ ] Statistics offline match the online numbers for the same data (after Step 4).
- [ ] Evaluations (after Step 7): fill one offline with a clip frame as evidence for a clip still queued, kill the app, reopen, reconnect: clip, then evaluation; the archer gets one push. Edit on the web and on the phone: the later upload wins. Delete on the web while the phone has an edit: banner asks.
- [ ] Sign-out with waiting items: prompt counts them; sign in again: they go up. Schedule cache and evaluation copy are gone after sign-out.

Each step also: `npm run type-check`, `npm test`, `cd server && uv run pytest`.

## Migration of existing local data

- Steps 1, 2: no format change. A session that was dropped before Step 2 is not recovered.
- Step 3: new field in the schedule cache; old files load through the merge with `EMPTY_SCHEDULE` **[fact]** `useScheduleCache.ts:29`.
- Steps 7, 8: new stores, nothing to move. The in-memory draft of today is not persisted, so there is nothing to carry over. Local mode has no evaluations (routes are `'account'`, `src/router/index.ts:47-49`), so `local-claim.ts` and the export are unchanged.

## Risks

- **Overlap misses longer waits.** If a request holds a stamp longer than 60 s (beyond the lock timeout) a row can still be missed. **[inferred]** unlikely with the 20 s timeout; a server counter is the exact fix if it ever shows.
- **Evaluation form against an old template version.** A coach offline uses the cached version; if the team changed the form meanwhile the server stores the old version, which it allows today for edits **[check]** that `PUT` accepts a version that is not the latest.
- **Old servers of other operators.** Without Step 6 on the server, the app must stay on the online form (version check). A wrong check would queue evaluations that a 404 marks failed, not lost.
- **Statistics fallback differs from the server** if the device log misses sessions (a pull that never completed). The "as of the phone" line says where the numbers come from.
- **Storage.** Thumbnails and copies have no limit (`offline-sync.md:56`); evaluations add little.

## Not in this plan

- Editing and deleting uploaded notes offline, and deleting, moving or changing the visibility of uploaded media offline: decided online with Tim (earlier plan Phase 4).
- Profile edits offline (name, hand, picture); only units are queued, as today.
- Schedule edits offline (trainings, events); the device calendar keeps its entries and is filled from the server.
- Coach views of other archers, ranking, team progress: online.
- Per-field merging, a sync engine (as in the issue).
- Equipment deltas and tombstones (Q4; the full list is small).
- Storage limits for thumbnails and copies (no measurement says one is needed).

## What was built differently

- **Step 0 (baseline) was not run as its own pass.** The paths that were changed were tried on the phone after the change (see the status line).
- **A 410 on an evaluation is a failed item, not a separate "gone" banner.** It stays in the queue with the server's message in the failed list of the sync screen; "retry" sends it as a new evaluation under a new uid, "discard" drops it. Sessions keep their own conflict banner. Reason: the failed list already has retry and discard, and a second conflict list for one kind is more screen than the case is worth.
- **The first try of a save runs at once and its refusal shows on the form** (the plan had refusals only in the banner). The person is still at the form then, so the server's words go where they can be fixed.
- **Templates are cached when a form is opened with a connection, not by the pull** (the plan said "in the schedule cache" without saying how). A pull would make a default form for every team that has none (`ensure_default` runs on the first read). Consequence: the form of a team has to be opened once with a connection before it works offline (a line says so).
- **The roster pull does not fail the schedule pull** when one team's roster cannot be read; that team is left out of the copy.
- **Editing offline is allowed for evaluations** (queued under the same uid); deleting and changing who reads it are not. The plan's Step 8 said all three were hidden, which contradicted Step 7.
- **Not done:** the evaluation copy does not show a change that is waiting to upload on the read screen (the edit form does show it); the draft kept on the phone is never dropped except by saving or cancelling.
