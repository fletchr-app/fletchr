"""Slots, their occurrences, events and the agenda (#104)."""

import uuid
from datetime import date, datetime, time, timedelta, timezone as tz

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from training.models import TrainingEvent, TrainingSlot
from training.schedule import agenda, materialise, occurrence_id, occurrences, resolve_event

SLOT = {"weekday": 2, "start_time": "18:00", "end_time": "19:30", "time_zone": "Europe/Berlin", "valid_from": "2026-01-01", "name": "Squad"}


@pytest.fixture
def make_slot(club):
    def make(team="a", **extra):
        fields = {"team": club[team], "weekday": 2, "start_time": time(18), "end_time": time(19, 30), "time_zone": "Europe/Berlin", "valid_from": date(2026, 1, 1), **extra}
        return TrainingSlot.objects.create(id=uuid.uuid4(), **fields)

    return make


def next_wednesday():
    today = timezone.now().date()
    return today + timedelta(days=(2 - today.weekday()) % 7 or 7)


# --- occurrences ---------------------------------------------------------------------------------


def test_occurrences_follow_weekday_validity_and_pause(make_slot):
    slot = make_slot(valid_from=date(2026, 10, 7), valid_until=date(2026, 11, 4), pause_from=date(2026, 10, 20), pause_until=date(2026, 10, 27))
    days = [d for _, d in occurrences([slot], date(2026, 9, 1), date(2026, 12, 31))]
    assert days == [date(2026, 10, 7), date(2026, 10, 14), date(2026, 10, 28), date(2026, 11, 4)]
    assert all(d.weekday() == 2 for d in days)


def test_the_local_time_stays_when_the_clocks_change(club, make_slot):
    make_slot()
    start = datetime(2026, 10, 19, tzinfo=tz.utc)
    items = agenda([club["a"]], start, start + timedelta(days=14))
    assert [i["start"].hour for i in items] == [16, 17]  # 18:00 in Berlin: summer time on the 21st, winter time on the 28th
    assert [i["date"] for i in items] == [date(2026, 10, 21), date(2026, 10, 28)]


def test_a_real_row_replaces_its_occurrence_and_a_cancelled_one_is_listed(club, make_slot):
    slot = make_slot()
    event = materialise(slot, date(2026, 10, 21))
    event.cancelled = True
    event.start += timedelta(days=1)  # moved to Thursday, still the occurrence of Wednesday
    event.end += timedelta(days=1)
    event.save()
    start = datetime(2026, 10, 19, tzinfo=tz.utc)
    items = agenda([club["a"]], start, start + timedelta(days=7))
    assert len(items) == 1 and items[0]["id"] == event.pk and items[0]["cancelled"] and not items[0]["virtual"]
    assert items[0]["start"].date() == date(2026, 10, 22)


def test_materialise_is_repeatable_and_checks_the_date(make_slot):
    slot = make_slot()
    first = materialise(slot, date(2026, 10, 21))
    assert first.pk == occurrence_id(slot.pk, date(2026, 10, 21)) and first.name == "" and first.time_zone == "Europe/Berlin"
    assert materialise(slot, date(2026, 10, 21)).pk == first.pk
    assert TrainingEvent.objects.count() == 1
    with pytest.raises(ValidationError):
        materialise(slot, date(2026, 10, 22))  # a Thursday


def test_two_phones_at_once_give_one_row(make_slot):
    slot = make_slot()
    day = date(2026, 10, 21)
    materialise(slot, day)
    # the other phone got there between our look and our insert: the unique constraint refuses a second row,
    # and get_or_create then reads the first
    with pytest.raises(IntegrityError), transaction.atomic():
        TrainingEvent.objects.create(id=uuid.uuid4(), team=slot.team, slot=slot, date=day, start=timezone.now(), end=timezone.now() + timedelta(hours=1), time_zone="UTC")
    assert materialise(slot, day).pk == occurrence_id(slot.pk, day) and TrainingEvent.objects.count() == 1


