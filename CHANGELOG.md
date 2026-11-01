# Changelog

What changed in each release. The version number and how a release is made: `specs/steering/releasing.md`.

## 0.19.2 (2026-11-01)

- **Releases reach the closed test**: the release workflow now uploads each version to the internal track and to the closed test in one step. No change in the app or the server.

## 0.19.1 (2026-11-01)

- **Deleting your account leaves the screen**: after "Delete my account" the app stayed on the "Your data" screen, although the account was gone and you were signed out. It now goes back to the start screen.

## 0.19.0 (2026-11-01)

- **Every account has a name** (#140): the profile no longer accepts an empty name, and accounts that had none get the part of their email before the `@` (what a new Google account gets too; change it in the profile). Where a name is missing anyway, screens show that part and never the whole address, so archers no longer see a coach's email in a note, evaluation or session. One migration (`core/0013`).

- **Team list for archers** (#80): the Team tab shows for everybody with an account. Archers see the people in their team (name, role, picture) and the schedule. Who sees your name and picture is a setting (Settings, "My name and picture are seen by": My team, My coaches or Only me). The default is My team, so after the update the members of your teams see your name and picture unless you change it. Archers no longer see the email addresses of coaches and admins. New endpoint `/api/teams/<id>/roster/`, one migration (`core/0012`). Old apps keep working; they show no Team tab to archers and no setting.

## 0.18.1 (2026-11-01)

- **Notifications are switched on in Settings** (#27): Settings has a switch "Notifications on this phone". Android asks for the permission when you turn it on, and nothing asks before. The explanation on Home is gone. The switches for notes, evaluations and used codes show while the main switch is on. A phone that allowed notifications in 0.18.0 keeps them.

- **Fixes**: a phone that registered for notifications twice at once could fail with "database is locked", and the server now waits for the write lock instead (this applies to all writes). A refusal by Firebase says why in the server log.

## 0.18.0 (2026-11-01)

- **Push notifications, Android** (#26, #27): a notification tells you when a coach shares a note or an evaluation with you, and a coach hears when someone uses an invite or claim code they made. The text is general ("New note from your coach"), never the note itself or a name. Tapping it opens the note, the evaluation or the team. Home asks once whether to allow them, and Settings has a switch for each kind. Private and coach-only notes never notify. They come through Firebase Cloud Messaging (Google), only after you allow them, and only on the official server: a self-hosted server needs its own Firebase project and app build (SELFHOSTING.md, section 9). The server sends none until it has a Firebase key.

## 0.17.2 (2026-11-01)

- **Password reset link** (#19): the reset mail can carry a link, `https://fletchr.de/reset/<code>`. On the phone it opens the app on the reset screen with the code filled in; without the app the page shows the code. The address the code was sent to is kept on the phone for the hour the code works, and asked for when it is missing. The mail has the link only when the server knows its website (`DJANGO_SITE_URL`, SELFHOSTING.md, section 7).

- **Links in invite texts** (#56): the share text of an invite or claim code contains `https://fletchr.de/join/<code>` on the official server, and the link opens the app (the signing and upload certificates are in `assetlinks.json`). A link tapped twice works the second time too.

## 0.17.1 (2026-11-01)

- **Home reloads after a connection loss** (#132): an error on Home goes away by itself when the connection returns or the app comes back to the front. A token refresh that hangs while the connection switches now ends after 10 seconds instead of blocking every request.

- **Camps in the schedule** (#133): a multi-day camp says "from <time>" on its first day, "all day" in between and "to <time>" on its last day.

- **New one-off in month view** (#137): the form starts on the day you picked.

- **Fixes**: a coach's session that was merged on the server disappears from the coach's list (#131); the Training list no longer keeps the previous account's sessions after sign-out (#134); "move to session" for a photo works (#135).

## 0.17.0 (2026-10-31)

- **Trainings in the phone's calendar, Android** (#107): Settings has a switch that writes the trainings, competitions and camps of your teams into a calendar of its own on the phone ("Fletchr", on this phone only). Every training is an entry of its own, so a cancelled or moved one simply disappears. Optional reminder. Turning it off or signing out removes the calendar. Needs the calendar permission, asked when you turn it on.

- **First start opens Home** (#130): a fresh install, or one whose sign-in expired, no longer flashes the sign-in screen and lands on Home in local mode.

## 0.16.0 (2026-10-31)

- **Month view in the schedule** (#106): the team's schedule has a "List | Month" toggle. The month shows the days with dots for what is on (cancelled ones hollow); a tap on a day lists its trainings below, with the same actions as the list. A camp over several days is on every day it covers and says "until <date>". The week starts on Monday in German and on Sunday in English (from the app language). No iCal feed (the device calendar is #107).

## 0.15.0 (2026-10-31)

- **Android backup leaves out photo and video files** (#93): the log, equipment and notes stay in Android's backup, the photo and video files do not (they would fill the backup limit).

- **Edit a note without an account** (#93): in local mode a note's text can be changed ("Change note" under the note, on the session and on a photo or clip).

- **Signing in with data from local mode uploads it** (#93): when you sign in or register and the phone holds sessions, equipment, notes, photos or videos from using the app without an account, one question appears: the counts, the account's email, "Share your existing sessions with your coaches?" (Yes / No, keep private, no preselection; Upload stays off until you answer) and Upload / Keep on this phone only / Cancel. Upload merges the data into the account on the phone (nothing the account has is changed), checks that it was written, then removes the local copy; the normal upload then sends it, videos on Wi-Fi only (the sync banner shows how many wait for Wi-Fi). Your answer sets who sees the uploaded sessions and the photos and videos that are in no session. For a registration the question comes before anything is sent, so Cancel creates no account. If moving the data fails, nothing is changed on the phone and you are not signed in. Nothing is asked when the phone holds nothing. Sign-out now always asks and says the screens will be empty and the data comes back at the next sign-in. Photos and videos have a new optional `visibility` in the upload (no server change).

- **Keep a session from your coaches** (groundwork for #80 and #77): every session has a `visibility`, `me` or `coaches`. On the session notes screen "Coaches can see this session" turns it on or off, and a lock marks private sessions in the lists. Settings has "New sessions are seen by" (needs a connection); photos and videos that are in no session follow it too (all that already exist, unless a clip has its own value). Existing sessions stay visible to coaches, and `coaches` is the default for every account. A coach no longer gets a private session anywhere: not in the lists, the live view, statistics, heatmap, arrow statistics, the team overview and ranking, the event pages, photos and videos (file and thumbnail), or notes (a note a coach wrote on a session that becomes private is hidden from them too, and returns when you share again). A coach cannot put a clip or a note into a private session. A session a coach opens for you starts at `coaches`; you can narrow it. Scale `me` < `coaches` < `team` < `everyone` is in `server/core/audience.py`, only the first two are accepted now ([ADR 0009](specs/adrs/0009-ordered-audience-scale.md)). New: `visibility` on sessions and in `/api/me/` (`profile.training_visibility`), and on photos and videos for a clip in no session. Migrations: `core/0010`, `training/0004`, `media/0004`. An old app does not send it and gets the default; a server older than this ignores it, and the app shows no lock then.

- **Photos and videos you uploaded stay on the phone** (#83, #84): after the upload the phone keeps the file, up to a limit you set in Settings ("Keep uploaded photos and videos": do not keep, 250 MB, 1 GB, 4 GB, no limit; 1 GB by default). The oldest unused go first. Kept clips play frame by frame and take notes and drawings without a connection; kept photos open full size. Settings shows what is kept and clears it. Only what you uploaded from this phone is kept, nothing is downloaded in the background, and what waits to upload is never removed.

- **Use the app without an account** (#93): the app opens on Home without an account, no sign-in needed. Sessions, equipment, notes (also with drawings on photos), photos and videos, statistics and the heatmap all work on the phone, and the app sends nothing to a server. Teams, coaches and evaluations need an account. Settings has "Backup: export and import" (one JSON file with sessions, equipment and notes; photo and video files are not in it) and "Sign in or register": signing in later keeps the data on the phone but does not upload it (uploading is planned). Signing out and deleting the account return to this mode, on Home, and the sign-in screen no longer has "Use without an account" (it is reached from Settings). Anyone who chose it earlier keeps their data. Statistics are computed on the phone and are tested against the server's with a shared file (`shared/stats-vectors.json`); the scoring vectors now cover every ring of every target face.

- **A clip that has not been uploaded yet can be played** (#83, #84): tapping it in the media screen opens the player on the file on the phone, frame by frame like any clip. Delete and move to a session work too. You can write notes and make drawings on your own photos and clips that wait to upload; they go up after the photo or clip. For an archer you coach this needs the upload first.

- **Your notes can be read without a connection** (#84): the phone keeps the notes about you (your own and those coaches shared with you) and, for coaches, the notes you wrote. The notes on a session, under a photo in the media screen and "from your coaches" on Home show them when there is no connection (with a line that says so). Changing and deleting a note still needs a connection. Needs a server with 0.14.0.

## 0.14.0 (2026-10-30)

- **Your photos and videos are listed without a connection** (#84): the phone keeps the list of your photos and videos and their small pictures, and the media screen shows them when there is no connection (with a line that says so). Full photos and videos still need a connection. Deleted ones disappear from the phone at the next sync. The small pictures use some storage (tens of MB for a thousand photos).

- **Server: what a phone needs to pull photos, videos and notes** (#84). Photos and videos have `updated_at` and the list takes `updated_after`; so does the list of notes. Deleted photos, videos and notes are listed at `GET /api/gone/` (only the id and the time are kept), for the people who may keep a copy. The app does not use this yet. Migrations: `core/0009_tombstone`, `media/0003_updated_at`.

- **Team schedule and trainings** (#104): a team gets weekly trainings (slots, edited in the team settings by coaches) and one-offs (competition, camp, extra training) in an agenda. A session, a note or a photo can be linked to the training that takes place then: the app suggests it, you confirm or pick "None", nothing is linked by time alone. A coach can write notes and add photos for archers at a training without opening a session for each. A session linked to a training shows that archer's notes and photos of it. Archers without a linked session (or a profile without an account) see the training as a row in the history, which opens the training with its notes and photos, and "Put into a session" moves them into a session. Notes can be about an earlier time. New endpoints: `/api/slots/`, `/api/events/` (agenda, mine, archers, attach). Three migrations (`training/0003`, `notes/0008`, `media/0002`); the server image needs `tzdata` (added as a dependency). Old apps show the training rows on a linked session but cannot choose trainings. Offline use of the schedule is not built yet.

- **Sessions come to the phone from the server** (#84): the phone now takes all your sessions with their ends and volume, not only those a coach opened. A new phone, or one after a reinstall, shows your whole history and can edit it. Results you enter on one phone arrive on the other at the next sync; an end deleted on one phone disappears on the other. Anything on a phone that has not been uploaded yet is never overwritten (the queued change goes up and wins). The first sync on a phone with a long history needs one request per session and can take a while.

- **Notes about your own training in the app** (#84): on a session of yours, on your photos and clips you can write a private note for yourself (no team, nobody else reads it). They are saved on the phone first like other notes. The list on a session says "My notes" instead of "Coach notes". A session on your phone has a new "Notes" link for this.

## 0.13.0 (2026-10-30)

- **Notes can be written without a connection:** a note (also one with a drawing on a photo or a frame of a clip) is saved on the phone at once and uploaded when there is a connection, after the photo, clip or session it is about. Until then it shows in the list as "waiting to upload" and can be taken back; a note the server refuses shows in the upload banner. Changing or deleting a note that is already up still needs a connection (#84).
- **Server: notes about your own training** (#84). Every archer can write a note about their own sessions, ends, photos and videos; it has no team, is always private and nobody else can read it. The app gets screens for it later. New `PUT /api/notes/<uid>/` creates a note by an id the app made, for notes written offline. Needs a migration (the team of a note becomes optional).
- **A bow that was used in a session stays in the list when you delete it:** the server refuses the delete, so the bow comes back at once and the upload banner says why ("deactivate it instead"). Before, it vanished from the list until you tapped "Give up" (#84).

## 0.12.0 (2026-10-29)

- **Equipment works without a connection:** bows and arrow sets are kept on the phone. You can add, change and delete them offline, and use new ones in a session straight away; they go up when there is a connection, before the sessions that use them. The list and the forms open from the copy on the phone, and the history shows the server's list when it can be reached. A change the server refuses (say, deleting a bow that was used in a session) shows in the upload banner, with "Give up" bringing the item back as the server has it. Needs a server with #98 (#84).

- **Sign-out asks first when something has not been uploaded:** the dialog says how many items are still on the phone; they stay there under your account and go up when you sign in again (#84).
- **Deleting your account also removes the photos and videos still waiting to upload,** and their files on the phone. Before, they stayed behind (#84).
- **Training log and upload queue are stored in files:** on Android the log and the queue of photos and videos were kept in the same SharedPreferences file as the settings, which was rewritten on every save. They now have one file each in the app's data folder. What is already on the phone moves over when the app first reads it; the old copy is removed only after the file was read back (#84).
- **Results are no longer lost when a session was deleted elsewhere:** if the server has deleted a session (for example on another phone) while ends or volume of it were still waiting to upload, the app keeps it and asks: "Keep as a new session" uploads it again under a new id, "Discard these results" drops it. Before, it was dropped without a word (#84).

## 0.11.0 (2026-10-29)

- **Training in the past:** a session can be started with a date and time (not in the future, at most 31 days back). A start in the past asks for a duration and creates a finished session, so a coach can add yesterday's training and attach photos and notes. "Reopen" is hidden for sessions that started more than 4 hours ago. The server refuses an end before the start (#89).
- **Move photos and videos between sessions:** in the photo view and the player ("Move to session", "Remove from session"), or several at once with "Select" in the grid. The archer's page can list what is "Not in a session", and a session screen offers the photos and videos taken around its time. The notes on a clip move with it. Media still waiting to upload can be moved too, also while it uploads. The delete confirmation of a session says that its photos and videos stay (#91).

## 0.10.1 (2026-10-29)

- **Server logging:** the `core`, `privacy` and `training` loggers now write INFO lines to the console (`docker compose logs django`). Before, the "Social sign-in refused" line with the Google `sub` (needed to attach a Google identity in the admin) was dropped.

## 0.10.0 (2026-10-28)

- **Sign in with Google (#78), Android, official server only:** a "Sign in with Google" button on the sign-in screen and "Register with Google" on the register screen (an invite or claim code is still needed to register). Google and email sign-in are separate accounts, nothing is matched by email or linked (ADR 0005). A Google account has no password: no password or email change in Settings, and export and deletion ask for a Google confirmation instead of the password. An admin can attach a Google identity to an account in the User admin. The button shows only with `VITE_GOOGLE_WEB_CLIENT_ID` set and the default server; the server needs `DJANGO_GOOGLE_CLIENT_IDS` (unset: endpoint answers 404). Needs the Google Cloud setup in `specs/design/accounts.md`.
- **Account transfer (admin):** `transfer_account <from> <to> --dry-run` and an action in the User admin move the data of one account to a new one (sessions, equipment, media, notes, evaluations, memberships, profile with picture). A test fails when a new model pointing at a user is not handled.
- Server: new endpoint `POST /api/auth/google/`; `has_password` and `sign_in_providers` on `/api/me/`; `sign_in` in the data export; migration `core/0008_socialidentity`; new dependencies `google-auth` and `requests`; new Capacitor plugin `@capgo/capacitor-social-login` (rebuild the APK). Texts about Google sign-in in the privacy pages need the legal review (#63).
- **Coach opens a session for an archer (#82):** on the archer's page a coach can open a session without results to attach photos, videos and notes. The archer finds it in the training list (shown as "Session") and chooses the type when adding results. If the archer starts their own session for the same training, the server merges the two (the archer's wins); media and notes move over and the phone follows. The session type may now be empty on the server, `GET /api/sessions/gone/` lists merged and deleted ids, and a `PUT` to a deleted session answers 410. One migration (`training/0002`). Old apps show a raw key for the empty type until updated.
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
