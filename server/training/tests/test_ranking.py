import uuid
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone

from training.ranking import compute_ranking
from training.models import End, Shot, TrainingSession, VolumeEntry

MEMBERS = [(1, "Ann", False), (2, "Ben", False), (3, "Cy", True)]


def shot(owner, value, *, face="wa-40", distance="18.0", miss=False):
    return (owner, face, distance, None if miss else value, miss)


def rank(shots=(), volume=(), face=None, distance=None):
    return compute_ranking(MEMBERS, list(shots), list(volume), face, distance)


def test_most_arrows_first_with_volume_entries_counted_and_unscored_arrows_too():
    r = rank([shot(1, 9), shot(2, 9), shot(2, 8), shot(2, None, face="blank")], volume=[(1, 30)])
    assert [(x["name"], x["arrows"]) for x in r["rows"]] == [("Ann", 31), ("Ben", 3), ("Cy", 0)]


def test_equal_volume_is_ordered_by_name():
    assert [x["name"] for x in rank()["rows"]] == ["Ann", "Ben", "Cy"]


def test_the_average_is_over_the_face_and_distance_shot_most_unless_asked():
    shots = [shot(1, 10), shot(1, 8), shot(2, 6), shot(2, 9, distance="30.0"), shot(1, 4, face="wa-122")]
    r = rank(shots)
    assert (r["face"], r["distance_m"], r["max_value"]) == ("wa-40", "18.0", 10)
    assert {x["name"]: (x["average"], x["scored_arrows"]) for x in r["rows"]} == {"Ann": (9.0, 2), "Ben": (6.0, 1), "Cy": (None, 0)}
    chosen = rank(shots, face="wa-40", distance=Decimal("30.0"))
    assert {x["name"]: x["average"] for x in chosen["rows"]} == {"Ann": None, "Ben": 9.0, "Cy": None}


def test_a_miss_counts_as_zero_and_an_unscored_arrow_not_at_all():
    r = rank([shot(1, 10), shot(1, 0, miss=True), shot(1, None)])
    assert r["rows"][0]["average"] == 5.0 and r["rows"][0]["scored_arrows"] == 2


def test_the_choices_are_listed_biggest_first():
    r = rank([shot(1, 9), shot(1, 9, distance="30.0"), shot(2, 9, distance="30.0")])
    assert [(c["face"], c["distance_m"], c["arrows"]) for c in r["choices"]] == [("wa-40", "30.0", 2), ("wa-40", "18.0", 1)]


def test_nothing_shot_has_no_face_and_no_averages():
    r = rank()
    assert r["face"] is None and r["choices"] == [] and all(x["average"] is None for x in r["rows"])


# --- endpoint --------------------------------------------------------------------------------


def url(club):
    return f"/api/teams/{club['a'].pk}/ranking/"


def shoot(owner, values, *, ago=timedelta(days=1), volume=0):
    session = TrainingSession.objects.create(id=uuid.uuid4(), owner=owner, started_at=timezone.now() - ago, type="scoring")
    end = End.objects.create(id=uuid.uuid4(), session=session, index=0, distance_m=18, face="wa-40", arrows_per_end=6)
    for i, v in enumerate(values):
        Shot.objects.create(id=uuid.uuid4(), end=end, index=i, value=v)
    if volume:
        VolumeEntry.objects.create(id=uuid.uuid4(), session=session, distance_m=18, arrow_count=volume)


def on(club):
    club["a"].show_ranking = True
    club["a"].save()


def test_it_is_off_until_an_admin_switches_it_on(client_for, club):
    assert client_for(club["coach"]).get(url(club)).status_code == 403
    on(club)
    assert client_for(club["coach"]).get(url(club)).status_code == 200


def test_only_coaches_see_it(client_for, club):
    on(club)
    assert client_for(club["archer1"]).get(url(club)).status_code == 403
    assert client_for(club["b_admin"]).get(url(club)).status_code == 404
    assert client_for().get(url(club)).status_code == 401


def test_it_lists_the_archers_with_volume_and_average(client_for, club):
    on(club)
    shoot(club["archer1"], [9, 9, 8], volume=10)
    shoot(club["archer2"], [10], ago=timedelta(days=40))  # outside the default 28 days
    res = client_for(club["coach"]).get(url(club))
    assert res.data["days"] == 28 and res.data["face"] == "wa-40"
    rows = {r["name"]: r for r in res.data["rows"]}
    assert (rows["archer1"]["arrows"], rows["archer1"]["average"]) == (13, pytest.approx(8.667, abs=1e-3))
    assert (rows["archer2"]["arrows"], rows["archer2"]["average"]) == (0, None)
    assert "coach" not in rows
    assert client_for(club["coach"]).get(url(club), {"days": 90}).data["rows"][0]["name"] == "archer1"


def test_parameters_are_checked(client_for, club):
    on(club)
    for params in ({"days": 0}, {"days": 366}, {"days": "x"}, {"face": "wa-40"}, {"distance_m": "18"}, {"face": "nope", "distance_m": "18"}):
        assert client_for(club["coach"]).get(url(club), params).status_code == 400, params


def test_an_admin_switches_it_on_and_off(client_for, club):
    patch = lambda who, body: client_for(club[who]).patch(f"/api/teams/{club['a'].pk}/", body, format="json")
    assert patch("admin", {"show_ranking": True}).data["show_ranking"] is True
    club["a"].refresh_from_db()
    assert club["a"].show_ranking and club["a"].name == "Team A"
    assert patch("admin", {"name": "Renamed"}).data["show_ranking"] is True  # a rename leaves it alone
    assert patch("coach", {"show_ranking": False}).status_code == 403
    assert patch("admin", {"name": "  "}).status_code == 400
    assert patch("admin", {"show_ranking": False}).data["show_ranking"] is False


def test_a_new_team_has_it_off(client_for, club):
    assert client_for(club["admin"]).get(f"/api/teams/{club['a'].pk}/").data["show_ranking"] is False
