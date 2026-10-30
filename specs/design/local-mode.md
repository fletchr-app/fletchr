# Using the app without an account (#93)

Status: partly implemented (#113: local state, screens, statistics, export/import). Planned: note edit, upload on sign-in, sign-out, session visibility
Date: 2026-10-30
Plan: [2026-10-30-local-mode.md](../plans/2026-10-30-local-mode.md). Builds on the implemented local mode of PR #113 ([2026-10-30-local-only-mode.md](../plans/2026-10-30-local-only-mode.md)), [offline-sync.md](offline-sync.md) (store owner, queues) and [session-visibility.md](session-visibility.md).

An archer who only logs their own training does not need an account or a server. An account is needed to join a team with a coach, or when the person wants one.

## First launch and what works (implemented in #113)

- The sign-in screen offers "Use without an account" next to signing in. The choice is kept as a flag (`local-mode`) in Preferences; `useAuth().status` is then `local`.
- Without an account the archer can: log sessions (also past ones), edit equipment, take photos and videos, write notes about themselves (text edit is planned), see their own statistics and heatmap (computed on the phone, `src/lib/stats.ts`, tied to the server by `shared/stats-vectors.json`). Videos play from the local file. Theme, language and units stay in Settings.
- Hidden without an account: the Team tab, schedule and events, evaluations, coach views, joining a team, profile, account pages, the sync banner.
- Backup is the JSON export and import in Settings ("Your data", `LocalDataView`): sessions, equipment and notes, no photo and video files. Uninstalling the app loses media.
- **Decided, not yet built (plan step 0)**: the app opens straight on the home screen in local mode, with no welcome screen and no choice on the sign-in screen. Sign-in and register are reached from Settings. #113 shows the sign-in screen first, with "Use without an account" as a second choice; that changes.

## The local owner (implemented in #113)

- One local owner per phone (`{ kind: 'local', id }` in `src/lib/store-owner.ts`, keys `<store>:local:<id>`). The id is a UUID made once (`local-owner-id` in Preferences) and kept when an account is signed in to, together with all data under it.
- The stores (`log`, `media`, `equipment`, `notes`) work as they do for an account; nothing is sent while `status` is not `signedIn`.
- Notes and media name their archer by `LOCAL_ARCHER` (0); the upload replaces it with the account's id.

## Signing in or registering with local data

Today (#113) signing in turns local mode off and leaves the local data hidden under its key, uploading nothing. This section is what is planned on top of that. The rule is the same on every sign-in and registration: if the local owner holds nothing, nothing is asked.

Otherwise, one confirmation. For a sign-in it comes after the server accepted the credentials and before the app switches to the account. For a registration (and a Google sign-up that creates an account) it comes **before** the request is sent, with the email typed in the form, so Cancel really cancels and no account is made:

> Upload to **anna@example.org**? 12 sessions, 2 bows, 1 arrow set, 30 photos, 4 videos, 6 notes.
> Share your existing sessions with your coaches? **Yes** / **No, keep private**
> **Upload** · **Keep on this phone only** · **Cancel**

- **Upload**: the local stores are merged into the account's stores (copy first; the local copy is removed only once the account's store has been written and read back). The queues then drain as usual, in the existing order (equipment, sessions, media, notes). Ids are made by the app, so uploading into an account that already has data only adds; equipment from two phones may end up twice, which is accepted.
- **The sharing answer** sets the visibility of everything uploaded from the local owner: sessions get `coaches` or `me`, clips without a session get their own value (`Media.visibility`), notes about yourself are private anyway.
- **Keep on this phone only**: the account is used; the local data stays under the local key, hidden while signed in, and is offered again at the next sign-in.
- **Cancel**: nothing is sent for a registration. For a sign-in the tokens are dropped and revoked. The app stays as it was. If the answer to the sharing question is missing, Upload is disabled (no preselection).
- Videos go up on Wi-Fi only (the existing `videosWifiOnly` setting, on by default). Joining a team does not wait for them; the sync banner shows how many are waiting for Wi-Fi.
- A session uploaded this way may be merged with a session a coach opened (ADR 0004); the archer's wins, as usual.

The account's own stores may already exist on the phone (the person used the account here before). Upload therefore merges into them, it never replaces them.

## Signing out

- #113 (to be changed): sign-out of an account lands on the sign-in screen, where "Use without an account" opens the local owner's stores (empty after an upload, the earlier data after "Keep on this phone only"). The account's data stays on the phone under its key and comes back at the next sign-in of that account.
- Planned: the sign-out confirmation always shows a line that explains the empty screens afterwards (your data stays on this phone and comes back when you sign in again), plus the existing warning about waiting items when there are any.
- **Decided, not yet built (plan step 0)**: sign-out lands on the home screen in an empty local mode, not on the sign-in screen.
- Rejected: copying the account's data into the local owner on sign-out. It would bring back items deleted elsewhere and upload them again on the next sign-in.
- Deleting the account ends the same way.

## Not covered

- Several local owners on one phone.
- Android backup configuration (open since #113).
- A storage limit for local videos.
- Registering without an invite or claim code (decided: not needed, accounts stay tied to a team or claim code).

## Open

- **Account without a team** (decided): local mode needs no registration. Registration still needs an invite or claim code (`RegisterSerializer.invite_code`; Google sign-up answers `no_account` without one) **[fact]**. The Settings entry is for people who already have an account or a code.
- **Minors**: a video taken in local mode by an archer under 18 goes up when they join; the server only refuses it if a birth date is on record and no consent (`video_allowed`). A birth date entered later does not remove clips already uploaded.
