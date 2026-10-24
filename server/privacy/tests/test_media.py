import io
import os
import uuid
import zipfile

import pytest
from django.core.files.base import ContentFile
from django.utils import timezone

from media.models import Media
from privacy.tests.test_delete_data import PASSWORD, fill
from training.tests.test_overview import make_session

MP4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 3000
JPEG = b"\xff\xd8\xff\xe0" + b"\x01" * 500


def give(owner, kind="video", by=None, session=None, note=""):
    media = Media(
        id=uuid.uuid4(), owner=owner, uploaded_by=by or owner, session=session, kind=kind, size=len(MP4) + len(JPEG),
        taken_at=timezone.now(), width=1280, height=720, duration_ms=8000 if kind == "video" else None, note=note,
    )
    media.file.save("x", ContentFile(MP4 if kind == "video" else JPEG), save=False)
    media.thumbnail.save("t", ContentFile(JPEG), save=False)
    media.save()
    return media


def files_of(media):
    return [f.path for f in (media.file, media.thumbnail)]


def zip_of(client, token_url):
    res = client.get(token_url)
    assert res.status_code == 200, res.content
    return res, zipfile.ZipFile(io.BytesIO(b"".join(res.streaming_content)))


def link(client_for, user, **body):
    return client_for(user).post("/api/me/export/media/", {"password": PASSWORD, **body}, format="json")


# --- export ------------------------------------------------------------------------------------


def test_the_export_lists_my_media_with_the_name_the_file_has_in_the_zip(client_for, club):
    session = make_session(club["archer1"], arrows=6)
    clip = give(club["archer1"], "video", session=session, note="Anchor")
    photo = give(club["archer1"], "photo")
    give(club["archer2"], "photo")
    res = client_for(club["archer1"]).post("/api/me/export/", {"password": PASSWORD}, format="json")
    items = {m["id"]: m for m in res.json()["media"]}
    assert set(items) == {str(clip.pk), str(photo.pk)}
    assert items[str(clip.pk)]["file"] == f"{clip.pk}.mp4" and items[str(photo.pk)]["file"] == f"{photo.pk}.jpg"
    assert items[str(clip.pk)]["note"] == "Anchor" and items[str(clip.pk)]["session"] == str(session.pk) and items[str(clip.pk)]["duration_ms"] == 8000
    assert "file_url" not in items[str(clip.pk)]


def test_what_a_coach_added_for_me_is_in_my_export_and_shows_who_added_it(client_for, club):
    clip = give(club["archer1"], "photo", by=club["coach"])
    res = client_for(club["archer1"]).post("/api/me/export/", {"password": PASSWORD}, format="json")
    assert [m["added_by"] for m in res.json()["media"]] == [club["coach"].profile.name or club["coach"].email]
    assert res.json()["media"][0]["id"] == str(clip.pk)


def test_a_coach_export_has_no_media_of_their_archers(client_for, club):
    give(club["archer1"], "photo", by=club["coach"])
    res = client_for(club["coach"]).post("/api/me/export/", {"password": PASSWORD}, format="json")
    assert res.json()["media"] == []


def test_the_link_needs_the_password_and_says_how_much_there_is(client_for, club):
    give(club["archer1"], "video")
    give(club["archer1"], "photo")
    assert link(client_for, club["archer1"], password="wrong").status_code == 400
    res = link(client_for, club["archer1"])
    assert res.status_code == 200
    assert res.data["files"] == 2 and res.data["bytes"] == 2 * (len(MP4) + len(JPEG)) and "/api/me/export/media/file/?token=" in res.data["url"]


