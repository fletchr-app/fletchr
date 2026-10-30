import pytest

from core.models import TeamMember
from notes.models import Note
from notes.tests.test_frame_notes import DRAWING, clip_of, frame_note
from privacy.tests.test_media import give
from training.tests.test_overview import make_session


@pytest.fixture
def api(client_for, club):
    return lambda who: client_for(club[who])


def photo_note(api, club, photo, who="coach", about="archer1", **extra):
    body = {"archer": club[about].pk, "body": "Look at the stance", "media": str(photo.pk), **extra}
    return api(who).post("/api/notes/", body, format="json")


def test_a_drawing_on_a_photo_is_accepted(api, club):
    photo = give(club["archer1"], "photo")
    res = photo_note(api, club, photo, drawing=DRAWING)
    assert res.status_code == 201, res.data
    assert (res.data["frame"], res.data["time_ms"]) == (None, None)
    assert res.data["drawing"]["shapes"][0]["c"] == "#ff0000"
    assert res.data["picture"]["kind"] == "photo" and "/thumbnail/?token=" in res.data["picture"]["thumbnail_url"]


def test_a_photo_you_cannot_see_is_refused_like_one_that_does_not_exist(api, club):
    photo = give(club["b_archer"], "photo")
    for about in ("b_archer", "archer1"):
        res = photo_note(api, club, photo, about=about)
        assert res.status_code == 400
    missing = photo_note(api, club, photo, about="archer1", media="00000000-0000-0000-0000-000000000000")
    assert [e.code for e in photo_note(api, club, photo, about="archer1").data["media"]] == [e.code for e in missing.data["media"]]


def test_the_photo_must_be_the_archers(api, club):
    photo = give(club["archer2"], "photo")
    assert photo_note(api, club, photo, about="archer1").status_code == 400


@pytest.mark.parametrize("extra", [{"frame": 0}, {"time_ms": 5}])
def test_a_photo_has_no_frames(api, club, extra):
    photo = give(club["archer1"], "photo")
    res = photo_note(api, club, photo, **extra)
    assert res.status_code == 400 and "frame" in res.data


def test_the_note_takes_the_session_of_the_photo(api, club):
    session = make_session(club["archer1"])
    photo = give(club["archer1"], "photo", session=session)
    assert str(photo_note(api, club, photo).data["session"]) == str(session.pk)


def test_who_sees_a_photo_note(api, club):
    photo = give(club["archer1"], "photo")
    shared = photo_note(api, club, photo, visibility="shared").data["id"]
    photo_note(api, club, photo, visibility="coach_only")
    url = f"/api/notes/?media={photo.pk}"
    assert len(api("coach").get(url).data) == 2
    assert [n["id"] for n in api("archer1").get(url).data] == [shared]
    assert api("archer2").get(url).data == []


def test_archers_cannot_write_a_note_on_the_photo_of_somebody_else(api, club):
    # On their own photo an archer may (private, without a team: test_own_notes.py); on another archer's they cannot even see it.
    photo = give(club["archer2"], "photo")
    assert photo_note(api, club, photo, who="archer1", about="archer2").status_code == 400
    assert photo_note(api, club, photo, who="archer1", about="archer1").status_code == 400


def test_the_author_changes_the_drawing_but_not_the_photo(api, club):
    photo, other = give(club["archer1"], "photo"), give(club["archer1"], "photo")
    note = photo_note(api, club, photo, drawing=DRAWING).data["id"]
    assert api("coach").patch(f"/api/notes/{note}/", {"drawing": None}, format="json").data["drawing"] is None
    assert api("coach").patch(f"/api/notes/{note}/", {"drawing": DRAWING}, format="json").status_code == 200
    assert api("admin").patch(f"/api/notes/{note}/", {"drawing": None}, format="json").status_code == 403
    assert api("coach").patch(f"/api/notes/{note}/", {"media": str(other.pk)}, format="json").status_code == 400


def test_the_notes_go_with_the_photo(api, club):
    photo = give(club["archer1"], "photo")
    note = photo_note(api, club, photo, drawing=DRAWING).data["id"]
    photo.delete()
    assert not Note.objects.filter(pk=note).exists()


def test_the_notes_go_when_the_owner_is_deleted(api, club):
    photo = give(club["archer1"], "photo")
    clip = clip_of(club["archer1"])
    photo_note(api, club, photo)
    frame_note(api, club, clip)
    club["archer1"].delete()
    assert Note.objects.filter(media__in=[photo.pk, clip.pk]).count() == 0


def test_the_picture_is_empty_when_you_may_no_longer_see_the_media(api, club):
    photo = give(club["coach"], "photo")
    TeamMember.objects.filter(user=club["coach"]).update(also_shoots=True)
    note = photo_note(api, club, photo, about="coach", who="admin", visibility="coach_only").data["id"]
    assert api("coach").get(f"/api/notes/{note}/").data["picture"] is not None
    TeamMember.objects.filter(user=club["coach"]).update(also_shoots=False)
    res = api("admin").get(f"/api/notes/{note}/")
    assert res.status_code == 200 and res.data["picture"] is None


def test_a_list_does_not_ask_the_database_per_photo_note(api, club, django_assert_max_num_queries):
    photos = [give(club["archer1"], "photo") for _ in range(6)]
    for photo in photos[:2]:
        photo_note(api, club, photo)
    with django_assert_max_num_queries(12) as few:
        api("coach").get("/api/notes/")
    count = len(few.captured_queries)
    for photo in photos[2:]:
        photo_note(api, club, photo)
    with django_assert_max_num_queries(count):
        assert len(api("coach").get("/api/notes/").data) == 6
