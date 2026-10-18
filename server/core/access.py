"""Who may see what. Every endpoint that returns team or archer data goes through here."""

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .models import COACH_ROLES, Invite, Role, Team, TeamMember, User


class InviteError(Exception):
    pass


def teams_of(user):
    return Team.objects.filter(memberships__user=user)


def role_in(user, team):
    return TeamMember.objects.filter(team=team, user=user).values_list("role", flat=True).first()


def is_coach_in(user, team):
    return role_in(user, team) in COACH_ROLES


def is_admin_in(user, team):
    return role_in(user, team) == Role.ADMIN


def members_visible_to(user, team):
    """Coaches and admins see everyone in the team; archers see the staff and themselves."""
    members = TeamMember.objects.filter(team=team).select_related("user__profile")
    if is_coach_in(user, team):
        return members
    return members.filter(Q(role__in=COACH_ROLES) | Q(user=user))


def archers_visible_to(user):
    """Users whose training data `user` may read: themselves, the archers in teams they coach, and the
    coaches of those teams who have turned on `also_shoots`."""
    coached = TeamMember.objects.filter(user=user, role__in=COACH_ROLES).values("team")
    shooters = (
        TeamMember.objects.filter(team__in=coached)
        .filter(Q(role=Role.ARCHER) | Q(role__in=COACH_ROLES, also_shoots=True))
        .values("user")
    )
    return User.objects.filter(Q(pk=user.pk) | Q(pk__in=shooters))


def note_teams(coach, archer):
    """Teams in which `coach` may write notes about `archer`: teams they coach where the person is an
    archer, or a coach who shares their training."""
    coached = TeamMember.objects.filter(user=coach, role__in=COACH_ROLES).values("team")
    shooting = (
        TeamMember.objects.filter(user=archer)
        .filter(Q(role=Role.ARCHER) | Q(role__in=COACH_ROLES, also_shoots=True))
        .values("team")
    )
    return Team.objects.filter(pk__in=coached).filter(pk__in=shooting).order_by("name")


@transaction.atomic
def redeem_invite(code, user):
    """Add `user` to the invite's team. The same error for every failure, so codes can't be probed."""
    invite = Invite.objects.select_for_update().filter(code=code.strip().upper()).first()
    if invite is None or not invite.is_usable:
        raise InviteError("Invalid or expired invite code")
    if TeamMember.objects.filter(team=invite.team, user=user).exists():
        raise InviteError("You are already a member of this team")
    TeamMember.objects.create(team=invite.team, user=user, role=invite.role)
    invite.used_by = user
    invite.used_at = timezone.now()
    invite.save(update_fields=["used_by", "used_at"])
    return invite.team
