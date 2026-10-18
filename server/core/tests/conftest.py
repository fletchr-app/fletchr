import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from core.models import Invite, Role, Team, TeamMember, User


@pytest.fixture(autouse=True)
def clear_throttle_cache():
    cache.clear()


@pytest.fixture(autouse=True)
def fast_password_hashing(settings):
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]


@pytest.fixture
def make_user(db):
    def make(email, name=""):
        user = User.objects.create_user(email, "correct-horse-battery")
        user.profile.name = name or email.split("@")[0]
        user.profile.save()
        return user

    return make


@pytest.fixture
def join(db):
    def _join(user, team, role):
        return TeamMember.objects.create(team=team, user=user, role=role)

    return _join


@pytest.fixture
def client_for():
    def make(user=None):
        client = APIClient()
        if user is not None:
            client.force_authenticate(user)
        return client

    return make


@pytest.fixture
def club(make_user, join):
    """Team A: one admin, one coach, two archers. Team B: its own admin and archer."""
    a = Team.objects.create(name="Team A")
    b = Team.objects.create(name="Team B")
    people = {
        "admin": make_user("admin@a.test"),
        "coach": make_user("coach@a.test"),
        "archer1": make_user("archer1@a.test"),
        "archer2": make_user("archer2@a.test"),
        "b_admin": make_user("admin@b.test"),
        "b_archer": make_user("archer@b.test"),
    }
    join(people["admin"], a, Role.ADMIN)
    join(people["coach"], a, Role.COACH)
    join(people["archer1"], a, Role.ARCHER)
    join(people["archer2"], a, Role.ARCHER)
    join(people["b_admin"], b, Role.ADMIN)
    join(people["b_archer"], b, Role.ARCHER)
    return {"a": a, "b": b, **people}


@pytest.fixture
def invite(club):
    return Invite.objects.create(team=club["a"], role=Role.ARCHER, created_by=club["admin"])
