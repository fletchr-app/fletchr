"""Everything the server holds about one user, as one document (GDPR right of access and portability)."""

from django.utils import timezone

from core.models import TeamMember
from equipment.models import ArrowSet, Bow, Setup
from equipment.serializers import ArrowSetRevisionSerializer, ArrowSetSerializer, BowRevisionSerializer, BowSerializer
from notes.models import Note
from training.models import TrainingSession
from training.serializers import SessionSerializer

FORMAT_VERSION = 1


def _equipment(owner, model, serializer, revision_serializer):
    items = []
    for item in model.objects.filter(owner=owner).select_related("current_revision").order_by("created_at", "id"):
        data = dict(serializer(item).data)
        data["revisions"] = revision_serializer(item.revisions.order_by("number"), many=True).data
        items.append(data)
    return items


def _note(note, **extra):
    return {
        "id": note.pk,
        "team": note.team.name,
        "session": note.session_id,
        "end": note.end_id,
        "body": note.body,
        "visibility": note.visibility,
        "created_at": note.created_at,
        "updated_at": note.updated_at,
        **extra,
    }


def export_user_data(user) -> dict:
    sessions = (
        TrainingSession.objects.filter(owner=user)
        .select_related("owner__profile", "setup__bow_revision", "setup__arrow_set_revision")
        .prefetch_related("ends__shots", "volume_entries")
        .order_by("started_at")
    )
    # Coach notes about the user, the coach-only ones included: they are data about this person. What a
    # coach keeps private, for themselves, is left out; it is in that coach's own export.
    about = Note.objects.filter(archer=user).exclude(visibility=Note.Visibility.PRIVATE).select_related("team", "author__profile").order_by("created_at")
    wrote = Note.objects.filter(author=user).select_related("team", "archer__profile").order_by("created_at")
    profile = user.profile
    return {
        "format_version": FORMAT_VERSION,
        "exported_at": timezone.now(),
        "account": {"id": user.pk, "email": user.email, "date_joined": user.date_joined},
        "profile": {
            "name": profile.name,
            "dominant_hand": profile.dominant_hand,
            "dominant_eye": profile.dominant_eye,
            "date_of_birth": profile.date_of_birth,
            "units": profile.units,
        },
        "teams": [
            {"team": m.team.name, "role": m.role, "also_shoots": m.also_shoots, "joined_at": m.joined_at}
            for m in TeamMember.objects.filter(user=user).select_related("team").order_by("joined_at")
        ],
        "equipment": {
            "bows": _equipment(user, Bow, BowSerializer, BowRevisionSerializer),
            "arrow_sets": _equipment(user, ArrowSet, ArrowSetSerializer, ArrowSetRevisionSerializer),
            "setups": [
                {
                    "id": s.pk,
                    "bow_revision": s.bow_revision_id,
                    "arrow_set_revision": s.arrow_set_revision_id,
                    "created_at": s.created_at,
                }
                for s in Setup.objects.filter(owner=user).order_by("created_at")
            ],
        },
        "sessions": SessionSerializer(sessions, many=True).data,
        "notes_about_me": [
            _note(n, author=(n.author.profile.name or n.author.email) if n.author else "Former coach") for n in about
        ],
        "notes_i_wrote": [_note(n, about=n.archer.profile.name or n.archer.email) for n in wrote],
    }
