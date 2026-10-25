# Status

Where the project stands against `docs/plan.md` (the plan describes what is wanted, this file what exists). Updated 2026-10-23, version 0.2.0. "Built" means it is in the app and tested; "server only" means the data field exists but the app has no screen for it.

Order of work: **features first, the Google Play release last** (milestone 6). The app runs on your own phone as a debug build against the live server in the meantime.

## Milestone 1: MVP (done)

| Area | State |
|---|---|
| Accounts | built: sign in, register with an invite code, change name, email and password, forgot password (code by email), export and delete data or account |
| Teams | built: create, leave, delete, invites (code and link), roles archer/coach/admin, role changes and admin handover in the app, "also shoots" per team |
| Archers without an account | built: a coach keeps a profile, logs sessions and writes notes for it; the archer takes it over with a claim code |
| Equipment | built: bows and arrow sets with revision history, a setup (bow + arrow set) chosen per session |
| Logging | built: sessions of type scoring, competition, volume and technique, indoor/outdoor, location; ends with arrows placed on the face with a magnifier; number-pad entry; offline first, uploaded later; the server recomputes scores |
| Target faces | built: WA 122, 80, 60, 40, compound and 6-ring variants, triple faces (vertical and triangle), field faces, blank |
| Session view | built: arrows on the face, group centre and spread, ends, totals; a coach sees live sessions ("shooting now") |
| Stats | built: arrows per week/month/total, average score per face and distance with a trend line, best-ring, X and miss rates |
| Notes | built: coach notes on an archer, a session or an end, visibility private / coach-only / shared, "only me" notes stay out of the archer's export |
| Home, Team, Settings | built: Home (this week's arrows, last session, your teams, the latest coach notes about you), Team overview for coaches (last session, arrows in 7 days), Settings (theme, language, server address, About with app and server version) |
| Languages | built: English and German in the app, the server's messages and the mails |
| App and server versions | `/api/health/` returns `version` and `min_app_version`; the app shows a banner on Home when it is below the minimum or the server is a minor version behind (`src/lib/version.ts`, `VersionBanner.vue`) |
| Deploy | A release tag deploys the server from CI (`.github/workflows/deploy.yml`): checks, the server image built and pushed to `ghcr.io/fletchr-app/fletchr-server:<tag>`, then a restricted SSH key runs `deploy/update.sh` (backup, pull the image, restart, health check, rollback). Run for real: v0.6.2 and v0.6.3 (the pull path by hand on v0.6.3), and the failure path on the server. The `production` environment needs a click from the reviewer for every deploy. |
| Server and website | `app.fletchr.de` runs the server in Docker behind a web server, with its own SMTP for mail; `fletchr.de` serves `fletchr.de` with German and English pages, Impressum, privacy policy, delete-account page and the invite-link page |

Not in the app although the plan lists it:
- profile picture (avatar; not even a field)
- comments (replies) on notes (#25)

The earlier gaps (Home with last session and week, session details, arrow numbers, profile fields and units) were closed in 0.2.0.

Open in practice (not release dependent):
- **Backups:** `deploy/backup.sh` makes the database copy and, with `deploy/.env.backup`, an encrypted restic backup of copies and uploads off the server (30 daily, 12 monthly kept); tested against a local repository, including a restore. Setup and restore are in `docs/self-hosting.md`, section 4. The privacy texts say up to about 12 months in backups, as the retention does.
- **Website:** `noindex` is on until the privacy text has had a legal review.

## Milestone 2: media and evaluations (started)

- Evaluations (#44, #45): the server app `evaluations` has forms per team (`Template`, with versions: a change makes a new version, criteria keep their keys), evaluations (`Evaluation` with a date, kind coach or self, visibility, comment, goals) and scores (rating 1 to the scale, comment, optional clip and frame). A team starts with the shooting technique form (20 criteria in 5 groups, 1 to 5, in the structure of the DSB squad technique sheet, own wording; lazily made, in the language of whoever asks first). Evaluations are coach-only until the coach shares them (and can take it back); a self-assessment is read by the archer and their coaches; the export and "Delete my data" cover them. The app has a forms editor (Team, Evaluation forms), the evaluation form (rating buttons, comment, link a frame through the player), a list per archer (from the archer's page and from Home) and a detail page that links the frames. Open: trends and goals on Home (#46), averages per team.
- Photos and videos: the phone converts them (Media3, `docs/video-prototype.md`), the server only stores and serves them. Done: the prototypes (#35, #70) and the server side (#36: `media` app, `/api/media/`, permission-checked files with Range support, limits, quota). Photos (#37) are in the app: the Camera plugin picks or takes the photo, the phone shrinks it to 2048 px and strips the metadata, the upload queue (`useMedia`, files in the app's data folder) works offline and is generic for photos and videos. Added on `/media` from a session (everyone, and coaches for their archers) or from an archer's page (coach). Videos (#39): one Add sheet (take photo, record video, choose from gallery); a native plugin (Media3, `VideoConverterPlugin.java`) converts a chosen clip on the phone with the rules of `src/lib/video-plan.ts` (720p short side, real timeline, keyframe every 10 frames, size-capped bitrate, refuses clips over 60 s of real time), shows the first frame and the progress on the tile, and the small file goes into the same queue. Videos wait for Wi-Fi unless Settings says otherwise. Verified on the phone with synthetic clips (normal, rotated, speed 4, cut-off, garbage, cancel); not yet with a real clip through the picker, on a second phone, or for battery and heat. Player (#41, `/media/:id`): the clip is fetched into memory, the `<video>` plays it, and scrubbing, frame steps and the slider show single frames on a canvas decoded with WebCodecs (own MP4 reader `src/lib/mp4-samples.ts`, groups of frames decoded ahead in `src/lib/frame-decoder.ts`; without WebCodecs the `<video>` seeks, one seek at a time). The tape is one tick per frame, speeds 1x to 0.1x, previous and next clip of the session or archer. Gallery (#40): Home links to all your media, `/media` has a section per day, photos open full screen and swipe. Notes on frames (#42): a note can carry a clip, a frame and a time (`media`, `frame`, `time_ms` on `Note`, same visibility rules); the player has a notes sheet (chat button, count) where coaches add a note at the shown frame, a dot on the tape per note, the note of the shown frame under the readout, and a tap on a note jumps to its frame. Drawing (#43): a frame note can carry a drawing (`drawing` on `Note`: lines, angles with their degrees, circles, five colours; points are fractions of the picture, checked by `notes/drawing.py`). A coach draws in the player (pencil button: drag for a line or circle, three taps for an angle, undo), the drawing is saved with the next note, shows over its frame, and can be changed or removed from the note ("Edit drawing"). Single shapes cannot be moved yet, only undone from the last one. Open: compare, long clips and fast flicks (#72). Export and deletion (#47): the JSON export lists the media, a second button downloads a zip of the files (`POST /api/me/export/media/` gives a ten-minute signed link, the zip is streamed; the phone opens it with `@capacitor/browser`), and "Delete my data" and account deletion remove the rows and files, also what a coach added for the archer. Video consent (#48): a profile has `video_consent_at` and `video_consent_by`; for an archer under 18 (birth date known) without it, the server refuses new videos (photos are not affected) and the app hides video; a coach records or withdraws it on the archer's page (`PUT/DELETE /api/archers/<id>/video-consent/`). An archer without a birth date counts as allowed. How consent is collected (wording, join flow) waits for the legal review (#63). Not yet checked on the phone. The privacy pages (de, en), the delete-account pages and the in-app texts now describe photos, videos, frame notes and drawings, evaluations and the video consent; the legal review of the wording is still open.
- Backups of media (restic, off-site, #49): the script and the guide are done; the setup on the server is open (see Backups above).

## Milestone 3: deeper stats (partly)

Built: volume, average score, best-ring/X/miss rates, group centre and spread per session. Score distribution (#28): arrows per ring as bars under each average chart. Heatmap (#29): `GET /api/stats/positions/` gives the positions of one face and distance (filter: period, setup), the app draws a density picture at `/stats/heatmap` (linked from each average chart); on a triple face all spots are laid on top of each other. Group trend (#30): per session the centre and spread of the plotted arrows (`centre_x`, `centre_y`, `spread` as fractions of the spot radius, `radius_cm`), a chart with spread, left/right and low/high, and in the session view a line "Move the sight ..." (six arrows or more, centre at least 0.5 cm off; the direction is towards the group, a rule of thumb that is not checked against a coach yet).

Not built: group trend needs the setup filter in the app (the endpoint has it), per-arrow-number grouping (needs the arrow number in the app, #32), comparison by setup (#31), self-rating vs score (#33), team comparison and leaderboard (#34), centred score (#68).

## Milestone 4: notifications and remaining polish (not started)

- Push notifications (new coach note, new evaluation): Firebase and a server hook.
- Comments on notes (#25), automatic weather (#67).
- Reset-password link in the mail that opens the app (issue #19), after the website and the signing key exist; it uses the same link mechanism as the invite links.

## Milestone 5: skeleton detection (not started)

Server-side MediaPipe worker, form metrics, player overlay (plan section 6). Needs milestone 2.

## Milestone 6: release (last)

- Google Play: developer account and app entry, upload keystore, signing config, release bundle, store listing (screenshots from the website's demo data, feature graphic, data-safety form), first manual upload, then internal and closed testing; a closed test with at least 12 testers for 14 days is needed before production for a new personal account.
- CI that builds and uploads on a version tag (GitHub Actions, upload key in a protected environment, `develop`/`main` flow in `docs/releasing.md`).
- Fingerprint of the signing key in `site/.well-known/assetlinks.json` so invite links open the app directly; Play and source links on the website.
- iOS (TestFlight, App Store) once an iPhone tester exists, built on a macOS runner.
