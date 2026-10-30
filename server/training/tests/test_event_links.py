"""Sessions, notes and media linked to a training event (#104): the label, the shared filter, history and participants."""

import uuid
from datetime import date, time

import pytest

from core.models import Role
from media.models import Media
from media.tests.test_media import photo, put, video
from notes.models import Note
from training.models import TrainingEvent, TrainingSession, TrainingSlot
from training.schedule import materialise, occurrence_id
from training.tests.test_overview import make_session
from training.tests.test_training import SESSION, new_id

DAY = date(2026, 10, 18)  # a Sunday


@pytest.fixture
def slot(club):
    return TrainingSlot.objects.create(
        id=uuid.uuid4(), team=club["a"], weekday=DAY.weekday(), start_time=time(9), end_time=time(11), time_zone="Europe/Berlin", valid_from=date(2026, 1, 1)
    )


@pytest.fixture
def event(slot):
    return materialise(slot, DAY)


def link(slot, day=DAY):
    return {"event": str(occurrence_id(slot.pk, day)), "event_slot": str(slot.pk), "event_date": day.isoformat()}


def write_note(client_for, club, who="coach", about="archer1", **extra):
    return client_for(club[who]).post("/api/notes/", {"archer": club[about].pk, "body": "Good", **extra}, format="json")


# --- sessions ------------------------------------------------------------------------------------


def test_a_session_links_to_an_occurrence_and_makes_it_a_row(client_for, club, slot):
    sid, me = new_id(), client_for(club["archer1"])
    res = me.put(f"/api/sessions/{sid}/", {**SESSION, **link(slot)}, format="json")
    assert res.status_code == 201, res.data
    assert res.data["event"] == str(occurrence_id(slot.pk, DAY)) and res.data["event_info"]["team_name"] == "Team A"
    assert me.put(f"/api/sessions/{sid}/", {**SESSION, **link(slot)}, format="json").status_code == 200
    assert TrainingEvent.objects.count() == 1
    assert me.put(f"/api/sessions/{sid}/", SESSION, format="json").data["event"] == str(occurrence_id(slot.pk, DAY))  # left out: kept
    assert me.put(f"/api/sessions/{sid}/", {**SESSION, "event": None}, format="json").data["event"] is None
    assert me.get(f"/api/sessions/?event={occurrence_id(slot.pk, DAY)}").data == []


def test_only_members_of_the_team_link_to_its_events(client_for, club, slot):
    res = client_for(club["b_archer"]).put(f"/api/sessions/{new_id()}/", {**SESSION, **link(slot)}, format="json")
    assert res.status_code == 400 and "event" in res.data
    nothing = client_for(club["archer1"]).put(f"/api/sessions/{new_id()}/", {**SESSION, "event": str(uuid.uuid4())}, format="json")
    assert nothing.status_code == 400
    assert not TrainingEvent.objects.exists()  # nothing is made for someone who may not use the team's events
    wrong_date = {**link(slot), "event_date": "2026-10-19"}
    assert client_for(club["archer1"]).put(f"/api/sessions/{new_id()}/", {**SESSION, **wrong_date}, format="json").status_code == 400


def test_the_coach_who_opened_a_session_may_set_the_event(client_for, club, event):
    sid = new_id()
    coach = client_for(club["coach"])
    assert coach.put(f"/api/sessions/{sid}/?owner={club['archer1'].pk}", {"started_at": "2026-10-18T07:00:00Z", "type": ""}, format="json").status_code == 201
    res = coach.put(f"/api/sessions/{sid}/", {"event": str(event.pk)}, format="json")
    assert res.status_code == 200 and res.data["event"] == str(event.pk)
    assert client_for(club["archer2"]).put(f"/api/sessions/{sid}/", {"event": None}, format="json").status_code == 404


def test_a_merge_keeps_the_event_of_the_loser(client_for, club, event):
    coach = client_for(club["coach"])
    sid = new_id()
    coach.put(f"/api/sessions/{sid}/?owner={club['archer1'].pk}", {"started_at": "2026-10-18T07:00:00Z", "type": ""}, format="json")
    coach.put(f"/api/sessions/{sid}/", {"event": str(event.pk)}, format="json")
    mine = new_id()
    res = client_for(club["archer1"]).put(f"/api/sessions/{mine}/", {**SESSION, "started_at": "2026-10-18T07:10:00Z"}, format="json")
    assert res.data["id"] == mine and res.data["event"] == str(event.pk)
    assert TrainingSession.objects.count() == 1


# --- notes ---------------------------------------------------------------------------------------


def test_a_note_takes_its_team_from_the_event(client_for, club, slot):
    res = write_note(client_for, club, **link(slot))
    assert res.status_code == 201, res.data
    assert res.data["team"] == club["a"].pk and res.data["event"] == str(occurrence_id(slot.pk, DAY)) and res.data["at"]
    assert write_note(client_for, club, team=club["b"].pk, **link(slot)).status_code == 400
    assert write_note(client_for, club, about="b_archer", **link(slot)).status_code == 400
    assert write_note(client_for, club, who="archer1", about="archer2", **link(slot)).status_code == 400


