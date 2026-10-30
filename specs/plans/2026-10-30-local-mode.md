# Local mode: use the app without an account (#93)

Status: planned
Date: 2026-10-30
Design: [local-mode.md](../design/local-mode.md). Needs [2026-10-30-session-visibility.md](2026-10-30-session-visibility.md) first.

## Scope

- The app starts in local mode; one local owner per phone; account-only screens hidden; statistics on the phone; videos play from the phone.
- Sign-in or registration with local data: one confirmation (Upload / Keep on this phone only / Cancel, plus "share with coaches?"), upload by merging the local stores into the account's, existing queues drain.
- Sign-out returns to an empty local mode.
- Out of scope: export, import and backup; several local owners; storage limits for videos; registration without a code (decided: not needed); a welcome screen; copying account data into the local owner on sign-out (rejected).

Markers: **[fact]** checked in the code, **[check]** verify before relying on it, **(proposed)** my choice where the decisions leave a gap.

## What is there (checked)

- `StoreOwner` has a `local` kind and `storeKey` makes `<store>:local:<id>` **[fact]** (`src/lib/store-owner.ts`). `useAuth().storeOwner` is null when signed out **[fact]**.
- `useLog`, `useMedia`, `useEquipment`, `useNotes`, `useMediaLibrary`, `useNoteLibrary` key on `storeOwner` and only send or pull when `status === 'signedIn'` **[fact]**. So with a local owner their queues fill and nothing is sent, which is what the upload needs.
- Every route except sign-in, register, reset and `/settings/server` has `meta.auth: 'in'` **[fact]**. `App.vue` shows the tab bar only when signed in and sends a signed-out user on an `'in'` route to `/sign-in` **[fact]**.
- Scores are worked out on the phone (`src/lib/scoring.ts`, tested with the server against `shared/scoring-vectors.json`) and stored in the log **[fact]**. Statistics, heatmap positions and arrow stats are computed on the server only (`server/training/stats.py`, `arrow_stats.py`) **[fact]**.
- Videos wait for Wi-Fi already: `useUploadSettings().videosWifiOnly`, default on, used by `drainMedia` **[fact]**.
- A queued video cannot be played: `MediaView` opens only server clips in `MediaPlayerView`, which reads from the server **[fact]** (play before upload, offline-sync Phase 4, is open).
- The notes queue has `add` and `remove`, no edit **[fact]** (`note-store.ts`). `QueuedNote.archer` is a server user id **[fact]**.
- `dataStore` has no `keys` or `move` **[fact]**; media files are keyed by item id, not by owner, so they need no move **[fact]**.
- Registration needs an invite or claim code **[fact]** (`RegisterSerializer.invite_code`).

## Step 1: local owner and routes (one PR)

- [ ] `useAuth`: a local owner id (UUID) in Preferences (`localOwner`), made on first read. `storeOwner` is `{ kind: 'local', id }` when signed out and loaded, the account otherwise. `status` keeps `signedOut`; it now means local mode. `isLocal` computed for screens.
- [ ] `RouteMeta.auth` becomes required: `'in'` (account only), `'out'` (no account only), `'any'` (both). Required so a new route has to choose. `router.beforeEach`: `'in'` without account goes to `/` (not `/sign-in`).
- [ ] Local-capable routes (`'any'`): `/`, `/training`, `/training/new`, `/training/:id`, `/training/:id/details`, `/training/:id/notes`, `/training/:id/setup`, `/training/:id/end`, `/training/:id/ends`, `/media`, `/media/:id`, `/stats`, `/stats/heatmap`, `/equipment`, `/equipment/bows/:id`, `/equipment/arrow-sets/:id`, `/settings`, `/settings/about`, `/settings/server`.
- [ ] Account only (`'in'`): `/join-team`, `/events/:id`, `/sessions/:id` **[check]** that it is only the coach's view of another archer's session, `/profile`, `/account`, `/privacy`, `/archers/:id` and everything under it, `/team` and everything under it, `/evaluate`, `/evaluations/:id`.
- [ ] `'out'`: `/sign-in`, `/register`, `/reset-password`.
- [ ] `App.vue`: tab bar shown whenever not `loading` on a `tab` route; Team tab stays behind `isCoach` (false without account, `useTeams` returns early **[fact]**). The `status` watch sends `signedOut` on an `'in'` route to `/`. Invite links without account still open `/register` with the code.
- [ ] Tests: `store-owner.test.ts` (local key unchanged), a router test for the three values **[check]** whether router guards are testable in Vitest here; else a pure `routeAllowed(meta, status)` in `src/lib`.

