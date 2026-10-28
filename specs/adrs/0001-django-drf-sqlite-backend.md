# Backend: Django + DRF + SQLite, self-hosted

status: accepted
date: 2026-10-23

## Context and Problem Statement

The app needs a server for accounts, teams, sessions, media and the coach/archer permission rules. The maintainer knows Python and Django, and the permission logic is the riskiest part of the system.

## Considered Options

- Django + Django REST Framework + SQLite
- PocketBase: less to build, but its Go core and restricted JS hooks are not maintainable by us, and access rules are filter strings.
- Self-hosted Supabase: about ten containers, 4 GB+ RAM.
- A Node API.

## Decision Outcome

Django + DRF + SQLite. Permission logic is plain Python and easiest to unit test. Auth is JWT (`djangorestframework-simplejwt`), the OpenAPI schema (`drf-spectacular`) generates the TypeScript types, the Django admin is the admin UI. File storage, invites and sign-in providers are built by us.

## Consequences

- If the club grows far beyond a few hundred archers, switch the database to Postgres (a settings change).
- No built-in backup (PocketBase's would zip all files each time); backups are our own, see [hosting-backups-cost.md](../design/hosting-backups-cost.md).

Details: [stack.md](../design/stack.md).
