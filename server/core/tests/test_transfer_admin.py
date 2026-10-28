import pytest
from django.test import Client
from django.urls import reverse

from core.models import User
from core.tests.test_transfer import fill, snapshot
from training.models import TrainingSession
from training.tests.test_overview import make_session


@pytest.fixture
def admin_client(db):
    boss = User.objects.create_superuser("boss@x.test", "pw-for-the-boss-1")
    client = Client()
    client.force_login(boss)
    return client


@pytest.fixture
def new(db):
    user = User.objects.create_user("new@gmail.test")
    user.set_unusable_password()
    user.save()
    return user


def url(source):
    return reverse("admin:core_user_transfer", args=[source.pk])


def test_the_action_leads_to_the_transfer_page(admin_client, club):
    res = admin_client.post(reverse("admin:core_user_changelist"), {"action": "transfer_data", "_selected_action": [club["archer1"].pk]})
    assert res.status_code == 302 and res.url == url(club["archer1"])


def test_only_a_superuser_gets_the_page(club):
    client = Client()
    staff = User.objects.create_user("staff@x.test", "pw", is_staff=True)
    client.force_login(staff)
    assert client.get(url(club["archer1"])).status_code == 403


def test_the_dry_run_page_shows_counts_and_changes_nothing_then_confirm_runs(admin_client, club, new):
    fill(club, club["archer1"])
    before = snapshot()
    res = admin_client.post(url(club["archer1"]), {"target": new.pk, "source": club["archer1"].pk, "preview": "1"})
    assert res.status_code == 200 and b"training.TrainingSession.owner" in res.content and b"Move it now" in res.content
    assert snapshot() == before
    res = admin_client.post(url(club["archer1"]), {"target": new.pk, "source": club["archer1"].pk, "confirm": "1"})
    assert res.status_code == 302
    assert TrainingSession.objects.filter(owner=new).count() == 1 and not User.objects.get(pk=club["archer1"].pk).is_active


def test_a_refusal_shows_the_reason_and_changes_nothing(admin_client, club):
    make_session(club["archer2"], arrows=1, volume=0)
    before = snapshot()
    res = admin_client.post(url(club["archer1"]), {"target": club["archer2"].pk, "source": club["archer1"].pk, "confirm": "1"})
    assert res.status_code == 200 and b"already has data" in res.content
    assert snapshot() == before
