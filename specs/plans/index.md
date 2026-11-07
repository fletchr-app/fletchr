# Plans

Implementation plans, checklist-style. Files are named `YYYY-MM-DD-topic.md`. Newest at the bottom.

- [2026-10-23-milestones.md](2026-10-23-milestones.md): order of work and milestones 4 to 6. **active**
- [2026-10-23-milestone-1-mvp.md](2026-10-23-milestone-1-mvp.md): MVP. **implemented, closed**
- [2026-10-23-milestone-2-media-and-evaluations.md](2026-10-23-milestone-2-media-and-evaluations.md): media and evaluations. **mostly implemented**, trends and goals on Home (#46), backups setup (#49) and a second-phone video check (#71) open
- [2026-10-23-milestone-3-deeper-stats.md](2026-10-23-milestone-3-deeper-stats.md): deeper stats. **partly implemented**
- [2026-10-28-profile-picture.md](2026-10-28-profile-picture.md): profile picture, visible to coaches (#79). **implemented**
- [2026-10-28-coach-opens-session.md](2026-10-28-coach-opens-session.md): coach opens a session for an archer, empty type, two-way sync, merge (#82). **implemented**
- [2026-10-28-photo-notes-drawing.md](2026-10-28-photo-notes-drawing.md): notes and drawing on photos (#81). **implemented, not yet checked on a phone**
- [2026-10-28-google-sign-in.md](2026-10-28-google-sign-in.md): sign in with Google, admin account transfer (#78, avatar part #79). **implemented, Google Cloud set up, phone test open**
- [2026-10-29-backdated-sessions.md](2026-10-29-backdated-sessions.md): a training in the past, start time and duration when starting a session (#89). **implemented** (editing the start of an existing session is left out)
- [2026-10-29-media-to-session.md](2026-10-29-media-to-session.md): move photos and videos into a session, list those without one (#91). **implemented**
- [2026-10-29-offline-sync.md](2026-10-29-offline-sync.md): work offline, sync both ways (#84), local-store foundation first for #93. **phases 0 to 5 implemented** (no shared `useSync`, equipment pull is the full list, evaluations offline not built)
- [2026-10-30-trainer-session.md](2026-10-30-trainer-session.md): team schedule and training events, a shared label for sessions, notes and media (#104). **phases 1 to 6 implemented** (phase 6 unreleased)
- [2026-10-30-session-visibility.md](2026-10-30-session-visibility.md): `visibility` on sessions, archer's default, visibility matrix for every coach route. **implemented, not yet checked on a phone** (lands before the upload of local data at sign-in)
- [2026-10-30-local-mode.md](2026-10-30-local-mode.md): use the app without an account or server (#93): local state, statistics on the device, JSON export and import, first launch and sign-out. **first version (#113), Step 0 (#115), upload on sign-in (Step 2) and sign-out wording (Step 3) implemented, not yet checked on a phone**; note edit (Step 1) implemented
- [2026-10-31-custom-server-login.md](2026-10-31-custom-server-login.md): sign-in, register and password reset on a self-hosted server from the sign-in screen, `/settings/server` removed. **implemented, not yet checked on a phone**
- [2026-10-31-calendar-view.md](2026-10-31-calendar-view.md): calendar view for team trainings and events, month view on the agenda, no iCal feed (#106). **phases 1 to 3 implemented, phase 4 dropped**
- [2026-10-31-device-calendar.md](2026-10-31-device-calendar.md): trainings and events in an app-owned calendar on the phone, Android, `@ebarooni/capacitor-calendar` (#107). **phases 1 to 3 implemented**, spike on a phone done (one entry per training, see the plan)
- [2026-11-01-push-notifications.md](2026-11-01-push-notifications.md): push notifications through FCM for new shared notes, shared evaluations and used codes (#26, #27). **implemented, Firebase set up**; phone test open
- [2026-11-01-app-links-and-reset-link.md](2026-11-01-app-links-and-reset-link.md): App Links for `/reset/<code>` next to `/join/<code>`, the link in the reset mail, links in share texts (#56, #19). **implemented, fingerprints, site and `DJANGO_SITE_URL` done**; not yet checked with the Play build
- [2026-11-01-team-roster.md](2026-11-01-team-roster.md): team roster for archers, `Profile.visibility` for name and picture (team, coaches, only me), no emails to archers in `/members/`, Team tab for everybody (#80). **implemented, not yet checked on a phone**
- [2026-11-02-coach-session-event-link.md](2026-11-02-coach-session-event-link.md): a coach or admin links their own session, photo or note to a team training without `also_shoots`; distinct error for a refused link; upload fallback that drops a refused link. **implemented, released in 0.20.0**
- [2026-11-05-start-page-profile.md](2026-11-05-start-page-profile.md): Home becomes the archer profile for every user, own data from the device first, section components with a data source switch (#143). **implemented**
- [2026-11-06-move-drawing-points.md](2026-11-06-move-drawing-points.md): Move tool for the points of a drawing, loupe while drawing. **implemented, not yet checked on a phone**
- [2026-11-06-merge-photo-viewer.md](2026-11-06-merge-photo-viewer.md): the grid opens photos in the player, the swipe viewer goes, simple swipe in the player (#159). **plan, decisions open**
- [2026-11-07-photo-as-evidence.md](2026-11-07-photo-as-evidence.md): a photo can be the evidence for an evaluation criterion, no frame; server refuses a frame on a photo (#161). **implemented, not yet checked on a phone**
