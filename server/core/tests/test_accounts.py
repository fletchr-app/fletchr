from datetime import timedelta

import pytest
from django.core.management import call_command
from django.utils import timezone

from core.models import Invite, Role, TeamMember, User

REGISTER = {"email": "New@Example.com", "password": "correct-horse-battery", "name": "New Archer"}


def test_health_is_public(client_for):
    assert client_for().get("/api/health/").status_code == 200


def test_register_with_invite_joins_team_with_invite_role(client_for, club, invite):
    invite.role = Role.COACH
    invite.save()
    res = client_for().post("/api/register/", {**REGISTER, "invite_code": invite.code})
    assert res.status_code == 201
    assert res.data["access"] and res.data["refresh"]
    user = User.objects.get(email="new@example.com")
    assert user.profile.name == "New Archer"
    assert TeamMember.objects.get(user=user).role == Role.COACH
    invite.refresh_from_db()
    assert invite.used_by == user


def test_register_accepts_lowercase_code(client_for, invite):
    res = client_for().post("/api/register/", {**REGISTER, "invite_code": invite.code.lower()})
    assert res.status_code == 201


def test_register_without_code_fails(client_for, db):
    res = client_for().post("/api/register/", REGISTER)
    assert res.status_code == 400
    assert not User.objects.filter(email="new@example.com").exists()


@pytest.mark.parametrize("state", ["unknown", "used", "expired"])
def test_register_with_bad_code_fails_and_leaves_no_account(client_for, club, invite, state):
    code = "NOSUCHCODE"
    if state == "used":
        invite.used_at, invite.used_by, code = timezone.now(), club["archer1"], invite.code
        invite.save()
    if state == "expired":
        invite.expires_at, code = timezone.now() - timedelta(minutes=1), invite.code
        invite.save()
    res = client_for().post("/api/register/", {**REGISTER, "invite_code": code})
    assert res.status_code == 400
    assert not User.objects.filter(email="new@example.com").exists()


def test_register_rejects_duplicate_email_and_weak_password(client_for, club, invite):
    res = client_for().post("/api/register/", {**REGISTER, "email": "coach@a.test", "invite_code": invite.code})
    assert res.status_code == 400
    res = client_for().post("/api/register/", {**REGISTER, "password": "12345678", "invite_code": invite.code})
    assert res.status_code == 400
    invite.refresh_from_db()
    assert invite.used_at is None


def test_login_with_email(client_for, club):
    res = client_for().post("/api/token/", {"email": "coach@a.test", "password": "correct-horse-battery"})
    assert res.status_code == 200 and "access" in res.data


def test_invite_attempts_are_throttled(client_for, club):
    client = client_for(club["archer1"])
    codes = [client.post("/api/invites/redeem/", {"invite_code": "WRONG"}).status_code for _ in range(21)]
    assert codes[:20] == [400] * 20
    assert codes[20] == 429


def test_existing_user_joins_second_team(client_for, club):
    invite = Invite.objects.create(team=club["b"], role=Role.ARCHER, created_by=club["b_admin"])
    res = client_for(club["archer1"]).post("/api/invites/redeem/", {"invite_code": invite.code})
    assert res.status_code == 201 and res.data["my_role"] == "archer"
    teams = client_for(club["archer1"]).get("/api/teams/").data
    assert {t["name"] for t in teams} == {"Team A", "Team B"}


def test_redeeming_for_a_team_you_are_in_fails(client_for, club, invite):
    res = client_for(club["archer1"]).post("/api/invites/redeem/", {"invite_code": invite.code})
    assert res.status_code == 400
    invite.refresh_from_db()
    assert invite.used_at is None


def test_me_get_and_patch(client_for, club):
    client = client_for(club["archer1"])
    assert client.get("/api/me/").data["email"] == "archer1@a.test"
    res = client.patch("/api/me/", {"profile": {"name": "Robin", "dominant_hand": "left"}}, format="json")
    assert res.status_code == 200
    club["archer1"].profile.refresh_from_db()
    assert club["archer1"].profile.name == "Robin"
    client.patch("/api/me/", {"email": "evil@x.test"}, format="json")
    club["archer1"].refresh_from_db()
    assert club["archer1"].email == "archer1@a.test"


@pytest.mark.parametrize("url", ["/api/me/", "/api/teams/", "/api/teams/1/members/", "/api/teams/1/invites/"])
def test_endpoints_require_login(client_for, db, url):
    assert client_for().get(url).status_code == 401


def test_schema_is_staff_only(client_for, club):
    assert client_for().get("/api/schema/").status_code == 401
    assert client_for(club["admin"]).get("/api/schema/").status_code == 403


def test_seed_is_repeatable(db, capsys):
    call_command("seed", email="Boss@Club.test", password="correct-horse-battery")
    call_command("seed", email="boss@club.test", password="other")
    assert User.objects.filter(email="boss@club.test").count() == 1
    assert TeamMember.objects.get().role == Role.ADMIN
    assert Invite.objects.count() == 2
