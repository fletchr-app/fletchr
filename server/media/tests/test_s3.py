from urllib.parse import parse_qs, urlsplit

import pytest
from django.core.files.storage import FileSystemStorage
from storages.backends.s3 import S3Storage

from media.tests.test_media import api, body, upload  # noqa: F401  (the fixture `api`)

pytestmark = pytest.mark.django_db


def test_with_a_bucket_the_file_link_redirects_to_a_short_lived_link(api, client_for, settings, monkeypatch):
    clip = upload(api)
    settings.S3_BUCKET = "bucket"
    monkeypatch.setattr(FileSystemStorage, "url", lambda self, name: f"https://s3.example.org/bucket/{name}?X-Amz-Signature=abc")
    res = client_for().get(clip["file_url"])
    assert res.status_code == 302 and res["Location"].startswith("https://s3.example.org/bucket/") and res["Location"].endswith(".mp4?X-Amz-Signature=abc")
    assert res["Cache-Control"] == "no-store"
    assert client_for().get(clip["thumbnail_url"])["Location"].endswith("-thumb.jpg?X-Amz-Signature=abc")


def test_the_redirect_is_not_given_without_the_right_to_see_the_file(api, client_for, settings):
    clip = upload(api)
    settings.S3_BUCKET = "bucket"
    assert client_for().get(clip["file_url"].split("?")[0]).status_code == 404
    assert client_for().get(clip["file_url"] + "x").status_code == 404


def test_without_a_bucket_the_file_is_still_streamed(api, client_for, settings):
    clip = upload(api)
    settings.S3_BUCKET = ""
    res = client_for().get(clip["file_url"])
    assert res.status_code == 200 and body(res)


def test_the_s3_storage_signs_a_link_that_expires_and_sets_no_public_acl():
    storage = S3Storage(
        bucket_name="fletchr", endpoint_url="https://s3.eu-central-4.ionoscloud.com", region_name="eu-central-4",
        access_key="key", secret_key="secret", default_acl="private", querystring_auth=True, querystring_expire=300, addressing_style="path",
    )
    url = storage.url("7/abc.mp4")
    parts, query = urlsplit(url), parse_qs(urlsplit(url).query)
    assert parts.netloc == "s3.eu-central-4.ionoscloud.com" and parts.path == "/fletchr/7/abc.mp4"
    assert query["X-Amz-Expires"] == ["300"] and "X-Amz-Signature" in query
