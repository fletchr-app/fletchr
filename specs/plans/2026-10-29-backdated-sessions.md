# Training in the past: date and time when starting a session (#89)

Status: planned (Q1 to Q5 need Tim's answers)
Date: 2026-10-29

## Scope

- `NewSessionView` gets a start time (default now) and, for a start in the past, a duration. Same for an archer, a coach logging for a managed profile (`?for=`) and a coach opening a session (`?open=1`).
- A session started in the past is created finished (`ended_at` set), never open, so it is never live and its #82 merge window is `started_at` to `ended_at`.
- Not in the future; a look-back limit (Q1).
- Changing the start time of an existing session: Q2.
- Out of scope: a finish time for a session that was forgotten open (finishing it tomorrow still sets `ended_at` to now, as today; see Risks), import of old score sheets.

## What is there already (checked in the code)

- `src/composables/useLog.ts`: `startSession(type, environment, location, gear?, archer?, extra?)` sets `started_at: new Date().toISOString()`, `ended_at: null`. `finishSession(id, finished)` sets `ended_at` to now or `null`.
- `src/lib/log-model.ts`: `LogSession.started_at`/`ended_at` are ISO strings; `updateSession` patches only `ended_at | location | environment | gear | details | type`, so `started_at` cannot change after creation.
- `src/lib/log-sync.ts` `send` uploads `started_at` and `ended_at` as stored (lines 23 to 24); the pull (line 150) copies the server's values.
- `src/views/NewSessionView.vue`: no date field. Three modes in `start()`: open (`startSession('', ..., { keep: true, noResults })`), for a managed archer, own session; then `router.replace('/training/<id>')` and, for ends, straight to the first end.
- `src/views/TrainingSessionView.vue`: `onBeforeRouteLeave` deletes a session without `keep` and without results; "Finish"/"Reopen" call `finishSession`; ends and volume can be added to a finished session (`newEnd` does not check `ended_at`).
- Lists: `src/lib/session-rows.ts` `sessionRows` sorts with `b.started_at.localeCompare(a.started_at)` (works only while every value is UTC with `Z`, as `toISOString()` and DRF write them); `weekStart`/`arrowsSince` use the device's clock. Dates are shown with `toLocaleString()`/`toLocaleDateString()` (`SessionListItem.vue`, `ArcherSessionsView.vue`, `TrainingSessionView.vue`, `SessionDetailView.vue`, `TeamOverview.vue`).
- Media: `src/lib/media-days.ts` groups the gallery by the local day of `taken_at` (not the session's day); `MediaView` uses `picked.takenAt ?? now`. Server `Media.Meta.ordering = ["-taken_at", ...]`.
- Server: `TIME_ZONE = "UTC"`, `USE_TZ = True`. `SessionWriteSerializer` has no check on `started_at`/`ended_at` (any value, also `ended_at < started_at`). `SessionDetailView.put` runs `merge_if_possible` when `started_at` or `ended_at` change; `COACH_FIELDS` includes `started_at`, so a coach may move the start of a session they opened. `training/merge.py` `window()` = `started_at` to `ended_at or started_at + OPEN_SESSION_CAP` (4 h). `TeamOverviewView` `live` = `ended_at is None and now - updated_at < LIVE_WINDOW` (3 h). Stats take `tz` from the app (`StatsView.vue`, `StatsHeatmapView.vue` send `Intl...timeZone`).
- No date picker in the app yet. Ionic has `IonDatetime` / `IonDatetimeButton` (in `@ionic/vue` 9); its value is a local time without offset (`2026-10-28T17:00:00`), which `new Date(value)` reads as local time [ECMAScript date-time string format: forms without an offset are local; check in a test].

## Decisions (need Tim's confirmation)

1. **Q1, look-back limit.** Recommended: **31 days**, as `MAX_BACKDATE_DAYS` in the new `src/lib/session-time.ts`, enforced in the app only. Reason: covers "yesterday's training" and "last week's tournament" with room; stats show 12 weeks, so older sessions would mostly land outside the volume chart anyway. Not on the server, so a later import feature or a change of the number needs no server release. Alternative: 7 days (tighter, but a coach catching up after a holiday cannot).
2. **Q2, changing the start of an existing session.** Recommended: **in scope, small**: a "Change time" link on `TrainingSessionView` opens the same start/duration fields for a local session (`updateSession` accepts `started_at`, plus `ended_at` for a finished one). Same rules (not in the future, look-back limit). The server already accepts it and re-runs the merge. Reason: a session started on the wrong day is the same bug from the other side, and the code is the same picker. Not for server-only sessions (`/sessions/:id`, read-only).
3. **Q3, end time or duration.** Recommended: **duration** as a `ChipGroup` (1 h, 1.5 h, 2 h, 3 h, 4 h; default 2 h), `ended_at = min(started_at + duration, now)`. Reason: one tap, no second date picker, no midnight case; the end only has to be roughly right for the merge window. Alternative: an end time picker (exact, but two more taps and an end-before-start error to handle).
4. **Q4, when is a start "in the past".** Recommended: more than **15 minutes** before now (`BACKDATE_THRESHOLD_MIN`). Up to that, it is a normal open session with the picked start (someone starting the app a few minutes late). Beyond, created finished.
5. **Q5, server check.** The issue says app only. Recommended: add one cheap guard in `SessionWriteSerializer.validate`: `ended_at >= started_at` (400). No future check on the server: a phone with a clock a few minutes ahead would get its queued session refused for good. Old apps are not affected (they send now/now).
6. **Not live, ever** (recommended, follows from the issue): a backdated session is created with `ended_at`. "Reopen" is hidden on a session whose `started_at` is older than 4 h (the merge cap), since reopening would make it live and give it a capped window; results can still be added to it while finished.
7. **Kept when empty** (recommended): a backdated session gets `keep: true`, so going back to Home before adding results (only photos, or notes later) does not delete it.
8. **Time zone** (recommended, mostly already so): the picker works in the phone's local time; the value is stored with `new Date(local).toISOString()` (UTC, `Z`), never with an offset, so `sessionRows`' string sort stays right. Coach and archer in the same time zone see the same day. In different zones the day can differ by one, which is correct for each viewer and accepted [inferred: teams train in one place].

## App

1. `src/lib/session-time.ts` (new, pure, no Vue): `MAX_BACKDATE_DAYS`, `BACKDATE_THRESHOLD_MIN`, `DURATIONS_MIN`; `startRange(now)` → `{ min, max }` as local `YYYY-MM-DDTHH:mm` for `IonDatetime`; `sessionTimes(startLocal: string, durationMin: number, now: Date)` → `{ started_at, ended_at | null }` or `{ error: 'newSession.inFuture' | 'newSession.tooOld' }` (message keys, per `specs/steering/i18n.md`); `canReopen(session, now)`.
2. `src/lib/log-model.ts`: `updateSession` patch type adds `started_at` (Q2).
3. `src/composables/useLog.ts`: `startSession` takes `times?: { started_at: string; ended_at: string | null }` (default now/null; keep the signature otherwise, or move `times` into `extra`); new action `setTimes(id, times)` (Q2).
4. `src/views/NewSessionView.vue`: a "Started" row with `IonDatetimeButton` + `IonDatetime` in an `IonModal` (`presentation="date-time"`, `min`/`max` from `startRange`, `locale` from `currentLanguage()`), default now. When the pick is past the threshold: the duration `ChipGroup`, the button reads "Save" instead of "Start", `keep: true`. Read `route.query` once, as now. For ends sessions in the past the flow still goes to the first end (results of yesterday). `ErrorText` for the refused cases.
5. `src/views/TrainingSessionView.vue`: hide "Reopen" when `!canReopen`; "Change time" link (Q2) to a small sheet or route `/training/:id/time` reusing the fields (a component `SessionTimeFields.vue` shared with `NewSessionView`).
6. `src/locales/en.ts` and `de.ts` under `newSession`: `startedAt` ("Started" / "Beginn"), `now`, `duration` ("Duration" / "Dauer"), `hours` (plural), `save`, `inFuture` ("The start can't be in the future"), `tooOld` ("At most {days} days back"); `session.changeTime`. German wording to check with Tim.
7. `src/router/index.ts`: the `/training/:id/time` route if it is a page (Q2), `meta.auth: 'in'`.

## Server

1. `training/serializers.py` `SessionWriteSerializer.validate`: `ended_at` before `started_at` → 400 (Q5), compared with the instance's stored value on a partial update (coach metadata mode).
2. `server/locale/`: the new `gettext` text, German in `translate_de.py`.
3. No API change, so no `npm run types:api` (unless Q5 changes the schema description).

## Tests

App (Vitest):
- `src/lib/session-time.test.ts` (new): now gives an open session; 10 minutes ago open with that start; yesterday 17:00 + 2 h gives both times, `ended_at` set; duration past now is clamped to now; a start one minute in the future → `inFuture`; `MAX_BACKDATE_DAYS` exactly allowed, one day more → `tooOld`; `startRange` bounds; `canReopen` false for yesterday.
- Time zone case in the same file: run with `process.env.TZ = 'Europe/Berlin'` set before the first `Date` (or `test.env` in `vitest.config.ts`) [check that Node picks it up in the worker]: local `2026-10-28T23:30` stores `2026-10-28T22:30:00.000Z`, and `toLocaleDateString` gives the 28th; a start late on 25 October (DST change) is right.
- `src/lib/log-model.test.ts`: `startSession` with `ended_at` set queues one session op and the session is finished; `updateSession` with `started_at` (Q2).
- `src/lib/session-rows.test.ts`: a session added today for yesterday sorts between yesterday's and today's sessions and is `finished`; `arrowsSince(weekStart)` counts it only when yesterday is in this week.
- `src/lib/log-sync.test.ts`: the uploaded body carries the backdated `started_at` and `ended_at`.
- `src/locales/locales.test.ts` covers the new keys.

Server (`cd server && uv run pytest`):
- `training/tests/test_training.py`: `PUT` with yesterday's `started_at` and `ended_at` 201, listed in `started_at` order among others; `ended_at < started_at` 400 (Q5); a coach moves the start of a session they opened (already allowed, add a test).
- `training/tests/test_overview.py`: a backdated finished session updated just now is `last_session` only if newest and never `live`.
- `training/tests/test_merge.py`: an archer's backdated session (yesterday 17:00 to 19:00) merges with a coach's empty session opened yesterday 17:05; it does not merge with today's sessions; moving the start (Q2) re-runs the merge.
- `media/tests/test_media.py`, `notes/tests/test_notes.py`: media and a note attach to yesterday's session.

## Docs

- `specs/design/screens.md` (archer item 2 already says "date"; add duration and the coach's open mode), `offline-sync.md` (a past session is created finished), `data-model.md` (only if Q5 lands: `ended_at >= started_at`).
- `CHANGELOG.md`.

## Order

- [ ] 1. Answers to Q1 to Q5.
- [ ] 2. `session-time.ts` and its tests, incl. the time zone case.
- [ ] 3. `log-model`, `useLog` (`startSession` times, `setTimes`); tests.
- [ ] 4. `NewSessionView` with `SessionTimeFields.vue`; locales.
- [ ] 5. `TrainingSessionView`: no reopen for past sessions, "Change time" (Q2).
- [ ] 6. Server validation (Q5), locale; server tests incl. overview, merge, media, notes.
- [ ] 7. Docs, changelog.
- [ ] 8. `npm run type-check`, `npm test`, `cd server && uv run pytest`, `npm run build-only`, `npx cap sync android` (no new plugin).
- [ ] 9. On the phone: coach opens a session for yesterday, adds a photo; archer sees it on yesterday's date in the training list; not live in the team overview.

## Risks

- **Forgotten open sessions** (existing, not caused by this): finishing yesterday's open session today sets `ended_at` to now, so its window spans a day and can swallow a coach's empty session today in a merge. Worth a follow-up issue (finish time = last end, or a cap).
- **Media day vs session day**: the gallery groups by `taken_at`. A photo taken today with the camera for yesterday's session shows under today in the archer's gallery, under the session on the session's media page. Accepted (it was taken today); gallery picks carry their own date.
- **Clock of the phone**: "not in the future" is checked against the phone's clock; a wrong clock lets a slightly future start through. The server does not refuse it (Q5), on purpose.
- **Old app versions** are not affected: they keep sending now.
