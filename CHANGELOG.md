# Changelog

What changed in each release. The version number and how a release is made: `docs/releasing.md`.

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
- **Deploy:** pushing a release tag can update the server (`deploy/update.sh`, backup first, health check, rollback); `docs/self-hosting.md` replaces the old deployment guide.

Update the server with `deploy/update.sh v0.6.0`, or `git pull` on `main` and `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build`: **new migrations** (`media`, `core` 0005, `notes` 0003 and 0004, `evaluations`). No new required settings.

## 0.3.0, 2026-10-24

Photos and videos.

- **Add photo or video:** one button opens a sheet (take a photo, record a video, choose from the gallery), on a session and on an archer's page. Everyone adds to their own sessions; coaches add to the sessions and the profile of the archers they coach. The uploader or the archer can delete a photo or video, other coaches cannot.
- **Done on the phone:** a photo is shrunk to 2048 px and loses what the camera wrote into it (the position among it); a video is converted by a native plugin (720p on the short side, no audio, every frame, slow motion on its real timeline at the capture rate, a keyframe every 10 frames, no GPS). A clip over 60 seconds of real time is refused. The tile shows the picture or the first frame with a spinner or the progress, and can be cancelled; a failure stays with its message.
- **Offline:** what is added waits on the phone and goes up by itself, oldest first. Videos wait for Wi-Fi unless Settings, App, "Upload videos" says any connection.
- **Server:** the `media` app with `/api/media/` (files served only through permission checks, signed links for the player, Range requests), limits of 60 s and 50 MB per video, 5 MB per photo and 2 GB per archer.
- **Not yet:** the gallery of all media (#40), the frame-by-frame player (#41), the export and deletion of media under "Your data" (#47): until then "Delete my data" leaves photos and videos on the server (deleting the account removes them). Videos were tested with synthetic clips and one phone; battery, heat and other phones are untested.

Update the server with `git pull` on `main` and `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build`: **one new migration** (`media`), new optional setting `DJANGO_MEDIA_QUOTA_MB` (2048). The web server must allow request bodies of about 60 MB (plain nginx: `deploy/nginx/02-fletchr-https.conf` has it; with a panel such as Plesk, check the limit of the site: `docs/self-hosting.md`). The privacy pages and the website are unchanged.

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
