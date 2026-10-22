import uuid

from django.utils import timezone

from core.models import ClaimCode, Invite, Role, Team, TeamMember, User
from notes.models import Note
from training.models import TrainingSession

OTHER_TEAM = "Team B"


def membership(team):
    return f"/api/teams/{team.pk}/membership/"


def detail(team):
    return f"/api/teams/{team.pk}/"


def stay(user):
    return TrainingSession.objects.create(id=uuid.uuid4(), owner=user, started_at=timezone.now(), type="volume")


# --- leaving ------------------------------------------------------------------------------------


def test_anyone_may_leave_and_keeps_their_own_data(client_for, club):
    for who in ("archer1", "coach"):
        session = stay(club[who])
        assert client_for(club[who]).delete(membership(club["a"])).status_code == 204, who
        assert not TeamMember.objects.filter(team=club["a"], user=club[who]).exists()
        assert TrainingSession.objects.filter(pk=session.pk).exists()
        assert User.objects.filter(pk=club[who].pk).exists()
    assert client_for(club["archer1"]).get(detail(club["a"])).status_code == 404  # no longer in it


def test_an_admin_may_leave_while_another_admin_remains(client_for, club):
    TeamMember.objects.filter(user=club["coach"]).update(role=Role.ADMIN)
    assert client_for(club["admin"]).delete(membership(club["a"])).status_code == 204
    assert TeamMember.objects.filter(team=club["a"], role=Role.ADMIN).count() == 1


def test_the_last_admin_cannot_leave(client_for, club):
    res = client_for(club["admin"]).delete(membership(club["a"]))
    assert res.status_code == 400 and "only admin" in str(res.data)
    assert TeamMember.objects.filter(team=club["a"], user=club["admin"]).exists()
    # even when nobody else is in the team
    alone = Team.objects.create(name="Alone")
    TeamMember.objects.create(team=alone, user=club["b_archer"], role=Role.ADMIN)
    assert client_for(club["b_archer"]).delete(membership(alone)).status_code == 400


def test_leaving_needs_a_membership_and_a_login(client_for, club):
    assert client_for(club["b_admin"]).delete(membership(club["a"])).status_code == 404
    assert client_for().delete(membership(club["a"])).status_code == 401
    assert TeamMember.objects.filter(team=club["a"]).count() == 4


def test_a_coach_who_leaves_keeps_the_notes_they_wrote(client_for, club):
    note = Note.objects.create(team=club["a"], author=club["coach"], archer=club["archer1"], body="x", visibility="coach_only")
    client_for(club["coach"]).delete(membership(club["a"]))
    assert Note.objects.filter(pk=note.pk).exists()
    assert client_for(club["coach"]).get("/api/notes/").data == []  # but they no longer see team notes


# --- deleting -----------------------------------------------------------------------------------


def test_an_admin_deletes_the_team_with_what_belongs_to_it(client_for, club):
    managed = User.objects.create_managed("Max")
    TeamMember.objects.create(team=club["a"], user=managed, role=Role.ARCHER)
    TrainingSession.objects.create(id=uuid.uuid4(), owner=managed, started_at=timezone.now(), type="volume")
    ClaimCode.objects.create(profile=managed, team=club["a"])
    Invite.objects.create(team=club["a"], created_by=club["admin"])
    Note.objects.create(team=club["a"], author=club["coach"], archer=club["archer1"], body="x")
    kept = stay(club["archer1"])

    assert client_for(club["admin"]).delete(detail(club["a"])).status_code == 204

    assert not Team.objects.filter(pk=club["a"].pk).exists()
    assert not TeamMember.objects.filter(team_id=club["a"].pk).exists()
    assert not Invite.objects.exists() and not ClaimCode.objects.exists() and not Note.objects.exists()
    assert not User.objects.filter(pk=managed.pk).exists() and TrainingSession.objects.count() == 1
    # real accounts and their data stay, and so does the other team
    assert TrainingSession.objects.filter(pk=kept.pk).exists()
    assert all(User.objects.filter(pk=club[w].pk).exists() for w in ("admin", "coach", "archer1", "archer2"))
    assert Team.objects.filter(name="Team B").exists() and TeamMember.objects.filter(team=club["b"]).count() == 2


def test_only_admins_delete_teams(client_for, club):
    assert client_for(club["coach"]).delete(detail(club["a"])).status_code == 403
    assert client_for(club["archer1"]).delete(detail(club["a"])).status_code == 403
    assert client_for(club["b_admin"]).delete(detail(club["a"])).status_code == 404
    assert client_for().delete(detail(club["a"])).status_code == 401
    assert Team.objects.filter(pk=club["a"].pk).exists()


def test_a_profile_is_removed_only_with_its_own_team(client_for, club):
    managed = User.objects.create_managed("Max")
    TeamMember.objects.create(team=club["b"], user=managed, role=Role.ARCHER)
    client_for(club["admin"]).delete(detail(club["a"]))
    assert User.objects.filter(pk=managed.pk).exists()


def test_a_profile_in_two_teams_survives_deleting_one(client_for, club):
    managed = User.objects.create_managed("Max")
    for team in (club["a"], club["b"]):
        TeamMember.objects.create(team=team, user=managed, role=Role.ARCHER)
    client_for(club["admin"]).delete(detail(club["a"]))
    assert User.objects.filter(pk=managed.pk).exists() and TeamMember.objects.filter(user=managed).count() == 1
