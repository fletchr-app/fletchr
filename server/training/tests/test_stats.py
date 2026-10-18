import uuid
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

import pytest

from training.stats import compute_stats, week_start
from training.tests.test_overview import make_session

UTC = ZoneInfo("UTC")
BERLIN = ZoneInfo("Europe/Berlin")
NOW = datetime(2026, 10, 21, 12, 0, tzinfo=timezone.utc)  # a Wednesday; its week starts on Monday the 19th


def at(day, hour=12, month=10):
    return datetime(2026, month, day, hour, 0, tzinfo=timezone.utc)


def shot(value, *, sid="s1", started=None, typ="scoring", distance="18.0", face="wa-40", is_x=False, miss=False):
    return (sid, started or at(20), typ, distance, face, None if miss else value, is_x, miss)


def stats(shots=(), volume=(), tz=UTC, weeks=4):
    return compute_stats(list(shots), list(volume), NOW, tz, weeks)


def only(result):
    assert len(result["scores"]) == 1
    return result["scores"][0]


# --- volume ----------------------------------------------------------------------------------


def test_weeks_start_on_monday():
    assert week_start(date(2026, 10, 21)) == date(2026, 10, 19)
    assert week_start(date(2026, 10, 19)) == date(2026, 10, 19)
    assert week_start(date(2026, 10, 25)) == date(2026, 10, 19)  # a Sunday belongs to the week before it


def test_nothing_shot_gives_zero_weeks_and_no_scores():
    result = stats()
    assert [w["week_start"] for w in result["volume"]["weeks"]] == [date(2026, 9, 28), date(2026, 10, 5), date(2026, 10, 12), date(2026, 10, 19)]
    assert all(w["arrows"] == 0 for w in result["volume"]["weeks"])
    assert (result["volume"]["this_week"], result["volume"]["this_month"], result["volume"]["total"]) == (0, 0, 0)
    assert result["scores"] == []


def test_arrows_land_in_the_week_of_their_session():
    shots = [shot(9, started=at(20)), shot(9, started=at(20)), shot(9, sid="s2", started=at(14)), shot(9, sid="s3", started=at(1, month=10))]
    weeks = {w["week_start"].day: w["arrows"] for w in stats(shots)["volume"]["weeks"]}
    assert weeks == {28: 1, 5: 0, 12: 1, 19: 2}  # 1 October 2026 is a Thursday: the week of Monday 28 September


def test_volume_entries_count_but_have_no_scores():
    result = stats(volume=[(at(20), 30), (at(14), 12)])
    assert [w["arrows"] for w in result["volume"]["weeks"]] == [0, 0, 12, 30]
    assert result["volume"]["total"] == 42 and result["scores"] == []


def test_this_week_this_month_and_total():
    shots = [shot(9, started=at(20)), shot(9, sid="s2", started=at(3)), shot(9, sid="s3", started=at(28, month=9)), shot(9, sid="s4", started=datetime(2025, 1, 5, tzinfo=timezone.utc))]
    v = stats(shots)["volume"]
    assert (v["this_week"], v["this_month"], v["total"]) == (1, 2, 4), "older than the shown weeks still counts for the total"


def test_the_viewers_time_zone_decides_the_day():
    # Sunday 23:30 UTC is already Monday 01:30 in Berlin (UTC+2 in October).
    late_sunday = [shot(9, started=datetime(2026, 10, 18, 23, 30, tzinfo=timezone.utc))]
    utc = {w["week_start"].day: w["arrows"] for w in stats(late_sunday, tz=UTC)["volume"]["weeks"]}
    berlin = {w["week_start"].day: w["arrows"] for w in stats(late_sunday, tz=BERLIN)["volume"]["weeks"]}
    assert utc[12] == 1 and utc[19] == 0
    assert berlin[12] == 0 and berlin[19] == 1


def test_blank_faces_count_as_volume_only():
    result = stats([shot(None, face="blank", miss=False), shot(9)])
    assert result["volume"]["total"] == 2
    assert only(result)["arrows"] == 1


# --- scores ----------------------------------------------------------------------------------


def test_average_counts_x_as_ten_and_a_miss_as_zero():
    result = stats([shot(10, face="wa-122", is_x=True), shot(9, face="wa-122"), shot(None, face="wa-122", miss=True)])
    group = only(result)
    assert group["arrows"] == 3
    assert group["average"] == pytest.approx(19 / 3, abs=1e-3)
    assert group["top_rate"] == pytest.approx(1 / 3, abs=1e-4)
    assert group["x_rate"] == pytest.approx(1 / 3, abs=1e-4)
    assert group["miss_rate"] == pytest.approx(1 / 3, abs=1e-4)
    assert group["max_value"] == 10 and group["face_name"] == "WA 122 cm"


