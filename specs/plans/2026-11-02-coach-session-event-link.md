# A coach links their own session to a team training

Status: implemented and released in 0.20.0 (317dc32; decided 2026-11-02, see "Decisions"). Open items below: some tests, the optional hint, and the rollout steps for phones on 0.19.2.
Date: 2026-11-02

Design: [schedule-and-events.md](../design/schedule-and-events.md), [roles-and-access.md](../design/roles-and-access.md), ADR [0008-events-are-labels.md](../adrs/0008-events-are-labels.md).

Markers: [fact] read in the code (file:line), [inference] follows from the code, [check] verify while building.

## Recommendation

Take option D: a member of a team may link their **own** session, photo or note to any event of that team, whatever their role and `also_shoots`. `also_shoots` stays what it already is, a sharing setting ("the other coaches see my training"), and keeps deciding who counts as a participant in lists and rankings. A link adds no visibility (ADR 0008, roles-and-access.md:27), so D exposes nothing new. A and C would both widen who sees the coach's training, C even as a side effect of picking an event. B removes logging for people who have every right to it. On top of D: a distinct error when a team member is refused (only possible now for links on someone else's data), and a fallback in `log-sync.ts` that drops a refused link and uploads the session anyway, like `media-queue.ts` already does. The server change alone unblocks phones on 0.19.2: their "Try again" button resends the stuck entries.

## What the code does today

- [fact] `can_tag` for own rows returns `shoots_in(archer, team)` (server/core/access.py:84-88); `shoots_in` is archer, or coach/admin with `also_shoots` (access.py:79-81). `shoots_in` has no other caller.
- [fact] `resolve_event` raises `{"event": "No such event"}` both when the event does not exist and when `allowed(team)` is false (server/training/schedule.py:101-115), on purpose (docstring line 104). German: "Diesen Termin gibt es nicht" (server/locale/translate_de.py:43).
- [fact] `take_event` is used by sessions (server/training/serializers.py:146-152, 244), notes (server/notes/serializers.py:124, 132) and media (server/media/serializers.py:84). So a non-sharing coach also cannot link their own photo or own note today.
- [fact] `also_shoots` is a sharing switch: help text "Whether I share my own training with the other coaches" (server/core/serializers.py:116); it feeds `archers_visible_to` (access.py:41-50), hence `TrainingSession.objects.visible_to` (server/training/models.py:86-90), media and notes visibility, `note_teams` (access.py:61-70), team overview (server/training/views.py:309-313), ranking (views.py:481-484), the agenda's member list (src/views/AgendaView.vue:69-72) and the member list label (src/components/MembersSection.vue:28).
- [fact] What a session link shows to others: `EventArchersView` lists only owners in `archers_visible_to` and sessions in `visible_to` (server/training/schedule_views.py:229-241), so a non-sharing coach does not appear; `links_of` counts every linked session for the "cannot cancel / cannot delete" checks (schedule_views.py:146-151, 202-206, 222), which session-visibility.md:49 already accepts for private sessions. `EventSerializer` has no counts (server/training/schedule_serializers.py:57-63). No push on session links [fact: no `notify.` in server/training/].
- [fact] The agenda lists events of all teams of the user (`team_param` -> `teams_of`, schedule_views.py:42-52). The picker for own sessions passes no team filter (src/components/SessionEvent.vue:19; src/views/NewSessionView.vue:73 filters only when logging for another archer, via `/api/notes/teams/`).
- [fact] `log-sync.ts send` returns `failed` for every 4xx except 410/404 cases (src/lib/log-sync.ts:99-108); `drain` then skips the op until `retryFailed` (log-sync.ts:120-139, src/lib/log-model.ts:330-335). Ends of the refused session fail too: their PUT gets 404, the follow-up session PUT gets 400, not 410 (log-sync.ts:104). [inference] That is why the banner counts 5 entries for one session.
- [fact] The 0.19.2 release has the "Try again" and "Give up" buttons (`git show v0.19.2:src/components/SyncBanner.vue`, lines 26-27, 43-44). "Give up" removes the ops from the outbox but keeps the local session (log-model.ts:334-335).
- [fact] `media-queue.ts` already drops a refused event and resends (`withoutEvent`, src/lib/media-queue.ts:107-108, 147; src/composables/useMedia.ts:65). `note-sync.ts` has no fallback (src/lib/note-sync.ts:29-33).
- [fact] The share toggle is only on the Team tab overview (`ShareTraining` in src/components/TeamOverview.vue:36), not in Settings or the team page.