## Step 2: screens without a server (one PR)

- [ ] Each local-capable screen reads the device stores only and hides what needs the server. Known reads to guard (`useRemote` loaders return null in local mode, or `useRemote` gets an `enabled` option, whichever is less code **[check]**):
  - `HomeView`: `/api/me/`, server session list, `useTeams`.
  - `TrainingListView`: server session list, `/api/events/mine/`.
  - `NewSessionView`: `useAgenda` (events), `/api/notes/teams/`, the archer picker.
  - `MediaView`: server list, consent (`/api/me/`, `/api/archers/`), `/api/notes/teams/`, `useAgenda`; video is allowed in local mode.
  - `SettingsView`: Profile, Account, Privacy, the training default and sign-out hidden; "Sign in or register" (to `/sign-in`, which links to register) shown. Theme, language, units, upload setting, server address stay.
  - `SyncBanner`: hidden in local mode (the queues hold everything until an account exists).
- [ ] Components on those screens (`LatestNotes`, `LatestGoals`, `NotesSection`, `SessionDetailsText`, `EventChips`, ...): audit each for server reads **[check]**; hide or fall back to the stores.
- [ ] Notes: in local mode `QueuedNote.archer` is a placeholder (`LOCAL_ARCHER = 0`, proposed); `pendingNotes` and the note screens pass it. Add an `edit` action to `note-store.ts` so a note can be changed in local mode (today only add and remove **[fact]**).
- [ ] Equipment: works on the store already; check the screens do not call the server in local mode **[check]**.

## Step 3: statistics on the phone (one PR)

- [ ] `src/lib/stats.ts`: port of `compute_stats` (volume per week, averages per face and distance, ratings), the positions filter for the heatmap, and `compute_arrow_stats`, pure, taking log sessions.
- [ ] `shared/stats-vectors.json`: input sessions and expected output, tested by `server/training/tests` and `src/lib/stats.test.ts`, as for scoring.
- [ ] `StatsView`, `StatsHeatmapView`: in local mode read the log through `stats.ts`; with an account unchanged (server). Setup comparison hidden in local mode (setups are server rows, proposed).

## Step 4: play videos from the phone (one PR; also offline-sync Phase 4 "play before upload")

- [ ] `MediaPlayerView` opens a queued item from its local file (`loadFiles` in `media-files.ts`); notes from the notes queue. Server-only actions hidden in local mode.
- [ ] Tests: `player.test.ts` cases for a local source **[check]** what is pure enough to test.

## Step 5: sign-in with local data (one PR)

