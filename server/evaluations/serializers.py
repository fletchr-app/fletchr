import re
from datetime import date

from django.db import transaction
from django.utils.text import slugify
from django.utils.translation import gettext
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from core.access import note_teams, teams_of
from core.models import COACH_ROLES, Team, TeamMember, User
from media.access import visible_media
from media.models import Media

from .defaults import localize, localize_name
from .models import Evaluation, Score, Template, TemplateVersion

KEY = re.compile(r"[a-z0-9_]{1,40}")
MAX_CRITERIA = 60


class CriterionSerializer(serializers.Serializer):
    key = serializers.CharField(max_length=40, required=False, help_text="Stays the same through the versions; made from the label for a new criterion")
    label = serializers.CharField(max_length=100)
    group = serializers.CharField(max_length=60, required=False, allow_blank=True, default="")
    description = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")
    low = serializers.CharField(max_length=150, required=False, allow_blank=True, default="", help_text="What the lowest rating looks like")
    high = serializers.CharField(max_length=150, required=False, allow_blank=True, default="", help_text="What the highest rating looks like")

    def validate_label(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError(gettext("A criterion needs a name"))
        return value

    def validate_key(self, value):
        if not KEY.fullmatch(value):
            raise serializers.ValidationError(gettext("A key has lower-case letters, digits and underscores"))
        return value


def _new_key(label, taken):
    base = (slugify(label).replace("-", "_") or "criterion")[:30]
    key, n = base, 2
    while key in taken:
        key, n = f"{base}_{n}", n + 1
    return key


def clean_criteria(criteria, template=None):
    """The list as it is stored: every criterion has a key, no key twice, and a key that an earlier version had is not used for something else."""
    if not criteria:
        raise serializers.ValidationError({"criteria": gettext("A form needs at least one criterion")})
    if len(criteria) > MAX_CRITERIA:
        raise serializers.ValidationError({"criteria": gettext("A form can have %(n)s criteria at most") % {"n": MAX_CRITERIA}})
    ever = {c["key"] for v in template.versions.all() for c in v.criteria} if template else set()
    given = [c["key"] for c in criteria if c.get("key")]
    if len(given) != len(set(given)):
        raise serializers.ValidationError({"criteria": gettext("Two criteria have the same key")})
    taken, clean = set(given), []
    for c in criteria:
        key = c.get("key") or _new_key(c["label"], taken | ever)
        taken.add(key)
        clean.append({"key": key, "label": c["label"], "group": c["group"].strip(), "description": c["description"].strip(), "low": c["low"].strip(), "high": c["high"].strip()})
    return clean


class TemplateSerializer(serializers.ModelSerializer):
    """The form with its newest version."""

    name = serializers.SerializerMethodField()
    version = serializers.SerializerMethodField()
    version_id = serializers.SerializerMethodField()
    scale = serializers.SerializerMethodField()
    criteria = serializers.SerializerMethodField()
    updated_at = serializers.SerializerMethodField()

    class Meta:
        model = Template
        fields = ["id", "team", "name", "version", "version_id", "scale", "criteria", "created_at", "updated_at"]

    def _latest(self, template) -> TemplateVersion:
        return template.latest

    def get_version(self, template) -> int:
        return self._latest(template).number

    def get_version_id(self, template) -> int:
        return self._latest(template).pk

    def get_scale(self, template) -> int:
        return self._latest(template).scale

    def get_criteria(self, template) -> list[dict]:
        return localize(self._latest(template).criteria)

    def get_name(self, template) -> str:
        return localize_name(template.name)

    def get_updated_at(self, template):
        return self._latest(template).created_at


class TemplateWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150, required=False)
    scale = serializers.IntegerField(min_value=2, max_value=10, required=False, help_text="Ratings go from 1 to this; set when the form is made and not changed later, so ratings stay comparable")
    criteria = CriterionSerializer(many=True, required=False)

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError(gettext("A form needs a name"))
        return value


class VisibleMediaField(serializers.PrimaryKeyRelatedField):
    """A clip the user may see. On the way out, the link is left out when they may not (a clip in a session that is private to them)."""

    def get_queryset(self):
        return visible_media(self.context["request"].user)

    def to_representation(self, value):
        request = self.context.get("request")
        if request is not None and not visible_media(request.user).filter(pk=value.pk).exists():
            return None
        return super().to_representation(value)


class ScoreSerializer(serializers.ModelSerializer):
    media = VisibleMediaField(queryset=Media.objects.none(), required=False, allow_null=True)

    class Meta:
        model = Score
        fields = ["criterion", "rating", "comment", "media", "frame", "time_ms"]
        extra_kwargs = {"comment": {"required": False}, "frame": {"required": False}, "time_ms": {"required": False}}


