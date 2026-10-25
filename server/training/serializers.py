from django.utils.translation import gettext
import logging
from math import hypot, isfinite

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from equipment.models import ArrowSetRevision, BowRevision, Setup
from targets.catalogue import get_face
from targets.scoring import score

from .models import End, Shot, TrainingSession, VolumeEntry

logger = logging.getLogger("training.scoring")

# Anything further out than this is a slip of the finger, not an arrow.
MAX_DISTANCE_FROM_CENTRE = 5.0


class ShotSerializer(serializers.ModelSerializer):
    """What the app sends for a shot. The score fields are advisory: the server works out its own."""

    id = serializers.UUIDField()

    class Meta:
        model = Shot
        fields = ["id", "spot", "x", "y", "value", "is_x", "is_miss", "is_manual", "arrow_number"]
        extra_kwargs = {"is_manual": {"read_only": True}, "arrow_number": {"min_value": 1, "max_value": 99}}
        validators = []

    def validate(self, attrs):
        x, y = attrs.get("x"), attrs.get("y")
        if (x is None) != (y is None):
            raise serializers.ValidationError(gettext("Give both x and y, or neither"))
        if x is not None and not (isfinite(x) and isfinite(y) and hypot(x, y) <= MAX_DISTANCE_FROM_CENTRE):
            raise serializers.ValidationError(gettext("Position is out of range"))
        return attrs


class EndSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    shots = ShotSerializer(many=True)

    class Meta:
        model = End
        fields = ["id", "index", "distance_m", "face", "arrows_per_end", "shots"]

    def validate_face(self, slug):
        if get_face(slug) is None:
            raise serializers.ValidationError(gettext("Unknown target face"))
        return slug

    def validate(self, attrs):
        face = get_face(attrs["face"])
        shots = attrs["shots"]
        if len(shots) > attrs["arrows_per_end"]:
            raise serializers.ValidationError({"shots": gettext("More shots than arrows per end")})
        ids = [s["id"] for s in shots]
        if len(set(ids)) != len(ids):
            raise serializers.ValidationError({"shots": gettext("Duplicate shot id")})
        attrs["shots"] = [self.resolve_shot(face, i, s) for i, s in enumerate(shots)]
        return attrs

    @staticmethod
    def resolve_shot(face, index, shot):
        """Fill in the score: computed from the position, or checked against the face when typed in."""
        spot = shot.get("spot", 0)
        if spot >= len(face["spots"]):
            raise serializers.ValidationError({"shots": gettext("Shot %(n)s: this face has no spot %(spot)s") % {"n": index + 1, "spot": spot}})
        resolved = {**shot, "index": index, "spot": spot, "arrow_number": shot.get("arrow_number")}
        x, y = shot.get("x"), shot.get("y")
        if x is not None:
            result = score(face, x, y)
            resolved.update(value=result.value, is_x=result.is_x, is_miss=result.is_miss, is_manual=False)
            claimed = (shot.get("value"), shot.get("is_x", False), shot.get("is_miss", False))
            if claimed[0] is not None or claimed[1] or claimed[2]:
                if claimed != (result.value, result.is_x, result.is_miss):
                    logger.warning(
                        "Client score differs from server score: face=%s pos=(%s, %s) client=%s server=%s",
                        face["slug"], x, y, claimed, (result.value, result.is_x, result.is_miss),
                    )
            return resolved
        # No position: a typed score.
        if not face["rings"]:
            raise serializers.ValidationError({"shots": gettext("Shot %(n)s: this face has no scores, place the arrow on it") % {"n": index + 1}})
        value, is_x, is_miss = shot.get("value"), shot.get("is_x", False), shot.get("is_miss", False)
        if is_miss:
            value, is_x = None, False
        elif value not in {r["value"] for r in face["rings"]}:
            raise serializers.ValidationError({"shots": gettext("Shot %(n)s: %(value)s is not a score on this face") % {"n": index + 1, "value": value}})
        elif is_x and not (value == 10 and face.get("x_diameter_cm")):
            raise serializers.ValidationError({"shots": gettext("Shot %(n)s: this face has no X ring") % {"n": index + 1}})
        resolved.update(value=value, is_x=is_x, is_miss=is_miss, is_manual=True)
        return resolved


class VolumeEntrySerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)

    class Meta:
        model = VolumeEntry
        fields = ["id", "distance_m", "arrow_count"]


class SessionWriteSerializer(serializers.ModelSerializer):
    """
    The equipment is chosen by revision: the app knows the revision ids from its stored copy of your
    equipment, and the server finds or creates the setup for that pair. Leave both out to keep the
    session's equipment as it is; send null to clear it.
    """

    bow_revision = serializers.PrimaryKeyRelatedField(queryset=BowRevision.objects.all(), required=False, allow_null=True)
    arrow_set_revision = serializers.PrimaryKeyRelatedField(queryset=ArrowSetRevision.objects.all(), required=False, allow_null=True)

    class Meta:
        model = TrainingSession
        fields = [
            "started_at", "ended_at", "type", "environment", "location", "weather",
            "bow_revision", "arrow_set_revision", "physical_rating", "mental_rating", "goals", "notes",
        ]

    def validate_bow_revision(self, revision):
        if revision is not None and revision.bow.owner_id != self.context["request"].user.id:
            raise serializers.ValidationError(gettext("Not your bow"))
        return revision

    def validate_arrow_set_revision(self, revision):
        if revision is not None and revision.arrow_set.owner_id != self.context["request"].user.id:
            raise serializers.ValidationError(gettext("Not your arrow set"))
        return revision

    def validate(self, attrs):
        if attrs.get("arrow_set_revision") is not None and attrs.get("bow_revision") is None:
            raise serializers.ValidationError({"arrow_set_revision": gettext("Arrows go with a bow: choose the bow too")})
        return attrs

    def _with_setup(self, validated_data):
        if "bow_revision" in validated_data or "arrow_set_revision" in validated_data:
            bow = validated_data.pop("bow_revision", None)
            arrows = validated_data.pop("arrow_set_revision", None)
            if bow is None:
                validated_data["setup"] = None
            else:
                owner = self.context["request"].user
                validated_data["setup"], _ = Setup.objects.get_or_create(owner=owner, bow_revision=bow, arrow_set_revision=arrows)
        return validated_data

    def create(self, validated_data):
        return super().create(self._with_setup(validated_data))

    def update(self, instance, validated_data):
        return super().update(instance, self._with_setup(validated_data))


class SetupInfoSerializer(serializers.Serializer):
    """The equipment of a session, as it was when the session used it."""

    bow_name = serializers.CharField()
    bow_type = serializers.CharField()
    bow_revision = serializers.IntegerField()
    bow_revision_number = serializers.IntegerField()
    arrow_set_name = serializers.CharField(allow_null=True)
    arrow_set_revision = serializers.IntegerField(allow_null=True)
    arrow_set_revision_number = serializers.IntegerField(allow_null=True)


def owner_name(session):
    return session.owner.profile.name or session.owner.email


class SessionSerializer(serializers.ModelSerializer):
    """Full session for the detail view."""

    owner_name = serializers.SerializerMethodField()
    setup_info = serializers.SerializerMethodField()
    ends = EndSerializer(many=True, read_only=True)
    volume_entries = VolumeEntrySerializer(many=True, read_only=True)

    class Meta:
        model = TrainingSession
        fields = [
            "id", "owner", "owner_name", "started_at", "ended_at", "type", "environment", "location", "weather",
            "setup", "setup_info", "physical_rating", "mental_rating", "goals", "notes", "created_at", "updated_at",
            "ends", "volume_entries",
        ]

    def get_owner_name(self, session) -> str:
        return owner_name(session)

    @extend_schema_field(SetupInfoSerializer(allow_null=True))
    def get_setup_info(self, session):
        setup = session.setup
        if setup is None:
            return None
        bow, arrows = setup.bow_revision, setup.arrow_set_revision
        return {
            "bow_name": bow.name, "bow_type": bow.type, "bow_revision": bow.pk, "bow_revision_number": bow.number,
            "arrow_set_name": arrows.name if arrows else None,
            "arrow_set_revision": arrows.pk if arrows else None,
            "arrow_set_revision_number": arrows.number if arrows else None,
        }


