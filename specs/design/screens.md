# Screens

Status: implemented except where marked planned; see [the milestone plans](../plans/index.md)
Date: 2026-10-23
Updated: 2026-10-29

**Archer**
1. Home: this week's arrow count, last session, latest coach notes
2. Log session: quick setup (start date and time, default now; for a start in the past also a duration, which makes a finished session; distance, face, setup), then end-by-end plotting on the target face ([arrow-plotting.md](arrow-plotting.md)); number-pad entry as a fallback; volume-only mode for counting arrows
3. Session detail: ends, totals, plot of arrow positions, photos/videos, coach notes
4. Equipment: bows, arrow sets, setups (with history of changes)
5. Media gallery: per session or all, video analysis player with slow motion and frame-by-frame stepping ([media-and-video-player.md](media-and-video-player.md))
6. Stats
7. Profile and teams
8. Evaluations: see the coach's evaluations (a list and a detail page; trends over time are planned, #46), fill in an optional self-assessment on the same form

**Coach** (same app, extra tabs)
1. Team overview: list of archers with last session, weekly volume, trend arrow
2. Archer detail: everything the archer sees, plus a notes timeline
3. Notes: write a note on an archer, session or a specific video frame or photo
4. Evaluations: fill in an evaluation form for an archer (tap a 1 to 5 rating per criterion, optional comment and video frame per criterion, goals at the end); edit the team's form templates
5. Team stats: archers with no arrows in the last 7 days; a ranking (coach only, off by default, see [roles-and-access.md](roles-and-access.md))
6. Team admin: invites, roles
7. Open a session for an archer (archer page): environment and place only, then photos, videos and notes can be attached. The archer finds it in their training list, shown as "Session", and chooses the type when adding results

Media page (#91): "Select" turns the grid into a selection (check marks, "Move to session", and in a session also "Remove from session"); on an archer's page the chips "All" and "Not in a session" limit the list. Session screens show a hint when the archer has photos or videos near the session's time that are in no session.

Team schedule (#104): "Schedule" on the team page and in the team settings opens the agenda of the last four and next eight weeks, by day. A coach taps a training to cancel it, move it, add a note or a photo for an archer, or open it; "+" adds a competition, camp or extra training. The weekly trainings (slots) are edited in the team settings. New sessions, notes and photos show the chips of the training that takes place then, with "None" (one match is preselected). A session shows "Training: <name>, <date>" with Change and None. The training list and the archer's page show a row for a training that has notes or photos of the archer but no session of theirs; it opens the event view, where a coach sees who took part and the notes and photos. See [schedule-and-events.md](schedule-and-events.md).

Sign-in: `/sign-in` always uses the build's default server (and Google); `/register` and `/reset-password` do too, and each resets a custom address when entered. "Connect to custom server" (`/sign-in/custom`, with `/sign-in/custom/register` and `/sign-in/custom/reset-password`) takes a server address, checks it with a health request, and keeps it as the server for those screens. No Google there. The server cannot be changed while signed in; Settings shows the host. Plan: `specs/plans/2026-10-31-custom-server-login.md`.

Without an account (#93): the tab bar has Home, Training, Statistics and Settings (no Team). Home and Training show the sessions on the phone. Statistics and the heatmap are computed on the phone. Notes (also with drawings on photos) and photos and videos stay on the phone; a photo or video opens in its own screen (`/local-media/:id`). Settings has the equipment, "Backup: export and import" (`/settings/data`), "Sign in or register", theme, language and units; no teams, account rows, server address or video upload setting. The app opens in this mode on first launch; signing out or deleting the account returns to it on Home. The sign-in screen (reached from Settings) has a short text that says signing in or registering offers to upload the data (or keep it on the phone), and a link back to the app. With data on the phone, signing in or registering opens the upload confirmation (`ClaimSheet`: counts, share question without preselection, Upload / Keep on this phone only / Cancel). Sign-out always asks, and says the screens will be empty until the next sign-in. The sync banner shows "n videos wait for Wi-Fi".
