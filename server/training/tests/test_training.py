import logging
import uuid

import pytest

from training.models import End, Shot, TrainingSession, VolumeEntry

SESSION = {"started_at": "2026-10-18T09:00:00Z", "type": "scoring", "environment": "indoor", "location": "Hall"}


def new_id():
    return str(uuid.uuid4())


def shot(x=0.0, y=0.0, **extra):
    return {"id": new_id(), "x": x, "y": y, **extra}


def end_body(shots, index=0, face="wa-40", arrows=3, distance="18.0"):
    return {"index": index, "distance_m": distance, "face": face, "arrows_per_end": arrows, "shots": shots}


@pytest.fixture
def api(client_for, club):
    """Archer1 with a session already created."""
    client = client_for(club["archer1"])
    session_id = new_id()
    assert client.put(f"/api/sessions/{session_id}/", SESSION, format="json").status_code == 201
    return {"client": client, "sid": session_id, "url": f"/api/sessions/{session_id}/"}


def put_end(api, body, end_id=None, client=None):
    end_id = end_id or new_id()
    res = (client or api["client"]).put(f"{api['url']}ends/{end_id}/", body, format="json")
    return end_id, res


# --- sessions ---------------------------------------------------------------------------------


def test_put_creates_then_updates_the_same_session(client_for, club):
    client = client_for(club["archer1"])
    sid = new_id()
    created = client.put(f"/api/sessions/{sid}/", SESSION, format="json")
    again = client.put(f"/api/sessions/{sid}/", {**SESSION, "location": "Outdoors"}, format="json")
    assert (created.status_code, again.status_code) == (201, 200)
    assert created.data["id"] == again.data["id"] == sid
    assert created.data["owner"] == club["archer1"].pk
    assert TrainingSession.objects.get().location == "Outdoors"


def test_session_needs_start_time_and_type(client_for, club):
    res = client_for(club["archer1"]).put(f"/api/sessions/{new_id()}/", {"location": "x"}, format="json")
    assert res.status_code == 400 and {"started_at", "type"} <= set(res.data)


def test_ratings_are_one_to_five(client_for, club):
    client = client_for(club["archer1"])
    assert client.put(f"/api/sessions/{new_id()}/", {**SESSION, "mental_rating": 6}, format="json").status_code == 400
    assert client.put(f"/api/sessions/{new_id()}/", {**SESSION, "mental_rating": 5}, format="json").status_code == 201


def test_cannot_take_over_someone_elses_session_id(client_for, club, api):
    for who, expected in (("archer2", 404), ("b_admin", 404), ("coach", 403)):
        res = client_for(club[who]).put(api["url"], {**SESSION, "location": "Mine"}, format="json")
        assert res.status_code == expected, who
    assert TrainingSession.objects.get().location == "Hall"


def test_finishing_a_session(api):
    res = api["client"].put(api["url"], {**SESSION, "ended_at": "2026-10-18T11:00:00Z"}, format="json")
    assert res.data["ended_at"] == "2026-10-18T11:00:00Z"


def test_delete_session_removes_everything_under_it(api):
    put_end(api, end_body([shot()]))
    api["client"].put(f"{api['url']}volume/{new_id()}/", {"distance_m": "18", "arrow_count": 30}, format="json")
    assert api["client"].delete(api["url"]).status_code == 204
    assert not TrainingSession.objects.exists() and not End.objects.exists()
    assert not Shot.objects.exists() and not VolumeEntry.objects.exists()


# --- ends and scoring ---------------------------------------------------------------------------


def test_server_computes_scores_from_positions(api):
    _, res = put_end(api, end_body([shot(0, 0), shot(0.1001, 0), shot(0.5, 0.5), shot(2, 0)], arrows=6))
    assert res.status_code == 201
    got = [(s["value"], s["is_x"], s["is_miss"], s["is_manual"]) for s in res.data["shots"]]
    # wa-40 (radius 20 cm, no X ring): the centre is a 10, 0.1001 is the 9, (0.5, 0.5) is 14.14 cm out which is
    # past the 4 (14 cm) and inside the 3 (16 cm), and 2.0 is outside the face.
    assert got == [(10, False, False, False), (9, False, False, False), (3, False, False, False), (None, False, True, False)]


