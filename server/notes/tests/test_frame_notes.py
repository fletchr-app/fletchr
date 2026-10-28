import pytest

from media.models import Media
from notes.models import Note
from privacy.tests.test_media import give
from training.tests.test_overview import make_session


@pytest.fixture
def api(client_for, club):
    return lambda who: client_for(club[who])


def frame_note(api, club, clip, who="coach", about="archer1", **extra):
    body = {"archer": club[about].pk, "body": "Elbow drops here", "media": str(clip.pk), "frame": 143, "time_ms": 1192, **extra}
    return api(who).post("/api/notes/", body, format="json")


def clip_of(owner, **extra):
    clip = give(owner, "video")
    Media.objects.filter(pk=clip.pk).update(frame_count=240, **extra)
    clip.refresh_from_db()
    return clip


def test_a_note_keeps_the_clip_the_frame_and_the_time(api, club):
    clip = clip_of(club["archer1"])
    res = frame_note(api, club, clip)
    assert res.status_code == 201, res.data
    assert (str(res.data["media"]), res.data["frame"], res.data["time_ms"]) == (str(clip.pk), 143, 1192)


def test_the_notes_of_a_clip_can_be_listed_and_the_visibility_rules_stay(api, club):
    clip = clip_of(club["archer1"])
    shared = frame_note(api, club, clip, visibility="shared").data["id"]
    private = frame_note(api, club, clip, visibility="coach_only").data["id"]
    other = clip_of(club["archer1"])
    frame_note(api, club, other, visibility="shared")
    url = f"/api/notes/?media={clip.pk}"
    assert {n["id"] for n in api("coach").get(url).data} == {shared, private}
    assert {n["id"] for n in api("archer1").get(url).data} == {shared}  # what the coach keeps from the archer stays hidden
    assert api("archer2").get(url).data == []


def test_the_note_takes_the_session_of_the_clip(api, club):
    session = make_session(club["archer1"])
    clip = clip_of(club["archer1"], session=session)
    assert str(frame_note(api, club, clip).data["session"]) == str(session.pk)


def test_a_clip_of_another_session_does_not_fit(api, club):
    one, two = make_session(club["archer1"]), make_session(club["archer1"])
    clip = clip_of(club["archer1"], session=one)
    assert frame_note(api, club, clip, session=str(two.pk)).status_code == 400


def test_the_clip_must_be_the_archers(api, club):
    clip = clip_of(club["archer2"])
    assert frame_note(api, club, clip, about="archer1").status_code == 400


@pytest.mark.parametrize("extra", [{"frame": None}, {"frame": 240}, {"frame": -1}])
def test_the_frame_must_exist(api, club, extra):
    clip = clip_of(club["archer1"])
    assert frame_note(api, club, clip, **extra).status_code == 400


def test_a_frame_needs_a_clip(api, club):
    res = api("coach").post("/api/notes/", {"archer": club["archer1"].pk, "body": "x", "frame": 3}, format="json")
    assert res.status_code == 400 and "media" in res.data


def test_the_clip_and_the_frame_cannot_change_but_the_text_can(api, club):
    clip = clip_of(club["archer1"])
    note = frame_note(api, club, clip).data["id"]
    assert api("coach").patch(f"/api/notes/{note}/", {"frame": 5}, format="json").status_code == 400
    assert api("coach").patch(f"/api/notes/{note}/", {"body": "Better"}, format="json").status_code == 200


def test_the_note_is_deleted_with_the_clip(api, club):
    clip = clip_of(club["archer1"])
    note = frame_note(api, club, clip).data["id"]
    clip.delete()
    assert not Note.objects.filter(pk=note).exists()


def test_the_export_has_the_frame(client_for, club):
    from privacy.tests.test_delete_data import PASSWORD

    clip = clip_of(club["archer1"])
    frame_note(lambda w: client_for(club[w]), club, clip, visibility="shared")
    d = client_for(club["archer1"]).post("/api/me/export/", {"password": PASSWORD}, format="json").json()
    assert [(n["media"], n["frame"], n["time_ms"]) for n in d["notes_about_me"]] == [(str(clip.pk), 143, 1192)]


# --- drawings -----------------------------------------------------------------------------------

DRAWING = {"v": 1, "shapes": [{"t": "line", "p": [[0.1, 0.2], [0.9, 0.3]], "c": "#FF0000"}, {"t": "angle", "p": [[0.2, 0.2], [0.5, 0.5], [0.8, 0.4]]}, {"t": "circle", "p": [[0.5, 0.5], [0.6, 0.5]]}]}


def test_a_drawing_is_saved_with_the_note_and_comes_back_the_same(api, club):
    clip = clip_of(club["archer1"])
    res = frame_note(api, club, clip, drawing=DRAWING, visibility="shared")
    assert res.status_code == 201, res.data
    assert res.data["drawing"]["shapes"][0] == {"t": "line", "p": [[0.1, 0.2], [0.9, 0.3]], "c": "#ff0000"}
    assert api("archer1").get(f"/api/notes/{res.data['id']}/").data["drawing"] == res.data["drawing"]  # the archer sees it too


def test_the_author_can_change_and_remove_the_drawing(api, club):
    clip = clip_of(club["archer1"])
    note = frame_note(api, club, clip, drawing=DRAWING).data["id"]
    one = {"v": 1, "shapes": [DRAWING["shapes"][1]]}
    assert api("coach").patch(f"/api/notes/{note}/", {"drawing": one}, format="json").data["drawing"]["shapes"][0]["t"] == "angle"
    assert api("coach").patch(f"/api/notes/{note}/", {"drawing": None}, format="json").data["drawing"] is None
    assert api("admin").patch(f"/api/notes/{note}/", {"drawing": one}, format="json").status_code == 403  # only the author edits


def test_a_drawing_needs_a_picture(api, club):
    res = api("coach").post("/api/notes/", {"archer": club["archer1"].pk, "body": "x", "drawing": DRAWING}, format="json")
    assert res.status_code == 400 and "drawing" in res.data


@pytest.mark.parametrize(
    "bad",
    [
        "x", {"v": 2, "shapes": []}, {"v": 1}, {"v": 1, "shapes": "x"},
        {"v": 1, "shapes": [{"t": "star", "p": [[0, 0], [1, 1]]}]},
        {"v": 1, "shapes": [{"t": "line", "p": [[0, 0]]}]},
        {"v": 1, "shapes": [{"t": "line", "p": [[0, 0], [1, 1.5]]}]},
        {"v": 1, "shapes": [{"t": "line", "p": [[0, 0], ["a", 1]]}]},
        {"v": 1, "shapes": [{"t": "line", "p": [[0, 0], [True, 1]]}]},
        {"v": 1, "shapes": [{"t": "line", "p": [[0, 0], [1, 1]], "c": "red"}]},
        {"v": 1, "shapes": [{"t": "line", "p": [[0, 0], [1, 1]]}] * 41},
    ],
)
def test_a_wrong_drawing_is_refused(api, club, bad):
    clip = clip_of(club["archer1"])
    assert frame_note(api, club, clip, drawing=bad).status_code == 400


def test_no_drawing_is_fine(api, club):
    clip = clip_of(club["archer1"])
    assert frame_note(api, club, clip).data["drawing"] is None
