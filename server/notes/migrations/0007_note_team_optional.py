import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0001_initial"),
        ("notes", "0006_uid"),
    ]

    operations = [
        migrations.AlterField(
            model_name="note",
            name="team",
            field=models.ForeignKey(
                blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="notes", to="core.team"
            ),
        ),
    ]