def test_wrong_client_score_is_replaced_and_logged(api, caplog):
    with caplog.at_level(logging.WARNING, logger="training.scoring"):
        _, res = put_end(api, end_body([shot(0.1001, 0, value=10)]))
    assert res.data["shots"][0]["value"] == 9
    assert "differs" in caplog.text


def test_matching_client_score_is_not_logged(api, caplog):
    with caplog.at_level(logging.WARNING, logger="training.scoring"):
        put_end(api, end_body([shot(0, 0, value=10)]))
    assert caplog.text == ""


def test_x_on_a_face_with_an_x_ring(api):
    _, res = put_end(api, end_body([shot(0, 0), shot(0.06, 0)], face="wa-122"))
    assert [(s["value"], s["is_x"]) for s in res.data["shots"]] == [(10, True), (10, False)]


def test_repeating_an_end_changes_nothing(api):
    end_id = new_id()
    body = end_body([shot(0, 0), shot(0.3, 0)])
    _, first = put_end(api, body, end_id)
    _, again = put_end(api, body, end_id)
    assert (first.status_code, again.status_code) == (201, 200)
    assert End.objects.count() == 1 and Shot.objects.count() == 2
    assert first.data == again.data


def test_replacing_an_end_is_last_write_wins(api):
    end_id = new_id()
    a, b = shot(0, 0), shot(0.3, 0)
    put_end(api, end_body([a, b]), end_id)
    _, res = put_end(api, end_body([a, shot(0.5, 0)]), end_id)  # b is gone, a stays, a new one is added
    assert res.status_code == 200
    ids = list(Shot.objects.order_by("index").values_list("id", flat=True))
    assert str(ids[0]) == a["id"] and len(ids) == 2 and str(ids[1]) != b["id"]


def test_typed_scores_have_no_position(api):
    body = end_body([{"id": new_id(), "value": 9}, {"id": new_id(), "is_miss": True}, {"id": new_id(), "value": 10, "is_x": True}], face="wa-122")
    _, res = put_end(api, body)
    assert [(s["x"], s["value"], s["is_x"], s["is_miss"], s["is_manual"]) for s in res.data["shots"]] == [
        (None, 9, False, False, True),
        (None, None, False, True, True),
        (None, 10, True, False, True),
    ]


@pytest.mark.parametrize(
    "face, bad",
    [
        ("wa-40", {"value": 11}),  # no such score
        ("wa-40-triple-vertical", {"value": 5}),  # the triple only has 6 to 10
        ("wa-40", {"value": 10, "is_x": True}),  # no X ring on this face
        ("wa-40", {}),  # no score at all
        ("blank", {"value": 5}),  # blank faces need a position
    ],
)
def test_typed_score_must_exist_on_the_face(api, face, bad):
    _, res = put_end(api, end_body([{"id": new_id(), **bad}], face=face))
    assert res.status_code == 400
    assert not Shot.objects.exists()


def test_typed_score_that_exists_is_accepted(api):
    _, res = put_end(api, end_body([{"id": new_id(), "value": 5}], face="wa-40"))
    assert res.status_code == 201


def test_blank_face_stores_positions_without_scores(api):
    _, res = put_end(api, end_body([shot(0.3, 0.2)], face="blank"))
    s = res.data["shots"][0]
    assert (s["value"], s["is_miss"], s["x"]) == (None, False, 0.3)


def test_multi_spot_faces(api):
    _, ok = put_end(api, end_body([shot(0, 0, spot=2)], face="wa-40-triple-vertical"))
    assert ok.status_code == 201 and ok.data["shots"][0]["spot"] == 2
    _, bad = put_end(api, end_body([shot(0, 0, spot=3)], face="wa-40-triple-vertical", index=1))
    assert bad.status_code == 400
    _, single = put_end(api, end_body([shot(0, 0, spot=1)], face="wa-40", index=2))
    assert single.status_code == 400


@pytest.mark.parametrize(
    "body",
    [
        end_body([shot()], face="nonsense"),
        end_body([shot(), shot(), shot(), shot()], arrows=3),
        end_body([{"id": new_id(), "x": 0.1, "value": 9}]),  # x without y
        end_body([shot(50, 50)]),  # absurd position
        end_body([shot()], arrows=0),
        end_body([shot()], distance="-5"),
    ],
)
def test_invalid_ends_are_rejected(api, body):
    _, res = put_end(api, body)
    assert res.status_code == 400
    assert not End.objects.exists()


