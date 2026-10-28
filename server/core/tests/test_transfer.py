import uuid
from datetime import date
from unittest import mock

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import connection
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import RefreshToken

from core import avatar, transfer
from core.models import Invite, Role, SocialIdentity, Team, TeamMember, User
from core.tests.test_avatar import jpeg, upload
from equipment.models import ArrowSet, Bow, Setup
from media.models import Media
from notes.models import Note
from privacy.tests.test_delete_data import give_gear
from training.models import TrainingSession
from training.tests.test_overview import make_session


@pytest.fixture
def old(club):
    return club["archer1"]


@pytest.fixture
def new(make_user):
    user = User.objects.create_user("new@gmail.test")
    user.set_unusable_password()
    user.save()
    SocialIdentity.objects.create(user=user, provider="google", subject="sub-new")
    return user


def media_for(owner, **extra):
    return Media.objects.create(
        id=uuid.uuid4(), owner=owner, uploaded_by=owner, kind="photo", file=SimpleUploadedFile("a.jpg", jpeg()), thumbnail=SimpleUploadedFile("t.jpg", jpeg()),
        taken_at="2026-10-24T10:00:00Z", width=10, height=10, size=3, **extra,
    )


def fill(club, old):
    setup = give_gear(old)
    session = make_session(old, arrows=6, volume=30)
    TrainingSession.objects.filter(pk=session.pk).update(setup=setup)
    media_for(old)
    Note.objects.create(team=club["a"], author=club["coach"], archer=old, body="about", visibility="shared")
    Note.objects.create(team=club["a"], author=old, archer=club["archer2"], body="by", visibility="shared")
    Invite.objects.create(team=club["a"], created_by=old)
    old.profile.name, old.profile.dominant_hand, old.profile.date_of_birth = "Old Name", "left", date(2000, 1, 1)
    old.profile.save()


def snapshot():
    """Every row of every table, to see that a dry run changed nothing."""
    result = {}
    with connection.cursor() as cursor:
        for table in connection.introspection.table_names():
            cursor.execute(f'SELECT * FROM "{table}"')
            result[table] = sorted(map(repr, cursor.fetchall()))
    return result


def test_everything_moves_and_the_old_account_is_closed(club, old, new):
    fill(club, old)
    refresh = RefreshToken.for_user(old)
    report = transfer.transfer_account(old, new)
    for model, field in [(TrainingSession, "owner"), (Bow, "owner"), (ArrowSet, "owner"), (Setup, "owner"), (Media, "owner"), (Media, "uploaded_by"), (Note, "archer"), (Invite, "created_by")]:
        assert not model.objects.filter(**{field: old}).exists(), model
        assert model.objects.filter(**{field: new}).count() == 1, model
    assert Note.objects.filter(author=new).count() == 1  # the note the old account wrote
    assert report.moved["training.TrainingSession.owner"] == 1 and report.moved["notes.Note.archer"] == 1 and report.memberships_moved == 1
    assert TeamMember.objects.get(user=new, team=club["a"]).role == Role.ARCHER and not TeamMember.objects.filter(user=old).exists()
    new.profile.refresh_from_db()
    assert (new.profile.name, new.profile.dominant_hand, new.profile.date_of_birth) == ("Old Name", "left", date(2000, 1, 1))
    old.refresh_from_db()
    assert not old.is_active and not old.has_usable_password() and old.profile.name == "" and old.profile.dominant_hand == ""
    assert BlacklistedToken.objects.filter(token__token=str(refresh)).exists()
    assert SocialIdentity.objects.get(subject="sub-new").user == new  # keeps working with its own identity


def test_the_report_counts_are_the_changes(club, old, new):
    fill(club, old)
    before = TrainingSession.objects.filter(owner=old).count() + Bow.objects.filter(owner=old).count()
    report = transfer.transfer_account(old, new)
    assert report.moved["training.TrainingSession.owner"] + report.moved["equipment.Bow.owner"] == before
    assert report.total == sum(report.moved.values()) + 1


def test_a_dry_run_changes_nothing(club, old, new):
    fill(club, old)
    before = snapshot()
    report = transfer.transfer_account(old, new, dry_run=True)
    assert report.dry_run and report.moved["training.TrainingSession.owner"] == 1
    assert snapshot() == before


@pytest.mark.parametrize("maker", [lambda u: make_session(u, arrows=1, volume=0), lambda u: give_gear(u), lambda u: media_for(u)])
def test_a_target_with_data_is_refused(club, old, new, maker):
    maker(new)
    with pytest.raises(transfer.TransferError, match="already has data"):
        transfer.transfer_account(old, new)
    assert old.is_active


