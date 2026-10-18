from django.db import transaction
from django.db.models import OuterRef, Subquery
from django.shortcuts import get_object_or_404
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import generics, serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from . import access
from .models import Invite, Role, Team, TeamMember, User
from .serializers import (
    InviteSerializer,
    MemberSerializer,
    MeSerializer,
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
        my_role = TeamMember.objects.filter(team=OuterRef("pk"), user=self.request.user).values("role")[:1]
        return access.teams_of(self.request.user).annotate(my_role=Subquery(my_role)).order_by("name")


def get_my_team(request, team_id):
    """404 for teams the user isn't in, so team ids can't be probed."""
    return get_object_or_404(access.teams_of(request.user), pk=team_id)


class MemberListView(generics.ListAPIView):
    serializer_class = MemberSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return TeamMember.objects.none()
        team = get_my_team(self.request, self.kwargs["team_id"])
        return access.members_visible_to(self.request.user, team).order_by("user__profile__name", "user__email")


class MemberDetailView(APIView):
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
        return Invite.objects.filter(team=self.get_team(), used_at__isnull=True).order_by("-created_at")

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
