"""A session deleted in the admin leaves the tombstone, as the API's delete does: a phone with a change waiting must not upload it again."""

import pytest
from django.test import Client
from django.urls import reverse

from core.models import User
from training.models import SessionTombstone, TrainingSession
from training.tests.test_overview import make_session


@pytest.fixture
def admin_client(db):
    boss = User.objects.create_superuser("boss@x.test", "pw-for-the-boss-1")
    client = Client()
    client.force_login(boss)
    return client


def test_deleting_one_session_in_the_admin_leaves_a_tombstone(admin_client, club):
    session = make_session(club["archer1"])
    res = admin_client.post(reverse("admin:training_trainingsession_delete", args=[session.pk]), {"post": "yes"})
    assert res.status_code == 302
    assert not TrainingSession.objects.filter(pk=session.pk).exists()
    assert SessionTombstone.objects.get(pk=session.pk).owner_id == club["archer1"].pk


def test_the_bulk_action_leaves_a_tombstone_for_each_session(admin_client, club):
    sessions = [make_session(club["archer1"]) for _ in range(2)]
    res = admin_client.post(
        reverse("admin:training_trainingsession_changelist"),
        {"action": "delete_selected", "_selected_action": [s.pk for s in sessions], "post": "yes"},
    )
    assert res.status_code == 302
    assert TrainingSession.objects.count() == 0
    assert SessionTombstone.objects.filter(pk__in=[s.pk for s in sessions]).count() == 2