## Trade-offs

- **A (drop `also_shoots`)**: fixes the link, but every coach's sessions become visible to the other coaches and every coach shows in overview and ranking. That reverses a documented privacy promise (roles-and-access.md:13: off by default, only they can change it). Rejected.
- **B (no logging without `also_shoots`)**: strands existing sessions, makes the per-team flag gate a per-user feature, and leaves users without a team out. Logging is not gated by membership today and should not be. Rejected.
- **C (linking turns on `also_shoots`)**: one tap on an event silently shares all past and future sessions (with visibility `coaches`) of that coach with the team's coaches, and puts them in the ranking. A notice does not make that a deliberate choice; it is a privacy change hidden in a label action. Rejected.
- **D (own links for any member)**: smallest change, in line with ADR 0008. Cost: the event view for coaches does not show a non-sharing coach as a participant, and their session counts in "cannot cancel". [inference] Both are correct for "label, not visibility". A coach who wants to appear turns on sharing.
- **D + hint (recommended extra, cheap)**: when a coach or admin without `also_shoots` links their own session, the picker says one line, e.g. "Other coaches only see this if you share your training", with a link to the toggle. Optional, see open questions.

## Plan

### Server (hotfix 0.19.3, branch `hotfix/…` from `main` per specs/steering/releasing.md:37)

- [x] `server/core/access.py`: `can_tag` for `user == archer` returns `TeamMember.objects.filter(team=team, user=archer).exists()`. Remove `shoots_in` (no other caller) and fix the docstring.
- [x] `server/training/schedule.py` `resolve_event`: keep "No such event" when the event does not exist **or the caller is not a member of its team** (no probing of other teams). When the caller is a member and `allowed(team)` is false, raise `{"event": gettext("You cannot link this to that training")}` [check wording with Tim]. Pass the caller in (e.g. `member=lambda team: teams_of(user).filter(pk=team.pk).exists()` from `take_event`) instead of guessing inside. Update the docstring.
- [x] `server/locale`: extract, add the German text to `translate_de.py` (proposal: "Das kannst du nicht mit diesem Termin verknüpfen"), compile, commit `.mo` (specs/steering/i18n.md:26-33).
- [x] Tests, `server/training/tests/test_event_links.py`:
  - [x] a coach and an admin without `also_shoots` link their own session to an occurrence (201/200, row made);
  - [x] the same for their own clip and their own note;
  - [ ] after that, another coach still does not see that session (`/api/sessions/`, event `/archers/`, team overview, ranking);
  - [x] a non-member still gets "No such event" and no `TrainingEvent` is made (extends `test_only_members_of_the_team_link_to_its_events`);
  - [ ] a coach linking a non-sharing coach's clip or note gets the new message, a non-member coach gets "No such event".
- [x] `server/core/tests/test_also_shoots.py`: still green unchanged [check].
- [x] `cd server && uv run pytest`.
- [x] `npm run types:api`: no schema change expected (no field changes); run it to confirm the diff is empty, or only help text.
- [x] No migration.
- [x] Docs: schedule-and-events.md:20 and roles-and-access.md:27 (`can_tag`: own rows for every member of the team; `also_shoots` only for sharing and participant lists).

### App (0.19.3 together, or the next minor)

