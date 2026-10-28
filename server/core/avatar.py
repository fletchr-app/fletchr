"""The profile picture: checked, cleaned and stored as a small JPEG, and signed links for the <img> element."""

import io

from django.conf import settings
from django.core import signing
from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone
from django.utils.translation import gettext
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework.exceptions import ValidationError

LINK_SALT = "avatar-link"


def sign_link(person_id, viewer_id) -> str:
    """A token for the <img> element, which cannot send the sign-in header. Valid for one viewer and one person."""
    return signing.dumps({"p": person_id, "u": viewer_id}, salt=LINK_SALT)


def read_link(token, person_id):
    """The viewer's user id in the token, or None if it is wrong, for another person, or too old."""
    try:
        data = signing.loads(token, salt=LINK_SALT, max_age=settings.MEDIA_LINK_SECONDS)
    except signing.BadSignature:
        return None
    return data["u"] if data.get("p") == person_id else None


def _clean(upload) -> bytes:
    """Open the upload as a JPEG and write it again: no EXIF (GPS), no colour profile, at most AVATAR_MAX_SIDE px."""
    try:
        with Image.open(upload) as image:
            if image.format != "JPEG":
                raise ValidationError(gettext("The picture must be a JPEG"))
            if max(image.size) > settings.AVATAR_MAX_INPUT_SIDE:
                raise ValidationError(gettext("The picture is too large, it should be about 256 px on a side"))
            image = ImageOps.exif_transpose(image).convert("RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise ValidationError(gettext("The picture must be a JPEG"))
    image.thumbnail((settings.AVATAR_MAX_SIDE, settings.AVATAR_MAX_SIDE))
    out = io.BytesIO()
    image.save(out, "JPEG", quality=85, optimize=True)
    return out.getvalue()


def _delete_on_commit(storage, name):
    transaction.on_commit(lambda: storage.delete(name))  # not if the change is rolled back


@transaction.atomic
def set_avatar(profile, upload):
    """Store the picture, replace and delete the old file. Refused for an archer under 18 without consent on record."""
    if not profile.avatar_allowed:
        raise ValidationError(gettext("A picture of an archer under 18 needs the consent of the parents"))
    if upload.size > settings.AVATAR_MAX_BYTES:
        raise ValidationError(gettext("The picture is larger than 512 KB"))
    data = _clean(upload)
    old = profile.avatar.name  # the name, not the field: saving changes the field in place
    profile.avatar.save("avatar.jpg", ContentFile(data), save=False)  # the name comes from Profile.avatar_path
    profile.avatar_updated_at = timezone.now()
    profile.save(update_fields=["avatar", "avatar_updated_at"])
    if old:
        _delete_on_commit(profile.avatar.storage, old)


@transaction.atomic
def remove_avatar(profile) -> bool:
    """Delete the picture and its file. False if there was none."""
    if not profile.avatar:
        return False
    storage, old = profile.avatar.storage, profile.avatar.name
    profile.avatar = ""
    profile.avatar_updated_at = None
    profile.save(update_fields=["avatar", "avatar_updated_at"])
    _delete_on_commit(storage, old)
    return True
