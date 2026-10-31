"""Move everything of one account to another (a person changed how they sign in, ADR 0005).

The list of what points at a user is not written here, it is discovered (`relations()`): every relation to `User` must have
an entry in `HANDLERS`, and `core/tests/test_transfer_guard.py` fails when a new one has none. When you add a model that
points at a user, add its field to `HANDLERS` in the same change.
"""

from dataclasses import dataclass, field

from django.apps import apps
from django.core.files.base import ContentFile
from django.db import models, transaction
from django.utils.translation import gettext
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from .models import Profile, TeamMember, User


class TransferError(Exception):
    pass


MOVE = "move"  # repoint the rows: Model.objects.filter(field=source).update(field=target)
SPECIAL = "special"  # done by hand below (unique rows, the profile)
IGNORE = "ignore"  # stays where it is, the reason is the value

HANDLERS: dict[str, object] = {
    "core.Profile.user": SPECIAL,
    "core.TeamMember.user": SPECIAL,
    "core.Profile.video_consent_by": MOVE,
    "core.Invite.created_by": MOVE,
    "core.Invite.used_by": MOVE,
    "core.ClaimCode.profile": MOVE,
    "core.ClaimCode.created_by": MOVE,
    "equipment.Bow.owner": MOVE,
    "equipment.ArrowSet.owner": MOVE,
    "equipment.Setup.owner": MOVE,
    "training.TrainingSession.owner": MOVE,
    "training.TrainingSession.opened_by": MOVE,
    "training.SessionTombstone.owner": MOVE,
    "core.Tombstone.owner": MOVE,
    "notes.Note.author": MOVE,
    "notes.Note.archer": MOVE,
    "evaluations.TemplateVersion.created_by": MOVE,
    "evaluations.Evaluation.archer": MOVE,
    "evaluations.Evaluation.author": MOVE,
    "media.Media.owner": MOVE,
    "media.Media.uploaded_by": MOVE,
    "core.SocialIdentity.user": (IGNORE, "stays with the old account: its Google ID then points at a deactivated user and cannot sign in"),
    "core.PasswordReset.user": (IGNORE, "dead after the move"),
    "token_blacklist.OutstandingToken.user": (IGNORE, "the tokens are blacklisted"),
    "admin.LogEntry.user": (IGNORE, "history of the admin site"),
    "core.User.groups": (IGNORE, "set by the admin; staff cannot be transferred"),
    "core.User.user_permissions": (IGNORE, "set by the admin; staff cannot be transferred"),
    "core.User_groups.user": (IGNORE, "the same as core.User.groups"),
    "core.User_user_permissions.user": (IGNORE, "the same as core.User.user_permissions"),
}

# Profile fields: copied from the source (the source wins), or left alone. A field in neither list fails the guard test.
COPY_FIELDS = ["name", "dominant_hand", "dominant_eye", "date_of_birth", "units", "training_visibility", "video_consent_at", "video_consent_by"]
SKIP_FIELDS = ["id", "user", "avatar", "avatar_updated_at"]  # the avatar is a file: see FILE_FIELDS

# Every FileField of the project and what happens to its file.
FILE_FIELDS = {
    "core.Profile.avatar": "copied to the target under a new name, the source file is deleted after the commit",
    "media.Media.file": "stays where it is (its name holds the old id, which does not matter for serving)",
    "media.Media.thumbnail": "stays where it is",
}


def relations():
    """(key, relation) for every relation that involves `User`, hidden ones and the tables of many-to-many fields included."""
    for f in User._meta.get_fields(include_hidden=True):
        if not f.is_relation:
            continue
        if f.auto_created and not f.concrete:  # a relation from another model to User
            yield f"{f.related_model._meta.label}.{f.field.name}", f
        else:  # a many-to-many field of User itself
            yield f"{f.model._meta.label}.{f.name}", f


def models_with_files():
    for model in apps.get_models():
        for f in model._meta.get_fields():
            if isinstance(f, models.FileField):
                yield f"{model._meta.label}.{f.name}"


def _handler(key):
    value = HANDLERS[key]
    return (value, None) if isinstance(value, str) else value


@dataclass
class Report:
    moved: dict[str, int] = field(default_factory=dict)
    memberships_moved: int = 0
    memberships_merged: int = 0
    avatar: bool = False
    dry_run: bool = False

    @property
    def total(self):
        return sum(self.moved.values()) + self.memberships_moved