def test_resolve_event_checks_the_id(make_slot):
    slot = make_slot()
    day = date(2026, 10, 21)
    assert resolve_event(occurrence_id(slot.pk, day), slot.pk, day).slot == slot
    with pytest.raises(ValidationError):
        resolve_event(uuid.uuid4(), slot.pk, day)
    with pytest.raises(ValidationError):
        resolve_event(uuid.uuid4())


# --- slots ---------------------------------------------------------------------------------------


def put_slot(client, club, sid=None, **extra):
    sid = sid or uuid.uuid4()
    return sid, client.put(f"/api/slots/{sid}/", {**SLOT, "team": club["a"].pk, **extra}, format="json")


def test_a_coach_creates_and_repeats_a_slot_an_archer_cannot(client_for, club):
    sid, res = put_slot(client_for(club["coach"]), club)
    assert res.status_code == 201 and res.data["weekday"] == 2 and res.data["time_zone"] == "Europe/Berlin"
    assert put_slot(client_for(club["coach"]), club, sid)[1].status_code == 200
    assert TrainingSlot.objects.count() == 1
    assert put_slot(client_for(club["archer1"]), club)[1].status_code == 403
    assert put_slot(client_for(club["b_admin"]), club)[1].status_code == 404
    assert client_for(club["b_admin"]).put(f"/api/slots/{sid}/", {"name": "x"}, format="json").status_code == 404


def test_a_slot_is_checked(client_for, club):
    coach = client_for(club["coach"])
    assert put_slot(coach, club, time_zone="Mars/Olympus")[1].status_code == 400
    assert put_slot(coach, club, end_time="17:00")[1].status_code == 400
    assert put_slot(coach, club, pause_from="2026-12-20")[1].status_code == 400
    assert put_slot(coach, club, weekday=7)[1].status_code == 400
    assert not TrainingSlot.objects.exists()


def test_members_read_their_slots_only(client_for, club, make_slot):
    make_slot()
    make_slot("b")
    assert len(client_for(club["archer1"]).get("/api/slots/").data) == 1
    assert client_for(club["archer1"]).get(f"/api/slots/?team={club['a'].pk}").status_code == 200
    assert client_for(club["archer1"]).get(f"/api/slots/?team={club['b'].pk}").status_code == 404


def test_times_are_locked_once_a_future_occurrence_is_a_row(client_for, club, make_slot):
    slot = make_slot()
    coach = client_for(club["coach"])
    assert coach.put(f"/api/slots/{slot.pk}/", {"start_time": "17:00"}, format="json").status_code == 200  # nothing is a row yet
    materialise(slot, next_wednesday())
    assert coach.put(f"/api/slots/{slot.pk}/", {"start_time": "16:00"}, format="json").status_code == 409
    assert coach.put(f"/api/slots/{slot.pk}/", {"name": "Juniors", "valid_until": "2027-06-30"}, format="json").status_code == 200


def test_deleting_a_slot_keeps_its_events_as_one_offs(client_for, club, make_slot):
    slot = make_slot()
    event = materialise(slot, date(2026, 10, 21))
    assert client_for(club["archer1"]).delete(f"/api/slots/{slot.pk}/").status_code == 403
    assert client_for(club["coach"]).delete(f"/api/slots/{slot.pk}/").status_code == 204
    event.refresh_from_db()
    assert event.slot is None and event.date is None


# --- agenda and events ---------------------------------------------------------------------------


def get_agenda(client, start="2026-10-19", end="2026-11-02", **query):
    params = "".join(f"&{k}={v}" for k, v in query.items())
    return client.get(f"/api/events/agenda/?from={start}&to={end}{params}")


def test_the_agenda_lists_occurrences_for_every_member(client_for, club, make_slot):
    slot = make_slot()
    make_slot("b")
    res = get_agenda(client_for(club["archer1"]))
    assert res.status_code == 200 and [i["date"] for i in res.data] == ["2026-10-21", "2026-10-28"]
    first = res.data[0]
    assert first["virtual"] and first["id"] == str(occurrence_id(slot.pk, date(2026, 10, 21))) and first["team_name"] == "Team A"
    assert first["start"] == "2026-10-21T16:00:00Z" and first["time_zone"] == "Europe/Berlin"
    assert get_agenda(client_for(club["archer1"]), team=club["b"].pk).status_code == 404
    assert get_agenda(client_for(club["b_archer"]), team=club["b"].pk).status_code == 200


