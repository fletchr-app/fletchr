"""The schedule of a team: weekly slots, the occurrences computed from them, and the events that make an occurrence real.

An occurrence is not stored until something links to it, or it is cancelled or moved (specs/design/schedule-and-events.md).
Its id is `uuid5(slot id, date)`, so every phone and the server agree on it before the row exists."""

import uuid
from datetime import date, datetime, timedelta, timezone as dt_timezone
from zoneinfo import ZoneInfo

from django.db import transaction
from django.utils.translation import gettext
from rest_framework.exceptions import ValidationError

from .models import TrainingEvent, TrainingSlot

MAX_RANGE = timedelta(days=120)


def occurrence_id(slot_id, day):
    return uuid.uuid5(uuid.UUID(str(slot_id)), day.isoformat())


def is_occurrence(slot, day):
    if day < slot.valid_from or (slot.valid_until and day > slot.valid_until) or day.weekday() != slot.weekday:
        return False
    return not (slot.pause_from and slot.pause_until and slot.pause_from <= day <= slot.pause_until)


def occurrence_times(slot, day):
    """Start and end in UTC. The local time stays the same on both sides of a DST change."""
    zone = ZoneInfo(slot.time_zone)
    return (
        datetime.combine(day, slot.start_time, zone).astimezone(dt_timezone.utc),
        datetime.combine(day, slot.end_time, zone).astimezone(dt_timezone.utc),
    )


def occurrences(slots, start_date, end_date):
    """(slot, date) of every occurrence of `slots` from `start_date` to `end_date`, both included."""
    for slot in slots:
        day = max(start_date, slot.valid_from)
        day += timedelta(days=(slot.weekday - day.weekday()) % 7)
        last = min(end_date, slot.valid_until) if slot.valid_until else end_date
        while day <= last:
            if is_occurrence(slot, day):
                yield slot, day
            day += timedelta(days=7)


def virtual_item(slot, day):
    start, end = occurrence_times(slot, day)
    return {
        "id": occurrence_id(slot.pk, day), "virtual": True, "slot": slot.pk, "date": day, "team": slot.team_id, "team_name": slot.team.name,
        "kind": TrainingEvent.Kind.TRAINING, "name": slot.name, "start": start, "end": end, "location": slot.location,
        "time_zone": slot.time_zone, "cancelled": False,
    }


def real_item(event):
    return {
        "id": event.pk, "virtual": False, "slot": event.slot_id, "date": event.date, "team": event.team_id, "team_name": event.team.name,
        "kind": event.kind, "name": event.name, "start": event.start, "end": event.end, "location": event.location,
        "time_zone": event.time_zone, "cancelled": event.cancelled,
    }


def agenda(teams, start, end):
    """What happens in `teams` between the datetimes `start` and `end`, by start time: real events, and the occurrences
    of the slots that no event has replaced. Cancelled events stay in the list with `cancelled` set."""
    pad = timedelta(days=1)  # a moved event keeps the date of its occurrence
    first, last = (start - pad).date(), (end + pad).date()
    slots = list(TrainingSlot.objects.filter(team__in=teams, valid_from__lte=last).select_related("team"))
    replaced = set(TrainingEvent.objects.filter(slot__in=slots, date__gte=first, date__lte=last).values_list("slot_id", "date"))
    items = []
    for slot, day in occurrences(slots, first, last):
        if (slot.pk, day) not in replaced:
            item = virtual_item(slot, day)
            if item["start"] < end and item["end"] > start:
                items.append(item)
    events = TrainingEvent.objects.filter(team__in=teams, start__lt=end, end__gt=start).select_related("team")
    items += [real_item(e) for e in events]
    return sorted(items, key=lambda i: (i["start"], str(i["id"])))


def materialise(slot, day):
    """The event row of an occurrence, made if it is not there. Two phones doing this at once get the same row."""
    if not is_occurrence(slot, day):
        raise ValidationError({"date": gettext("The slot has no training on this date")})
    start, end = occurrence_times(slot, day)
    with transaction.atomic():
        event, _ = TrainingEvent.objects.get_or_create(
            slot=slot, date=day,
            defaults={
                "id": occurrence_id(slot.pk, day), "team_id": slot.team_id, "kind": TrainingEvent.Kind.TRAINING, "name": slot.name,
                "start": start, "end": end, "location": slot.location, "time_zone": slot.time_zone,
            },
        )
    return event


def resolve_event(event_id, slot_id=None, day=None, allowed=None):
    """The event row a write names: the existing row, or the occurrence of `slot_id` on `day` made real when
    `event_id` is its id. `allowed(team)` says whether the caller may use that team's events; it is asked before
    anything is made. Anything else is a 400, the same for an event that does not exist and one you may not use."""
    event = TrainingEvent.objects.select_related("team").filter(pk=event_id).first()
    if event is not None:
        team, slot = event.team, None
    else:
        slot = TrainingSlot.objects.select_related("team").filter(pk=slot_id).first() if slot_id and day else None
        if slot is None or occurrence_id(slot.pk, day) != event_id:
            raise ValidationError({"event": gettext("No such event")})
        team = slot.team
    if allowed is not None and not allowed(team):
        raise ValidationError({"event": gettext("No such event")})
    return event or materialise(slot, day)


def parse_instant(text):
    """An ISO date or datetime (a date is midnight UTC), or None."""
    from django.utils.dateparse import parse_date, parse_datetime

    value = parse_datetime(text) if "T" in text or " " in text else None
    if value is None:
        day = parse_date(text)
        value = datetime.combine(day, datetime.min.time()) if day else None
    if value is not None and value.tzinfo is None:
        value = value.replace(tzinfo=dt_timezone.utc)
    return value


def rows_of_session(queryset, session, owner_field):
    """The rows of a model with `session` and `event` (notes, media) that belong to `session`: its own, and, when the
    session is linked to an event, the owner's rows of that event that are in no session. Visibility is the queryset's."""
    from django.db.models import Q

    q = Q(session=session)
    if session.event_id:
        q |= Q(event=session.event_id, session__isnull=True, **{owner_field: session.owner_id})
    return queryset.filter(q)
