from unittest import mock

import pytest

from core.models import Invite, Profile, Role, Team, TeamMember, User
from equipment.models import Bow
from notes.models import Note
from training.models import TrainingSession
from privacy.tests.test_delete_data import PASSWORD, fill

URL = "/api/me/delete-account/"
WORD = "DELETE ACCOUNT"


def delete(client_for, user, **body):
    return client_for(user).post(URL, {"password": PASSWORD, "confirm": WORD, **body}, format="json")


def exists(user):
    return User.objects.filter(pk=user.pk).exists()


def test_the_account_and_everything_of_it_is_deleted(client_for, club):
    fill(club["archer1"])
    Note.objects.create(team=club["a"], author=club["coach"], archer=club["archer1"], body="about", visibility="shared")
    pk = club["archer1"].pk
    res = delete(client_for, club["archer1"])
    assert res.status_code == 200, res.data
    assert res.data == {
        "deleted": {"sessions": 1, "shots": 6, "media": 0, "bows": 1, "arrow_sets": 1, "notes_about_me": 1},
        "teams_left": 1,
        "teams_deleted": 0,
    }
    assert not User.objects.filter(pk=pk).exists()
    assert not Profile.objects.filter(user_id=pk).exists() and not TeamMember.objects.filter(user_id=pk).exists()
    assert not TrainingSession.objects.filter(owner_id=pk).exists() and not Bow.objects.filter(owner_id=pk).exists()
    assert not Note.objects.exists()


def test_they_can_no_longer_log_in_or_use_their_tokens(client_for, club):
    tokens = client_for().post("/api/token/", {"email": "archer1@a.test", "password": PASSWORD}).data
    client = client_for()
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {tokens['access']}")
    assert client.get("/api/me/").status_code == 200
    delete_client = client_for(club["archer1"])
    assert delete_client.post(URL, {"password": PASSWORD, "confirm": WORD}, format="json").status_code == 200
    assert client.get("/api/me/").status_code == 401, "the access token still in the app is refused"
    assert client_for().post("/api/token/refresh/", {"refresh": tokens["refresh"]}).status_code == 401
    assert client_for().post("/api/token/", {"email": "archer1@a.test", "password": PASSWORD}).status_code == 401


def test_the_email_can_be_used_again(client_for, club, invite):
    delete(client_for, club["archer1"])
    res = client_for().post(
        "/api/register/", {"email": "archer1@a.test", "password": PASSWORD, "name": "Back", "invite_code": invite.code}
    )
    assert res.status_code == 201


def test_other_people_and_the_team_carry_on(client_for, club):
    fill(club["archer2"])
    delete(client_for, club["archer1"])
    assert User.objects.filter(pk=club["archer2"].pk).exists() and TrainingSession.objects.filter(owner=club["archer2"]).exists()
    assert Team.objects.filter(pk=club["a"].pk).exists()
    names = {m["name"] for m in client_for(club["coach"]).get(f"/api/teams/{club['a'].pk}/overview/").data}
    assert names == {"archer2"}


def test_notes_i_wrote_stay_as_written_by_a_former_coach(client_for, club):
    note = Note.objects.create(team=club["a"], author=club["coach"], archer=club["archer1"], body="keep", visibility="shared")
    delete(client_for, club["coach"])
    res = client_for(club["archer1"]).get(f"/api/notes/{note.pk}/")
    assert res.status_code == 200 and res.data["author"] is None and res.data["author_name"] == "Former coach"


def test_unused_invites_i_made_are_revoked_used_ones_stay(client_for, club):
    unused = Invite.objects.create(team=club["a"], role=Role.ADMIN, created_by=club["coach"])
    used = Invite.objects.create(team=club["a"], role=Role.ARCHER, created_by=club["coach"], used_by=club["archer1"], used_at="2026-10-01T00:00:00Z")
    delete(client_for, club["coach"])
    assert not Invite.objects.filter(pk=unused.pk).exists()
    kept = Invite.objects.get(pk=used.pk)
    assert kept.created_by is None and kept.used_by == club["archer1"]


# --- teams ---------------------------------------------------------------------------------------


def test_the_only_admin_of_a_team_with_others_must_hand_over_first(client_for, club):
    fill(club["admin"])
    res = delete(client_for, club["admin"])
    assert res.status_code == 409
    assert res.data["teams"] == [{"id": club["a"].pk, "name": "Team A", "members": 3}]
    assert "Team A" in res.data["detail"]
    assert exists(club["admin"]) and TrainingSession.objects.filter(owner=club["admin"]).exists()
    assert TeamMember.objects.filter(user=club["admin"]).exists()


def test_once_someone_else_is_admin_it_works(client_for, club):
    TeamMember.objects.filter(user=club["coach"]).update(role=Role.ADMIN)
    assert delete(client_for, club["admin"]).status_code == 200
    assert Team.objects.filter(pk=club["a"].pk).exists()


def test_being_the_only_coach_or_the_only_archer_does_not_block(client_for, club):
    assert delete(client_for, club["coach"]).status_code == 200
    assert delete(client_for, club["b_archer"]).status_code == 200


