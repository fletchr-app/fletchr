import uuid

import pytest

from equipment.models import ArrowSet, ArrowSetRevision, Bow, BowRevision

from .test_equipment import KINDS


@pytest.fixture(params=KINDS)
def kind(request):
    payload, field, new_value, model, revision_model = KINDS[request.param]
    return {"url": f"/api/{request.param}/", "payload": payload, "field": field, "new": new_value, "model": model, "revision": revision_model}


def put(client, kind, uid, revision_uid=None, **extra):
    body = {**kind["payload"], **extra}
    if revision_uid is not None:
        body["revision_uid"] = str(revision_uid)
    return client.put(f"{kind['url']}{uid}/", body, format="json")


def test_put_creates_the_item_with_the_uids_of_the_app(client_for, club, kind):
    uid, revision_uid = uuid.uuid4(), uuid.uuid4()
    res = put(client_for(club["archer1"]), kind, uid, revision_uid, owner=club["archer2"].pk)
    assert res.status_code == 201, res.data
    assert (res.data["uid"], res.data["revision_uid"], res.data["revision_number"]) == (str(uid), str(revision_uid), 1)
    item = kind["model"].objects.get()
    assert item.owner == club["archer1"] and item.current_revision.uid == revision_uid  # the owner cannot be set by the client


def test_repeating_the_put_changes_nothing(client_for, club, kind):
    client = client_for(club["archer1"])
    uid, revision_uid = uuid.uuid4(), uuid.uuid4()
    put(client, kind, uid, revision_uid)
    res = put(client, kind, uid, revision_uid)
    assert res.status_code == 200 and res.data["revision_number"] == 1
    assert kind["model"].objects.count() == 1 and kind["revision"].objects.count() == 1


def test_a_new_value_adds_a_revision_with_the_uid_of_the_app(client_for, club, kind):
    client = client_for(club["archer1"])
    uid, second = uuid.uuid4(), uuid.uuid4()
    first = put(client, kind, uid, uuid.uuid4()).data
    res = put(client, kind, uid, second, **{kind["field"]: kind["new"]})
    assert res.status_code == 200 and res.data["revision_number"] == 2
    assert res.data["revision_uid"] == str(second) and res.data["revision_uid"] != first["revision_uid"]
    assert res.data["id"] == first["id"]  # still the same item


def test_put_without_a_revision_uid_makes_one(client_for, club, kind):
    res = put(client_for(club["archer1"]), kind, uuid.uuid4())
    assert res.status_code == 201 and res.data["revision_uid"]


def test_an_item_of_somebody_else_is_not_found_and_stays_as_it_was(client_for, club, kind):
    uid = uuid.uuid4()
    put(client_for(club["archer1"]), kind, uid, uuid.uuid4())
    for who in ("archer2", "coach", "admin", "b_admin"):
        res = put(client_for(club[who]), kind, uid, uuid.uuid4(), name="Mine now")
        assert res.status_code == 404, who
    assert kind["model"].objects.get().name == kind["payload"]["name"]


def test_a_revision_uid_of_another_item_is_refused(client_for, club, kind):
    client = client_for(club["archer1"])
    taken = put(client, kind, uuid.uuid4(), uuid.uuid4()).data["revision_uid"]
    res = put(client, kind, uuid.uuid4(), taken)
    assert res.status_code == 400 and "revision_uid" in res.data
    assert kind["model"].objects.count() == 1


def test_a_bad_body_is_refused_and_creates_nothing(client_for, club, kind):
    res = client_for(club["archer1"]).put(f"{kind['url']}{uuid.uuid4()}/", {"is_active": True}, format="json")
    assert res.status_code == 400
    assert kind["model"].objects.count() == 0


def test_put_needs_a_login(client_for, club, kind):
    from rest_framework.test import APIClient

    assert put(APIClient(), kind, uuid.uuid4()).status_code == 401


def test_the_integer_routes_still_work(client_for, club, kind):
    client = client_for(club["archer1"])
    data = client.post(kind["url"], kind["payload"], format="json").data
    assert client.get(f"{kind['url']}{data['id']}/").status_code == 200
    assert Bow.objects.count() + ArrowSet.objects.count() == 1
    assert BowRevision.objects.count() + ArrowSetRevision.objects.count() == 1