class SessionSummarySerializer(serializers.ModelSerializer):
    owner_name = serializers.SerializerMethodField()
    ends = serializers.IntegerField(source="end_count", read_only=True)
    scored_arrows = serializers.IntegerField(read_only=True)
    score_total = serializers.IntegerField(read_only=True)
    volume_arrows = serializers.IntegerField(read_only=True)

    class Meta:
        model = TrainingSession
        fields = [
            "id", "owner", "owner_name", "started_at", "ended_at", "type", "environment", "location", "setup",
            "updated_at", "ends", "scored_arrows", "score_total", "volume_arrows",
        ]

    def get_owner_name(self, session) -> str:
        return owner_name(session)


class LastSessionSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    started_at = serializers.DateTimeField()
    ended_at = serializers.DateTimeField(allow_null=True)
    updated_at = serializers.DateTimeField()
    type = serializers.CharField()
    live = serializers.BooleanField(help_text="Not finished and changed in the last few hours")


class ArcherOverviewSerializer(serializers.Serializer):
    user_id = serializers.IntegerField()
    role = serializers.CharField(help_text="archer, or coach/admin for a coach who shares their training")
    name = serializers.CharField()
    managed = serializers.BooleanField(help_text="A profile kept by a coach, without an account")
    last_session = LastSessionSerializer(allow_null=True)
    arrows_7d = serializers.IntegerField(help_text="Arrows shot in sessions started in the last 7 days")



class WeekVolumeSerializer(serializers.Serializer):
    week_start = serializers.DateField(help_text="The Monday of the week")
    arrows = serializers.IntegerField()


class VolumeStatsSerializer(serializers.Serializer):
    weeks = WeekVolumeSerializer(many=True, help_text="Oldest first, the current week last, zeros included")
    this_week = serializers.IntegerField()
    this_month = serializers.IntegerField()
    total = serializers.IntegerField()


class SessionPointSerializer(serializers.Serializer):
    session = serializers.UUIDField()
    date = serializers.DateField()
    competition = serializers.BooleanField()
    arrows = serializers.IntegerField()
    average = serializers.FloatField(help_text="Average points per arrow in this session")
    physical_rating = serializers.IntegerField(allow_null=True, help_text="How the archer rated their physical form in this session, 1 to 5")
    mental_rating = serializers.IntegerField(allow_null=True, help_text="How the archer rated their mental form in this session, 1 to 5")
    setup = serializers.IntegerField(allow_null=True, help_text="The equipment setup of the session (see /api/setups/); null if none was recorded")
    plotted = serializers.IntegerField(help_text="Arrows with a position (typed scores have none)")
    centre_x = serializers.FloatField(allow_null=True, help_text="Group centre, right is positive, 1 = the spot radius; null without positions")
    centre_y = serializers.FloatField(allow_null=True, help_text="Group centre, up is positive, 1 = the spot radius")
    spread = serializers.FloatField(allow_null=True, help_text="Mean distance of the arrows from the centre, 1 = the spot radius")
    plotted_average = serializers.FloatField(allow_null=True, help_text="Average points of the plotted arrows only; null below 6 plotted arrows")
    centred_average = serializers.FloatField(
        allow_null=True,
        help_text="Average of the plotted arrows with the group centre moved to the middle of the spot (a miss is 0); null below 6 plotted arrows. Not an official score",
    )


class ValueCountSerializer(serializers.Serializer):
    value = serializers.IntegerField(help_text="Points; 0 for misses")
    count = serializers.IntegerField()


