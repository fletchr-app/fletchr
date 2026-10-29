import uuid

from django.db import migrations, models


def fill_uids(apps, schema_editor):
    # A default of uuid4 would give every existing row the same value, so each row gets its own.
    note = apps.get_model("notes", "note")
    for pk in note.objects.filter(uid__isnull=True).values_list("pk", flat=True):
        note.objects.filter(pk=pk).update(uid=uuid.uuid4())


class Migration(migrations.Migration):
    dependencies = [
        ("notes", "0005_media_cascade"),
    ]

    operations = [
        # Three steps, as SQLite needs for a unique column on a table with rows: add it empty, fill it, make it unique.
        migrations.AddField(model_name="note", name="uid", field=models.UUIDField(null=True, editable=False)),
        migrations.RunPython(fill_uids, migrations.RunPython.noop),
        migrations.AlterField(model_name="note", name="uid", field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
    ]