class EvaluationSerializer(serializers.ModelSerializer):
    team = serializers.PrimaryKeyRelatedField(queryset=Team.objects.all(), required=False, help_text="Only needed in several teams")
    archer = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())
    template = serializers.PrimaryKeyRelatedField(queryset=Template.objects.all(), write_only=True, required=False, help_text="The form to use, in its newest version; needed for a new evaluation")
    kind = serializers.ChoiceField(choices=Evaluation.Kind.choices, required=False, help_text="coach (the default) or self")
    date = serializers.DateField(required=False)
    scores = ScoreSerializer(many=True)
    template_id = serializers.SerializerMethodField()
    template_name = serializers.SerializerMethodField()
    version = serializers.SerializerMethodField()
    scale = serializers.SerializerMethodField()
    criteria = serializers.SerializerMethodField(help_text="The form as it was when this was filled in")
    author_name = serializers.SerializerMethodField()
    archer_name = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField()

    class Meta:
        model = Evaluation
        fields = [
            "id", "team", "archer", "archer_name", "author", "author_name", "kind", "date", "comment", "goals", "visibility", "scores",
            "template", "template_id", "template_name", "version", "scale", "criteria", "can_edit", "can_delete", "created_at", "updated_at",
        ]
        read_only_fields = ["author", "created_at", "updated_at"]

    def get_template_id(self, ev) -> int:
        return ev.template_version.template_id

    def get_template_name(self, ev) -> str:
        return localize_name(ev.template_version.name)

    def get_version(self, ev) -> int:
        return ev.template_version.number

    def get_scale(self, ev) -> int:
        return ev.template_version.scale

    def get_criteria(self, ev) -> list[dict]:
        return localize(ev.template_version.criteria)

    def get_author_name(self, ev) -> str:
        return (ev.author.profile.name or ev.author.email) if ev.author else "Former coach"

    def get_archer_name(self, ev) -> str:
        return ev.archer.profile.name or ev.archer.email

    def get_can_edit(self, ev) -> bool:
        return ev.author_id == self.context["request"].user.id

    def get_can_delete(self, ev) -> bool:
        return self.get_can_edit(ev) or ev.team_id in self.context["admin_team_ids"]

    def validate_comment(self, value):
        return value.strip()

    def validate_goals(self, value):
        return value.strip()

    # --- who may write what -------------------------------------------------------------------------------------

    def _team_for(self, user, archer, kind, team):
        if kind == Evaluation.Kind.SELF:
            if archer.pk != user.pk:
                raise serializers.ValidationError({"archer": gettext("A self-assessment is about yourself")})
            allowed = list(teams_of(user).order_by("name"))
        else:
            if not TeamMember.objects.filter(user=user, role__in=COACH_ROLES).exists():
                raise PermissionDenied(gettext("Only coaches can rate an archer"))
            allowed = list(note_teams(user, archer))
        if team is not None:
            if team not in allowed:
                raise serializers.ValidationError({"team": gettext("You cannot do an evaluation of this archer in that team")})
            return team
        if len(allowed) == 1:
            return allowed[0]
        if not allowed:
            raise serializers.ValidationError({"archer": gettext("You cannot do an evaluation of this person")})
        raise serializers.ValidationError({"team": gettext("This is in several teams: say which one")})

    def _check_scores(self, scores, version, archer):
        keys = {c["key"] for c in version.criteria}
        seen = set()
        for s in scores:
            if s["criterion"] not in keys:
                raise serializers.ValidationError({"scores": gettext("This form has no criterion %(key)s") % {"key": s["criterion"]}})
            if s["criterion"] in seen:
                raise serializers.ValidationError({"scores": gettext("A criterion is rated twice")})
            seen.add(s["criterion"])
            if not 1 <= s["rating"] <= version.scale:
                raise serializers.ValidationError({"scores": gettext("A rating goes from 1 to %(n)s") % {"n": version.scale}})
            media, frame = s.get("media"), s.get("frame")
            if media is None:
                if frame is not None or s.get("time_ms") is not None:
                    raise serializers.ValidationError({"scores": gettext("Give the clip the frame is in")})
                continue
            if media.owner_id != archer.id:
                raise serializers.ValidationError({"scores": gettext("This is not a photo or video of that archer")})
            if frame is None:
                raise serializers.ValidationError({"scores": gettext("Say which frame the rating is about")})
            if media.frame_count and frame >= media.frame_count:
                raise serializers.ValidationError({"scores": gettext("The clip has no such frame")})

    def validate(self, attrs):
        if self.instance is not None:
            for field in ("archer", "team", "kind"):
                if field in attrs and attrs[field] != getattr(self.instance, field):
                    raise serializers.ValidationError({field: gettext("This cannot be changed after the evaluation is written")})
            if "template" in attrs and attrs["template"].pk != self.instance.template_version.template_id:
                raise serializers.ValidationError({"template": gettext("This cannot be changed after the evaluation is written")})
            if "scores" in attrs:
                self._check_scores(attrs["scores"], self.instance.template_version, self.instance.archer)
            return attrs

        user = self.context["request"].user
        archer, kind = attrs["archer"], attrs.setdefault("kind", Evaluation.Kind.COACH)
        team = self._team_for(user, archer, kind, attrs.get("team"))
        template = attrs.get("template")
        if template is None:
            raise serializers.ValidationError({"template": gettext("Say which form to use")})
        if template.team_id != team.pk:
            raise serializers.ValidationError({"template": gettext("This form belongs to another team")})
        self._check_scores(attrs["scores"], template.latest, archer)
        attrs["team"], attrs["template_version"] = team, template.latest
        attrs.pop("template")
        attrs.setdefault("date", date.today())
        if kind == Evaluation.Kind.SELF:
            attrs["visibility"] = Evaluation.Visibility.SHARED  # the archer's coaches read it, and nobody else
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        scores = validated_data.pop("scores")
        evaluation = Evaluation.objects.create(**validated_data)
        Score.objects.bulk_create(Score(evaluation=evaluation, **s) for s in scores)
        return evaluation

    @transaction.atomic
    def update(self, instance, validated_data):
        scores = validated_data.pop("scores", None)
        for field in ("archer", "team", "kind", "template"):
            validated_data.pop(field, None)
        if instance.kind == Evaluation.Kind.SELF:
            validated_data.pop("visibility", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if scores is not None:
            instance.scores.all().delete()
            Score.objects.bulk_create(Score(evaluation=instance, **s) for s in scores)
        return instance