def test_the_agenda_range_is_checked(client_for, club):
    assert get_agenda(client_for(club["archer1"]), "2026-01-01", "2026-12-31").status_code == 400
    assert get_agenda(client_for(club["archer1"]), "2026-10-02", "2026-10-01").status_code == 400
    assert client_for(club["archer1"]).get("/api/events/agenda/").status_code == 400


def put_event(client, event_id, **body):
    return client.put(f"/api/events/{event_id}/", body, format="json")


def test_a_coach_makes_an_occurrence_a_row_and_moves_it(client_for, club, make_slot):
    slot = make_slot()
    day = date(2026, 10, 21)
    eid = occurrence_id(slot.pk, day)
    coach = client_for(club["coach"])
    res = put_event(coach, eid, slot=str(slot.pk), date="2026-10-21", start="2026-10-21T17:00:00Z", end="2026-10-21T18:30:00Z", location="Hall 2")
    assert res.status_code == 201, res.data
    assert res.data["id"] == str(eid) and str(res.data["slot"]) == str(slot.pk) and res.data["location"] == "Hall 2"
    again = put_event(coach, eid, slot=str(slot.pk), date="2026-10-21")
    assert again.status_code == 200 and TrainingEvent.objects.count() == 1 and again.data["location"] == "Hall 2"
    assert put_event(coach, eid, slot=str(slot.pk), date="2026-10-28").status_code == 400
    assert put_event(coach, uuid.uuid4(), slot=str(slot.pk), date="2026-10-21").status_code == 400


def test_a_one_off_needs_a_team_and_times_and_an_archer_cannot(client_for, club):
    coach, eid = client_for(club["coach"]), uuid.uuid4()
    assert put_event(coach, eid, kind="competition").status_code == 400
    assert put_event(coach, eid, team=club["a"].pk, kind="competition").status_code == 400
    body = {"team": club["a"].pk, "kind": "competition", "name": "Club cup", "start": "2026-11-07T08:00:00Z", "end": "2026-11-08T16:00:00Z", "time_zone": "Europe/Berlin"}
    assert put_event(coach, eid, **{**body, "end": "2026-11-07T07:00:00Z"}).status_code == 400
    assert put_event(client_for(club["archer1"]), eid, **body).status_code == 403
    assert put_event(client_for(club["b_admin"]), eid, **body).status_code == 404
    assert put_event(coach, eid, **body).status_code == 201
    assert client_for(club["archer1"]).get(f"/api/events/{eid}/").data["name"] == "Club cup"
    assert client_for(club["b_archer"]).get(f"/api/events/{eid}/").status_code == 404
    assert put_event(coach, eid, team=club["b"].pk).status_code == 400
    assert client_for(club["archer1"]).delete(f"/api/events/{eid}/").status_code == 403
    assert coach.delete(f"/api/events/{eid}/").status_code == 204


def test_a_virtual_occurrence_is_not_readable_before_it_is_a_row(client_for, club, make_slot):
    slot = make_slot()
    assert client_for(club["archer1"]).get(f"/api/events/{occurrence_id(slot.pk, date(2026, 10, 21))}/").status_code == 404


def test_cancel_is_refused_while_something_is_linked(client_for, club, make_slot):
    from training.tests.test_overview import make_session

    slot = make_slot()
    event = materialise(slot, date(2026, 10, 21))
    session = make_session(club["archer1"])
    session.event = event
    session.save()
    coach = client_for(club["coach"])
    res = put_event(coach, event.pk, cancelled=True)
    assert res.status_code == 409 and "1 sessions" in res.data["detail"]
    session.event = None
    session.save()
    assert put_event(coach, event.pk, cancelled=True).status_code == 200
    assert put_event(coach, event.pk, cancelled=False).data["cancelled"] is False
    assert coach.delete(f"/api/events/{event.pk}/").status_code == 409  # from a slot: cancel, do not delete
