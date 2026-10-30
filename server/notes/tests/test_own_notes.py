import uuid

import pytest
from rest_framework.test import APIClient

from notes.models import Note
from notes.tests.test_notes import api, write  # noqa: F401  (the `api` fixture)
from privacy.tests.test_media import give
from training.tests.test_overview import make_session

OWN = {"who": "archer1", "about": "archer1"}


def own(api, club, **extra):  # noqa: F811
    return write(api, club, **OWN, **extra)


# --- a note about yourself ----------------------------------------------------------------------


def test_an_archer_can_write_a_private_note_about_their_own_training(api, club):  # noqa: F811
    res = own(api, club)
    assert res.status_code == 201, res.data
    assert (res.data["team"], res.data["visibility"], res.data["author"], res.data["archer"]) == (None, "private", club["archer1"].pk, club["archer1"].pk)
    assert res.data["can_edit"] and res.data["can_delete"]
    assert Note.objects.get().team is None


def test_nobody_else_can_read_it(api, club):  # noqa: F811
    note = own(api, club).data
    for who in ("coach", "admin", "archer2", "b_admin", "b_archer"):
        assert api(who).get("/api/notes/").data == [], who
        assert api(who).get(f"/api/notes/{note['id']}/").status_code == 404, who
    assert [n["id"] for n in api("archer1").get("/api/notes/").data] == [note["id"]]


def test_it_cannot_be_given_a_team_or_shared(api, club):  # noqa: F811
    assert own(api, club, team=club["a"].pk).status_code == 400
    assert own(api, club, visibility="shared").status_code == 400
    assert own(api, club, visibility="coach_only").status_code == 400
    assert own(api, club, visibility="private").status_code == 201
    assert Note.objects.count() == 1


def test_it_cannot_be_shared_later(api, club):  # noqa: F811
    note = own(api, club).data
    res = api("archer1").patch(f"/api/notes/{note['id']}/", {"visibility": "shared"}, format="json")
    assert res.status_code == 400
    assert api("archer1").patch(f"/api/notes/{note['id']}/", {"body": "Changed"}, format="json").status_code == 200


def test_it_can_be_about_your_session_and_photo_not_somebody_elses(api, club):  # noqa: F811
    mine, theirs = make_session(club["archer1"]), make_session(club["archer2"])
    assert own(api, club, session=str(mine.pk)).status_code == 201
    assert own(api, club, session=str(theirs.pk)).status_code == 400
    photo = give(club["archer1"], "photo")
    assert own(api, club, media=str(photo.pk)).status_code == 201
    assert own(api, club, media=str(give(club["archer2"], "photo").pk)).status_code == 400


def test_it_can_be_deleted_by_its_author(api, club):  # noqa: F811
    note = own(api, club).data
    assert api("archer1").delete(f"/api/notes/{note['id']}/").status_code == 204
    assert Note.objects.count() == 0


def test_coach_notes_still_need_a_team_you_coach_them_in(api, club):  # noqa: F811
    assert write(api, club, who="archer2", about="archer1").status_code == 403  # an archer cannot write about somebody else
    res = write(api, club)
    assert res.status_code == 201 and res.data["team"] == club["a"].pk and res.data["visibility"] == "coach_only"


# --- PUT by uid ---------------------------------------------------------------------------------


def put(api, club, uid, who="coach", about="archer1", **extra):  # noqa: F811
    return api(who).put(f"/api/notes/{uid}/", {"archer": club[about].pk, "body": "Watch the bow arm", **extra}, format="json")


def test_put_creates_a_note_by_the_uid_of_the_app(api, club):  # noqa: F811
    uid = uuid.uuid4()
    res = put(api, club, uid)
    assert res.status_code == 201, res.data
    assert res.data["uid"] == str(uid) and res.data["team"] == club["a"].pk
    note = Note.objects.get()
    assert (note.uid, note.author) == (uid, club["coach"])


def test_repeating_the_put_changes_and_creates_nothing_new(api, club):  # noqa: F811
    uid = uuid.uuid4()
    first = put(api, club, uid).data
    res = put(api, club, uid)
    assert res.status_code == 200 and res.data["id"] == first["id"]
    assert Note.objects.count() == 1


def test_put_changes_the_body_but_not_what_the_note_is_about(api, club):  # noqa: F811
    uid = uuid.uuid4()
    put(api, club, uid)
    assert put(api, club, uid, body="Better").data["body"] == "Better"
    assert put(api, club, uid, about="archer2").status_code == 400
    assert Note.objects.get().body == "Better"


def test_put_for_a_note_about_yourself(api, club):  # noqa: F811
    uid = uuid.uuid4()
    res = put(api, club, uid, who="archer1", about="archer1")
    assert res.status_code == 201 and res.data["team"] is None and res.data["visibility"] == "private"
    assert put(api, club, uid, who="archer1", about="archer1", body="Again").status_code == 200
    assert Note.objects.count() == 1


def test_a_note_of_somebody_else_is_not_found_and_stays_as_it_was(api, club):  # noqa: F811
    uid = uuid.uuid4()
    put(api, club, uid)
    for who in ("admin", "archer1", "archer2", "b_admin"):
        assert put(api, club, uid, who=who, body="Mine now").status_code == 404, who
    assert Note.objects.get().body == "Watch the bow arm"


def test_a_photo_the_server_has_not_seen_is_a_400_on_media(api, club):  # noqa: F811
    res = put(api, club, uuid.uuid4(), media=str(uuid.uuid4()))
    assert res.status_code == 400 and "media" in res.data
    assert Note.objects.count() == 0


def test_put_keeps_the_rules_of_post(api, club):  # noqa: F811
    assert put(api, club, uuid.uuid4(), who="archer2", about="archer1").status_code == 403
    assert put(api, club, uuid.uuid4(), who="b_admin", about="archer1").status_code in (400, 403)
    assert put(api, club, uuid.uuid4(), body="  ").status_code == 400
    assert Note.objects.count() == 0


def test_put_needs_a_login(api, club):  # noqa: F811
    res = APIClient().put(f"/api/notes/{uuid.uuid4()}/", {"archer": club["archer1"].pk, "body": "x"}, format="json")
    assert res.status_code == 401


def test_the_integer_routes_still_work(api, club):  # noqa: F811
    note = write(api, club).data
    assert api("coach").get(f"/api/notes/{note['id']}/").status_code == 200


def test_the_export_has_a_note_about_yourself_without_a_team(api, club):  # noqa: F811
    from privacy.export import export_user_data

    own(api, club, body="Anchor point felt different today")
    data = export_user_data(club["archer1"])
    assert [(n["team"], n["visibility"]) for n in data["notes_i_wrote"]] == [(None, "private")]
    assert data["notes_about_me"] == []  # private ones are left out of this list: it is in "notes_i_wrote"