def test_a_team_i_am_alone_in_goes_with_me(client_for, club):
    TeamMember.objects.filter(team=club["b"]).exclude(user=club["b_admin"]).delete()
    note = Note.objects.create(team=club["b"], author=club["b_admin"], archer=club["b_admin"], body="note to self")
    res = delete(client_for, club["b_admin"])
    assert res.status_code == 200 and res.data["teams_deleted"] == 1 and res.data["teams_left"] == 0
    assert not Team.objects.filter(pk=club["b"].pk).exists() and not Note.objects.filter(pk=note.pk).exists()


def test_one_blocking_team_blocks_the_whole_deletion(client_for, club, join):
    """Fine as a plain member of team B, but the only admin of team A: nothing is deleted."""
    join(club["admin"], club["b"], Role.ARCHER)
    res = delete(client_for, club["admin"])
    assert res.status_code == 409 and [t["name"] for t in res.data["teams"]] == ["Team A"]
    assert TeamMember.objects.filter(user=club["admin"]).count() == 2


def test_several_blocking_teams_are_all_named(client_for, club, join):
    join(club["admin"], club["b"], Role.ADMIN)
    join(club["archer1"], club["b"], Role.ARCHER)
    TeamMember.objects.filter(team=club["b"], user=club["b_admin"]).delete()
    res = delete(client_for, club["admin"])
    assert res.status_code == 409 and {t["name"] for t in res.data["teams"]} == {"Team A", "Team B"}


# --- safety ----------------------------------------------------------------------------------------


@pytest.mark.parametrize("body", [{"password": "wrong"}, {"confirm": "DELETE"}, {"confirm": "delete account"}, {"confirm": ""}])
def test_wrong_password_or_words_delete_nothing(client_for, club, body):
    fill(club["archer1"])
    assert delete(client_for, club["archer1"], **body).status_code == 400
    assert exists(club["archer1"]) and TrainingSession.objects.filter(owner=club["archer1"]).exists()


def test_the_data_confirmation_word_does_not_delete_the_account(client_for, club):
    assert client_for(club["archer1"]).post(URL, {"password": PASSWORD, "confirm": "DELETE"}, format="json").status_code == 400
    assert exists(club["archer1"])


def test_login_is_required(client_for, db):
    assert client_for().post(URL, {"password": PASSWORD, "confirm": WORD}, format="json").status_code == 401


def test_guessing_the_password_is_slowed_down(client_for, club):
    codes = [delete(client_for, club["archer1"], password="nope").status_code for _ in range(6)]
    assert codes == [400] * 5 + [429]
    assert exists(club["archer1"])


def test_it_is_all_or_nothing(client_for, club):
    fill(club["archer1"])
    client = client_for(club["archer1"])
    client.raise_request_exception = False
    with mock.patch.object(User, "delete", side_effect=RuntimeError("disk full")):
        res = client.post(URL, {"password": PASSWORD, "confirm": WORD}, format="json")
    assert res.status_code == 500
    assert exists(club["archer1"]) and TrainingSession.objects.filter(owner=club["archer1"]).exists()
    assert Bow.objects.filter(owner=club["archer1"]).exists(), "the data was not erased either"


# --- profiles of archers without an account ---------------------------------------------------------


from training.tests.test_overview import make_session  # noqa: E402


def keep_profile(club, name="Max Muster"):
    from core.claims import managed_archer  # noqa: F401  (the same profile a coach creates in the app)
    from core.models import User

    profile = User.objects.create_managed(name)
    TeamMember.objects.create(team=club["a"], user=profile, role=Role.ARCHER)
    return profile


def test_profiles_a_coach_kept_stay_with_the_team(client_for, club):
    profile = keep_profile(club)
    session = make_session(profile, arrows=6, volume=30)
    note = Note.objects.create(team=club["a"], author=club["coach"], archer=profile, body="elbow", visibility="shared")
    assert delete(client_for, club["coach"]).status_code == 200
    assert TeamMember.objects.filter(team=club["a"], user=profile).exists()
    assert TrainingSession.objects.filter(pk=session.pk).exists()
    assert Note.objects.filter(pk=note.pk).exists()  # shown as written by a former coach


def test_a_coach_with_only_profiles_left_is_not_blocked_and_the_team_goes(client_for, club):
    from core.models import User

    TeamMember.objects.filter(team=club["a"]).exclude(user=club["admin"]).delete()
    profile = keep_profile(club)
    make_session(profile, arrows=6, volume=30)
    res = delete(client_for, club["admin"])
    assert res.status_code == 200 and res.data["teams_deleted"] == 1
    assert not Team.objects.filter(pk=club["a"].pk).exists()
    assert not User.objects.filter(pk=profile.pk).exists() and not TrainingSession.objects.filter(owner=profile).exists()


def test_a_profile_in_two_teams_survives_the_deletion_of_one_of_them(client_for, club):
    from core.models import User

    TeamMember.objects.filter(team=club["a"]).exclude(user=club["admin"]).delete()
    profile = keep_profile(club)
    TeamMember.objects.create(team=club["b"], user=profile, role=Role.ARCHER)
    assert delete(client_for, club["admin"]).status_code == 200
    assert User.objects.filter(pk=profile.pk).exists() and TeamMember.objects.filter(team=club["b"], user=profile).exists()
