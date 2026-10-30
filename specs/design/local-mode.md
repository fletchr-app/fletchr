# Using the app without an account (#93)

Status: planned
Date: 2026-10-30
Plan: [2026-10-30-local-mode.md](../plans/2026-10-30-local-mode.md). Builds on [offline-sync.md](offline-sync.md) (store owner, queues) and [session-visibility.md](session-visibility.md).

An archer who only logs their own training does not need an account or a server. An account is needed to join a team with a coach, or when the person wants one.

## First launch and what works

- The app opens on the home screen. There is no welcome screen. Sign in and register are reached from Settings ("Sign in or register").
- Without an account the archer can: log sessions (also past ones), edit equipment, take photos and videos, write notes about themselves, see their own statistics and heatmap. Theme, language, units and the server address stay in Settings.
- Hidden without an account: the Team tab, schedule and events, evaluations, coach views of other archers, joining a team, Google sign-in and invite flows (except as the way into an account), profile, account and privacy pages, the sync banner (nothing waits for a server).
- Statistics are computed on the phone in local mode. Today they come from the server only (`server/training/stats.py`, `arrow_stats.py`), so this needs a port to `src/lib` tested against the server with shared vectors, like scoring (`shared/scoring-vectors.json`).
- Videos are kept on the phone and play from the local file. They pile up; no limit now (ADR 0003: the phone converts before upload anyway).
- No export or backup now. Uninstalling the app or losing the phone loses the data; accepted.

## The local owner

- One local owner per phone (`{ kind: 'local', id }` in `src/lib/store-owner.ts`, keys `<store>:local:<id>`). The id is a UUID made on first launch and kept in Preferences.
- Signed out means local mode: `useAuth().storeOwner` is the local owner when there are no tokens, the account otherwise. The stores (`log`, `media`, `equipment`, `notes`) work as they do for an account; their queues fill but nothing is sent while there is no account.
- Notes need the archer's id (`QueuedNote.archer`). In local mode it is a placeholder and is replaced with the account's id when the data is uploaded.
- The local owner does not depend on the server address; changing it in local mode changes nothing.

## Signing in or registering with local data

The same rule on every sign-in and registration: if the local owner holds nothing, nothing is asked.

Otherwise, one confirmation. For a sign-in it comes after the server accepted the credentials and before the app switches to the account. For a registration (and a Google sign-up that creates an account) it comes **before** the request is sent, with the email typed in the form, so Cancel really cancels and no account is made:

> Upload to **anna@example.org**? 12 sessions, 2 bows, 1 arrow set, 30 photos, 4 videos, 6 notes.
> Share your existing sessions with your coaches? **Yes** / **No, keep private**
> **Upload** · **Keep on this phone only** · **Cancel**

- **Upload**: the local stores are merged into the account's stores (copy first; the local copy is removed only once the account's store has been written and read back). The queues then drain as usual, in the existing order (equipment, sessions, media, notes). Ids are made by the app, so uploading into an account that already has data only adds; equipment from two phones may end up twice, which is accepted.
- **The sharing answer** sets the visibility of everything uploaded from the local owner: sessions get `coaches` or `me`, clips without a session get their own value (`Media.visibility`), notes about yourself are private anyway.
- **Keep on this phone only**: the account is used; the local data stays under the local key, hidden while signed in, and is offered again at the next sign-in.
- **Cancel**: nothing is sent for a registration. For a sign-in the tokens are dropped and revoked. The app stays in local mode. If the answer to the sharing question is missing, Upload is disabled (no preselection).
- Videos go up on Wi-Fi only (the existing `videosWifiOnly` setting, on by default). Joining a team does not wait for them; the sync banner shows how many are waiting for Wi-Fi.
- A session uploaded this way may be merged with a session a coach opened (ADR 0004); the archer's wins, as usual.

The account's own stores may already exist on the phone (the person used the account here before). Upload therefore merges into them, it never replaces them.

## Signing out

- Sign-out returns the app to local mode, with the local owner's stores, which are empty after an upload. The account's data stays on the phone under its key and comes back at the next sign-in of that account (as today).
- The sign-out confirmation always shows a line that explains the empty screens afterwards (your data stays on this phone and comes back when you sign in again), plus the existing warning about waiting items when there are any.
- Rejected: copying the account's data into the local owner on sign-out. It would bring back items deleted elsewhere and upload them again on the next sign-in.
- Deleting the account also ends in local mode.

## Not covered

- Several local owners on one phone.
- Export, import or backup of local data.
- A storage limit for local videos.
- Registering without an invite or claim code (decided: not needed, accounts stay tied to a team or claim code).

## Open

- **Account without a team** (decided): local mode needs no registration. Registration still needs an invite or claim code (`RegisterSerializer.invite_code`; Google sign-up answers `no_account` without one) **[fact]**. The Settings entry is for people who already have an account or a code.
- **Minors**: a video taken in local mode by an archer under 18 goes up when they join; the server only refuses it if a birth date is on record and no consent (`video_allowed`). A birth date entered later does not remove clips already uploaded.
