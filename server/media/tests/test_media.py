import uuid
from pathlib import Path

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from core.access import archers_visible_to  # noqa: F401
from core.models import Role, TeamMember, User
from media.files import sign_link
from media.models import Media
from training.tests.test_overview import make_session

MP4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 2000
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 500


@pytest.fixture
def api(client_for, club):
    return lambda who: client_for(club[who])


def video(**extra):
    return {
        "kind": "video", "file": SimpleUploadedFile("a.mp4", MP4), "thumbnail": SimpleUploadedFile("t.jpg", JPEG),
        "taken_at": "2026-10-24T10:00:00Z", "width": 1280, "height": 720, "duration_ms": 8000, "capture_fps": 120, "frame_count": 872, **extra,
    }


def photo(**extra):
    return {
        "kind": "photo", "file": SimpleUploadedFile("a.jpg", JPEG), "thumbnail": SimpleUploadedFile("t.jpg", JPEG),
        "taken_at": "2026-10-24T10:00:00Z", "width": 1920, "height": 1080, **extra,
    }


def put(client, data, media_id=None, owner=None):
    media_id = media_id or uuid.uuid4()
    query = f"?owner={owner.pk}" if owner else ""
    return client.put(f"/api/media/{media_id}/{query}", data, format="multipart")


def upload(api, who="archer1", **extra):
    res = put(api(who), video(**extra))
    assert res.status_code == 201, res.data
    return res.data


def body(response):
    return b"".join(response.streaming_content)


# --- uploading ----------------------------------------------------------------------------------


def test_an_archer_uploads_a_video(api, club):
    data = upload(api)
    assert data["owner"] == club["archer1"].pk and data["uploaded_by"] == club["archer1"].pk
    assert data["kind"] == "video" and data["duration_ms"] == 8000 and data["capture_fps"] == 120 and data["frame_count"] == 872
    assert data["size"] == len(MP4) + len(JPEG) and data["can_edit"] is True and data["owner_name"] == "archer1"
    media = Media.objects.get(pk=data["id"])
    assert Path(media.file.path).read_bytes() == MP4 and Path(media.thumbnail.path).read_bytes() == JPEG
    assert media.file.name == f"{club['archer1'].pk}/{media.pk}.mp4"


def test_a_photo_has_no_video_fields(api, club):
    res = put(api("archer1"), photo(duration_ms=5000, capture_fps=30))
    assert res.status_code == 201, res.data
    assert res.data["duration_ms"] is None and res.data["capture_fps"] is None and res.data["frame_count"] is None
    assert Media.objects.get().file.name.endswith(".jpg")


def test_repeating_an_upload_does_not_make_a_second_clip_or_replace_the_files(api, club):
    media_id = uuid.uuid4()
    assert put(api("archer1"), video(), media_id).status_code == 201
    before = Path(Media.objects.get().file.path).stat().st_mtime_ns
    res = put(api("archer1"), video(note="Good one"), media_id)
    assert res.status_code == 200 and res.data["note"] == "Good one"
    assert Media.objects.count() == 1 and Path(Media.objects.get().file.path).stat().st_mtime_ns == before


def test_a_repeat_can_change_only_the_note_and_the_session(api, club):
    media_id = uuid.uuid4()
    session = make_session(club["archer1"])
    put(api("archer1"), video(), media_id)
    res = put(api("archer1"), {"note": "x", "session": str(session.pk), "width": 5, "kind": "photo"}, media_id)
    assert res.status_code == 200 and res.data["session"] == session.pk
    assert res.data["width"] == 1280 and res.data["kind"] == "video"
    assert put(api("archer1"), {"session": ""}, media_id).data["session"] is None


def test_the_session_must_be_the_archers(api, club):
    other = make_session(club["archer2"])
    res = put(api("archer1"), video(session=str(other.pk)))
    assert res.status_code == 400 and "session" in res.data
    assert not Media.objects.exists()


def test_the_clip_stays_when_its_session_goes(api, club):
    session = make_session(club["archer1"])
    data = upload(api, session=str(session.pk))
    session.delete()
    assert Media.objects.get(pk=data["id"]).session is None


