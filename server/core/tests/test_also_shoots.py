import pytest

from core.access import archers_visible_to
from core.models import Role, TeamMember
from equipment.models import Bow
from training.tests.test_overview import make_session


def emails(user):
    return set(archers_visible_to(user).values_list("email", flat=True))


def share(client_for, club, who="coach", value=True, team="a"):
    return client_for(club[who]).patch(f"/api/teams/{club[team].pk}/membership/", {"also_shoots": value}, format="json")


def test_hidden_by_default(client_for, club):
    session = make_session(club["coach"])
    admin = client_for(club["admin"])
    assert "coach@a.test" not in emails(club["admin"])
    assert admin.get("/api/sessions/").data == []
    assert admin.get(f"/api/sessions/{session.pk}/").status_code == 404
    rows = admin.get(f"/api/teams/{club['a'].pk}/overview/").data
    assert {r["name"] for r in rows} == {"archer1", "archer2"}
    assert client_for(club["coach"]).get("/api/sessions/").data[0]["id"] == str(session.pk), "their own stay visible to them"


def test_turning_it_on_shows_the_coach_to_the_other_coaches(client_for, club):
    session = make_session(club["coach"], arrows=6)
    assert share(client_for, club).data == {"also_shoots": True}
    admin = client_for(club["admin"])
    assert "coach@a.test" in emails(club["admin"])
    assert [s["id"] for s in admin.get("/api/sessions/").data] == [str(session.pk)]
    assert admin.get(f"/api/sessions/{session.pk}/").status_code == 200
    rows = {r["name"]: r for r in admin.get(f"/api/teams/{club['a'].pk}/overview/").data}
    assert rows["coach"]["role"] == "coach" and rows["coach"]["arrows_7d"] == 6
    assert rows["archer1"]["role"] == "archer"


def test_turning_it_off_hides_them_again(client_for, club):
    session = make_session(club["coach"])
    share(client_for, club)
    share(client_for, club, value=False)
    admin = client_for(club["admin"])
    assert admin.get("/api/sessions/").data == []
    assert admin.get(f"/api/sessions/{session.pk}/").status_code == 404


def test_it_works_for_admins_too(client_for, club):
    make_session(club["admin"])
    share(client_for, club, "admin")
    assert len(client_for(club["coach"]).get("/api/sessions/").data) == 1


def test_it_also_shares_their_equipment(client_for, club):
    Bow.objects.create(owner=club["coach"], name="Coach bow", type="recurve")
    assert client_for(club["admin"]).get("/api/bows/").data == []
    share(client_for, club)
    assert [b["name"] for b in client_for(club["admin"]).get("/api/bows/").data] == ["Coach bow"]


def test_other_people_still_see_nothing_of_them(client_for, club):
    make_session(club["coach"])
    share(client_for, club)
    for who in ("archer1", "archer2", "b_admin", "b_archer"):
        assert client_for(club[who]).get("/api/sessions/").data == [], who


def test_the_flag_is_for_one_team_only(client_for, club, join):
    """A coach of both teams who shares in team A is not visible to team B's admin."""
    join(club["coach"], club["b"], Role.COACH)
    make_session(club["coach"])
    share(client_for, club, team="a")
    assert client_for(club["b_admin"]).get("/api/sessions/").data == []
    assert len(client_for(club["admin"]).get("/api/sessions/").data) == 1
    share(client_for, club, team="b")
    assert len(client_for(club["b_admin"]).get("/api/sessions/").data) == 1


def test_seeing_is_not_editing(client_for, club):
    session = make_session(club["coach"])
    share(client_for, club)
    admin = client_for(club["admin"])
    assert admin.delete(f"/api/sessions/{session.pk}/").status_code == 403
    assert admin.put(f"/api/sessions/{session.pk}/", {"started_at": "2026-10-18T09:00:00Z", "type": "scoring", "location": "x"}, format="json").status_code == 403


def test_only_coaches_can_set_it_and_only_for_themselves(client_for, club):
    assert share(client_for, club, "archer1").status_code == 403
    assert not TeamMember.objects.get(user=club["archer1"]).also_shoots
    assert share(client_for, club, "b_admin", team="a").status_code == 404, "not a member of that team"
    assert client_for().patch(f"/api/teams/{club['a'].pk}/membership/", {"also_shoots": True}, format="json").status_code == 401
    # The admin changes their own flag, not anyone else's.
    share(client_for, club, "admin")
    assert TeamMember.objects.get(user=club["admin"]).also_shoots
    assert not TeamMember.objects.get(user=club["coach"]).also_shoots


def test_the_flag_shows_in_my_teams_and_in_the_member_list(client_for, club):
    assert client_for(club["coach"]).get("/api/teams/").data[0]["also_shoots"] is False
    share(client_for, club)
    assert client_for(club["coach"]).get("/api/teams/").data[0]["also_shoots"] is True
    members = {m["email"]: m for m in client_for(club["admin"]).get(f"/api/teams/{club['a'].pk}/members/").data}
    assert members["coach@a.test"]["also_shoots"] is True
    assert members["archer1@a.test"]["also_shoots"] is False


@pytest.mark.parametrize("value", [None, 2, "maybe"])
def test_the_flag_must_be_a_boolean(client_for, club, value):
    res = client_for(club["coach"]).patch(f"/api/teams/{club['a'].pk}/membership/", {"also_shoots": value}, format="json")
    assert res.status_code == 400
    assert not TeamMember.objects.get(user=club["coach"]).also_shoots
