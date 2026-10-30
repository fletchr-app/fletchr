from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone


def validate_time_zone(name):
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError, OSError):
        raise ValidationError("Unknown time zone: %(name)s", params={"name": name})


class TrainingSlot(models.Model):
    """A weekly training of a team. Its occurrences are computed (training/schedule.py), not stored."""

    id = models.UUIDField(primary_key=True, editable=False)
    team = models.ForeignKey("core.Team", on_delete=models.CASCADE, related_name="slots")
    weekday = models.PositiveSmallIntegerField(validators=[MaxValueValidator(6)], help_text="0 is Monday, 6 is Sunday")
    start_time = models.TimeField(help_text="Local time in `time_zone`")
    end_time = models.TimeField(help_text="Local time in `time_zone`, after the start (no training over midnight)")
    time_zone = models.CharField(max_length=64, validators=[validate_time_zone], help_text="IANA name, e.g. Europe/Berlin")
    location = models.CharField(max_length=150, blank=True)
    name = models.CharField(max_length=100, blank=True, help_text="For example Squad")
    valid_from = models.DateField(help_text="The first day this slot applies")
    valid_until = models.DateField(null=True, blank=True, help_text="The last day this slot applies; empty for no end")
    pause_from = models.DateField(null=True, blank=True, help_text="First day of a pause (holidays), with `pause_until`")
    pause_until = models.DateField(null=True, blank=True, help_text="Last day of a pause")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["weekday", "start_time"]
        constraints = [models.CheckConstraint(condition=models.Q(end_time__gt=models.F("start_time")), name="slot_end_after_start")]

    def __str__(self):
        return f"{self.team} {self.name or self.weekday} {self.start_time:%H:%M}"


class TrainingEvent(models.Model):
    """A training, competition or camp of a team: an occurrence of a slot that was made real (linked, cancelled or
    moved), or a one-off. Sessions, notes and media point at it as a label; there is no shared session."""

    class Kind(models.TextChoices):
        TRAINING = "training"
        COMPETITION = "competition"
        CAMP = "camp"

    id = models.UUIDField(primary_key=True, editable=False)
    team = models.ForeignKey("core.Team", on_delete=models.CASCADE, related_name="events")
    kind = models.CharField(max_length=11, choices=Kind.choices, default=Kind.TRAINING)
    name = models.CharField(max_length=150, blank=True)
    start = models.DateTimeField()
    end = models.DateTimeField(help_text="After the start; may be on another day")
    location = models.CharField(max_length=150, blank=True)
    time_zone = models.CharField(max_length=64, validators=[validate_time_zone], help_text="IANA name the times are shown in")
    slot = models.ForeignKey(TrainingSlot, null=True, blank=True, on_delete=models.SET_NULL, related_name="events")
    date = models.DateField(null=True, blank=True, help_text="The occurrence date in the time zone of the slot; empty for a one-off")
    cancelled = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["start"]
        constraints = [
            models.UniqueConstraint(fields=["slot", "date"], condition=models.Q(slot__isnull=False), name="one_event_per_occurrence"),
            models.CheckConstraint(
                condition=models.Q(slot__isnull=True, date__isnull=True) | models.Q(slot__isnull=False, date__isnull=False),
                name="event_slot_and_date_together",
            ),
            models.CheckConstraint(condition=models.Q(end__gt=models.F("start")), name="event_end_after_start"),
        ]

    def __str__(self):
        return f"{self.team} {self.name or self.kind} {self.start:%Y-%m-%d}"


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
    # Empty for a session a coach opened for the archer: the archer chooses when adding the first results.
    type = models.CharField(max_length=12, choices=Type.choices, blank=True)
    # Who created the session. Null for rows from before this field: treated as the owner.
    opened_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    environment = models.CharField(max_length=7, choices=Environment.choices, blank=True)
    location = models.CharField(max_length=150, blank=True)
    weather = models.CharField(max_length=150, blank=True)
    setup = models.ForeignKey("equipment.Setup", null=True, blank=True, on_delete=models.PROTECT, related_name="sessions")
    physical_rating = models.PositiveSmallIntegerField(null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)])
    mental_rating = models.PositiveSmallIntegerField(null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)])
    goals = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    # The team training this session was part of. Chosen by the archer; nothing links by time alone.
    event = models.ForeignKey(TrainingEvent, null=True, blank=True, on_delete=models.SET_NULL, related_name="sessions")
    created_at = models.DateTimeField(auto_now_add=True)
    # Bumped whenever an end or volume entry changes too, so a coach's live view can see activity.
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-started_at"]

    def __str__(self):
        return f"{self.owner} {self.started_at:%Y-%m-%d}"


class SessionTombstone(models.Model):
    """A session id that is gone: merged into another session (`merged_into`), or deleted (null).
    Phones read these to replace or drop their copy, and writes to a merged id go to the winner."""

    id = models.UUIDField(primary_key=True, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="+")
    merged_into = models.ForeignKey(TrainingSession, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    at = models.DateTimeField(default=timezone.now)


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
