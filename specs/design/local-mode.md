# Using the app without an account (#93)

Status: partly implemented. Built: the local state, screens, statistics, export/import (#113) and first launch and sign-out (#115). Planned: note edit, upload on sign-in, sign-out wording, session visibility
Date: 2026-10-30
Plan: [2026-10-30-local-mode.md](../plans/2026-10-30-local-mode.md). Builds on [offline-sync.md](offline-sync.md) (store owner, queues) and [session-visibility.md](session-visibility.md).

An archer who only logs their own training does not need an account or a server. An account is needed to join a team with a coach, or when the person wants one.

## What is built

How local mode works today (state, local owner, routes, screens, statistics, notes, media, backup, Android backup) is written in [offline-sync.md](offline-sync.md#without-an-account-93); what the screens show in [screens.md](screens.md); how it relates to accounts in [accounts.md](accounts.md#without-an-account-93). In short:

- The app opens on the home screen in local mode on first launch, with no welcome screen. Sign-in and register are reached from Settings ("Sign in or register").
- One local owner per phone; the stores work as they do for an account, nothing is sent.
- Backup is the JSON export and import in Settings, without photo and video files.

## Signing in or registering with local data (planned)

Today signing in turns local mode off and leaves the local data hidden under its key, uploading nothing. This section is what is planned on top of that. The rule is the same on every sign-in and registration: if the local owner holds nothing, nothing is asked.

Otherwise, one confirmation. For a sign-in it comes after the server accepted the credentials and before the app switches to the account. For a registration (and a Google sign-up that creates an account) it comes **before** the request is sent, with the email typed in the form, so Cancel really cancels and no account is made:

> Upload to **anna@example.org**? 12 sessions, 2 bows, 1 arrow set, 30 photos, 4 videos, 6 notes.
> Share your existing sessions with your coaches? **Yes** / **No, keep private**
> **Upload** · **Keep on this phone only** · **Cancel**

- **Upload**: the local stores are merged into the account's stores (copy first; the local copy is removed only once the account's store has been written and read back). The queues then drain as usual, in the existing order (equipment, sessions, media, notes). Ids are made by the app, so uploading into an account that already has data only adds; equipment from two phones may end up twice, which is accepted.
- **The sharing answer** sets the visibility of everything uploaded from the local owner: sessions get `coaches` or `me`, clips without a session get their own value (`Media.visibility`), notes about yourself are private anyway.
- **Keep on this phone only**: the account is used; the local data stays under the local key, hidden while signed in, and is offered again at the next sign-in.
- **Cancel**: nothing is sent for a registration. For a sign-in the tokens are dropped and revoked. The app stays in local mode. If the answer to the sharing question is missing, Upload is disabled (no preselection).
- No export prompt before the upload (decided).
- Videos go up on Wi-Fi only (the existing `videosWifiOnly` setting, on by default). Joining a team does not wait for them; the sync banner shows how many are waiting for Wi-Fi.
- A session uploaded this way may be merged with a session a coach opened (ADR 0004); the archer's wins, as usual.

The account's own stores may already exist on the phone (the person used the account here before). Upload therefore merges into them, it never replaces them.

## Signing out

- Built (#115): sign-out lands on the home screen in an empty local mode, not on the sign-in screen. The account's data stays on the phone under its key and comes back at the next sign-in of that account. Deleting the account ends the same way.
- Planned: the sign-out confirmation always shows a line that explains the empty screens afterwards (your data stays on this phone and comes back when you sign in again), plus the existing warning about waiting items when there are any.
- Rejected: copying the account's data into the local owner on sign-out. It would bring back items deleted elsewhere and upload them again on the next sign-in.

## Not covered

- Several local owners on one phone.
- A storage limit for local videos.
- Registering without an invite or claim code (decided: not needed, accounts stay tied to a team or claim code).

## Open

- **Android backup configuration**: not decided, see [offline-sync.md](offline-sync.md#without-an-account-93).
- **Account without a team** (decided): local mode needs no registration. Registration still needs an invite or claim code (`RegisterSerializer.invite_code`; Google sign-up answers `no_account` without one) **[fact]**. The Settings entry is for people who already have an account or a code.
- **Minors**: a video taken in local mode by an archer under 18 goes up when they join; the server only refuses it if a birth date is on record and no consent (`video_allowed`). A birth date entered later does not remove clips already uploaded.
