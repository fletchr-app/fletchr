# Accounts and sign-in methods

status: implemented (Google sign-in and account transfer, #78)
Decision: [ADR 0005](../adrs/0005-sign-in-methods-are-separate.md). Plan: [2026-10-28-google-sign-in.md](../plans/2026-10-28-google-sign-in.md).

## How people sign in

- **Email and password**: `/api/token/`, register with an invite or claim code.
- **Google** (Android, official server only): `POST /api/auth/google/` with `{id_token, invite_code?}`. The server verifies the Google ID token (`google-auth`, audience = `DJANGO_GOOGLE_CLIENT_IDS`) and answers like the login (`access`, `refresh`, `user`), 200 for a known identity and 201 for a new account. Errors carry a `code`: `no_account` (unknown `sub`, no code), `email_taken`, `email_unverified`, `invalid_token`; a bad invite or claim code is the usual `invite_code` error. The endpoint answers 404 when `DJANGO_GOOGLE_CLIENT_IDS` is unset (self-hosted servers).
- The two are separate accounts. `SocialIdentity(user, provider, subject)` is unique on provider and subject. An unknown `sub` never signs in to an existing account, even with the same email. The app has no linking.
- A new Google account gets the verified email of the token, a name from the token, an unusable password and the team of the code. It cannot set a password or change its email (`has_password` is false in `/api/me/`; the endpoints answer `password_not_set`). Reset sends no mail for it. Export, "delete my data" and "delete account" take a fresh Google token (`id_token`) instead of the password.
- Code: `server/core/social.py` (one verifier per provider, `sign_in` for all), app: `src/lib/social-login.ts`, `useAuth().signInWithGoogle`, `useProof`.

## Admin: a person changes how they sign in

Cheap, nothing moves: change the email in the User admin (a password account), or add the Google identity in the "Social identities" inline of the User admin. The `sub` comes from the server log after the person tried to sign in:

```bash
docker compose logs django | grep "Social sign-in refused"
```

The line holds the provider, the `sub` and the email. Check that the email and name match the person before you attach it: attaching a wrong `sub` hands the account over.

Expensive (data moves to the new account): `transfer_account <from> <to> [--dry-run] [--id]` (emails, or ids with `--id`), or the action "Transfer data to another account..." in the User admin (superusers; it shows the dry run before the confirm button). Not undoable: back up first (`restic`, SELFHOSTING section 4).

- The target must have no data of its own (no sessions, equipment, photos, notes or evaluations about it); a fresh account made with an invite qualifies. Profiles without an account and staff accounts are refused.
- Team memberships move; in a team both are in with the same role the target's row stays, with different roles the transfer is refused.
- The profile (name, hand, eye, date of birth, units, consent, picture) is copied to the target, the source profile is blanked. The source is deactivated, its tokens are blacklisted, its Google identity stays on it (and can no longer sign in).
- What moves is **discovered**, not listed: `core/transfer.py` walks every relation to `User` and `HANDLERS` has one entry per relation (move, special, or ignore with a reason). `core/tests/test_transfer_guard.py` fails when a new model points at a user, a `Profile` field is new, or a `FileField` is new and nobody said what to do. Add the entry in the same change.
- Files on disk keep names with the old user id after a move (as in `claim_profile`). Fine for serving; if a later change derives paths from the owner id, it breaks transferred files.

## Setup of the Google project (official server, by hand)

1. Google Cloud console: new project, OAuth consent screen (external, app name, support email, link to the privacy page, scopes `openid`, `email`, `profile` only). Publishing status "In production" (in "Testing" only listed test users can sign in; unverified whether basic scopes need a review).
2. Credentials: one **Web application** client, its ID is `DJANGO_GOOGLE_CLIENT_IDS` (server `.env.prod`) and `VITE_GOOGLE_WEB_CLIENT_ID` (app `.env`, public). One **Android** client per signing key: package `de.fletchr.app`, SHA-1 of the debug key (`keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android`) and of the Play App Signing certificate (Play Console, App integrity). The Android client ID is given to neither the app nor the server; the plugin's logcat output (`GoogleProvider`) shows the package and SHA-1 it sees, which helps with "developer console is not set up correctly".
3. Rebuild the app with `VITE_GOOGLE_WEB_CLIENT_ID` set, `npx cap sync android`. `DJANGO_CORS_ORIGINS` still needs `https://localhost`. The Google call goes from the phone to Google; the server only fetches Google's public certificates.
4. Google Play data safety form: email address and user IDs collected for account management (already declared for email sign-in, check the entry).

## Known limits

- No `nonce`: the ID token has no replay protection beyond its expiry (about an hour). The plugin offers a nonce option; a server-made nonce is a possible follow-up.
- Sign in with Apple (needed before an iOS release with Google) is a separate issue.
- The plugin is `@capgo/capacitor-social-login` (MPL-2.0, file-level copyleft). Fallback if it fails on a phone: `@capawesome/capacitor-google-sign-in`.