def test_duplicate_shot_ids_and_indexes_are_rejected(api):
    s = shot()
    assert put_end(api, end_body([s, s]))[1].status_code == 400
    put_end(api, end_body([shot()], index=0))
    assert put_end(api, end_body([shot()], index=0))[1].status_code == 400  # another end, same index


def test_ids_cannot_be_borrowed_from_another_session_or_end(client_for, club, api):
    s = shot()
    end_id, _ = put_end(api, end_body([s]))
    other = new_id()
    client_for(club["archer1"]).put(f"/api/sessions/{other}/", SESSION, format="json")
    other_api = {"client": api["client"], "url": f"/api/sessions/{other}/"}
    assert put_end(other_api, end_body([shot()]), end_id)[1].status_code == 400  # end id used elsewhere
    assert put_end(other_api, end_body([s]))[1].status_code == 400  # shot id used elsewhere


def test_delete_end(api):
    end_id, _ = put_end(api, end_body([shot()]))
    assert api["client"].delete(f"{api['url']}ends/{end_id}/").status_code == 204
    assert api["client"].delete(f"{api['url']}ends/{end_id}/").status_code == 404
    assert not Shot.objects.exists()


def test_volume_entries(api):
    entry = new_id()
    url = f"{api['url']}volume/{entry}/"
    assert api["client"].put(url, {"distance_m": "18", "arrow_count": 30}, format="json").status_code == 201
    assert api["client"].put(url, {"distance_m": "18", "arrow_count": 36}, format="json").status_code == 200
    assert VolumeEntry.objects.get().arrow_count == 36
    assert api["client"].put(url, {"distance_m": "18", "arrow_count": 0}, format="json").status_code == 400
    assert api["client"].delete(url).status_code == 204


# --- who sees what ------------------------------------------------------------------------------


def test_coach_sees_the_end_as_soon_as_it_is_uploaded(client_for, club, api):
    coach = client_for(club["coach"])
    before = coach.get("/api/sessions/").data[0]
    assert (before["ends"], before["scored_arrows"], before["score_total"]) == (0, 0, 0)
    put_end(api, end_body([shot(0, 0), shot(0.15, 0), shot(2, 0)]))
    after = coach.get("/api/sessions/").data[0]
    assert (after["ends"], after["scored_arrows"], after["score_total"]) == (1, 3, 10 + 9 + 0)
    detail = coach.get(api["url"]).data
    assert len(detail["ends"][0]["shots"]) == 3
    assert after["updated_at"] > before["updated_at"]


def test_summary_totals_add_up_over_ends_and_volume(client_for, club, api):
    put_end(api, end_body([shot(0, 0), shot(0, 0)]), None)
    put_end(api, end_body([shot(0.15, 0)], index=1))
    api["client"].put(f"{api['url']}volume/{new_id()}/", {"distance_m": "18", "arrow_count": 30}, format="json")
    api["client"].put(f"{api['url']}volume/{new_id()}/", {"distance_m": "30", "arrow_count": 12}, format="json")
    row = api["client"].get("/api/sessions/").data[0]
    assert (row["ends"], row["scored_arrows"], row["score_total"], row["volume_arrows"]) == (2, 3, 29, 42)


@pytest.mark.parametrize("who", ["coach", "admin"])
def test_coaches_read_but_do_not_write(client_for, club, api, who):
    end_id, _ = put_end(api, end_body([shot()]))
    client = client_for(club[who])
    assert client.get(api["url"]).status_code == 200
    assert len(client.get("/api/sessions/").data) == 1
    assert put_end(api, end_body([shot()], index=1), client=client)[1].status_code == 403
    assert put_end(api, end_body([]), end_id, client=client)[1].status_code == 403
    assert client.delete(f"{api['url']}ends/{end_id}/").status_code == 403
    assert client.delete(api["url"]).status_code == 403
    assert client.put(f"{api['url']}volume/{new_id()}/", {"distance_m": "18", "arrow_count": 3}, format="json").status_code == 403
    assert Shot.objects.count() == 1


@pytest.mark.parametrize("who", ["archer2", "b_admin", "b_archer"])
def test_others_see_nothing(client_for, club, api, who):
    end_id, _ = put_end(api, end_body([shot()]))
    client = client_for(club[who])
    assert client.get("/api/sessions/").data == []
    assert client.get(api["url"]).status_code == 404
    assert put_end(api, end_body([shot()], index=1), client=client)[1].status_code == 404
    assert client.delete(f"{api['url']}ends/{end_id}/").status_code == 404
    assert client.delete(api["url"]).status_code == 404