- [ ] `src/lib/local-claim.ts` (pure): `localCounts(stores)` (sessions, bows, arrow sets, photos, videos, notes), `prepareUpload(stores, { userId, share })` (sets `visibility` on every session, `visibility` on clips without a session, replaces the note placeholder with `userId`), and one merge per store: `mergeLog`, `mergeMediaQueue`, `mergeEquipment`, `mergeNotes` (append; ids are UUIDs; queue order: account's ops first, then the local ones).
- [ ] `useAuth`: `signIn`, `register` and `signInWithGoogle` hand the new tokens to a `commit` step instead of `setTokens`. If the local owner is empty: commit. Otherwise: for `signIn`, ask `/api/me/` with the new access token (passed as header; the middleware adds none while no tokens are set **[check]**) for the email, then the confirmation. For `register` (and a Google sign-up that creates an account **[check]** whether the app knows beforehand) show the confirmation first, with the email from the form, and send the request only after Upload or Keep on this phone only.
- [ ] Confirmation (`alertController`, like the sign-out prompt in `SettingsView`): account email and counts, radio "Share your existing sessions with your coaches?" Yes / No, keep private (no preselection; Upload stays disabled until one is chosen), buttons Upload / Keep on this phone only / Cancel.
  - Upload: flush and hold the local stores (`useKeyedStore` needs `flush()` and a hold flag **[check]**), read the account's stores from `dataStore` (they may exist from earlier use), merge, write, read back, then remove the local keys, then commit the tokens; the account stores load the merged data and the queues drain in the existing order.
  - Keep on this phone only: commit; local keys untouched.
  - Cancel: for `signIn` drop the tokens and revoke the refresh token (as `signOut`); for `register` nothing was sent. Stay local.
- [ ] Server: `PUT` of sessions and media accepts `visibility` (from the visibility plan); nothing else.
- [ ] Tests (Vitest): counts; `prepareUpload` sets visibility for both answers and rewrites note archers; each merge keeps both sides and the queue order; an empty local owner gives no prompt; a failed write leaves the local keys in place.

## Step 6: videos on Wi-Fi (small, with step 5 or after)

- [ ] Nothing new to build for the drain (`videosWifiOnly` **[fact]**). The confirmation adds one line when videos are among the counts: "Videos go up on Wi-Fi." If the setting is off, the line says they go over mobile data, with the total size (proposed).
- [ ] `SyncBanner`: "n videos wait for Wi-Fi" (check whether `waitingForWifi` is shown already **[check]**). Joining a team (`JoinTeamView`) does not wait for the queue.

## Step 7: sign-out (small)

- [ ] `SettingsView`: sign-out always asks; the text says the screens will be empty and the account's data comes back at the next sign-in, plus the existing count of waiting items when there are any (`settings.signOutWaiting`).
- [ ] After sign-out and after account deletion: home screen in local mode.
- [ ] Test: sign-out leaves the account keys in place and shows the local owner's (empty) stores.

## i18n (each step, `en.ts` and `de.ts`)

- [ ] `settings.signInOrRegister`, `settings.localModeHint`.
- [ ] `claim.title`, `claim.counts.*` (pluralised per kind), `claim.share`, `claim.shareYes`, `claim.shareNo`, `claim.upload`, `claim.keepLocal`, `claim.cancel`, `claim.videosWifi`, `claim.videosMobile`.
- [ ] `settings.signOutEmpty`.
- [ ] Server: no new strings expected.

## Tests (summary)

- [ ] Vitest for every new `src/lib` file (`local-claim.ts`, `stats.ts`, route check) and the changed reducers (`note-store` edit).
- [ ] pytest: `stats-vectors.json` against `compute_stats` and `compute_arrow_stats`; the visibility matrix from the visibility plan covers uploads with `me`.
- [ ] Phone: fresh install opens on home; log a past session, a bow, photos, a video, a note offline; register with an invite; Upload with "No, keep private"; coach sees nothing; switch a session to coaches, coach sees it; sign out, app is empty; sign in again, data is back without a prompt.
- [ ] `npm run type-check`, `npm test`, `cd server && uv run pytest`.

## Docs

- [ ] `specs/design/local-mode.md`: status per step.
- [ ] `specs/design/offline-sync.md`: local owner in "Where the data is kept", upload merge.
- [ ] `specs/design/screens.md`: what shows in local mode.
- [ ] `CHANGELOG.md`, `SELFHOSTING.md` if the server part changes anything for operators (not expected).

## Order

- [ ] 1. Session visibility plan, merged and released (the upload needs `visibility` on the server).
- [ ] 2. Step 1, then step 2 (local mode usable, no stats, videos not playable).
- [ ] 3. Step 3 and step 4, in either order. Do not release local mode to users before both: without them two of the promised features do not work.
- [ ] 4. Step 5 with step 6.
- [ ] 5. Step 7.

## Risks

- **Data loss on uninstall** (accepted). Many local-only users will lose data with a phone. Say so in Settings in local mode (`settings.localModeHint`).
- **The upload merge** runs on the only copy of the data. A bug loses everything. Copy, read back, then delete; never delete on a failed or partial write; test on a phone with a real amount of data.
- **Two statistics implementations** (server and phone) can drift. The shared vectors are the guard; a stats change on the server without updating the vectors breaks the build, which is intended.
- **Scores change at upload** if `scoring.ts` and the server disagree for a face. Shared vectors exist **[fact]**; keep them complete for every face in `shared/target-faces.json` **[check]**.
- **Stores keep saving during the claim**: a debounced save of the local store after its key was removed would bring it back. Needs the hold flag.
- **Many videos**: tens of MB each, no limit; a phone can fill up. Accepted for now.
- **Old local data and a later server version**: the queue replays ops written months earlier. Server checks that changed meanwhile (for example refused fields) mark items failed; the banner shows them.
- **Duplicate equipment** when the same bow was entered on two phones. Accepted.

## Open

- None. Decided: no preselection for the share question.
