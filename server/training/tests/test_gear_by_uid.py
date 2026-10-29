import pytest

from equipment.models import Setup

from .test_gear import arrows, bow, mine, put  # noqa: F401  (`mine` is a fixture)


def test_a_session_can_name_its_equipment_by_revision_uid(client_for, club, mine):  # noqa: F811
    res, _ = put(client_for(club["archer1"]), {"bow_revision_uid": str(mine["bow"].uid), "arrow_set_revision_uid": str(mine["arrows"].uid)})
    assert res.status_code == 201, res.data
    setup = Setup.objects.get()
    assert (setup.bow_revision, setup.arrow_set_revision) == (mine["bow"], mine["arrows"])
    assert res.data["setup_info"]["bow_revision"] == mine["bow"].pk


def test_by_uid_and_by_id_make_the_same_setup(client_for, club, mine):  # noqa: F811
    client = client_for(club["archer1"])
    put(client, {"bow_revision": mine["bow"].pk})
    res, _ = put(client, {"bow_revision_uid": str(mine["bow"].uid)})
    assert res.status_code == 201 and Setup.objects.count() == 1


def test_a_null_uid_clears_the_equipment(client_for, club, mine):  # noqa: F811
    client = client_for(club["archer1"])
    res, sid = put(client, {"bow_revision_uid": str(mine["bow"].uid)})
    assert res.data["setup"] is not None
    res, _ = put(client, {"bow_revision_uid": None}, sid)
    assert res.status_code == 200 and res.data["setup"] is None


def test_the_revision_of_somebody_else_is_refused_by_uid_too(client_for, club):
    _, theirs = bow(club["archer2"])
    res, _ = put(client_for(club["archer1"]), {"bow_revision_uid": str(theirs.uid)})
    assert res.status_code == 400 and "bow_revision_uid" in res.data
    assert Setup.objects.count() == 0


def test_an_unknown_uid_is_refused(client_for, club):
    import uuid

    res, _ = put(client_for(club["archer1"]), {"bow_revision_uid": str(uuid.uuid4())})
    assert res.status_code == 400 and "bow_revision_uid" in res.data


def test_naming_the_revision_both_ways_is_refused(client_for, club, mine):  # noqa: F811
    res, _ = put(client_for(club["archer1"]), {"bow_revision": mine["bow"].pk, "bow_revision_uid": str(mine["bow"].uid)})
    assert res.status_code == 400 and "bow_revision_uid" in res.data


def test_arrows_by_uid_still_need_a_bow(client_for, club, mine):  # noqa: F811
    res, _ = put(client_for(club["archer1"]), {"arrow_set_revision_uid": str(mine["arrows"].uid)})
    assert res.status_code == 400