@pytest.mark.parametrize("missing", ["kind", "file", "thumbnail", "taken_at", "width", "height"])
def test_a_new_clip_needs_its_fields(api, missing):
    data = video()
    del data[missing]
    res = put(api("archer1"), data)
    assert res.status_code == 400 and missing in res.data


def test_a_video_needs_a_duration(api):
    data = video()
    del data["duration_ms"]
    assert "duration_ms" in put(api("archer1"), data).data


def test_the_file_type_is_checked_by_its_content(api):
    assert "file" in put(api("archer1"), video(file=SimpleUploadedFile("a.mp4", JPEG))).data
    assert "file" in put(api("archer1"), photo(file=SimpleUploadedFile("a.jpg", MP4))).data
    assert "thumbnail" in put(api("archer1"), video(thumbnail=SimpleUploadedFile("t.jpg", MP4))).data
    assert not Media.objects.exists()


def test_the_limits(api, settings):
    settings.MEDIA_MAX_VIDEO_SECONDS = 10
    settings.MEDIA_MAX_VIDEO_BYTES = len(MP4) - 1
    settings.MEDIA_MAX_PHOTO_BYTES = len(JPEG) - 1
    settings.MEDIA_MAX_THUMBNAIL_BYTES = len(JPEG) - 1
    assert "file" in put(api("archer1"), video()).data
    settings.MEDIA_MAX_VIDEO_BYTES = len(MP4)
    assert "duration_ms" in put(api("archer1"), video(duration_ms=10_001)).data
    assert put(api("archer1"), video(duration_ms=10_000)).status_code == 400, "the preview is too large"
    assert "file" in put(api("archer1"), photo()).data
    assert not Media.objects.exists()


def test_the_quota_is_per_archer(api, settings):
    settings.MEDIA_QUOTA_BYTES = 2 * (len(MP4) + len(JPEG))
    upload(api)
    upload(api)
    res = put(api("archer1"), video())
    assert res.status_code == 400 and "no room" in str(res.data)
    upload(api, "archer2")  # the quota is not shared


def test_nothing_without_signing_in(client_for):
    assert put(client_for(), video()).status_code == 401
    assert client_for().get("/api/media/").status_code == 401


# --- who may see and change ---------------------------------------------------------------------


def test_the_coach_sees_the_clips_of_their_archers_and_the_archer_their_own(api, club):
    clip = upload(api)["id"]
    assert [m["id"] for m in api("archer1").get("/api/media/").data] == [clip]
    assert [m["id"] for m in api("coach").get("/api/media/").data] == [clip]
    assert [m["id"] for m in api("admin").get("/api/media/").data] == [clip]
    assert api("coach").get(f"/api/media/{clip}/").status_code == 200


def test_nobody_else_sees_them(api, club):
    clip = upload(api)["id"]
    for who in ["archer2", "b_admin", "b_archer"]:
        assert api(who).get("/api/media/").data == [], who
        assert api(who).get(f"/api/media/{clip}/").status_code == 404, who
        assert api(who).get(f"/api/media/{clip}/file/").status_code == 404, who
        assert api(who).get(f"/api/media/{clip}/thumbnail/").status_code == 404, who


def test_a_coach_sees_the_media_of_a_team_they_coach_only(api, club):
    upload(api, "b_archer")
    assert api("coach").get("/api/media/").data == []
    assert len(api("b_admin").get("/api/media/").data) == 1


def test_the_list_can_be_filtered(api, club):
    session = make_session(club["archer1"])
    a = upload(api, session=str(session.pk))["id"]
    upload(api)
    upload(api, "archer2")
    put(api("archer1"), photo())
    assert {m["id"] for m in api("coach").get(f"/api/media/?session={session.pk}").data} == {a}
    assert len(api("coach").get(f"/api/media/?owner={club['archer1'].pk}").data) == 3
    assert len(api("coach").get("/api/media/?kind=photo").data) == 1
    assert len(api("coach").get("/api/media/").data) == 4


