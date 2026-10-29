import uuid

from django.db import migrations, models

MODELS = ["bow", "bowrevision", "arrowset", "arrowsetrevision"]


def fill_uids(apps, schema_editor):
    # A default of uuid4 would give every existing row the same value, so each row gets its own.
    for name in MODELS:
        model = apps.get_model("equipment", name)
        for pk in model.objects.filter(uid__isnull=True).values_list("pk", flat=True):
            model.objects.filter(pk=pk).update(uid=uuid.uuid4())


class Migration(migrations.Migration):
    dependencies = [
        ("equipment", "0001_initial"),
    ]

    operations = [
        # Three steps, as SQLite needs for a unique column on a table with rows: add it empty, fill it, make it unique.
        *[migrations.AddField(model_name=name, name="uid", field=models.UUIDField(null=True, editable=False)) for name in MODELS],
        migrations.RunPython(fill_uids, migrations.RunPython.noop),
        *[
            migrations.AlterField(model_name=name, name="uid", field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True))
            for name in MODELS
        ],
    ]
