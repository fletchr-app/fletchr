import django_filters
from django.db.models import Q
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import viewsets
from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import SAFE_METHODS, BasePermission, IsAuthenticated
from rest_framework.response import Response

from core.access import note_teams
from core.models import COACH_ROLES, Role, TeamMember, User

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


class NoteFilter(django_filters.FilterSet):
    class Meta:
        model = Note
        fields = ["archer", "session", "end", "team", "author", "visibility"]


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
            .select_related("author__profile", "archer__profile")
        )

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)


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
        raise ValidationError({"archer": "Give the id of the archer"})
    if archer is None:
        return Response([])
    return Response(NoteTeamSerializer(note_teams(request.user, archer), many=True).data)