def test_a_coach_cannot_change_or_delete_an_archers_own_clip(api, club):
    clip = upload(api)["id"]
    res = api("coach").get(f"/api/media/{clip}/")
    assert res.data["can_edit"] is False
    assert put(api("coach"), {"note": "x"}, clip).status_code == 403
    assert api("coach").delete(f"/api/media/{clip}/").status_code == 403
    assert Media.objects.count() == 1 and Media.objects.get().note == ""


def test_a_coach_adds_a_clip_for_an_archer_they_coach(api, club):
    session = make_session(club["archer1"])
    res = put(api("coach"), video(session=str(session.pk)), owner=club["archer1"])
    assert res.status_code == 201, res.data
    assert res.data["owner"] == club["archer1"].pk and res.data["uploaded_by"] == club["coach"].pk and res.data["session"] == session.pk
    assert res.data["uploaded_by_name"] == "coach"
    assert res.data["can_edit"] is True
    clip = res.data["id"]
    assert [m["id"] for m in api("archer1").get("/api/media/").data] == [clip]
    assert api("archer1").get(f"/api/media/{clip}/").data["can_edit"] is True, "the archer may delete what is about them"
    assert put(api("coach"), {"note": "Elbow"}, clip).status_code == 200
    assert put(api("admin"), {"note": "x"}, clip).status_code == 403, "another coach did not add it"
    assert api("coach").delete(f"/api/media/{clip}/").status_code == 204


def test_the_archer_can_delete_what_a_coach_added(api, club):
    clip = put(api("coach"), video(), owner=club["archer1"]).data["id"]
    assert api("archer1").delete(f"/api/media/{clip}/").status_code == 204


def test_only_for_archers_you_coach(api, club):
    for who, owner in [("archer2", "archer1"), ("archer1", "archer2"), ("b_admin", "archer1"), ("coach", "b_archer"), ("coach", "admin")]:
        assert put(api(who), video(), owner=club[owner]).status_code == 404, f"{who} for {owner}"
    assert not Media.objects.exists()


def test_a_coach_who_shoots_too_can_be_added_for(api, club):
    TeamMember.objects.filter(user=club["coach"]).update(also_shoots=True)
    assert put(api("admin"), video(), owner=club["coach"]).status_code == 201


def test_a_coach_keeps_the_media_of_a_profile_without_an_account(api, club, join):
    managed = User.objects.create_managed("Max")
    join(managed, club["a"], Role.ARCHER)
    res = put(api("coach"), video(), owner=managed)
    assert res.status_code == 201 and res.data["owner"] == managed.pk and res.data["uploaded_by"] == club["coach"].pk
    assert put(api("coach"), {"note": "x"}, res.data["id"]).status_code == 200
    assert put(api("archer1"), video(), owner=managed).status_code == 404
    assert api("coach").delete(f"/api/media/{res.data['id']}/").status_code == 204


def test_a_coach_of_another_team_cannot_upload_for_a_profile(api, club, join):
    managed = User.objects.create_managed("Max")
    join(managed, club["a"], Role.ARCHER)
    assert put(api("b_admin"), video(), owner=managed).status_code == 404


def test_the_owner_deletes_the_clip_and_its_files(api, club, django_capture_on_commit_callbacks):
    clip = upload(api)["id"]
    media = Media.objects.get()
    file, thumbnail = Path(media.file.path), Path(media.thumbnail.path)
    assert file.exists() and thumbnail.exists()
    with django_capture_on_commit_callbacks(execute=True):
        assert api("archer1").delete(f"/api/media/{clip}/").status_code == 204
    assert not Media.objects.exists() and not file.exists() and not thumbnail.exists()


def test_deleting_an_account_removes_the_files(api, club, django_capture_on_commit_callbacks):
    upload(api)
    path = Path(Media.objects.get().file.path)
    with django_capture_on_commit_callbacks(execute=True):
        club["archer1"].delete()
    assert not Media.objects.exists() and not path.exists()


