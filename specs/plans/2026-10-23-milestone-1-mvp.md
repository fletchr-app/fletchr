# Milestone 1: MVP

Status: implemented, closed
Date: 2026-10-23

| Area | State |
|---|---|
| Accounts | built: sign in, register with an invite code, change name, email and password, forgot password (code by email), export and delete data or account |
| Teams | built: create, leave, delete, invites (code and link), roles archer/coach/admin, role changes and admin handover in the app, "also shoots" per team |
| Archers without an account | built: a coach keeps a profile, logs sessions and writes notes for it; the archer takes it over with a claim code |
| Equipment | built: bows and arrow sets with revision history, a setup (bow + arrow set) chosen per session |
| Logging | built: sessions of type scoring, competition, volume and technique, indoor/outdoor, location; ends with arrows placed on the face with a zoom; number-pad entry; offline first, uploaded later; the server recomputes scores |
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
- **Backups:** `deploy/backup.sh` makes the database copy and, with `deploy/.env.backup`, an encrypted restic backup of copies and uploads off the server (30 daily, 12 monthly kept); tested against a local repository, including a restore. Setup and restore are in [SELFHOSTING.md](../../SELFHOSTING.md), section 4. The privacy texts say up to about 12 months in backups, as the retention does.
- **Website:** `noindex` is on until the privacy text has had a legal review.
