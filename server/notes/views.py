from django.utils.translation import gettext
import django_filters
from django.db import transaction
from django.db.models import Q
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import viewsets
from rest_framework.decorators import api_view
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import SAFE_METHODS, BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.access import archers_visible_to, note_teams
from core.models import COACH_ROLES, Role, TeamMember, Tombstone, User
from core.tombstones import forget

from .models import Note
from .serializers import NoteSerializer, NoteTeamSerializer


class NotePermission(BasePermission):
    """Everyone who can see a note can read it; the author edits it; the author or a team admin deletes it."""

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        if obj.author_id == request.user.id:
            return True
        return request.method == "DELETE" and obj.team_id in view.admin_team_ids(request.user)


def readers_with_a_copy(note):
    """Whose phone may keep this note: its author, and the archer if they can read it. Coaches of the team read notes online only."""
    shared = note.visibility == Note.Visibility.SHARED or note.archer_id == note.author_id
    return [note.author_id, note.archer_id] if shared else [note.author_id]


def forget_withdrawn(note, was_shared):
    """A note that was shared with the archer and no longer is: their phone drops it, as if it were deleted."""
    if was_shared and note.visibility != Note.Visibility.SHARED:
        forget(Tombstone.Kind.NOTE, note.uid, [note.archer_id])


class NoteFilter(django_filters.FilterSet):
    updated_after = django_filters.IsoDateTimeFilter(field_name="updated_at", lookup_expr="gt", help_text="Changed after this time")

    class Meta:
        model = Note
        fields = ["archer", "session", "end", "media", "team", "author", "visibility"]


class NoteViewSet(viewsets.ModelViewSet):
    serializer_class = NoteSerializer
    permission_classes = [IsAuthenticated, NotePermission]
    filterset_class = NoteFilter
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    @staticmethod
    def admin_team_ids(user):
        return set(TeamMember.objects.filter(user=user, role=Role.ADMIN).values_list("team_id", flat=True))

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.request is not None and self.request.user.is_authenticated:
            context["admin_team_ids"] = self.admin_team_ids(self.request.user)
            context["visible_owner_ids"] = set(archers_visible_to(self.request.user).values_list("pk", flat=True))
        return context

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Note.objects.none()
        user = self.request.user
        coached = TeamMember.objects.filter(user=user, role__in=COACH_ROLES).values("team")
        # Coaches see every note of their teams except what others keep private; an archer sees the
        # shared notes about them; the author always sees their own private notes.
        private = Note.Visibility.PRIVATE
        return (
            Note.objects.filter(
                Q(team__in=coached) & ~Q(visibility=private)
                | Q(archer=user, visibility=Note.Visibility.SHARED)
                | Q(author=user, visibility=private)
            )
            .select_related("author__profile", "archer__profile", "media")
        )

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)

    def perform_update(self, serializer):
        was_shared = serializer.instance.visibility == Note.Visibility.SHARED
        note = serializer.save()
        forget_withdrawn(note, was_shared)

    def perform_destroy(self, instance):
        with transaction.atomic():
            forget(Tombstone.Kind.NOTE, instance.uid, readers_with_a_copy(instance))
            instance.delete()


@extend_schema(tags=["notes"], request=NoteSerializer, responses={200: NoteSerializer, 201: NoteSerializer})
class NotePutView(APIView):
    """Write a note by the uid the app gave it, or change it. Safe to repeat.

    Only the author can write it. A note of somebody else is answered like one that does not exist. The same
    rules as for `POST`: a note about another person needs a team you coach them in, a note about yourself
    has no team and is private. A photo, clip or session the server has not seen yet is a 400 on that field.
    """

    permission_classes = [IsAuthenticated]

    def put(self, request, uid):
        note = Note.objects.filter(uid=uid).select_related("author__profile", "archer__profile", "media").first()
        if note is not None and note.author_id != request.user.id:
            raise NotFound
        context = {
            "request": request,
            "admin_team_ids": NoteViewSet.admin_team_ids(request.user),
            "visible_owner_ids": set(archers_visible_to(request.user).values_list("pk", flat=True)),
        }
        serializer = NoteSerializer(note, data=request.data, context=context)
        serializer.is_valid(raise_exception=True)
        was_shared = note is not None and note.visibility == Note.Visibility.SHARED
        saved = serializer.save(author=request.user, uid=uid) if note is None else serializer.save()
        forget_withdrawn(saved, was_shared)
        return Response(NoteSerializer(saved, context=context).data, status=200 if note else 201)


@extend_schema(
    parameters=[OpenApiParameter("archer", int, required=True)],
    responses=NoteTeamSerializer(many=True),
)
@api_view(["GET"])
def writable_teams(request):
    """Where I may write notes about this archer. Empty if I am not their coach."""
    try:
        archer = User.objects.filter(pk=int(request.query_params.get("archer", ""))).first()
    except ValueError:
        raise ValidationError({"archer": gettext("Give the id of the archer")})
    if archer is None:
        return Response([])
    return Response(NoteTeamSerializer(note_teams(request.user, archer), many=True).data)
