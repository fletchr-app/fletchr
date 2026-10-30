"""Putting a photo or clip into a session, or taking it out: the one place that does it (#91, and the attach of an event, #104)."""

from django.db import transaction
from django.utils import timezone


@transaction.atomic
def move_to_session(media, session):
    """Put `media` into `session` (None: take it out). The notes on it go along; their end was one of the old session."""
    media.session = session
    media.save(update_fields=["session", "updated_at"])  # `updated_at` only changes when it is named here; the phones pull by it
    media.coach_notes.update(session=session, end=None, updated_at=timezone.now())
