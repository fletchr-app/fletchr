"""What phones read to drop copies of photos, videos and notes (#84), and the stamps they pull by."""

import uuid
from datetime import timedelta

import pytest
from django.utils import timezone

from core.models import Tombstone
from media.models import Media
from media.tests.test_media import photo, put
from notes.models import Note
from training.tests.test_overview import make_session


@pytest.fixture
def api(client_for, club):
    return lambda who: client_for(club[who])


def stamp(when):
    """As the app sends it; a `+` in a query string would be read as a space."""
    return when.isoformat().replace("+00:00", "Z")


def gone(client, query=""):
    res = client.get(f"/api/gone/{query}")
    assert res.status_code == 200, res.data
    return [(g["kind"], str(g["uid"])) for g in res.data]


def own_note(api, club, **extra):
    body = {"archer": club["archer1"].pk, "body": "Stand wider", **extra}
    res = api("archer1").put(f"/api/notes/{uuid.uuid4()}/", body, format="json")
    assert res.status_code == 201, res.data
    return res.data


def coach_note(api, club, **extra):
    res = api("coach").post("/api/notes/", {"archer": club["archer1"].pk, "body": "Elbow", **extra}, format="json")
    assert res.status_code == 201, res.data
    return res.data


# --- media ---------------------------------------------------------------------------------------


def test_deleting_a_clip_leaves_a_tombstone_for_its_owner_only(api, club):
    clip = put(api("archer1"), photo()).data["id"]
    assert api("archer1").delete(f"/api/media/{clip}/").status_code == 204
    assert gone(api("archer1")) == [("media", clip)]
    assert gone(api("coach")) == []
    assert gone(api("archer2")) == []


def test_a_clip_deleted_by_the_archer_that_a_coach_added_is_gone_for_the_archer(api, club):
    clip = put(api("coach"), photo(), owner=club["archer1"]).data["id"]
    api("archer1").delete(f"/api/media/{clip}/")
    assert gone(api("archer1")) == [("media", clip)]
    assert gone(api("coach")) == []


def test_deleting_the_clip_also_tells_about_its_notes(api, club):
    clip = put(api("archer1"), photo()).data["id"]
    mine = own_note(api, club, media=clip)
    shared = coach_note(api, club, media=clip, visibility="shared")
    api("archer1").delete(f"/api/media/{clip}/")
    assert set(gone(api("archer1"))) == {("media", clip), ("note", str(mine["uid"])), ("note", str(shared["uid"]))}
    assert ("note", str(shared["uid"])) in gone(api("coach"))
    assert ("note", str(mine["uid"])) not in gone(api("coach"))


def test_a_clip_has_a_stamp_that_moves_with_a_note_or_a_session(api, club):
    clip = put(api("archer1"), photo()).data
    assert clip["updated_at"]
    before = timezone.now()
    Media.objects.filter(pk=clip["id"]).update(updated_at=before - timedelta(days=1))

    def changed():
        return [m["id"] for m in api("archer1").get(f"/api/media/?updated_after={stamp(before - timedelta(hours=1))}").data]

    assert changed() == []
    assert put(api("archer1"), {"note": "slow"}, clip["id"]).status_code == 200
    assert changed() == [clip["id"]]

    Media.objects.filter(pk=clip["id"]).update(updated_at=before - timedelta(days=1))
    session = make_session(club["archer1"])
    put(api("archer1"), {"session": str(session.pk)}, clip["id"])
    assert changed() == [clip["id"]]


def test_deleting_the_session_changes_the_stamp_of_its_clips(api, club):
    session = make_session(club["archer1"])
    clip = put(api("archer1"), photo(session=str(session.pk))).data["id"]
    Media.objects.filter(pk=clip).update(updated_at=timezone.now() - timedelta(days=1))
    cut = stamp(timezone.now() - timedelta(hours=1))
    assert api("archer1").get(f"/api/media/?updated_after={cut}").data == []
    assert api("archer1").delete(f"/api/sessions/{session.pk}/").status_code == 204
    res = api("archer1").get(f"/api/media/?updated_after={cut}")
    assert [(m["id"], m["session"]) for m in res.data] == [(clip, None)]


# --- notes ---------------------------------------------------------------------------------------


def test_deleting_my_own_note_leaves_a_tombstone_for_me(api, club):
    note = own_note(api, club)
    assert api("archer1").delete(f"/api/notes/{note['id']}/").status_code == 204
    assert gone(api("archer1")) == [("note", str(note["uid"]))]
    assert gone(api("coach")) == []


def test_a_coach_note_is_gone_for_the_coach_and_for_the_archer_if_it_was_shared(api, club):
    private = coach_note(api, club, visibility="coach_only")
    shared = coach_note(api, club, visibility="shared")
    api("coach").delete(f"/api/notes/{private['id']}/")
    api("coach").delete(f"/api/notes/{shared['id']}/")
    assert gone(api("archer1")) == [("note", str(shared["uid"]))]
    assert set(gone(api("coach"))) == {("note", str(private["uid"])), ("note", str(shared["uid"]))}


def test_a_note_no_longer_shared_is_gone_for_the_archer(api, club):
    note = coach_note(api, club, visibility="shared")
    assert gone(api("archer1")) == []
    assert api("coach").patch(f"/api/notes/{note['id']}/", {"visibility": "coach_only"}, format="json").status_code == 200
    assert gone(api("archer1")) == [("note", str(note["uid"]))]
    assert gone(api("coach")) == []


def test_notes_can_be_listed_by_change(api, club):
    old = own_note(api, club)
    Note.objects.filter(pk=old["id"]).update(updated_at=timezone.now() - timedelta(days=1))
    new = own_note(api, club)
    cut = stamp(timezone.now() - timedelta(hours=1))
    assert [n["id"] for n in api("archer1").get(f"/api/notes/?updated_after={cut}").data] == [new["id"]]


# --- the list ------------------------------------------------------------------------------------


def test_the_list_is_filtered_by_kind_and_time_and_oldest_first(api, club):
    owner = club["archer1"]
    long_ago = timezone.now() - timedelta(days=2)
    Tombstone.objects.create(kind="media", uid=uuid.uuid4(), owner=owner, at=long_ago)
    note, clip = uuid.uuid4(), uuid.uuid4()
    Tombstone.objects.create(kind="note", uid=note, owner=owner, at=long_ago + timedelta(hours=1))
    Tombstone.objects.create(kind="media", uid=clip, owner=owner, at=long_ago + timedelta(hours=2))
    cut = stamp(long_ago + timedelta(minutes=30))
    assert gone(api("archer1"), f"?updated_after={cut}") == [("note", str(note)), ("media", str(clip))]
    assert gone(api("archer1"), f"?updated_after={cut}&kind=media") == [("media", str(clip))]


def test_the_list_needs_a_sign_in(client):
    assert client.get("/api/gone/").status_code == 401
