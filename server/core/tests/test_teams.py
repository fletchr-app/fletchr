import pytest

from core.access import archers_visible_to
from core.models import Invite, Role, TeamMember


def results(res):
    return res.data["results"] if isinstance(res.data, dict) else res.data


def emails(res):
    return {m["email"] for m in results(res)}


def test_teams_list_only_my_teams_with_role(client_for, club):
    res = client_for(club["coach"]).get("/api/teams/")
    assert [(t["name"], t["my_role"]) for t in results(res)] == [("Team A", "coach")]


def test_coach_and_admin_see_all_members(client_for, club):
    for who in ("coach", "admin"):
        res = client_for(club[who]).get(f"/api/teams/{club['a'].pk}/members/")
        assert emails(res) == {"admin@a.test", "coach@a.test", "archer1@a.test", "archer2@a.test"}


def test_archer_sees_staff_and_self_but_not_other_archers(client_for, club):
    res = client_for(club["archer1"]).get(f"/api/teams/{club['a'].pk}/members/")
    assert {m["user_id"] for m in res.data} == {club[k].pk for k in ("admin", "coach", "archer1")}
    assert emails(res) == {"", "archer1@a.test"}  # no addresses of the staff (#80)


def test_non_member_gets_404_for_team_resources(client_for, club):
    client = client_for(club["b_admin"])
    pk = club["a"].pk
    assert client.get(f"/api/teams/{pk}/members/").status_code == 404
    assert client.get(f"/api/teams/{pk}/invites/").status_code == 404
    assert client.post(f"/api/teams/{pk}/invites/", {}).status_code == 404
    assert client.delete(f"/api/teams/{pk}/members/{club['archer1'].pk}/").status_code == 404


def test_admin_creates_lists_and_revokes_invites(client_for, club):
    client = client_for(club["admin"])
    url = f"/api/teams/{club['a'].pk}/invites/"
    res = client.post(url, {"role": "coach"}, format="json")
    assert res.status_code == 201 and res.data["role"] == "coach" and len(res.data["code"]) == 12
    assert len(results(client.get(url))) == 1
    assert client.delete(f"{url}{res.data['id']}/").status_code == 204
    assert results(client.get(url)) == []


def test_invite_defaults_to_archer(client_for, club):
    res = client_for(club["admin"]).post(f"/api/teams/{club['a'].pk}/invites/", {}, format="json")
    assert res.status_code == 201 and res.data["role"] == "archer"


@pytest.mark.parametrize("who", ["coach", "archer1"])
def test_only_admins_manage_invites(client_for, club, invite, who):
    client = client_for(club[who])
    url = f"/api/teams/{club['a'].pk}/invites/"
    assert client.get(url).status_code == 403
    assert client.post(url, {}, format="json").status_code == 403
    assert client.delete(f"{url}{invite.pk}/").status_code == 403
    assert Invite.objects.filter(pk=invite.pk).exists()


def test_admin_cannot_touch_other_teams_invites(client_for, club, invite):
    res = client_for(club["b_admin"]).delete(f"/api/teams/{club['b'].pk}/invites/{invite.pk}/")
    assert res.status_code == 404
    assert Invite.objects.filter(pk=invite.pk).exists()


def test_admin_removes_member(client_for, club):
    res = client_for(club["admin"]).delete(f"/api/teams/{club['a'].pk}/members/{club['archer1'].pk}/")
    assert res.status_code == 204
    assert not TeamMember.objects.filter(user=club["archer1"]).exists()


@pytest.mark.parametrize("who", ["coach", "archer1"])
def test_only_admins_remove_members(client_for, club, who):
    res = client_for(club[who]).delete(f"/api/teams/{club['a'].pk}/members/{club['archer2'].pk}/")
    assert res.status_code == 403
    assert TeamMember.objects.filter(user=club["archer2"]).exists()


def test_last_admin_cannot_be_removed(client_for, club):
    url = f"/api/teams/{club['a'].pk}/members/{club['admin'].pk}/"
    assert client_for(club["admin"]).delete(url).status_code == 400
    assert TeamMember.objects.filter(user=club["admin"]).exists()


def test_archers_visible_to_coach_is_scoped_to_their_teams(club):
    visible = set(archers_visible_to(club["coach"]).values_list("email", flat=True))
    assert visible == {"coach@a.test", "archer1@a.test", "archer2@a.test"}


def test_archer_only_sees_self(club):
    visible = set(archers_visible_to(club["archer1"]).values_list("email", flat=True))
    assert visible == {"archer1@a.test"}


def test_coach_in_one_team_and_archer_in_another(club, join):
    """Being a coach in team A must not expose the archers of team B where you're just an archer."""
    join(club["coach"], club["b"], Role.ARCHER)
    visible = set(archers_visible_to(club["coach"]).values_list("email", flat=True))
    assert "archer@b.test" not in visible
    assert {"archer1@a.test", "archer2@a.test"} <= visible


def test_staff_in_a_team_are_not_listed_as_archers(club):
    visible = set(archers_visible_to(club["admin"]).values_list("email", flat=True))
    assert "coach@a.test" not in visible
