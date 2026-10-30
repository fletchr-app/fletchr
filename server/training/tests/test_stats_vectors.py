"""The statistics against the shared fixture, which the app's src/lib/stats.test.ts reads too (the device computes the same numbers)."""

import uuid
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest

from training.arrow_stats import compute_arrow_stats
from training.stats import compute_stats
from training.tests.stats_fixture import arrow_rows, instant, load_cases, plain, shot_rows, volume_rows

CASES = load_cases()


@pytest.mark.parametrize("case", CASES, ids=lambda c: c["name"])
def test_stats_match_the_fixture(case):
    result = compute_stats(shot_rows(case["sessions"]), volume_rows(case["sessions"]), instant(case["now"]), ZoneInfo(case["tz"]), case["weeks"])
    assert plain(result) == case["stats"]


@pytest.mark.parametrize("case", CASES, ids=lambda c: c["name"])
def test_arrow_stats_match_the_fixture(case):
    assert plain(compute_arrow_stats(arrow_rows(case["sessions"]))) == case["arrow_stats"]


def store(owner, sessions):
    from training.models import End, Shot, TrainingSession

    for s in sessions:
        session = TrainingSession.objects.create(id=uuid.uuid4(), owner=owner, started_at=instant(s["started_at"]), type=s["type"])
        for e in s["ends"]:
            end = End.objects.create(id=uuid.uuid4(), session=session, index=e["index"], distance_m=e["distance_m"], face=e["face"], arrows_per_end=6)
            for i, sh in enumerate(e["shots"]):
                Shot.objects.create(id=uuid.uuid4(), end=end, index=i, x=sh.get("x"), y=sh.get("y"), value=sh["value"], is_x=sh["is_x"], is_miss=sh["is_miss"])


POSITION_CASES = [(c["name"], p) for c in CASES for p in c.get("positions", [])]


@pytest.mark.parametrize("name,p", POSITION_CASES, ids=lambda v: v if isinstance(v, str) else str(v["query"]))
def test_positions_match_the_fixture(client_for, club, name, p):
    case = next(c for c in CASES if c["name"] == name)
    store(club["archer1"], case["sessions"])
    res = client_for(club["archer1"]).get("/api/stats/positions/", p["query"])
    assert res.status_code == 200
    expected = p["expect"]
    got = {k: res.data[k] for k in ("face", "distance_m", "radius_cm", "arrows", "limited")}
    assert got == {k: expected[k] for k in got}
    assert [list(point) for point in res.data["points"]] == expected["points"]
