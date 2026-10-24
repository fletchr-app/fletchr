from unittest import mock

import pytest

from core.models import Profile, TeamMember
from equipment.models import ArrowSet, ArrowSetRevision, Bow, BowRevision, Setup
from notes.models import Note
from training.models import End, Shot, TrainingSession, VolumeEntry
from training.tests.test_overview import make_session

PASSWORD = "correct-horse-battery"
URL = "/api/me/delete-data/"


def give_gear(user, name="Hoyt"):
    bow = Bow.objects.create(owner=user, name=name, type="recurve")
    bow_rev = BowRevision.objects.create(bow=bow, number=1, name=name, type="recurve")
    Bow.objects.filter(pk=bow.pk).update(current_revision=bow_rev)
    arrows = ArrowSet.objects.create(owner=user, name="X10")
    arrow_rev = ArrowSetRevision.objects.create(arrow_set=arrows, number=1, name="X10")
    ArrowSet.objects.filter(pk=arrows.pk).update(current_revision=arrow_rev)
    return Setup.objects.create(owner=user, bow_revision=bow_rev, arrow_set_revision=arrow_rev)


def fill(user):
    """A user with a session (6 shots, volume, a setup in use), equipment, and a coach note about them."""
    setup = give_gear(user)
    session = make_session(user, arrows=6, volume=30)
    TrainingSession.objects.filter(pk=session.pk).update(setup=setup)
    return session


def delete(client_for, user, **body):
    return client_for(user).post(URL, {"password": PASSWORD, "confirm": "DELETE", **body}, format="json")


def counts(user):
    return {
        "sessions": TrainingSession.objects.filter(owner=user).count(),
        "shots": Shot.objects.filter(end__session__owner=user).count(),
        "volume": VolumeEntry.objects.filter(session__owner=user).count(),
        "bows": Bow.objects.filter(owner=user).count(),
        "arrow_sets": ArrowSet.objects.filter(owner=user).count(),
        "setups": Setup.objects.filter(owner=user).count(),
        "revisions": BowRevision.objects.filter(bow__owner=user).count() + ArrowSetRevision.objects.filter(arrow_set__owner=user).count(),
    }


def test_it_deletes_the_training_and_the_equipment_and_says_how_much(client_for, club):
    fill(club["archer1"])
    note = Note.objects.create(team=club["a"], author=club["coach"], archer=club["archer1"], body="x", visibility="shared")
    res = delete(client_for, club["archer1"])
    assert res.status_code == 200, res.data
    assert res.data == {"deleted": {"sessions": 1, "shots": 6, "media": 0, "bows": 1, "arrow_sets": 1, "notes_about_me": 1}}
    assert set(counts(club["archer1"]).values()) == {0}
    assert not Note.objects.filter(pk=note.pk).exists()


def test_the_account_the_profile_and_the_teams_stay(client_for, club):
    fill(club["archer1"])
    delete(client_for, club["archer1"])
    user = club["archer1"]
    user.refresh_from_db()
    assert Profile.objects.filter(user=user).exists()
    assert TeamMember.objects.filter(user=user, team=club["a"], role="archer").exists()
    login = client_for().post("/api/token/", {"email": "archer1@a.test", "password": PASSWORD})
    assert login.status_code == 200


def test_nobody_elses_data_is_touched(client_for, club):
    fill(club["archer1"])
    other = fill(club["archer2"])
    before = counts(club["archer2"])
    note = Note.objects.create(team=club["a"], author=club["coach"], archer=club["archer2"], body="keep", visibility="shared")
    delete(client_for, club["archer1"])
    assert counts(club["archer2"]) == before
    assert TrainingSession.objects.filter(pk=other.pk).exists() and Note.objects.filter(pk=note.pk).exists()
    assert Bow.objects.filter(owner=club["archer2"]).exists()


def test_coach_only_notes_about_me_go_too_but_notes_i_wrote_stay(client_for, club):
    Note.objects.create(team=club["a"], author=club["admin"], archer=club["coach"], body="about the coach", visibility="coach_only")
    wrote = Note.objects.create(team=club["a"], author=club["coach"], archer=club["archer1"], body="about an archer")
    TeamMember.objects.filter(user=club["coach"]).update(also_shoots=True)
    delete(client_for, club["coach"])
    assert list(Note.objects.values_list("pk", flat=True)) == [wrote.pk]
    assert Note.objects.get().author == club["coach"]


def test_coaches_no_longer_see_the_sessions(client_for, club):
    fill(club["archer1"])
    assert len(client_for(club["coach"]).get("/api/sessions/").data) == 1
    delete(client_for, club["archer1"])
    assert client_for(club["coach"]).get("/api/sessions/").data == []
    rows = {r["name"]: r for r in client_for(club["coach"]).get(f"/api/teams/{club['a'].pk}/overview/").data}
    assert rows["archer1"]["last_session"] is None and rows["archer1"]["arrows_7d"] == 0


def test_with_nothing_to_delete_it_still_works(client_for, club):
    res = delete(client_for, club["archer2"])
    assert res.status_code == 200 and set(res.data["deleted"].values()) == {0}


def test_it_can_be_done_twice(client_for, club):
    fill(club["archer1"])
    assert delete(client_for, club["archer1"]).status_code == 200
    assert set(delete(client_for, club["archer1"]).data["deleted"].values()) == {0}


@pytest.mark.parametrize("body", [{"password": "wrong"}, {"confirm": "delete me"}, {"confirm": ""}, {"password": ""}])
def test_wrong_password_or_confirmation_deletes_nothing(client_for, club, body):
    fill(club["archer1"])
    before = counts(club["archer1"])
    res = delete(client_for, club["archer1"], **body)
    assert res.status_code == 400
    assert counts(club["archer1"]) == before


def test_both_fields_are_needed(client_for, club):
    fill(club["archer1"])
    assert client_for(club["archer1"]).post(URL, {}, format="json").status_code == 400
    assert client_for(club["archer1"]).post(URL, {"password": PASSWORD}, format="json").status_code == 400
    assert counts(club["archer1"])["sessions"] == 1


def test_the_confirmation_word_ignores_surrounding_spaces(client_for, club):
    assert delete(client_for, club["archer1"], confirm="  DELETE ").status_code == 200


def test_login_is_required(client_for, db):
    assert client_for().post(URL, {"password": PASSWORD, "confirm": "DELETE"}, format="json").status_code == 401


def test_guessing_the_password_is_slowed_down(client_for, club):
    fill(club["archer1"])
    codes = [delete(client_for, club["archer1"], password="nope").status_code for _ in range(6)]
    assert codes == [400] * 5 + [429]
    assert counts(club["archer1"])["sessions"] == 1


def test_it_is_all_or_nothing(client_for, club):
    fill(club["archer1"])
    before = counts(club["archer1"])
    client = client_for(club["archer1"])
    client.raise_request_exception = False
    with mock.patch("privacy.services._delete_equipment", side_effect=RuntimeError("disk full")):
        res = client.post(URL, {"password": PASSWORD, "confirm": "DELETE"}, format="json")
    assert res.status_code == 500
    assert counts(club["archer1"]) == before, "the sessions were not deleted either"
