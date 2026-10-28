import io
import os
import zipfile
from datetime import timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from core import avatar
from core.models import ClaimCode, Role, Team, TeamMember, User
from core.tests.test_video_consent import born


def jpeg(size=(256, 256), exif=False, color=(200, 30, 30)) -> bytes:
    out = io.BytesIO()
    image = Image.new("RGB", size, color)
    if exif:
        data = Image.Exif()
        data[0x8825] = {1: "N", 2: (51.0, 31.0, 55.0)}  # a GPS position
        data[0x010F] = "SomePhone"
        image.save(out, "JPEG", exif=data)
    else:
        image.save(out, "JPEG")
    return out.getvalue()


def upload(data=None, name="a.jpg"):
    return {"file": SimpleUploadedFile(name, data if data is not None else jpeg(), content_type="image/jpeg")}


@pytest.fixture
def api(client_for, club):
    return lambda who: client_for(User.objects.get(pk=club[who].pk))  # fresh: the view reads the profile again


def put(api, who, data=None):
    return api(who).put("/api/me/avatar/", upload(data), format="multipart")


def file_of(user):
    user.profile.refresh_from_db()
    return user.profile.avatar.path


def fetch(client, res):
    return client.get(res.data["avatar_url"])


# --- upload ----------------------------------------------------------------------------------------


def test_a_jpeg_is_stored_and_served_to_its_owner(api, club):
    res = put(api, "archer1")
    assert res.status_code == 200 and f"/api/users/{club['archer1'].pk}/avatar/?token=" in res.data["avatar_url"]
    assert b"".join(fetch(api("archer1"), res).streaming_content)[:3] == b"\xff\xd8\xff"
    assert os.path.exists(file_of(club["archer1"]))


def test_the_stored_file_has_no_metadata_and_is_not_larger_than_512_px(api, club):
    put(api, "archer1", jpeg(size=(900, 600), exif=True))
    with Image.open(file_of(club["archer1"])) as stored:
        assert stored.format == "JPEG" and max(stored.size) <= 512
        assert not stored.getexif() and "exif" not in stored.info


@pytest.mark.parametrize(
    "data",
    [
        pytest.param(lambda: (lambda o: (Image.new("RGB", (20, 20)).save(o, "PNG"), o.getvalue())[1])(io.BytesIO()), id="png"),
        pytest.param(lambda: b"\xff\xd8\xff" + b"not a picture", id="jpeg-header-only"),
        pytest.param(lambda: b"hello", id="text"),
    ],
)
def test_only_a_real_jpeg_is_accepted(api, club, data):
    res = put(api, "archer1", data())
    assert res.status_code == 400
    club["archer1"].profile.refresh_from_db()
    assert not club["archer1"].profile.avatar


def test_a_file_over_512_kb_is_refused(api, club):
    assert put(api, "archer1", jpeg() + b"\0" * (512 * 1024)).status_code == 400


def test_a_picture_that_is_far_too_large_is_refused(api, club):
    assert put(api, "archer1", jpeg(size=(1500, 1500))).status_code == 400


def test_no_file_is_a_400(api, club):
    assert api("archer1").put("/api/me/avatar/", {}, format="multipart").status_code == 400


def test_signed_out_cannot_upload(client_for):
    assert client_for().put("/api/me/avatar/", upload(), format="multipart").status_code == 401


