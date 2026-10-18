from django.db import transaction
from django.db.models import OuterRef, Subquery
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import generics, serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from . import access
from .models import COACH_ROLES, Invite, Role, Team, TeamMember, User
from .serializers import (
    InviteSerializer,
    MemberSerializer,
    MembershipSettingsSerializer,
    MeSerializer,
    RoleChangeSerializer,
    TeamNameSerializer,
    RedeemSerializer,
    RegisterResponseSerializer,
    RegisterSerializer,
    TeamSerializer,
)


@extend_schema(responses=inline_serializer("Health", {"status": serializers.CharField()}))
@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    return Response({"status": "ok"})


class RegisterView(APIView):
    """Signup is invite-only: the invite code decides which team and role the new user gets."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "invite"

    @extend_schema(request=RegisterSerializer, responses={201: RegisterResponseSerializer})
    @transaction.atomic
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = User.objects.create_user(data["email"], data["password"])
        user.profile.name = data["name"]
        user.profile.save()
        try:
            access.redeem_invite(data["invite_code"], user)
        except access.InviteError as e:
            # Roll back the user so a bad code doesn't leave an account behind.
            transaction.set_rollback(True)
            raise ValidationError({"invite_code": str(e)})
        refresh = RefreshToken.for_user(user)
        return Response(
            {"refresh": str(refresh), "access": str(refresh.access_token), "user": MeSerializer(user).data},
            status=status.HTTP_201_CREATED,
        )


class RedeemInviteView(APIView):
    """An existing user joins another team."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "invite"

    @extend_schema(request=RedeemSerializer, responses={201: TeamSerializer})
    def post(self, request):
        serializer = RedeemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            team = access.redeem_invite(serializer.validated_data["invite_code"], request.user)
        except access.InviteError as e:
            raise ValidationError({"invite_code": str(e)})
        team.my_role = access.role_in(request.user, team)
        team.also_shoots = False
        return Response(TeamSerializer(team).data, status=status.HTTP_201_CREATED)


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = MeSerializer
    http_method_names = ["get", "patch", "head", "options"]

    def get_object(self):
        return self.request.user


class TeamListView(generics.ListAPIView):
    serializer_class = TeamSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Team.objects.none()
        mine = TeamMember.objects.filter(team=OuterRef("pk"), user=self.request.user)
        return (
            access.teams_of(self.request.user)
            .annotate(my_role=Subquery(mine.values("role")[:1]), also_shoots=Subquery(mine.values("also_shoots")[:1]))
            .order_by("name")
        )


def get_my_team(request, team_id):
    """404 for teams the user isn't in, so team ids can't be probed."""
    return get_object_or_404(access.teams_of(request.user), pk=team_id)


class TeamDetailView(APIView):
    @staticmethod
    def _team(request, team_id):
        mine = TeamMember.objects.filter(team=OuterRef("pk"), user=request.user)
        return get_object_or_404(
            access.teams_of(request.user).annotate(my_role=Subquery(mine.values("role")[:1]), also_shoots=Subquery(mine.values("also_shoots")[:1])),
            pk=team_id,
        )

    @extend_schema(responses=TeamSerializer)
    def get(self, request, team_id):
        return Response(TeamSerializer(self._team(request, team_id)).data)

    @extend_schema(request=TeamNameSerializer, responses=TeamSerializer)
    def patch(self, request, team_id):
        """Rename the team. Only admins."""
        team = self._team(request, team_id)
        if team.my_role != Role.ADMIN:
            raise PermissionDenied("Only team admins can rename the team")
        serializer = TeamNameSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        team.name = serializer.validated_data["name"]
        team.save(update_fields=["name"])
        return Response(TeamSerializer(team).data)


class MemberListView(generics.ListAPIView):
    serializer_class = MemberSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return TeamMember.objects.none()
        team = get_my_team(self.request, self.kwargs["team_id"])
        return access.members_visible_to(self.request.user, team).order_by("user__profile__name", "user__email")


class MemberDetailView(APIView):
    @extend_schema(request=RoleChangeSerializer, responses=MemberSerializer)
    def patch(self, request, team_id, user_id):
        """Change someone's role. Only admins; a team always keeps at least one admin."""
        team = get_my_team(request, team_id)
        if not access.is_admin_in(request.user, team):
            raise PermissionDenied("Only team admins can change roles")
        member = get_object_or_404(TeamMember.objects.select_related("user__profile"), team=team, user_id=user_id)
        serializer = RoleChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        role = serializer.validated_data["role"]
        if member.role == Role.ADMIN and role != Role.ADMIN and not TeamMember.objects.filter(team=team, role=Role.ADMIN).exclude(pk=member.pk).exists():
            raise ValidationError("A team needs at least one admin")
        member.role = role
        if role == Role.ARCHER:
            member.also_shoots = False  # an archer's sessions are visible to the coaches anyway
        member.save(update_fields=["role", "also_shoots"])
        return Response(MemberSerializer(member).data)

    @extend_schema(responses={204: None})
    def delete(self, request, team_id, user_id):
        team = get_my_team(request, team_id)
        if not access.is_admin_in(request.user, team):
            raise PermissionDenied("Only team admins can remove members")
        member = get_object_or_404(TeamMember, team=team, user_id=user_id)
        if member.role == Role.ADMIN and not TeamMember.objects.filter(team=team, role=Role.ADMIN).exclude(pk=member.pk).exists():
            raise ValidationError("A team needs at least one admin")
        member.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class InviteListCreateView(generics.ListCreateAPIView):
    serializer_class = InviteSerializer

    def get_team(self):
        team = get_my_team(self.request, self.kwargs["team_id"])
        if not access.is_admin_in(self.request.user, team):
            raise PermissionDenied("Only team admins can manage invites")
        return team

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Invite.objects.none()
        return Invite.objects.filter(team=self.get_team(), used_at__isnull=True, expires_at__gt=timezone.now()).order_by("-created_at")

    def perform_create(self, serializer):
        serializer.save(team=self.get_team(), created_by=self.request.user)


class InviteDetailView(APIView):
    @extend_schema(responses={204: None})
    def delete(self, request, team_id, pk):
        team = get_my_team(request, team_id)
        if not access.is_admin_in(request.user, team):
            raise PermissionDenied("Only team admins can manage invites")
        get_object_or_404(Invite, team=team, pk=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MyMembershipView(APIView):
    """My own settings in a team. Only I can change them."""

    @extend_schema(request=MembershipSettingsSerializer, responses=MembershipSettingsSerializer)
    def patch(self, request, team_id):
        team = get_my_team(request, team_id)
        membership = TeamMember.objects.get(team=team, user=request.user)
        if membership.role not in COACH_ROLES:
            raise PermissionDenied("Only coaches can choose this: archers' sessions are always visible to their coaches")
        serializer = MembershipSettingsSerializer(membership, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class SafeTokenRefreshView(TokenRefreshView):
    """simplejwt crashes (500) when the account behind a refresh token has been deleted: refuse it (401) instead."""

    def post(self, request, *args, **kwargs):
        try:
            return super().post(request, *args, **kwargs)
        except User.DoesNotExist:
            raise InvalidToken("This account no longer exists")
