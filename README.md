# Archery Coach

Training log, coaching notes and evaluations for archers and coaches. One Expo (React Native + TypeScript) app for web, Android and iOS, backed by a self-hosted Django REST Framework server. See [docs/plan.md](docs/plan.md) for the full plan.

## Layout

```
app/       screens (Expo Router)
src/       components, hooks, lib (server connection)
server/    Django project (DRF, SQLite), Dockerfile
deploy/    docker-compose.yml, Caddyfile, .env.example
worker/    pose detection worker (milestone 5)
docs/      plan, decisions
```

## Run locally

Needs Node 20+, Docker, and [uv](https://docs.astral.sh/uv/) for server development.

```bash
npm install
cp .env.example .env
cp deploy/.env.example deploy/.env
npx expo export -p web          # builds the web app into dist/, served by Caddy
cd deploy && docker compose up --build
```

- Web app and API: http://localhost:8080
- Django admin: http://localhost:8080/admin/ (create a superuser with `docker compose exec django uv run --no-dev python manage.py createsuperuser`)
- First team and admin (signup is invite-only, so seed one): `docker compose exec django uv run --no-dev python manage.py seed --email you@example.com --password ... --name "Your Name"`. It prints an archer invite code; further invites come from `POST /api/teams/<id>/invites/` (team admins) or the Django admin
- Health check: http://localhost:8080/api/health/
- Data (database, uploads) lives in `deploy/data/django/`

For app development with hot reload, keep the backend running and start Expo separately (or run the server directly with `cd server && uv run python manage.py runserver`; then add `DJANGO_CORS_ORIGINS=http://localhost:8081` for the Expo web dev server):

```bash
npx expo start          # press w for web, or scan the QR code with Expo Go
```

## Server address

The app's default server address is `EXPO_PUBLIC_SERVER_URL` in `.env`, read when Expo starts or builds. It can be changed per device on the app's Settings screen.

On a phone, `localhost` is the phone itself. Use your PC's LAN IP instead, e.g. `EXPO_PUBLIC_SERVER_URL=http://192.168.1.20:8080`, with phone and PC on the same Wi-Fi.

## Run on a server

Same compose file, different `deploy/.env`:

```
SITE_ADDRESS=archery.example.de
HTTP_PORT=80
HTTPS_PORT=443
DJANGO_ALLOWED_HOSTS=archery.example.de
DJANGO_SECRET_KEY=<long random string>
```

Point the domain's DNS at the server, set `EXPO_PUBLIC_SERVER_URL=https://archery.example.de` before `npx expo export -p web`, then `docker compose up -d --build`. Caddy gets the HTTPS certificate automatically. Moving local data to the server means copying `deploy/data/django`.

## Checks

```bash
npm run typecheck
npm run lint
cd server && uv run pytest
```
