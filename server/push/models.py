from django.conf import settings
from django.db import models


class Device(models.Model):
    """A phone that gets notifications: its Firebase token. One person can have several, up to `MAX_DEVICES`.

    The token is an address, not a login: it only lets the server ask Firebase to show a notification on that phone.
    """

    MAX_DEVICES = 10

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="push_devices")
    token = models.CharField(max_length=512, unique=True)
    app_id = models.CharField(max_length=100, blank=True, help_text="de.fletchr.app, or de.fletchr.app.dev for the debug app")
    language = models.CharField(max_length=10, default="en", help_text="The language of the notifications on this phone")
    created_at = models.DateTimeField(auto_now_add=True)
    last_seen_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-last_seen_at"]

    def __str__(self):
        return f"{self.user} ({self.app_id})"
