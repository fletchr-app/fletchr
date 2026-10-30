from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models


def video_path(media, filename):
    return f"{media.owner_id}/{media.pk}.mp4"


def photo_path(media, filename):
    return f"{media.owner_id}/{media.pk}.jpg"


def file_path(media, filename):
    return video_path(media, filename) if media.kind == Media.Kind.VIDEO else photo_path(media, filename)


def thumbnail_path(media, filename):
    return f"{media.owner_id}/{media.pk}-thumb.jpg"


class Media(models.Model):
    """A photo or a video of an archer, optionally taken in one training session.

    The phone converts the file before the upload (specs/design/video-prototype.md), so the server stores it as it
    comes and checks the limits. Who may see it follows the sessions: the archer and the coaches of their
    teams. The app creates the id, so an upload that is repeated after a dropped connection does not make a second row.
    The clip stays if its session is deleted.
    """

    class Kind(models.TextChoices):
        PHOTO = "photo"
        VIDEO = "video"

    id = models.UUIDField(primary_key=True, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="media")
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="uploaded_media")
    session = models.ForeignKey("training.TrainingSession", null=True, blank=True, on_delete=models.SET_NULL, related_name="media")
    event = models.ForeignKey("training.TrainingEvent", null=True, blank=True, on_delete=models.SET_NULL, related_name="media")
    kind = models.CharField(max_length=5, choices=Kind.choices)
    file = models.FileField(upload_to=file_path, max_length=200)
    thumbnail = models.FileField(upload_to=thumbnail_path, max_length=200)
    size = models.PositiveIntegerField(help_text="Bytes of the file and the thumbnail together")
    taken_at = models.DateTimeField()
    width = models.PositiveSmallIntegerField(validators=[MinValueValidator(1)])
    height = models.PositiveSmallIntegerField(validators=[MinValueValidator(1)])
    # Videos only. The frame rate the phone recorded at (120 for slow motion) and the number of frames: the player
    # needs the real duration of a frame, which the timeline of a slow-motion file does not show.
    duration_ms = models.PositiveIntegerField(null=True, blank=True)
    capture_fps = models.FloatField(null=True, blank=True, validators=[MinValueValidator(1)])
    frame_count = models.PositiveIntegerField(null=True, blank=True)
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    # Changes of the note or the session (a move). Code that changes a clip with `update()` has to set it too: the phones pull by it.
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-taken_at", "-created_at"]
        verbose_name_plural = "media"

    def __str__(self):
        return f"{self.owner} {self.kind} {self.taken_at:%Y-%m-%d}"
