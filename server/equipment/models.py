import uuid

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q


def measure(max_digits, decimal_places, help_text):
    return models.DecimalField(
        max_digits=max_digits,
        decimal_places=decimal_places,
        null=True,
        blank=True,
        validators=[MinValueValidator(0)],
        help_text=help_text,
    )


def text(max_length=150):
    return models.CharField(max_length=max_length, blank=True)


class BowFields(models.Model):
    """The versioned settings of a bow. Stored on the bow (current values) and copied into each revision."""

    class Type(models.TextChoices):
        RECURVE = "recurve"
        COMPOUND = "compound"
        BAREBOW = "barebow"
        LONGBOW = "longbow"
        TRADITIONAL = "traditional"

    name = models.CharField(max_length=150)
    type = models.CharField(max_length=12, choices=Type.choices)
    riser = text()
    limbs = text()
    draw_weight = measure(5, 1, "Draw weight in lb")
    draw_length = measure(4, 1, "Draw length in inches")
    brace_height = measure(5, 1, "Brace height in mm")
    tiller = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True, help_text="Tiller in mm (top minus bottom)")
    plunger = text()
    sight = text()
    stabilisers = text()
    release_tab = text()
    notes = models.TextField(blank=True)

    class Meta:
        abstract = True


class ArrowSetFields(models.Model):
    name = models.CharField(max_length=150)
    shaft_model = text()
    spine = models.CharField(max_length=50, blank=True)
    length = measure(4, 2, "Arrow length in inches")
    point_weight = models.PositiveSmallIntegerField(null=True, blank=True, help_text="Point weight in grain")
    nock = text()
    fletching = text()
    count = models.PositiveSmallIntegerField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        abstract = True


def tracked_fields(fields_model):
    return [f.name for f in fields_model._meta.local_fields]


BOW_FIELDS = tracked_fields(BowFields)
ARROW_SET_FIELDS = tracked_fields(ArrowSetFields)


class Bow(BowFields):
    # Made by the server or by the app; an id that exists before the server has seen the item (offline sync, #84).
    uid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bows")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    current_revision = models.ForeignKey("BowRevision", null=True, on_delete=models.SET_NULL, related_name="+")

    def __str__(self):
        return self.name


class BowRevision(BowFields):
    """A past or current state of a bow. A new one is written whenever a tracked field really changes."""

    # Made by the server or by the app; an id that exists before the server has seen the item (offline sync, #84).
    uid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)

    bow = models.ForeignKey(Bow, on_delete=models.CASCADE, related_name="revisions")
    number = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["bow", "number"], name="unique_bow_revision_number")]
        ordering = ["-number"]

    def __str__(self):
        return f"{self.name} r{self.number}"


class ArrowSet(ArrowSetFields):
    # Made by the server or by the app; an id that exists before the server has seen the item (offline sync, #84).
    uid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="arrow_sets")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    current_revision = models.ForeignKey("ArrowSetRevision", null=True, on_delete=models.SET_NULL, related_name="+")

    def __str__(self):
        return self.name


class ArrowSetRevision(ArrowSetFields):
    # Made by the server or by the app; an id that exists before the server has seen the item (offline sync, #84).
    uid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    arrow_set = models.ForeignKey(ArrowSet, on_delete=models.CASCADE, related_name="revisions")
    number = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["arrow_set", "number"], name="unique_arrow_set_revision_number")]
        ordering = ["-number"]

    def __str__(self):
        return f"{self.name} r{self.number}"


class Setup(models.Model):
    """A bow revision with an arrow set revision, exactly as they were when used. Sessions point at this."""

    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="setups")
    bow_revision = models.ForeignKey(BowRevision, on_delete=models.PROTECT, related_name="setups")
    arrow_set_revision = models.ForeignKey(ArrowSetRevision, null=True, blank=True, on_delete=models.PROTECT, related_name="setups")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["bow_revision", "arrow_set_revision"], name="unique_setup"),
            # NULLs never collide in a plain unique constraint, so setups without arrows need their own.
            models.UniqueConstraint(
                fields=["bow_revision"], condition=Q(arrow_set_revision__isnull=True), name="unique_setup_without_arrows"
            ),
        ]

    def __str__(self):
        return f"{self.bow_revision} + {self.arrow_set_revision or 'no arrows'}"
