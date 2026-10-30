# Session visibility: an archer decides whether coaches see a session

Status: planned
Date: 2026-10-30
Design: [session-visibility.md](../design/session-visibility.md). ADR: [0009](../adrs/0009-ordered-audience-scale.md).

## Scope

- `visibility` on sessions (`me | coaches` accepted now) on the shared ordered scale, the archer's default, one server filter used by every coach-facing route.
- Lands first and alone (own PR, server and app), before the upload of local data at sign-in ([2026-10-30-local-mode.md](2026-10-30-local-mode.md)), whose upload asks "share with your coaches?".
- Out of scope: `team`, `everyone`, `followers`; profile visibility (#80); feed (#77); several teams per archer; equipment visibility.

Markers: **[fact]** checked in the code, **[check]** verify before relying on it, **(assumed, confirm)** a default Tim has to confirm.

## What is there (checked)

- Access is per archer, not per session: `archers_visible_to(user)` in `server/core/access.py` **[fact]**. `visible_sessions` (`training/views.py`), `visible_media` (`media/access.py`), `visible_notes` (`notes/access.py`) and the stats views build on it.
- Stats, positions, arrow stats, overview and ranking query `Shot` / `VolumeEntry` by `end__session__owner_id` directly, not through `visible_sessions` **[fact]**. Each needs the session filter added by hand.
- `TeamProgressView` reads `/api/evaluations/` only **[fact]**.
- Export is own data only (`privacy/export.py` filters `owner=user`) **[fact]**.
- `core/migrations` ends at `0009_tombstone`, `training` at `0003_schedule`, `media` at `0003_updated_at` **[fact]**.

## Server

- [ ] `core/access.py`: `AUDIENCES = ("me", "coaches", "team", "everyone")`, `ACCEPTED = ("me", "coaches")`, `at_least(level)` (the levels from `level` up), `clamp(level)`. Docstring: the order lives here only.
- [ ] `core/access.py`: `can_view(viewer, owner, visibility)`: owner is viewer, or `visibility in at_least("coaches")` and owner in `archers_visible_to(viewer)`.
- [ ] `Profile.training_visibility` (`CharField`, choices from `AUDIENCES`, default `coaches`), migration `core/0010_training_visibility`. In `/api/me/` (read and `PATCH`), validated against `ACCEPTED`.
- [ ] `TrainingSession.visibility` (default `coaches`), migration `training/0004_visibility` (existing rows `coaches`). Index on `(owner, visibility)` **[check]** whether worth it on SQLite.
- [ ] `TrainingSessionQuerySet.visible_to(viewer)` in `training/models.py`, using `at_least`. `visible_sessions` in `training/views.py` becomes a call to it.
- [ ] `Media.visibility` nullable (null = follow session or default), migration `media/0004_visibility` (decided; needed by local mode). `Media.objects.visible_to(viewer)`: own; else coached owner and (session visible, or no session and `coalesce(media.visibility, owner.profile.training_visibility)` at least `coaches`). `visible_media` uses it.
- [ ] `visible_notes`: also require that `session` and `media`, when set, are visible to the viewer (author included, see the open point in the design doc).
- [ ] Serializers: `SessionWriteSerializer` and `SessionSerializer`/`SessionSummarySerializer` get `visibility`. Write: only the owner (a coach writing for a managed profile, or a coach who opened it, gets a 400 on the field); `team`/`everyone` 400 ("Not available yet"). Create without it: owner's `training_visibility`; created by a coach (`opened_by` other than owner): `coaches` (decided). Media serializer: `visibility` writable by the owner, same checks.
- [ ] Merge (`training/merge.py`): the winner keeps its own visibility; when an archer's session wins over a coach's, nothing to fill (visibility is never empty). Add a test that pins it.
- [ ] Routes, each through `visible_to` / `can_view`:
  - [ ] `SessionListView`, `SessionDetailView`, `get_session` (ends, volume)
  - [ ] `SessionTombstoneListView`: coaches only get tombstones whose `merged_into` they can see, or none for others' sessions. **[check]** what a coach's phone reads from it (`pull` asks `owner=` self; coach-opened sessions in `attachOnly` copies).
  - [ ] `StatsView`, `PositionsView`, `ArrowStatsView`: filter shots and volume by `end__session__in=visible_to(viewer)` when `owner` is not the viewer
  - [ ] `TeamOverviewView` (`last`, `shots`, `volume` subqueries), `TeamRankingView`
  - [ ] `EventArchersView`, `EventsMineView`, `EventAttachView` (`schedule_views.py`)
  - [ ] `MediaListView`, `MediaDetailView`, file and thumbnail views; a coach's `PUT` moving a clip into a private session is 404 on `session`
  - [ ] Notes list and `PUT /api/notes/<uid>/`: a coach cannot write on a hidden session, end or clip
  - [ ] Evaluation scores: `media` left out (null) in the read when the coach cannot see it **[check]** `evaluations/serializers.py` line ~116
- [ ] Export: `visibility` in sessions and media.
- [ ] Translations: new error strings in `server/locale/` (`specs/steering/i18n.md`).
- [ ] `npm run types:api`.

## App

- [ ] `log-model.ts`: `Session.visibility?: 'me' | 'coaches'`, left out until chosen; a `setVisibility` action queues the session `PUT`. Pull (`mergePulled`) takes the server value unless a session op is waiting.
- [ ] `log-sync.ts`: send `visibility` only when set.
- [ ] Session screen (`TrainingSessionView` or `SessionDetailsView`, the one with the session's own fields): toggle "Coaches can see this session". Hidden for a session logged for someone else (`owner` set) and for one a coach opened for the archer on this coach's phone (`attachOnly`).
- [ ] Lists (`SessionListItem`): lock icon for `me`.
- [ ] Settings: default for new sessions, read from and written to `/api/me/` (online; cached in `localStore` for the label).
- [ ] Media: clips follow their session; a clip without a session shows the default. No per-clip toggle in the UI now (the field is for the local-mode upload).
- [ ] i18n in `en.ts` and `de.ts`: `visibility.me`, `visibility.coaches`, `visibility.sessionToggle`, `visibility.sessionHint`, `settings.trainingVisibility`, `settings.trainingVisibilityHint`, `visibility.private` (list label).

## Tests

- [ ] pytest visibility matrix, one parametrised test per route in the table of the design doc: viewer (owner, coach of the archer's team, coach of another team, teammate archer, stranger) x session `me` / `coaches`. Owner sees both, coach of the team sees `coaches` only, everyone else nothing.
- [ ] Stats, positions, arrows, overview, ranking: a private session's shots do not change the coach's numbers, do change the owner's.
- [ ] Media: clip in private session hidden; clip without session follows default; `Media.visibility` overrides the default.
- [ ] Notes: shared note on a private session hidden from coaches; coach cannot `PUT` a note on it.
- [ ] Serializer: `team` and `everyone` refused; a coach cannot set visibility; create without it takes the default; coach-opened session starts `coaches`.
- [ ] Merge: archer's `me` session merges with coach's `coaches` session, result `me`.
- [ ] Migration: existing sessions `coaches`.
- [ ] Vitest: `log-model` keeps a local visibility against a pull while queued; `log-sync` leaves the field out when unset.
- [ ] `npm run type-check`, `npm test`, `cd server && uv run pytest`.

## Docs

- [ ] `specs/design/roles-and-access.md`: archers can keep a session from coaches; link to the design doc.
- [ ] `specs/design/data-model.md`: `visibility` on sessions and media, `training_visibility` on profiles.
- [ ] `specs/design/session-visibility.md`: status `implemented`.
- [ ] `CHANGELOG.md`.

## Risks

- **A route that forgets the filter leaks.** The stats and team views query shots by owner, not through the session queryset **[fact]**. The matrix test per route is the guard; a new route without a matrix row is the weak spot.
- **Coach's queued uploads**: a coach's phone with a clip or note queued for a session the archer just made private gets 404 and keeps it as failed. Acceptable; the banner shows the reason.
- **Coach-opened session merged into a private one**: the coach loses sight of their own clips and notes. Follows from "the archer's visibility wins".
- **Old apps** do not send `visibility` and get the default; they do not show the field. Self-hosted servers updated later than the app ignore the field (sessions stay visible to coaches) **[check]** that the app does not break on a server without it.
- **Media default changes** flip every clip without a session at once. Intended, but say so next to the setting.
