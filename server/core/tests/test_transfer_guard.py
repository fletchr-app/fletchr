"""Fails when a model starts to point at a user (or a profile gets a field) and the transfer does not know what to do with it."""

from core import transfer
from core.models import Profile


def test_every_relation_to_user_has_a_handler():
    missing = [key for key, _ in transfer.relations() if key not in transfer.HANDLERS]
    assert not missing, f"core/transfer.py does not handle {missing}: add it to HANDLERS in core/transfer.py (move, special or ignore with a reason)"


def test_no_handler_for_a_relation_that_does_not_exist():
    existing = {key for key, _ in transfer.relations()}
    stale = [key for key in transfer.HANDLERS if key not in existing]
    assert not stale, f"HANDLERS in core/transfer.py has entries without a relation: {stale}"


def test_every_profile_field_is_copied_or_skipped():
    names = {f.name for f in Profile._meta.concrete_fields}
    unknown = names - set(transfer.COPY_FIELDS) - set(transfer.SKIP_FIELDS)
    assert not unknown, f"Profile fields {sorted(unknown)} are in neither COPY_FIELDS nor SKIP_FIELDS in core/transfer.py"
    assert not (set(transfer.COPY_FIELDS) | set(transfer.SKIP_FIELDS)) - names, "COPY_FIELDS or SKIP_FIELDS name a field Profile no longer has"


def test_every_file_field_is_described():
    files = set(transfer.models_with_files())
    assert files == set(transfer.FILE_FIELDS), f"FILE_FIELDS in core/transfer.py differs from the FileFields of the project: {sorted(files ^ set(transfer.FILE_FIELDS))}"
