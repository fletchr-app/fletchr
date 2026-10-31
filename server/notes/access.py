"""Which notes a user may read."""

from django.db.models import Q

from core.models import COACH_ROLES, TeamMember

from core.access import archers_visible_to
from media.models import Media
from training.models import TrainingSession

from .models import Note


def visible_notes(user):
    """Coaches see every note of their teams except what others keep private; an archer sees the shared notes about
    them; the author always sees their own private notes. A note on a session or a clip of an archer the user coaches, that
    the archer keeps from them, is not shown either, its author included (a coach's note on a session that became private)."""
    coached = TeamMember.objects.filter(user=user, role__in=COACH_ROLES).values("team")
    private = Note.Visibility.PRIVATE
    sessions = TrainingSession.objects.visible_to(user)
    return (
        Note.objects.filter(
            Q(team__in=coached) & ~Q(visibility=private) | Q(archer=user, visibility=Note.Visibility.SHARED) | Q(author=user, visibility=private)
        )
        .exclude(session__in=TrainingSession.objects.filter(owner__in=archers_visible_to(user)).exclude(pk__in=sessions))
        .exclude(media__in=Media.objects.filter(owner__in=archers_visible_to(user)).exclude(pk__in=Media.objects.visible_to(user)))
    )
