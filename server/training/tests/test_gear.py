import uuid

import pytest

from equipment.models import ArrowSet, ArrowSetRevision, Bow, BowRevision, Setup
from training.models import TrainingSession

SESSION = {"started_at": "2026-10-18T09:00:00Z", "type": "scoring"}


def new_id():
    return str(uuid.uuid4())


def bow(owner, name="Hoyt", number=1):
    b = Bow.objects.create(owner=owner, name=name, type="recurve")
    r = BowRevision.objects.create(bow=b, number=number, name=name, type="recurve")
    Bow.objects.filter(pk=b.pk).update(current_revision=r)
    return b, r


def arrows(owner, name="X10"):
    a = ArrowSet.objects.create(owner=owner, name=name)
    r = ArrowSetRevision.objects.create(arrow_set=a, number=1, name=name)
    ArrowSet.objects.filter(pk=a.pk).update(current_revision=r)
    return a, r


@pytest.fixture
def mine(club):
    _, b = bow(club["archer1"])
    _, a = arrows(club["archer1"])
    return {"bow": b, "arrows": a}


def put(client, body, sid=None):
    sid = sid or new_id()
    return client.put(f"/api/sessions/{sid}/", {**SESSION, **body}, format="json"), sid


def test_a_session_started_with_a_bow_and_arrows_gets_the_setup(client_for, club, mine):
    res, _ = put(client_for(club["archer1"]), {"bow_revision": mine["bow"].pk, "arrow_set_revision": mine["arrows"].pk})
    assert res.status_code == 201, res.data
    setup = Setup.objects.get()
    assert (setup.bow_revision, setup.arrow_set_revision, setup.owner) == (mine["bow"], mine["arrows"], club["archer1"])
    assert res.data["setup"] == setup.pk
    assert res.data["setup_info"] == {
        "bow_name": "Hoyt", "bow_type": "recurve", "bow_revision": mine["bow"].pk, "bow_revision_number": 1,
        "arrow_set_name": "X10", "arrow_set_revision": mine["arrows"].pk, "arrow_set_revision_number": 1,
    }


def test_a_bow_alone_is_enough(client_for, club, mine):
    res, _ = put(client_for(club["archer1"]), {"bow_revision": mine["bow"].pk})
    assert res.status_code == 201
    assert res.data["setup_info"]["arrow_set_name"] is None
    assert Setup.objects.get().arrow_set_revision is None


def test_repeating_the_upload_or_starting_another_session_reuses_the_setup(client_for, club, mine):
    client = client_for(club["archer1"])
    body = {"bow_revision": mine["bow"].pk, "arrow_set_revision": mine["arrows"].pk}
    _, sid = put(client, body)
    put(client, body, sid)
    put(client, body)
    assert Setup.objects.count() == 1
    assert TrainingSession.objects.count() == 2
    bow_only = {"bow_revision": mine["bow"].pk}
    put(client, bow_only)
    put(client, bow_only)
    assert Setup.objects.count() == 2, "one more for the bow without arrows, not one per session"


def test_no_equipment_is_fine(client_for, club):
    res, _ = put(client_for(club["archer1"]), {})
    assert res.status_code == 201 and res.data["setup"] is None and res.data["setup_info"] is None


def test_leaving_the_equipment_out_keeps_it_and_null_clears_it(client_for, club, mine):
    client = client_for(club["archer1"])
    _, sid = put(client, {"bow_revision": mine["bow"].pk})
    kept, _ = put(client, {"location": "Hall"}, sid)
    assert kept.data["setup"] is not None
    cleared, _ = put(client, {"bow_revision": None, "arrow_set_revision": None}, sid)
    assert cleared.data["setup"] is None and cleared.data["setup_info"] is None


def test_the_equipment_can_be_changed_later(client_for, club, mine):
    client = client_for(club["archer1"])
    _, sid = put(client, {"bow_revision": mine["bow"].pk})
    res, _ = put(client, {"bow_revision": mine["bow"].pk, "arrow_set_revision": mine["arrows"].pk}, sid)
    assert res.status_code == 200 and res.data["setup_info"]["arrow_set_name"] == "X10"


def test_a_session_keeps_the_bow_as_it_was_when_the_bow_changes(client_for, club, mine):
    client = client_for(club["archer1"])
    _, sid = put(client, {"bow_revision": mine["bow"].pk})
    newer = BowRevision.objects.create(bow=mine["bow"].bow, number=2, name="Hoyt Formula", type="recurve")
    Bow.objects.filter(pk=mine["bow"].bow_id).update(current_revision=newer)
    info = client.get(f"/api/sessions/{sid}/").data["setup_info"]
    assert (info["bow_name"], info["bow_revision_number"]) == ("Hoyt", 1)
    res, _ = put(client, {"bow_revision": newer.pk}, sid)
    assert (res.data["setup_info"]["bow_name"], res.data["setup_info"]["bow_revision_number"]) == ("Hoyt Formula", 2)


def test_only_my_own_equipment(client_for, club, mine):
    client = client_for(club["archer2"])
    assert put(client, {"bow_revision": mine["bow"].pk})[0].status_code == 400
    _, own = bow(club["archer2"])
    assert put(client, {"bow_revision": own.pk, "arrow_set_revision": mine["arrows"].pk})[0].status_code == 400
    assert put(client_for(club["coach"]), {"bow_revision": mine["bow"].pk})[0].status_code == 400
    assert not Setup.objects.exists() and not TrainingSession.objects.exists()


def test_arrows_need_a_bow(client_for, club, mine):
    res, _ = put(client_for(club["archer1"]), {"arrow_set_revision": mine["arrows"].pk})
    assert res.status_code == 400 and "arrow_set_revision" in res.data
    res, _ = put(client_for(club["archer1"]), {"bow_revision": None, "arrow_set_revision": mine["arrows"].pk})
    assert res.status_code == 400


def test_unknown_revisions_are_refused(client_for, club):
    assert put(client_for(club["archer1"]), {"bow_revision": 99999})[0].status_code == 400


def test_the_coach_sees_the_equipment_in_the_detail(client_for, club, mine):
    _, sid = put(client_for(club["archer1"]), {"bow_revision": mine["bow"].pk, "arrow_set_revision": mine["arrows"].pk})
    info = client_for(club["coach"]).get(f"/api/sessions/{sid}/").data["setup_info"]
    assert (info["bow_name"], info["arrow_set_name"]) == ("Hoyt", "X10")
