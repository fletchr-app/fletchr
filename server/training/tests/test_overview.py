import uuid
from datetime import timedelta

import pytest
from django.utils import timezone

from training.models import End, Shot, TrainingSession, VolumeEntry


def make_session(owner, started_ago=timedelta(hours=1), ended=False, updated_ago=timedelta(minutes=5), arrows=0, volume=0):
    started = timezone.now() - started_ago
    session = TrainingSession.objects.create(
        id=uuid.uuid4(), owner=owner, started_at=started, type="scoring", ended_at=started + timedelta(hours=1) if ended else None
    )
    if arrows:
        end = End.objects.create(id=uuid.uuid4(), session=session, index=0, distance_m=18, face="wa-40", arrows_per_end=12)
        for i in range(arrows):
            Shot.objects.create(id=uuid.uuid4(), end=end, index=i, value=9)
    if volume:
        VolumeEntry.objects.create(id=uuid.uuid4(), session=session, distance_m=18, arrow_count=volume)
    TrainingSession.objects.filter(pk=session.pk).update(updated_at=timezone.now() - updated_ago)
    return session


def overview(client, club, who="coach"):
    return client(club[who]).get(f"/api/teams/{club['a'].pk}/overview/")


def test_lists_the_archers_of_the_team_but_not_the_staff(client_for, club):
    res = overview(client_for, club)
    assert res.status_code == 200
    assert {r["name"] for r in res.data} == {"archer1", "archer2"}


def test_admin_sees_it_too(client_for, club):
    assert overview(client_for, club, "admin").status_code == 200


def test_archers_cannot_see_it_and_strangers_get_404(client_for, club):
    assert overview(client_for, club, "archer1").status_code == 403
    assert overview(client_for, club, "b_admin").status_code == 404
    assert client_for().get(f"/api/teams/{club['a'].pk}/overview/").status_code == 401


def test_archers_without_sessions_show_nothing_yet(client_for, club):
    rows = overview(client_for, club).data
    assert all(r["last_session"] is None and r["arrows_7d"] == 0 for r in rows)


def test_arrows_of_the_last_7_days_count_shots_and_volume(client_for, club):
    make_session(club["archer1"], arrows=6, volume=30)
    make_session(club["archer1"], started_ago=timedelta(days=3), arrows=12)
    make_session(club["archer1"], started_ago=timedelta(days=8), arrows=100, volume=100)  # too old
    make_session(club["b_archer"], arrows=50)  # other team
    rows = {r["name"]: r for r in overview(client_for, club).data}
    assert rows["archer1"]["arrows_7d"] == 6 + 30 + 12
    assert rows["archer2"]["arrows_7d"] == 0


def test_last_session_is_the_newest_and_live_until_finished_or_stale(client_for, club):
    make_session(club["archer1"], started_ago=timedelta(days=2), ended=True)
    newest = make_session(club["archer1"], started_ago=timedelta(minutes=30))
    rows = {r["name"]: r for r in overview(client_for, club).data}
    last = rows["archer1"]["last_session"]
    assert last["id"] == str(newest.pk) and last["live"] is True

    TrainingSession.objects.filter(pk=newest.pk).update(updated_at=timezone.now() - timedelta(hours=4))
    assert {r["name"]: r for r in overview(client_for, club).data}["archer1"]["last_session"]["live"] is False

    TrainingSession.objects.filter(pk=newest.pk).update(updated_at=timezone.now(), ended_at=timezone.now())
    assert {r["name"]: r for r in overview(client_for, club).data}["archer1"]["last_session"]["live"] is False


def test_live_archers_come_first_then_the_most_recent(client_for, club):
    make_session(club["archer2"], started_ago=timedelta(days=1), ended=True)
    make_session(club["archer1"], started_ago=timedelta(minutes=10))
    assert [r["name"] for r in overview(client_for, club).data] == ["archer1", "archer2"]
    TrainingSession.objects.filter(owner=club["archer1"]).update(ended_at=timezone.now())
    make_session(club["archer2"], started_ago=timedelta(minutes=10))
    assert [r["name"] for r in overview(client_for, club).data] == ["archer2", "archer1"]


def test_sessions_carry_the_archers_name(client_for, club):
    session = make_session(club["archer1"])
    coach = client_for(club["coach"])
    assert coach.get("/api/sessions/").data[0]["owner_name"] == "archer1"
    assert coach.get(f"/api/sessions/{session.pk}/").data["owner_name"] == "archer1"


@pytest.mark.django_db
def test_name_falls_back_to_the_part_before_the_at(client_for, club):
    club["archer1"].profile.name = ""
    club["archer1"].profile.save()
    make_session(club["archer1"])
    assert client_for(club["archer1"]).get("/api/sessions/").data[0]["owner_name"] == "archer1"
