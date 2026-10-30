import django.db.models.deletion
import django.utils.timezone
from django.db import migrations, models
from django.db.models import F


def copy_created_at(apps, schema_editor):
    apps.get_model("notes", "Note").objects.update(at=F("created_at"))


class Migration(migrations.Migration):

    dependencies = [
        ("notes", "0007_note_team_optional"),
        ("training", "0003_schedule"),
    ]

    operations = [
        migrations.AddField(
            model_name="note",
            name="event",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="notes",
                to="training.trainingevent",
            ),
        ),
        migrations.AddField(
            model_name="note",
            name="at",
            field=models.DateTimeField(default=django.utils.timezone.now),
        ),
        migrations.RunPython(copy_created_at, migrations.RunPython.noop),
    ]
