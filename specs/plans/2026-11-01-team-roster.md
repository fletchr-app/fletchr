# Team roster for archers, visibility of name and picture (#80)

Status: implemented (server and app), not yet checked on a phone. Decisions made 2026-11-01 (Tim); the open questions took the recommended answers. The setting is in Settings (next to "New sessions are seen by"), not on the profile screen; no one-time hint for existing users yet (they are told in the changelog and the privacy pages)
Date: 2026-11-01

Follows [2026-10-28-profile-picture.md](2026-10-28-profile-picture.md) (#79, #85). Design: [roles-and-access.md](../design/roles-and-access.md).

Markers: [fact] read in the code, [inferred] follows from the code or the decisions, [check] verify while building.

## Decisions (Tim, not reopened)

1. `/members/` stops returning email addresses to archers. Coaches and admins keep them.
2. `Profile.visibility`, default `team`.
3. Three values only: `team` (Show me to my team), `coaches` (Show me to my coaches), `me` (Show me only to myself). "Show me to everybody" is left out for now: it needs a feed (#77) and a way to list people outside a team.
4. Roster `GET /api/teams/<id>/roster/`: `user_id`, `name`, `role`, `avatar_url`. No email. No managed profiles (archers without an account).
5. People hidden from the viewer are left out of the roster, and their picture is a 404 for that viewer.
6. Coaches keep seeing their archers' names in `/members/`.
7. The Team tab shows for everybody with an account. Coaches keep the current overview, archers get the roster.
8. The setting covers name and picture only, not training data (that stays with `training_visibility` and the session's `visibility`).

## Scope

- In: model field and migration, the shared visibility rule in `core.access`, the roster endpoint, `/members/` without emails for archers, picture access following the setting, the profile screen setting, the Team tab for everybody, locales, privacy pages, docs, tests.
- Out: "everybody", a feed (#77), listing people outside a team, the email fallback in author names (open question 5), per-team settings, a separate setting for name and picture.

## What is there (checked in the code)

- [fact] `core.access.members_visible_to`: coaches and admins see everyone in the team, archers see the staff and themselves. `MemberSerializer.get_email` returns the email to every viewer except for managed profiles.
- [fact] `core.access.can_see_avatar(viewer, person)`: self; a viewer who is coach or admin in a team of the person; a person who is coach or admin in a team of the viewer. Needs a picture and `avatar_allowed` (consent for under 18). `MemberSerializer.get_avatar_url` repeats the rule per team, with a comment about keeping the two together. `ArcherView` uses `can_see_avatar`.
- [fact] `AvatarFileView` (`/api/users/<id>/avatar/`): `AllowAny`, signed token (one viewer, one person, `MEDIA_LINK_SECONDS`) or the sign-in header. It checks `can_see_avatar` again on every request, and every refusal is the same 404.
- [fact] `core/audience.py`: `AUDIENCES = ("me", "coaches", "team", "everyone")`, `at_least(level)` (the levels from `level` up), `ACCEPTED = ("me", "coaches")` for training. `Profile.training_visibility` takes its choices from there.
- [fact] Profile settings pattern: `push_notes` etc. are a model field, a field in `ProfileSerializer.Meta.fields` with `help_text`, `COPY_FIELDS` in `core/transfer.py` (`test_transfer_guard.py` fails on a Profile field in neither list), and a key in the `profile` block of `privacy/export.py`. App side: `PATCH /api/me/` with `{profile: {...}}`. `ProfileView.vue` already uses `ChipGroup` and saves with one button.
- [fact] Archers already reach a team screen: Home "Your teams" links to `/team/:id` (`TeamManageView`), which loads `/members/` and shows `m.email` in `MembersSection.vue:28`. `TeamOverview` links there for coaches. `AgendaView` loads `/members/` and filters it to archers and `also_shoots`; for an archer that is only themselves. `sortMembers` in `src/lib/team-admin.ts` needs `email`.
- [fact] Tab bar (`App.vue`): `IonTabButton v-if="isCoach"` for Team. `useTeams` loads only when `status === 'signedIn'`, so local mode never shows it. `showTabs` is true for `signedIn` and `local`.
- [fact] `core/transfer.py` does not read `/members/`. Changing that endpoint does not affect transfer or export. The export's `account.email` is the person's own.
- [fact] `training/tests/test_visibility.py` `NO_TRAINING_DATA` lists every route that is not in the training matrix. A new route that is not listed fails `test_every_route_is_classified`.
- [fact] Names fall back to the email in archer-facing serializers: notes `author_name`, evaluations `author_name`, media `uploaded_by_name`, sessions `opened_by_name`. A coach with a blank name shows their email to archers. Out of scope (open question 5).
- [fact] `claims.claim_profile` moves the managed profile's data to the claimer and deletes the managed user. The claimer keeps their own profile, so their `visibility` stays as it was.
- [fact] Latest migration `core/0011_...push...`. `MIN_APP_VERSION = "0.1.0"`.
- [fact] Privacy pages: `site/datenschutz/index.html` line 26 (account: name ...) and line 30 (picture: archers do not see other archers' pictures); the same in `site/en/privacy/index.html` line 31. In-app `avatar.whoSees` says the same.
- [fact] There is no `docs/plan.md` (the issue names it). The note goes to `specs/design/roles-and-access.md`.

## The rule

The relation between a viewer V and a person P comes from their memberships, across all teams:

- `me`: V is P.
- `coaches`: V is coach or admin in a team P is a member of.
- `team`: V and P share a team (any roles).
- none: no shared team (another team only, or no team at all).

The widest relation wins (`me` > `coaches` > `team`).

**Picture and roster listing:** visible iff the relation is not none and `P.profile.visibility in at_least(relation)`. That gives:

| P's setting | self | teammate archer | coach/admin of P's team | other team | no team |
|---|---|---|---|---|---|
| `team` | yes | yes | yes | no | no |
| `coaches` | yes | no | yes | no | no |
| `me` | yes | no | no | no | no |

Exceptions:

- Managed profiles: only the `coaches` relation counts (no self, never in the roster). The default `team` must not open a managed archer's picture to their teammates.
- The picture also needs a file and `avatar_allowed` (under 18 without consent: hidden from everybody, as now).
- Names in `/members/` (not the roster): coaches and admins see every member's name, whatever the setting (decision 6). Archers keep seeing the names of staff (recommended, open question 1). Their picture follows the setting.
- [inferred] A coach P with `coaches` is seen by the other coaches and admins of their teams. "My coaches" means the people who hold a coach role in a team P is in.

## Checklist

### Server: model and migration
- [ ] `core/audience.py`: `PROFILE_ACCEPTED = ("me", "coaches", "team")`, `PROFILE_DEFAULT = "team"`, with a comment that `everyone` waits for #77.
- [ ] `core/models.py`: `Profile.visibility = CharField(max_length=10, choices=audience.CHOICES, default=audience.PROFILE_DEFAULT)` with a comment: who sees name and picture, not training data.
- [ ] Migration `core/0012_profile_visibility`: `AddField` with default `team`, which fills existing rows [inferred]. No data migration.
- [ ] `core/transfer.py`: `visibility` into `COPY_FIELDS`.
- [ ] `privacy/export.py`: `"visibility": profile.visibility` in the `profile` block. `FORMAT_VERSION` stays (a new key only).

### Server: access
- [ ] `core/access.py`: `relations_of(viewer) -> dict[int, str]`: one query over the memberships of the viewer's teams, giving the widest relation per user id. Plus `sees_person(relation, profile, is_managed) -> bool`, which holds the table and exceptions above.
- [ ] Rewrite `can_see_avatar(viewer, person)` on top of these (relation for one person, picture and consent checks, then `sees_person`). Both serializers use the same helpers, which ends the rule drift risk of #79.
- [ ] `members_visible_to` unchanged: coaches all, archers staff and self.

### Server: API
- [ ] `RosterMemberSerializer(user_id, name, role, avatar_url)` in `core/serializers.py`. `avatar_url` is empty when there is no picture or the viewer may not see it. `name` is never replaced by the email.
- [ ] `RosterView` (`GET /api/teams/<int:team_id>/roster/`): `get_my_team` (404 for non-members); `TeamMember` of the team, `user__is_managed=False`, `select_related("user__profile")`; filter in Python with `relations_of(request.user)` (one query) and `sees_person`; order by role (admin, coach, archer), then name. The viewer is always in it. Same for coaches (their full list stays `/members/`). Not paginated, like `/members/`. `extend_schema` with a docstring of the rule.
- [ ] `core/urls.py`: `teams/<int:team_id>/roster/`.
- [ ] `MemberSerializer.get_email`: `""` unless the viewer is coach or admin in `member.team` (role cached per request, as `get_avatar_url` does now) or it is the viewer themselves. Update the `help_text`: "Empty for an archer without an account, and for viewers who are archers".
- [ ] `MemberSerializer.get_avatar_url`: use `relations_of` (cached in the context) and `sees_person`.
- [ ] `ProfileSerializer`: `visibility` in `fields`, `help_text` "Who sees my name and picture: `team`, `coaches` or `me`. `everyone` is refused for now". `validate_visibility` refuses anything not in `PROFILE_ACCEPTED` with `gettext("Not available yet")` (already translated) [check that the DRF choice error and this one do not both fire].
- [ ] `ArcherView` keeps using `can_see_avatar` (coach-only route, it picks up the new rule).
- [ ] `training/tests/test_visibility.py`: add `api/teams/<int:team_id>/roster/` to `NO_TRAINING_DATA` (names and pictures, no training data).
- [ ] `npm run types:api`.

### App
- [ ] `App.vue`: Team tab `v-if="status === 'signedIn'"` instead of `isCoach`. Local mode stays without it (status `local`). Keep `isCoach` in `useTeams` for other uses [check where else it is used].
- [ ] `TeamListView.vue`: for each team, `TeamOverview` when coach or admin, else a new `TeamRoster` card. No teams: "You are not in a team yet" and a "Join a team" button (`/join-team`). Replace `team.notCoach`. Load on `onIonViewWillEnter`, no polling: every fetch signs new picture links, so polling would download the pictures again.
- [ ] `src/components/TeamRoster.vue`: team name, list of `AppAvatar` + name + role (+ "(you)"), "Schedule" button (`/team/:id/agenda`), "Team" button (`/team/:id`). Empty name: placeholder text. Error from the server shown with `ErrorText` (old server: 404).
- [ ] `TeamManageView.vue`: for an archer viewer, show the roster list (shared list component) instead of `MembersSection`. For coaches, nothing changes. Archers then no longer depend on `/members/` [inferred].
- [ ] `MembersSection.vue`: no `· email` when it is empty.
- [ ] `src/lib/team-admin.ts`: `sortMembers` with `email` optional (roster has none); a Vitest case for that.
- [ ] `ProfileView.vue`: `ChipGroup` "Who sees my name and picture" (team / coaches / only me) with a hint line, loaded from `/api/me/` and saved with the profile button. Hidden when `/api/me/` has no `visibility` (old server ignores the field and would save nothing quietly).
- [ ] `AvatarEditor` / `avatar.whoSees`: the text follows the chosen setting (or points to it).
- [ ] `AGENTS.md`: tab bar "Team" for everybody with an account.

### Texts (`src/locales/en.ts`, `de.ts`)
- [ ] `profile.visibility` (label), `profile.visibilityTeam` ("Show me to my team" / "Mich meinem Team zeigen"), `profile.visibilityCoaches` ("Show me to my coaches" / "Mich meinen Trainern zeigen"), `profile.visibilityMe` ("Show me only to myself" / "Mich nur mir selbst zeigen"), `profile.visibilityHint` (name and picture only, not training; coaches always see the names of their archers).
- [ ] `team.noTeam`, `team.joinTeam`, `team.roster` ("Team members" / "Teammitglieder"), `team.noName` placeholder; remove `team.notCoach`.
- [ ] `avatar.whoSees` and `avatar.whoSeesArcher` updated.
- [ ] Server: no new `gettext` strings expected [check `test_translations.py` passes].

### Privacy and docs
- [ ] `site/datenschutz/index.html` and `site/en/privacy/index.html`: in the account and picture items, say who sees the name and picture (the team by default; choose coaches or only yourself on the profile screen; coaches always see their archers' names; email addresses only for coaches and admins of the team). Then `deploy/site.sh` (Tim).
- [ ] `specs/design/roles-and-access.md`: the picture paragraph replaced by the rule above; one sentence that archers now see each other's name and picture within a team, on purpose (the note the issue puts in `docs/plan.md`); archers see no email addresses.
- [ ] `specs/design/data-model.md`: `visibility` on profiles; drop "A profile picture is planned, there is no field yet".
- [ ] `specs/design/screens.md`: Team tab for everybody, roster for archers.
- [ ] `specs/design/accounts.md`: transfer copies `visibility` (the profile list in "Expensive").
- [ ] `CHANGELOG.md`; `specs/plans/index.md`; close #80 with a note that "everybody" is deferred to #77.

## Tests

Server, new `server/core/tests/test_roster.py` (fixture `club` plus a user in no team and a managed profile in team A):

- [ ] Matrix, roster: P = `archer1` with each of the 3 settings x viewers `archer1` (self), `archer2` (teammate), `coach` and `admin` (coaches of P's team), `b_archer` / `b_admin` (other team: 404 for team A's roster), user in no team (404). Listed or not, per the table.
- [ ] Matrix, picture: the same 3 x viewers on `/api/users/<id>/avatar/` (sign-in header and signed token): 200 or 404, and `avatar_url` empty or set in the roster and in `/members/`.
- [ ] P = `coach` with each setting: picture for `archer1` and for `admin` per the table; name still in `/members/` for archers (open question 1).
- [ ] Coaches see the names of archers with `me` in `/members/`, with an empty `avatar_url`.
- [ ] Managed profile: never in the roster (coach viewer too); its picture is 404 for a teammate archer even with the default `team`; 200 for the coach.
- [ ] Roster responses have exactly the keys `user_id`, `name`, `role`, `avatar_url` (no email anywhere in the body).
- [ ] `/members/`: `email` is `""` for every row to an archer viewer, filled for coach and admin viewers, `""` for managed profiles.
- [ ] Under 18 without consent: hidden from everybody whatever the setting.
- [ ] Settings: a new user has `team`; `PATCH /api/me/` accepts the three values and refuses `everyone` and junk with 400.
- [ ] A link signed before a change to `me` stops working (file view checks again).
- [ ] Query count for the roster with 20 members (`django_assert_max_num_queries`).
- [ ] Update `test_avatar.py:155` and `:213` ("another archer gets 404"): now it depends on the setting.
- [ ] `test_teams.py`: archer still sees staff and self in `/members/`, now without emails.
- [ ] Transfer copies `visibility` (`test_transfer.py`); export has `profile.visibility` (`test_export.py`); `test_transfer_guard.py` passes.
- [ ] `test_visibility.py` route classification passes.

App (Vitest): `sortMembers` without email. Check on the phone: the Team tab as an archer, as a coach, as someone in no team; no Team tab in local mode; the setting saved and applied (second phone or account).

## Order

1. Model, migration, audience constants, transfer, export.
2. `access.relations_of`, `sees_person`, `can_see_avatar`; tests for the rule.
3. Roster view, `/members/` email and picture changes, serializer field; the test matrix; route classification.
4. `npm run types:api`; app tab, `TeamListView`, `TeamRoster`, `TeamManageView`, profile setting, locales.
5. Privacy pages, design docs, changelog.
6. `cd server && uv run pytest`, `npm run type-check`, `npm test`; phone check.

## Rollout and old apps

- Server first. Old apps keep working: `/members/` keeps its fields (email just empty for archers), so the archer's team screen shows "Coach · " without an address. Old apps show no Team tab for archers and no setting. Archers on an old app are still shown to their team with the default.
- New app on an old server: `/roster/` is 404, so the roster card shows the error (the version banner already warns about an older server); the visibility chips are hidden when `/api/me/` has no `visibility`.
- `MIN_APP_VERSION` stays (additive change). Minor version bump at release (`specs/steering/releasing.md`).
- Offline and local mode: the roster is server data read with `useRemote`, not cached; offline shows the usual error. Local mode has no Team tab and no change.

## Risks

- **Default for existing accounts.** The migration sets `team` for everybody, so on release day archers suddenly see each other's names and pictures without having chosen it. Data protection by default (Art. 25(2) GDPR) argues for the narrowest default; Tim chose `team` on purpose. Mitigation: changelog, privacy pages before the release, a one-time hint (open question 6). Minors: names of under-18 archers become visible to teammates (pictures stay behind consent); add to the legal review #63.
- **Email leaks elsewhere.** Archer-facing author names fall back to the email when a coach's name is blank (open question 5).
- **Rule in two places.** Now one helper used by the file view and both serializers; the matrix tests cover all three.
- **Cross-team relation.** A person in two teams with the viewer gets the widest relation. `/members/` and the roster compute the same thing through `relations_of`, so the picture shown in one team's list may come from the relation in another team. That is consistent with the file view.
- **Picture reloads.** Every fetch signs new links (decision 9 of #79); the roster is not polled.
- **Staff names.** If Tim decides that staff can hide their name (open question 1), `/members/` for archers must filter staff too, and coach names on notes and evaluations would still show them: that needs more work.

## Open questions (with recommended default)

1. Can a coach or admin hide their name from the archers of their team? Recommended: no. Staff names stay visible to team members (they are on notes, evaluations and "opened by" anyway). Their picture and roster listing follow the setting.
2. Does "only me" hide an archer's picture from their coaches? Recommended: yes, the setting applies strictly; the coach keeps the name.
3. Team tab for a signed-in user in no team? Recommended: yes, with a "Join a team" button.
4. Field name `visibility` (issue) or `profile_visibility`? Recommended: `visibility`, with help text.
5. Email fallback in archer-facing author names (notes, evaluations, media, sessions)? Recommended: a separate small issue (no fallback to the email for archer viewers, or refuse a blank name for real accounts).
6. A notice for existing users that the default is now `team`? Recommended: changelog plus a one-time hint on Home or the profile screen.
7. Roster member with a blank name? Recommended: listed with `name: ""`, the app shows a placeholder, never the email.
