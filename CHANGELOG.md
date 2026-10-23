# Changelog

What changed in each release. The version number and how a release is made: `docs/releasing.md`.

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
