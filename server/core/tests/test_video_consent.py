from datetime import date, timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from core.models import User
from media.tests.test_media import JPEG, MP4, photo, put, video  # noqa: F401 (the helpers make uploads)


def born(user, years):
    today = timezone.localdate()
    user.profile.date_of_birth = date(today.year - years, today.month, today.day) - timedelta(days=1)
    user.profile.save()


def consent_url(user):
    return f"/api/archers/{user.pk}/video-consent/"


@pytest.fixture
def api(client_for, club):
    return lambda who: client_for(User.objects.get(pk=club[who].pk))  # fresh: the view reads the profile again


def test_adults_and_archers_without_a_birth_date_may_be_filmed(club):
    assert club["archer1"].profile.video_allowed  # age not known
    born(club["archer1"], 18)
    assert club["archer1"].profile.video_allowed


def test_an_archer_under_18_may_not_until_consent_is_recorded(club):
    born(club["archer1"], 17)
    assert not club["archer1"].profile.video_allowed


def test_a_coach_records_the_consent_and_it_shows_who_and_when(api, club):
    born(club["archer1"], 15)
    res = api("coach").put(consent_url(club["archer1"]))
    assert res.status_code == 200 and res.data["video_allowed"] is True and res.data["video_consent_at"]
    club["archer1"].profile.refresh_from_db()
    assert club["archer1"].profile.video_consent_by == club["coach"]
    seen = api("coach").get(f"/api/archers/{club['archer1'].pk}/").data
    assert seen["video_allowed"] is True and seen["video_consent_by"] == (club["coach"].profile.name or club["coach"].email)


def test_withdrawing_it_refuses_new_video_again(api, club):
    born(club["archer1"], 15)
    api("coach").put(consent_url(club["archer1"]))
    res = api("coach").delete(consent_url(club["archer1"]))
    assert res.status_code == 200 and res.data["video_allowed"] is False and res.data["video_consent_at"] is None


def test_only_a_coach_of_the_archer_can_record_it(api, club):
    born(club["archer1"], 15)
    assert api("archer1").put(consent_url(club["archer1"])).status_code == 404  # not even for yourself
    assert api("archer2").put(consent_url(club["archer1"])).status_code == 404
    assert api("b_admin").put(consent_url(club["archer1"])).status_code == 404
    club["archer1"].profile.refresh_from_db()
    assert club["archer1"].profile.video_consent_at is None


def test_video_of_an_archer_under_18_is_refused_without_consent_and_photos_are_not(api, club):
    born(club["archer1"], 15)
    res = put(api("archer1"), video())
    assert res.status_code == 403 and "consent" in str(res.data["detail"])
    assert put(api("coach"), video(), owner=club["archer1"]).status_code == 403
    assert put(api("archer1"), photo()).status_code == 201


def test_with_consent_the_video_goes_up(api, club):
    born(club["archer1"], 15)
    api("coach").put(consent_url(club["archer1"]))
    assert put(api("archer1"), video()).status_code == 201
    assert put(api("coach"), video(), owner=club["archer1"]).status_code == 201


def test_what_is_already_there_stays_when_consent_is_withdrawn(api, club):
    born(club["archer1"], 15)
    api("coach").put(consent_url(club["archer1"]))
    clip = put(api("archer1"), video()).data["id"]
    api("coach").delete(consent_url(club["archer1"]))
    res = api("archer1").put(f"/api/media/{clip}/", {"note": "x"}, format="multipart")
    assert res.status_code == 200  # the note of an existing clip can still change


def test_the_archer_sees_the_flag_on_their_own_profile(api, club):
    born(club["archer1"], 15)
    assert api("archer1").get("/api/me/").data["profile"]["video_allowed"] is False
    api("coach").put(consent_url(club["archer1"]))
    assert api("archer1").get("/api/me/").data["profile"]["video_allowed"] is True


def test_the_export_has_the_consent(api, club):
    from privacy.tests.test_delete_data import PASSWORD

    api("coach").put(consent_url(club["archer1"]))
    d = api("archer1").post("/api/me/export/", {"password": PASSWORD}, format="json").json()
    assert d["profile"]["video_consent_at"] and d["profile"]["video_consent_by"]
