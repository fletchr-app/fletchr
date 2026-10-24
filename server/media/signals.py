"""The files go when the row goes, however it is deleted: one clip, a session's owner, an account, a team's profiles."""

from django.db import transaction
from django.db.models.signals import post_delete
from django.dispatch import receiver

from .models import Media


@receiver(post_delete, sender=Media)
def remove_files(sender, instance, **kwargs):
    files = [f for f in (instance.file, instance.thumbnail) if f]

    def remove():
        for f in files:
            f.storage.delete(f.name)

    transaction.on_commit(remove)  # not if the deletion is rolled back
