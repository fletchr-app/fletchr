from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class TrainingSession(models.Model):
    """One day's shooting. The app creates the id, so it can build a session offline and upload it later."""

    class Type(models.TextChoices):
        SCORING = "scoring"
        VOLUME = "volume"
        TECHNIQUE = "technique"
        COMPETITION = "competition"

    class Environment(models.TextChoices):
        INDOOR = "indoor"
        OUTDOOR = "outdoor"

    id = models.UUIDField(primary_key=True, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="training_sessions")
    started_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)
    type = models.CharField(max_length=12, choices=Type.choices)
    environment = models.CharField(max_length=7, choices=Environment.choices, blank=True)
    location = models.CharField(max_length=150, blank=True)
    weather = models.CharField(max_length=150, blank=True)
    setup = models.ForeignKey("equipment.Setup", null=True, blank=True, on_delete=models.PROTECT, related_name="sessions")
    physical_rating = models.PositiveSmallIntegerField(null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)])
    mental_rating = models.PositiveSmallIntegerField(null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)])
    goals = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    # Bumped whenever an end or volume entry changes too, so a coach's live view can see activity.
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-started_at"]

    def __str__(self):
        return f"{self.owner} {self.started_at:%Y-%m-%d}"


class End(models.Model):
    """One pass: the arrows shot between two trips to the target."""

    id = models.UUIDField(primary_key=True, editable=False)
    session = models.ForeignKey(TrainingSession, on_delete=models.CASCADE, related_name="ends")
    index = models.PositiveSmallIntegerField()
    distance_m = models.DecimalField(max_digits=5, decimal_places=1, validators=[MinValueValidator(0)])
    face = models.CharField(max_length=50, help_text="Slug from shared/target-faces.json")
    arrows_per_end = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(12)])
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["index"]
        constraints = [models.UniqueConstraint(fields=["session", "index"], name="unique_end_index")]


class Shot(models.Model):
    id = models.UUIDField(primary_key=True, editable=False)
    end = models.ForeignKey(End, on_delete=models.CASCADE, related_name="shots")
    index = models.PositiveSmallIntegerField()
    spot = models.PositiveSmallIntegerField(default=0)
    # Position inside the spot: x right, y up, 1 = outer edge of the outermost scoring ring. Empty for typed scores.
    x = models.FloatField(null=True, blank=True)
    y = models.FloatField(null=True, blank=True)
    # Worked out by the server from the position, or taken as typed when there is no position (is_manual).
    value = models.PositiveSmallIntegerField(null=True, blank=True)
    is_x = models.BooleanField(default=False)
    is_miss = models.BooleanField(default=False)
    is_manual = models.BooleanField(default=False)
    arrow_number = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["index"]
        constraints = [models.UniqueConstraint(fields=["end", "index"], name="unique_shot_index")]


class VolumeEntry(models.Model):
    """Arrows shot without scoring (blank bale, technique work)."""

    id = models.UUIDField(primary_key=True, editable=False)
    session = models.ForeignKey(TrainingSession, on_delete=models.CASCADE, related_name="volume_entries")
    distance_m = models.DecimalField(max_digits=5, decimal_places=1, validators=[MinValueValidator(0)])
    arrow_count = models.PositiveSmallIntegerField(validators=[MinValueValidator(1)])
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]