class ScoreStatsSerializer(serializers.Serializer):
    face = serializers.CharField()
    face_name = serializers.CharField()
    distance_m = serializers.CharField()
    max_value = serializers.IntegerField(help_text="Points of the best ring of this face")
    arrows = serializers.IntegerField()
    average = serializers.FloatField(help_text="Average points per arrow; X counts as 10, a miss as 0")
    top_rate = serializers.FloatField(help_text="Share of arrows in the best ring (10s including Xs)")
    x_rate = serializers.FloatField(allow_null=True, help_text="Share of Xs; null for faces without an X ring")
    miss_rate = serializers.FloatField()
    radius_cm = serializers.FloatField(help_text="The spot radius: positions of 1 are this far from the middle")
    distribution = ValueCountSerializer(many=True, help_text="Arrows per value, best ring first, misses (0) last")
    sessions = SessionPointSerializer(many=True, help_text="Oldest first")


class StatsSerializer(serializers.Serializer):
    owner = serializers.IntegerField()
    tz = serializers.CharField()
    volume = VolumeStatsSerializer()
    scores = ScoreStatsSerializer(many=True)


class PositionsSerializer(serializers.Serializer):
    owner = serializers.IntegerField()
    face = serializers.CharField()
    distance_m = serializers.CharField()
    radius_cm = serializers.FloatField(help_text="The spot radius: positions of 1 are this far from the middle")
    arrows = serializers.IntegerField(help_text="How many plotted arrows match the filter")
    limited = serializers.BooleanField(help_text="True when there are more arrows than points returned (the newest are kept)")
    points = serializers.ListField(
        child=serializers.ListField(child=serializers.FloatField(), min_length=2, max_length=2),
        help_text="[x, y] per arrow, newest first; x right, y up, 1 = the spot radius",
    )


class RankingChoiceSerializer(serializers.Serializer):
    face = serializers.CharField()
    face_name = serializers.CharField()
    distance_m = serializers.CharField()
    arrows = serializers.IntegerField(help_text="Scored arrows of the team on this face and distance in the period")


class RankingRowSerializer(serializers.Serializer):
    user_id = serializers.IntegerField()
    name = serializers.CharField()
    managed = serializers.BooleanField()
    arrows = serializers.IntegerField(help_text="All arrows in the period, scored or not")
    scored_arrows = serializers.IntegerField(help_text="Scored arrows on the chosen face and distance")
    average = serializers.FloatField(allow_null=True, help_text="Average points per arrow on the chosen face and distance; null without scored arrows")


class RankingSerializer(serializers.Serializer):
    days = serializers.IntegerField()
    face = serializers.CharField(allow_null=True)
    distance_m = serializers.CharField(allow_null=True)
    max_value = serializers.IntegerField(allow_null=True, help_text="Points of the best ring of the chosen face")
    choices = RankingChoiceSerializer(many=True, help_text="Faces and distances to pick from, most arrows first")
    rows = RankingRowSerializer(many=True, help_text="Most arrows first")


class ArrowOffsetSerializer(serializers.Serializer):
    number = serializers.IntegerField(help_text="The number on the arrow")
    shots = serializers.IntegerField(help_text="Numbered shots of this arrow that count (in sessions with at least 6 plotted arrows)")
    sessions = serializers.IntegerField()
    offset_x = serializers.FloatField(help_text="Mean position relative to the centre of the group of its session, right is positive, 1 = the spot radius")
    offset_y = serializers.FloatField(help_text="The same upwards")
    offset = serializers.FloatField(help_text="Distance of the mean position from the centre of the group, 1 = the spot radius")
    spread = serializers.FloatField(help_text="Mean distance of its shots from its own mean position, 1 = the spot radius")


class ArrowSetStatsSerializer(serializers.Serializer):
    arrow_set = serializers.IntegerField(allow_null=True, help_text="Null for sessions without an arrow set")
    arrow_set_name = serializers.CharField(allow_null=True)
    arrows = ArrowOffsetSerializer(many=True, help_text="The arrow farthest from the group first")


class ArrowStatsGroupSerializer(serializers.Serializer):
    face = serializers.CharField()
    face_name = serializers.CharField()
    distance_m = serializers.CharField()
    radius_cm = serializers.FloatField(help_text="The spot radius: positions of 1 are this far from the middle")
    sets = ArrowSetStatsSerializer(many=True)