def _data_of(user):
    """Rows of the user's own recordings; a fresh account made through an invite has none."""
    from equipment.models import ArrowSet, Bow, Setup
    from evaluations.models import Evaluation
    from media.models import Media
    from notes.models import Note
    from training.models import TrainingSession

    return {
        "sessions": TrainingSession.objects.filter(owner=user).count(),
        "bows": Bow.objects.filter(owner=user).count(),
        "arrow sets": ArrowSet.objects.filter(owner=user).count(),
        "setups": Setup.objects.filter(owner=user).count(),
        "photos and videos": Media.objects.filter(owner=user).count(),
        "notes about them": Note.objects.filter(archer=user).count(),
        "evaluations about them": Evaluation.objects.filter(archer=user).count(),
    }


def check(source, target):
    if source.pk == target.pk:
        raise TransferError(gettext("Source and target are the same account"))
    for user in (source, target):
        if user.is_managed or user.is_superuser or user.is_staff:
            raise TransferError(gettext("%(email)s is a profile without an account or an admin of the site") % {"email": user.email})
    if not target.is_active:
        raise TransferError(gettext("%(email)s is deactivated") % {"email": target.email})
    has = {k: n for k, n in _data_of(target).items() if n}
    if has:
        raise TransferError(
            gettext("%(email)s already has data (%(what)s). Only an account without data can receive one.")
            % {"email": target.email, "what": ", ".join(f"{n} {k}" for k, n in has.items())}
        )


def _memberships(source, target, report):
    for m in TeamMember.objects.filter(user=source).select_related("team"):
        mine = TeamMember.objects.filter(team=m.team, user=target).first()
        if mine is None:
            m.user = target
            m.save(update_fields=["user"])
            report.memberships_moved += 1
        elif mine.role == m.role:
            mine.also_shoots = mine.also_shoots or m.also_shoots
            mine.save(update_fields=["also_shoots"])
            m.delete()  # in the team already: keep the target's row
            report.memberships_merged += 1
        else:
            raise TransferError(
                gettext("Both are in %(team)s with different roles (%(a)s and %(b)s). Change one of them first.")
                % {"team": m.team.name, "a": m.role, "b": mine.role}
            )


def _profile(source, target, report, dry_run):
    src, dst = source.profile, target.profile
    for name in COPY_FIELDS:
        value = getattr(src, name)
        if name == "name" and not value:
            continue  # the target keeps its own name when the source has none
        setattr(dst, name, value)
    old_target_file = None
    if src.avatar:
        report.avatar = True
        if not dry_run:
            old_target_file = dst.avatar.name or None
            with src.avatar.open("rb") as handle:
                dst.avatar.save("avatar.jpg", ContentFile(handle.read()), save=False)
            dst.avatar_updated_at = src.avatar_updated_at
            gone = src.avatar.name
            src.avatar = ""
            src.avatar_updated_at = None
            storage = Profile._meta.get_field("avatar").storage
            for name in filter(None, [gone, old_target_file]):
                transaction.on_commit(lambda name=name: storage.delete(name))
    dst.save()
    for name in COPY_FIELDS:
        if name != "video_consent_by":
            setattr(src, name, Profile._meta.get_field(name).get_default() if name != "name" else "")
    src.video_consent_by = None
    src.save()


def transfer_account(source, target, *, dry_run=False) -> Report:
    """Move the data of `source` to `target`, deactivate `source`. All or nothing; `dry_run` does everything and rolls back, so the counts are real."""
    report = Report(dry_run=dry_run)
    with transaction.atomic():
        source = User.objects.select_for_update().get(pk=source.pk)
        target = User.objects.select_for_update().get(pk=target.pk)
        check(source, target)
        _memberships(source, target, report)
        _profile(source, target, report, dry_run)
        for key, relation in relations():
            handler, _ = _handler(key)
            if handler != MOVE:
                continue
            model, name = relation.related_model, relation.field.name
            count = model.objects.filter(**{name: source}).update(**{name: target})
            if count:
                report.moved[key] = count
        source.is_active = False
        source.set_unusable_password()
        source.save(update_fields=["is_active", "password"])
        for token in OutstandingToken.objects.filter(user=source):
            BlacklistedToken.objects.get_or_create(token=token)
        if dry_run:
            transaction.set_rollback(True)
    return report