def test_list_filters(client_for, club, api):
    client_for(club["archer2"]).put(f"/api/sessions/{new_id()}/", {**SESSION, "type": "volume"}, format="json")
    coach = client_for(club["coach"])
    assert len(coach.get("/api/sessions/").data) == 2
    assert len(coach.get("/api/sessions/", {"owner": club["archer2"].pk}).data) == 1
    assert len(coach.get("/api/sessions/", {"type": "volume"}).data) == 1
    assert len(coach.get("/api/sessions/", {"started_after": "2026-10-19T00:00:00Z"}).data) == 0
    assert len(coach.get("/api/sessions/", {"started_before": "2026-10-19T00:00:00Z"}).data) == 2


@pytest.mark.parametrize("url", ["/api/sessions/", f"/api/sessions/{uuid.uuid4()}/"])
def test_login_required(client_for, db, url):
    assert client_for().get(url).status_code == 401


# --- the archer's notes on a session (weather, ratings, goals, notes) ---------------------------------------------


DETAILS = {"weather": "sunny,wind;15 °C", "physical_rating": 4, "mental_rating": 3, "goals": "Anchor point", "notes": "Felt steady"}


def test_the_notes_of_a_session_are_saved_and_read_back(api):
    res = api["client"].put(api["url"], {**SESSION, **DETAILS}, format="json")
    assert res.status_code == 200
    got = api["client"].get(api["url"]).data
    assert {k: got[k] for k in DETAILS} == DETAILS


def test_an_upload_without_the_notes_keeps_them(api):
    api["client"].put(api["url"], {**SESSION, **DETAILS}, format="json")
    api["client"].put(api["url"], {**SESSION, "location": "Field"}, format="json")  # what the app sends before the archer wrote any
    got = api["client"].get(api["url"]).data
    assert got["location"] == "Field" and got["notes"] == "Felt steady" and got["physical_rating"] == 4


@pytest.mark.parametrize("rating", [0, 6, -1])
def test_a_rating_must_be_from_1_to_5(api, rating):
    res = api["client"].put(api["url"], {**SESSION, "physical_rating": rating}, format="json")
    assert res.status_code == 400 and "physical_rating" in res.data


def test_a_rating_can_be_cleared(api):
    api["client"].put(api["url"], {**SESSION, **DETAILS}, format="json")
    api["client"].put(api["url"], {**SESSION, "physical_rating": None}, format="json")
    assert api["client"].get(api["url"]).data["physical_rating"] is None


def test_the_coach_of_the_archer_reads_the_notes_too(api, client_for, club):
    api["client"].put(api["url"], {**SESSION, **DETAILS}, format="json")
    got = client_for(club["coach"]).get(api["url"]).data
    assert got["notes"] == "Felt steady" and got["weather"] == "sunny,wind;15 °C"


# --- numbered arrows -------------------------------------------------------------------------------------------------


def test_the_arrow_number_of_a_shot_is_kept(api):
    body = end_body([shot(0.0, 0.0, arrow_number=4), shot(0.1, 0.0, arrow_number=5), shot(0.2, 0.0)])
    _, res = put_end(api, body)
    assert res.status_code in (200, 201)
    got = api["client"].get(api["url"]).data["ends"][0]["shots"]
    assert [s["arrow_number"] for s in got] == [4, 5, None]


@pytest.mark.parametrize("number", [0, 100, -3])
def test_an_arrow_number_must_be_from_1_to_99(api, number):
    _, res = put_end(api, end_body([shot(arrow_number=number)]))
    assert res.status_code == 400


def test_the_number_can_be_taken_away_again(api):
    end_id = new_id()
    put_end(api, end_body([{"id": "11111111-1111-1111-1111-111111111111", "x": 0.0, "y": 0.0, "arrow_number": 3}]), end_id=end_id)
    put_end(api, end_body([{"id": "11111111-1111-1111-1111-111111111111", "x": 0.0, "y": 0.0, "arrow_number": None}]), end_id=end_id)
    assert api["client"].get(api["url"]).data["ends"][0]["shots"][0]["arrow_number"] is None
