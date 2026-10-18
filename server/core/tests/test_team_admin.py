from datetime import timedelta

import pytest
from django.utils import timezone

from core.access import archers_visible_to
from core.models import Invite, Role, TeamMember
from training.tests.test_overview import make_session


def role_url(club, who, team="a"):
    return f"/api/teams/{club[team].pk}/members/{club[who].pk}/"


def change(api, club, by, who, role, team="a"):
    return api(club[by]).patch(role_url(club, who, team), {"role": role}, format="json")


@pytest.fixture
def api(client_for):
    return lambda user: client_for(user)


def role_of(user):
    return TeamMember.objects.get(user=user).role


# --- roles -------------------------------------------------------------------------------------


@pytest.mark.parametrize("old, new", [("archer1", "coach"), ("archer1", "admin"), ("coach", "admin"), ("coach", "archer"), ("admin", "coach")])
def test_an_admin_changes_roles(api, club, old, new):
    if old == "admin":  # needs another admin first
        TeamMember.objects.filter(user=club["coach"]).update(role=Role.ADMIN)
        res = change(api, club, "coach", "admin", new)
    else:
        res = change(api, club, "admin", old, new)
    assert res.status_code == 200, res.data
    assert res.data["role"] == new
    assert role_of(club[old]) == new


def test_the_answer_describes_the_member(api, club):
    res = change(api, club, "admin", "archer1", "coach")
    assert (res.data["user_id"], res.data["email"], res.data["role"]) == (club["archer1"].pk, "archer1@a.test", "coach")


@pytest.mark.parametrize("who", ["coach", "archer1"])
def test_only_admins_change_roles(api, club, who):
    assert change(api, club, who, "archer2", "coach").status_code == 403
    assert change(api, club, who, who, "admin").status_code == 403, "nobody promotes themselves"
    assert role_of(club["archer2"]) == "archer"


def test_strangers_and_unknown_people_get_404(api, club):
    assert change(api, club, "b_admin", "archer1", "coach").status_code == 404
    assert api(club["admin"]).patch(f"/api/teams/{club['a'].pk}/members/{club['b_archer'].pk}/", {"role": "coach"}, format="json").status_code == 404
    assert api(club["admin"]).patch(f"/api/teams/{club['a'].pk}/members/99999/", {"role": "coach"}, format="json").status_code == 404


@pytest.mark.parametrize("body", [{}, {"role": "owner"}, {"role": ""}, {"role": None}])
def test_the_role_must_be_a_real_one(api, club, body):
    assert api(club["admin"]).patch(role_url(club, "archer1"), body, format="json").status_code == 400
    assert role_of(club["archer1"]) == "archer"


def test_the_last_admin_cannot_step_down_or_be_demoted(api, club):
    assert change(api, club, "admin", "admin", "coach").status_code == 400
    assert change(api, club, "admin", "admin", "archer").status_code == 400
    assert role_of(club["admin"]) == "admin"


def test_an_admin_can_step_down_once_there_is_another_admin(api, club):
    assert change(api, club, "admin", "coach", "admin").status_code == 200
    assert change(api, club, "admin", "admin", "coach").status_code == 200
    assert role_of(club["admin"]) == "coach"
    assert change(api, club, "admin", "coach", "archer").status_code == 403, "no longer an admin"


def test_the_same_role_is_accepted(api, club):
    assert change(api, club, "admin", "archer1", "archer").status_code == 200


def test_becoming_an_archer_resets_also_shoots(api, club):
    TeamMember.objects.filter(user=club["coach"]).update(also_shoots=True)
    change(api, club, "admin", "coach", "archer")
    assert TeamMember.objects.get(user=club["coach"]).also_shoots is False


def test_roles_in_another_team_are_not_touched(api, club, join):
    join(club["archer1"], club["b"], Role.ARCHER)
    change(api, club, "admin", "archer1", "coach")
    assert TeamMember.objects.get(user=club["archer1"], team=club["b"]).role == "archer"


# --- what a role change does to visibility ------------------------------------------------------


def visible(coach):
    return set(archers_visible_to(coach).values_list("email", flat=True))


def test_a_coach_made_an_archer_becomes_visible_to_the_coaches(api, club):
    session = make_session(club["coach"])
    assert api(club["admin"]).get(f"/api/sessions/{session.pk}/").status_code == 404
    change(api, club, "admin", "coach", "archer")
    assert "coach@a.test" in visible(club["admin"])
    assert api(club["admin"]).get(f"/api/sessions/{session.pk}/").status_code == 200


