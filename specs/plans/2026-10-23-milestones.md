# Milestones

Status: active
Date: 2026-10-23
Repos: fletchr

Order of work: **features first, the Google Play release last** (milestone 6). The app runs on your own phone as a debug build against the live server in the meantime.

Version history of the old plan document: Draft v6, 2026-10-23: the stack, hosting and milestones now match what was built, and the Google Play release moved to the end (milestone 6). What exists today is in the milestone files below. Draft v5, 2026-10-18 (v4 reviewed end to end after adding self-hosting, arrow plotting, video analysis, skeleton detection, evaluations and iOS without a Mac; v5 replaces Expo/React Native with Vue 3 and Capacitor, so the stack matches pyobs-web-client; the last Expo version is the git tag `expo-final`). Defaults are marked **(default)**; any of them can be changed before code is written.

1. **MVP** (done): auth, teams/invites, equipment, session logging by tapping arrows on the target face (works offline), session plot with group centre, coach notes, basic stats (volume, average score), account and data deletion (GDPR and store requirement), Docker setup for local and server. Android app only (the web build is for development; a public web app/PWA and iOS come later)
2. **Media and evaluations**: the video prototype first (it decides Capacitor vs. a native player); then evaluation forms with trend charts, photo/video upload with server conversion, gallery, frame-by-frame player, notes on video frames, off-site backups; then drawing tools on frames
3. **Deeper stats** (partly built): heatmaps, group trend, per-arrow analysis, setup comparison, team dashboard
4. **Notifications and polish**: push notifications, comments on notes, automatic weather, the reset-password link that opens the app (the MVP gaps are closed since 0.2.0)
5. **Advanced**: automatic skeleton detection and form metrics on videos
6. **Release (last)**: Google Play (account, signing, bundle, store listing, internal and closed testing, CI upload on a version tag), iOS App Store once an iPhone tester is available ([ios-without-an-apple-device.md](../design/ios-without-an-apple-device.md)), the fingerprint for app links on the website

Per-milestone state (updated 2026-10-23, version 0.2.0; "built" means it is in the app and tested, "server only" means the data field exists but the app has no screen for it):

- [Milestone 1: MVP](2026-10-23-milestone-1-mvp.md)
- [Milestone 2: media and evaluations](2026-10-23-milestone-2-media-and-evaluations.md)
- [Milestone 3: deeper stats](2026-10-23-milestone-3-deeper-stats.md)

## Milestone 4: notifications and remaining polish (not started)

- Push notifications (new coach note, new evaluation): Firebase and a server hook.
- Comments on notes (#25), automatic weather (#67).
- Reset-password link in the mail that opens the app (issue #19), after the website and the signing key exist; it uses the same link mechanism as the invite links.

## Milestone 5: skeleton detection (not started)

Server-side MediaPipe worker, form metrics, player overlay ([skeleton-detection.md](../design/skeleton-detection.md)). Needs milestone 2.

## Milestone 6: release (last)

- Google Play: developer account and app entry, upload keystore, signing config, release bundle, store listing (screenshots from the website's demo data, feature graphic, data-safety form), first manual upload, then internal and closed testing; a closed test with at least 12 testers for 14 days is needed before production for a new personal account.
- CI that builds and uploads on a version tag (GitHub Actions, upload key in a protected environment, `develop`/`main` flow in [releasing.md](../steering/releasing.md)).
- Fingerprint of the signing key in `site/.well-known/assetlinks.json` so invite links open the app directly; Play and source links on the website.
- iOS (TestFlight, App Store) once an iPhone tester exists, built on a macOS runner.
