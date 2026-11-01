# Push notifications (#26, #27)

Status: implemented in the server and app; **open for Tim**: Firebase project, keys, privacy pages, Play data safety form, phone test. Not yet built with Firebase.
Date: 2026-11-01

Design: [push-notifications.md](../design/push-notifications.md). Decision: [0010](../adrs/0010-push-via-fcm-http-v1.md).

## Decisions

- One PR for server and app. Android only.
- FCM through HTTP v1 with `google-auth` and `requests` (already dependencies), not `firebase-admin`.
- Push is optional on the server (`DJANGO_FCM_CREDENTIALS`), offered by the official app on the official server only.
- One Firebase project with two Android apps (`de.fletchr.app`, `de.fletchr.app.dev`); one `google-services.json` with both, never committed (CI writes it from a secret).
- Notifies: new shared note, coach evaluation shared, invite or claim code used. Generic texts, language per phone, switches per type on the server.
- Sent after the commit, in the request, with a 5 s budget; failures never break a save.

## Checklist

### Server
- [x] App `push`: `Device`, `fcm.py`, `notify.py`, `PUT` and `DELETE /api/devices/`, admin
- [x] Settings `FCM_CREDENTIALS`, health `push`, logger
- [x] Profile `push_notes`, `push_evaluations`, `push_team` (migration, serializer, transfer, export)
- [x] Hooks in notes (POST, PATCH, PUT), evaluations (POST, PATCH), `redeem_invite`, `claim_profile`
- [x] Password change and reset delete the devices; transfer guard and export updated
- [x] German texts, `.mo` compiled
- [x] Compose: `DJANGO_FCM_CREDENTIALS`, `./secrets:/run/secrets:ro`; `.env.prod.example`; `.gitignore`
- [x] Tests (`server/push/tests/test_push.py`): off without a key, endpoints, private notes never notify, transitions, switches, language, failures and pruning, budget, password change

### App
- [x] `@capacitor/push-notifications`, `cap sync`, manifest (permission, meta-data, icon), `MainActivity` launch intent
- [x] `push-target.ts`, `push-registration.ts` with tests; `usePush.ts` with tests (mocked plugin)
- [x] Sign-out hook in `useAuth`, `push` in `useServer`
- [x] Home: one-time explanation; Settings: list of switches and the permission hint
- [x] Texts (English, German)
- [x] `release-android.yml`: secret `GOOGLE_SERVICES_JSON_BASE64`, `VITE_PUSH=1`

### Docs
- [x] Design doc, ADR 0010, `SELFHOSTING.md` section 9, indexes

### Tim
- [ ] Firebase project (no Analytics), two Android apps, combined `google-services.json` in `android/app/` and as the secret `GOOGLE_SERVICES_JSON_BASE64` in the `release` environment, `VITE_PUSH=1` in the local `.env`. **Before the next release tag**: the workflow fails without the secret
- [ ] Service account with only "Firebase Cloud Messaging API Admin", JSON key to `deploy/secrets/fcm.json` on the server (chmod 600), `DJANGO_FCM_CREDENTIALS=/run/secrets/fcm.json` in `deploy/.env.prod`, then `update.sh`
- [ ] Accept the Firebase data processing terms
- [ ] Play data safety form: device or other IDs, app functionality
- [ ] Privacy pages (`site/datenschutz`, `site/en/privacy`): the push section, and the sentence about no third-party library that sends data; then `deploy/site.sh`
- [ ] Phone test (below), then a release (new plugin, so a new app version), changelog entry

### Phone test (Dev app first, then the Play build)
- [ ] Android 13 and later: the explanation, the system dialog, two refusals lead to the hint in Settings; Android 12 registers without a dialog
- [ ] A note shared from a second phone: lock screen text, icon, channel, device language
- [ ] A tap opens the right screen with the app in the background, killed, and on another screen; foreground toast and note refresh
- [ ] Coach-only and private notes show nothing
- [ ] The switches stop that type; muting a channel works
- [ ] Sign-out stops pushes (online and in flight mode); another user on the same phone
- [ ] Dev and Play app both installed, each getting only its own account's pushes
- [ ] Delivery after some idle time (Doze); reinstall gives a new token, the old one is pruned

## Risks

- A slow Firebase adds up to about 5 s to a save that notifies (see ADR 0010).
- The offline note queue can deliver a note hours later, so the push comes late.
- A phone that never comes back online after a revoke keeps its row until the next send prunes it; the generic text limits what it shows.
- iOS later needs an APNs key in Firebase and `Info.plist` work; `Device.app_id` is there for it.
