from copy import deepcopy

from django.conf import settings as django_settings

PREVIEW = "/api/codes/preview/"
BODY = {"invite_code": "NOPE"}


def post(client, forwarded_for):
    return client.post(PREVIEW, BODY, format="json", HTTP_X_FORWARDED_FOR=forwarded_for).status_code


def test_behind_one_proxy_each_client_has_its_own_limit(db, client_for, settings):
    rest = deepcopy(django_settings.REST_FRAMEWORK)
    rest["NUM_PROXIES"] = 1
    settings.REST_FRAMEWORK = rest
    client = client_for()
    # Two clients, as nginx reports them (its own address is the last one in the list).
    assert [post(client, "198.51.100.1") for _ in range(20)] == [400] * 20
    assert post(client, "198.51.100.1") == 429
    assert post(client, "198.51.100.2") == 400
    # What a client puts in front of that does not give it a new allowance.
    assert post(client, "203.0.113.9, 198.51.100.1") == 429


def test_without_a_proxy_the_header_is_ignored(db, client_for):
    client = client_for()
    # Not behind a proxy: the address of the connection counts, whatever the header says.
    assert [post(client, f"198.51.100.{i}") for i in range(20)] == [400] * 20
    assert post(client, "198.51.100.99") == 429
