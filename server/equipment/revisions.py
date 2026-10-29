from django.db import transaction

from .models import ARROW_SET_FIELDS, BOW_FIELDS, ArrowSet, ArrowSetRevision, Bow, BowRevision

KINDS = {
    Bow: (BowRevision, BOW_FIELDS, "bow"),
    ArrowSet: (ArrowSetRevision, ARROW_SET_FIELDS, "arrow_set"),
}


@transaction.atomic
def record_revision(item, uid=None):
    """Make sure the item's current revision matches its current values; write a new one only if they differ.

    `uid` is the id the app gave a revision it made offline; it is used only when a new revision is written."""
    revision_model, fields, link = KINDS[type(item)]
    values = {f: getattr(item, f) for f in fields}
    last = item.current_revision
    if last is not None and all(getattr(last, f) == v for f, v in values.items()):
        return last
    number = last.number + 1 if last else 1
    extra = {"uid": uid} if uid is not None else {}
    revision = revision_model.objects.create(**{link: item}, number=number, **values, **extra)
    item.current_revision = revision
    item.save(update_fields=["current_revision"])
    return revision
