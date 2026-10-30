# Local mode, part 2: sign-in with local data, sign-out, note edit (#93)

Status: planned
Date: 2026-10-30
Design: [local-mode.md](../design/local-mode.md). Builds on the merged [2026-10-30-local-only-mode.md](2026-10-30-local-only-mode.md) (PR #113). The upload needs [2026-10-30-session-visibility.md](2026-10-30-session-visibility.md) first.

## Scope

- Done in #113, not repeated here: the `local` state, routes (`'in'`, `'account'`, `'out'`), hidden server screens, statistics and heatmap on the phone (`src/lib/stats.ts`, `shared/stats-vectors.json`), scoring vectors for all 16 faces, `LocalMediaView`, JSON export and import (`LocalDataView`, `src/lib/local-export.ts`), playing queued video (#112).
- Remaining: (0) change #113's first launch and sign-out to the decided model (below), (1) edit the text of a note in local mode, (2) upload of local data when signing in or registering, with one confirmation, (3) sign-out, (4) session visibility on the server, which the upload needs.
- **Decided (Tim, 2026-10-30), replacing #113's model**: the app opens on the home screen in local mode on first launch, with no welcome screen and no choice on the sign-in screen; sign-in and register are reached from Settings; sign-out returns to an empty local mode on the home screen.
- Out of scope: several local owners; storage limits for videos; registration without a code (decided: not needed); copying account data into the local owner on sign-out (rejected); Android backup configuration (open, reported in #113).

Markers: **[fact]** checked in the code, **[check]** verify before relying on it, **(proposed)** my choice where the decisions leave a gap.

## What is there (checked in develop after #113)

- `useAuth().status` is `loading | signedOut | signedIn | local`. `local` is chosen with "Use without an account" on the sign-in screen; the flag (`local-mode`) and the owner id (`local-owner-id`) are in Preferences (`src/lib/local-mode.ts`, `useLocalMode`) **[fact]**.
- Setting tokens turns the flag off (`watch` on `state.tokens` in `useAuth`) and keeps the id and all data under `<store>:local:<id>`; nothing is uploaded **[fact]**. This is the "Keep on this phone only" behaviour of the design, and the place where the confirmation has to go in front.
- Notes and media name their archer by number; without an account it is `LOCAL_ARCHER` = 0 **[fact]** (`src/lib/local-mode.ts`). The upload maps it to the account's id.
- Media queue files are keyed by item id, not by owner, so they need no move **[fact, from the earlier check]**. `dataStore` has no `keys` or `move` **[fact]**.
- `local-export.ts` has `buildExport`, `parseExport` and `planImport(file, device)` (items the device already has are kept, it returns what to add and counts) for log, equipment and notes, without media files **[fact]**. `planImport` can be the merge for those three stores (the account's data as `device`); the media queue needs its own merge **[fact]**.
- `useKeyedStore` has no `flush()` and no hold flag, and `dataStore` has no `keys` or `move` **[fact]**; both are new work in step 2.
- `AuthSession` adds the Authorization header only when it holds a token, so a request with an explicit header before `setTokens` keeps it **[fact]**; `/api/me/` with the new access token works.
- `signInWithGoogle(inviteCode?)`: with a code it can create an account, without one it only signs in (`no_account` otherwise) **[fact]**. So the app knows beforehand: a code means register (confirm before), none means sign-in (confirm after). Tokens are set inside the function, so the confirmation needs to move in front of `setTokens` there too.
- The "videos wait for Wi-Fi" line exists in `MediaView` only (`waitingForWifi`); `SyncBanner` does not show it **[fact]**.
- `note-store.ts` has `add` and `remove`, no edit; a note's text cannot be changed in local mode, only deleted **[fact]**.
- Wi-Fi-only video upload exists (`videosWifiOnly`, default on) **[fact]**; the setting is hidden in local mode, shown again in an account.
- Registration needs an invite or claim code **[fact]** (`RegisterSerializer.invite_code`).
- Sign-out of an account lands on the sign-in screen **[fact]**.

## Order

- [ ] 1. Session visibility plan, merged and released (the upload needs `visibility` on the server).
- [ ] 2. Step 1 (note edit), independent, can go any time.
- [ ] 3. Step 2 (upload on sign-in) with step 3 (wording of sign-out).
- [ ] Until step 2 ships, signing in with local data leaves it hidden under the local key, as #113 does. Say so on the sign-in screen (it does already).

## Step 0: first launch and sign-out as decided (small, before step 2)

- [x] `useLocalMode` / `useAuth`: a phone with no tokens and no stored flag starts in `local` (today it is `signedOut` until "Use without an account" is chosen). Made on first read: `enterLocal()` runs once when `status` would be `signedOut` and the server has not been asked for a sign-in **[check]** how `loaded` and `localLoaded` order at start-up.
- [x] `signOut` and account deletion: call `enterLocal()` so the app ends in local mode on `/`, not on `/sign-in`. The account's data stays under its key.
- [x] Router: `'out'` stays open to `local`; `'in'` without tokens and without local still goes to `/sign-in` (only reachable now if the flag is lost).
- [x] `SignInView`: the "Use without an account" choice is no longer needed there; remove it or keep it as a link back **(proposed: remove)**. `SettingsView` in local already has "Sign in or register".
- [x] Tests: `local-mode.test.ts` for the first-start path; sign-out ends in `local`.

## Step 1: edit a note in local mode (small)

- [ ] `note-store.ts`: an `edit` action (body, drawing) for a note still in the store; a note already uploaded is not in the store, so this only concerns local mode and notes still waiting.
- [ ] Note screens: the edit button for a local note.
- [ ] Test: edit keeps the uid and the order of the queue.

## Step 2: sign-in with local data (one PR)

- [ ] `src/lib/local-claim.ts` (pure): `localCounts(stores)` (sessions, bows, arrow sets, photos, videos, notes; `buildExport` counts all but media), `prepareUpload(stores, { userId, share })` (sets `visibility` on every session and on clips without a session, replaces `LOCAL_ARCHER` in notes and media with `userId`), and one merge per store: log, equipment and notes through `planImport`, the media queue by its own append (ids are UUIDs; queue order: the account's ops first, then the local ones).
- [ ] `useAuth`: `signIn`, `register` and `signInWithGoogle` hand the tokens to a `commit` step before the existing `setTokens` / `local.leave()` path. If the local owner holds nothing: commit. Otherwise:
  - `signIn`: ask `/api/me/` with the new access token (as explicit header) for the email, then the confirmation.
  - `register`: show the confirmation first, with the email from the form, and send the request only after Upload or Keep on this phone only. `signInWithGoogle` with an invite code is the same as `register`; without a code it is a sign-in.
- [ ] Confirmation (`alertController`, like the sign-out prompt in `SettingsView`): account email and counts, radio "Share your existing sessions with your coaches?" Yes / No, keep private (no preselection; Upload stays disabled until one is chosen), buttons Upload / Keep on this phone only / Cancel.
  - Upload: flush and hold the local stores (`useKeyedStore` needs a new `flush()` and a hold flag), read the account's stores from `dataStore` (they may exist from earlier use), merge, write, read back, then remove the local keys, then commit the tokens; the account stores load the merged data and the queues drain in the existing order.
  - Keep on this phone only: commit; local keys untouched (today's behaviour).
  - Cancel: for `signIn` drop the tokens and revoke the refresh token (as `signOut`); for `register` nothing was sent. Stay as before.
- [ ] After Upload the local owner is empty; "Use without an account" later finds an empty local mode (the id is kept).
- [ ] `LocalDataView` text: say that signing in offers to upload (it says today that nothing is uploaded) **[check]** the wording in `en.ts`/`de.ts` (`local.*`, `auth.signIn.*`).
- [ ] Server: `PUT` of sessions and media accepts `visibility` (from the visibility plan); nothing else.
- [ ] Videos: the confirmation adds a line when videos are among the counts: "Videos go up on Wi-Fi." If `videosWifiOnly` is off, the line says they go over mobile data, with the total size (proposed). `SyncBanner` does not show waiting videos (only `MediaView`); after the upload they would wait unseen, so add "n videos wait for Wi-Fi" to the banner (small). Joining a team (`JoinTeamView`) does not wait for the queue.
- [ ] Tests (Vitest): counts; `prepareUpload` sets visibility for both answers and maps `LOCAL_ARCHER`; each merge keeps both sides and the queue order; an empty local owner gives no prompt; a failed write leaves the local keys in place.

## Step 3: sign-out

- [ ] `SettingsView`: sign-out always asks; the text says the screens will be empty and the account's data comes back at the next sign-in, plus the existing count of waiting items when there are any (`settings.signOutWaiting`).
- [ ] Where it lands: the home screen in local mode (step 0).
- [ ] Test: sign-out leaves the account keys in place.

## i18n (each step, `en.ts` and `de.ts`)

- [ ] `claim.title`, `claim.counts.*` (pluralised per kind), `claim.share`, `claim.shareYes`, `claim.shareNo`, `claim.upload`, `claim.keepLocal`, `claim.cancel`, `claim.videosWifi`, `claim.videosMobile`.
- [ ] `settings.signOutEmpty`.
- [ ] Server: no new strings expected.

## Tests (summary)

- [ ] Vitest for every new `src/lib` file (`local-claim.ts`) and the changed reducer (`note-store` edit).
- [ ] pytest: the visibility matrix from the visibility plan covers uploads with `me`.
- [ ] Phone: log a past session, a bow, photos, a video, a note in local mode; register with an invite; Upload with "No, keep private"; coach sees nothing; switch a session to coaches, coach sees it; sign out; sign in again, data is back without a prompt.
- [ ] `npm run type-check`, `npm test`, `cd server && uv run pytest`.

## Docs

- [ ] `specs/design/local-mode.md`: status per step.
- [ ] `specs/design/offline-sync.md`: the upload merge in "Where the data is kept" and the line "Not built" in the local-mode section.
- [ ] `specs/design/accounts.md`: sign-in with local data.
- [ ] `CHANGELOG.md`.

## Risks

- **The upload merge** runs on the only copy of the data. A bug loses everything. Copy, read back, then delete; never delete on a failed or partial write; test on a phone with a real amount of data. No export prompt before the upload (decided).
- **Stores keep saving during the claim**: a debounced save of the local store after its key was removed would bring it back. Needs the hold flag.
- **Scores change at upload** if `scoring.ts` and the server disagree for a face. Vectors now cover all 16 faces (#113) **[fact]**.
- **Old local data and a later server version**: the queue replays ops written months earlier. Server checks that changed meanwhile mark items failed; the banner shows them.
- **Duplicate equipment** when the same bow was entered on two phones. Accepted.
- **Data loss on uninstall** (accepted, export exists).

## Open (for the user)

- None. Decided: no preselection for the share question, no export prompt before the upload, first launch and sign-out as in step 0.
