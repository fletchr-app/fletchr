# Fletchr server

Django REST Framework API for the Fletchr app (SQLite, gunicorn, Docker). The app is in the repository root, see the [main README](../README.md). Deploying it is described in [SELFHOSTING.md](../SELFHOSTING.md). Design docs and decisions are in [specs/](../specs/).

## Layout

```
config/       settings, root URLs, wsgi/asgi
core/         accounts, teams, invites, claims, data export, mail
equipment/ evaluations/ notes/ privacy/ push/ targets/ training/    Django apps
locale/       gettext catalogues for server messages (specs/steering/i18n.md)
data/         database and uploads when run directly (DJANGO_DATA_DIR)
```

`../shared/` holds files used by both server and app (target faces, scoring test cases).

## Run

```bash
cd server
uv run python manage.py migrate
uv run python manage.py runserver        # http://localhost:8000
```

Needs Python 3.14+ and [uv](https://docs.astral.sh/uv/). To use it from the Vite dev server, set `DJANGO_CORS_ORIGINS=http://localhost:5173`. The full stack with Caddy is started from `deploy/`, see the main README.

## Settings

All settings come from environment variables, read in `config/settings.py`. The ones you will meet most: `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_CORS_ORIGINS`, `DJANGO_BEHIND_PROXY`, `DJANGO_SITE_URL`, `DJANGO_DATA_DIR`, `DJANGO_MEDIA_QUOTA_MB`, `DJANGO_TEAM_CREATION_OPEN`, `DJANGO_MAX_ACCOUNTS`, `DJANGO_MAX_TEAM_MEMBERS`, `DJANGO_EMAIL_*` (without `DJANGO_EMAIL_HOST` mails are printed to the log), `DJANGO_FCM_CREDENTIALS`, `DJANGO_GOOGLE_CLIENT_IDS`. Production values go in `deploy/.env`, see `deploy/.env.example`.

## Tests

```bash
cd server && uv run pytest
```

## API schema and types

The OpenAPI schema comes from drf-spectacular. After changing a serializer or view, run `npm run types:api` in the repository root and commit the regenerated `src/lib/api-types.ts`.

## Translations

Server messages go through `gettext` (`locale/`), see [specs/steering/i18n.md](../specs/steering/i18n.md).

## Versions

`server/pyproject.toml`, `package.json` and the API schema version must match, see [specs/steering/releasing.md](../specs/steering/releasing.md).