def test_taking_over_a_profile_brings_its_clips(api, club, join):
    from core.claims import claim_profile
    from core.models import ClaimCode

    managed = User.objects.create_managed("Max")
    join(managed, club["a"], Role.ARCHER)
    clip = put(api("coach"), video(), owner=managed).data["id"]
    code = ClaimCode.objects.create(profile=managed, team=club["a"], created_by=club["coach"])
    newcomer = User.objects.create_user("new@x.test", "correct-horse-battery")
    claim_profile(code.code, newcomer)
    assert Media.objects.get(pk=clip).owner == newcomer


# --- the files ----------------------------------------------------------------------------------


def test_the_link_in_the_clip_opens_the_file_without_the_sign_in_header(api, client_for, club):
    data = upload(api)
    res = client_for().get(data["file_url"])
    assert res.status_code == 200 and res["Content-Type"] == "video/mp4" and body(res) == MP4
    thumb = client_for().get(data["thumbnail_url"])
    assert thumb["Content-Type"] == "image/jpeg" and body(thumb) == JPEG
    assert res["Accept-Ranges"] == "bytes" and res["X-Content-Type-Options"] == "nosniff"


def test_the_sign_in_header_opens_the_file_too(api, club):
    clip = upload(api)["id"]
    assert body(api("coach").get(f"/api/media/{clip}/file/")) == MP4


def test_a_photo_is_served_as_jpeg(api):
    clip = put(api("archer1"), photo()).data["id"]
    assert api("archer1").get(f"/api/media/{clip}/file/")["Content-Type"] == "image/jpeg"


def test_the_link_does_not_open_without_the_token_or_with_a_wrong_one(api, client_for, club):
    data = upload(api)
    other = upload(api)
    clip = data["id"]
    assert client_for().get(f"/api/media/{clip}/file/").status_code == 404
    assert client_for().get(f"/api/media/{clip}/file/?token=nonsense").status_code == 404
    assert client_for().get(f"/api/media/{clip}/file/?token={sign_link(other['id'], club['archer1'].pk)}").status_code == 404, "a token is for one clip"


def test_a_link_loses_its_power_with_the_access(api, client_for, club):
    clip = upload(api)["id"]
    assert client_for().get(f"/api/media/{clip}/file/?token={sign_link(clip, club['b_admin'].pk)}").status_code == 404
    assert client_for().get(f"/api/media/{clip}/file/?token={sign_link(clip, club['coach'].pk)}").status_code == 200
    TeamMember.objects.filter(user=club["coach"]).delete()  # the coach leaves the team
    assert client_for().get(f"/api/media/{clip}/file/?token={sign_link(clip, club['coach'].pk)}").status_code == 404
    User.objects.filter(pk=club["archer1"].pk).update(is_active=False)
    assert client_for().get(f"/api/media/{clip}/file/?token={sign_link(clip, club['archer1'].pk)}").status_code == 404


def test_an_old_link_stops_working(api, client_for, settings):
    data = upload(api)
    settings.MEDIA_LINK_SECONDS = -1
    assert client_for().get(data["file_url"]).status_code == 404


@pytest.mark.parametrize(
    "header, status, expected, content_range",
    [
        ("bytes=0-9", 206, MP4[0:10], f"bytes 0-9/{len(MP4)}"),
        ("bytes=100-", 206, MP4[100:], f"bytes 100-{len(MP4) - 1}/{len(MP4)}"),
        ("bytes=-50", 206, MP4[-50:], f"bytes {len(MP4) - 50}-{len(MP4) - 1}/{len(MP4)}"),
        ("bytes=5-999999", 206, MP4[5:], f"bytes 5-{len(MP4) - 1}/{len(MP4)}"),
        ("bytes=-999999", 206, MP4, f"bytes 0-{len(MP4) - 1}/{len(MP4)}"),
        ("bytes=999999-", 416, b"", f"bytes */{len(MP4)}"),
        ("bytes=9-5", 416, b"", f"bytes */{len(MP4)}"),
        ("bytes=0-1,5-6", 200, MP4, None),
        ("pages=1-2", 200, MP4, None),
        ("bytes=-", 200, MP4, None),
    ],
)
def test_ranges(api, header, status, expected, content_range):
    clip = upload(api)["id"]
    res = api("archer1").get(f"/api/media/{clip}/file/", headers={"Range": header})
    assert res.status_code == status
    assert (b"".join(res.streaming_content) if status != 416 else b"") == expected
    assert res.get("Content-Range") == content_range
    if status != 416:
        assert int(res["Content-Length"]) == len(expected)


