import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor

from core.models import Team, User

from .test_notes import api, write  # noqa: F401  (the `api` fixture)


def test_a_note_has_a_uid_that_the_client_cannot_choose_and_an_edit_keeps(api, club):  # noqa: F811
    chosen = "11111111-1111-4111-8111-111111111111"
    first = write(api, club, uid=chosen).data
    second = write(api, club).data
    assert first["uid"] != chosen and first["uid"] != second["uid"]
    res = api("coach").patch(f"/api/notes/{first['id']}/", {"body": "Changed"}, format="json")
    assert res.status_code == 200 and res.data["uid"] == first["uid"]


@pytest.mark.django_db(transaction=True)
def test_existing_notes_get_their_own_uid():
    """The migration adds the column empty, fills each row with its own uuid, then makes it unique."""
    executor = MigrationExecutor(connection)
    executor.migrate([("notes", "0005_media_cascade")])
    old = executor.loader.project_state([("notes", "0005_media_cascade")]).apps
    coach = User.objects.create_user("coach@example.org", "correct-horse-battery")
    archer = User.objects.create_user("archer@example.org", "correct-horse-battery")
    team = Team.objects.create(name="Club")  # the real model: only the notes table is moved back, core stays as it is
    for n in range(3):
        old.get_model("notes", "Note").objects.create(team_id=team.pk, author_id=coach.pk, archer_id=archer.pk, body=f"Note {n}")

    executor = MigrationExecutor(connection)
    executor.migrate([("notes", "0006_uid")])
    new = executor.loader.project_state([("notes", "0006_uid")]).apps
    uids = list(new.get_model("notes", "Note").objects.values_list("uid", flat=True))
    assert len(uids) == 3 and len(set(uids)) == 3 and None not in uids
