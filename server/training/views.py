from django.utils.translation import gettext
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import django_filters
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, IntegerField, OuterRef, Q, Subquery, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from core.access import archers_visible_to, is_coach_in
from core.claims import can_write_sessions_of
from core.models import COACH_ROLES, Role, Team, TeamMember, User

from .models import End, Shot, TrainingSession, VolumeEntry
from targets.catalogue import get_face

from .arrow_stats import compute_arrow_stats
from .ranking import compute_ranking
from .stats import compute_stats, spot_radius_cm
from .serializers import (
    ArcherOverviewSerializer,
    ArrowStatsGroupSerializer,
    PositionsSerializer,
    RankingSerializer,
    StatsSerializer,
    EndSerializer,
    SessionSerializer,
    SessionSummarySerializer,
    SessionWriteSerializer,
    VolumeEntrySerializer,
)


LIVE_WINDOW = timedelta(hours=3)
OVERVIEW_DAYS = 7


def visible_sessions(user):
    return TrainingSession.objects.filter(owner__in=archers_visible_to(user)).select_related(
        "owner__profile", "setup__bow_revision", "setup__arrow_set_revision"
    )


def get_session(request, session_id, write=False):
    """Sessions of archers you can't see are 404. Ones you can see but don't own are read-only."""
    session = visible_sessions(request.user).filter(pk=session_id).first()
    if session is None:
        raise NotFound()
    if write and not can_write_sessions_of(request.user, session.owner):
        raise PermissionDenied(gettext("Only the archer can change a session"))
    return session


def touch(session):
    session.save(update_fields=["updated_at"])


class SessionFilter(django_filters.FilterSet):
    started_after = django_filters.IsoDateTimeFilter(field_name="started_at", lookup_expr="gte")
    started_before = django_filters.IsoDateTimeFilter(field_name="started_at", lookup_expr="lt")
    updated_after = django_filters.IsoDateTimeFilter(field_name="updated_at", lookup_expr="gt")

    class Meta:
        model = TrainingSession
        fields = ["owner", "type", "environment"]


class SessionListView(generics.ListAPIView):
    """Sessions you may see: your own and those of the archers you coach, newest first, with totals."""

    serializer_class = SessionSummarySerializer
    filterset_class = SessionFilter

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return TrainingSession.objects.none()
        volume = (
            VolumeEntry.objects.filter(session=OuterRef("pk"))
            .values("session")
            .annotate(total=Sum("arrow_count"))
            .values("total")
        )
        return visible_sessions(self.request.user).annotate(
            end_count=Count("ends", distinct=True),
            scored_arrows=Count("ends__shots", distinct=True),
            score_total=Coalesce(Sum("ends__shots__value"), 0),
            volume_arrows=Coalesce(Subquery(volume, output_field=IntegerField()), 0),
        )


