# Coach opens a session for an archer (#82)

Status: implemented (Tim approved Q1 to Q7 as recommended, with two changes: the open-session cap stays 4 h, and the app-side "add to the running session" offer is out of scope)
Date: 2026-10-28

Part of #84 (offline and two-way sync); follows its conventions: ids made by the app, repeatable `PUT`, `updated_after` plus tombstones.

## Scope

- A coach or admin opens a session for an archer of their team (also a managed profile), to attach photos, videos and notes without results. The app makes the UUID.
- `TrainingSession.type` may be empty; the archer chooses it when adding the first results.
- Sessions that exist only on the server (opened by a coach) reach the archer's phone (training list, media screen, adding results).
- Two sessions for the same training (coach's and archer's) are merged on the server; the merged-away id stays as an alias, and the phone replaces it.
- Out of scope: a general pull for other entities (#84), media both ways (#83), undoing a merge.

## What is there already (checked in the code)

- `server/training/models.py`: `TrainingSession` (`type` required, `TextChoices`), `End`, `Shot`, `VolumeEntry`. No field says who opened a session.
- `server/training/views.py`: `SessionDetailView.put` looks the id up with `TrainingSession.objects.filter(pk=...)`, creates with `?owner=` only if `core.claims.can_write_sessions_of` (owner, or a coach of a managed profile). Every later write goes through `get_session(..., write=True)`, so a coach repeating the `PUT` for a normal archer gets 403 today. `EndView`, `VolumeEntryView` also use `get_session`; nothing checks the type against ends or volume.
- `SessionFilter` has `updated_after` (on `updated_at`). No record of deleted sessions.
- `TeamOverviewView`: `last_session` is the latest by `started_at` (any session), `live` = no `ended_at` and `updated_at` within `LIVE_WINDOW` (3 h).
- Stats (`StatsView`, `PositionsView`, `ArrowStatsView`, `TeamRankingView`, `arrows_7d` in the overview) are built from `Shot` and `VolumeEntry` rows, so a session without results adds nothing by construction. `compute_stats` reads `session_type` only for the `competition` flag.
- `media.access.can_add_for` = `archers_visible_to` (the `?owner=` rule for media). `MediaWriteSerializer.session` and `NoteSerializer.session` are `PrimaryKeyRelatedField(queryset=TrainingSession.objects.all())`: an old (merged-away) id would be a 400, and `media-queue.ts` then uploads the clip without a session.
- `Media.session` and `Note.session` are `SET_NULL`; `Note.end` too.
- App: `src/lib/log-model.ts` (`SessionType`, `usesEnds`, `LogSession`, `Op`, `reduce`; `queue` keeps a session op ahead of its ends), `src/lib/log-sync.ts` (`send`, `drain`, `fetchEquipment`; upload only), `src/composables/useLog.ts` (store per user and server, `startSession`, `sessionWaiting`), `src/composables/useMedia.ts` + `src/lib/media-queue.ts` (items carry `session`), `src/lib/session-rows.ts` (local rows plus server-only rows, the latter open read-only at `/sessions/:id`).
- `TrainingListView`, `HomeView` and `ArcherSessionsView` already list server-only sessions while online. What is missing: offline, adding results to them, and the label for an empty type.
- `$t(\`sessionType.${type}\`)` in `SessionListItem.vue`, `ArcherSessionsView.vue`, `TrainingSessionView.vue`, `SessionDetailView.vue`, `TeamOverview.vue`, `NewSessionView.vue`.
- `ArcherSessionsView` shows "Start session for" only for managed profiles (`/training/new?for=<id>&name=`).
- `SPECTACULAR_SETTINGS["ENUM_NAME_OVERRIDES"]["SessionTypeEnum"]`; version 0.9.2; `MIN_APP_VERSION` 0.1.0.

## Decisions and open questions

Recommendations are marked; the ones Tim has to decide are numbered **Q**.

1. **Who opened it** (recommended, needed by several points below): new field `TrainingSession.opened_by` (FK user, null, `SET_NULL`), set on create. It tells the archer's session from a coach's for the merge, and lets the coach who opened a session edit its metadata (`ended_at`, location, notes fields) but never its results or type. Existing rows: `null`, treated as opened by the owner.
2. **Q1, both empty: who wins.** Recommended rule, the same whatever order the uploads come in:
   - Only a session opened by someone other than the owner (`opened_by != owner`) and without ends and volume can lose. Two sessions both opened by the archer (two phones) are never merged.
   - So archer vs coach: the archer's wins, empty or not. Coach vs coach (two coaches, or a managed profile): the one with results wins; if both are empty, the earlier `started_at`, then the smaller UUID. Both values come from the app, not from the arrival order.
   - This keeps the archer's own session id stable, so the phone rarely has to replace an id it made itself.
3. **Q2, when the merge runs.** Recommended: `training/merge.py: merge_candidates(session)` and `merge(loser, winner)`, called in one transaction after (a) a session is created, (b) `started_at`/`ended_at` change, (c) the first end or volume entry of a session arrives (it may now be a winner for a waiting empty one). Not on every end. The pair rule above makes the result independent of upload order; the "more than one candidate" rule is not (see Risks), which is accepted and written down.
4. **Q3, alias chains.** Recommended: rewrite on each merge (`SessionAlias.objects.filter(session=loser).update(session=winner)` before adding `loser -> winner`), so every lookup is one hop. A loop cannot form because the loser row is deleted.
5. **Q4, the window of an open-ended session (decided: 4 h, no "add to the running session" offer).** `OPEN_SESSION_CAP` in `training/merge.py`. The issue says 4 h; a competition day (qualification plus elimination) can run longer [inferred, check a real schedule]. Recommended: **8 h**, plus prevention in the app: when a coach opens a session for an archer who has a live session (`live` in the overview, or an open session today), offer "Add to the running session" instead. Trade-off: a longer cap makes a coach's never-ended session overlap a later session the same day; the "more than one candidate" rule and the "loser must be coach-opened and empty" rule limit the damage (only media and notes move, no results). Alternative: start times within 1 h of each other as an extra condition (covers "seconds later", nothing else).
6. **Q5, what the phone keeps of server-only sessions.** Recommended: the pull puts into the local log only your own sessions without results opened by someone else (coach-opened), not every server session, so this issue does not open conflicts on results edited on two devices (#84). They are stored without a queued op; the first local change queues one.
7. **Tombstones** (recommended): one table `SessionTombstone(id UUID pk, owner, merged_into FK null SET_NULL, at)`. A merge writes a row with `merged_into`; a delete writes one without. `GET /api/sessions/gone/?owner=&updated_after=` lists them (additive endpoint, the list endpoint keeps its shape). Lookup of an id: session, else tombstone with `merged_into`, else 404 / create.
8. **Q6, writes to an alias.** Recommended: `PUT /sessions/<old>/` and its ends/volume go to the winner (`resolve_session_id`), the response carries the winner's `id`. `DELETE /sessions/<old>/` removes nothing but answers 204 (the phone deleted its copy of the coach's session; the winner must stay). A `PUT` to a deleted id (tombstone without `merged_into`) answers 410, and the app drops the session; today it would be created again.
9. **Type** (recommended): `blank=True`, `SessionWriteSerializer.validate` refuses a change of `type` when the instance has ends or volume entries (comparison with the stored value, so the phone resending the same type is fine). `EndView` and `VolumeEntryView` refuse a session with an empty type ("Choose the type of session first"); the session op goes up before its ends, so the normal flow passes.
10. **Q7, the team overview.** Does an empty coach-opened session count as the archer's `last_session` and as `live`? Recommended: yes for `last_session` (labelled "Session"), no for `live` unless it has results, so the overview does not show "live" for 3 h after a coach took one photo.

## Server

1. `training/models.py`: `type` `blank=True`; `opened_by`; `SessionTombstone`. Migration `training/0002_...` (no data change; `opened_by` stays null for old rows).
2. `training/merge.py` (new): `OPEN_SESSION_CAP`, `window(session)`, `has_results(session)`, `merge_candidates(session)` (same owner, overlapping windows, not itself, one side may lose by decision 2), `pick_winner(a, b)`, `merge(loser, winner)` (move `Media`, `Note` rows; fill the winner's empty fields from the loser, the archer's values win; tombstone; rewrite older tombstones pointing at the loser; delete the loser; `touch(winner)`), `merge_if_possible(session)` (skip when the empty one has more than one candidate). `resolve_session_id(id)`.
3. `training/views.py`:
   - `SessionDetailView.put`: resolve the alias first; create for `?owner=` when `media.access.can_add_for` (any archer you coach) and set `opened_by`; for an existing session allow the owner, `can_write_sessions_of`, or `opened_by == user` (metadata only, `type` and results stay with the owner). Call `merge_if_possible`; return the winner (200 with its `id` when the requested id was merged away).
   - `delete`: tombstone; alias → 204 without deleting.
   - `EndView`, `VolumeEntryView`: resolve the alias; refuse an empty type; after the first result call `merge_if_possible`.
   - `get_session`: resolve the alias (reads of an old id show the winner).
   - `SessionTombstoneListView` at `sessions/gone/` (`owner`, `updated_after`), in `urls.py` before `sessions/<uuid>/`.
   - `TeamOverviewView`: `live` only with results (decision Q7).
4. `training/serializers.py`: `SessionWriteSerializer` `type` allow blank, validate the change rule; `SessionSerializer`/`SessionSummarySerializer` expose `opened_by` (and name) so the app can tell a coach's session; `SessionTombstoneSerializer`.
5. `media/serializers.py` (`MediaWriteSerializer.validate_session`) and `notes/serializers.py`: accept an alias id and store the winner (a field that resolves through `resolve_session_id`), so queued clips keep their session.
6. `server/locale/`: new `gettext` texts (type change refused, choose the type first), German in `translate_de.py` (see `specs/steering/i18n.md`).

## API and version

- `npm run types:api` after the serializers and views. Changes: `SessionTypeEnum` gets a blank case (spectacular adds `BlankEnum`), `opened_by` in session responses, `GET /api/sessions/gone/`, 410 on `PUT`. All additive for old apps, except: an old app showing a session with an empty type reads `sessionType.` (missing key, shows the key). Acceptable, `MIN_APP_VERSION` stays; the version banner already warns when the server is newer.
- Version numbers change only at release (`specs/steering/releasing.md`); this is a minor feature, so 0.10.0 then.

## App

1. `src/lib/log-model.ts`: `SessionType` gets `''`; `usesEnds('')` false; `LogSession` gets `opened_by?` and `fromServer?`; new actions `pulled` (insert server-only sessions, no op) and `replaceSessionId { from, to }`: rewrites `sessions`, the `sessionId` and `key` of queued ops; if `to` is already local, moves ends and volume of `from` into it, numbering moved ends after the existing ones and queuing them again, and fills empty fields. A `setType` path in `updateSession` allowed only while the session has no ends and volume.
2. `src/lib/media-queue.ts`: `renameSession(items, from, to)` (pure), used by `useMedia`.
3. `src/lib/log-sync.ts`: `send` reads the returned `id` of a session `PUT` and returns `{ kind: 'ok', mergedInto }`; `drain` dispatches `replaceSessionId`; 410 → drop. New `pull(api, userId, since)`: `GET /api/sessions/?owner=&updated_after=` (keep decision Q5's filter) and `GET /api/sessions/gone/`, returns actions; the caller dispatches them. Store `lastPull` in `LogState`.
4. `src/composables/useLog.ts`: run `pull` after sign-in, on resume (`appStateChange`) and on reconnect, before `flush`; call `useMedia`'s rename on `replaceSessionId` (the media store is separate). Screens that hold an old id (`TrainingSessionView`, `MediaView` read `route.params`/`query` once): when the id is replaced, `router.replace` to the new one (a small `watch` on a `renamed` map in `useLog`).
5. Coach side: `ArcherSessionsView` gets "Open session" for every archer (not only managed), to `/training/new?for=<id>&name=&open=1`; `NewSessionView` with `open`: type optional (chip "Not set"), no ends, no equipment; goes to the session screen with media and notes. Before creating, if the archer has a live or open session today, offer to add to it (decision Q4).
6. Archer side: `TrainingSessionView` for an untyped session shows the type chips (`ChipGroup`) before "Add end"/"Add arrows"; choosing one sets the type, then the usual flow.
7. Labels: every `$t(\`sessionType.${...}\`)` goes through one helper `sessionTypeKey(type)` in `src/lib/log-model.ts` (returns `sessionType.unset` for `''`), so no screen shows a raw key.
8. `src/locales/en.ts` and `de.ts`: `sessionType.unset` ("Session" / "Training"), `archer.openSession` ("Open session" / "Training anlegen"), `newSession.typeNotSet`, `newSession.openTitle`, `newSession.addToRunning`, `training.chooseType`, `training.openedBy` ("Opened by {name}"). German wording to check with Tim.
9. `npm run type-check`, `npm test`, `npm run build-only`, `npx cap sync android` (no new plugin), check on the phone.

## Tests

Server (`server/training/tests/test_open_session.py`, `test_merge.py`, additions to `test_stats.py`, `test_overview.py`, `test_ranking.py`, `test_arrow_stats.py`, `server/media/tests/`, `server/notes/tests/`):
- Create: coach for an archer 201 with `opened_by`; for a managed profile; admin; other team 404; archer for another archer 404; coach repeats the `PUT` 200 and may set `ended_at`; coach may not add ends (403) or set the type for a normal archer.
- Archer adds ends and volume to a coach-opened session.
- Type: empty allowed; set while empty 200; change with an end 400, with a volume entry 400; same value resent with ends 200; end and volume on an untyped session 400.
- Stats ignore empty sessions, per endpoint: `/api/stats/`, `stats/positions/`, `stats/arrows/`, `teams/<id>/ranking/`, `arrows_7d` in the overview; one untyped empty session and one typed (`competition`) session with zero results in each fixture.
- Merge: coach empty + archer with results, both upload orders give the same winner and the same moved media and notes; coach empty + archer empty (archer wins), both orders; two coaches empty (earlier start wins), both orders; two archer-opened sessions never merge; both with results no merge; no overlap no merge; open-ended capped (`OPEN_SESSION_CAP` exactly and one minute past); several candidates no merge; field fill (archer's values win, empty filled).
- Alias: chain A into B, B into C, then `PUT` end under A lands in C; `PUT` session under the old id returns the winner; `DELETE` on the old id 204 and the winner stays; media and note upload with the old session id store the winner; `sessions/gone/` lists the alias with `updated_after`; deleted session gives a tombstone and `PUT` 410.
- Overview: empty coach session is `last_session`, not `live`.

App (Vitest):
- `log-model.test.ts`: `replaceSessionId` (sessions, op keys and order, `to` already local with ends: renumbering and re-queue), `pulled` (no op, no duplicate, not over a local session), type set only while empty, `sessionTypeKey`.
- `log-sync.test.ts`: `send` returns `mergedInto` when the response id differs; 410 drops; `pull` turns list plus tombstones into actions (mock `ApiClient` as the existing tests do).
- `media-queue.test.ts`: `renameSession`.
- The locales test covers the new keys.

## Docs

- `specs/design/data-model.md` (`opened_by`, empty type, tombstones), `offline-sync.md` (pull, aliases, conflict rule for sessions), `roles-and-access.md` (coach opens sessions, edits only metadata), `statistics.md` (empty sessions not counted), `screens.md`.
- An ADR for the merge rule (alternatives: no merge and a manual "join" button, merge on the client, merge on every write). Recommended, since the rule is not obvious later.
- `CHANGELOG.md`; mark #82 in the milestone plan when done.

## Order

- [x] 1. Answers to Q1 to Q7.
- [x] 2. Server: model, migration, type rule, create for an archer, `opened_by` writes; tests.
- [x] 3. Server: `merge.py`, tombstones, alias resolution in sessions, ends, volume, media, notes; `sessions/gone/`; tests incl. reversed order and chains.
- [x] 4. `npm run types:api`; app: `log-model` (type `''`, `sessionTypeKey`, `replaceSessionId`, `pulled`), `media-queue` rename, `log-sync` `pull` and `mergedInto`; Vitest.
- [x] 5. App screens: coach "Open session", type choice on an untyped session, labels, route replacement; locales.
- [x] 6. Docs, ADR ([0004](../adrs/0004-merging-sessions.md)), server locale.
- [x] 7. `npm run type-check`, `npm test`, `cd server && uv run pytest`.
- [ ] 8. On the phone: coach opens offline, archer opens seconds later, both go online in either order (not done by the session that built it).

## Deviations from the plan

- App item 5: no "add to the running session" offer (out of scope). The open-session screen has no type chip: the type is chosen by the archer (for a profile without an account, by the coach in the session screen).
- The pull fetches the detail of each coach-opened session it takes over, so weather, goals and notes are not overwritten by the first upload.
- Local copies a coach holds of a session that went into an archer's (the coach cannot write its results) are dropped; the server view of the winner takes over. Media queued under the old id follows the rename.
- Server tests for statistics are in `test_open_session.py` (one test over all endpoints) instead of in each stats test file; alias tests for notes share the field with media and are tested through media.
- New app fields on `LogSession`: `keep` (never removed for being empty), `noResults` (this device only attaches media and notes), `opened_by`, `opened_by_name`; `LogState.lastPull`.
- `PUT /api/sessions/<id>/` by a coach who is not the owner ignores fields outside times and notes instead of answering 403, so a coach's queued body (which has `type: ""`) does not fail after the archer chose a type.

## Risks

- **Order dependence with three sessions.** Coach's empty session C, archer's morning M and a later session E all inside C's window: if C and M arrive before E, C merges into M; if M and E are both there first, C stays separate. Accepted; the app-side prevention (Q4) makes it rare.
- **Results under an old id.** Results the archer added offline to a pulled coach session that was merged meanwhile go to the winner. If the winner has ends with the same index, the end `PUT` fails (unique index); the client renumbering in `replaceSessionId` fixes it after the next pull, until then the op shows as failed in `SyncBanner`.
- **No undo.** A wrong merge moves media and notes; there is no unmerge. Only coach-opened empty sessions can lose, so no results are lost.
- **Coach edits after the merge.** A coach's queued metadata `PUT` under the old id reaches the archer's session, where the coach may not write: 403 and a failed op on the coach's phone. Recommended: on an alias, a non-owner `PUT` only fills empty fields and answers 200.
- **SQLite and concurrent creates.** Writes are serialized, so the second create sees the first; keep `merge` inside `transaction.atomic`.
- **Old apps** see an empty type (missing label) and, after a merge, their copy of a merged session keeps the old id; writes still land through the alias.
