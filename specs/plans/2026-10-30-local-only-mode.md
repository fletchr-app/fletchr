# Local-only mode: use the app without an account or server (#93)

Status: implemented in one change, not run on a phone
Date: 2026-10-30

## Scope

- A third auth state, `local`, next to signed in and signed out. The router lets it through, `useAuth` exposes it and a stable local owner id (`StoreOwner` `{ kind: 'local', id }`, key `<store>:local:<uuid>`, already in `store-owner.ts`).
- Sessions, ends, volume, equipment, notes (with drawings on photos if feasible), photos and videos, statistics and heatmap work from the device. Screens that need a server are hidden or replaced.
- **Decided by the maintainer**: (1) first version is local data plus JSON export and import as the backup; uploading local data to an account on sign-in/register is **not** built, but nothing may make it harder. (2) Statistics and heatmap are computed on the device, ported to `src/lib`, tied to the server by shared fixtures; scoring is tied the same way for every face. If app and server disagree, fix the app and report it.
- Out of scope: the upgrade upload, merge with an account's own data, Android backup configuration (reported, not decided), team features offline.

Markers: **[fact]** checked in the code, **[inferred]**, **[check]**.

## What is there already (checked in the code)

- `store-owner.ts` has the `local` owner type and key **[fact]**. `useLog`, `useEquipment`, `useNotes`, `useMedia` key their stores by `useAuth().storeOwner` and upload only when `status === 'signedIn'` **[fact]**, so with a local owner they keep everything and send nothing. The outbox keeps one op per item (`queue` replaces by key), so it stays bounded and is exactly the list the later upgrade upload needs.
- Score of a shot: `src/lib/scoring.ts` is tested against `shared/scoring-vectors.json`, which covers 10 of the 16 faces **[fact]**; the server recomputes every score on upload.
- Statistics are server-only: `training/stats.py`, `arrow_stats.py`, `PositionsView`, rendered by `StatsView`, `StatsHeatmapView` through `useRemote` **[fact]**.
- `export-file.ts` `saveJson` writes a string to `Directory.Cache` and opens the share sheet; it is used by the server data export only **[fact]**.
- Android: `allowBackup="true"`, no `fullBackupContent` or `dataExtractionRules` **[fact]** (see the report in the design doc after Phase 5).
- Notes use `archer: number`; `Number(null)` is 0, so a local archer is id 0 (`LOCAL_ARCHER`) **[inferred]**.

## Phase 1: auth state, router, shell

- [x] `src/lib/local-mode.ts` (new, pure): keys, parse of the stored flag and id, so it can be tested.
- [x] `useAuth`: `status` gets `'local'`; `isLocal`; `localId` made once with `newId()` and kept in Preferences (`local-owner-id`), the on/off flag in `local-mode`; `enterLocal()`; `storeOwner` is the local owner while `status === 'local'`; signing in/registering/Google sets tokens, which turns the flag off and keeps the id and all data (nothing deleted, nothing uploaded); `signOut` of an account lands on the sign-in screen.
- [x] Router: `meta.auth` `'in'` (signed in or local), new `'account'` (signed in only, local goes to `/`), `'out'` unchanged but open to local so "Sign in or register" works. Server-only routes get `'account'`: join team, team, agenda, forms, ranking, progress, evaluations, archers, events, account, profile, privacy (replaced), `/sessions/:id`.
- [x] `App.vue`: tab bar for local (no Team tab: `isCoach` is false without teams), watchers for `local`.
- [x] `SignInView`: a clear second choice "Use without an account" with two lines of text (data stays on the phone, export in Settings, signing in later does not upload it).
- [x] `SettingsView` in local: no teams, account rows or sign-out; "Sign in or register" with the "nothing is uploaded" text; "Your data" opens the export/import screen; the server address and the video Wi-Fi setting are hidden; theme, language, units stay.
- [x] `HomeView`, `TrainingListView`: local source only (no `/api/me`, no `useRemote`, no teams, evaluations or goals).
- [x] `SyncBanner` and the sign-out count: nothing waiting is shown in local; `useTeams`, `useAgenda`, `useUnits`, `useMediaLibrary` stay quiet (they check `signedIn` already; verified, not assumed).

## Phase 2: scoring check (shared fixture, all faces)

- [x] Find which faces `scoring-vectors.json` does not cover (wa-80, wa-60, wa-40-triple-triangle, wa-40-triple-vertical-compound, wa-field-60, wa-field-40) and add vectors for them, computed from the ring diameters in `target-faces.json` independently of the code under test (on the line, just outside, centre, beyond the face), documented in the file.
- [x] Both test suites check coverage: every face of the catalogue has a vector for every ring value (on the line and just outside) and for a miss, except `blank`. A new face fails the test until vectors exist.
- [x] Report differences between `scoring.ts` and `scoring.py` if any.

## Phase 3: statistics on the device