def test_an_archer_made_a_coach_is_hidden_again_until_they_opt_in(api, club):
    session = make_session(club["archer1"])
    change(api, club, "admin", "archer1", "coach")
    assert "archer1@a.test" not in visible(club["admin"])
    assert api(club["admin"]).get(f"/api/sessions/{session.pk}/").status_code == 404
    api(club["archer1"]).patch(f"/api/teams/{club['a'].pk}/membership/", {"also_shoots": True}, format="json")
    assert api(club["admin"]).get(f"/api/sessions/{session.pk}/").status_code == 200


def test_a_new_coach_can_now_see_the_archers(api, club):
    session = make_session(club["archer2"])
    assert api(club["archer1"]).get(f"/api/sessions/{session.pk}/").status_code == 404
    change(api, club, "admin", "archer1", "coach")
    assert api(club["archer1"]).get(f"/api/sessions/{session.pk}/").status_code == 200


def test_a_new_admin_can_manage_the_team(api, club):
    change(api, club, "admin", "coach", "admin")
    assert api(club["coach"]).post(f"/api/teams/{club['a'].pk}/invites/", {"role": "archer"}, format="json").status_code == 201


# --- team name ---------------------------------------------------------------------------------


def test_an_admin_renames_the_team(api, club):
    res = api(club["admin"]).patch(f"/api/teams/{club['a'].pk}/", {"name": "  Archery Göttingen "}, format="json")
    assert res.status_code == 200 and res.data["name"] == "Archery Göttingen" and res.data["my_role"] == "admin"
    assert api(club["archer1"]).get("/api/teams/").data[0]["name"] == "Archery Göttingen"


@pytest.mark.parametrize("who", ["coach", "archer1"])
def test_only_admins_rename(api, club, who):
    assert api(club[who]).patch(f"/api/teams/{club['a'].pk}/", {"name": "Mine"}, format="json").status_code == 403
    club["a"].refresh_from_db()
    assert club["a"].name == "Team A"


@pytest.mark.parametrize("body", [{}, {"name": ""}, {"name": "   "}, {"name": "x" * 151}])
def test_the_name_must_be_sensible(api, club, body):
    assert api(club["admin"]).patch(f"/api/teams/{club['a'].pk}/", body, format="json").status_code == 400


def test_the_team_detail_is_for_members(api, club, client_for):
    res = api(club["coach"]).get(f"/api/teams/{club['a'].pk}/")
    assert res.status_code == 200 and (res.data["name"], res.data["my_role"]) == ("Team A", "coach")
    assert api(club["b_admin"]).get(f"/api/teams/{club['a'].pk}/").status_code == 404
    assert api(club["b_admin"]).patch(f"/api/teams/{club['a'].pk}/", {"name": "x"}, format="json").status_code == 404
    assert client_for().get(f"/api/teams/{club['a'].pk}/").status_code == 401


# --- invites --------------------------------------------------------------------------------------


def test_the_invite_list_shows_only_open_ones(api, club):
    open_one = Invite.objects.create(team=club["a"], role=Role.ARCHER, created_by=club["admin"])
    Invite.objects.create(team=club["a"], role=Role.ARCHER, created_by=club["admin"], expires_at=timezone.now() - timedelta(days=1))
    Invite.objects.create(team=club["a"], role=Role.ARCHER, created_by=club["admin"], used_at=timezone.now(), used_by=club["archer1"])
    listed = api(club["admin"]).get(f"/api/teams/{club['a'].pk}/invites/").data
    assert [i["code"] for i in listed] == [open_one.code]


def test_an_invite_for_a_role_works_end_to_end(api, client_for, club):
    created = api(club["admin"]).post(f"/api/teams/{club['a'].pk}/invites/", {"role": "admin"}, format="json").data
    res = client_for().post("/api/register/", {"email": "new@x.test", "password": "correct-horse-battery", "name": "New", "invite_code": created["code"]})
    assert res.status_code == 201
    assert TeamMember.objects.get(user__email="new@x.test").role == "admin"
    assert api(club["admin"]).get(f"/api/teams/{club['a'].pk}/invites/").data == []