def test_the_time_of_a_note_defaults_to_now_and_can_be_earlier(client_for, club):
    assert write_note(client_for, club).data["at"] > "2026-10"
    res = write_note(client_for, club, at="2026-10-18T09:30:00Z")
    assert res.data["at"] == "2026-10-18T09:30:00Z"
    got = client_for(club["coach"]).get("/api/notes/?at_after=2026-10-18T09:00:00Z&at_before=2026-10-18T10:00:00Z")
    assert [n["id"] for n in got.data] == [res.data["id"]]


def test_the_author_changes_the_event_of_a_note(client_for, club, event):
    note = write_note(client_for, club).data
    coach = client_for(club["coach"])
    assert coach.patch(f"/api/notes/{note['id']}/", {"event": str(event.pk)}, format="json").data["event"] == str(event.pk)
    assert coach.patch(f"/api/notes/{note['id']}/", {"event": None}, format="json").data["event"] is None
    assert client_for(club["b_admin"]).patch(f"/api/notes/{note['id']}/", {"event": str(event.pk)}, format="json").status_code == 404


def test_a_note_on_a_clip_follows_the_clip_to_its_event(client_for, club, event):
    clip = put(client_for(club["coach"]), photo(event=str(event.pk)), owner=club["archer1"])
    assert clip.status_code == 201 and clip.data["event"] == str(event.pk)
    note = write_note(client_for, club, media=clip.data["id"])
    assert note.status_code == 201 and note.data["event"] == str(event.pk)


# --- media ---------------------------------------------------------------------------------------


def test_an_archer_tags_their_own_clip_a_stranger_cannot(client_for, club, event, slot):
    mine = put(client_for(club["archer1"]), video(**link(slot)))
    assert mine.status_code == 201 and mine.data["event"] == str(event.pk)
    assert put(client_for(club["b_archer"]), video(event=str(event.pk))).status_code == 400
    assert put(client_for(club["coach"]), video(event=str(event.pk)), owner=club["b_archer"]).status_code == 404


def test_changing_the_event_of_a_clip_moves_its_notes(client_for, club, event):
    clip = put(client_for(club["coach"]), photo(), owner=club["archer1"]).data["id"]
    note = write_note(client_for, club, media=clip).data
    res = put(client_for(club["coach"]), {"event": str(event.pk)}, media_id=clip)
    assert res.status_code == 200 and res.data["event"] == str(event.pk)
    assert Note.objects.get(pk=note["id"]).event == event
    put(client_for(club["coach"]), {"event": ""}, media_id=clip)
    assert Note.objects.get(pk=note["id"]).event is None


# --- reading: the session filter and the history -------------------------------------------------


def test_a_linked_session_lists_the_event_rows_of_its_archer_only(client_for, club, event):
    session = make_session(club["archer1"])
    session.event = event
    session.save()
    in_event = write_note(client_for, club, event=str(event.pk)).data["id"]
    other_archer = write_note(client_for, club, about="archer2", event=str(event.pk)).data["id"]
    own = write_note(client_for, club, session=str(session.pk)).data["id"]
    elsewhere = write_note(client_for, club).data["id"]
    clip = put(client_for(club["coach"]), photo(event=str(event.pk)), owner=club["archer1"]).data["id"]
    foreign = put(client_for(club["coach"]), photo(event=str(event.pk)), owner=club["archer2"]).data["id"]

    got = client_for(club["coach"]).get(f"/api/notes/?session={session.pk}")
    assert {n["id"] for n in got.data} == {in_event, own}
    assert other_archer not in {n["id"] for n in got.data} and elsewhere not in {n["id"] for n in got.data}
    media = client_for(club["coach"]).get(f"/api/media/?session={session.pk}")
    assert [m["id"] for m in media.data] == [clip] and foreign not in str(media.data)
    unattached = client_for(club["coach"]).get(f"/api/media/?without_session=true&not_in_event={event.pk}")
    assert unattached.data == []


def test_the_archer_sees_only_shared_notes_through_the_link(client_for, club, event):
    session = make_session(club["archer1"])
    session.event = event
    session.save()
    write_note(client_for, club, event=str(event.pk))
    shared = write_note(client_for, club, event=str(event.pk), visibility="shared").data["id"]
    got = client_for(club["archer1"]).get(f"/api/notes/?session={session.pk}")
    assert [n["id"] for n in got.data] == [shared]


def test_a_merged_session_id_works_in_the_filter(client_for, club, event):
    coach = client_for(club["coach"])
    sid = new_id()
    coach.put(f"/api/sessions/{sid}/?owner={club['archer1'].pk}", {"started_at": "2026-10-18T07:00:00Z", "type": ""}, format="json")
    note = write_note(client_for, club, session=sid).data["id"]
    client_for(club["archer1"]).put(f"/api/sessions/{new_id()}/", {**SESSION, "started_at": "2026-10-18T07:10:00Z"}, format="json")
    assert [n["id"] for n in coach.get(f"/api/notes/?session={sid}").data] == [note]


