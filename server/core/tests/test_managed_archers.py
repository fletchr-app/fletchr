import uuid
from datetime import timedelta

import pytest
from django.utils import timezone

from core.models import ClaimCode, Role, Team, TeamMember, User
from notes.models import Note
from training.models import TrainingSession

SESSION = {"started_at": "2026-10-18T09:00:00Z", "type": "scoring", "environment": "indoor", "location": "Hall"}
END = {"index": 0, "distance_m": "18.0", "face": "wa-40", "arrows_per_end": 3, "shots": [{"id": "", "x": 0.0, "y": 0.0}]}


def new_id():
    return str(uuid.uuid4())


def results(res):
    return res.data["results"] if isinstance(res.data, dict) else res.data


def create(client, team, name="Max Muster"):
    return client.post(f"/api/teams/{team.pk}/archers/", {"name": name}, format="json")


@pytest.fixture
def managed(client_for, club):
    """A profile that the coach of team A keeps."""
    res = create(client_for(club["coach"]), club["a"])
    assert res.status_code == 201
    return User.objects.get(pk=res.data["user_id"])


def claim_code(client_for, club, profile):
    res = client_for(club["coach"]).post(f"/api/teams/{club['a'].pk}/archers/{profile.pk}/claim-code/")
    assert res.status_code == 201
    return res.data["code"]


# --- creating and managing profiles -----------------------------------------------------------


def test_coach_adds_an_archer_without_an_account(client_for, club):
    res = create(client_for(club["coach"]), club["a"], "  Max Muster ")
    assert res.status_code == 201
    assert (res.data["name"], res.data["email"], res.data["managed"], res.data["role"]) == ("Max Muster", "", True, "archer")
    user = User.objects.get(pk=res.data["user_id"])
    assert user.is_managed and not user.has_usable_password() and not user.is_active
    assert TeamMember.objects.filter(team=club["a"], user=user, role=Role.ARCHER).exists()


def test_admin_may_too_but_archers_and_outsiders_may_not(client_for, club):
    assert create(client_for(club["admin"]), club["a"]).status_code == 201
    assert create(client_for(club["archer1"]), club["a"]).status_code == 403
    assert create(client_for(club["b_admin"]), club["a"]).status_code == 404
    assert create(client_for(club["coach"]), club["a"], "  ").status_code == 400


def test_nobody_can_sign_in_as_a_profile(client_for, club, managed):
    res = client_for().post("/api/token/", {"email": managed.email, "password": "correct-horse-battery"})
    assert res.status_code == 401


def test_coaches_see_profiles_in_the_member_list_without_the_made_up_address(client_for, club, managed):
    members = results(client_for(club["coach"]).get(f"/api/teams/{club['a'].pk}/members/"))
    row = next(m for m in members if m["user_id"] == managed.pk)
    assert row["managed"] is True and row["email"] == ""
    archer = results(client_for(club["archer1"]).get(f"/api/teams/{club['a'].pk}/members/"))
    assert managed.pk not in {m["user_id"] for m in archer}


def test_rename_and_delete_a_profile(client_for, club, managed):
    client = client_for(club["coach"])
    url = f"/api/teams/{club['a'].pk}/archers/{managed.pk}/"
    assert client.patch(url, {"name": "Maxi"}, format="json").data["name"] == "Maxi"
    Note.objects.create(team=club["a"], author=club["coach"], archer=managed, body="elbow higher")
    TrainingSession.objects.create(id=new_id(), owner=managed, started_at=timezone.now(), type="scoring")
    assert client.delete(url).status_code == 204
    assert not User.objects.filter(pk=managed.pk).exists()
    assert not Note.objects.exists() and not TrainingSession.objects.exists()


def test_only_profiles_of_my_own_team_can_be_changed(client_for, club, managed):
    other = f"/api/teams/{club['b'].pk}/archers/{managed.pk}/"
    assert client_for(club["b_admin"]).patch(other, {"name": "x"}, format="json").status_code == 404
    real = f"/api/teams/{club['a'].pk}/archers/{club['archer1'].pk}/"
    assert client_for(club["coach"]).delete(real).status_code == 404  # a real account is not a profile
    assert User.objects.filter(pk=club["archer1"].pk).exists()
    assert client_for(club["archer1"]).delete(f"/api/teams/{club['a'].pk}/archers/{managed.pk}/").status_code == 403


