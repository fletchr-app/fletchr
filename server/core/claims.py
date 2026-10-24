"""Archers without an account: a coach keeps a profile for them, and the archer takes it over later."""

from django.utils.translation import gettext
from django.db import transaction

from .models import COACH_ROLES, ClaimCode, Role, Team, TeamMember, User, normalize_code


class ClaimError(Exception):
    pass


def find_claim(code):
    return ClaimCode.objects.select_related("profile__profile", "team").filter(code=normalize_code(code)).first()


def managed_archer(coach, team, user_id):
    """The managed profile `user_id` in `team`, if `coach` coaches that team."""
    if not TeamMember.objects.filter(team=team, user=coach, role__in=COACH_ROLES).exists():
        return None
    return User.objects.filter(pk=user_id, is_managed=True, memberships__team=team).first()


def can_write_sessions_of(user, owner):
    """Sessions are written by their owner, or by a coach of a managed profile's team."""
    if owner.pk == user.pk:
        return True
    if not owner.is_managed:
        return False
    coached = TeamMember.objects.filter(user=user, role__in=COACH_ROLES).values("team")
    return TeamMember.objects.filter(user=owner, team__in=coached).exists()


@transaction.atomic
def claim_profile(code, user):
    """
    Move everything of the managed profile (team membership, sessions, coach notes) to `user`, then remove
    the profile. The same error for every failure, so codes cannot be probed. Refused for a coach of the
    profile's team: they would not be an archer there, and the coaches would lose sight of the sessions.
    """
    from media.models import Media
    from notes.models import Note
    from training.models import TrainingSession

    claim = ClaimCode.objects.select_for_update().select_related("profile").filter(code=normalize_code(code)).first()
    if claim is None or not claim.is_usable:
        raise ClaimError(gettext("Invalid or expired code"))
    profile = claim.profile
    if user.is_managed or profile.pk == user.pk:
        raise ClaimError(gettext("Invalid or expired code"))
    memberships = list(TeamMember.objects.filter(user=profile))
    for m in memberships:
        mine = TeamMember.objects.filter(team=m.team, user=user).first()
        if mine is not None and mine.role != Role.ARCHER:
            raise ClaimError(gettext("You are a coach in this team. A profile of an archer can only be taken over by an archer."))
    for m in memberships:
        if TeamMember.objects.filter(team=m.team, user=user).exists():
            m.delete()  # already in the team: keep your own membership
        else:
            m.user = user
            m.save(update_fields=["user"])
    TrainingSession.objects.filter(owner=profile).update(owner=user)
    Media.objects.filter(owner=profile).update(owner=user)  # the files keep their names, which hold the old id
    Note.objects.filter(archer=profile).update(archer=user)
    team = claim.team
    profile.delete()  # its claim codes go with it
    return team


def delete_team(team):
    """Delete the team with what belongs to it, among it the profiles of archers without an account (only those of this team)."""
    profiles = User.objects.filter(is_managed=True, memberships__team=team)
    profiles.exclude(memberships__team__in=Team.objects.exclude(pk=team.pk)).delete()
    team.delete()
