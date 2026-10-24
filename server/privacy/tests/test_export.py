import json

import pytest

from core.models import Role, TeamMember
from equipment.models import Bow, BowRevision
from notes.models import Note
from privacy.tests.test_delete_data import PASSWORD, counts, fill
from training.models import Shot, TrainingSession, VolumeEntry
from training.tests.test_overview import make_session

URL = "/api/me/export/"


def export(client_for, user, **body):
    return client_for(user).post(URL, {"password": PASSWORD, **body}, format="json")


def doc(client_for, user):
    res = export(client_for, user)
    assert res.status_code == 200, res.content
    return res.json()  # the rendered JSON, not the in-memory data


def test_it_has_the_account_the_profile_and_the_teams(client_for, club):
    club["archer1"].profile.name = "Robin"
    club["archer1"].profile.dominant_hand = "left"
    club["archer1"].profile.save()
    d = doc(client_for, club["archer1"])
    assert d["format_version"] == 1 and d["exported_at"]
    assert d["account"]["email"] == "archer1@a.test" and d["account"]["id"] == club["archer1"].pk
    assert (d["profile"]["name"], d["profile"]["dominant_hand"], d["profile"]["units"]) == ("Robin", "left", "metric")
    assert [(t["team"], t["role"], t["also_shoots"]) for t in d["teams"]] == [("Team A", "archer", False)]


def test_it_has_the_equipment_with_every_revision(client_for, club):
    fill(club["archer1"])
    bow = Bow.objects.get(owner=club["archer1"])
    BowRevision.objects.create(bow=bow, number=2, name="Hoyt Formula", type="recurve", draw_weight="38.5")
    d = doc(client_for, club["archer1"])
    [exported] = d["equipment"]["bows"]
    assert exported["name"] == "Hoyt" and exported["is_active"] is True
    assert [(r["number"], r["name"]) for r in exported["revisions"]] == [(1, "Hoyt"), (2, "Hoyt Formula")]
    assert exported["revisions"][1]["draw_weight"] == "38.5"
    assert [a["name"] for a in d["equipment"]["arrow_sets"]] == ["X10"]
    assert len(d["equipment"]["setups"]) == 1


def test_it_has_the_sessions_with_ends_shots_positions_and_volume(client_for, club):
    session = fill(club["archer1"])
    shot = Shot.objects.filter(end__session=session).order_by("index").first()
    Shot.objects.filter(pk=shot.pk).update(x=0.12, y=-0.3, spot=0, value=9, is_manual=False)
    d = doc(client_for, club["archer1"])
    [s] = d["sessions"]
    assert s["id"] == str(session.pk) and s["type"] == "scoring" and s["setup"] is not None
    [end] = s["ends"]
    assert (end["distance_m"], end["face"], len(end["shots"])) == ("18.0", "wa-40", 6)
    first = end["shots"][0]
    assert (first["x"], first["y"], first["value"], first["is_manual"]) == (0.12, -0.3, 9, False)
    assert [(v["arrow_count"]) for v in s["volume_entries"]] == [30]


def test_it_has_the_notes_about_me_the_coach_only_ones_too_and_the_notes_i_wrote(client_for, club):
    Note.objects.create(team=club["a"], author=club["coach"], archer=club["archer1"], body="shared one", visibility="shared")
    Note.objects.create(team=club["a"], author=club["coach"], archer=club["archer1"], body="private one", visibility="coach_only")
    Note.objects.create(team=club["a"], author=club["coach"], archer=club["archer2"], body="about someone else")
    d = doc(client_for, club["archer1"])
    assert {(n["body"], n["visibility"], n["author"]) for n in d["notes_about_me"]} == {
        ("shared one", "shared", "coach"),
        ("private one", "coach_only", "coach"),
    }
    assert d["notes_i_wrote"] == []
    coach = doc(client_for, club["coach"])
    assert {(n["body"], n["about"]) for n in coach["notes_i_wrote"]} == {
        ("shared one", "archer1"), ("private one", "archer1"), ("about someone else", "archer2"),
    }
    assert coach["notes_about_me"] == []


def test_notes_by_a_deleted_coach_say_former_coach(client_for, club):
    Note.objects.create(team=club["a"], author=None, archer=club["archer1"], body="old", visibility="shared")
    assert doc(client_for, club["archer1"])["notes_about_me"][0]["author"] == "Former coach"


def test_it_has_nothing_of_anybody_else(client_for, club):
    fill(club["archer1"])
    other = fill(club["archer2"])
    Note.objects.create(team=club["a"], author=club["coach"], archer=club["archer2"], body="secret about two")
    text = client_for(club["archer1"]).post(URL, {"password": PASSWORD}, format="json").content.decode()
    for needle in ("archer2", "coach@a.test", "admin@a.test", "secret about two", str(other.pk)):
        assert needle not in text, needle
    assert "password" not in text.lower().replace('"password"', "")


def test_nothing_secret_about_the_login_is_in_it(client_for, club):
    text = client_for(club["archer1"]).post(URL, {"password": PASSWORD}, format="json").content.decode()
    assert "pbkdf2" not in text and "md5" not in text and PASSWORD not in text
    assert "is_superuser" not in text and "is_staff" not in text


