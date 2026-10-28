# Roles, teams and access control

Status: implemented (video consent wording and flow wait for the legal review, #63)
Date: 2026-10-23
Updated: 2026-10-29

| Role | Can do |
|---|---|
| **Archer** | Manage own equipment, log sessions and scores, upload photos/videos, see own stats, read coach notes and evaluations shared with them, fill in self-assessments |
| **Coach** | Everything an archer can see, for every archer in their team; write notes on archers, sessions and video frames; fill in evaluations; team-wide stats |
| **Admin** (default: the person who creates the team) | Invite/remove archers and coaches, change roles, rename or delete the team |

Archers join a **team** by invite link or code. A coach can also keep a profile for an archer **without an account** (name, sessions the coach logs, notes); the archer takes it over later with a claim code, and the profile belongs to the team, not to the coach. One archer can be in several teams (e.g. club + squad); a team can have several coaches. Anyone can download everything the server holds about them as one JSON file (password required; it includes the coach notes about them, the coach-only ones too), and can delete their data (sessions, equipment and the coach notes about them) or their whole account, after typing their password and a confirmation word. The account cannot be deleted while its owner is the only admin of a team others belong to: someone else has to become admin first (in the app: Team, Manage team, Members). A team the person is alone in is deleted with them, notes they wrote stay as "former coach", and invites they made that nobody used are cancelled. A coach or admin who also trains can turn on "also shoots" for their membership in a team (off by default, only they can change it): the other coaches of that team then see their sessions and equipment, read-only, like an archer's. The setting is per team. Coach notes and evaluations are either **shared** with the archer or **coach-only** (default for notes: coach-only, so nothing reaches the archer by accident; evaluations: coach-only too, a coach shares one when they choose, so a poor rating does not reach an archer by accident). A coach sees all training data of the archers in their team; coach-only notes and evaluations are visible only to the coaches of the team they were written in.

Access control is enforced on the server in Django REST Framework (permission classes and per-user querysets on every endpoint, covered by tests): archers see their own records, coaches see records of archers in their teams. The same rules protect photo and video files.

**Opening a session for an archer.** A coach or admin can open a session for any archer they coach, with an empty type and without results, to attach photos, videos and notes (`PUT /api/sessions/<id>/?owner=`, the same reach as for media). They can later change its times and notes, never the type, ratings, equipment or results: those stay with the archer (or, for a profile without an account, with the coach as before). See [offline-sync.md](offline-sync.md).

**Video consent.** For an archer under 18 (birth date known) the server refuses new videos until a coach or admin has recorded the parents' consent on the archer's page (`video_consent_at`, `video_consent_by`); photos are not affected. An archer without a birth date counts as allowed.

**Team ranking.** The ranking of archers in a team is coach-only and off by default; an admin switches it on in the team settings (`show_ranking`), so young teams do not get a table that orders them.
