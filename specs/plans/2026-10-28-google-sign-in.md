# Sign in with Google, admin account transfer (#78)

Status: planned, decisions made 2026-10-28, open questions below, not started
Date: 2026-10-28

Decision record: [ADR 0005](../adrs/0005-sign-in-methods-are-separate.md) (separate accounts, no linking, no email matching). Avatar part of the transfer: [profile picture plan](2026-10-28-profile-picture.md) (#79).

## Scope

- `POST /api/auth/google/` verifies a Google ID token and returns the normal JWT pair. Android first. iOS is blocked until Sign in with Apple exists (own issue, see the end).
- Google and email/password are separate ways to register and separate accounts. No linking in Settings, no matching by email.
- Registration with Google needs an invite code or claim code, like email registration (decision 1). The new account gets the verified email of the token (decision 2).
- Admin tools: attach a Google identity to an existing account (cheap path, first), then `transfer_account` and an admin action (second).
- Privacy pages, export and account deletion cover what Google sign-in stores: provider and subject, no token.
- Out of scope: linking, unlinking, other providers, Google on the web build (the web build is only the wrapped app).

## Decisions made

1. **Same rules as email register.** `RegisterView` is invite-only; an unknown `sub` with no code is refused (`no_account`), with a code it creates the account and redeems the code (team invite or claim code, same helper as `RegisterView`). The sign-in screen never creates accounts; the register screen does. Why: otherwise Google would be a way around the invite.
2. **Email from the token, `email_verified` required.** Becomes `User.email`. If that address belongs to another account: refused with a message, never signed in to it (ADR 0005).
3. **Plugin: `@capgo/capacitor-social-login`** (see Plugin below), because it also does Sign in with Apple, which the iOS release needs.
4. **No password for Google accounts** (`set_unusable_password`). They cannot set one, and cannot change the email themselves (the address is what the provider said). Why: "separate ways to register" in the issue, and a password would add a second way in that the person did not ask for.
5. **Official server only (Tim, 2026-10-28).** Google sign-in is not offered for self-hosted servers: the Android OAuth client is bound to the app's package and signing key in one Google project, so only the operator of the Play Store app can run it. The app shows the button only for the default server; a self-hosted server leaves `DJANGO_GOOGLE_CLIENT_IDS` unset and the endpoint answers 404.
6. **Provider list is generic.** `SocialIdentity.provider` is a string (`google`, later `apple`); the server code is `core/social.py` with one verifier per provider, so Apple adds a verifier and a view, not a second design.

## What is there already (checked in the code)

- `User` has `email` (unique, login name), `is_managed`, `is_active`; `Profile` is one-to-one, made by a `post_save` signal. `create_managed` already uses `set_unusable_password()`.
- `core/resets.py::_can_reset` already requires `has_usable_password()`, so reset for a Google account sends nothing (and says nothing, no enumeration).
- `ChangePasswordView`, `ChangeEmailView` check `current_password` with `CurrentPasswordMixin`; for an unusable password that fails with "Wrong password", which is misleading. These need an explicit refusal.
- `RegisterView` holds the code logic (`claims.find_claim` / `claims.claim_profile`, else `access.redeem_invite`) inline. It moves to a shared helper first.
- `claims.claim_profile` is the only existing "move everything to another user" code (memberships, sessions, media, notes). It moves four things by hand; the transfer must not copy that approach (see the guard test).
- `AccountView.vue` shows the email and password forms unconditionally; `MeSerializer` has no sign-in info.
- `/api/health/` returns `version` and `min_app_version`; `useServer` already reads it. `useServer` has `DEFAULT_SERVER_URL` (from `VITE_SERVER_URL`) and an `override` for another server.
- `privacy/export.py` and `privacy/services.py` list what is exported and deleted; a new table must be added there.
- Not there: `google-auth` in `server/pyproject.toml`, any `GOOGLE_*` setting, a Capacitor sign-in plugin.

## Server, part A: Google sign-in and the cheap admin path

1. Dependency: `cd server && uv add google-auth requests` (`google.auth.transport.requests` needs `requests`; **unverified** that no other extra is needed).
2. `core/models.py`: `SocialIdentity(user FK CASCADE related_name="social_identities", provider CharField, subject CharField, created_at)`, `UniqueConstraint(provider, subject)`. No email, no token, no name stored. Migration `core/0xxx_socialidentity` (new table only, no data change).
3. `core/social.py` (new, no Django views):
   - `verify_google(id_token) -> Claims(sub, email, email_verified, name)`: `google.oauth2.id_token.verify_oauth2_token(token, requests.Request(), audience)` with `settings.GOOGLE_CLIENT_IDS`; checks signature, `exp`, `iss` (`accounts.google.com` or `https://accounts.google.com`) and `aud` (**check** whether a list is accepted as `audience` in the installed version; otherwise loop). Raises `SocialError` for anything wrong. Certs are fetched and cached by the library (no user data leaves the server).
   - `sign_in(provider, claims, invite_code) -> (user, created)`: in one `transaction.atomic`:
     1. identity exists: return its user; refuse if `not is_active` (same error as a wrong password, generic).
     2. no identity and no `invite_code`: log and raise `no_account`.
     3. `email_verified` false: refuse.
     4. `User.objects.filter(email__iexact=email).exists()`: log and raise `email_taken` (ADR 0005).
     5. create user (`create_user(email)` then `set_unusable_password()`), set `profile.name` from the token `name` (fallback: part before `@`), create the identity, redeem the code with the shared helper; a bad code rolls back everything (as `RegisterView` does).
     6. `IntegrityError` on the identity (two requests with the same new `sub`): rollback, look it up again, return that user.
   - Every refusal in 2 to 4 logs one line at INFO with provider, `sub` and email (`logger.info("Social sign-in refused (%s): %s %s %s", reason, provider, sub, email)`). This is how the admin gets the `sub` for the attach path (open question Q1). Server logs are rotated like the web server logs; mention it in the privacy text.
4. `core/access.py` or `core/claims.py`: extract `redeem_code(code, user)` from `RegisterView.post` (claim code first, else invite; raises `ValidationError({"invite_code": ...})`); `RegisterView` uses it too. Existing register tests must stay green unchanged.
5. `core/views.py`: `GoogleSignInView` (`AllowAny`, own throttle scope `social`, e.g. `10/min`, in `settings.py`). Body `{id_token, invite_code?}`; answers like login (`access`, `refresh`, `user`) with 200 for an existing user and 201 for a created one. Errors are distinct codes so the app can react: `no_account`, `email_taken`, `invalid_token`, plus the invite code errors. 404 if `GOOGLE_CLIENT_IDS` is empty (the feature is off).
6. `config/settings.py`: `GOOGLE_CLIENT_IDS = [x for x in os.environ.get("DJANGO_GOOGLE_CLIENT_IDS", "").split(",") if x]` (the web client ID). Set only on the official server; unset means the feature is off. The `deploy/` env example gets the variable commented out, and `SELFHOSTING.md` says Google sign-in is not offered for self-hosted servers (decision 5).
7. `/api/health/` is unchanged. The web client ID is a build setting of the app (`VITE_GOOGLE_WEB_CLIENT_ID` in `.env`, public, not a secret), not something the server tells.
8. Password-less accounts:
   - `MeSerializer`: read-only `has_password` (`user.has_usable_password()`) and `sign_in_providers` (list of provider strings).
   - `ChangePasswordView`, `ChangeEmailView`: if `not has_usable_password()` return 400 `{"detail": gettext("This account signs in with Google and has no password.")}` before the serializer runs (the code says `password_not_set`). A hybrid account (admin attached Google to a password account) has a usable password and keeps both forms.
   - Reset: `_can_reset` already refuses; add a test that a Google-only address gets no mail and the same 204.
   - Nothing sets a password for a Google account (decision 4). If Tim wants that later it is a new endpoint, not a change here.
9. `core/admin.py`: `SocialIdentityInline` on `UserAdmin` (add, edit and delete a provider/subject row; this is the attach path), `SocialIdentityAdmin` with `search_fields = ["subject", "user__email"]`. Changing the email of a user is already possible in the User admin. Add a note in the admin help text that the `sub` comes from the log line.
10. `privacy/export.py`: add `"sign_in": [{"provider", "subject", "created_at"}]`; additive, so `FORMAT_VERSION` stays 1 (**check** `export.py` consumers/tests before deciding). No token, no email beyond the account's own. `privacy/services.py`: account deletion removes the identity (cascade; add the row count to the result and to the test), "Delete my data" keeps the account and therefore the identity.
11. `server/locale/`: new `gettext` texts, German in `translate_de.py`; `test_translations.py` must stay green (see `specs/steering/i18n.md`).

## App, part A

1. `npm install @capgo/capacitor-social-login`, then `npx cap sync android`, rebuild the APK (AGENTS.md rule for Capacitor plugins). Keep the Facebook variant off (the package ships `facebookEnabled` and `facebookDisabled` sources; **check** that the default does not pull the Facebook SDK into the APK).
2. `src/lib/social-login.ts` (the plugin wrapper, a storage-style exception to "no Capacitor in lib", like `token-storage.ts`): `signInWithGoogle(): Promise<{idToken}>`; `initialize({google: {webClientId}})` once, with the build-time ID. Cancel returns `null`, not an error.
3. `useAuth`: `signInWithGoogle(code?)` calls the plugin, posts to `/api/auth/google/`, stores the tokens like `signIn`; maps the error codes to message keys.
4. `SignInView.vue`: "Sign in with Google" button (below the form, `AppButton`), hidden unless `VITE_GOOGLE_WEB_CLIENT_ID` is set and the app uses the default server (no override in Settings, `useServer`). On `no_account`: message with a link to the register screen ("No account yet. Register with your invite code").
5. `RegisterView.vue`: "Register with Google" button; needs the invite code field filled first (validated like the email path); on success the same navigation as registration. `email_taken`: message that the address already has an account and an admin can connect them.
6. `AccountView.vue`: when `has_password` is false, hide the email and password forms and show "You sign in with Google" and the address (read-only). `ResetPasswordView.vue`: one static line: "Signed up with Google? Use the Google button on the sign-in screen."
7. `src/locales/en.ts` and `de.ts`: all new texts, no literal English in templates. No English or German sentence in `src/lib`; return keys.
8. `npm run types:api` after the serializer and view changes (new `has_password`, `sign_in_providers`, the new route).

### Plugin (checked 2026-10-28 on npm and in the package README)

| | `@capgo/capacitor-social-login` 8.7.5 | `@capawesome/capacitor-google-sign-in` 0.1.4 | `@codetrix-studio/capacitor-google-auth` 3.4.0-rc.4 |
|---|---|---|---|
| Capacitor | peer `>=8.0.0`; major follows Capacitor major, only latest major maintained (README) | peer `>=8.0.0` | peer `^6.0.0` |
| Last publish | 2026-10-21 | 2026-09-02 | 2024-05-01 |
| Providers | Google, Apple, Facebook, more | Google only (Apple via a sibling plugin) | Google only |
| Android | Credential Manager (README) | Credential Manager (README) | legacy Sign-In SDK |

Repo has `@capacitor/core ^8.5.3`, so the first two fit; the third does not. **Recommended: Capgo**, one API for Google now and Apple later. Unverified: its real behaviour on the installed Android/Gradle versions (only a build and a phone tell), whether it supports a `nonce` on Android (the Capawesome README lists nonce on Android and Web; I did not find it for Capgo), the exact shape of the result (`idToken` field) in `online` mode, the minSdk it needs against `android/variables.gradle`, and the license (MPL-2.0 per `package.json`, file-level copyleft, fine for an app but note it in the credits). Fallback if the Android build or the sign-in fails on the phone: Capawesome for Google, and Apple later with its own Apple plugin.

Without a `nonce` the ID token has no replay protection beyond `exp` (about an hour). Acceptable here (the token is only exchanged for our own JWT, over TLS); revisit if the plugin offers a nonce: server-made nonce from the health call or a `/api/auth/nonce/`. Flagged, not planned.

## Server, part B: account transfer

1. `core/transfer.py` (new): `transfer_account(source, target, *, dry_run=False) -> Report`, one `transaction.atomic`. Steps:
   1. Refuse (`TransferError`, nothing changes) when: source equals target; either is `is_managed` or a superuser; the target has data. **Target has data** means any row of the data models pointing at it: `TrainingSession`, `Bow`, `ArrowSet`, `Setup`, `Media`, `Note` and `Evaluation` about it. Not counted: its `Profile`, its memberships, its social identities and its own invite (a fresh account made through an invite has exactly those).
   2. Memberships: like `claim_profile`; where the target is already in the team, keep the target's row if the source is an archer there, refuse if roles clash (the same rule and message idea as the claim). **Open: Q3.**
   3. `Profile`: copy the fields of the source profile to the target profile (source wins; the target's name only if the source's is blank), including the avatar file (#79: copy the file under the target's name, delete the source file after commit with `transaction.on_commit`). Then blank the source profile.
   4. Everything else that points at the user is repointed by the handler table (next point).
   5. Source: `is_active = False`, `set_unusable_password()`, blacklist its outstanding tokens (as `ChangePasswordView` does), keep the row and its email. The admin may delete the empty stub later with the existing account deletion.
   6. `dry_run` runs everything inside the transaction and rolls it back at the end (`transaction.set_rollback(True)`), so the report counts are real, not estimated.
2. **Discovery, not a list.** `transfer.relations()` yields every relation that involves `User`: `User._meta.get_fields(include_hidden=True)` (reverse one-to-many and one-to-one, reverse and forward many-to-many, hidden `related_name="+"` ones, auto through tables) plus the fields of explicit through models. `HANDLERS` maps `"app_label.Model.field"` to a handler:
   - `move`: `Model.objects.filter(field=source).update(field=target)`. For: `bows`, `arrow_sets`, `setups`, `training_sessions`, `media.owner`, `media.uploaded_by`, `notes.archer`, `notes.author`, `evaluations.archer`, `evaluations.author`, `evaluations.created_by`, invites created/used, `claim_codes`.
   - `special`: `profile` (step 3), `memberships` (step 2).
   - `ignore("reason")`: `groups`, `user_permissions` (the admin sets them; staff cannot be transferred anyway), `password_resets` (dead after the move), `token_blacklist.OutstandingToken` (blacklisted), admin `LogEntry`, `social_identities` (they stay with the old account; the old `sub` then points to a deactivated user and cannot sign in).
   - Handlers with unique constraints (membership per team, anything unique per user) are `special`; the guard test lists them.
3. **Guard test** `core/tests/test_transfer_guard.py`: (a) every relation from `relations()` has a handler, with an assertion message that names the field and says "add it to HANDLERS in core/transfer.py"; (b) no handler for a relation that does not exist (stale entries); (c) for `Profile`, every concrete field is in `COPY_FIELDS` or `SKIP_FIELDS` (a new `avatar` or `birth_date` is not an FK, so (a) would not catch it); (d) every `FileField`/`ImageField` on a moved model is named in `FILE_FIELDS` and handled. This is what keeps #79 (avatar), #81 (photo notes) and #82 (coach-opened sessions) honest when they land: each adds its fields or relation to the table in the same change.
4. Transfer tests (`core/tests/test_transfer.py`): full move with one row of every kind; the report counts equal the changes; dry run changes nothing (compare a row snapshot); target with a session refused, with equipment refused, with only a profile and a membership allowed; same team membership (archer and archer, coach clash); source inactive and its refresh token blacklisted; target keeps working with its own Google identity and sees the history; media files stay readable by the target (the files keep names with the old id, as in `claim_profile`); avatar file copied and the source file removed after commit; transfer to self and to a managed profile refused; atomic: a handler that raises leaves everything unchanged.
5. `core/management/commands/transfer_account.py`: `transfer_account <from> <to> [--dry-run]`, arguments are emails (or ids with `--id`); prints the report (counts per relation, what was refused and why); exit code 1 on refusal. Tests call it with `call_command`.
6. `core/admin.py`: action "Transfer data to another account..." on `UserAdmin` (exactly one source selected). An intermediate page asks for the target (autocomplete on email), shows the dry-run report, and runs only on the confirm button; superusers only (`has_perm`). Message after: counts, and a link to the deactivated source. Test with the admin client: permission, dry-run page shows counts and changes nothing, confirm runs, refusal shows the reason.

## Docs and setup

- Operator setup for the official server (goes into `specs/design/accounts.md`, not into `SELFHOSTING.md`, which gets one sentence that Google sign-in is not available for self-hosted servers):
  1. Google Cloud console: new project, OAuth consent screen (external, app name, support email, privacy policy link to the site's `datenschutz` page, scopes `openid`, `email`, `profile` only). Set the publishing status to "In production"; **unverified** whether basic scopes need no review (the plugin README says production is not required but test users must be listed while in Testing, so Testing blocks everyone else).
  2. Credentials: one **Web application** client; its ID is `DJANGO_GOOGLE_CLIENT_IDS` and what the app passes to the plugin (`webClientId`). One **Android** client per signing key: package `de.fletchr.app` (from `capacitor.config`), SHA-1 of the debug key (`keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android`) and of the Play App Signing certificate (Play Console, App integrity). The upload key's SHA-1 only matters for builds installed from your own upload; Play-installed builds are signed with the Play key. The Android client ID is never given to the app or the server; the plugin's logcat output (`GoogleProvider`) prints the package and SHA-1 it sees, which is the way to debug "developer console is not set up correctly".
  3. Server `.env`: `DJANGO_GOOGLE_CLIENT_IDS=<web client id>`; app `.env`: `VITE_GOOGLE_WEB_CLIENT_ID=<same id>`, rebuild the app; `DJANGO_CORS_ORIGINS` must still contain `https://localhost` (the app origin); the Google call itself goes from the phone to Google, and the server only fetches Google's public certificates, so nothing else is opened.
  4. Admin how-to: "A person changes how they sign in": cheap path (change the email in the User admin, or add the Google identity in the inline; the `sub` is in the server log, `docker compose logs django | grep "Social sign-in refused"`), expensive path (`transfer_account --dry-run`, then for real, or the admin action).
- Privacy: German and English privacy pages in `site/datenschutz/` and `site/en/`, the in-app `PrivacyView.vue` texts and the delete-account page: Google sign-in is optional, stores provider and subject ID (an identifier from Google) and the address, no token, Google receives the sign-in request from the phone (their privacy policy applies), the log line with `sub` and email on a refused sign-in. The wording needs the legal review (#63); say so in the PR. Google Play data safety form: add "email address" and "user IDs" collected for account management (already declared for email sign-in, check the entry).
- `specs/design/roles-and-access.md` or a new `specs/design/accounts.md`: sign-in methods, password-less accounts, transfer. `specs/design/ios-without-an-apple-device.md`: line on the plugin. `specs/steering/releasing.md` needs no change. `CHANGELOG.md`.
- ADR 0005 status to `accepted` when Tim agrees.

## Order

1. Answers to Q1 to Q4.
2. Part A server: extract `redeem_code`; model, migration, admin inline; `core/social.py`; view, throttle, settings, health; password-less rules; export and deletion; tests with the mocked verifier. Commit-ready on its own: with the inline, the attach path works as soon as a `sub` is known.
3. `npm run types:api`; app part A: plugin, wrapper, `useAuth`, sign-in and register buttons, account screen, reset hint, locales; Vitest for the wrapper and the error mapping.
4. Google Cloud project and Android clients (Tim, console; needs the debug SHA-1 first); build the APK, `npx cap sync android`; test on the phone (checks below).
5. Docs, privacy texts. Release as a MINOR version (new endpoint, new `/api/me/` fields; old apps ignore them, so `MIN_APP_VERSION` stays).
6. Part B: `core/transfer.py`, handler table, guard test; command; admin action. Do it after #79 lands, or add the avatar handling in whichever of the two comes second; the guard test (c) forces that.
7. `npm run type-check`, `npm test`, `cd server && uv run pytest` before each hand-over (AGENTS.md).

Tests part A (server, verifier mocked by monkeypatching `core.social.verify_google`; one separate test of `verify_google` with `id_token.verify_oauth2_token` patched, covering wrong `aud`, wrong `iss`, expired, unverified email): known `sub` signs in; unknown `sub` without code refused with `no_account` and nothing created; with a valid invite creates user, membership, unusable password, identity, profile name; with a claim code takes over the managed profile; bad code leaves no user behind; `email_taken` (also with different case) refused and logged; inactive user refused; `email_verified` false refused; double creation race (second call returns the first user); throttle; feature off returns 404; `has_password` and `sign_in_providers` in `/api/me/`; change password and change email refused with `password_not_set` for Google accounts, still working for password accounts and for a hybrid; reset sends no mail for a Google address; export lists provider and subject and no token; account deletion removes the identity; German texts.

Checks on the phone: sign in with a known account; register with an invite; cancel the account chooser (no error shown); wrong network; the debug build and, later, the build installed from Play (different SHA-1); account screen of a Google user; sign-in screen on a server without Google configured (no button).

## Risks

- **Self-hosters.** No Google sign-in for them (decision 5); email sign-in is unaffected. Anyone who builds the app from source with their own `VITE_SERVER_URL` gets no button unless they also set their own client ID and server variable, which is their own Google project.
- **Admin needs the `sub`.** The person cannot read their own `sub`. The plan uses the log line of a refused sign-in. If that is too clumsy, alternative (Q1): an admin-made "attach code" (like `ClaimCode`) that the person enters on the register screen instead of an invite. More code, no log reading.
- **Plugin quality is unproven.** Capgo is actively published and matches Capacitor 8 on paper; nothing here has run on the repo's Gradle setup. A day for the build may be lost. The fallback exists.
- **No nonce** (see Plugin). Token replay within its lifetime is possible for whoever already holds a valid ID token of the user.
- **Account takeover through reused Google accounts or addresses** is the reason for ADR 0005. The remaining weak spot is the admin attach: attaching the wrong `sub` hands an account over. The admin page shows the target's email and name next to the `sub`; no automation.
- **Transfer is not undoable.** Run `--dry-run` first; the admin action always shows the dry run before its confirm button. Back up before the first real transfer (`restic`, SELFHOSTING section 4).
- **Transfer and unique constraints.** Per-user unique rows (team membership today) are handled by hand; the guard test only proves a handler exists, not that it is right. The tests for the clashes are the protection.
- **Files on disk keep names with the old user id** after a move (same as `claim_profile`). Fine for serving; if a later change derives paths from the owner id, it breaks transferred files. Note in the media design doc.
- **Privacy:** the refused-sign-in log line holds `sub` and email. Keep logs short-lived (SELFHOSTING already rotates), and say it in the privacy text.
- **Google Play policy:** sign-in with Google is allowed alone on Android. On iOS Apple requires Sign in with Apple next to any third-party login.

## Open questions for Tim

- **Q1.** How does an admin get the `sub` for the attach path: log line (planned, cheap) or an admin-made attach code (cleaner for the admin, about a day more)?
- **Q2.** Is it right that a Google account can neither set a password nor change its email by itself? (Planned: no. Changing the email would need a fresh Google token proving the new address, which is the same problem as linking.)
- **Q3.** Transfer where the target is already in the same team: keep the target's row for archers, refuse on role clash (planned, like the claim). Or always refuse and let the admin remove the target's membership first?
- **Q4.** `transfer_account` identifies users by email (planned) or by id? Emails of deactivated and managed accounts are ugly, but ids are not memorable.

## Follow-up issue (to open, not part of this plan)

**Sign in with Apple (iOS).** Blocks the App Store release of anything with Google sign-in. Needs: Apple Developer account (already required, [ios-without-an-apple-device.md](../design/ios-without-an-apple-device.md)), the "Sign in with Apple" capability, a Services ID if it must work on Android too (Capgo does Android through a web flow), `POST /api/auth/apple/` verifying the identity token against Apple's JWKS (`PyJWT` with `cryptography`; **unverified** whether `google-auth` helps, it does not), a `SocialIdentity` row with `provider="apple"`, and the Apple specifics: name and email only on the first authorization, the private relay address (so `email_taken` must still hold and the address can be unreachable by our mail), and account deletion must call Apple's revoke endpoint (App Store requirement for apps with account creation; **check** the current wording before building). Reuses `core/social.py`, the register rules of decision 1, the password-less handling and the transfer table unchanged.
