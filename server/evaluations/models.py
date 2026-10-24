from django.conf import settings
from django.db import models


class Template(models.Model):
    """A form a team's coaches fill in for an archer (plan, section 4a). The criteria are in its versions: changing them
    adds a version, so an evaluation always shows the form it was filled in with and old ones stay comparable."""

    team = models.ForeignKey("core.Team", on_delete=models.CASCADE, related_name="evaluation_templates")
    name = models.CharField(max_length=150)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]

    def __str__(self):
        return f"{self.team}: {self.name}"

    @property
    def latest(self):
        return self.versions.order_by("-number").first()


class TemplateVersion(models.Model):
    template = models.ForeignKey(Template, on_delete=models.CASCADE, related_name="versions")
    number = models.PositiveSmallIntegerField()
    name = models.CharField(max_length=150, help_text="The name the form had in this version")
    scale = models.PositiveSmallIntegerField(default=5, help_text="Ratings go from 1 to this")
    # [{"key": "pre_back", "label": "...", "group": "...", "description": "", "low": "", "high": ""}]. A key stays the same
    # through the versions, so one criterion can be followed over time.
    criteria = models.JSONField()
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["template", "number"]
        constraints = [models.UniqueConstraint(fields=["template", "number"], name="one_number_per_template")]

    def __str__(self):
        return f"{self.template} v{self.number}"


class Evaluation(models.Model):
    """A structured check-up of an archer: a coach's rating, or the archer's own (kind "self").

    Coach-only ones (the default, so nothing reaches the archer by accident) are for the coaches of the team; the author can share one
    with the archer when they choose. A self-assessment is
    the archer's and their coaches'. Deleted with the archer; stays, as by a former coach, without its author.
    """

    class Kind(models.TextChoices):
        COACH = "coach"
        SELF = "self"

    class Visibility(models.TextChoices):
        SHARED = "shared"
        COACH_ONLY = "coach_only"

    team = models.ForeignKey("core.Team", on_delete=models.CASCADE, related_name="evaluations")
    archer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="evaluations")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="written_evaluations")
    template_version = models.ForeignKey(TemplateVersion, on_delete=models.RESTRICT, related_name="evaluations")
    kind = models.CharField(max_length=5, choices=Kind.choices)
    date = models.DateField()
    comment = models.TextField(blank=True)
    goals = models.TextField(blank=True, help_text="What to work on until the next evaluation")
    visibility = models.CharField(max_length=10, choices=Visibility.choices, default=Visibility.COACH_ONLY)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-date", "-id"]

    def __str__(self):
        return f"{self.kind} evaluation of {self.archer} on {self.date}"


class Score(models.Model):
    evaluation = models.ForeignKey(Evaluation, on_delete=models.CASCADE, related_name="scores")
    criterion = models.CharField(max_length=40)
    rating = models.PositiveSmallIntegerField()
    comment = models.TextField(blank=True)
    # The evidence: a frame of a clip of the archer. The score stays if the clip is deleted.
    media = models.ForeignKey("media.Media", null=True, blank=True, on_delete=models.SET_NULL, related_name="scores")
    frame = models.PositiveIntegerField(null=True, blank=True)
    time_ms = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["id"]
        constraints = [models.UniqueConstraint(fields=["evaluation", "criterion"], name="one_score_per_criterion")]
