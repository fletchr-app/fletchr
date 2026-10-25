import uuid
from datetime import timedelta

import pytest
from django.utils import timezone

from training.arrow_stats import compute_arrow_stats
from training.models import End, Shot, TrainingSession


def row(session, number, x, y, *, set_id=1, name="X10", face="wa-40", distance="18.0"):
    return (session, set_id, name, face, distance, number, x, y)


def one_session(session="s1", **kw):
    # arrow 1 is 0.3 to the right, the five others 0.1 to the left: the centre is at x = -0.0333
    return [row(session, 1, 0.3, 0.0, **kw)] + [row(session, n, -0.1, 0.0, **kw) for n in range(2, 7)]


def arrows(result):
    [group] = result
    [arrow_set] = group["sets"]
    return {a["number"]: a for a in arrow_set["arrows"]}


def test_an_arrow_is_measured_against_the_centre_of_its_own_session():
    a = arrows(compute_arrow_stats(one_session()))
    assert a[1]["offset"] == pytest.approx(0.3333, abs=1e-4) and a[1]["offset_x"] == pytest.approx(0.3333, abs=1e-4)
    assert a[2]["offset"] == pytest.approx(0.0667, abs=1e-4) and a[2]["offset_x"] == pytest.approx(-0.0667, abs=1e-4)


def test_the_worst_arrow_comes_first():
    [group] = compute_arrow_stats(one_session())
    assert [x["number"] for x in group["sets"][0]["arrows"]] == [1, 2, 3, 4, 5, 6]


def test_the_shots_of_several_sessions_are_averaged_and_counted():
    a = arrows(compute_arrow_stats(one_session("s1") + one_session("s2")))
    assert (a[1]["shots"], a[1]["sessions"], a[1]["spread"]) == (2, 2, 0.0)  # the same offset twice: no spread
    wider = [row("s2", 1, 0.4, 0.0)] + [row("s2", n, -0.1, 0.0) for n in range(2, 7)]  # 0.5 apart: arrow 1 is 0.5 * 5/6 = 0.4167 off here
    b = arrows(compute_arrow_stats(one_session("s1") + wider))
    assert b[1]["offset"] == pytest.approx((0.3333 + 0.4167) / 2, abs=1e-3)
    assert b[1]["spread"] == pytest.approx(0.0417, abs=1e-3)  # each offset is 0.0417 from the mean


def test_a_sight_that_is_off_on_one_day_does_not_count_against_an_arrow():
    far_right = [row("s1", n, 0.5, 0.0) for n in range(1, 7)]  # all six arrows 0.5 to the right: a sight problem
    assert all(x["offset"] == 0.0 for x in arrows(compute_arrow_stats(far_right)).values())


def test_unnumbered_arrows_decide_the_centre_but_get_no_entry():
    rows = [row("s1", n, 0.0, 0.0) for n in range(1, 6)] + [row("s1", None, 0.6, 0.0)]
    a = arrows(compute_arrow_stats(rows))
    assert set(a) == {1, 2, 3, 4, 5} and a[1]["offset"] == pytest.approx(0.1)


def test_a_session_with_fewer_than_six_plotted_arrows_is_left_out():
    assert compute_arrow_stats(one_session()[:5]) == []


def test_sessions_without_numbers_give_nothing():
    assert compute_arrow_stats([row("s1", None, 0.1 * n, 0.0) for n in range(6)]) == []


def test_each_arrow_set_face_and_distance_is_its_own_list():
    rows = one_session(set_id=1, name="B set") + one_session("s2", set_id=2, name="A set") + one_session("s3", distance="30.0") + one_session("s4", face="blank")
    groups = compute_arrow_stats(rows)
    assert [(g["face"], g["distance_m"], [s["arrow_set_name"] for s in g["sets"]]) for g in groups] == [
        ("wa-40", "18.0", ["A set", "B set"]),
        ("wa-40", "30.0", ["X10"]),
    ]
    assert groups[0]["radius_cm"] == 20.0


def test_a_session_without_an_arrow_set_is_one_list_of_its_own():
    [group] = compute_arrow_stats(one_session(set_id=None, name=None))
    assert group["sets"][0]["arrow_set"] is None


# --- endpoint --------------------------------------------------------------------------------


def numbered(owner, *, ago=timedelta(days=1)):
    session = TrainingSession.objects.create(id=uuid.uuid4(), owner=owner, started_at=timezone.now() - ago, type="scoring")
    end = End.objects.create(id=uuid.uuid4(), session=session, index=0, distance_m=18, face="wa-40", arrows_per_end=6)
    for i, (x, number) in enumerate([(0.3, 1)] + [(-0.1, n) for n in range(2, 7)]):
        Shot.objects.create(id=uuid.uuid4(), end=end, index=i, x=x, y=0.0, value=9, arrow_number=number)
    return session


def test_the_endpoint_lists_the_arrows_of_an_archer_who_numbers_them(client_for, club):
    numbered(club["archer1"])
    res = client_for(club["archer1"]).get("/api/stats/arrows/")
    assert res.status_code == 200
    [group] = res.data
    assert group["sets"][0]["arrows"][0]["number"] == 1 and group["sets"][0]["arrow_set"] is None


def test_an_archer_without_numbers_gets_an_empty_list(client_for, club):
    assert client_for(club["archer2"]).get("/api/stats/arrows/").data == []


def test_coaches_see_their_archers_others_do_not(client_for, club):
    numbered(club["archer1"])
    assert len(client_for(club["coach"]).get("/api/stats/arrows/", {"owner": club["archer1"].pk}).data) == 1
    for who in ("archer2", "b_admin"):
        assert client_for(club[who]).get("/api/stats/arrows/", {"owner": club["archer1"].pk}).status_code == 404
    assert client_for(club["archer1"]).get("/api/stats/arrows/", {"owner": "x"}).status_code == 400
    assert client_for().get("/api/stats/arrows/").status_code == 401
