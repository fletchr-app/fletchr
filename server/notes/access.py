"""Which notes a user may read."""

from django.db.models import Q

from core.models import COACH_ROLES, TeamMember

from .models import Note


def visible_notes(user):
    """Coaches see every note of their teams except what others keep private; an archer sees the shared notes about
    them; the author always sees their own private notes."""
    coached = TeamMember.objects.filter(user=user, role__in=COACH_ROLES).values("team")
    private = Note.Visibility.PRIVATE
    return Note.objects.filter(
        Q(team__in=coached) & ~Q(visibility=private) | Q(archer=user, visibility=Note.Visibility.SHARED) | Q(author=user, visibility=private)
    )