def test_a_target_with_only_a_profile_and_a_membership_is_fine(club, old, new):
    TeamMember.objects.create(team=club["b"], user=new, role=Role.ARCHER)
    new.profile.name = "Mine"
    new.profile.save()
    transfer.transfer_account(old, new)
    assert set(TeamMember.objects.filter(user=new).values_list("team__name", flat=True)) == {"Team A", "Team B"}


def test_both_in_the_same_team_keep_one_row(club, old, new):
    TeamMember.objects.create(team=club["a"], user=new, role=Role.ARCHER)
    report = transfer.transfer_account(old, new)
    assert TeamMember.objects.filter(team=club["a"], user=new).count() == 1 and report.memberships_merged == 1


def test_different_roles_in_the_same_team_are_refused_and_nothing_changes(club, old, new):
    fill(club, old)
    TeamMember.objects.create(team=club["a"], user=new, role=Role.COACH)
    before = snapshot()
    with pytest.raises(transfer.TransferError, match="different roles"):
        transfer.transfer_account(old, new)
    assert snapshot() == before


def test_to_self_to_a_managed_profile_and_from_an_admin_are_refused(club, old, new):
    managed = User.objects.create_managed("Kid")
    for source, target in [(old, old), (old, managed), (managed, new), (club["admin"], new)]:
        if source is club["admin"]:
            User.objects.filter(pk=source.pk).update(is_staff=True)
            source.refresh_from_db()
        with pytest.raises(transfer.TransferError):
            transfer.transfer_account(source, target)


def test_a_handler_that_raises_leaves_everything_unchanged(club, old, new):
    fill(club, old)
    before = snapshot()
    with mock.patch("core.transfer.relations", side_effect=RuntimeError("boom")), pytest.raises(RuntimeError):
        transfer.transfer_account(old, new)
    assert snapshot() == before


def test_the_media_files_stay_readable_by_the_target(club, old, new):
    item = media_for(old)
    name = item.file.name
    transfer.transfer_account(old, new)
    item.refresh_from_db()
    assert item.owner == new and item.file.name == name and item.file.storage.exists(name)


def test_the_avatar_is_copied_and_the_old_file_removed_after_the_commit(club, old, new, django_capture_on_commit_callbacks):
    avatar.set_avatar(old.profile, upload()["file"])
    old.profile.refresh_from_db()
    old_name = old.profile.avatar.name
    storage = old.profile.avatar.storage
    with django_capture_on_commit_callbacks(execute=True):
        report = transfer.transfer_account(old, new)
    assert report.avatar
    new.profile.refresh_from_db()
    old.profile.refresh_from_db()
    assert new.profile.avatar and new.profile.avatar.name != old_name and storage.exists(new.profile.avatar.name)
    assert not old.profile.avatar and not storage.exists(old_name)


def test_a_dry_run_leaves_the_avatar_alone(club, old, new, django_capture_on_commit_callbacks):
    avatar.set_avatar(old.profile, upload()["file"])
    old.profile.refresh_from_db()
    with django_capture_on_commit_callbacks(execute=True):
        transfer.transfer_account(old, new, dry_run=True)
    old.profile.refresh_from_db()
    assert old.profile.avatar and old.profile.avatar.storage.exists(old.profile.avatar.name)
    new.profile.refresh_from_db()
    assert not new.profile.avatar


# --- command -----------------------------------------------------------------------------------

def test_the_command_prints_the_report_and_dry_run_changes_nothing(club, old, new, capsys):
    fill(club, old)
    call_command("transfer_account", old.email, new.email, "--dry-run")
    assert "Dry run" in capsys.readouterr().out and TrainingSession.objects.filter(owner=old).exists()
    call_command("transfer_account", old.email.upper(), new.email)
    out = capsys.readouterr().out
    assert "training.TrainingSession.owner: 1" in out and TrainingSession.objects.filter(owner=new).exists()


def test_the_command_exits_with_1_on_a_refusal(club, old, new, capsys):
    make_session(new, arrows=1, volume=0)
    with pytest.raises(SystemExit) as exit:
        call_command("transfer_account", old.email, new.email)
    assert exit.value.code == 1 and "already has data" in capsys.readouterr().err


def test_the_command_takes_ids(club, old, new, capsys):
    call_command("transfer_account", str(old.pk), str(new.pk), "--id", "--dry-run")
    assert "Dry run" in capsys.readouterr().out
