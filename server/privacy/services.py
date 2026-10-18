import logging

from django.db import transaction

from equipment.models import ArrowSet, Bow, Setup
from notes.models import Note
from training.models import Shot, TrainingSession

logger = logging.getLogger("privacy")


def _delete_training(user) -> dict:
    sessions = TrainingSession.objects.filter(owner=user)
    counts = {"sessions": sessions.count(), "shots": Shot.objects.filter(end__session__owner=user).count()}
    sessions.delete()  # ends, shots and volume entries go with them
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
    Erase what the user has recorded: sessions, equipment, and the coach notes written about them.
    Kept: the account, the profile, the team memberships, and notes the user wrote about others.
    All or nothing.
    """
    counts = {**_delete_training(user), **_delete_equipment(user), **_delete_notes_about(user)}
    logger.info("User %s deleted their data: %s", user.pk, counts)
    return counts