def test_archer_info_for_the_screen(client_for, club, managed):
    res = client_for(club["coach"]).get(f"/api/archers/{managed.pk}/")
    assert res.data == {
        "id": managed.pk, "name": "Max Muster", "managed": True, "team_id": club["a"].pk, "team_name": "Team A",
        "dominant_hand": "", "dominant_eye": "", "age": None, "date_of_birth": None,
        "video_allowed": True, "video_consent_at": None, "video_consent_by": None,
    }
    assert client_for(club["b_admin"]).get(f"/api/archers/{managed.pk}/").status_code == 404
    assert client_for(club["archer1"]).get(f"/api/archers/{managed.pk}/").status_code == 404


def test_the_team_overview_lists_profiles(client_for, club, managed):
    rows = client_for(club["coach"]).get(f"/api/teams/{club['a'].pk}/overview/").data
    assert next(r for r in rows if r["user_id"] == managed.pk)["managed"] is True


# --- coach-entered sessions -------------------------------------------------------------------


def test_coach_logs_a_session_for_a_profile(client_for, club, managed):
    client = client_for(club["coach"])
    sid = new_id()
    res = client.put(f"/api/sessions/{sid}/?owner={managed.pk}", SESSION, format="json")
    assert res.status_code == 201 and res.data["owner"] == managed.pk
    shot = {"id": new_id(), "x": 0.0, "y": 0.0}
    res = client.put(f"/api/sessions/{sid}/ends/{new_id()}/", {**END, "shots": [shot]}, format="json")
    assert res.status_code == 201
    assert client.put(f"/api/sessions/{sid}/", {**SESSION, "location": "Outdoors"}, format="json").status_code == 200
    assert TrainingSession.objects.get(pk=sid).location == "Outdoors"
    assert client.get(f"/api/stats/?owner={managed.pk}").status_code == 200
    assert client.delete(f"/api/sessions/{sid}/").status_code == 204


def test_nobody_else_writes_sessions_for_a_profile(client_for, club, managed):
    url = f"/api/sessions/{new_id()}/?owner={managed.pk}"
    assert client_for(club["archer1"]).put(url, SESSION, format="json").status_code == 404
    assert client_for(club["b_admin"]).put(url, SESSION, format="json").status_code == 404
    # nor for a real account, even one the coach may read
    real = f"/api/sessions/{new_id()}/?owner={club['archer1'].pk}"
    assert client_for(club["coach"]).put(real, SESSION, format="json").status_code == 404
    assert not TrainingSession.objects.exists()


def test_an_archer_cannot_change_a_profiles_session(client_for, club, managed):
    sid = new_id()
    assert client_for(club["coach"]).put(f"/api/sessions/{sid}/?owner={managed.pk}", SESSION, format="json").status_code == 201
    assert client_for(club["archer1"]).put(f"/api/sessions/{sid}/", SESSION, format="json").status_code == 404
    assert client_for(club["b_admin"]).delete(f"/api/sessions/{sid}/").status_code == 404


# --- claiming ---------------------------------------------------------------------------------


def test_claim_code_replaces_the_earlier_one(client_for, club, managed):
    first = claim_code(client_for, club, managed)
    second = claim_code(client_for, club, managed)
    assert first != second and list(ClaimCode.objects.values_list("code", flat=True)) == [second]
    assert client_for(club["archer1"]).post(f"/api/teams/{club['a'].pk}/archers/{managed.pk}/claim-code/").status_code == 403


def test_preview_says_what_a_code_would_do(client_for, club, managed, invite):
    code = claim_code(client_for, club, managed)
    claim = client_for().post("/api/codes/preview/", {"invite_code": code.lower()}, format="json")
    assert claim.status_code == 200 and claim.data == {"kind": "claim", "team_name": "Team A", "profile_name": "Max Muster"}
    plain = client_for().post("/api/codes/preview/", {"invite_code": invite.code}, format="json")
    assert plain.data == {"kind": "invite", "team_name": "Team A", "profile_name": None}
    assert client_for().post("/api/codes/preview/", {"invite_code": "NOPE"}, format="json").status_code == 400


