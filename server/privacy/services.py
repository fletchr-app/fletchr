import logging

from django.db import transaction

from core import claims
from core.models import Invite, Role, TeamMember
from equipment.models import ArrowSet, Bow, Setup
from media.models import Media
from notes.models import Note
from training.models import Shot, TrainingSession

logger = logging.getLogger("privacy")


def _delete_training(user) -> dict:
    sessions = TrainingSession.objects.filter(owner=user)
    counts = {"sessions": sessions.count(), "shots": Shot.objects.filter(end__session__owner=user).count()}
    sessions.delete()  # ends, shots and volume entries go with them
    return counts


def _delete_media(user) -> dict:
    media = Media.objects.filter(owner=user)  # what a coach added for the archer too: it is the archer's
    counts = {"media": media.count()}
    media.delete()  # the files go when the commit does
    return counts


def _delete_equipment(user) -> dict:
    counts = {"bows": Bow.objects.filter(owner=user).count(), "arrow_sets": ArrowSet.objects.filter(owner=user).count()}
    # Sessions are already gone, so nothing protects the setups any more. Revisions go with their bow or arrow set.
    Setup.objects.filter(owner=user).delete()
    Bow.objects.filter(owner=user).delete()
    ArrowSet.objects.filter(owner=user).delete()
    return counts


def _delete_notes_about(user) -> dict:
    notes = Note.objects.filter(archer=user)
    counts = {"notes_about_me": notes.count()}
    notes.delete()
    return counts


@transaction.atomic
def delete_my_data(user) -> dict:
    """
    Erase what the user has recorded: sessions, photos and videos, equipment, and the coach notes written about them.
    Kept: the account, the profile, the team memberships, and notes the user wrote about others.
    All or nothing.
    """
    counts = {**_delete_training(user), **_delete_media(user), **_delete_equipment(user), **_delete_notes_about(user)}
    logger.info("User %s deleted their data: %s", user.pk, counts)
    return counts


class AccountBlocked(Exception):
    """The user is the only admin of teams that other people still belong to."""

    def __init__(self, teams):
        self.teams = teams  # [(team, number of other members)]


def _others(team, user):
    """The other people of a team who can act in it: profiles of archers without an account do not count."""
    return TeamMember.objects.filter(team=team).exclude(user=user).exclude(user__is_managed=True)


def _teams_to_hand_over(user):
    blocked = []
    for membership in TeamMember.objects.filter(user=user, role=Role.ADMIN).select_related("team"):
        others = _others(membership.team, user)
        if others.exists() and not others.filter(role=Role.ADMIN).exists():
            blocked.append((membership.team, others.count()))
    return blocked


@transaction.atomic
def delete_account(user) -> dict:
    """
    Erase the user and everything of theirs. Refused (nothing changes) while they are the only admin of a
    team others belong to. Teams they were the only member of go with them, with the profiles of archers without
    an account; in other teams those profiles stay with the team. Notes they wrote about others stay, shown as
    written by a former coach.
    """
    blocked = _teams_to_hand_over(user)
    if blocked:
        raise AccountBlocked(blocked)
    counts = delete_my_data(user)  # first, in the right order: setups are protected while sessions use them
    alone = [m.team for m in TeamMember.objects.filter(user=user).select_related("team") if not _others(m.team, user).exists()]
    teams_left = TeamMember.objects.filter(user=user).count() - len(alone)
    for team in alone:
        claims.delete_team(team)
    # An invite nobody used yet should not outlive the person who made it.
    Invite.objects.filter(created_by=user, used_at__isnull=True).delete()
    pk = user.pk
    user.delete()
    logger.info("User %s deleted their account: %s", pk, counts)
    return {"deleted": counts, "teams_left": teams_left, "teams_deleted": len(alone)}
