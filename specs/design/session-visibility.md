# Who sees a training session

Status: planned
Date: 2026-10-30
Decision: [ADR 0009](../adrs/0009-ordered-audience-scale.md). Plan: [2026-10-30-session-visibility.md](../plans/2026-10-30-session-visibility.md).

Today a coach sees every session of every archer they coach (`archers_visible_to` in `server/core/access.py`); the archer cannot keep one to themselves. This adds a per-session choice, and the scale later used by profile visibility (#80) and a feed (#77).

## The audience scale

- One ordered scale of strings: `me` < `coaches` < `team` < `everyone`. A wider level includes every narrower one. The order is defined once, in `server/core/access.py` (`AUDIENCES`), and nowhere else; code compares levels through it (`at_least(level)`), never by spelling out lists.
- Only `me` and `coaches` are accepted now. The serializers refuse `team` and `everyone` with a 400 until they are built. The server clamps, the app does not decide.
- `followers` (#77) may later slot in between `team` and `everyone`; not added now (assumed, confirm).
- Each subject has its own field and its own default, all on this scale: training (this doc), profile name and picture (#80, later), feed (#77, later). Setting one never changes another.

## What carries a visibility

- **Session**: `TrainingSession.visibility`. Changeable by the owner at any time, in both directions. Ends, shots and volume entries follow their session.
- **Archer's default**: `Profile.training_visibility`, used when a session is created without a visibility. Default for new accounts: `coaches` (assumed, confirm). It must never default above `coaches`. Set in Settings.
- **Existing sessions**: migrate to `coaches`, which is what coaches see today.
- **Photos and videos**: a clip in a session follows the session. A clip in no session follows the archer's default, unless it has its own value (`Media.visibility`, null by default; needed so "keep private" at the upload of local data covers clips without a session, see [local-mode.md](local-mode.md)). Decided.
- **Notes**: keep their own `private | coach_only | shared` field; that is a different question (who reads a note), not unified with this scale. A note on a session, end or clip is shown to a coach only when the coach can also see that session or clip. Its own visibility still applies on top.
- **A session a coach opens** for an archer (#82) starts at `coaches`, since the coach must see what they opened; the archer can narrow it afterwards (decided).
- **Profiles without an account**: their sessions stay `coaches` and cannot be changed by the coach; the archer can change them after claiming the profile.
- **Merge** (ADR 0004): the archer's session wins, and with it the archer's visibility. A coach's clips and notes moved into a private session are then hidden from that coach too.

## One filter for every coach-facing read

- `TrainingSession.objects.visible_to(viewer)`: the viewer's own sessions, plus sessions of the archers the viewer coaches (`archers_visible_to`) whose visibility is at least `coaches`. `Media.objects.visible_to(viewer)` and `visible_notes` build on it. `can_view(viewer, obj)` is the single-object form.
- Every route that shows training data of someone else goes through it. Rows not visible answer 404, as for archers one does not coach today.

| Route | What changes |
|---|---|
| `GET /api/sessions/`, `?updated_after=` (coach live view) | list filtered; a session made private drops out at the next poll |
| `GET/PUT /api/sessions/<id>/`, ends, volume | 404 for a coach when private (writes are owner-only already, except managed profiles) |
| `GET /api/sessions/gone/` | coaches get no tombstones of sessions they cannot see (see plan) |
| `GET /api/stats/`, `/stats/positions/`, `/stats/arrows/` (with `owner`) | shots, volume and ratings of private sessions left out for a coach |
| `GET /api/teams/<id>/overview/` | last session and arrows of 7 days from visible sessions only |
| `GET /api/teams/<id>/ranking/` | same |
| `GET /api/events/<id>/archers/`, `/events/mine/`, `POST /events/<id>/attach/` | private sessions not listed or used |
| `GET /api/media/`, `/media/<id>/`, file and thumbnail | follow session or default |
| `GET /api/notes/`, `PUT /api/notes/<uid>/` | notes on hidden sessions or clips hidden; a coach cannot write a note on them |
| `PUT /api/media/<id>/` by a coach into a private session | 404 on `session` |
| Evaluation scores that link a clip | the link is left out when the coach cannot see the clip |
| Data export (`/api/me/export/`) | own data only, so nothing is hidden; it gains the `visibility` fields |

Team progress (`TeamProgressView`) reads evaluations only, not sessions **[fact]**, so it is unaffected apart from the clip link above. Equipment and setups are not covered: they are not part of a session's audience (a later subject if asked for).

## App

- Session screens: a toggle "Coaches can see this session" (on = `coaches`, off = `me`), and a lock mark on private sessions in the lists.
- Settings: the default for new sessions (account only).
- A session logged offline leaves `visibility` out until the archer changes it, so the server applies the default; the pull takes the server's value. Same pattern as the other optional fields in `log-model.ts`.
- Coaches see nothing new: private sessions just are not there.

## Open points (not decided)

- **Several teams per archer**: an archer may want a session seen by the coaches of one team and not another. The audience may later become a level plus an optional list of teams. No column may block that: keep `visibility` a plain level and add a team list beside it later, do not encode teams into the level.
- **Minors and `everyone`**: whether an archer under 18 may choose `everyone` (or `team`), and who decides (parents' consent like video).
- **`followers`**: whether and where it slots in (#77).
- Decided: a coach's own note on a session that later becomes private is hidden from the coach too. It comes back if the archer shares again.