class SessionDetailView(APIView):
    @extend_schema(responses=SessionSerializer)
    def get(self, request, session_id):
        session = get_session(request, session_id)
        session = visible_sessions(request.user).prefetch_related("ends__shots", "volume_entries").get(pk=session.pk)
        return Response(SessionSerializer(session).data)

    @extend_schema(
        request=SessionWriteSerializer,
        parameters=[OpenApiParameter("owner", int, description="Create the session for an archer without an account that you coach; default: yourself")],
        responses={200: SessionSerializer, 201: SessionSerializer},
    )
    def put(self, request, session_id):
        """Create the session with this id, or update it. Safe to repeat."""
        existing = TrainingSession.objects.filter(pk=session_id).first()
        if existing is not None:
            existing = get_session(request, session_id, write=True)
        owner = request.user
        if existing is None and "owner" in request.query_params:
            try:
                owner = User.objects.filter(pk=int(request.query_params["owner"])).first()
            except ValueError:
                raise ValidationError({"owner": gettext("Give the id of the archer")})
            if owner is None or not can_write_sessions_of(request.user, owner):
                raise NotFound()
        serializer = SessionWriteSerializer(existing, data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        session = serializer.save(**({} if existing else {"id": session_id, "owner": owner}))
        session = (
            TrainingSession.objects.select_related("owner__profile", "setup__bow_revision", "setup__arrow_set_revision")
            .prefetch_related("ends__shots", "volume_entries")
            .get(pk=session.pk)
        )
        return Response(SessionSerializer(session).data, status=status.HTTP_200_OK if existing else status.HTTP_201_CREATED)

    @extend_schema(responses={204: None})
    def delete(self, request, session_id):
        get_session(request, session_id, write=True).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class EndView(APIView):
    @extend_schema(request=EndSerializer, responses={200: EndSerializer, 201: EndSerializer})
    def put(self, request, session_id, end_id):
        """Create or replace one end with all its shots. The server fills in the scores. Safe to repeat."""
        session = get_session(request, session_id, write=True)
        existing = End.objects.filter(pk=end_id).first()
        if existing is not None and existing.session_id != session.pk:
            raise ValidationError(gettext("This end id belongs to another session"))
        serializer = EndSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        shots = data.pop("shots")
        if End.objects.filter(session=session, index=data["index"]).exclude(pk=end_id).exists():
            raise ValidationError({"index": gettext("Another end of this session has this index")})
        if Shot.objects.filter(pk__in=[s["id"] for s in shots]).exclude(end_id=end_id).exists():
            raise ValidationError({"shots": gettext("A shot id is already used in another end")})
        with transaction.atomic():
            end, created = End.objects.update_or_create(pk=end_id, defaults={"session": session, **data})
            end.shots.all().delete()
            Shot.objects.bulk_create([Shot(end=end, **s) for s in shots])
            touch(session)
        end = End.objects.prefetch_related("shots").get(pk=end.pk)
        return Response(EndSerializer(end).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @extend_schema(responses={204: None})
    def delete(self, request, session_id, end_id):
        session = get_session(request, session_id, write=True)
        deleted, _ = End.objects.filter(pk=end_id, session=session).delete()
        if not deleted:
            raise NotFound()
        touch(session)
        return Response(status=status.HTTP_204_NO_CONTENT)


class VolumeEntryView(APIView):
    @extend_schema(request=VolumeEntrySerializer, responses={200: VolumeEntrySerializer, 201: VolumeEntrySerializer})
    def put(self, request, session_id, entry_id):
        session = get_session(request, session_id, write=True)
        existing = VolumeEntry.objects.filter(pk=entry_id).first()
        if existing is not None and existing.session_id != session.pk:
            raise ValidationError(gettext("This entry id belongs to another session"))
        serializer = VolumeEntrySerializer(existing, data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            entry = serializer.save(**({} if existing else {"id": entry_id, "session": session}))
            touch(session)
        return Response(VolumeEntrySerializer(entry).data, status=status.HTTP_200_OK if existing else status.HTTP_201_CREATED)

    @extend_schema(responses={204: None})
    def delete(self, request, session_id, entry_id):
        session = get_session(request, session_id, write=True)
        deleted, _ = VolumeEntry.objects.filter(pk=entry_id, session=session).delete()
        if not deleted:
            raise NotFound()
        touch(session)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TeamOverviewView(APIView):
    """For coaches: each archer of the team (and each coach who shares their training) with their latest
    session and arrows of the last 7 days."""

    @extend_schema(responses=ArcherOverviewSerializer(many=True))
    def get(self, request, team_id):
        team = Team.objects.filter(pk=team_id, memberships__user=request.user).first()
        if team is None:
            raise NotFound()
        if not is_coach_in(request.user, team):
            raise PermissionDenied(gettext("Only coaches can see the team overview"))
        now = timezone.now()
        since = now - timedelta(days=OVERVIEW_DAYS)
        shots = (
            Shot.objects.filter(end__session__owner=OuterRef("user"), end__session__started_at__gte=since)
            .values("end__session__owner")
            .annotate(total=Count("id"))
            .values("total")
        )
        volume = (
            VolumeEntry.objects.filter(session__owner=OuterRef("user"), session__started_at__gte=since)
            .values("session__owner")
            .annotate(total=Sum("arrow_count"))
            .values("total")
        )
        last = TrainingSession.objects.filter(owner=OuterRef("user")).order_by("-started_at")
        members = (
            TeamMember.objects.filter(team=team)
            .filter(Q(role=Role.ARCHER) | Q(role__in=COACH_ROLES, also_shoots=True))
            .select_related("user__profile")
            .annotate(
                last_session_id=Subquery(last.values("id")[:1]),
                arrows_7d=Coalesce(Subquery(shots, output_field=IntegerField()), 0)
                + Coalesce(Subquery(volume, output_field=IntegerField()), 0),
            )
        )
        sessions = TrainingSession.objects.in_bulk([m.last_session_id for m in members if m.last_session_id])
        rows = []
        for m in members:
            s = sessions.get(m.last_session_id)
            rows.append(
                {
                    "user_id": m.user_id,
                    "role": m.role,
                    "name": m.user.profile.name or m.user.email,
                    "managed": m.user.is_managed,
                    "arrows_7d": m.arrows_7d,
                    "last_session": s
                    and {
                        "id": s.pk, "started_at": s.started_at, "ended_at": s.ended_at, "updated_at": s.updated_at,
                        "type": s.type, "live": s.ended_at is None and now - s.updated_at < LIVE_WINDOW,
                    },
                }
            )
        # Live sessions first, then the most recent, then archers who haven't shot yet.
        rows.sort(key=lambda r: (not (r["last_session"] and r["last_session"]["live"]), -(r["last_session"]["started_at"].timestamp() if r["last_session"] else 0), r["name"]))
        return Response(ArcherOverviewSerializer(rows, many=True).data)


class StatsView(APIView):
    """Volume per week and average score per face and distance, for yourself or an archer you may see."""

    @extend_schema(
        parameters=[
            OpenApiParameter("owner", int, description="Whose stats; default: yours"),
            OpenApiParameter("tz", str, description="IANA time zone that decides which day a session falls on; default UTC"),
            OpenApiParameter("weeks", int, description="How many weeks of volume, 1 to 52; default 12"),
        ],
        responses=StatsSerializer,
    )
    def get(self, request):
        params = request.query_params
        try:
            owner_id = int(params.get("owner", request.user.pk))
            weeks = int(params.get("weeks", 12))
        except ValueError:
            raise ValidationError(gettext("owner and weeks must be numbers"))
        if not 1 <= weeks <= 52:
            raise ValidationError({"weeks": gettext("Between 1 and 52")})
        try:
            tz = ZoneInfo(params.get("tz", "UTC"))
        except (ZoneInfoNotFoundError, ValueError):
            raise ValidationError({"tz": gettext("Unknown time zone")})
        if not archers_visible_to(request.user).filter(pk=owner_id).exists():
            raise NotFound()

        shots = Shot.objects.filter(end__session__owner_id=owner_id).values_list(
            "end__session_id", "end__session__started_at", "end__session__type", "end__distance_m", "end__face",
            "value", "is_x", "is_miss", "x", "y", "end__session__physical_rating", "end__session__mental_rating", "end__session__setup_id",
        )
        volume = VolumeEntry.objects.filter(session__owner_id=owner_id).values_list("session__started_at", "arrow_count")
        stats = compute_stats(list(shots), list(volume), timezone.now(), tz, weeks)
        return Response(StatsSerializer({"owner": owner_id, "tz": str(tz), **stats}).data)


MAX_POSITIONS = 5000


class PositionsView(APIView):
    """Where the arrows of one face at one distance landed, for the heatmap: positions only, not whole sessions."""

    @extend_schema(
        parameters=[
            OpenApiParameter("owner", int, description="Whose arrows; default: yours"),
            OpenApiParameter("face", str, required=True, description="Slug of the target face"),
            OpenApiParameter("distance_m", float, required=True, description="Distance in metres"),
            OpenApiParameter("from", date, description="First day (in the time zone), default: no limit"),
            OpenApiParameter("to", date, description="Last day, included"),
            OpenApiParameter("setup", int, description="Only sessions shot with this setup"),
            OpenApiParameter("tz", str, description="IANA time zone that decides which day a session falls on; default UTC"),
        ],
        responses=PositionsSerializer,
    )
    def get(self, request):
        params = request.query_params
        try:
            owner_id = int(params.get("owner", request.user.pk))
            distance = Decimal(params.get("distance_m", "")).quantize(Decimal("0.1"))
            setup = int(params["setup"]) if "setup" in params else None
        except (ValueError, ArithmeticError):
            raise ValidationError(gettext("owner, distance_m and setup must be numbers"))
        try:
            tz = ZoneInfo(params.get("tz", "UTC"))
        except (ZoneInfoNotFoundError, ValueError):
            raise ValidationError({"tz": gettext("Unknown time zone")})
        face = get_face(params.get("face", ""))
        if face is None or not face["rings"]:
            raise ValidationError({"face": gettext("Unknown target face")})
        days = {}
        for key in ("from", "to"):
            if key in params:
                try:
                    days[key] = date.fromisoformat(params[key])
                except ValueError:
                    raise ValidationError({key: gettext("Use a date like 2026-10-25")})
        if not archers_visible_to(request.user).filter(pk=owner_id).exists():
            raise NotFound()

        shots = Shot.objects.filter(
            end__session__owner_id=owner_id, end__face=face["slug"], end__distance_m=distance, x__isnull=False, y__isnull=False
        )
        if setup is not None:
            shots = shots.filter(end__session__setup_id=setup)
        if "from" in days:
            shots = shots.filter(end__session__started_at__gte=datetime.combine(days["from"], time.min, tz))
        if "to" in days:
            shots = shots.filter(end__session__started_at__lt=datetime.combine(days["to"] + timedelta(days=1), time.min, tz))
        total = shots.count()
        rows = shots.order_by("-end__session__started_at", "-end__index", "-index").values_list("x", "y")[:MAX_POSITIONS]
        data = {
            "owner": owner_id, "face": face["slug"], "distance_m": str(distance), "radius_cm": spot_radius_cm(face),
            "arrows": total, "limited": total > MAX_POSITIONS, "points": [[x, y] for x, y in rows],
        }
        return Response(PositionsSerializer(data).data)


class TeamRankingView(APIView):
    """For coaches, when an admin has switched it on: how many arrows each archer shot lately and their average on one face and distance."""

    @extend_schema(
        parameters=[
            OpenApiParameter("days", int, description="How far back, 1 to 365; default 28"),
            OpenApiParameter("face", str, description="Slug of the face for the average; default: the one shot most"),
            OpenApiParameter("distance_m", float, description="Distance for the average; needed with face"),
        ],
        responses=RankingSerializer,
    )
    def get(self, request, team_id):
        team = Team.objects.filter(pk=team_id, memberships__user=request.user).first()
        if team is None:
            raise NotFound()
        if not is_coach_in(request.user, team):
            raise PermissionDenied(gettext("Only coaches can see the team overview"))
        if not team.show_ranking:
            raise PermissionDenied(gettext("The ranking is switched off for this team"))
        params = request.query_params
        try:
            days = int(params.get("days", 28))
            distance = Decimal(params["distance_m"]).quantize(Decimal("0.1")) if "distance_m" in params else None
        except (ValueError, ArithmeticError):
            raise ValidationError(gettext("days and distance_m must be numbers"))
        if not 1 <= days <= 365:
            raise ValidationError({"days": gettext("Between 1 and 365")})
        face = params.get("face")
        if (face is None) != (distance is None):
            raise ValidationError(gettext("Give face and distance_m together"))
        if face is not None and get_face(face) is None:
            raise ValidationError({"face": gettext("Unknown target face")})

        since = timezone.now() - timedelta(days=days)
        members = (
            TeamMember.objects.filter(team=team)
            .filter(Q(role=Role.ARCHER) | Q(role__in=COACH_ROLES, also_shoots=True))
            .select_related("user__profile")
        )
        listed = [(m.user_id, m.user.profile.name or m.user.email, m.user.is_managed) for m in members]
        owners = [m[0] for m in listed]
        shots = Shot.objects.filter(end__session__owner_id__in=owners, end__session__started_at__gte=since).values_list(
            "end__session__owner_id", "end__face", "end__distance_m", "value", "is_miss"
        )
        volume = VolumeEntry.objects.filter(session__owner_id__in=owners, session__started_at__gte=since).values_list("session__owner_id", "arrow_count")
        result = compute_ranking(listed, list(shots), list(volume), face, distance)
        return Response(RankingSerializer({"days": days, **result}).data)


class ArrowStatsView(APIView):
    """Numbered arrows that land away from the group of their session, per face and distance and arrow set."""

    @extend_schema(
        parameters=[OpenApiParameter("owner", int, description="Whose arrows; default: yours")],
        responses=ArrowStatsGroupSerializer(many=True),
    )
    def get(self, request):
        try:
            owner_id = int(request.query_params.get("owner", request.user.pk))
        except ValueError:
            raise ValidationError(gettext("owner must be a number"))
        if not archers_visible_to(request.user).filter(pk=owner_id).exists():
            raise NotFound()
        shots = Shot.objects.filter(end__session__owner_id=owner_id, x__isnull=False, y__isnull=False)
        # Only an archer who numbers their arrows has anything to show.
        if not shots.filter(arrow_number__isnull=False).exists():
            return Response([])
        rows = shots.values_list(
            "end__session_id", "end__session__setup__arrow_set_revision__arrow_set_id", "end__session__setup__arrow_set_revision__arrow_set__name",
            "end__face", "end__distance_m", "arrow_number", "x", "y",
        )
        return Response(ArrowStatsGroupSerializer(compute_arrow_stats(list(rows)), many=True).data)
