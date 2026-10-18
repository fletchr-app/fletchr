from django.conf import settings
from django.db import models


class Note(models.Model):
    """A coach's note about an archer, optionally about one session or one end of it.

    Written in a team: coach-only notes are for the coaches of that team, shared ones are also
    for the archer. The note stays if the session or end it is about is deleted.
    """

    class Visibility(models.TextChoices):
        COACH_ONLY = "coach_only"
        SHARED = "shared"

    team = models.ForeignKey("core.Team", on_delete=models.CASCADE, related_name="notes")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="written_notes")
    archer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notes_about")
    session = models.ForeignKey("training.TrainingSession", null=True, blank=True, on_delete=models.SET_NULL, related_name="coach_notes")
    end = models.ForeignKey("training.End", null=True, blank=True, on_delete=models.SET_NULL, related_name="coach_notes")
    body = models.TextField()
    visibility = models.CharField(max_length=10, choices=Visibility.choices, default=Visibility.COACH_ONLY)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.author} on {self.archer}: {self.body[:30]}"