def test_a_coach_who_shares_their_training_exports_only_their_own(client_for, club):
    fill(club["coach"])
    fill(club["archer1"])
    TeamMember.objects.filter(user=club["coach"]).update(also_shoots=True)
    d = doc(client_for, club["coach"])
    assert [t["also_shoots"] for t in d["teams"]] == [True]
    assert len(d["sessions"]) == 1 and d["sessions"][0]["owner"] == club["coach"].pk


def test_a_new_account_has_an_empty_but_complete_export(client_for, club):
    d = doc(client_for, club["archer2"])
    assert d["sessions"] == [] and d["equipment"] == {"bows": [], "arrow_sets": [], "setups": []}
    assert d["notes_about_me"] == [] and d["notes_i_wrote"] == [] and d["media"] == []
    assert set(d) == {"format_version", "exported_at", "account", "profile", "teams", "equipment", "sessions", "media", "notes_about_me", "notes_i_wrote"}


def test_exporting_changes_nothing(client_for, club):
    fill(club["archer1"])
    before = counts(club["archer1"])
    doc(client_for, club["archer1"])
    doc(client_for, club["archer1"])
    assert counts(club["archer1"]) == before
    assert TrainingSession.objects.count() == 1 and VolumeEntry.objects.count() == 1


def test_the_file_has_a_name_for_browsers(client_for, club):
    res = export(client_for, club["archer1"])
    assert res["Content-Disposition"].startswith('attachment; filename="fletchr-data-')


@pytest.mark.parametrize("body", [{"password": "wrong"}, {"password": ""}, {}])
def test_it_needs_the_right_password(client_for, club, body):
    fill(club["archer1"])
    res = client_for(club["archer1"]).post(URL, body, format="json")
    assert res.status_code == 400
    assert b"archer1@a.test" not in res.content


def test_login_is_required(client_for, db):
    assert client_for().post(URL, {"password": PASSWORD}, format="json").status_code == 401


def test_guessing_the_password_is_slowed_down(client_for, club):
    codes = [client_for(club["archer1"]).post(URL, {"password": "no"}, format="json").status_code for _ in range(6)]
    assert codes == [400] * 5 + [429]


def test_it_is_valid_json_that_survives_a_round_trip(client_for, club):
    fill(club["archer1"])
    raw = client_for(club["archer1"]).post(URL, {"password": PASSWORD}, format="json").content
    assert json.loads(json.dumps(json.loads(raw))) == json.loads(raw)


def test_private_notes_are_in_the_authors_export_not_in_the_archers(client_for, club):
    from notes.models import Note

    Note.objects.create(team=club["a"], author=club["coach"], archer=club["archer1"], body="mine alone", visibility="private")
    Note.objects.create(team=club["a"], author=club["coach"], archer=club["archer1"], body="for the coaches", visibility="coach_only")
    about = client_for(club["archer1"]).post("/api/me/export/", {"password": "correct-horse-battery"}, format="json")
    assert about.status_code == 200
    assert [n["body"] for n in about.data["notes_about_me"]] == ["for the coaches"]
    wrote = client_for(club["coach"]).post("/api/me/export/", {"password": "correct-horse-battery"}, format="json")
    assert {n["body"] for n in wrote.data["notes_i_wrote"]} == {"mine alone", "for the coaches"}


def test_what_an_archer_took_over_from_a_profile_is_in_their_export(client_for, club):
    from core import claims
    from core.models import ClaimCode, User

    profile = User.objects.create_managed("Max Muster")
    TeamMember.objects.create(team=club["a"], user=profile, role=Role.ARCHER)
    make_session(profile, arrows=6, volume=30)
    Note.objects.create(team=club["a"], author=club["coach"], archer=profile, body="shared note", visibility="shared")
    Note.objects.create(team=club["a"], author=club["coach"], archer=profile, body="for coaches", visibility="coach_only")
    Note.objects.create(team=club["a"], author=club["coach"], archer=profile, body="only the coach", visibility="private")
    code = ClaimCode.objects.create(profile=profile, team=club["a"], created_by=club["coach"]).code
    newcomer = club["archer1"]
    TeamMember.objects.filter(user=newcomer).delete()
    claims.claim_profile(code, newcomer)
    d = doc(client_for, newcomer)
    assert len(d["sessions"]) == 1 and d["sessions"][0]["ends"][0]["shots"]
    assert sorted(n["body"] for n in d["notes_about_me"]) == ["for coaches", "shared note"]  # not what a coach keeps only for themselves


def test_the_notes_on_a_session_are_in_the_export(client_for, club):
    session = fill(club["archer1"])
    TrainingSession.objects.filter(pk=session.pk).update(weather="rain", physical_rating=2, mental_rating=5, goals="Relax", notes="Cold hands")
    [exported] = doc(client_for, club["archer1"])["sessions"]
    assert (exported["weather"], exported["physical_rating"], exported["mental_rating"], exported["goals"], exported["notes"]) == ("rain", 2, 5, "Relax", "Cold hands")
