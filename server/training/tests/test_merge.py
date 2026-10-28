"""Two sessions for the same training become one (#82), whichever arrives first."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from media.models import Media
from notes.models import Note
from training.merge import OPEN_SESSION_CAP
from training.models import End, SessionTombstone, TrainingSession
from training.tests.test_training import end_body, new_id, shot

T0 = datetime(2026, 10, 26, 9, 0, tzinfo=timezone.utc)
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 500


def iso(dt):
    return dt.isoformat()


def coach_session(client, archer, start=T0, ended=None, sid=None, **extra):
    sid = sid or new_id()
    body = {"started_at": iso(start), "type": "", **({"ended_at": iso(ended)} if ended else {}), **extra}
    res = client.put(f"/api/sessions/{sid}/?owner={archer.pk}", body, format="json")
    assert res.status_code in (200, 201), res.data
    return sid, res


def archer_session(client, start=T0, ended=None, typ="scoring", sid=None, results=False, **extra):
    sid = sid or new_id()
    body = {"started_at": iso(start), "type": typ, **({"ended_at": iso(ended)} if ended else {}), **extra}
    res = client.put(f"/api/sessions/{sid}/", body, format="json")
    assert res.status_code in (200, 201), res.data
    if results:
        assert client.put(f"/api/sessions/{sid}/ends/{new_id()}/", end_body([shot()]), format="json").status_code == 201
    return sid, res


def add_media(owner, session_id, uploader):
    return Media.objects.create(
        id=uuid.uuid4(), owner=owner, uploaded_by=uploader, session_id=session_id, kind="photo", taken_at=T0, width=1, height=1, size=1,
        file=SimpleUploadedFile("a.jpg", JPEG), thumbnail=SimpleUploadedFile("t.jpg", JPEG),
    )


def add_note(club, session_id):
    return Note.objects.create(team=club["a"], author=club["coach"], archer=club["archer1"], session_id=session_id, body="x")


def alive():
    return set(TrainingSession.objects.values_list("pk", flat=True))


@pytest.mark.parametrize("coach_first", [True, False])
def test_empty_coach_session_merges_into_the_archers_whichever_arrives_first(client_for, club, coach_first):
    coach, archer = client_for(club["coach"]), client_for(club["archer1"])
    coach_id, archer_id = new_id(), new_id()
    steps = [
        lambda: coach_session(coach, club["archer1"], sid=coach_id, location="Hall"),
        lambda: archer_session(archer, T0 + timedelta(minutes=2), sid=archer_id, results=True),
    ]
    for step in (steps if coach_first else reversed(steps)):
        step()
    assert {str(p) for p in alive()} == {archer_id}
    tomb = SessionTombstone.objects.get()
    assert str(tomb.pk) == coach_id and str(tomb.merged_into_id) == archer_id and tomb.owner == club["archer1"]
    assert TrainingSession.objects.get().location == "Hall", "empty fields are filled from the loser"


def test_media_and_notes_move_to_the_winner(client_for, club):
    coach, archer = client_for(club["coach"]), client_for(club["archer1"])
    coach_id, _ = coach_session(coach, club["archer1"])
    photo, note = add_media(club["archer1"], coach_id, club["coach"]), add_note(club, coach_id)
    archer_id, _ = archer_session(archer, T0 + timedelta(minutes=1), results=True)
    photo.refresh_from_db()
    note.refresh_from_db()
    assert str(photo.session_id) == str(note.session_id) == archer_id


def test_the_archers_values_win_and_empty_ones_are_filled(client_for, club):
    coach, archer = client_for(club["coach"]), client_for(club["archer1"])
    coach_session(coach, club["archer1"], location="Coach hall", goals="Anchor")
    archer_session(archer, T0 + timedelta(minutes=1), location="Archer hall", results=True)
    session = TrainingSession.objects.get()
    assert (session.location, session.goals) == ("Archer hall", "Anchor")


@pytest.mark.parametrize("coach_first", [True, False])
def test_both_empty_the_archers_wins(client_for, club, coach_first):
    coach, archer = client_for(club["coach"]), client_for(club["archer1"])
    coach_id, archer_id = new_id(), new_id()
    steps = [lambda: coach_session(coach, club["archer1"], sid=coach_id), lambda: archer_session(archer, T0 + timedelta(minutes=1), sid=archer_id)]
    for step in (steps if coach_first else reversed(steps)):
        step()
    assert {str(p) for p in alive()} == {archer_id}


@pytest.mark.parametrize("first", [0, 1])
def test_two_empty_coach_sessions_the_earlier_start_wins(client_for, club, join, make_user, first):
    other = make_user("coach2@a.test")
    join(other, club["a"], "coach")
    early, late = new_id(), new_id()
    steps = [
        lambda: coach_session(client_for(club["coach"]), club["archer1"], T0, sid=early),
        lambda: coach_session(client_for(other), club["archer1"], T0 + timedelta(minutes=5), sid=late),
    ]
    for i in ([0, 1] if first == 0 else [1, 0]):
        steps[i]()
    assert {str(p) for p in alive()} == {early}


def test_a_coach_session_with_results_beats_an_empty_one_of_another_coach(client_for, club, join, make_user):
    other = make_user("coach2@a.test")
    join(other, club["a"], "coach")
    keeper, _ = coach_session(client_for(club["coach"]), club["archer1"], T0 + timedelta(minutes=10))
    # only the archer adds results: they give it a type and an end
    client_for(club["archer1"]).put(f"/api/sessions/{keeper}/", {"started_at": iso(T0 + timedelta(minutes=10)), "type": "scoring"}, format="json")
    client_for(club["archer1"]).put(f"/api/sessions/{keeper}/ends/{new_id()}/", end_body([shot()]), format="json")
    assert TrainingSession.objects.count() == 1
    coach_session(client_for(other), club["archer1"], T0 + timedelta(minutes=5))
    assert {str(p) for p in alive()} == {keeper}


def test_two_sessions_the_archer_opened_never_merge(client_for, club):
    archer = client_for(club["archer1"])
    archer_session(archer, T0)
    archer_session(archer, T0 + timedelta(minutes=1))
    assert TrainingSession.objects.count() == 2


def test_two_sessions_with_results_never_merge(client_for, club):
    archer = client_for(club["archer1"])
    archer_session(archer, T0, results=True)
    TrainingSession.objects.update(opened_by=club["coach"])
    archer_session(archer, T0 + timedelta(minutes=1), results=True)
    assert TrainingSession.objects.count() == 2


def test_no_merge_without_an_overlap(client_for, club):
    coach, archer = client_for(club["coach"]), client_for(club["archer1"])
    coach_session(coach, club["archer1"], T0, ended=T0 + timedelta(hours=1))
    archer_session(archer, T0 + timedelta(hours=1, minutes=1), results=True)
    assert TrainingSession.objects.count() == 2


def test_an_open_ended_session_is_capped(client_for, club):
    coach, archer = client_for(club["coach"]), client_for(club["archer1"])
    coach_session(coach, club["archer1"], T0)
    archer_session(archer, T0 + OPEN_SESSION_CAP + timedelta(minutes=1), results=True)
    assert TrainingSession.objects.count() == 2


def test_exactly_at_the_cap_still_overlaps(client_for, club):
    coach, archer = client_for(club["coach"]), client_for(club["archer1"])
    coach_session(coach, club["archer1"], T0)
    archer_session(archer, T0 + OPEN_SESSION_CAP, results=True)
    assert TrainingSession.objects.count() == 1


def test_an_empty_session_that_overlaps_several_stays_apart(client_for, club):
    coach, archer = client_for(club["coach"]), client_for(club["archer1"])
    archer_session(archer, T0, ended=T0 + timedelta(hours=1), results=True)
    archer_session(archer, T0 + timedelta(hours=2), ended=T0 + timedelta(hours=3), results=True)
    coach_session(coach, club["archer1"], T0 + timedelta(minutes=30))  # open-ended: reaches both
    assert TrainingSession.objects.count() == 3


def test_changing_the_times_can_trigger_a_merge(client_for, club):
    coach, archer = client_for(club["coach"]), client_for(club["archer1"])
    coach_id, _ = coach_session(coach, club["archer1"], T0, ended=T0 + timedelta(minutes=30))
    archer_session(archer, T0 + timedelta(hours=1), results=True)
    assert TrainingSession.objects.count() == 2
    res = coach.put(f"/api/sessions/{coach_id}/", {"started_at": iso(T0), "ended_at": iso(T0 + timedelta(hours=2))}, format="json")
    assert res.status_code == 200 and res.data["id"] != coach_id
    assert TrainingSession.objects.count() == 1


# --- aliases ----------------------------------------------------------------------------------------


def test_writes_to_a_merged_id_land_in_the_winner(client_for, club):
    coach, archer = client_for(club["coach"]), client_for(club["archer1"])
    coach_id, _ = coach_session(coach, club["archer1"], T0)
    archer_id, _ = archer_session(archer, T0 + timedelta(minutes=1), results=True)
    # the archer's phone still holds the coach's id and uploads a volume entry under it
    res = archer.put(f"/api/sessions/{coach_id}/volume/{new_id()}/", {"distance_m": "18.0", "arrow_count": 6}, format="json")
    assert res.status_code == 201 and TrainingSession.objects.get(pk=archer_id).volume_entries.count() == 1
    res = archer.get(f"/api/sessions/{coach_id}/")
    assert res.data["id"] == archer_id


def test_a_session_put_under_the_old_id_returns_the_winner(client_for, club):
    coach, archer = client_for(club["coach"]), client_for(club["archer1"])
    coach_id, _ = coach_session(coach, club["archer1"], T0)
    archer_id, _ = archer_session(archer, T0 + timedelta(minutes=1), results=True)
    res = archer.put(f"/api/sessions/{coach_id}/", {"started_at": iso(T0), "type": "scoring", "location": "Hall"}, format="json")
    assert res.status_code == 200 and res.data["id"] == archer_id and res.data["location"] == "Hall"


def test_the_coach_repeating_his_put_after_the_merge_only_fills_empty_fields(client_for, club):
    coach, archer = client_for(club["coach"]), client_for(club["archer1"])
    coach_id, _ = coach_session(coach, club["archer1"], T0)
    archer_id, _ = archer_session(archer, T0 + timedelta(minutes=1), results=True, location="Archer hall")
    res = coach.put(f"/api/sessions/{coach_id}/", {"started_at": iso(T0), "type": "", "location": "Coach hall", "goals": "Anchor"}, format="json")
    assert res.status_code == 200 and res.data["id"] == archer_id
    session = TrainingSession.objects.get()
    assert (session.location, session.goals, session.type) == ("Archer hall", "Anchor", "scoring")


def test_delete_of_a_merged_id_keeps_the_winner(client_for, club):
    coach, archer = client_for(club["coach"]), client_for(club["archer1"])
    coach_id, _ = coach_session(coach, club["archer1"], T0)
    archer_id, _ = archer_session(archer, T0 + timedelta(minutes=1), results=True)
    assert archer.delete(f"/api/sessions/{coach_id}/").status_code == 204
    assert {str(p) for p in alive()} == {archer_id}


def test_a_chain_of_merges_is_one_hop(client_for, club, join, make_user):
    other = make_user("coach2@a.test")
    join(other, club["a"], "coach")
    archer = client_for(club["archer1"])
    a, _ = coach_session(client_for(club["coach"]), club["archer1"], T0)
    b, _ = coach_session(client_for(other), club["archer1"], T0 + timedelta(minutes=1))  # b loses to a
    c, _ = archer_session(archer, T0 + timedelta(minutes=2), results=True)  # a loses to c
    assert {str(p) for p in alive()} == {c}
    assert {str(t.merged_into_id) for t in SessionTombstone.objects.all()} == {c}
    assert archer.put(f"/api/sessions/{a}/ends/{new_id()}/", end_body([shot()], index=5), format="json").status_code == 201
    assert End.objects.filter(session_id=c).count() == 2


def test_media_and_notes_accept_an_old_session_id(client_for, club):
    coach, archer = client_for(club["coach"]), client_for(club["archer1"])
    coach_id, _ = coach_session(coach, club["archer1"], T0)
    archer_id, _ = archer_session(archer, T0 + timedelta(minutes=1), results=True)
    res = coach.put(
        f"/api/media/{uuid.uuid4()}/?owner={club['archer1'].pk}",
        {"kind": "photo", "file": SimpleUploadedFile("a.jpg", JPEG), "thumbnail": SimpleUploadedFile("t.jpg", JPEG), "taken_at": iso(T0), "width": 10, "height": 10, "session": coach_id},
        format="multipart",
    )
    assert res.status_code == 201 and str(res.data["session"]) == archer_id


def test_gone_lists_merged_and_deleted_ids(client_for, club):
    coach, archer = client_for(club["coach"]), client_for(club["archer1"])
    coach_id, _ = coach_session(coach, club["archer1"], T0)
    archer_id, _ = archer_session(archer, T0 + timedelta(minutes=1), results=True)
    other, _ = archer_session(archer, T0 + timedelta(days=2))
    assert archer.delete(f"/api/sessions/{other}/").status_code == 204
    rows = {r["id"]: r["merged_into"] for r in archer.get("/api/sessions/gone/").data}
    assert {k: v and str(v) for k, v in rows.items()} == {coach_id: archer_id, other: None}
    assert coach.get(f"/api/sessions/gone/?owner={club['archer1'].pk}").status_code == 200
    stamp = next(r["at"] for r in archer.get("/api/sessions/gone/").data if r["id"] == other)
    assert [r["id"] for r in archer.get("/api/sessions/gone/", {"updated_after": stamp}).data] == []
    assert client_for(club["archer2"]).get("/api/sessions/gone/").data == []


def test_a_put_to_a_deleted_id_is_gone(client_for, club):
    archer = client_for(club["archer1"])
    sid, _ = archer_session(archer)
    archer.delete(f"/api/sessions/{sid}/")
    assert archer.put(f"/api/sessions/{sid}/", {"started_at": iso(T0), "type": "scoring"}, format="json").status_code == 410
    assert not TrainingSession.objects.exists()
