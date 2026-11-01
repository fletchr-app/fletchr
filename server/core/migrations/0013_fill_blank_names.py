from django.db import migrations


def fill(apps, schema_editor):
    """An account without a name gets the part of its email before the `@` (what a new Google account gets too), so that
    no screen has to fall back to the whole address. Profiles without an account always have a name."""
    Profile = apps.get_model("core", "Profile")
    for profile in Profile.objects.filter(name="", user__is_managed=False).select_related("user"):
        profile.name = profile.user.email.split("@")[0][:150]
        profile.save(update_fields=["name"])


class Migration(migrations.Migration):
    dependencies = [("core", "0012_profile_visibility")]

    operations = [migrations.RunPython(fill, migrations.RunPython.noop)]
