"""The team roster and `Profile.visibility` (#80): who sees whose name and picture."""

import pytest

from core.models import Profile, Role, TeamMember, User
from core.tests.test_avatar import born, put

SETTINGS = ("team", "coaches", "me")
KEYS = {"user_id", "name", "role", "avatar_url"}


@pytest.fixture
def api(client_for, club):
    return lambda who: client_for(User.objects.get(pk=club[who].pk))


def roster(api, club, who, team="a"):
    return api(who).get(f"/api/teams/{club[team].pk}/roster/")


def listed(api, club, who):
    return {m["user_id"] for m in roster(api, club, who).data}


def set_visibility(user, value):
    Profile.objects.filter(user=user).update(visibility=value)  # not save(): a stale object would blank the picture


def avatar_status(api, club, who, person):
    return api(who).get(f"/api/users/{club[person].pk}/avatar/").status_code


# Which viewers see archer1, per the setting (specs/plans/2026-11-01-team-roster.md, "The rule").
EXPECTED = {
    "team": {"archer1": True, "archer2": True, "coach": True, "admin": True},
    "coaches": {"archer1": True, "archer2": False, "coach": True, "admin": True},
    "me": {"archer1": True, "archer2": False, "coach": False, "admin": False},
}


@pytest.mark.parametrize("setting", SETTINGS)
def test_roster_matrix(api, club, setting):
    set_visibility(club["archer1"], setting)
    for who, expected in EXPECTED[setting].items():
        assert (club["archer1"].pk in listed(api, club, who)) is expected, (setting, who)


@pytest.mark.parametrize("setting", SETTINGS)
def test_picture_matrix(api, club, setting):
    assert put(api, "archer1").status_code == 200
    set_visibility(club["archer1"], setting)
    for who, expected in EXPECTED[setting].items():
        assert avatar_status(api, club, who, "archer1") == (200 if expected else 404), (setting, who)
        assert bool(avatar_url_in_roster(api, club, who)) is expected, (setting, who)
    for who in ("b_archer", "b_admin"):
        assert avatar_status(api, club, who, "archer1") == 404


def avatar_url_in_roster(api, club, who):
    rows = {m["user_id"]: m for m in roster(api, club, who).data}
    row = rows.get(club["archer1"].pk)
    return row["avatar_url"] if row else ""


def test_other_team_and_nobody_get_404_for_the_roster(api, club, make_user):
    assert roster(api, club, "b_admin").status_code == 404
    assert roster(api, club, "b_archer").status_code == 404
    club["loner"] = make_user("loner@x.test")
    assert roster(api, club, "loner").status_code == 404


def test_the_viewer_is_always_in_it(api, club):
    for who in ("archer1", "coach"):
        set_visibility(club[who], "me")
        assert club[who].pk in listed(api, club, who)


def test_coach_with_each_setting(api, club):
    for setting, archers_see, admin_sees in (("team", True, True), ("coaches", False, True), ("me", False, False)):
        set_visibility(club["coach"], setting)
        assert (club["coach"].pk in listed(api, club, "archer1")) is archers_see, setting
        assert (club["coach"].pk in listed(api, club, "admin")) is admin_sees, setting


def test_coaches_keep_the_names_of_archers_who_hide(api, club):
    set_visibility(club["archer1"], "me")
    res = api("coach").get(f"/api/teams/{club['a'].pk}/members/")
    row = {m["user_id"]: m for m in res.data}[club["archer1"].pk]
    assert row["name"] == "archer1" and row["avatar_url"] == ""


def test_archers_still_see_the_names_of_the_staff(api, club):
    set_visibility(club["coach"], "me")
    res = api("archer1").get(f"/api/teams/{club['a'].pk}/members/")
    row = {m["user_id"]: m for m in res.data}[club["coach"].pk]
    assert row["name"] == "coach" and row["avatar_url"] == ""


