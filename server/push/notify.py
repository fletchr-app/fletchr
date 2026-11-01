"""Which events send a notification, to whom, and what it says. See specs/design/push-notifications.md.

The texts are generic on purpose: the lock screen and Google never see a note, a name or a team. The data carries ids only.
Everything here runs after the commit and swallows every failure: saving must work whatever Firebase does.
"""
import logging
import time
from datetime import timedelta

from django.db import transaction
from django.utils import timezone, translation
from django.utils.translation import gettext

from core.models import COACH_ROLES, TeamMember

from . import fcm
from .models import Device

log = logging.getLogger(__name__)

BUDGET_S = 5  # all devices of one event together; what is left over is dropped
STALE_AFTER = timedelta(days=270)  # Google treats a token that was not used for this long as stale

NOTE, EVALUATION, TEAM = "note", "evaluation", "team"
# The Profile switch of each type, and the Android channel it shows in (the app creates the channels).
SWITCH = {NOTE: "push_notes", EVALUATION: "push_evaluations", TEAM: "push_team"}
CHANNEL = {NOTE: "notes", EVALUATION: "evaluations", TEAM: "team"}


def _texts(kind):
    """Title and body, looked up when called, so they follow the language that is active."""
    return {
        NOTE: (gettext("New note from your coach"), gettext("Tap to read it.")),
        EVALUATION: (gettext("New evaluation"), gettext("Your coach shared an evaluation with you.")),
        TEAM: (gettext("Someone joined your team"), gettext("Tap to see your team.")),
    }[kind]


def _message(kind, data, language):
    with translation.override(language if language else "en"):
        title, body = _texts(kind)
    return {
        "notification": {"title": title, "body": body},
        "android": {
            "ttl": "604800s",
            "notification": {"channel_id": CHANNEL[kind], "tag": f"{kind}-{data.get(kind, data.get('team', ''))}"},
        },
        "data": {"type": kind, **{k: str(v) for k, v in data.items() if v not in (None, "")}},
    }


def _send_all(user_id, kind, data):
    from core.models import User

    try:
        user = User.objects.select_related("profile").filter(pk=user_id, is_active=True, is_managed=False).first()
        if user is None or not getattr(user.profile, SWITCH[kind]) or not fcm.available():
            return
        Device.objects.filter(user=user, last_seen_at__lt=timezone.now() - STALE_AFTER).delete()
        data = {**data, "user": user.pk}
        deadline = time.monotonic() + BUDGET_S
        for device in Device.objects.filter(user=user):
            if time.monotonic() > deadline:
                log.warning("Push budget used up, devices of user %s skipped", user.pk)
                break
            if fcm.send(device.token, _message(kind, data, device.language)) == fcm.GONE:
                device.delete()
    except Exception:
        log.exception("Could not send a push notification")


def notify(user_id, kind, **data):
    """Tell one person about an event, after the transaction that caused it has committed. Never raises."""
    transaction.on_commit(lambda: _send_all(user_id, kind, data))


def note_readable_by_archer(note):
    """Whether the archer can read the note now: shared, and not hidden by the other rules of `visible_notes` (their own notes do not count)."""
    from notes.access import visible_notes
    from notes.models import Note

    return (
        note.pk is not None
        and note.author_id != note.archer_id
        and note.visibility == Note.Visibility.SHARED
        and visible_notes(note.archer).filter(pk=note.pk).exists()
    )


def note_saved(note, was_readable):
    """After a save: only the change from "the archer cannot read it" to "can" sends, so a repeated PUT or an edit does not."""
    if not was_readable and note_readable_by_archer(note):
        notify(note.archer_id, NOTE, note=note.pk, session=note.session_id, media=note.media_id, event=note.event_id)


def evaluation_shared(evaluation):
    return evaluation.kind == "coach" and evaluation.visibility == "shared" and evaluation.author_id != evaluation.archer_id


def evaluation_saved(evaluation, was_shared):
    if not was_shared and evaluation_shared(evaluation):
        notify(evaluation.archer_id, EVALUATION, evaluation=evaluation.pk, team=evaluation.team_id)


def code_used(created_by_id, team, user):
    """Someone used an invite or claim code: its creator hears of it, if they still coach the team."""
    if created_by_id is None or created_by_id == user.pk:
        return
    if TeamMember.objects.filter(team=team, user_id=created_by_id, role__in=COACH_ROLES).exists():
        notify(created_by_id, TEAM, team=team.pk)