# --- moving into a session (#91) ---------------------------------------------------------------


def test_a_clip_moves_into_another_session_and_out_again(api, club):
    one, two = make_session(club["archer1"]), make_session(club["archer1"])
    clip = upload(api, session=str(one.pk))["id"]
    assert put(api("archer1"), {"session": str(two.pk)}, clip).data["session"] == two.pk
    assert api("archer1").get(f"/api/media/{clip}/").data["session"] == two.pk
    assert put(api("archer1"), {"session": ""}, clip).data["session"] is None
    assert api("archer1").get(f"/api/media/{clip}/").data["session"] is None


def test_a_clip_cannot_move_into_a_session_of_another_archer(api, club):
    mine, other = make_session(club["archer1"]), make_session(club["archer2"])
    clip = upload(api, session=str(mine.pk))["id"]
    res = put(api("archer1"), {"session": str(other.pk)}, clip)
    assert res.status_code == 400 and "session" in res.data
    assert Media.objects.get(pk=clip).session_id == mine.pk


def test_who_may_move_a_clip(api, club, join):
    session = make_session(club["archer1"])
    own = upload(api)["id"]
    assert put(api("coach"), {"session": str(session.pk)}, own).status_code == 403
    added = put(api("coach"), video(), owner=club["archer1"]).data["id"]
    assert put(api("coach"), {"session": str(session.pk)}, added).data["session"] == session.pk
    assert put(api("archer1"), {"session": ""}, added).data["session"] is None
    managed = User.objects.create_managed("Max")
    join(managed, club["a"], Role.ARCHER)
    theirs = put(api("coach"), video(), owner=managed).data["id"]
    other = make_session(managed)
    assert put(api("coach"), {"session": str(other.pk)}, theirs).data["session"] == other.pk


def test_moving_several_clips_is_one_request_each(api, club):
    mine, other = make_session(club["archer1"]), make_session(club["archer2"])
    clips = [upload(api)["id"] for _ in range(3)]
    results = [put(api("archer1"), {"session": str(s.pk)}, c).status_code for c, s in zip(clips, [mine, other, mine])]
    assert results == [200, 400, 200]
    assert sorted(Media.objects.values_list("session_id", flat=True), key=str) == sorted([mine.pk, mine.pk, None], key=str)


def test_the_list_asks_for_clips_without_a_session(api, club):
    session = make_session(club["archer1"])
    inside = upload(api, session=str(session.pk))["id"]
    outside = upload(api)["id"]
    upload(api, "archer2")
    url = f"/api/media/?owner={club['archer1'].pk}"
    assert {m["id"] for m in api("coach").get(f"{url}&without_session=true").data} == {outside}
    assert {m["id"] for m in api("coach").get(f"{url}&without_session=false").data} == {inside}
    assert len(api("coach").get(url).data) == 2


def test_the_list_can_be_limited_to_a_time(api, club):
    early = upload(api, taken_at="2026-10-24T09:00:00Z")["id"]
    late = upload(api, taken_at="2026-10-24T11:00:00Z")["id"]
    assert {m["id"] for m in api("archer1").get("/api/media/?taken_after=2026-10-24T09:00:00Z").data} == {early, late}
    assert {m["id"] for m in api("archer1").get("/api/media/?taken_after=2026-10-24T09:30:00Z").data} == {late}
    assert {m["id"] for m in api("archer1").get("/api/media/?taken_before=2026-10-24T11:00:00Z").data} == {early}