- [x] `shared/stats-vectors.json` (new): cases with `sessions` (start, type, ratings, setup, arrow set, ends with shots incl. position and arrow number, volume), `now`, `tz`, `weeks`, and the expected output of `stats`, `positions` and `arrow_stats`. Small hand-checked cases; larger cases are written from the server and named as such (the server is the reference).
- [x] `src/lib/stats.ts` (new, no Vue/Capacitor): `computeStats`, `computeArrowStats`, `positionsOf` ported 1:1 from `training/stats.py`, `arrow_stats.py`, `PositionsView` (weeks from Monday, day in the viewer's time zone via `Intl`, Python `round` half-even rounding, quantised distances, `MAX_POSITIONS`), plus `fromLog(sessions)` mapping `LogSession` to the input. Shots with a position are scored again with `score()` as the server does.
- [x] `server/training/tests/test_stats_vectors.py`: reads the same file, calls the server functions. `src/lib/stats.test.ts`: same file, same expectations.
- [x] `StatsView`, `StatsHeatmapView`: in local, the data comes from `stats.ts` over `useLog().sessions`; no `/api/setups` (labels from the gear of the sessions).

## Phase 4: notes, media, equipment on the device

- [x] Equipment screens: check they work without a server (store only).
- [x] Notes: `NotesSection`, `LatestNotes` and `SessionNotesView` in local show the device's notes only (own, private); `PendingNotes` rows stay (they are the real list now) with wording that does not say "waiting to upload"; edit and delete work on the store. No team, visibility, event chips.
- [x] Photos and videos: `MediaView` in local lists the queue, no server list or consent request; clips play in the page from the local file; delete and move to a session work on the queue; `SessionPicker`, `UnattachedHint` read the device's sessions.
- [x] Drawings on photos: `MediaPlayerView` is server-based. Decide after the above is done whether a local photo viewer with a drawing layer fits; if not, report it as skipped.
- [x] `NewSessionView`: no agenda, no archer teams in local.

## Phase 5: export and import

- [x] `src/lib/local-export.ts` (new, pure): `buildExport({ log, equipment, notes })` and `parseImport(text)` with a format tag and version, and `mergeImport` (items with an id the device already has are kept as they are on the device; counts of added/skipped are returned). Media files are **not** in the file (size); the notes about photos are kept.
- [x] `useLog`, `useEquipment`, `useNotes`: an `importData` action that adds items and queues ops as for new ones.
- [x] `LocalDataView` (new, `/settings/data` for local): export (via `saveJson`), import (file chooser), what the file covers, and the Android backup line. Account mode keeps `PrivacyView`.
- [x] Android backup: read what is in app storage (Preferences XML, `files/stores`, media queue files) and what Auto Backup takes with `allowBackup="true"`; report only, no config change.

## Phase 6: texts, docs, checks

- [x] `en.ts` and `de.ts` (`local.*`, changes in `settings.*`, `auth.signIn.*`), checked by the existing key-parity test if there is one.
- [x] Docs: `specs/design/offline-sync.md` (local owner, what runs where), `statistics.md` (device computation, fixtures), `arrow-plotting.md` (scoring fixture), `screens.md`, `accounts.md` (local state), `specs/plans/index.md`, `CHANGELOG.md` (Unreleased).
- [x] Tests: `local-mode.test.ts`, `stats.test.ts`, `local-export.test.ts`, scoring coverage; pytest for the fixtures.
- [x] `npm run type-check`, `npm test`, `cd server && uv run pytest`.
- [ ] Not verifiable here: a phone run (file chooser, share sheet, video playback, Preferences persistence, back button), reported as such.

## Deviations (code won over plan)

- Local mode state lives in `useLocalMode` (new composable) rather than in `useAuth`, because the server check in `useServer` must stay quiet in local mode and `useAuth` builds on it. `local-mode.ts` holds the pure part.
- The stats fixture has no `setup` filter case for positions: the heatmap screen does not use it, so it was not ported.
- Local drawings on photos: a small `LocalMediaView` (`/local-media/:id`) instead of adapting `MediaPlayerView`; notes on a frame of a video and the frame-by-frame player are server-only. A note's text cannot be edited, only deleted (drawing can be changed).
- `centred.ts` now sums like Python 3.12 (`pySum`), found by the stats fixture (a `-0` against `0` and the sign of nearly-zero centres).
- Scoring: no difference between app and server was found; the six faces without vectors got them, and so did every ring that had none. The coverage test is new on both sides.
- `NewSessionView` needed no change (no agenda without a server, the archer-teams call is for coaches only).

## Risks

- Rounding: Python `round` is half-even, JS `Math.round` is half-up; ties appear with exact binary fractions (0.0625). The port uses an exact-tie check.
- Time zones: week and month boundaries use the viewer's zone through `Intl`; DST is covered by one fixture case.
- A local archer is id 0 in notes and media; the later upgrade must map it to the account's id.
- Without a server there is no second copy: the export is the only backup until the upgrade upload exists, and it does not contain photo and video files.
- `MediaPlayerView` (drawings, frame-by-frame) is tied to the server API; the local version may be smaller than the account one.
