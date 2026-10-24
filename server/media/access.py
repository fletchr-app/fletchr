"""Who may add, change and delete photos and videos."""

from core.access import archers_visible_to
from core.claims import can_write_sessions_of


def can_add_for(user, owner) -> bool:
    """Yourself, or an archer you coach (a coach films technique and takes photos of their archers)."""
    return archers_visible_to(user).filter(pk=owner.pk).exists()


def can_change(user, media) -> bool:
    """The archer; whoever uploaded the clip (a coach keeps what they added, and loses it when the archer deletes it); a coach of a profile without an account."""
    return media.owner_id == user.pk or media.uploaded_by_id == user.pk or can_write_sessions_of(user, media.owner)
