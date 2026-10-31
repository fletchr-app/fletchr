"""Who may add, change and delete photos and videos."""

from core.access import archers_visible_to
from core.claims import can_write_sessions_of

from .files import sign_link
from .models import Media


def visible_media(user):
    """The photos and clips of the archers whose training `user` may see, and that are shared with them."""
    return Media.objects.visible_to(user).select_related("owner__profile", "event__team")


def media_link(request, media, part) -> str:
    """A link to the file or the thumbnail that opens for an hour, for whoever asks."""
    return request.build_absolute_uri(f"/api/media/{media.pk}/{part}/?token={sign_link(media.pk, request.user.pk)}")


def can_add_for(user, owner) -> bool:
    """Yourself, or an archer you coach (a coach films technique and takes photos of their archers)."""
    return archers_visible_to(user).filter(pk=owner.pk).exists()


def can_change(user, media) -> bool:
    """The archer; whoever uploaded the clip (a coach keeps what they added, and loses it when the archer deletes it); a coach of a profile without an account."""
    return media.owner_id == user.pk or media.uploaded_by_id == user.pk or can_write_sessions_of(user, media.owner)