def test_ten_rate_counts_every_ten_and_x_rate_only_where_there_is_an_x():
    group = only(stats([shot(10), shot(10), shot(9), shot(8)]))  # wa-40 has no X ring
    assert group["top_rate"] == 0.5 and group["x_rate"] is None


def test_the_best_ring_of_a_field_face_is_a_six():
    group = only(stats([shot(6, face="wa-field-80"), shot(5, face="wa-field-80"), shot(6, face="wa-field-80"), shot(4, face="wa-field-80")]))
    assert group["max_value"] == 6
    assert group["top_rate"] == 0.5
    assert group["average"] == pytest.approx(5.25)


def test_each_face_and_distance_is_its_own_group_biggest_first():
    result = stats([shot(9, distance="18.0"), shot(9, distance="30.0"), shot(9, distance="30.0"), shot(8, face="wa-122", distance="18.0")])
    assert [(g["face"], g["distance_m"], g["arrows"]) for g in result["scores"]] == [("wa-40", "30.0", 2), ("wa-122", "18.0", 1), ("wa-40", "18.0", 1)]


def test_18_and_18_point_0_are_the_same_distance():
    result = stats([shot(9, distance="18"), shot(9, distance="18.0"), shot(9, distance="18.00")])
    assert [(g["distance_m"], g["arrows"]) for g in result["scores"]] == [("18.0", 3)]


def test_arrows_without_a_score_are_ignored():
    assert only(stats([shot(9), shot(None)]))["arrows"] == 1


def test_one_point_per_session_oldest_first_with_the_local_date():
    shots = [
        shot(8, sid="late", started=at(20)),
        shot(10, sid="early", started=datetime(2026, 10, 18, 23, 30, tzinfo=timezone.utc), typ="competition"),
        shot(10, sid="early", started=datetime(2026, 10, 18, 23, 30, tzinfo=timezone.utc), typ="competition"),
        shot(6, sid="early", started=datetime(2026, 10, 18, 23, 30, tzinfo=timezone.utc), typ="competition"),
    ]
    points = only(stats(shots, tz=BERLIN))["sessions"]
    assert [(p["session"], p["date"], p["arrows"], p["competition"]) for p in points] == [
        ("early", date(2026, 10, 19), 3, True),
        ("late", date(2026, 10, 20), 1, False),
    ]
    assert points[0]["average"] == pytest.approx(26 / 3, abs=1e-3) and points[1]["average"] == 8


# --- endpoint --------------------------------------------------------------------------------


def get(client_for, who, club, **params):
    return client_for(club[who]).get("/api/stats/", params)


def test_own_stats(client_for, club):
    make_session(club["archer1"], arrows=6, volume=30)
    res = get(client_for, "archer1", club)
    assert res.status_code == 200
    assert res.data["owner"] == club["archer1"].pk and res.data["tz"] == "UTC"
    assert res.data["volume"]["total"] == 36 and res.data["volume"]["this_week"] == 36
    assert len(res.data["volume"]["weeks"]) == 12
    score = res.data["scores"][0]
    assert (score["arrows"], score["average"], score["distance_m"], score["face"]) == (6, 9.0, "18.0", "wa-40")


def test_a_new_archer_has_empty_stats(client_for, club):
    res = get(client_for, "archer2", club)
    assert res.status_code == 200 and res.data["scores"] == [] and res.data["volume"]["total"] == 0


def test_coaches_see_their_archers_stats_others_do_not(client_for, club):
    make_session(club["archer1"], arrows=3)
    for who in ("coach", "admin"):
        assert get(client_for, who, club, owner=club["archer1"].pk).data["volume"]["total"] == 3
    for who in ("archer2", "b_admin", "b_archer"):
        assert get(client_for, who, club, owner=club["archer1"].pk).status_code == 404, who


def test_a_coach_sees_their_own_stats_without_asking_for_an_owner(client_for, club):
    make_session(club["coach"], arrows=2)
    assert get(client_for, "coach", club).data["volume"]["total"] == 2


def test_parameters_are_checked(client_for, club):
    for params in ({"tz": "Mars/Base"}, {"weeks": 0}, {"weeks": 53}, {"weeks": "x"}, {"owner": "me"}):
        assert get(client_for, "archer1", club, **params).status_code == 400, params
    assert get(client_for, "archer1", club, weeks=52, tz="Europe/Berlin").data["tz"] == "Europe/Berlin"
    assert len(get(client_for, "archer1", club, weeks=4).data["volume"]["weeks"]) == 4


def test_login_required(client_for, db):
    assert client_for().get("/api/stats/").status_code == 401
