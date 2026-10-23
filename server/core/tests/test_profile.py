from datetime import date

import pytest

from core.models import User, age_in_years

ME = "/api/me/"


def test_age_counts_whole_years():
    assert age_in_years(None) is None
    assert age_in_years(date(2010, 6, 15), today=date(2026, 6, 14)) == 15  # the day before the birthday
    assert age_in_years(date(2010, 6, 15), today=date(2026, 6, 15)) == 16
    assert age_in_years(date(2000, 2, 29), today=date(2026, 2, 28)) == 25


def test_the_profile_fields_are_saved(client_for, club):
    me = client_for(club["archer1"])
    res = me.patch(ME, {"profile": {"dominant_hand": "left", "dominant_eye": "right", "date_of_birth": "2010-06-15", "units": "imperial"}}, format="json")
    assert res.status_code == 200
    got = me.get(ME).data["profile"]
    assert (got["dominant_hand"], got["dominant_eye"], got["date_of_birth"], got["units"]) == ("left", "right", "2010-06-15", "imperial")


@pytest.mark.parametrize("value", ["2999-01-01", "1850-01-01"])
def test_a_date_of_birth_must_be_plausible(client_for, club, value):
    res = client_for(club["archer1"]).patch(ME, {"profile": {"date_of_birth": value}}, format="json")
    assert res.status_code == 400 and "date_of_birth" in res.data["profile"]


def test_the_birth_date_can_be_taken_away(client_for, club):
    me = client_for(club["archer1"])
    me.patch(ME, {"profile": {"date_of_birth": "2010-06-15"}}, format="json")
    me.patch(ME, {"profile": {"date_of_birth": None}}, format="json")
    assert me.get(ME).data["profile"]["date_of_birth"] is None


def test_a_coach_sees_hand_eye_and_age_but_not_the_date_of_birth(client_for, club):
    profile = club["archer1"].profile
    profile.dominant_hand, profile.dominant_eye, profile.date_of_birth = "left", "right", date(2010, 6, 15)
    profile.save()
    got = client_for(club["coach"]).get(f"/api/archers/{club['archer1'].pk}/").data
    assert (got["dominant_hand"], got["dominant_eye"]) == ("left", "right")
    assert got["age"] == profile.age and got["age"] >= 15
    assert got["date_of_birth"] is None


@pytest.fixture
def managed(client_for, club):
    res = client_for(club["coach"]).post(f"/api/teams/{club['a'].pk}/archers/", {"name": "Max Muster"}, format="json")
    return User.objects.get(pk=res.data["user_id"])


def test_a_coach_sets_the_details_of_a_profile_they_keep(client_for, club, managed):
    url = f"/api/teams/{club['a'].pk}/archers/{managed.pk}/"
    res = client_for(club["coach"]).patch(url, {"dominant_hand": "right", "date_of_birth": "2012-03-04"}, format="json")
    assert res.status_code == 200
    got = client_for(club["coach"]).get(f"/api/archers/{managed.pk}/").data
    assert got["dominant_hand"] == "right" and str(got["date_of_birth"]) == "2012-03-04" and got["age"] is not None
    assert got["name"] == "Max Muster"  # a change without the name keeps it


def test_only_a_coach_of_the_team_may(client_for, club, managed):
    url = f"/api/teams/{club['a'].pk}/archers/{managed.pk}/"
    assert client_for(club["archer1"]).patch(url, {"dominant_hand": "left"}, format="json").status_code == 403
    assert client_for(club["b_admin"]).patch(url, {"dominant_hand": "left"}, format="json").status_code in (403, 404)


def test_a_profile_still_needs_a_name(client_for, club, managed):
    url = f"/api/teams/{club['a'].pk}/archers/{managed.pk}/"
    assert client_for(club["coach"]).patch(url, {"name": "  "}, format="json").status_code == 400