- [x] `src/lib/log-sync.ts` `send`: on 400 with an `event` key in the error for a session PUT that sent an event, return `{ kind: 'withoutEvent' }`; `drain` dispatches a new `dropEvent` action (`event: undefined`, so nothing is sent and the server keeps its value) and goes on, so the session and its ends upload. Mirror `media-queue.ts`.
- [x] `src/lib/log-model.ts`: `dropEvent` action, and a flag on the session so the app can say once "The link to <training> was removed: <server message>" [check where: SyncBanner or the session screen].
- [ ] Ends of a session whose PUT was refused for the event: covered by the above, since the session op is first in the outbox [check in a test].
- [x] `src/lib/note-sync.ts`: no automatic drop [inference: a note can take its team from the event, notes/serializers.py:132-135, so dropping it changes the note's team and who reads it]; the new server message is enough there.
- [ ] Picker: no change needed for own sessions after the server fix [inference: agenda = your teams, every member may link]. Check `SessionEvent.vue:19` for a session a coach opened for an archer: it passes no `teams`, unlike NewSessionView.vue:73 [check: pass the `note_teams` list there too].
- [ ] Optional hint for a non-sharing coach (see trade-offs), keys in `src/locales/en.ts` and `de.ts`.
- [ ] Tests: `src/lib/log-sync.test.ts` (refused event: session resent without `event`, ends follow, other 400s still `failed`), `log-model` reducer test for `dropEvent`.
- [x] `npm run type-check`, `npm test`.

### Rollout and recovery for phones on 0.19.2

- [ ] Deploy the server fix first. [inference] Phones on 0.19.2 then upload the stuck sessions when the person taps "Try again" in the banner (SyncBanner, present in v0.19.2). Nothing else is needed from the server; it cannot reach into the phone's outbox.
- [ ] Tell the affected coaches (it is a known, small group): "tap Try again, not Give up".
- [ ] Who already tapped "Give up": the sessions are on the phone but no longer queued. [inference] Any edit to the session (e.g. change the event and back) queues it again. [check] whether pull or any other path re-queues local sessions the server does not know; if not, consider a "upload again" action in the new app version.
- [ ] Photos of a coach that 0.19.2 already uploaded without their event (`withoutEvent`) keep no link; that is lost and can be relinked by hand.

## Decisions (Tim, 2026-11-02)

1. Option D.
2. Wording: en "You cannot link this to that training", de "Das kannst du nicht mit diesem Termin verknüpfen".
3. Hint for a coach who does not share: yes (`event.shareHint`, shown in `SessionEvent.vue`).
4. Share toggle also in Settings (Teams list, one per team the user coaches); removed from the Team tab after 0.20.0 (Settings only).
5. Everything on `develop` for the next release, no 0.19.3 hotfix. Until then phones on 0.19.2 stay stuck for coaches who do not share. If a server-only 0.19.3 is wanted later, specs/steering/releasing.md ("Server-only and app-only releases") covers it: the Play upload skips itself when the app did not change. The headings "hotfix 0.19.3" above are the earlier proposal.

Not done: the one-time notice "the link was removed" after the client drops a refused link (the drop is silent, as for media), and `SessionEvent.vue` for a session a coach opened for an archer still passes no team filter.

## Test on the phone (2026-11-02)

Dev app 0.20.0 (`de.fletchr.app.dev`, built against `http://localhost:8080` with `adb reverse`, so the test login was typed on a localhost server; rebuilt with the LAN default afterwards) against the Docker dev stack on :8080, also 0.20.0. Account `tim@example.com`, admin of Demo Club, `also_shoots` off. Event "Test training" moved to overlap the session, since the picker only offers events that overlap the session time (`SessionEvent.vue`).

- **Own session linked by a non-sharing admin: passed.** The session uploaded and the server row has the `event`. The hint (`event.shareHint`) showed under the link.
- **Refused link: passed, with a gap.** The event was moved to a team Tim is not in; then the session was reopened on the phone. The upload went through and the local link was dropped, no banner (the 400 itself was not seen in a log). The server kept the link it already had, because the drop sends no `event`, and an app restart brought the link back with the next pull. For a session the server never had linked (the stuck 0.19.2 case) the drop sticks. Decision: no fix for now. Clearing the server's link on a refusal would erase a link the server itself accepted earlier; if it shows up in practice, make the phone take the server's value after a refusal.
- **Not tested:** the stale failed upload of 0.19.2 that needs "Try again" (no phone in that state); linking another coach's clip or note and the new error text; the Settings toggle on this run (Tim saw it on his own phone).
- **Left in the dev DB:** the test session, the event "Test training" (Demo Club), and a password set for `tim@example.com`.

## Open questions (answered above)

1. D as proposed, or do you want the coach to appear as a participant in the event view when they link (that would be C, with the privacy cost above)?
2. Wording of the new error, en and de.
3. The one-line hint for a non-sharing coach in the picker: yes or no?
4. Should the share toggle also be on the team page or in Settings? Today it is only on the Team tab overview, which is why it was not found.
5. Hotfix 0.19.3 from `main` (server only needed; app fallback can wait for 0.20), or everything on `develop` for the next release?
