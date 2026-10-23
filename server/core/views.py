from django.utils.translation import gettext
from django.db import transaction
from django.db.models import OuterRef, Subquery
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import generics, serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import InvalidToken
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from . import access, claims, mail, resets
from .models import COACH_ROLES, ClaimCode, Invite, Role, Team, TeamMember, User, normalize_code
from .serializers import (
    ArcherNameSerializer,
    ArcherSerializer,
    ClaimCodeSerializer,
    CodePreviewSerializer,
    EmailChangeSerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    TokenPairSerializer,
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
            # A code from a coach for a profile they keep (an archer without an account), or an invite.
            if claims.find_claim(data["invite_code"]) is not None:
                claims.claim_profile(data["invite_code"], user)
            else:
                access.redeem_invite(data["invite_code"], user)
        except (access.InviteError, claims.ClaimError) as e:
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


class CodePreviewView(APIView):
    """What a code would do, so the screen can ask for confirmation first. Open to everybody (the code is the secret)."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "invite"

    @extend_schema(request=RedeemSerializer, responses=CodePreviewSerializer)
    def post(self, request):
        serializer = RedeemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        code = normalize_code(serializer.validated_data["invite_code"])
        invite = Invite.objects.select_related("team").filter(code=code).first()
        if invite is not None and invite.is_usable:
            return Response({"kind": "invite", "team_name": invite.team.name, "profile_name": None})
        claim = claims.find_claim(code)
        if claim is not None and claim.is_usable:
            return Response({"kind": "claim", "team_name": claim.team.name, "profile_name": claim.profile.profile.name})
        raise ValidationError({"invite_code": gettext("Invalid or expired code")})


class RedeemClaimView(APIView):
    """An archer takes over a profile that a coach kept for them."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "invite"

    @extend_schema(request=RedeemSerializer, responses={201: TeamSerializer})
    def post(self, request):
        serializer = RedeemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            team = claims.claim_profile(serializer.validated_data["invite_code"], request.user)
        except claims.ClaimError as e:
            raise ValidationError({"invite_code": str(e)})
        team.my_role = access.role_in(request.user, team)
        team.also_shoots = False
        return Response(TeamSerializer(team).data, status=status.HTTP_201_CREATED)


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = MeSerializer
    http_method_names = ["get", "patch", "head", "options"]

    def get_object(self):
        return self.request.user


MAX_TEAMS_PER_USER = 5  # teams one person may administer


class ChangePasswordView(APIView):
    """Set a new password. Every other session of the account is signed out; this one gets new tokens."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "sensitive"

    @extend_schema(request=PasswordChangeSerializer, responses=TokenPairSerializer)
    @transaction.atomic
    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.save(update_fields=["password"])
        for token in OutstandingToken.objects.filter(user=user):
            BlacklistedToken.objects.get_or_create(token=token)
        mail.send_password_changed(user)
        refresh = RefreshToken.for_user(user)
        return Response({"access": str(refresh.access_token), "refresh": str(refresh)})


class PasswordResetRequestView(APIView):
    """Mail a code to an email address. The answer is the same whether the address has an account or not."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "reset_request"

    @extend_schema(request=PasswordResetRequestSerializer, responses={204: None})
    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        resets.request_reset(serializer.validated_data["email"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class PasswordResetConfirmView(APIView):
    """Set a new password with the code from the mail. All sessions of the account are signed out."""

    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "reset_confirm"

    @extend_schema(request=PasswordResetConfirmSerializer, responses={204: None})
    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            resets.confirm_reset(**serializer.validated_data)
        except resets.ResetError as e:
            raise ValidationError({e.field: e.messages})
        return Response(status=status.HTTP_204_NO_CONTENT)


class ChangeEmailView(APIView):
    """Set a new email address (it is the login name). Takes effect at once: the server cannot send mail yet."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "sensitive"

    @extend_schema(request=EmailChangeSerializer, responses=MeSerializer)
    def post(self, request):
        serializer = EmailChangeSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.email = serializer.validated_data["new_email"]
        user.save(update_fields=["email"])
        return Response(MeSerializer(user).data)


class TeamListView(generics.ListAPIView):
    serializer_class = TeamSerializer

    def get_throttles(self):
        # Only creating a team is limited, not reading the list.
        if self.request.method == "POST":
            self.throttle_scope = "team_create"
            return [ScopedRateThrottle()]
        return super().get_throttles()

    @extend_schema(request=TeamNameSerializer, responses={201: TeamSerializer}, methods=["POST"])
    @transaction.atomic
    def post(self, request):
        """Create a team. You become its admin; invite archers and coaches from there."""
        serializer = TeamNameSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if TeamMember.objects.filter(user=request.user, role=Role.ADMIN).count() >= MAX_TEAMS_PER_USER:
            raise ValidationError(gettext("You already manage %(n)s teams") % {"n": MAX_TEAMS_PER_USER})
        team = Team.objects.create(name=serializer.validated_data["name"])
        TeamMember.objects.create(team=team, user=request.user, role=Role.ADMIN)
        team.my_role = Role.ADMIN
        team.also_shoots = False
        return Response(TeamSerializer(team).data, status=status.HTTP_201_CREATED)

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

    @extend_schema(responses={204: None})
    @transaction.atomic
    def delete(self, request, team_id):
        """
        Delete the team for good. Only admins. Goes with it: memberships, invites, claim codes, the notes
        written in the team, and the profiles of archers without an account. Real accounts and their
        sessions and equipment stay.
        """
        team = self._team(request, team_id)
        if team.my_role != Role.ADMIN:
            raise PermissionDenied(gettext("Only team admins can delete the team"))
        claims.delete_team(Team.objects.get(pk=team.pk))
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=TeamNameSerializer, responses=TeamSerializer)
    def patch(self, request, team_id):
        """Rename the team. Only admins."""
        team = self._team(request, team_id)
        if team.my_role != Role.ADMIN:
            raise PermissionDenied(gettext("Only team admins can rename the team"))
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
            raise PermissionDenied(gettext("Only team admins can change roles"))
        member = get_object_or_404(TeamMember.objects.select_related("user__profile"), team=team, user_id=user_id)
        serializer = RoleChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        role = serializer.validated_data["role"]
        if member.role == Role.ADMIN and role != Role.ADMIN and not TeamMember.objects.filter(team=team, role=Role.ADMIN).exclude(pk=member.pk).exists():
            raise ValidationError(gettext("A team needs at least one admin"))
        member.role = role
        if role == Role.ARCHER:
            member.also_shoots = False  # an archer's sessions are visible to the coaches anyway
        member.save(update_fields=["role", "also_shoots"])
        return Response(MemberSerializer(member).data)

    @extend_schema(responses={204: None})
    def delete(self, request, team_id, user_id):
        team = get_my_team(request, team_id)
        if not access.is_admin_in(request.user, team):
            raise PermissionDenied(gettext("Only team admins can remove members"))
        member = get_object_or_404(TeamMember, team=team, user_id=user_id)
        if member.role == Role.ADMIN and not TeamMember.objects.filter(team=team, role=Role.ADMIN).exclude(pk=member.pk).exists():
            raise ValidationError(gettext("A team needs at least one admin"))
        member.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class InviteListCreateView(generics.ListCreateAPIView):
    serializer_class = InviteSerializer

    def get_team(self):
        team = get_my_team(self.request, self.kwargs["team_id"])
        if not access.is_admin_in(self.request.user, team):
            raise PermissionDenied(gettext("Only team admins can manage invites"))
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
            raise PermissionDenied(gettext("Only team admins can manage invites"))
        get_object_or_404(Invite, team=team, pk=pk).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


def coached_team(request, team_id):
    team = get_my_team(request, team_id)
    if not access.is_coach_in(request.user, team):
        raise PermissionDenied(gettext("Only coaches can manage the archers of a team"))
    return team


class ManagedArcherListView(APIView):
    @extend_schema(request=ArcherNameSerializer, responses={201: MemberSerializer})
    @transaction.atomic
    def post(self, request, team_id):
        """Add an archer without an account: a profile that only the coaches of the team can see."""
        team = coached_team(request, team_id)
        serializer = ArcherNameSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.create_managed(serializer.validated_data["name"])
        member = TeamMember.objects.create(team=team, user=user, role=Role.ARCHER)
        return Response(MemberSerializer(member).data, status=status.HTTP_201_CREATED)


class ManagedArcherDetailView(APIView):
    @staticmethod
    def _profile(request, team_id, user_id):
        team = coached_team(request, team_id)
        profile = claims.managed_archer(request.user, team, user_id)
        if profile is None:
            raise NotFound()
        return team, profile

    @extend_schema(request=ArcherNameSerializer, responses=MemberSerializer)
    def patch(self, request, team_id, user_id):
        team, profile = self._profile(request, team_id, user_id)
        serializer = ArcherNameSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile.profile.name = serializer.validated_data["name"]
        profile.profile.save(update_fields=["name"])
        return Response(MemberSerializer(TeamMember.objects.get(team=team, user=profile)).data)

    @extend_schema(responses={204: None})
    def delete(self, request, team_id, user_id):
        """Remove the profile with its sessions and the notes about it, for good."""
        _, profile = self._profile(request, team_id, user_id)
        profile.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ClaimCodeView(APIView):
    @extend_schema(request=None, responses={201: ClaimCodeSerializer})
    @transaction.atomic
    def post(self, request, team_id, user_id):
        """A new code for the archer to take over this profile. An earlier code stops working."""
        team, profile = ManagedArcherDetailView._profile(request, team_id, user_id)
        profile.claim_codes.all().delete()
        claim = ClaimCode.objects.create(profile=profile, team=team, created_by=request.user)
        return Response(ClaimCodeSerializer(claim).data, status=status.HTTP_201_CREATED)


class ArcherView(APIView):
    @extend_schema(responses=ArcherSerializer)
    def get(self, request, user_id):
        """Who this is, for an archer whose training I may see."""
        archer = get_object_or_404(access.archers_visible_to(request.user).select_related("profile"), pk=user_id)
        coached = TeamMember.objects.filter(user=request.user, role__in=COACH_ROLES).values("team")
        team = Team.objects.filter(pk__in=coached, memberships__user=archer).order_by("name").first()
        return Response(
            {
                "id": archer.pk,
                "name": archer.profile.name or ("" if archer.is_managed else archer.email),
                "managed": archer.is_managed,
                "team_id": team and team.pk,
                "team_name": team and team.name,
            }
        )


class MyMembershipView(APIView):
    """My own settings in a team. Only I can change them."""

    @extend_schema(request=MembershipSettingsSerializer, responses=MembershipSettingsSerializer)
    def patch(self, request, team_id):
        team = get_my_team(request, team_id)
        membership = TeamMember.objects.get(team=team, user=request.user)
        if membership.role not in COACH_ROLES:
            raise PermissionDenied(gettext("Only coaches can choose this: archers' sessions are always visible to their coaches"))
        serializer = MembershipSettingsSerializer(membership, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    @extend_schema(responses={204: None})
    def delete(self, request, team_id):
        """Leave the team. Your sessions and equipment stay yours; a team keeps at least one admin."""
        team = get_my_team(request, team_id)
        membership = TeamMember.objects.get(team=team, user=request.user)
        if membership.role == Role.ADMIN and not TeamMember.objects.filter(team=team, role=Role.ADMIN).exclude(pk=membership.pk).exists():
            raise ValidationError(gettext("You are the only admin. Make someone else an admin first, or delete the team."))
        membership.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SafeTokenRefreshView(TokenRefreshView):
    """simplejwt crashes (500) when the account behind a refresh token has been deleted: refuse it (401) instead."""

    def post(self, request, *args, **kwargs):
        try:
            return super().post(request, *args, **kwargs)
        except User.DoesNotExist:
            raise InvalidToken(gettext("This account no longer exists"))
