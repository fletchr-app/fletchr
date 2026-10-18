import logging
from math import hypot, isfinite

from rest_framework import serializers

from equipment.models import Setup
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
        extra_kwargs = {"is_manual": {"read_only": True}}
        validators = []

    def validate(self, attrs):
        x, y = attrs.get("x"), attrs.get("y")
        if (x is None) != (y is None):
            raise serializers.ValidationError("Give both x and y, or neither")
        if x is not None and not (isfinite(x) and isfinite(y) and hypot(x, y) <= MAX_DISTANCE_FROM_CENTRE):
            raise serializers.ValidationError("Position is out of range")
        return attrs


class EndSerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)
    shots = ShotSerializer(many=True)

    class Meta:
        model = End
        fields = ["id", "index", "distance_m", "face", "arrows_per_end", "shots"]

    def validate_face(self, slug):
        if get_face(slug) is None:
            raise serializers.ValidationError("Unknown target face")
        return slug

    def validate(self, attrs):
        face = get_face(attrs["face"])
        shots = attrs["shots"]
        if len(shots) > attrs["arrows_per_end"]:
            raise serializers.ValidationError({"shots": "More shots than arrows per end"})
        ids = [s["id"] for s in shots]
        if len(set(ids)) != len(ids):
            raise serializers.ValidationError({"shots": "Duplicate shot id"})
        attrs["shots"] = [self.resolve_shot(face, i, s) for i, s in enumerate(shots)]
        return attrs

    @staticmethod
    def resolve_shot(face, index, shot):
        """Fill in the score: computed from the position, or checked against the face when typed in."""
        spot = shot.get("spot", 0)
        if spot >= len(face["spots"]):
            raise serializers.ValidationError({"shots": f"Shot {index + 1}: this face has no spot {spot}"})
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
            raise serializers.ValidationError({"shots": f"Shot {index + 1}: this face has no scores, place the arrow on it"})
        value, is_x, is_miss = shot.get("value"), shot.get("is_x", False), shot.get("is_miss", False)
        if is_miss:
            value, is_x = None, False
        elif value not in {r["value"] for r in face["rings"]}:
            raise serializers.ValidationError({"shots": f"Shot {index + 1}: {value} is not a score on this face"})
        elif is_x and not (value == 10 and face.get("x_diameter_cm")):
            raise serializers.ValidationError({"shots": f"Shot {index + 1}: this face has no X ring"})
        resolved.update(value=value, is_x=is_x, is_miss=is_miss, is_manual=True)
        return resolved


class VolumeEntrySerializer(serializers.ModelSerializer):
    id = serializers.UUIDField(read_only=True)

    class Meta:
        model = VolumeEntry
        fields = ["id", "distance_m", "arrow_count"]


class SessionWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrainingSession
        fields = [
            "started_at", "ended_at", "type", "environment", "location", "weather",
            "setup", "physical_rating", "mental_rating", "goals", "notes",
        ]

    def validate_setup(self, setup):
        if setup is not None and setup.owner_id != self.context["request"].user.id:
            raise serializers.ValidationError("Not your setup")
        return setup


def owner_name(session):
    return session.owner.profile.name or session.owner.email


class SessionSerializer(serializers.ModelSerializer):
    """Full session for the detail view."""

    owner_name = serializers.SerializerMethodField()
    ends = EndSerializer(many=True, read_only=True)
    volume_entries = VolumeEntrySerializer(many=True, read_only=True)

    class Meta:
        model = TrainingSession
        fields = [
            "id", "owner", "owner_name", "started_at", "ended_at", "type", "environment", "location", "weather",
            "setup", "physical_rating", "mental_rating", "goals", "notes", "created_at", "updated_at",
            "ends", "volume_entries",
        ]

    def get_owner_name(self, session) -> str:
        return owner_name(session)


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
    last_session = LastSessionSerializer(allow_null=True)
    arrows_7d = serializers.IntegerField(help_text="Arrows shot in sessions started in the last 7 days")

