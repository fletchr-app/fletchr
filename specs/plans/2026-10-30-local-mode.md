# Local mode: use the app without an account or server (#93)

Status: first version implemented (#113), first launch and sign-out changed to the decided model (#115, Step 0), upload on sign-in (Step 2) and sign-out wording (Step 3) implemented and run on a phone (2026-10-31, see Tests). Note edit (Step 1) implemented. Session visibility (own plan, needed by Step 2) is merged (#117)
Date: 2026-10-30
Design: [local-mode.md](../design/local-mode.md). The upload needs [2026-10-30-session-visibility.md](2026-10-30-session-visibility.md) first. This file replaces the separate `2026-10-30-local-only-mode.md` (the record of #113), now the "Done" section below.

## Scope and decisions

- Archers who only log their own training use the app without an account or server; sessions, equipment, notes, photos and videos, statistics and the heatmap work from the device.
- **Decided (Tim, 2026-10-30)**:
  - First version: local data plus JSON export and import as the backup; the upload to an account came later (Step 2).
  - Statistics and heatmap are computed on the device, tied to the server by shared fixtures; scoring is tied the same way for every face. If app and server disagree, the app is fixed.
  - The app opens on the home screen in local mode on first launch, with no welcome screen and no choice on the sign-in screen; sign-in and register are reached from Settings. Sign-out and account deletion return to an empty local mode on the home screen.
  - One local owner per phone. Registration stays tied to an invite or claim code (local mode needs no account).
  - Upload on sign-in: one confirmation (counts, account email, "Share existing sessions with your coaches?" without preselection, Upload / Keep on this phone only / Cancel). For a registration it comes before the request is sent, for a sign-in after the credentials are accepted. No export prompt before the upload. Videos go up on Wi-Fi only. No storage limit for videos.
  - Copying the account's data into the local owner on sign-out is rejected (it would bring back items deleted elsewhere).
- Out of scope: several local owners; a storage limit for local videos; registration without a code.

Markers: **[fact]** checked in the code, **[inferred]**, **[check]** verify before relying on it, **(proposed)** my choice where the decisions leave a gap.

## Done

### #113: local mode (merged)

- **State and routes**: `useAuth().status` is `loading | signedOut | signedIn | local`; `useLocalMode` and `src/lib/local-mode.ts` keep the flag (`local-mode`) and the owner id (`local-owner-id`) in Preferences. `meta.auth` is `'in'` (signed in or local), `'account'` (signed in only, local goes to `/`) or `'out'` (open to local so "Sign in or register" works). Server-only screens are `'account'`. Settings, Home, Training, the sync banner and the server-fed components have a local variant.
- **Scoring**: `shared/scoring-vectors.json` covered 10 of 16 faces; the six others (wa-80, wa-60, wa-40-triple-triangle, wa-40-triple-vertical-compound, wa-field-60, wa-field-40) got vectors written from the ring diameters, and a coverage test on both sides fails for any face, ring, X or miss without one. No difference between `scoring.ts` and `scoring.py` was found.
- **Statistics and heatmap**: `src/lib/stats.ts` ports `training/stats.py`, `arrow_stats.py` and `PositionsView`; `shared/stats-vectors.json` (8 cases) is read by pytest and Vitest. The fixture found two differences, both fixed in the app: Python's `round` is half-even (`pyRound` in `py-math.ts`), and Python 3.12+ `sum` of floats uses an error term (`pySum`, also used by `centred.ts`).
- **Notes, photos and videos**: from the device. `LocalMediaView` (`/local-media/:id`) shows a photo with drawings and notes, or plays the video in the browser's player. A note can be deleted, its text and (on a photo) its drawing changed (Step 1). The frame-by-frame player and notes on a frame need the server. Queued video play in the media screen came with #112.
- **Backup**: `LocalDataView` (`/settings/data`) exports and imports one JSON file (`src/lib/local-export.ts`: `buildExport`, `parseExport`, `planImport`; format `fletchr-local` v1) with sessions, equipment and notes, no photo and video files.
- **Android backup**: the media folders are excluded from the backup (decided, see Open).
- Docs written in #113: `offline-sync.md`, `statistics.md`, `arrow-plotting.md`, `screens.md`, `accounts.md`, CHANGELOG.

### #115: Step 0, first launch and sign-out (merged)

- [x] `useAuth`: a `watch` on `status` calls `enterLocal()` when it becomes `signedOut` (also at start-up); `status` stays `loading` until both the tokens and the local flag are loaded, so `signedOut` is only seen once both are missing. `signOut()` and account deletion call `enterLocal()`; the account's data stays under its key.
- [x] Router: unchanged. `'out'` is open to `local`; `'in'` without tokens and without local still goes to `/sign-in` (only reachable if the flag is lost).
- [x] `SignInView`: the "Use without an account" choice is removed; in local mode it shows a text and "Back to my training log".
- [x] A 401 on token refresh also lands in local mode on Home.
- [x] Tests: `local-mode.test.ts` (first launch, sign-in and sign-out keep the same owner and data).

### Deviations from the first plan

- Local mode state lives in `useLocalMode`, not in `useAuth`, because the server check in `useServer` must stay quiet in local mode and `useAuth` builds on it.
- The stats fixture has no `setup` filter case for positions: the heatmap screen does not use it.
- `NewSessionView` needed no change (no agenda without a server).

## What was there before Step 2 (facts that the steps were built on)

- Setting tokens turns the flag off (`watch` on `state.tokens` in `useAuth`) and keeps the id and all data under `<store>:local:<id>`; nothing is uploaded **[fact]**. This is the "Keep on this phone only" behaviour of the design and the place where the confirmation goes in front.
- Notes and media name their archer by number; without an account it is `LOCAL_ARCHER` = 0 **[fact]** (`src/lib/local-mode.ts`). The upload maps it to the account's id.
- The outbox keeps one op per item (`queue` replaces by key) and fills in local mode: it is the list the upload starts from **[fact]**.
- Media queue files are keyed by item id, not by owner, so they need no move **[fact]**. `dataStore` has no `keys` or `move`, and `useKeyedStore` has no `flush()` and no hold flag **[fact]**; both are new work in Step 2.
- `local-export.ts`: `planImport(file, device)` keeps items the device already has and returns what to add and counts, for log, equipment and notes, without media files **[fact]**. It can be the merge for those three stores (the account's data as `device`); the media queue needs its own merge **[fact]**.
- `AuthSession` adds the Authorization header only when it holds a token, so a request with an explicit header before `setTokens` keeps it; `/api/me/` with the new access token works **[fact]**.
- `signInWithGoogle(inviteCode?)`: with a code it can create an account, without one it only signs in (`no_account` otherwise) **[fact]**. So the app knows beforehand: a code means register (confirm before), none means sign-in (confirm after). Tokens are set inside the function, so the confirmation moves in front of `setTokens` there too.
- "Videos wait for Wi-Fi" is shown in `MediaView` only (`waitingForWifi`); `SyncBanner` does not show it **[fact]**. The Wi-Fi-only upload exists (`videosWifiOnly`, default on); the setting is hidden in local mode.
- `note-store.ts` has `add` and `remove`, no edit **[fact]**.
- Registration needs an invite or claim code **[fact]** (`RegisterSerializer.invite_code`).

## Order

- [x] 1. Session visibility plan, merged (#117; not released yet: the upload needs a server with it).
- [x] 2. Step 1 (note edit), independent.
- [x] 3. Step 2 (upload on sign-in) with Step 3 (wording of sign-out).
- Step 2 needs a server that accepts `visibility` on session and media `PUT` (0.15). An older server ignores the field and applies its defaults.

## Step 1: edit a note in local mode (small)

- [x] `note-store.ts`: an `edit` action (body, drawing) for a note still in the store; a note already uploaded is not in the store, so this only concerns local mode and notes still waiting.
- [x] Note screens (`LocalNoteText`): the edit button for a local note.
- [x] Test: edit keeps the uid and the order of the queue.

## Step 2: sign-in with local data (one PR)

- [x] `src/lib/local-claim.ts` (pure): `localCounts(stores)` (sessions, bows, arrow sets, photos, videos, notes; `buildExport` counts all but media), `prepareUpload(stores, { userId, share })` (sets `visibility` on every session and on clips without a session, replaces `LOCAL_ARCHER` in notes and media with `userId`), and one merge per store: log, equipment and notes through `planImport`, the media queue by its own append (ids are UUIDs; queue order: the account's ops first, then the local ones).
- [x] `useAuth`: `signIn`, `register` and `signInWithGoogle` hand the tokens to a `commit` step before the existing `setTokens` / `local.leave()` path. If the local owner holds nothing: commit. Otherwise:
  - `signIn`: ask `/api/me/` with the new access token (as explicit header) for the email, then the confirmation.
  - `register`: show the confirmation first, with the email from the form, and send the request only after Upload or Keep on this phone only. `signInWithGoogle` with an invite code is the same as `register`; without a code it is a sign-in.
- [x] Confirmation (`alertController`, like the sign-out prompt in `SettingsView`): account email and counts, radio "Share your existing sessions with your coaches?" Yes / No, keep private (no preselection; Upload stays disabled until one is chosen), buttons Upload / Keep on this phone only / Cancel.
  - Upload: flush and hold the local stores (`useKeyedStore` needs a new `flush()` and a hold flag), read the account's stores from `dataStore` (they may exist from earlier use), merge, write, read back, then remove the local keys, then commit the tokens; the account stores load the merged data and the queues drain in the existing order.
  - Keep on this phone only: commit; local keys untouched (today's behaviour).
  - Cancel: for `signIn` drop the tokens and revoke the refresh token (as `signOut`); for `register` nothing was sent. Stay in local mode.
- [x] After Upload the local owner is empty; the id is kept.
- [x] Texts that say "nothing is uploaded" (`SignInView`, `LocalDataView`, `local.*`, `auth.signIn.*` in `en.ts`/`de.ts`) say that signing in offers to upload **[check]** the wording.
- [x] Server: `PUT` of sessions and media accepts `visibility` (from the visibility plan); nothing else.
- [x] Videos: the confirmation adds a line when videos are among the counts: "Videos go up on Wi-Fi." If `videosWifiOnly` is off, the line says they go over mobile data, with the total size (proposed). `SyncBanner`: "n videos wait for Wi-Fi" (small), since after the upload they would wait unseen. Joining a team (`JoinTeamView`) does not wait for the queue.
- [x] Tests (Vitest): counts; `prepareUpload` sets visibility for both answers and maps `LOCAL_ARCHER`; each merge keeps both sides and the queue order; an empty local owner gives no prompt; a failed write leaves the local keys in place.


### Built (differences from the text above)

- `src/lib/local-claim.ts` also holds `claimLocal` (read, merge, write, read back, compare, remove; the account's keys are restored on failure) and `readLocal`. `src/lib/claim-flow.ts` holds the order of steps (`decide`, `enter`, `beforeRequest`), `useLocalClaim` the confirmation (`ClaimSheet`, a modal, because an Ionic alert cannot disable a button) and the hold, flush and move. `useAuth` calls it through `setClaimGate`.
- The merge goes through `planImport` for log, equipment and notes and then the existing `imported` reducers, so the local ops are queued again behind the account's. The local outbox is not copied (ops of items deleted while local are dropped).
- `dataStore` got no `keys` or `move`: the four store names are known, and copy, read back and remove are done with `get`, `set` and `remove`. `useKeyedStore` has `hold`, `release` and `flush`; the hold also ends when the key changes.
- Media: `QueuedMedia.visibility` is new and sent as a form field for a clip in no session (the server already accepted it).
- Videos over mobile data: the line has no total size; the queue does not know the size without opening the files.
- A failed upload never signs in (tokens revoked, local mode stays), also after a registration that already made the account.

### Answers to the [check] items

- Wording of the texts that said nothing is uploaded: `local.signInText` (sign-in screen and Settings) and `local.noCopy` (backup screen) now say that signing in or registering offers the upload; German written, needs a review.
- `PUT` of sessions and media accepts `visibility`: sessions in `SessionSerializer` (`validate_visibility`, owner only), media in `MediaWriteSerializer` (`ChoiceField`, null allowed, owner only), both also on update. Nothing changed on the server.

## Step 3: sign-out

- [x] `SettingsView`: sign-out always asks; the text says the screens will be empty and the account's data comes back at the next sign-in, plus the existing count of waiting items when there are any (`settings.signOutWaiting`).
- [ ] Test: sign-out leaves the account keys in place. Not written: `useAuth` has no test harness (Capacitor, Ionic); `signOut` removes no key, it only sets the tokens to null and enters local mode (checked by reading the code).

## i18n (each step, `en.ts` and `de.ts`)

- [x] `claim.title`, `claim.counts.*` (pluralised per kind), `claim.share`, `claim.shareYes`, `claim.shareNo`, `claim.upload`, `claim.keepLocal`, `claim.cancel`, `claim.videosWifi`, `claim.videosMobile`; also `claim.intro`, `claim.shareHint`, `claim.failed`, `claim.failedRegistered`, `sync.videosWaitForWifi`.
- [x] `settings.signOutEmpty`.
- [x] Server: no new strings expected.

## Tests (summary)

- [x] Vitest for every new `src/lib` file (`local-claim.ts`, `claim-flow.ts`) and `useKeyedStore` (hold, flush). `note-store` edit reducer too.
- [x] pytest: the visibility matrix from the visibility plan covers uploads with `me`.
- [x] Phone, run 2026-10-31 on an Android phone (debug build against a local server): sign-out text and empty screens, Home greeting, note edit, German texts, claim sheet header, Cancel (nothing sent), register with an invite, Upload with "No, keep private" (server: session `me`, note private with the edited text), sign out and in again (data back). The back button does nothing on the claim sheet (accepted). Server migrations checked on a copy of a v0.14.0 database (existing sessions stay `coaches`).
- [ ] Phone, not run yet: the video line in the claim sheet, a coach seeing private data in the app, a migration on the real server's data.
- [ ] Phone, original list (for what is not covered above): fresh install opens on Home; log a past session, a bow, photos, a video, a note; export and import round trip, file chooser and share sheet; video playback; Preferences persistence; back button. After Step 2: register with an invite; Upload with "No, keep private"; coach sees nothing; switch a session to coaches, coach sees it; sign out, app is empty; sign in again, data is back without a prompt.
- [x] `npm run type-check`, `npm test`, `cd server && uv run pytest`.

## Docs

- [x] `specs/design/local-mode.md`: status per step.
- [x] `specs/design/offline-sync.md`: the upload merge in "Where the data is kept" and the "Not built" line in the local-mode section.
- [x] `specs/design/accounts.md`: sign-in with local data.
- [x] `CHANGELOG.md`.

## Risks

- **The upload merge** runs on the only copy of the data. A bug loses everything. Copy, read back, then delete; never delete on a failed or partial write; test on a phone with a real amount of data.
- **Stores keep saving during the claim**: a debounced save of the local store after its key was removed would bring it back. Needs the hold flag.
- **Two implementations** of scoring and statistics (app and server) can drift. The shared vectors are the guard; a server change without updating them breaks the build.
- **Rounding and time zones** in the statistics port: Python `round` is half-even and `Math.round` half-up (exact-tie check in `pyRound`); week and month boundaries use the viewer's zone through `Intl`, DST has one fixture case. `Math.hypot` against Python's `math.hypot` could differ in the last bit; it only matters at a tie in the fourth decimal and none occurs in the fixture.
- **Data loss on uninstall**: the export is the only copy the app controls until the upload exists, and it has no photo and video files.
- **Old local data and a later server version**: the queue replays ops written months earlier. Server checks that changed meanwhile mark items failed; the banner shows them.
- **Duplicate equipment** when the same bow was entered on two phones. Accepted.
- **Smaller local player**: `MediaPlayerView` (frame-by-frame, notes on a frame) is tied to the server API; the local one is smaller.

## Open (for the user)

- **Android backup of app storage** (decided): the stores, the owner id and the settings stay in Android's backup; `media-queue/` and `media-kept/` are excluded (`backup_rules.xml`, `data_extraction_rules.xml`). After a restore, photos and videos that were only on the phone are gone, their entries stay in the lists. Details in `offline-sync.md`.
- Not run on a phone: file chooser, share sheet, video playback, Preferences persistence. The back button does nothing on the claim sheet. German texts are reviewed.
- The visibility defaults are in the visibility plan (assumed, confirm): no `followers` level, new accounts default to `coaches`, existing sessions migrate to `coaches`.
