"""A coach opens a session for an archer (#82): create, empty type, who may write what."""

import uuid

import pytest

from core.models import Role, Team, TeamMember, User
from training.models import End, Shot, TrainingSession, VolumeEntry
from training.tests.test_training import SESSION, end_body, new_id, shot

OPEN = {"started_at": "2026-10-18T09:00:00Z", "type": ""}


def open_for(client, archer, body=OPEN, sid=None):
    sid = sid or new_id()
    return sid, client.put(f"/api/sessions/{sid}/?owner={archer.pk}", body, format="json")


def test_a_coach_opens_a_session_for_an_archer(client_for, club):
    sid, res = open_for(client_for(club["coach"]), club["archer1"])
    assert res.status_code == 201
    assert res.data["owner"] == club["archer1"].pk and res.data["opened_by"] == club["coach"].pk
    assert res.data["opened_by_name"] == "coach" and res.data["type"] == ""
    assert TrainingSession.objects.get(pk=sid).opened_by == club["coach"]


def test_an_admin_opens_one_too(client_for, club):
    assert open_for(client_for(club["admin"]), club["archer2"])[1].status_code == 201


def test_an_archer_of_another_team_or_a_peer_is_not_reachable(client_for, club):
    assert open_for(client_for(club["coach"]), club["b_archer"])[1].status_code == 404
    assert open_for(client_for(club["archer1"]), club["archer2"])[1].status_code == 404
    assert open_for(client_for(club["b_admin"]), club["archer1"])[1].status_code == 404
    assert not TrainingSession.objects.exists()


def test_a_coach_can_open_for_a_managed_profile(client_for, club, make_user, join):
    profile = make_user("profile@a.test")
    profile.is_managed = True
    profile.save()
    join(profile, club["a"], Role.ARCHER)
    sid, res = open_for(client_for(club["coach"]), profile)
    assert res.status_code == 201 and res.data["owner"] == profile.pk


def test_the_archers_own_session_has_them_as_opener(client_for, club):
    sid = new_id()
    res = client_for(club["archer1"]).put(f"/api/sessions/{sid}/", SESSION, format="json")
    assert res.data["opened_by"] == club["archer1"].pk


def test_the_coach_repeats_the_put_and_changes_times_and_notes_only(client_for, club):
    coach = client_for(club["coach"])
    sid, _ = open_for(coach, club["archer1"])
    res = coach.put(f"/api/sessions/{sid}/", {**OPEN, "ended_at": "2026-10-18T10:00:00Z", "location": "Hall", "type": "scoring", "mental_rating": 4}, format="json")
    assert res.status_code == 200
    session = TrainingSession.objects.get(pk=sid)
    assert session.ended_at is not None and session.location == "Hall"
    assert session.type == "" and session.mental_rating is None


def test_the_coach_cannot_touch_an_archers_own_session_or_add_results(client_for, club):
    archer = client_for(club["archer1"])
    sid = new_id()
    archer.put(f"/api/sessions/{sid}/", SESSION, format="json")
    assert client_for(club["coach"]).put(f"/api/sessions/{sid}/", SESSION, format="json").status_code == 403
    sid2, _ = open_for(client_for(club["coach"]), club["archer1"])
    res = client_for(club["coach"]).put(f"/api/sessions/{sid2}/ends/{new_id()}/", end_body([shot()]), format="json")
    assert res.status_code == 403


def test_the_archer_adds_results_to_a_coachs_session(client_for, club):
    sid, _ = open_for(client_for(club["coach"]), club["archer1"])
    archer = client_for(club["archer1"])
    assert archer.put(f"/api/sessions/{sid}/", {"started_at": OPEN["started_at"], "type": "scoring"}, format="json").status_code == 200
    assert archer.put(f"/api/sessions/{sid}/ends/{new_id()}/", end_body([shot()]), format="json").status_code == 201
    volume = {"distance_m": "18.0", "arrow_count": 12}
    assert archer.put(f"/api/sessions/{sid}/volume/{new_id()}/", volume, format="json").status_code == 201
    assert TrainingSession.objects.get(pk=sid).type == "scoring"


# --- the type -----------------------------------------------------------------------------------


