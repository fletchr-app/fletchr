from django.utils.translation import gettext
from rest_framework import serializers

from .models import ARROW_SET_FIELDS, BOW_FIELDS, ArrowSet, ArrowSetRevision, Bow, BowRevision, Setup


class RevisionFieldsMixin(serializers.Serializer):
    revision = serializers.IntegerField(source="current_revision_id", read_only=True)
    revision_number = serializers.IntegerField(source="current_revision.number", read_only=True)
    revision_uid = serializers.UUIDField(source="current_revision.uid", read_only=True)


class BowSerializer(RevisionFieldsMixin, serializers.ModelSerializer):
    class Meta:
        model = Bow
        fields = ["id", "uid", "owner", "is_active", "created_at", "revision", "revision_number", "revision_uid", *BOW_FIELDS]
        read_only_fields = ["owner", "created_at"]


class ArrowSetSerializer(RevisionFieldsMixin, serializers.ModelSerializer):
    class Meta:
        model = ArrowSet
        fields = ["id", "uid", "owner", "is_active", "created_at", "revision", "revision_number", "revision_uid", *ARROW_SET_FIELDS]
        read_only_fields = ["owner", "created_at"]


class BowPutSerializer(BowSerializer):
    """The body of `PUT /api/bows/<uid>/`: the bow as the app has it, and the uid the app gave to the revision this makes."""

    revision_uid = serializers.UUIDField(required=False)


class ArrowSetPutSerializer(ArrowSetSerializer):
    revision_uid = serializers.UUIDField(required=False)


class BowRevisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = BowRevision
        fields = ["id", "uid", "bow", "number", "created_at", *BOW_FIELDS]


class ArrowSetRevisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ArrowSetRevision
        fields = ["id", "uid", "arrow_set", "number", "created_at", *ARROW_SET_FIELDS]


class SetupSerializer(serializers.ModelSerializer):
    bow = BowRevisionSerializer(source="bow_revision", read_only=True)
    arrow_set = ArrowSetRevisionSerializer(source="arrow_set_revision", read_only=True)

    class Meta:
        model = Setup
        fields = ["id", "owner", "created_at", "bow_revision", "arrow_set_revision", "bow", "arrow_set"]
        read_only_fields = ["owner", "created_at"]
        # The view returns the existing setup for a repeated pair, so the unique constraint is not an input error.
        validators = []

    def validate_bow_revision(self, revision):
        if revision.bow.owner_id != self.context["request"].user.id:
            raise serializers.ValidationError(gettext("Not your bow"))
        return revision

    def validate_arrow_set_revision(self, revision):
        if revision is not None and revision.arrow_set.owner_id != self.context["request"].user.id:
            raise serializers.ValidationError(gettext("Not your arrow set"))
        return revision
