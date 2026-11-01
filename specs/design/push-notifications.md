# Push notifications

Status: implemented (Android, #26, #27); not yet checked with a Firebase project on a phone
Date: 2026-11-01

An archer hears that a coach shared a note or an evaluation, and a coach hears that their invite or claim code was used. Plan: [2026-11-01-push-notifications.md](../plans/2026-11-01-push-notifications.md). Decision record: [0010](../adrs/0010-push-via-fcm-http-v1.md).

## What notifies

| Type | When | Who |
|---|---|---|
| `note` | a note becomes readable by its archer: created as `shared`, or changed from `private` or `coach_only` to `shared`, and the author is not the archer | the archer |
| `evaluation` | a coach evaluation (`kind=coach`) becomes `shared`, at creation or later | the archer |
| `team` | someone used an invite or claim code | whoever made the code, if they still coach the team |

The rule for notes reuses `visible_notes`, so a note hidden by the other access rules never notifies. Private notes, coach-only notes, the archer's own notes and self-assessments never do. A push is sent on the change from "cannot read" to "can read" only: an edit of a shared note, or the offline queue repeating a `PUT`, sends nothing. An invite has no addressee (it is a code shared by message), so the only invite event is "your code was used".

Not included, candidates for later: a training cancelled or moved, a photo or clip of the archer, a role change, removal from a team.

## What is sent

Generic, localized text ("New note from your coach", "Tap to read it.") and ids in the data (`type`, `user`, `note`, `session`, `media`, `event`, `evaluation`, `team`). No note text, name or team name goes to the lock screen or to Google. The language is the one the phone reported when it registered (the server has no language setting); unknown means English. Each type has an Android channel (`notes`, `evaluations`, `team`), created by the app with translated names, so a person can mute one in the system settings.

## Server

- App `push`: `Device` (user, token, app id, language, `last_seen_at`; at most 10 per person, 270 days unseen are dropped), `fcm.py` (HTTP v1 with `google-auth` and `requests`), `notify.py` (the rules above), `PUT` and `DELETE /api/devices/`.
- Off without `DJANGO_FCM_CREDENTIALS`: the device endpoints answer 404, `GET /api/health/` says `push: false`.
- Sent after the commit, in the request, 2 s connect and 3 s read per call, 5 s per event. Every failure is logged and swallowed. A device is deleted when Firebase says `UNREGISTERED` or `SENDER_ID_MISMATCH`; other errors keep it.
- Switches `push_notes`, `push_evaluations`, `push_team` on the profile (in `/api/me/`), default on. The server skips the send, so nothing goes to Google for a type that is off. One choice covers all phones. Per-phone control is Android's own (permission, channels).
- Password change and reset delete all devices of the account. Deleting the account deletes them (cascade). A transfer leaves them with the deactivated source. The data export lists the phones (app id, language, times, not the token) and the switches.

## App

- Built with Firebase only when `VITE_PUSH=1` and `android/app/google-services.json` exist; every plugin call is behind that flag, because `register()` without Firebase crashes the app. Offered only on the official server (`!isOverride`, health `push`).
- Firebase's auto init is off in the manifest: no token and nothing sent to Google until `register()`, which happens only after the permission was given. `unregister()` turns it off again and deletes the token.
- Permission (Android 13 `POST_NOTIFICATIONS`): asked once on Home, with an explanation first, after sign-in and only for someone in a team. "Not now" is remembered. Settings can ask later; after two refusals Android shows no dialog, and Settings says so.
- Registers on start, sign-in, return to the app, language change and a new Firebase token (with the old token as `replaces`). Every run is an idempotent `PUT`, so a purge on the server heals itself. Sign-out first removes the phone from the server (3 s cap), then leaves Firebase. When the session ends elsewhere, the phone leaves Firebase and the server's row goes at the next failed send.
- A tap opens the note's photo or clip, session (`/training/<id>` if it is in the log, else `/sessions/<id>`), event, the evaluation or the team. A notification for another account on the phone is ignored. A tap that starts the app arrives through `MainActivity`, which hands the launch intent to the plugin (it only reads the intent of an app that is running).
- While the app is open Android shows no notification: a toast with "Open" appears, and a new note triggers a note pull.

## Privacy and the stores

Firebase Cloud Messaging is a processor (Google, USA, EU-US Data Privacy Framework). The Play data safety form lists device or other IDs for app functionality. The privacy pages say what is stored (token, app id, language, times), what is sent (generic text, ids) and how to switch it off. Self-hosting: [SELFHOSTING.md](../../SELFHOSTING.md) section 9.