def test_type_may_be_empty_and_is_set_while_there_are_no_results(client_for, club):
    archer = client_for(club["archer1"])
    sid = new_id()
    assert archer.put(f"/api/sessions/{sid}/", OPEN, format="json").data["type"] == ""
    assert archer.put(f"/api/sessions/{sid}/", {**OPEN, "type": "scoring"}, format="json").status_code == 200
    assert archer.put(f"/api/sessions/{sid}/", {**OPEN, "type": "volume"}, format="json").status_code == 200


def test_type_cannot_change_under_results(client_for, club):
    archer = client_for(club["archer1"])
    sid, other = new_id(), new_id()
    archer.put(f"/api/sessions/{sid}/", SESSION, format="json")
    archer.put(f"/api/sessions/{sid}/ends/{new_id()}/", end_body([shot()]), format="json")
    assert archer.put(f"/api/sessions/{sid}/", {**SESSION, "type": "volume"}, format="json").status_code == 400
    assert archer.put(f"/api/sessions/{sid}/", {**SESSION, "location": "Elsewhere"}, format="json").status_code == 200, "the same type resent"
    archer.put(f"/api/sessions/{other}/", {**SESSION, "type": "volume"}, format="json")
    archer.put(f"/api/sessions/{other}/volume/{new_id()}/", {"distance_m": "18.0", "arrow_count": 6}, format="json")
    assert archer.put(f"/api/sessions/{other}/", {**SESSION, "type": "scoring"}, format="json").status_code == 400


def test_results_need_a_type_first(client_for, club):
    archer = client_for(club["archer1"])
    sid = new_id()
    archer.put(f"/api/sessions/{sid}/", OPEN, format="json")
    assert archer.put(f"/api/sessions/{sid}/ends/{new_id()}/", end_body([shot()]), format="json").status_code == 400
    assert archer.put(f"/api/sessions/{sid}/volume/{new_id()}/", {"distance_m": "18.0", "arrow_count": 6}, format="json").status_code == 400
    assert not End.objects.exists() and not VolumeEntry.objects.exists()


# --- statistics ignore sessions without results -----------------------------------------------------


def test_empty_sessions_add_nothing_to_any_statistic(client_for, club):
    for typ in ("", "competition"):
        TrainingSession.objects.create(id=uuid.uuid4(), owner=club["archer1"], opened_by=club["coach"], type=typ, started_at="2026-10-26T09:00:00Z")
    coach = client_for(club["coach"])
    owner = club["archer1"].pk
    assert coach.get(f"/api/stats/?owner={owner}").data["volume"]["total"] == 0
    assert coach.get(f"/api/stats/?owner={owner}").data["scores"] == []
    assert coach.get(f"/api/stats/positions/?owner={owner}&face=wa-40&distance_m=18").data["arrows"] == 0
    assert coach.get(f"/api/stats/arrows/?owner={owner}").data == []
    club["a"].show_ranking = True
    club["a"].save()
    assert all(r["arrows"] == 0 for r in coach.get(f"/api/teams/{club['a'].pk}/ranking/").data["rows"])
    overview = coach.get(f"/api/teams/{club['a'].pk}/overview/").data
    assert {r["name"]: r["arrows_7d"] for r in overview} == {"archer1": 0, "archer2": 0}


# --- the overview ----------------------------------------------------------------------------------


def test_an_empty_coach_session_is_the_last_session_but_not_live(client_for, club):
    from django.utils import timezone

    started = timezone.now().isoformat()
    sid, _ = open_for(client_for(club["coach"]), club["archer1"], {"started_at": started, "type": ""})
    row = next(r for r in client_for(club["coach"]).get(f"/api/teams/{club['a'].pk}/overview/").data if r["name"] == "archer1")
    assert str(row["last_session"]["id"]) == sid and row["last_session"]["type"] == "" and row["last_session"]["live"] is False
    TrainingSession.objects.filter(pk=sid).update(type="scoring")
    client_for(club["archer1"]).put(f"/api/sessions/{sid}/ends/{new_id()}/", end_body([shot()]), format="json")
    row = next(r for r in client_for(club["coach"]).get(f"/api/teams/{club['a'].pk}/overview/").data if r["name"] == "archer1")
    assert row["last_session"]["live"] is True
