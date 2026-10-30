from django.db import migrations, models
from django.db.models import F
from django.utils import timezone


def from_created(apps, schema_editor):
    apps.get_model("media", "Media").objects.update(updated_at=F("created_at"))


class Migration(migrations.Migration):
    dependencies = [("media", "0002_media_event")]

    operations = [
        migrations.AddField(
            model_name="media",
            name="updated_at",
            field=models.DateTimeField(auto_now=True, default=timezone.now),
            preserve_default=False,
        ),
        migrations.RunPython(from_created, migrations.RunPython.noop),
    ]
