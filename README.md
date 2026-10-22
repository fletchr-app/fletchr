# Fletchr

Training log, coaching notes and evaluations for archers and coaches. One Vue 3 + TypeScript app (Ionic Vue), shipped as a mobile app first (Android now, iOS later) and wrapped with [Capacitor](https://capacitorjs.com). The web build is the dev shell and the base of the phone apps, not a product of its own for now. It talks to a self-hosted Django REST Framework server. See [docs/plan.md](docs/plan.md) for the full plan. The previous React Native (Expo) version is the git tag `expo-final`.

## Layout

```
src/       Vue app: views/ (screens), components/, composables/ (auth, log, teams, theme, ...), lib/ (logic, API client), router/
android/   Capacitor Android project
public/    static files of the web build
resources/ source icon and splash image for the phone apps
server/    Django project (DRF, SQLite), Dockerfile
deploy/    docker-compose.yml, Caddyfile, .env.example
shared/    files used by both server and app (target faces, scoring test cases)
worker/    pose detection worker (milestone 5)
docs/      plan, decisions
```

## What it does

- **Training log:** sessions with ends, arrows placed on the target face (works offline, uploaded when there is a connection), group plots, statistics.
- **Teams and roles:** archer, coach, admin. Anyone signed in can create a team (More, Create a team) and becomes its admin; people join with invite codes, anyone can leave, admins can delete the team. Signing up itself is invite-only.
- **Archers without an account:** a coach adds an archer by name, writes notes and logs sessions for them. The archer takes the profile over later with a claim code (confirmed in the app); sessions and notes move to their account.
- **Coach notes:** about an archer, a session or an end. Three levels: only me (the author alone), coach only (the coaches of the team), shared with the archer.
- **Your data:** download everything the server has about you, delete your data, delete your account (More, Your data).

## Run locally

Needs Node 22.18+ or 24.12+, Docker, and [uv](https://docs.astral.sh/uv/) for server development.

```bash
npm install
cp .env.example .env
cp deploy/.env.example deploy/.env
npm run build-only              # builds the web app into dist/, served by Caddy
cd deploy && docker compose up --build
```

- Web app and API: http://localhost:8080
- Django admin: http://localhost:8080/admin/ (create a superuser with `docker compose exec django uv run --no-dev python manage.py createsuperuser`)
- First account (signup is invite-only, so seed one): `docker compose exec django uv run --no-dev python manage.py seed --email you@example.com --password ... --name "Your Name"`. It creates a team with you as admin and prints an archer invite code. Further teams are created in the app (More, Create a team); invites come from the team screen (admins), `POST /api/teams/<id>/invites/` or the Django admin
- Health check: http://localhost:8080/api/health/
- Data (database, uploads) lives in `deploy/data/django/`

For app development with hot reload, keep the backend running and start Vite (or run the server directly with `cd server && uv run python manage.py runserver`; then add `DJANGO_CORS_ORIGINS=http://localhost:5173` for the Vite dev server):

```bash
npm run dev             # http://localhost:5173
```

## Android app

```bash
npm run build-only      # web build into dist/
npx cap sync android    # copies dist/ and the plugins into android/
npx cap open android    # Android Studio, or: cd android && ./gradlew assembleDebug
```

The APK is `android/app/build/outputs/apk/debug/app-debug.apk`. The version comes from `version` in `package.json`.

The app inside the phone is served from `https://localhost`, so:

- The server must allow that origin: add `https://localhost` to `DJANGO_CORS_ORIGINS` in `deploy/.env` (the web app on the same address needs nothing).
- A plain `http://` server (your PC's LAN IP) is blocked as mixed content. For a debug build against such a server, sync with `CAP_ANDROID_SCHEME=http npx cap sync android` (it sets `server: { androidScheme: 'http' }` for that sync only) and add `http://localhost` to `DJANGO_CORS_ORIGINS`. Debug builds already allow plain http (`android/app/src/debug/AndroidManifest.xml`); release builds do not. A server on `https://` needs none of this.

Login tokens go to the Android Keystore, the local session log (anything not uploaded yet) to the app's preferences. In the browser both are in localStorage.

iOS is not set up: it needs `npx cap add ios` on a Mac (or a macOS CI runner), see docs/plan.md section 6b.

## Server address

The app's default server address is `VITE_SERVER_URL` in `.env`, read by Vite when it starts or builds. It can be changed per device on the app's Settings screen.

On a phone, `localhost` is the phone itself. Use your PC's LAN IP instead, e.g. `VITE_SERVER_URL=http://192.168.1.20:8080`, with phone and PC on the same Wi-Fi (and see the Android notes above).

## Run on a server

On a server that already has nginx or Apache in front, only Django runs in Docker (`deploy/docker-compose.prod.yml`), next to a static site for the domain (`site/`). The step-by-step guide, with DNS, HTTPS, backups and invite links, is in [docs/deploy.md](docs/deploy.md).

The `docker-compose.yml` with Caddy is for local use, or for a server with nothing else on ports 80 and 443: set `SITE_ADDRESS` in `deploy/.env` to the domain and Caddy fetches the certificate itself.

## API types

The app's API types in `src/lib/api-types.ts` are generated from the Django schema. After changing a serializer or view, run `npm run types:api` and commit the result. After re-running `npm run build-only` while the stack is up, run `docker compose restart caddy` (the export replaces the `dist/` folder Caddy has mounted).

## Checks

```bash
npm run type-check
npm test                 # scoring rules and the local log, app side
cd server && uv run pytest
```

## License

[AGPL-3.0-or-later](LICENSE).