def test_replacing_removes_the_old_file(api, club, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        put(api, "archer1")
    old = file_of(club["archer1"])
    with django_capture_on_commit_callbacks(execute=True):
        put(api, "archer1", jpeg(color=(0, 0, 255)))
    new = file_of(club["archer1"])
    assert new != old and os.path.exists(new) and not os.path.exists(old)


def test_deleting_removes_the_file_and_the_link(api, club, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        put(api, "archer1")
    path = file_of(club["archer1"])
    with django_capture_on_commit_callbacks(execute=True):
        assert api("archer1").delete("/api/me/avatar/").status_code == 204
    assert not os.path.exists(path)
    club["archer1"].profile.refresh_from_db()
    assert not club["archer1"].profile.avatar and club["archer1"].profile.avatar_updated_at is None
    assert api("archer1").delete("/api/me/avatar/").status_code == 204  # none left: still fine


def test_a_rolled_back_change_keeps_the_old_file(api, club, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        put(api, "archer1")
    path = file_of(club["archer1"])
    profile = User.objects.get(pk=club["archer1"].pk).profile
    with pytest.raises(RuntimeError), django_capture_on_commit_callbacks(execute=True):
        from django.db import transaction

        with transaction.atomic():
            avatar.remove_avatar(profile)
            raise RuntimeError
    assert os.path.exists(path)


# --- who sees it -----------------------------------------------------------------------------------


@pytest.fixture
def picture(api, club):
    return put(api, "archer1")


def person(club, who):
    return f"/api/users/{club[who].pk}/avatar/"


def test_the_archer_sees_their_own(api, picture):
    assert fetch(api("archer1"), picture).status_code == 200


def test_the_coach_and_the_admin_of_the_team_see_it(api, club, picture):
    for who in ("coach", "admin"):
        assert api(who).get(person(club, "archer1")).status_code == 200


def test_another_archer_and_the_coach_of_another_team_get_404(api, club, picture):
    uid = club["archer1"].pk
    for who in ("archer2", "b_archer", "b_admin"):
        assert api(who).get(f"/api/users/{uid}/avatar/").status_code == 404


def test_signed_out_without_a_token_gets_404(client_for, club, picture):
    assert client_for().get(f"/api/users/{club['archer1'].pk}/avatar/").status_code == 404


def test_a_link_works_for_the_viewer_it_was_made_for_only(client_for, club, picture):
    uid = club["archer1"].pk
    mine = avatar.sign_link(uid, club["coach"].pk)
    assert client_for().get(f"/api/users/{uid}/avatar/?token={mine}").status_code == 200
    other_viewer = avatar.sign_link(uid, club["b_admin"].pk)
    assert client_for().get(f"/api/users/{uid}/avatar/?token={other_viewer}").status_code == 404
    other_person = avatar.sign_link(club["archer2"].pk, club["coach"].pk)
    assert client_for().get(f"/api/users/{uid}/avatar/?token={other_person}").status_code == 404
    assert client_for().get(f"/api/users/{uid}/avatar/?token=nonsense").status_code == 404


def test_an_old_link_stops_working(client_for, club, picture, settings):
    uid = club["archer1"].pk
    token = avatar.sign_link(uid, club["coach"].pk)
    settings.MEDIA_LINK_SECONDS = -1
    assert client_for().get(f"/api/users/{uid}/avatar/?token={token}").status_code == 404


def test_a_link_stops_working_when_the_viewer_leaves_the_team(client_for, club, picture):
    uid = club["archer1"].pk
    token = avatar.sign_link(uid, club["coach"].pk)
    TeamMember.objects.filter(user=club["coach"]).delete()
    assert client_for().get(f"/api/users/{uid}/avatar/?token={token}").status_code == 404


def test_a_user_without_a_picture_is_a_404(api, club):
    assert api("coach").get(person(club, "archer2")).status_code == 404


# --- avatar_url in the lists -------------------------------------------------------------------------


def members(api, who, team):
    res = api(who).get(f"/api/teams/{team.pk}/members/")
    assert res.status_code == 200
    return {m["user_id"]: m["avatar_url"] for m in res.data}


def test_the_members_list_gives_the_link_only_to_who_may_follow_it(api, club, picture):
    put(api, "coach")
    a1, co = club["archer1"].pk, club["coach"].pk
    seen = members(api, "coach", club["a"])
    assert seen[a1] and seen[co] and not seen[club["archer2"].pk]
    archer = members(api, "archer1", club["a"])
    assert archer[a1] and archer[co]  # their own, and their coach's
    assert members(api, "archer2", club["a"])[co]


def test_an_archer_does_not_get_another_archers_link(api, club, picture):
    assert not members(api, "archer2", club["a"]).get(club["archer1"].pk)


def test_me_has_my_link_and_a_flag_for_the_consent(api, club, picture):
    me = api("archer1").get("/api/me/").data["profile"]
    assert me["avatar_url"] and me["avatar_allowed"] is True
    assert api("archer2").get("/api/me/").data["profile"]["avatar_url"] == ""


# --- under 18 --------------------------------------------------------------------------------------------


def test_an_archer_under_18_cannot_set_one_without_consent(api, club):
    born(club["archer1"], 15)
    res = put(api, "archer1")
    assert res.status_code == 400
    club["archer1"].profile.refresh_from_db()
    assert not club["archer1"].profile.avatar


def test_with_consent_on_record_it_works(api, club):
    born(club["archer1"], 15)
    api("coach").put(f"/api/archers/{club['archer1'].pk}/video-consent/")
    assert put(api, "archer1").status_code == 200


def test_a_birth_date_set_later_hides_an_existing_picture(api, club, picture):
    born(club["archer1"], 15)
    assert fetch(api("archer1"), picture).status_code == 404
    assert not members(api, "coach", club["a"])[club["archer1"].pk]
    assert api("archer1").get("/api/me/").data["profile"]["avatar_url"] == ""


# --- profiles without an account ---------------------------------------------------------------------------


@pytest.fixture
def managed(api, club):
    res = api("coach").post(f"/api/teams/{club['a'].pk}/archers/", {"name": "Kid"}, format="json")
    return res.data["user_id"]


def managed_url(club, uid):
    return f"/api/teams/{club['a'].pk}/archers/{uid}/avatar/"


def test_a_coach_sets_the_picture_of_a_profile_without_an_account(api, club, managed):
    res = api("coach").put(managed_url(club, managed), upload(), format="multipart")
    assert res.status_code == 200
    assert api("admin").get(res.data["avatar_url"]).status_code == 200
    assert api("b_admin").get(f"/api/users/{managed}/avatar/").status_code == 404
    assert api("coach").delete(managed_url(club, managed)).status_code == 204


def test_nobody_else_sets_it(api, club, managed):
    assert api("archer1").put(managed_url(club, managed), upload(), format="multipart").status_code == 403
    assert api("b_admin").put(managed_url(club, managed), upload(), format="multipart").status_code == 404
    assert api("coach").put(managed_url(club, club["archer1"].pk), upload(), format="multipart").status_code == 404  # has an account


def test_the_picture_goes_to_the_archer_who_claims_the_profile(api, club, managed, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        api("coach").put(managed_url(club, managed), upload(), format="multipart")
    path = User.objects.get(pk=managed).profile.avatar.path
    code = api("coach").post(f"{managed_url(club, managed)[:-7]}claim-code/").data["code"]
    with django_capture_on_commit_callbacks(execute=True):
        res = api("archer2").post("/api/claims/redeem/", {"invite_code": code}, format="json")
    assert res.status_code == 201, res.data
    club["archer2"].profile.refresh_from_db()
    assert club["archer2"].profile.avatar.path == path and os.path.exists(path)


# --- deleting --------------------------------------------------------------------------------------------


def password_body(**extra):
    return {"password": "correct-horse-battery", **extra}


def test_delete_my_data_removes_the_file_and_keeps_the_profile(api, club, picture, django_capture_on_commit_callbacks):
    path = file_of(club["archer1"])
    with django_capture_on_commit_callbacks(execute=True):
        res = api("archer1").post("/api/me/delete-data/", password_body(confirm="DELETE"), format="json")
    assert res.status_code == 200 and res.data["deleted"]["avatar"] == 1
    assert not os.path.exists(path)
    club["archer1"].profile.refresh_from_db()
    assert not club["archer1"].profile.avatar


def test_deleting_the_account_removes_the_file(api, club, picture, django_capture_on_commit_callbacks):
    path = file_of(club["archer1"])
    with django_capture_on_commit_callbacks(execute=True):
        res = api("archer1").post("/api/me/delete-account/", password_body(confirm="DELETE ACCOUNT"), format="json")
    assert res.status_code == 200
    assert not os.path.exists(path)


# --- export ----------------------------------------------------------------------------------------------


def test_the_json_export_names_the_picture(api, club, picture):
    res = api("archer1").post("/api/me/export/", password_body(), format="json")
    assert res.data["profile"]["avatar"] == "avatar.jpg" and res.data["profile"]["avatar_updated_at"]
    assert api("archer2").post("/api/me/export/", password_body(), format="json").data["profile"]["avatar"] is None


def test_the_zip_has_the_picture_and_the_count_includes_it(api, client_for, club, picture):
    link = api("archer1").post("/api/me/export/media/", password_body(), format="json")
    assert link.status_code == 200 and link.data["files"] == 1 and link.data["bytes"] == os.path.getsize(file_of(club["archer1"]))
    res = client_for().get(link.data["url"])
    body = b"".join(res.streaming_content)
    with zipfile.ZipFile(io.BytesIO(body)) as archive:
        assert archive.namelist() == ["avatar.jpg"]
        with open(file_of(club["archer1"]), "rb") as stored:
            assert archive.read("avatar.jpg") == stored.read()
