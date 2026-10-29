import uuid

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from core.models import User
from equipment.revisions import record_revision

from .test_equipment import create, kind  # noqa: F401  (the `kind` fixture runs each test for bows and for arrow sets)


def test_items_and_revisions_have_a_uid_that_stays_when_a_field_changes(client_for, club, kind):  # noqa: F811
    client = client_for(club["archer1"])
    data = create(client, kind)
    assert data["uid"] and data["revision_uid"] and data["uid"] != data["revision_uid"]
    url = f"{kind['url']}{data['id']}/"
    changed = client.patch(url, {kind["field"]: kind["new"]}, format="json").data
    assert changed["uid"] == data["uid"]  # the item keeps its uid
    assert changed["revision_uid"] != data["revision_uid"]  # a new revision gets its own
    history = client.get(f"{url}revisions/").data
    assert [r["uid"] for r in history] == [changed["revision_uid"], data["revision_uid"]]


def test_the_client_cannot_choose_a_uid(client_for, club, kind):  # noqa: F811
    chosen = "11111111-1111-4111-8111-111111111111"
    data = create(client_for(club["archer1"]), kind, uid=chosen, revision_uid=chosen)
    assert data["uid"] != chosen and data["revision_uid"] != chosen


def test_a_revision_made_by_the_app_keeps_its_uid(club, kind):  # noqa: F811
    item = kind["model"].objects.create(owner=club["archer1"], **kind["payload"])
    first = record_revision(item)
    setattr(item, kind["field"], kind["new"])
    chosen = uuid.UUID("22222222-2222-4222-8222-222222222222")
    second = record_revision(item, uid=chosen)
    assert second.uid == chosen and second.number == 2 and first.uid != chosen
    assert record_revision(item, uid=uuid.uuid4()).uid == chosen  # nothing changed: no new revision, so the uid is not used


@pytest.mark.django_db(transaction=True)
def test_existing_rows_get_their_own_uid():
    """The migration adds the column empty, fills each row with its own uuid, then makes it unique."""
    executor = MigrationExecutor(connection)
    executor.migrate([("equipment", "0001_initial")])
    old = executor.loader.project_state([("equipment", "0001_initial")]).apps
    user = User.objects.create_user("old@example.org", "correct-horse-battery")
    for n in range(3):
        bow = old.get_model("equipment", "Bow").objects.create(owner_id=user.pk, name=f"Bow {n}", type="recurve")
        old.get_model("equipment", "BowRevision").objects.create(bow=bow, number=1, name=f"Bow {n}", type="recurve")
        arrows = old.get_model("equipment", "ArrowSet").objects.create(owner_id=user.pk, name=f"Arrows {n}")
        old.get_model("equipment", "ArrowSetRevision").objects.create(arrow_set=arrows, number=1, name=f"Arrows {n}")

    executor = MigrationExecutor(connection)
    executor.migrate([("equipment", "0002_uids")])
    new = executor.loader.project_state([("equipment", "0002_uids")]).apps
    for name in ("Bow", "BowRevision", "ArrowSet", "ArrowSetRevision"):
        uids = list(new.get_model("equipment", name).objects.values_list("uid", flat=True))
        assert len(uids) == 3 and len(set(uids)) == 3 and None not in uids, name
