from django.conf import settings
from django.db import models


class Note(models.Model):
    """A coach's note about an archer, optionally about one session or one end of it, one photo, or one frame of a clip.

    Written in a team. Private notes are for the author alone (not even team admins read them),
    coach-only ones for the coaches of that team, shared ones also for the archer. The note stays
    if the session or end it is about is deleted; deleting the photo or clip deletes its notes and drawings.
    """

    class Visibility(models.TextChoices):
        PRIVATE = "private"
        COACH_ONLY = "coach_only"
        SHARED = "shared"

    team = models.ForeignKey("core.Team", on_delete=models.CASCADE, related_name="notes")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="written_notes")
    archer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notes_about")
    session = models.ForeignKey("training.TrainingSession", null=True, blank=True, on_delete=models.SET_NULL, related_name="coach_notes")
    end = models.ForeignKey("training.End", null=True, blank=True, on_delete=models.SET_NULL, related_name="coach_notes")
    # A note on a photo (frame and time_ms empty) or on one frame of a clip: the frame (counted from 0) and the time in the clip.
    # The note goes with the photo or clip.
    media = models.ForeignKey("media.Media", null=True, blank=True, on_delete=models.CASCADE, related_name="coach_notes")
    frame = models.PositiveIntegerField(null=True, blank=True)
    time_ms = models.PositiveIntegerField(null=True, blank=True)
    # What the coach drew on that photo or frame: {"v": 1, "shapes": [{"t": "line" | "angle" | "circle", "p": [[x, y], ...], "c": "#rrggbb"}]},
    # the points as fractions (0 to 1) of the picture, so the drawing fits any screen. See notes/drawing.py.
    drawing = models.JSONField(null=True, blank=True)
    body = models.TextField()
    visibility = models.CharField(max_length=10, choices=Visibility.choices, default=Visibility.COACH_ONLY)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.author} on {self.archer}: {self.body[:30]}"
