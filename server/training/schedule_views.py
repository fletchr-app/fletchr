from django.db import transaction
from django.db.models import Count
from django.utils import timezone
from django.utils.translation import gettext
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, serializers, status
from rest_framework.exceptions import APIException, NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from core.access import archers_visible_to, can_plan, is_coach_in, teams_of
from core.models import Team, User
from media.access import visible_media
from notes.access import visible_notes

from .models import TrainingEvent, TrainingSession, TrainingSlot
from .schedule import MAX_RANGE, agenda, materialise, occurrence_id, parse_instant
from .schedule_serializers import (
    AgendaItemSerializer,
    EventArcherSerializer,
    EventSerializer,
    EventWriteSerializer,
    MineEventSerializer,
    SlotSerializer,
)

REQUIRED = serializers.Field.default_error_messages["required"]  # the framework's text, already translated

# What changes the times of the occurrences: refused in place once a future one is a row (the app offers "change from")
SLOT_TIME_FIELDS = ("weekday", "start_time", "end_time", "time_zone")
EVENT_CHANGES = ("kind", "name", "start", "end", "location", "time_zone", "cancelled")


class Conflict(APIException):
    status_code = status.HTTP_409_CONFLICT


def team_param(request):
    """The team named by `?team=`, or every team of the user. 404 for a team you are not in."""
    teams = teams_of(request.user)
    if "team" in request.query_params:
        try:
            teams = teams.filter(pk=int(request.query_params["team"]))
        except ValueError:
            raise ValidationError({"team": gettext("Give the id of the team")})
        if not teams.exists():
            raise NotFound()
    return teams


def instant_param(request, name, required=True):
    text = request.query_params.get(name)
    if text is None and not required:
        return None
    value = parse_instant(text) if text else None
    if value is None:
        raise ValidationError({name: gettext("Give a date or a time, like 2026-10-30")})
    return value


class SlotListView(generics.ListAPIView):
    """The weekly trainings of your teams."""

    serializer_class = SlotSerializer
    pagination_class = None

    @extend_schema(parameters=[OpenApiParameter("team", int, description="Only this team; default: all your teams")])
    def get(self, request, *args, **kwargs):
        return super().get(request, *args, **kwargs)

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return TrainingSlot.objects.none()
        return TrainingSlot.objects.filter(team__in=team_param(self.request))


class SlotDetailView(APIView):
    @extend_schema(request=SlotSerializer, responses={200: SlotSerializer, 201: SlotSerializer})
    def put(self, request, slot_id):
        """Create the slot with this id, or change it. Safe to repeat. Coaches and admins of the team.

        The times, the weekday and the time zone cannot change once a later occurrence is a row (someone linked to it,
        cancelled it or moved it): 409. End the slot with `valid_until` and add a new one from that date instead."""
        existing = TrainingSlot.objects.filter(pk=slot_id, team__in=teams_of(request.user)).select_related("team").first()
        if existing is None and TrainingSlot.objects.filter(pk=slot_id).exists():
            raise NotFound()
        serializer = SlotSerializer(existing, data=request.data, partial=existing is not None)
        serializer.is_valid(raise_exception=True)
        team = existing.team if existing else serializer.validated_data["team"]
        if not teams_of(request.user).filter(pk=team.pk).exists():
            raise NotFound()
        if not can_plan(request.user, team):
            raise PermissionDenied(gettext("Only coaches can change the schedule"))
        changed = serializer.validated_data
        if existing is not None and any(f in changed and changed[f] != getattr(existing, f) for f in SLOT_TIME_FIELDS):
            if existing.events.filter(start__gt=timezone.now()).exists():
                return Response(
                    {"detail": gettext("Trainings of this slot are already in use. End this slot and add a new one from the day the new times apply.")},
                    status=status.HTTP_409_CONFLICT,
                )
        slot = serializer.save(**({} if existing else {"id": slot_id}))
        return Response(SlotSerializer(slot).data, status=status.HTTP_200_OK if existing else status.HTTP_201_CREATED)

    @extend_schema(responses={204: None})
    def delete(self, request, slot_id):
        """Delete the slot. Trainings that are rows stay as one-offs."""
        slot = TrainingSlot.objects.filter(pk=slot_id, team__in=teams_of(request.user)).select_related("team").first()
        if slot is None:
            raise NotFound()
        if not can_plan(request.user, slot.team):
            raise PermissionDenied(gettext("Only coaches can change the schedule"))
        with transaction.atomic():
            slot.events.update(slot=None, date=None)
            slot.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class AgendaView(APIView):
    @extend_schema(
        parameters=[
            OpenApiParameter("from", str, required=True, description="A date or a time"),
            OpenApiParameter("to", str, required=True, description="A date or a time, at most 120 days after `from`"),
            OpenApiParameter("team", int, description="Only this team; default: all your teams"),
        ],
        responses=AgendaItemSerializer(many=True),
    )
    def get(self, request):
        """What happens in your teams in a period: slots' occurrences and events, by start time. Cancelled ones are listed with `cancelled`."""
        start, end = instant_param(request, "from"), instant_param(request, "to")
        if end <= start or end - start > MAX_RANGE:
            raise ValidationError({"to": gettext("The period must be between 0 and %(n)s days") % {"n": MAX_RANGE.days}})
        return Response(AgendaItemSerializer(agenda(team_param(request), start, end), many=True).data)