def test_the_zip_has_my_files_as_they_are_and_nobody_elses(client_for, club, client):
    clip, photo = give(club["archer1"], "video"), give(club["archer1"], "photo")
    other = give(club["archer2"], "photo")
    url = link(client_for, club["archer1"]).data["url"]
    res, archive = zip_of(client, url)  # no sign-in header: the token is enough
    assert res["Content-Type"] == "application/zip" and "attachment" in res["Content-Disposition"]
    assert sorted(archive.namelist()) == sorted([f"{clip.pk}.mp4", f"{photo.pk}.jpg"])
    assert archive.read(f"{clip.pk}.mp4") == MP4 and archive.read(f"{photo.pk}.jpg") == JPEG
    assert archive.testzip() is None and f"{other.pk}.jpg" not in archive.namelist()


def test_a_big_file_goes_through_in_pieces(client_for, club, client, monkeypatch):
    from privacy import media_zip

    monkeypatch.setattr(media_zip, "CHUNK", 1000)
    clip = give(club["archer1"], "video")
    res, archive = zip_of(client, link(client_for, club["archer1"]).data["url"])
    assert archive.read(f"{clip.pk}.mp4") == MP4


def test_a_row_without_its_file_is_left_out(client_for, club, client):
    clip, gone = give(club["archer1"], "video"), give(club["archer1"], "photo")
    gone.file.storage.delete(gone.file.name)
    _, archive = zip_of(client, link(client_for, club["archer1"]).data["url"])
    assert archive.namelist() == [f"{clip.pk}.mp4"]


def test_a_nobody_has_an_empty_zip(client_for, club, client):
    _, archive = zip_of(client, link(client_for, club["archer1"]).data["url"])
    assert archive.namelist() == []


@pytest.mark.parametrize("token", ["", "x", "x:y:z"])
def test_a_wrong_link_is_404(client, token):
    assert client.get(f"/api/me/export/media/file/?token={token}").status_code == 404


def test_the_link_runs_out(client_for, club, client, monkeypatch):
    from privacy import media_zip

    url = link(client_for, club["archer1"]).data["url"]
    monkeypatch.setattr(media_zip, "LINK_SECONDS", -1)
    assert client.get(url).status_code == 404


def test_a_link_of_a_deleted_account_is_404(client_for, club, client):
    url = link(client_for, club["archer1"]).data["url"]
    club["archer1"].is_active = False
    club["archer1"].save()
    assert client.get(url).status_code == 404


# --- deletion ----------------------------------------------------------------------------------


def test_delete_my_data_removes_my_media_and_its_files_and_counts_them(client_for, club, django_capture_on_commit_callbacks):
    fill(club["archer1"])
    mine = [give(club["archer1"], "video"), give(club["archer1"], "photo", by=club["coach"])]
    kept = give(club["archer2"], "photo")
    paths = [p for m in mine for p in files_of(m)]
    with django_capture_on_commit_callbacks(execute=True):
        res = client_for(club["archer1"]).post("/api/me/delete-data/", {"password": PASSWORD, "confirm": "DELETE"}, format="json")
    assert res.status_code == 200 and res.data["deleted"]["media"] == 2
    assert not Media.objects.filter(owner=club["archer1"]).exists() and Media.objects.filter(pk=kept.pk).exists()
    assert not any(os.path.exists(p) for p in paths) and all(os.path.exists(p) for p in files_of(kept))


def test_a_clip_a_coach_added_for_an_archer_goes_with_the_archers_data_only(client_for, club):
    give(club["archer1"], "photo", by=club["coach"])
    client_for(club["coach"]).post("/api/me/delete-data/", {"password": PASSWORD, "confirm": "DELETE"}, format="json")
    assert Media.objects.filter(owner=club["archer1"]).count() == 1  # the coach deleted their own data, not the archer's


def test_deleting_the_account_leaves_no_files(client_for, club, django_capture_on_commit_callbacks):
    clip = give(club["archer1"], "video")
    paths = files_of(clip)
    with django_capture_on_commit_callbacks(execute=True):
        res = client_for(club["archer1"]).post("/api/me/delete-account/", {"password": PASSWORD, "confirm": "DELETE ACCOUNT"}, format="json")
    assert res.status_code == 200, res.data
    assert res.data["deleted"]["media"] == 1 and not any(os.path.exists(p) for p in paths)
