# Archery Coach

Training log, coaching notes and evaluations for archers and coaches. One Vue 3 + TypeScript app for web, Android and iOS (the phone apps are the same app wrapped with [Capacitor](https://capacitorjs.com)), backed by a self-hosted Django REST Framework server. See [docs/plan.md](docs/plan.md) for the full plan. The previous React Native (Expo) version is the git tag `expo-final`.

## Layout

```
src/       Vue app: views/ (screens), components/, composables/ (auth, log, server, ...), lib/ (logic, API client), router/
android/   Capacitor Android project
public/    static files of the web build
resources/ source icon and splash image for the phone apps
server/    Django project (DRF, SQLite), Dockerfile
deploy/    docker-compose.yml, Caddyfile, .env.example
shared/    files used by both server and app (target faces, scoring test cases)
worker/    pose detection worker (milestone 5)
docs/      plan, decisions
```

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
- First team and admin (signup is invite-only, so seed one): `docker compose exec django uv run --no-dev python manage.py seed --email you@example.com --password ... --name "Your Name"`. It prints an archer invite code; further invites come from `POST /api/teams/<id>/invites/` (team admins) or the Django admin
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
- A plain `http://` server (your PC's LAN IP) is blocked as mixed content. For a debug build against such a server, set `server: { androidScheme: 'http' }` in `capacitor.config.ts` (don't commit that) and add `http://localhost` to `DJANGO_CORS_ORIGINS`. Debug builds already allow plain http (`android/app/src/debug/AndroidManifest.xml`); release builds do not. A server on `https://` needs none of this.

Login tokens go to the Android Keystore, the local session log (anything not uploaded yet) to the app's preferences. In the browser both are in localStorage.

iOS is not set up: it needs `npx cap add ios` on a Mac (or a macOS CI runner), see docs/plan.md section 6b.

## Server address

The app's default server address is `VITE_SERVER_URL` in `.env`, read by Vite when it starts or builds. It can be changed per device on the app's Settings screen.

On a phone, `localhost` is the phone itself. Use your PC's LAN IP instead, e.g. `VITE_SERVER_URL=http://192.168.1.20:8080`, with phone and PC on the same Wi-Fi (and see the Android notes above).

## Run on a server

Same compose file, different `deploy/.env`:

```
SITE_ADDRESS=archery.example.de
HTTP_PORT=80
HTTPS_PORT=443
DJANGO_ALLOWED_HOSTS=archery.example.de
DJANGO_SECRET_KEY=<long random string>
```

Point the domain's DNS at the server, set `VITE_SERVER_URL=https://archery.example.de` before `npm run build-only`, then `docker compose up -d --build`. Caddy gets the HTTPS certificate automatically. Moving local data to the server means copying `deploy/data/django`.

## API types

The app's API types in `src/lib/api-types.ts` are generated from the Django schema. After changing a serializer or view, run `npm run types:api` and commit the result. After re-running `npm run build-only` while the stack is up, run `docker compose restart caddy` (the export replaces the `dist/` folder Caddy has mounted).

## Checks

```bash
npm run type-check
npm test                 # scoring rules and the local log, app side
cd server && uv run pytest
```
