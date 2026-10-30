"""Telling phones that a photo, video or note is gone (`core.models.Tombstone`)."""

from django.utils import timezone

from .models import Tombstone


def forget(kind, uid, owners):
    """Write the tombstone of an item for each of `owners` (user ids). One that exists is renewed, so it is read again."""
    now = timezone.now()
    for owner_id in set(owners):
        Tombstone.objects.update_or_create(kind=kind, uid=uid, owner_id=owner_id, defaults={"at": now})
