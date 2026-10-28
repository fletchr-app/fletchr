# Changelog

What changed in each release. The version number and how a release is made: `specs/steering/releasing.md`.

## Unreleased

- **Sign in with Google (#78), Android, official server only:** a "Sign in with Google" button on the sign-in screen and "Register with Google" on the register screen (an invite or claim code is still needed to register). Google and email sign-in are separate accounts, nothing is matched by email or linked (ADR 0004). A Google account has no password: no password or email change in Settings, and export and deletion ask for a Google confirmation instead of the password. An admin can attach a Google identity to an account in the User admin. The button shows only with `VITE_GOOGLE_WEB_CLIENT_ID` set and the default server; the server needs `DJANGO_GOOGLE_CLIENT_IDS` (unset: endpoint answers 404). Needs the Google Cloud setup in `specs/design/accounts.md`.
- **Account transfer (admin):** `transfer_account <from> <to> --dry-run` and an action in the User admin move the data of one account to a new one (sessions, equipment, media, notes, evaluations, memberships, profile with picture). A test fails when a new model pointing at a user is not handled.
- Server: new endpoint `POST /api/auth/google/`; `has_password` and `sign_in_providers` on `/api/me/`; `sign_in` in the data export; migration `core/0008_socialidentity`; new dependencies `google-auth` and `requests`; new Capacitor plugin `@capgo/capacitor-social-login` (rebuild the APK). Texts about Google sign-in in the privacy pages need the legal review (#63).
- **Notes on photos:** a coach can write a note on a photo and draw on it (lines, angles, circles), as on a video frame. The photo opens in the player; the swipe view and the notes lists show the drawing. On the session and archer pages the frame link and the drawing buttons of a note now work (they did nothing before).
- **Deleting a photo or clip deletes its notes and drawings** (before, the notes of a clip stayed). Migration `notes.0005`.
- **Profile picture (#79):** optional, set on the profile screen (take a photo or choose one) and shown in the members list. Seen by you, the coaches and admins of your teams, and the archers of those teams for their coaches and admins. A coach can set the picture of a profile without an account. For an archer under 18 it waits for the parents' consent, like video. It is part of the data download and is deleted with "Delete my data" and the account.
- Server: new endpoints `/api/me/avatar/`, `/api/users/<id>/avatar/` and `/api/teams/<id>/archers/<id>/avatar/`; `avatar_url` on members, the archer and the profile; migration `core/0007_profile_avatar`; new dependency Pillow.

## 0.9.2, 2026-10-26

- **Placing arrows:** while the finger is down, the whole view zooms in around the spot, and a cross a bit above the finger marks it, so the finger no longer covers it. The spot is the one the unzoomed view would mark. No server changes, no migrations.

## 0.9.1, 2026-10-25

- **Fix:** a session you deleted on the phone showed up in the Training list, on Home and on an archer's page until the list refreshed (up to 15 s). It is hidden at once now. No server changes, no migrations.

## 0.9.0, 2026-10-25

Deeper statistics (milestone 3 is done).

- **Score by your rating:** per face and distance, the average score of the sessions you rated 1 to 5 for physical and for mental form.
- **Compare setups:** two equipment setups side by side (average, spread, group centre), for example before and after a limb change.
- **Numbered arrows:** a list of the numbered arrows that land farthest from the group of their session, for archers who number their arrows.
- Server: new endpoint `/api/stats/arrows/`; `physical_rating`, `mental_rating` and `setup` on the session points of `/api/stats/`. No migrations.

## 0.8.0, 2026-10-25

- **Statistics:** under each average chart the arrows per ring as bars; a heatmap screen ("Where the arrows land", by face, distance and period); a group chart with spread and the centre left/right and low/high over time; in the session view a line "Move the sight ..." (6 arrows or more, centre at least 0.5 cm off).
- **Centred score:** the session view shows the score of the plotted arrows next to what it would be with the centre of the group in the middle, and the average chart has a dashed second line. From 6 plotted arrows. Not an official score.
- **Team:** archers with no arrows in the last 7 days are marked, and a chip shows only them. A "Compare archers" screen (arrows and average per archer) that coaches see only when an admin switches it on in the team settings; it is off by default.
- Server: new endpoints `/api/stats/positions/` and `/api/teams/<id>/ranking/`, `show_ranking` on the team (migration `core.0006`).

## 0.7.0, 2026-10-24

- **Evaluations over time (finishes #46):** on the Progress screen "Up the most" and "Rated lowest" lists, and a radar chart by group (the latest coach evaluation against the first). Coaches and admins have a "Team ratings" screen on the team page: for each criterion the mean of every archer's newest coach evaluation. No server changes, no migrations.
- Website: link to the source code.

## 0.6.3, 2026-10-24

- **Deploy:** CI builds the server image and pushes it to `ghcr.io/fletchr-app/fletchr-server:<tag>`; `deploy/update.sh` pulls it instead of building on the server, and builds there only when the image cannot be pulled. No app changes, no migrations.

## 0.6.2, 2026-10-24

- **Progress of evaluations:** the goals of the newest evaluation show on Home, and a Progress screen (from the evaluation list) has a chart per group of the form with the coach's ratings and the archer's own, and the change per criterion. The radar chart, the improvement lists and the team averages are still to come. No server changes, no migrations.
- First release deployed from CI.

## 0.6.1, 2026-10-24

- **Deploy from CI:** `deploy/update.sh` could not take its lock as the deploy user and could be changed under itself when the checkout moved to the new tag. Both fixed. No migrations, no app changes.

## 0.6.0, 2026-10-24

Evaluations, notes on frames, and deploying from CI. This also covers 0.4.0 and 0.5.0, which were not written up here.

- **Evaluations:** forms per team with versions (a default shooting-technique form with 20 criteria, own wording), a rating from 1 to 5 per criterion with a comment and an optional frame of a video, a date, goals, and self-assessments by archers. A coach's evaluation is visible to coaches only until the coach shares it, and can take it back. "New evaluation" on the archer's page.
- **Frame notes and drawings:** a note can be attached to a frame of a video; lines, arrows and angles can be drawn on a frame.
- **Videos of under-18s:** need a consent recorded by a coach or admin (the mechanism only).
- **Your data:** the export lists photos and videos and offers a zip download; deleting data removes them too. Privacy texts updated (photos, videos, evaluations, backups up to about 12 months).
- **Gallery:** all photos and videos by day, with a full-screen swipeable photo viewer.
- **Versions:** `/api/health/` returns `min_app_version`; the app warns when it is too old or the server is behind.
- **Backups:** `deploy/backup.sh` with an optional restic copy off the server.
- **Deploy:** pushing a release tag can update the server (`deploy/update.sh`, backup first, health check, rollback); `SELFHOSTING.md` replaces the old deployment guide.

Update the server with `deploy/update.sh v0.6.0`, or `git pull` on `main` and `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build`: **new migrations** (`media`, `core` 0005, `notes` 0003 and 0004, `evaluations`). No new required settings.

## 0.3.0, 2026-10-24

Photos and videos.

- **Add photo or video:** one button opens a sheet (take a photo, record a video, choose from the gallery), on a session and on an archer's page. Everyone adds to their own sessions; coaches add to the sessions and the profile of the archers they coach. The uploader or the archer can delete a photo or video, other coaches cannot.
- **Done on the phone:** a photo is shrunk to 2048 px and loses what the camera wrote into it (the position among it); a video is converted by a native plugin (720p on the short side, no audio, every frame, slow motion on its real timeline at the capture rate, a keyframe every 10 frames, no GPS). A clip over 60 seconds of real time is refused. The tile shows the picture or the first frame with a spinner or the progress, and can be cancelled; a failure stays with its message.
- **Offline:** what is added waits on the phone and goes up by itself, oldest first. Videos wait for Wi-Fi unless Settings, App, "Upload videos" says any connection.
- **Server:** the `media` app with `/api/media/` (files served only through permission checks, signed links for the player, Range requests), limits of 60 s and 50 MB per video, 5 MB per photo and 2 GB per archer.
- **Not yet:** the gallery of all media (#40), the frame-by-frame player (#41), the export and deletion of media under "Your data" (#47): until then "Delete my data" leaves photos and videos on the server (deleting the account removes them). Videos were tested with synthetic clips and one phone; battery, heat and other phones are untested.

Update the server with `git pull` on `main` and `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build`: **one new migration** (`media`), new optional setting `DJANGO_MEDIA_QUOTA_MB` (2048). The web server must allow request bodies of about 60 MB (plain nginx: `deploy/nginx/02-fletchr-https.conf` has it; with a panel such as Plesk, check the limit of the site: `SELFHOSTING.md`). The privacy pages and the website are unchanged.

## 0.2.0, 2026-10-23

The gaps of the first version are closed.

- **Home:** this week's arrows and the last session, and a start button for someone who has not trained yet.
- **Session notes:** weather (chips and details), physical and mental form (1 to 5), goals and notes, entered on the session screen at any time, shown to coaches, part of the export.
- **Numbered arrows:** an optional number row while entering an end, with the next number suggested across ends; the numbers show in the end list and on the session plot.
- **Profile:** dominant hand and eye, date of birth (optional) and units (metric or imperial). Coaches see hand, eye and the age, not the date of birth; for a profile without an account the coach can fill the fields in.
- **Units:** distances in yards and group sizes in inches for imperial.
- **Settings:** Profile and Sign-in are separate screens; units, theme and language are choices in the App list.
- **Server:** profile validation, `arrow_number` limits (1 to 99), the coach's profile fields; no database migrations and no new environment settings.

Update the server with `git pull` on `main` and `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build`; the website with `deploy/site.sh` (the privacy pages changed).

## 0.1.0, 2026-10-23

First tagged version: accounts, teams and invites, equipment, offline session logging with arrows on the target face, statistics, coach notes, export and deletion of data, German and English, forgotten password by email, the website with the legal pages, the About page with the app and server version.
