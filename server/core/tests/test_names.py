"""Every account has a name, and no screen shows a whole email address in its place (#140)."""

import importlib

from django.apps import apps

from core.models import Profile, User, display_name


def patch_name(client_for, user, name):
    return client_for(user).patch("/api/me/", {"profile": {"name": name}}, format="json")


def test_a_blank_name_is_refused(client_for, club):
    for name in ("", "   "):
        assert patch_name(client_for, club["archer1"], name).status_code == 400
    club["archer1"].profile.refresh_from_db()
    assert club["archer1"].profile.name == "archer1"


def test_a_name_is_trimmed_and_a_change_without_a_name_keeps_it(client_for, club):
    assert patch_name(client_for, club["archer1"], "  Max  ").data["profile"]["name"] == "Max"
    res = client_for(club["archer1"]).patch("/api/me/", {"profile": {"units": "imperial"}}, format="json")
    assert res.status_code == 200 and res.data["profile"]["name"] == "Max"


def test_the_last_resort_is_the_part_before_the_at(club):
    Profile.objects.filter(user=club["coach"]).update(name="")
    coach = User.objects.get(pk=club["coach"].pk)
    assert display_name(coach) == "coach"
    assert "@" not in display_name(coach)


def test_an_archer_does_not_get_a_coachs_email_in_a_name(client_for, club):
    Profile.objects.filter(user=club["coach"]).update(name="")
    team = club["a"].pk
    res = client_for(club["coach"]).post("/api/notes/", {"archer": club["archer1"].pk, "team": team, "body": "Hello", "visibility": "shared"}, format="json")
    assert res.status_code == 201, res.data
    got = client_for(club["archer1"]).get("/api/notes/")
    assert got.status_code == 200 and got.data
    assert "@" not in str(got.data)


def test_the_migration_names_accounts_without_one_and_leaves_profiles_alone(club):
    Profile.objects.filter(user=club["archer2"]).update(name="")
    migration = importlib.import_module("core.migrations.0013_fill_blank_names")
    migration.fill(apps, None)
    assert Profile.objects.get(user=club["archer2"]).name == "archer2"
    assert Profile.objects.get(user=club["archer1"]).name == "archer1"