def test_an_existing_archer_takes_over_a_profile(client_for, club, managed, make_user, join):
    me = make_user("max@x.test", "Max")
    join(me, club["b"], Role.ARCHER)
    TrainingSession.objects.create(id=new_id(), owner=me, started_at=timezone.now(), type="volume")
    sid = new_id()
    client_for(club["coach"]).put(f"/api/sessions/{sid}/?owner={managed.pk}", SESSION, format="json")
    private = Note.objects.create(team=club["a"], author=club["coach"], archer=managed, body="elbow higher", visibility="coach_only")
    shared = Note.objects.create(team=club["a"], author=club["coach"], archer=managed, body="well done", visibility="shared")
    code = claim_code(client_for, club, managed)

    res = client_for(me).post("/api/claims/redeem/", {"invite_code": code}, format="json")
    assert res.status_code == 201 and res.data["name"] == "Team A" and res.data["my_role"] == "archer"
    assert not User.objects.filter(pk=managed.pk).exists() and not ClaimCode.objects.exists()
    assert {t.name for t in Team.objects.filter(memberships__user=me)} == {"Team A", "Team B"}
    assert TrainingSession.objects.get(pk=sid).owner == me and TrainingSession.objects.filter(owner=me).count() == 2
    assert Note.objects.filter(archer=me).count() == 2
    # the coach still sees the sessions, the archer sees only what was shared with them
    assert client_for(club["coach"]).get(f"/api/sessions/{sid}/").status_code == 200
    notes = results(client_for(me).get("/api/notes/"))
    assert [n["id"] for n in notes] == [shared.pk] and private.pk not in [n["id"] for n in notes]
    assert client_for(me).put(f"/api/sessions/{sid}/", SESSION, format="json").status_code == 200  # theirs now


def test_taking_over_when_already_in_the_team_keeps_the_own_membership(client_for, club, managed):
    code = claim_code(client_for, club, managed)
    res = client_for(club["archer1"]).post("/api/claims/redeem/", {"invite_code": code}, format="json")
    assert res.status_code == 201
    assert TeamMember.objects.filter(team=club["a"], user=club["archer1"]).count() == 1
    assert not User.objects.filter(pk=managed.pk).exists()


def test_a_coach_cannot_take_over_an_archer_profile(client_for, club, managed):
    code = claim_code(client_for, club, managed)
    res = client_for(club["coach"]).post("/api/claims/redeem/", {"invite_code": code}, format="json")
    assert res.status_code == 400 and "coach" in str(res.data)
    assert User.objects.filter(pk=managed.pk).exists()


def test_a_code_works_once_and_expires(client_for, club, managed, make_user):
    code = claim_code(client_for, club, managed)
    assert client_for(make_user("a@x.test")).post("/api/claims/redeem/", {"invite_code": code}, format="json").status_code == 201
    assert client_for(make_user("b@x.test")).post("/api/claims/redeem/", {"invite_code": code}, format="json").status_code == 400
    other = User.objects.create_managed("Erika")
    TeamMember.objects.create(team=club["a"], user=other, role=Role.ARCHER)
    old = ClaimCode.objects.create(profile=other, team=club["a"], expires_at=timezone.now() - timedelta(days=1))
    assert client_for(make_user("c@x.test")).post("/api/claims/redeem/", {"invite_code": old.code}, format="json").status_code == 400
    assert User.objects.filter(pk=other.pk).exists()


def test_signing_up_with_a_claim_code_takes_over_the_profile(client_for, club, managed):
    sid = new_id()
    client_for(club["coach"]).put(f"/api/sessions/{sid}/?owner={managed.pk}", SESSION, format="json")
    code = claim_code(client_for, club, managed)
    body = {"email": "max@x.test", "password": "correct-horse-battery", "name": "Max", "invite_code": code}
    res = client_for().post("/api/register/", body, format="json")
    assert res.status_code == 201
    user = User.objects.get(email="max@x.test")
    assert TrainingSession.objects.get(pk=sid).owner == user
    assert TeamMember.objects.filter(team=club["a"], user=user, role=Role.ARCHER).exists()
    assert not User.objects.filter(pk=managed.pk).exists()


def test_a_failed_claim_leaves_no_account_behind(client_for, club):
    body = {"email": "max@x.test", "password": "correct-horse-battery", "name": "Max", "invite_code": "WRONG"}
    assert client_for().post("/api/register/", body, format="json").status_code == 400
    assert not User.objects.filter(email="max@x.test").exists()
