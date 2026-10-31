"""The `visibility` fields: who may set them, to what, and what a new row starts with."""

import uuid

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from core.audience import ACCEPTED, AUDIENCES, at_least, clamp
from media.models import Media
from media.tests.test_media import photo, put
from training.models import TrainingSession
from training.tests.test_training import SESSION, new_id


def test_the_scale_is_ordered_in_one_place():
    assert at_least("me") == AUDIENCES and at_least("coaches") == ("coaches", "team", "everyone") and at_least("everyone") == ("everyone",)
    assert [clamp(a) for a in AUDIENCES] == ["me", "coaches", "coaches", "coaches"] and clamp("nonsense") == "me"
    assert ACCEPTED == ("me", "coaches")


def test_a_new_session_starts_with_the_archers_default(client_for, club):
    owner = club["archer1"]
    assert client_for(owner).put(f"/api/sessions/{new_id()}/", SESSION, format="json").data["visibility"] == "coaches"
    owner.profile.training_visibility = "me"
    owner.profile.save()
    sid = new_id()
    assert client_for(owner).put(f"/api/sessions/{sid}/", SESSION, format="json").data["visibility"] == "me"
    again = client_for(owner).put(f"/api/sessions/{sid}/", {**SESSION, "location": "Elsewhere"}, format="json")
    assert again.data["visibility"] == "me"  # a repeat that leaves it out keeps it
    owner.profile.training_visibility = "coaches"
    owner.profile.save()
    assert client_for(owner).put(f"/api/sessions/{sid}/", {**SESSION, "visibility": "coaches"}, format="json").data["visibility"] == "coaches"


@pytest.mark.parametrize("level", ["team", "everyone"])
def test_wider_levels_are_refused_for_sessions_the_default_and_clips(level, client_for, club):
    c = client_for(club["archer1"])
    res = c.put(f"/api/sessions/{new_id()}/", {**SESSION, "visibility": level}, format="json")
    assert res.status_code == 400 and "visibility" in res.data
    assert c.patch("/api/me/", {"profile": {"training_visibility": level}}, format="json").status_code == 400
    assert put(c, {**photo(), "visibility": level}, uuid.uuid4()).status_code == 400
    assert c.put(f"/api/sessions/{new_id()}/", {**SESSION, "visibility": "nonsense"}, format="json").status_code == 400


def test_the_default_is_set_in_the_profile(client_for, club):
    c = client_for(club["archer1"])
    assert c.get("/api/me/").data["profile"]["training_visibility"] == "coaches"
    assert c.patch("/api/me/", {"profile": {"training_visibility": "me"}}, format="json").status_code == 200
    club["archer1"].profile.refresh_from_db()
    assert club["archer1"].profile.training_visibility == "me"


def test_a_session_a_coach_opens_starts_with_coaches_whatever_the_archers_default(client_for, club):
    club["archer1"].profile.training_visibility = "me"
    club["archer1"].profile.save()
    res = client_for(club["coach"]).put(f"/api/sessions/{new_id()}/?owner={club['archer1'].pk}", {"started_at": "2026-10-18T09:00:00Z"}, format="json")
    assert res.status_code == 201 and res.data["visibility"] == "coaches" and res.data["opened_by"] == club["coach"].pk


def test_a_coach_cannot_set_the_visibility_of_a_session_they_opened(client_for, club):
    sid = new_id()
    coach = client_for(club["coach"])
    assert coach.put(f"/api/sessions/{sid}/?owner={club['archer1'].pk}", {"started_at": "2026-10-18T09:00:00Z"}, format="json").status_code == 201
    res = coach.put(f"/api/sessions/{sid}/", {"started_at": "2026-10-18T09:00:00Z", "visibility": "me"}, format="json")
    assert res.status_code == 400 and "visibility" in res.data
    assert TrainingSession.objects.get(pk=sid).visibility == "coaches"
    assert client_for(club["archer1"]).put(f"/api/sessions/{sid}/", {"started_at": "2026-10-18T09:00:00Z", "visibility": "me"}, format="json").data["visibility"] == "me"


def test_a_coach_logging_for_an_archer_without_an_account_cannot_change_it_either(client_for, club, make_user):
    managed = make_user("managed@a.test")
    managed.is_managed = True
    managed.save()
    from core.models import Role, TeamMember

    TeamMember.objects.create(team=club["a"], user=managed, role=Role.ARCHER)
    c = client_for(club["coach"])
    created = c.put(f"/api/sessions/{new_id()}/?owner={managed.pk}", SESSION, format="json")
    assert created.status_code == 201 and created.data["visibility"] == "coaches"
    assert c.put(f"/api/sessions/{new_id()}/?owner={managed.pk}", {**SESSION, "visibility": "me"}, format="json").status_code == 400


def test_a_clip_takes_its_own_visibility_only_from_the_archer(client_for, club):
    mid = uuid.uuid4()
    c = client_for(club["archer1"])
    res = put(c, {**photo(), "visibility": "me"}, mid)
    assert res.status_code == 201, res.content
    assert Media.objects.get(pk=mid).visibility == "me"
    assert Media.objects.filter(pk=mid).update(visibility=None)
    coach = client_for(club["coach"])
    assert coach.put(f"/api/media/{mid}/", {"visibility": "me"}, format="multipart").status_code in (403, 400)
    mine = uuid.uuid4()
    res = put(coach, {**photo(), "visibility": "me"}, mine, owner=club["archer1"])
    assert res.status_code == 400 and "visibility" in res.json()


@pytest.mark.django_db(transaction=True)
def test_existing_sessions_become_coaches_in_the_migration(club):
    owner = club["archer1"]
    executor = MigrationExecutor(connection)
    executor.migrate([("training", "0003_schedule"), ("core", "0009_tombstone")])
    old = executor.loader.project_state([("training", "0003_schedule"), ("core", "0009_tombstone")]).apps
    session = old.get_model("training", "TrainingSession").objects.create(id=uuid.uuid4(), owner_id=owner.pk, started_at="2026-10-18T09:00:00Z")
    executor = MigrationExecutor(connection)
    executor.migrate(executor.loader.graph.leaf_nodes())
    assert TrainingSession.objects.get(pk=session.pk).visibility == "coaches"
    owner.profile.refresh_from_db()
    assert owner.profile.training_visibility == "coaches"