def get_event(request, event_id):
    event = TrainingEvent.objects.filter(pk=event_id, team__in=teams_of(request.user)).select_related("team").first()
    if event is None:
        raise NotFound()
    return event


def links_of(event):
    return {
        "sessions": event.sessions.count(),
        "notes": event.notes.count(),
        "media": event.media.count(),
    }


class EventDetailView(APIView):
    @extend_schema(responses=EventSerializer)
    def get(self, request, event_id):
        """A training that is a row. The id of an occurrence nobody linked to is a 404: see the agenda."""
        return Response(EventSerializer(get_event(request, event_id)).data)

    @extend_schema(request=EventWriteSerializer, responses={200: EventSerializer, 201: EventSerializer})
    def put(self, request, event_id):
        """Create the event with this id, or change it (cancel it, move it). Safe to repeat. Coaches and admins of the team.

        A one-off (competition, extra training, camp) needs `team`, `start` and `end`. The occurrence of a slot has
        no row until someone links to it: send `slot` and `date` and the id from the agenda to make it a row, with
        or without changes. It cannot be cancelled while sessions, notes or media are linked to it (409)."""
        serializer = EventWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        given = serializer.validated_data
        existing = TrainingEvent.objects.filter(pk=event_id).first()
        slot = given.get("slot")
        if existing is not None:
            existing = get_event(request, event_id)
            team = existing.team
            if any(name in given and given[name] != getattr(existing, name) for name in ("team", "slot", "date")):
                raise ValidationError(gettext("The team, slot and date of an event cannot change"))
        elif slot is not None:
            team = slot.team
        else:
            team = given.get("team")
            if team is None:
                raise ValidationError({"team": gettext("Give the team of the event")})
        if not teams_of(request.user).filter(pk=team.pk).exists():
            raise NotFound()
        if not can_plan(request.user, team):
            raise PermissionDenied(gettext("Only coaches can change the schedule"))

        changes = {k: v for k, v in given.items() if k in EVENT_CHANGES}
        created = existing is None
        with transaction.atomic():
            if existing is None and slot is not None:
                day = given.get("date")
                if day is None or occurrence_id(slot.pk, day) != event_id:
                    raise ValidationError({"date": gettext("The id does not belong to this slot and date")})
                existing = materialise(slot, day)
            elif existing is None:
                missing = {k: str(REQUIRED) for k in ("start", "end") if k not in changes}
                if missing:
                    raise ValidationError(missing)
                existing = TrainingEvent(id=event_id, team=team, time_zone=changes.pop("time_zone", None) or "UTC")
            if changes.get("cancelled") and not existing.cancelled:
                links = links_of(existing) if not created else {}
                if any(links.values()):
                    raise Conflict(
                        gettext("Cannot cancel: %(sessions)s sessions, %(notes)s notes and %(media)s photos or videos are linked to it. Move it instead.") % links
                    )
            for name, value in changes.items():
                setattr(existing, name, value)
            if existing.end <= existing.start:
                raise ValidationError({"end": gettext("The end must be after the start")})
            existing.save()
        return Response(EventSerializer(existing).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @extend_schema(responses={204: None})
    def delete(self, request, event_id):
        """Delete a one-off nothing is linked to. A training from a slot is cancelled instead."""
        event = get_event(request, event_id)
        if not can_plan(request.user, event.team):
            raise PermissionDenied(gettext("Only coaches can change the schedule"))
        if event.slot_id is not None:
            raise Conflict(gettext("A training from a slot cannot be deleted. Cancel it instead."))
        if any(links_of(event).values()):
            raise Conflict(gettext("Something is linked to this event. Change that first."))
        event.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class EventArchersView(APIView):
    @extend_schema(responses=EventArcherSerializer(many=True))
    def get(self, request, event_id):
        """The archers who took part in the event, as far as anything shows it: a linked session, a note or a photo or video.
        Coaches of the team only."""
        event = get_event(request, event_id)
        if not is_coach_in(request.user, event.team):
            raise PermissionDenied(gettext("Only coaches can see who took part"))
        visible = archers_visible_to(request.user)
        sessions = {}
        for s in TrainingSession.objects.filter(event=event, owner__in=visible).order_by("started_at"):
            sessions.setdefault(s.owner_id, []).append(s.pk)
        notes = dict(visible_notes(request.user).filter(event=event).values_list("archer").annotate(n=Count("pk")))
        media = dict(visible_media(request.user).filter(event=event).values_list("owner").annotate(n=Count("pk")))
        users = User.objects.filter(pk__in={*sessions, *notes, *media}).select_related("profile").filter(pk__in=visible)
        rows = [
            {
                "user_id": u.pk, "name": u.profile.name or u.email, "managed": u.is_managed, "sessions": sessions.get(u.pk, []),
                "notes": notes.get(u.pk, 0), "media": media.get(u.pk, 0),
            }
            for u in users
        ]
        return Response(EventArcherSerializer(sorted(rows, key=lambda r: r["name"].lower()), many=True).data)


class EventsMineView(APIView):
    @extend_schema(
        parameters=[
            OpenApiParameter("archer", int, required=True),
            OpenApiParameter("from", str, description="Events starting at or after this"),
            OpenApiParameter("to", str, description="Events starting before this"),
        ],
        responses=MineEventSerializer(many=True),
    )
    def get(self, request):
        """Events with notes or photos and videos of this archer that you may see, that sit in no session and whose archer
        has no session linked to them: what the history shows next to the sessions."""
        try:
            archer = archers_visible_to(request.user).filter(pk=int(request.query_params.get("archer", ""))).first()
        except ValueError:
            raise ValidationError({"archer": gettext("Give the id of the archer")})
        if archer is None:
            raise NotFound()
        notes = dict(visible_notes(request.user).filter(archer=archer, event__isnull=False, session__isnull=True).values_list("event").annotate(n=Count("pk")))
        media = dict(visible_media(request.user).filter(owner=archer, event__isnull=False, session__isnull=True).values_list("event").annotate(n=Count("pk")))
        linked = TrainingSession.objects.filter(owner=archer, event__isnull=False).values("event")
        events = TrainingEvent.objects.filter(pk__in={*notes, *media}).exclude(pk__in=linked).select_related("team")
        start, end = instant_param(request, "from", False), instant_param(request, "to", False)
        if start:
            events = events.filter(start__gte=start)
        if end:
            events = events.filter(start__lt=end)
        rows = [{"event": e, "notes": notes.get(e.pk, 0), "media": media.get(e.pk, 0)} for e in events]
        return Response(MineEventSerializer(rows, many=True).data)
