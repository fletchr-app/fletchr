"""Two sessions for the same training (the coach opened one, the archer started another) become one.

The rule is on pairs and does not depend on which session arrives first (specs/adrs/0004-merging-sessions.md)."""

from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .models import SessionTombstone, TrainingSession

# A session without `ended_at` counts as ending this long after it started, or a coach's session that
# is never ended would overlap every later session.
OPEN_SESSION_CAP = timedelta(hours=4)

# Copied from the loser into the winner where the winner's value is empty.
FILLED_FIELDS = ("ended_at", "type", "environment", "location", "weather", "setup_id", "physical_rating", "mental_rating", "goals", "notes", "event_id")


def window(session):
    end = session.ended_at or session.started_at + OPEN_SESSION_CAP
    return session.started_at, max(end, session.started_at)


def has_results(session):
    return session.ends.exists() or session.volume_entries.exists()


def opened_by_other(session):
    return session.opened_by_id is not None and session.opened_by_id != session.owner_id


def can_lose(session):
    """Only a session someone else opened for the archer, and without results."""
    return opened_by_other(session) and not has_results(session)


def pick_winner(a, b):
    """(winner, loser) of two sessions of one owner, or None when they must stay apart."""
    losers = [s for s in (a, b) if can_lose(s)]
    if not losers:
        return None
    if len(losers) == 1:
        loser = losers[0]
    else:  # both empty and opened by others: the later start loses, then the larger id (values from the app, not the arrival order)
        loser = max(losers, key=lambda s: (s.started_at, str(s.pk)))
    winner = b if loser is a else a
    return winner, loser


def overlapping(session, viewer=None):
    """The sessions of the same owner that overlap in time; with `viewer`, only those they may see."""
    start, end = window(session)
    candidates = TrainingSession.objects if viewer is None else TrainingSession.objects.visible_to(viewer)
    return (
        candidates.filter(owner_id=session.owner_id, started_at__lte=end)
        .filter(Q(ended_at__gte=start) | Q(ended_at__isnull=True, started_at__gte=start - OPEN_SESSION_CAP))
        .exclude(pk=session.pk)
    )


def merge_candidates(session, viewer=None):
    """Sessions that overlap this one in time and could be merged with it, as (winner, loser) pairs."""
    pairs = (pick_winner(session, other) for other in overlapping(session, viewer))
    return [p for p in pairs if p is not None]


@transaction.atomic
def merge(loser, winner):
    """Move media and notes of `loser` to `winner`, keep `loser`'s id as an alias, delete the row."""
    from media.models import Media
    from notes.models import Note

    now = timezone.now()  # `update()` does not set `updated_at`, and the phones pull by it
    Media.objects.filter(session=loser).update(session=winner, updated_at=now)
    Note.objects.filter(session=loser).update(session=winner, updated_at=now)
    changed = []
    for field in FILLED_FIELDS:
        mine, theirs = getattr(winner, field), getattr(loser, field)
        if mine in (None, "") and theirs not in (None, ""):
            setattr(winner, field, theirs)
            changed.append(field)
    now = timezone.now()
    # Every id that pointed at the loser points at the winner now, so a lookup is one hop.
    SessionTombstone.objects.filter(merged_into=loser).update(merged_into=winner, at=now)
    SessionTombstone.objects.update_or_create(pk=loser.pk, defaults={"owner_id": loser.owner_id, "merged_into": winner, "at": now})
    loser.delete()
    winner.save(update_fields=[*changed, "updated_at"] if changed else ["updated_at"])


def merge_if_possible(session, viewer=None):
    """Merge `session` with what it belongs to. Returns the session that exists afterwards.

    With `viewer` (whoever sent the request), a session they may not see is never merged with: a coach who opens a
    session must not be handed the data of an archer's private one.

    An empty session that overlaps more than one other is left alone: a coach's open session must not
    swallow a morning and an evening session."""
    for winner, loser in merge_candidates(session, viewer):
        if len(merge_candidates(loser)) > 1:
            continue
        merge(loser, winner)
        if loser.pk == session.pk:
            return winner
        session.refresh_from_db()
    return session


def resolve_session_id(session_id):
    """The id of the live session behind `session_id` (itself, or the session it was merged into), else None."""
    if TrainingSession.objects.filter(pk=session_id).exists():
        return session_id
    return SessionTombstone.objects.filter(pk=session_id).values_list("merged_into_id", flat=True).first()