def test_events_mine_lists_events_without_a_linked_session(client_for, club, event):
    write_note(client_for, club, event=str(event.pk))  # coach only
    coach, me = client_for(club["coach"]), client_for(club["archer1"])
    res = coach.get(f"/api/events/mine/?archer={club['archer1'].pk}")
    assert [(r["event"]["id"], r["notes"], r["media"]) for r in res.data] == [(str(event.pk), 1, 0)]
    assert me.get(f"/api/events/mine/?archer={club['archer1'].pk}").data == []  # a coach-only note shows the archer nothing
    write_note(client_for, club, event=str(event.pk), visibility="shared")
    assert me.get(f"/api/events/mine/?archer={club['archer1'].pk}").data[0]["notes"] == 1
    assert me.get(f"/api/events/mine/?archer={club['archer2'].pk}").status_code == 404
    session = make_session(club["archer1"])
    session.event = event
    session.save()
    assert coach.get(f"/api/events/mine/?archer={club['archer1'].pk}").data == []


def test_the_coach_sees_who_took_part(client_for, club, event):
    session = make_session(club["archer1"])
    session.event = event
    session.save()
    write_note(client_for, club, about="archer2", event=str(event.pk))
    put(client_for(club["coach"]), photo(event=str(event.pk)), owner=club["archer2"])
    res = client_for(club["coach"]).get(f"/api/events/{event.pk}/archers/")
    assert [(r["name"], r["sessions"], r["notes"], r["media"]) for r in res.data] == [
        ("archer1", [str(session.pk)], 0, 0), ("archer2", [], 1, 1)
    ]
    assert client_for(club["archer1"]).get(f"/api/events/{event.pk}/archers/").status_code == 403


def test_taking_over_a_managed_profile_keeps_the_links(client_for, club, join, event):
    from core.claims import claim_profile
    from core.models import ClaimCode, User

    managed = User.objects.create_managed("Max")
    join(managed, club["a"], Role.ARCHER)
    sid = new_id()
    client_for(club["coach"]).put(f"/api/sessions/{sid}/?owner={managed.pk}", {**SESSION, "event": str(event.pk)}, format="json")
    note = write_note(client_for, club, about="archer1", event=str(event.pk)).data["id"]
    Note.objects.filter(pk=note).update(archer=managed)
    clip = put(client_for(club["coach"]), photo(event=str(event.pk)), owner=managed).data["id"]
    code = ClaimCode.objects.create(profile=managed, team=club["a"], created_by=club["coach"])
    newcomer = User.objects.create_user("new@x.test", "correct-horse-battery")
    claim_profile(code.code, newcomer)
    assert TrainingSession.objects.get(pk=sid).event == event and TrainingSession.objects.get(pk=sid).owner == newcomer
    assert Note.objects.get(pk=note).event == event and Media.objects.get(pk=clip).event == event


# --- manual attach (phase 5) ---------------------------------------------------------------------


def attach(client, event, archer, session):
    return client.post(f"/api/events/{event.pk}/attach/", {"archer": archer.pk, "session": str(session.pk)}, format="json")


def test_the_rows_of_an_event_are_put_into_a_session_and_keep_their_event(client_for, club, event):
    session = make_session(club["archer1"])
    note = write_note(client_for, club, event=str(event.pk)).data["id"]
    clip = put(client_for(club["coach"]), photo(event=str(event.pk)), owner=club["archer1"]).data["id"]
    on_clip = write_note(client_for, club, media=clip).data["id"]
    res = attach(client_for(club["coach"]), event, club["archer1"], session)
    assert res.status_code == 200 and res.data == {"notes": 2, "media": 1}  # the note on the clip has the clip's event too
    assert Note.objects.get(pk=note).session == session and Note.objects.get(pk=note).event == event
    assert Media.objects.get(pk=clip).session == session and Media.objects.get(pk=clip).event == event
    assert Note.objects.get(pk=on_clip).session == session  # the notes on a clip go with it
    assert attach(client_for(club["coach"]), event, club["archer1"], session).data == {"notes": 0, "media": 0}  # repeating changes nothing


def test_the_archer_attaches_what_they_may_read_a_stranger_cannot(client_for, club, event):
    session = make_session(club["archer1"])
    write_note(client_for, club, event=str(event.pk))  # coach only: the archer does not read it, so it stays
    shared = write_note(client_for, club, event=str(event.pk), visibility="shared").data["id"]
    res = attach(client_for(club["archer1"]), event, club["archer1"], session)
    assert res.data == {"notes": 1, "media": 0} and Note.objects.get(pk=shared).session == session
    assert attach(client_for(club["archer2"]), event, club["archer1"], session).status_code == 404
    assert attach(client_for(club["b_admin"]), event, club["archer1"], session).status_code == 404
    other = make_session(club["archer2"])
    assert attach(client_for(club["coach"]), event, club["archer1"], other).status_code == 404  # not a session of that archer