def test_a_profile_without_an_account_is_not_in_the_roster(api, club):
    kid = api("coach").post(f"/api/teams/{club['a'].pk}/archers/", {"name": "Kid"}, format="json").data["user_id"]
    for who in ("coach", "archer1"):
        assert kid not in listed(api, club, who)


def test_the_picture_of_a_profile_without_an_account_is_for_the_coaches_only(api, club):
    kid = api("coach").post(f"/api/teams/{club['a'].pk}/archers/", {"name": "Kid"}, format="json").data["user_id"]
    assert api("coach").put(f"/api/teams/{club['a'].pk}/archers/{kid}/avatar/", {"file": _jpeg()}, format="multipart").status_code == 200
    assert api("coach").get(f"/api/users/{kid}/avatar/").status_code == 200
    assert api("archer1").get(f"/api/users/{kid}/avatar/").status_code == 404  # the default `team` does not open it


def _jpeg():
    from core.tests.test_avatar import upload

    return upload()["file"]


def test_the_roster_has_exactly_four_keys_and_no_email(api, club):
    res = roster(api, club, "archer1")
    assert res.status_code == 200 and res.data
    for row in res.data:
        assert set(row) == KEYS
    assert "@" not in str(res.data)


def test_a_blank_name_stays_blank(api, club):
    club["archer2"].profile.name = ""
    club["archer2"].profile.save()
    row = {m["user_id"]: m for m in roster(api, club, "archer1").data}[club["archer2"].pk]
    assert row["name"] == ""


def test_the_roster_is_ordered_by_role_then_name(api, club):
    rows = roster(api, club, "archer1").data
    assert [m["role"] for m in rows] == ["admin", "coach", "archer", "archer"]
    assert [m["name"] for m in rows][2:] == ["archer1", "archer2"]


def test_members_show_emails_only_to_coaches_and_admins(api, club):
    for who in ("coach", "admin"):
        rows = api(who).get(f"/api/teams/{club['a'].pk}/members/").data
        assert all(m["email"] for m in rows), who
    rows = {m["user_id"]: m for m in api("archer1").get(f"/api/teams/{club['a'].pk}/members/").data}
    assert rows[club["archer1"].pk]["email"] == "archer1@a.test"  # their own
    assert rows[club["coach"].pk]["email"] == "" and rows[club["admin"].pk]["email"] == ""


def test_under_18_without_consent_has_no_picture_whatever_the_setting(api, club):
    assert put(api, "archer1").status_code == 200
    born(club["archer1"], 15)
    for setting in SETTINGS:
        set_visibility(club["archer1"], setting)
        for who in ("archer1", "archer2", "coach"):
            assert avatar_status(api, club, who, "archer1") == 404
            assert avatar_url_in_roster(api, club, who) == ""


def test_the_setting_defaults_to_team_and_takes_three_values(api, club):
    assert api("archer1").get("/api/me/").data["profile"]["visibility"] == "team"
    for value in SETTINGS:
        res = api("archer1").patch("/api/me/", {"profile": {"visibility": value}}, format="json")
        assert res.status_code == 200 and res.data["profile"]["visibility"] == value
    for value in ("everyone", "nonsense"):
        assert api("archer1").patch("/api/me/", {"profile": {"visibility": value}}, format="json").status_code == 400


def test_a_link_signed_before_the_change_stops_working(api, club):
    res = put(api, "archer1")
    client = api("archer2")
    assert client.get(res.data["avatar_url"]).status_code == 200
    set_visibility(club["archer1"], "me")
    assert client.get(res.data["avatar_url"]).status_code == 404


def test_the_roster_needs_a_fixed_number_of_queries(api, club, make_user, join, django_assert_max_num_queries):
    for i in range(20):
        join(make_user(f"extra{i}@a.test"), club["a"], Role.ARCHER)
    with django_assert_max_num_queries(12):
        assert roster(api, club, "archer1").status_code == 200
    assert TeamMember.objects.filter(team=club["a"]).count() == 24
