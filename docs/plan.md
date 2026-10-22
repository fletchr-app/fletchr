# Archery Coach: product and tech plan

Draft v5, 2026-10-18 (v4 reviewed end to end after adding self-hosting, arrow plotting, video analysis, skeleton detection, evaluations and iOS without a Mac; v5 replaces Expo/React Native with Vue 3 and Capacitor, so the stack matches pyobs-web-client; the last Expo version is the git tag `expo-final`). Defaults are marked **(default)**; any of them can be changed before code is written.

## 1. Roles

| Role | Can do |
|---|---|
| **Archer** | Manage own equipment, log sessions and scores, upload photos/videos, see own stats, read coach notes and evaluations shared with them, fill in self-assessments |
| **Coach** | Everything an archer can see, for every archer in their team; write notes on archers, sessions and video frames; fill in evaluations; team-wide stats |
| **Admin** (default: the coach who creates the team) | Invite/remove archers and coaches |

Archers join a **team** by invite link or code. One archer can be in several teams (e.g. club + squad); a team can have several coaches. Anyone can download everything the server holds about them as one JSON file (password required; it includes the coach notes about them, the coach-only ones too), and can delete their data (sessions, equipment and the coach notes about them) or their whole account, after typing their password and a confirmation word. The account cannot be deleted while its owner is the only admin of a team others belong to: someone else has to become admin first (for now in the server's admin pages). A team the person is alone in is deleted with them, notes they wrote stay as "former coach", and invites they made that nobody used are cancelled. A coach or admin who also trains can turn on "also shoots" for their membership in a team (off by default, only they can change it): the other coaches of that team then see their sessions and equipment, read-only, like an archer's. The setting is per team. Coach notes and evaluations are either **shared** with the archer or **coach-only** (default for notes: coach-only, so nothing reaches the archer by accident; evaluations: shared). A coach sees all training data of the archers in their team; coach-only notes and evaluations are visible only to the coaches of the team they were written in.

## 2. Data model (Django models, SQLite)

- **profiles**: id, name, avatar, dominant hand/eye, date of birth (optional), preferred units
- **teams**, **team_members** (team_id, profile_id, role: archer | coach | admin)
- **bows**: owner, name, type (recurve, compound, barebow, longbow, traditional), riser, limbs, draw weight, draw length, brace height, tiller, plunger, sight, stabilisers, release/tab, notes, active flag
- **arrow_sets**: owner, shaft model, spine, length, point weight, nock, fletching, count
- **setups**: a bow + arrow set combination with a snapshot of its settings, so old sessions keep the setup as it was then
- **sessions**: archer, date/time, location, indoor/outdoor, weather/wind, type (scoring, volume, technique, competition), setup_id, physical/mental rating (1 to 5), goals, notes
- **target faces**: not a table. A built-in catalogue in `shared/target-faces.json` (see section 3a), read by the server and bundled in the app, so it works offline. Per face: slug, name, ring diameters and values, X ring, spot layout, compound flag. Sessions refer to a face by its slug
- **ends**: session_id, index, distance, target_face_id, arrows per end
- **shots**: end_id, x/y position (per spot: centre = 0,0, x to the right, y up, the outer edge of the outermost scoring ring = 1, so any face size works), spot index for multi-spot faces, score value and is_x derived from the position, is_miss, optional arrow number (to find a bad arrow in the set), manual-override flag
- **volume_entries**: session_id, distance, arrow count (for blank-bale/no-score training)
- **media**: owner, session_id (optional), kind (photo | video), file, thumbnail, caption; for videos also duration, frame rate, frame count, width/height and processing status (uploaded, converting, ready, failed)
- **notes**: author (coach), archer_id, optional session_id / media_id + frame number, optional drawing (lines/angles as JSON), body, visibility (shared | coach_only)
- **evaluation_templates**: team_id, name, version, criteria (grouped list: key, label, group, scale, description of what a 1 and a 5 look like). Editing a template creates a new version, so old evaluations stay comparable
- **evaluations**: archer_id, coach_id (or the archer for self-assessments), template version, date, kind (coach | self), overall comment, goals until next evaluation, visibility (shared | coach_only)
- **evaluation_scores**: evaluation_id, criterion key, rating, comment, optional link to a media item and frame
- **pose_analyses** (milestone 5): media_id, model and version, status, per-frame body points (compressed JSON), derived metrics per shot
- **comments**: threaded replies on notes and media, so archer and coach can talk about a clip

Access control is enforced on the server in Django REST Framework (permission classes and per-user querysets on every endpoint, covered by tests): archers see their own records, coaches see records of archers in their teams. The same rules protect photo and video files.

## 3. Screens

**Archer**
1. Home: this week's arrow count, last session, latest coach notes
2. Log session: quick setup (date, distance, face, setup), then end-by-end plotting on the target face (section 3a); number-pad entry as a fallback; volume-only mode for counting arrows
3. Session detail: ends, totals, plot of arrow positions, photos/videos, coach notes
4. Equipment: bows, arrow sets, setups (with history of changes)
5. Media gallery: per session or all, video analysis player with slow motion and frame-by-frame stepping (section 6)
6. Stats
7. Profile and teams
8. Evaluations: see the coach's evaluations over time, fill in an optional self-assessment on the same form

**Coach** (same app, extra tabs)
1. Team overview: list of archers with last session, weekly volume, trend arrow
2. Archer detail: everything the archer sees, plus a notes timeline
3. Notes: write a note on an archer, session or a specific video frame
4. Evaluations: fill in an evaluation form for an archer (tap a 1 to 5 rating per criterion, optional comment and video frame per criterion, goals at the end); edit the team's form templates
5. Team stats: compare archers, volume leaderboard
6. Team admin: invites, roles

## 3a. Arrow plotting (like MyTargets)

- The end screen shows the chosen target face full width. The archer touches where the arrow hit; while the finger is down, a **magnifier** above the finger shows the area enlarged so the exact spot can be placed, and the arrow is set on release.
- The score is **computed from the position** using the face's ring radii (an arrow touching a line is placed in the higher ring by the archer, as in WA rules). Tapping outside the face records a miss.
- Placed arrows can be dragged to correct them or deleted. The end's arrows are listed under the face with their scores, sorted high to low.
- Optional: assign the **arrow number** for each shot, to spot a single arrow that groups badly.
- Multi-spot faces (40 cm triple, vertical or triangular) show all spots; each arrow belongs to the spot it was placed on.
- After each end: end total, running total, and the end's group drawn on the face. The session view overlays all arrows with the group centre and spread.
- Built-in faces (`shared/target-faces.json`): WA 122, 80, 60 and 40 cm; WA 60 and 40 cm with the small compound 10; WA 80 cm 6-ring; WA 40 cm triple (vertical and triangle, recurve and compound); WA field 80, 60, 40 and 20 cm; and an unscored "blank" face. The WA Vegas 3-spot looks like the triangle triple, but its dimensions are not confirmed, so it is not listed separately. 3D scoring zones come later.
- Scoring rules (`server/targets/scoring.py` and `src/lib/scoring.ts`, both tested against the hand-calculated cases in `shared/scoring-vectors.json`): the score comes from the plotted position only, and a position exactly on a line scores the higher value. An arrow that touches a line is dragged by the archer into the higher ring; the app does not model arrow width. The X counts at or inside the X ring. Outside the outermost ring is a miss. The server recomputes every score on upload and stores its own value.

## 4. Statistics

- Arrow volume per day/week/month, by distance
- Average arrow score and score per end, trend over time, per distance and face
- 10/X rate, miss rate, score distribution histogram
- Group centre (mean point of impact) and spread, per end, session, distance and setup, shown on the face; plotted as a trend so a drifting sight mark or a growing group is visible
- Heatmap of all arrows on the target face, filterable by date range, distance and setup
- Per-arrow-number grouping, to find arrows that consistently land away from the group
- Sight correction hint: how far and in which direction the group centre sits from the middle
- Comparison by setup (e.g. before/after a limb change)
- Self-ratings vs. score correlation
- Coach: same charts per archer, plus team comparison and "who hasn't trained this week"

Stats are computed on the server (Django ORM aggregates or SQL views) so web and mobile show identical numbers.

## 4a. Evaluations

- **Default form** (editable per team): *Technique*: stance, posture, set-up, draw, anchor, aiming, release, follow-through; *Physical*: strength, endurance; *Mental*: shot routine, focus, competition nerves; *Equipment*: tuning and care. Each criterion is rated **1 to 5** with an optional comment.
- **Shared with the archer by default**, the coach can mark an evaluation coach-only. Archers can fill in a **self-assessment** on the same form, so coach and self ratings can be compared side by side.
- **Relation to notes**: notes are quick, free-text, any time; evaluations are structured check-ups (e.g. monthly or per season). An evaluation can link to video frames as evidence, and its goals show on the archer's home screen until the next one.
- **Tracking over time**: per archer, a chart per criterion and per group, a radar chart comparing the latest evaluation with an earlier one, and "biggest improvements / needs attention" lists. Team view: average per criterion across archers. Later, criteria can be shown next to related measured stats (e.g. "anchor" rating next to anchor consistency from skeleton detection, or "aiming" next to group size).

## 5. Stack (default)

- **App: Vue 3 + TypeScript + Vite + Vue Router, wrapped for phones with Capacitor**, one codebase, **mobile app only in the beginning (Android first, iOS later)**; the web build is the dev shell and the base of the phone apps, not a released product yet. The phone apps are the web app in a WebView plus Capacitor plugins (secure storage, preferences, share, app lifecycle). Same stack as pyobs-web-client, so one person can maintain both
- **UI**: Bootstrap 5 (light and dark follow the system), charts as plain inline SVG in Vue components, so they render the same on web and in the phone apps
- **Backend: Django + Django REST Framework + SQLite, self-hosted**. Chosen because the maintainer knows Python and Django, and the permission logic (coach/archer/team rules) is the riskiest part and is easiest to unit test as plain Python. Auth uses JWT (`djangorestframework-simplejwt`), the OpenAPI schema (`drf-spectacular`) generates the TypeScript types for the app, and the Django admin gives an admin UI. File storage, invites and sign-in providers are built by us. gunicorn runs behind Caddy. If the club grows far beyond a few hundred archers, switch the database to Postgres (a settings change). Considered and rejected: PocketBase (less to build, but its Go core and restricted JS hooks are not maintainable by us, and rules are filter strings), self-hosted Supabase (about ten containers, 4 GB+ RAM) and a Node API.
- **Offline**: session logging works without signal from the start (saved on the device, uploaded when online), since ranges often have poor reception; video uploads are queued the same way
- **Upload of sessions**: the app creates the ids (UUIDs) for sessions, ends, shots and volume entries, and uploads with idempotent `PUT`s: the session once, then each end with all its shots as soon as it is shot (so a coach sees results live, or as soon as the phone has signal again), so a retry never duplicates anything. The last write wins. The server recomputes every score from the position and returns its own values, which the app then shows. Coaches read sessions, they cannot change them. A coach's live view polls the session list (`/api/sessions/?updated_after=...`); push updates are not planned
- **Builds and hosting**: Android Studio or Gradle (`npx cap sync`, then build) for the Android app, a macOS machine or CI runner with Xcode for the iOS app; the web build is served by your own server (section 6a) for development and testing, a public web app/PWA is postponed
- **Languages**: English and German from the start (i18n)

## 6. Photos and videos

- Stored by Django on the server's disk (default), served only through views that check the same permissions (no public media URLs); can be switched to S3-compatible object storage by configuration when the disk fills up
- Videos are uploaded as recorded (default limit 60 seconds and 500 MB per clip, enough for several shots; uploads wait for Wi-Fi by default, changeable in settings) and converted on the server with ffmpeg into a **frame-steppable version**: 720p H.264, **original frame rate kept** (60/120/240 fps slow-motion recordings stay slow-motion), a keyframe every 10 frames so jumping to any frame is fast, plus a thumbnail. The original is deleted after conversion (default) to save disk space.
- Uploads run in the background and are retried automatically if the connection drops (a dropped upload restarts; true resume is not built in, which is acceptable at 60-second clips)

### Video analysis player (frame by frame, like VisualEyes)

- **Controls**: play/pause; speed 0.1x to 2x; **step one frame back/forward** with buttons (hold to repeat) and arrow keys on web; a **jog strip** you swipe for fine scrubbing; frame counter and time shown (e.g. `frame 143 / 1800`).
- **Loop A to B** around one shot, e.g. from set-up to follow-through.
- **Coach notes on a frame**: a note stores the frame number and time, and tapping it jumps to that exact frame. The second half of milestone 2 adds **drawing on the frame** (lines, angles, circles, e.g. for bow-arm or draw-elbow alignment), saved with the note.
- **Later**: two clips side by side with synced stepping (e.g. before/after a form change), and a ghost overlay.
- **How it works**: the server stores the clip's exact frame rate; a step seeks to the middle of the next frame, which avoids landing on the neighbouring frame. The player runs in the WebView on phones and in the browser on web, with the same code: it uses the video element's frame callback (`requestVideoFrameCallback`). To be checked on a real 120/240 fps clip in Android WebView and iOS WKWebView before the player is built; if it is not frame-exact there, a small native Capacitor plugin is the fallback.
- **Limits**: in web browsers, stepping is accurate on current Chrome, Edge, Safari and Firefox, but on old browsers or very slow laptops a step can occasionally show the neighbouring frame. Frame accuracy in the phone WebViews is to be verified (see above). Phone-recorded clips with variable frame rate are converted to constant frame rate on the server so frame numbers are reliable.
- **Prototype before milestone 2 (decides Capacitor vs. native Kotlin)**: a throwaway page in the Capacitor Android app, tested on a real 240 fps clip and on the weakest target phone. Checks: (1) frame stepping is exact, i.e. the frame counter matches known frames when stepping forward and back; (2) a line/angle drawing overlay stays in sync with the frame; (3) a large clip (e.g. 200 MB) uploads in the background with the app minimised and resumes after a connection drop; (4) memory stays stable on a long clip. If all pass, stay with Capacitor. If one fails, write a small native Kotlin Capacitor plugin for that piece (Media3/ExoPlayer for the player, WorkManager for uploads) before considering a full native app.
- **Size**: the frequent keyframes make files about 30 to 50% larger than normal; a 60-second 720p clip at 30 to 60 fps is roughly 40 to 80 MB. Slow-motion clips (120/240 fps) are 2 to 4 times larger per second, but are usually only a few seconds long.

### Automatic skeleton detection (advanced, milestone 5)

- **Approach (default)**: server-side, as a background job after video conversion, using **Google MediaPipe Pose Landmarker** (open, Apache 2.0 licence, 33 body points incl. hands, runs on a normal CPU). Running on the server gives every device the same results, including older phones and the web app, and no video leaves your own server. Alternative kept open: **RTMPose** (also Apache 2.0) if MediaPipe's accuracy around the bow arm turns out too weak. YOLO pose models are avoided because of their AGPL licence.
- **Runs on the cheap server**: a small Python worker container is added to the same Docker Compose setup (works locally too). Rough estimate, to be verified: 1 to 3 minutes of processing per 60-second clip on a 2-vCPU VPS; slow-motion clips are analysed at a reduced rate (e.g. 30 frames per second of real time) to keep this down.
- **Form metrics (from a side view)**:
  - bow arm: elbow angle, shoulder height and shoulder line
  - draw arm: draw-elbow alignment with the arrow line ("line"), elbow height
  - posture: torso lean, head tilt, stance
  - anchor: position of the draw hand relative to chin/face and how consistent it is from shot to shot
  - draw length: relative only (normalised by shoulder width), absolute cm needs a one-time calibration
  - stability: bow-hand and head movement during aiming
  - timing: set-up, draw, anchor, aiming time, release and follow-through, detected from the motion
- **In the player**: a toggle draws the skeleton on every frame while stepping (interpolated between analysed frames for slow-motion clips), with angle labels at the joints; a chart under the video shows a chosen metric over time, synced to the current frame; each shot gets a summary card that can be compared with earlier shots or with a "reference shot" the coach picks.
- **Limits**: one camera gives 2D only, so the camera must be placed square to the side (a "camera setup" guide in the app); the bow and riser can hide the bow hand; fingers and string are not tracked reliably; the metrics support the coach's eye and do not replace it.
- **Privacy and storage**: everything runs on your own server; pose data is small (well under 1 MB per clip) and is deleted together with the video. Analysis only runs on clips the archer or coach starts it for. For youth archers, parental consent for video recording is collected when they join the team (GDPR).

## 6a. Self-hosted deployment, backups and cost

- **Server (default)**: one small VPS in Germany, e.g. Hetzner (2 vCPU, 4 GB RAM, 40 GB disk). Any Linux box or a home server with Docker works too.
- **Setup**: Docker Compose with two services: Django (gunicorn; ffmpeg is added to the image in milestone 2 for video conversion) and Caddy. Caddy gets HTTPS certificates automatically and also serves the web app's static files. Milestone 5 adds a third service, the Python pose worker. Updating means pulling new images and restarting.
- **Domain**: e.g. `archery.example.de`, needed for HTTPS and for the mobile apps to reach the server.
- **Backups**: nightly, encrypted, off-site with restic to a storage box: first a consistent snapshot of the database, then the data folder. restic is incremental, so each video is copied only once (PocketBase's built-in backup zips all files every time, which would not scale with videos). 30 daily and 12 monthly copies kept. Data an archer has deleted stays in older backups until they rotate out (at most about a year); the privacy text for the stores has to say so. A restore is tested once during setup.
- **Monitoring**: a free uptime check (e.g. Uptime Kuma or a hosted pinger) and unattended security updates on the server.
- **Email**: sign-in and invite emails go through any SMTP account you already have.
- **Push notifications**: Firebase Cloud Messaging (Android) and Apple's push service (iOS) through `@capacitor/push-notifications`, and standard Web Push for the web app and iPhone home-screen app, all sent by a server hook, for "new coach note" and "new evaluation" alerts. Needs a Firebase project and an Apple key; not set up yet.

**Same setup locally and on the server.** The repository has one `deploy/docker-compose.yml`; only a `.env` file differs:

| | Local (your laptop/PC or home server) | Virtual server |
|---|---|---|
| Start | `docker compose up` | `docker compose up -d` |
| Address | `http://localhost:8080` (web app + API), admin at `/_/` | `https://archery.example.de` |
| HTTPS | Off (or Caddy's local certificate) | Automatic via Let's Encrypt |
| Data | `./data` folder next to the compose file | Same, on the server's disk |
| Backups | Optional (e.g. to an external disk) | Nightly off-site (above) |
| Phones | Debug build on the same Wi-Fi uses `http://<your PC's LAN IP>:8080` (needs `androidScheme: 'http'`, see the README); from outside, a tunnel (e.g. Tailscale or Cloudflare Tunnel) | Public domain |

Without Docker, the server also runs with `uv run python manage.py runserver` in `server/`. Moving from local to the server is copying the `data` folder (or restoring a backup) and starting the same compose file there. The app's server address is a setting, so one build can point at either.

Rough running cost:

| Item | Cost |
|---|---|
| VPS (2 vCPU, 4 GB, 40 GB) | about €5/month |
| Off-site backup storage (storage box or object storage) | about €3 to €4/month |
| Extra video storage if needed (100 GB volume or object storage) | about €5/month, only once the disk fills |
| Domain | about €1/month |
| Apple Developer account (needed for iOS App Store) | $99/year |
| Google Play developer account | $25 once |

So roughly **€10/month plus the store accounts**. Videos are the main growth driver: at 720p a 1-minute clip is about 40 to 80 MB, so the roughly 30 GB left on a 40 GB server after the system holds about 400 to 700 clips before extra storage is needed.

## 6b. iOS without an Apple device

- **Builds**: Capacitor's iOS project needs Xcode, so it has to be built on macOS. Without a Mac, use a macOS CI runner (e.g. GitHub Actions `macos` runners or Codemagic) that runs `npx cap sync ios`, builds and uploads to App Store Connect. Not set up yet; `ios/` does not exist until `npx cap add ios` is run on a Mac or in CI. Check the runners' current free quota and prices before relying on this.
- **Account**: an Apple Developer account ($99/year) is required for TestFlight and the App Store; enrolment works in the browser.
- **Testing**: an archer or coach with an iPhone tests through TestFlight and provides the App Store screenshots.
- **Sign-in**: an app in the App Store that offers Google sign-in must also offer Sign in with Apple, which is planned (section 5).
- **Fallback**: the web app is installable on iPhones from Safari ("Add to Home Screen") and works like an app, including camera uploads, frame stepping and push notifications (iOS 16.4+). iPhone users can use this from day one.
- **Order (default)**: Android only at first (mobile app only, no public web app), Android is testable on your own devices; the iOS store app follows once an iPhone tester is available. Since it is one codebase, iOS needs no extra development, only testing and the store listing.

## 7. Repository layout

```
archery-coach/
  src/            Vue app: views (screens), components, composables, lib (logic and API client), router
  android/        Capacitor Android project
  public/         static files for the web build
  resources/      source icon and splash image for the phone apps
  shared/         files used by server and app (target faces, scoring test cases)
  server/         Django project (models, migrations, DRF permissions, seed command, tests), Dockerfile
  worker/         pose detection worker (milestone 5)
  deploy/         docker-compose.yml, Caddyfile, backup scripts
  docs/           this plan, decisions
```

## 8. Milestones

1. **MVP**: auth, teams/invites, equipment, session logging by tapping arrows on the target face (works offline), session plot with group centre, coach notes, basic stats (volume, average score), account and data deletion (GDPR and store requirement), Docker setup for local and server. Ships as Android app only (the web build is for development; a public web app/PWA and iOS come later)
2. **Media and evaluations**: evaluation forms with trend charts, photo/video upload with server conversion, gallery, frame-by-frame player, notes on video frames, off-site backups; then drawing tools on frames
3. **Deeper stats**: heatmaps, group trend, per-arrow analysis, setup comparison, team dashboard
4. **Polish and release**: push notifications, Google Play release, iOS App Store release once an iPhone tester is available (section 6b)
5. **Advanced**: automatic skeleton detection and form metrics on videos
