import django_filters
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils.translation import gettext
from drf_spectacular.utils import extend_schema
from rest_framework import status, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import SAFE_METHODS, BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.access import is_coach_in, teams_of
from core.models import COACH_ROLES, Role, TeamMember

from .defaults import default_criteria, default_name, localize, localize_name
from .models import Evaluation, Template, TemplateVersion
from .serializers import EvaluationSerializer, TemplateSerializer, TemplateWriteSerializer, clean_criteria


def team_of(request, team_id):
    """404 for teams the user is not in, so team ids can't be probed."""
    return get_object_or_404(teams_of(request.user), pk=team_id)


def require_coach(user, team):
    if not is_coach_in(user, team):
        raise PermissionDenied(gettext("Only coaches can change the forms of a team"))


def ensure_default(team, user):
    """A team that has no form yet gets the shooting technique form, in the language of whoever asks first."""
    if team.evaluation_templates.exists():
        return
    template = Template.objects.create(team=team, name=default_name())
    TemplateVersion.objects.create(template=template, number=1, name=template.name, scale=5, criteria=default_criteria(), created_by=user if user.is_authenticated else None)


class TemplateListView(APIView):
    @extend_schema(responses=TemplateSerializer(many=True))
    def get(self, request, team_id):
        """The forms of a team, newest version of each. Every member can read them (an archer fills in a self-assessment)."""
        team = team_of(request, team_id)
        ensure_default(team, request.user)
        return Response(TemplateSerializer(team.evaluation_templates.prefetch_related("versions"), many=True).data)

    @extend_schema(request=TemplateWriteSerializer, responses={201: TemplateSerializer})
    def post(self, request, team_id):
        team = team_of(request, team_id)
        require_coach(request.user, team)
        serializer = TemplateWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if "name" not in data or "criteria" not in data:
            return Response({"detail": gettext("A form needs a name and criteria")}, status=status.HTTP_400_BAD_REQUEST)
        template = Template.objects.create(team=team, name=data["name"])
        TemplateVersion.objects.create(
            template=template, number=1, name=template.name, scale=data.get("scale", 5), criteria=clean_criteria(data["criteria"], template), created_by=request.user
        )
        return Response(TemplateSerializer(template).data, status=status.HTTP_201_CREATED)


class TemplateDetailView(APIView):
    @staticmethod
    def _template(request, pk):
        return get_object_or_404(Template.objects.filter(team__in=teams_of(request.user)).select_related("team"), pk=pk)

    @extend_schema(responses=TemplateSerializer)
    def get(self, request, pk):
        return Response(TemplateSerializer(self._template(request, pk)).data)

    @extend_schema(request=TemplateWriteSerializer, responses=TemplateSerializer)
    def put(self, request, pk):
        """Change the name or the criteria. A change makes a new version; evaluations made before keep the one they were made with."""
        template = self._template(request, pk)
        require_coach(request.user, template.team)
        serializer = TemplateWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        latest = template.latest
        criteria = clean_criteria(data["criteria"], template) if "criteria" in data else latest.criteria
        name = data.get("name", template.name)
        # What the app sends back is the form in the language it was shown in: the same text in another language is no change.
        if localize(criteria) != localize(latest.criteria) or localize_name(name) != localize_name(template.name):
            template.name = name
            template.save(update_fields=["name"])
            TemplateVersion.objects.create(template=template, number=latest.number + 1, name=name, scale=latest.scale, criteria=criteria, created_by=request.user)
        return Response(TemplateSerializer(template).data)

    @extend_schema(responses={204: None, 409: None})
    def delete(self, request, pk):
        """Only a form without evaluations: the others are kept, so that what was rated stays readable."""
        template = self._template(request, pk)
        require_coach(request.user, template.team)
        if Evaluation.objects.filter(template_version__template=template).exists():
            return Response({"detail": gettext("Evaluations were made with this form, so it stays")}, status=status.HTTP_409_CONFLICT)
        template.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class EvaluationPermission(BasePermission):
    """Everyone who can see an evaluation can read it; the author changes it; the author or a team admin deletes it."""

    def has_object_permission(self, request, view, obj):
        if request.method in SAFE_METHODS:
            return True
        if obj.author_id == request.user.id:
            return True
        return request.method == "DELETE" and obj.team_id in view.admin_team_ids(request.user)


class EvaluationFilter(django_filters.FilterSet):
    date_from = django_filters.DateFilter(field_name="date", lookup_expr="gte")
    date_to = django_filters.DateFilter(field_name="date", lookup_expr="lte")

    class Meta:
        model = Evaluation
        fields = ["archer", "team", "kind", "author", "date_from", "date_to"]


class EvaluationViewSet(viewsets.ModelViewSet):
    serializer_class = EvaluationSerializer
    permission_classes = [IsAuthenticated, EvaluationPermission]
    filterset_class = EvaluationFilter
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
            return Evaluation.objects.none()
        user = self.request.user
        coached = TeamMember.objects.filter(user=user, role__in=COACH_ROLES).values("team")
        # A coach sees every evaluation of their teams (the archers' own too). An archer sees what a coach shared and what they wrote.
        return (
            Evaluation.objects.filter(
                Q(team__in=coached)
                | Q(archer=user, kind=Evaluation.Kind.COACH, visibility=Evaluation.Visibility.SHARED)
                | Q(archer=user, kind=Evaluation.Kind.SELF)
                | Q(author=user)
            )
            .select_related("author__profile", "archer__profile", "template_version")
            .prefetch_related("scores")
        )

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)
