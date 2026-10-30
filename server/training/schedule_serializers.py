from django.utils.translation import gettext
from rest_framework import serializers

from core.models import Team

from .models import TrainingEvent, TrainingSlot


class SlotSerializer(serializers.ModelSerializer):
    team = serializers.PrimaryKeyRelatedField(queryset=Team.objects.all(), help_text="Needed to create the slot; it cannot change afterwards")

    class Meta:
        model = TrainingSlot
        fields = [
            "id", "team", "weekday", "start_time", "end_time", "time_zone", "location", "name",
            "valid_from", "valid_until", "pause_from", "pause_until", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate(self, attrs):
        def value(name):
            return attrs[name] if name in attrs else getattr(self.instance, name, None)

        if self.instance is not None and "team" in attrs and attrs["team"] != self.instance.team:
            raise serializers.ValidationError({"team": gettext("The team of a slot cannot change")})
        if value("start_time") is not None and value("end_time") is not None and value("end_time") <= value("start_time"):
            raise serializers.ValidationError({"end_time": gettext("The end must be after the start")})
        if value("valid_until") and value("valid_until") < value("valid_from"):
            raise serializers.ValidationError({"valid_until": gettext("The last day can't be before the first day")})
        pause = (value("pause_from"), value("pause_until"))
        if (pause[0] is None) != (pause[1] is None):
            raise serializers.ValidationError({"pause_until": gettext("Give both days of the pause, or neither")})
        if pause[0] and pause[1] < pause[0]:
            raise serializers.ValidationError({"pause_until": gettext("The pause can't end before it starts")})
        return attrs


class AgendaItemSerializer(serializers.Serializer):
    """One training of a team. `virtual` ones come from a slot and have no row yet: to link something to it, send its
    `id` with `slot` and `date` (see `event_slot`, `event_date`)."""

    id = serializers.UUIDField()
    virtual = serializers.BooleanField()
    slot = serializers.UUIDField(allow_null=True)
    date = serializers.DateField(allow_null=True)
    team = serializers.IntegerField()
    team_name = serializers.CharField()
    kind = serializers.ChoiceField(choices=TrainingEvent.Kind.choices)
    name = serializers.CharField(allow_blank=True)
    start = serializers.DateTimeField()
    end = serializers.DateTimeField()
    location = serializers.CharField(allow_blank=True)
    time_zone = serializers.CharField()
    cancelled = serializers.BooleanField()


class EventSerializer(serializers.ModelSerializer):
    team_name = serializers.CharField(source="team.name", read_only=True)

    class Meta:
        model = TrainingEvent
        fields = ["id", "team", "team_name", "kind", "name", "start", "end", "location", "time_zone", "slot", "date", "cancelled"]
        read_only_fields = fields


class EventWriteSerializer(serializers.ModelSerializer):
    """Everything is optional here; the view says what a new one needs. `slot` and `date` name the occurrence
    of a slot (the id must be the one in the agenda), `team` a one-off's team."""

    team = serializers.PrimaryKeyRelatedField(queryset=Team.objects.all(), required=False)

    class Meta:
        model = TrainingEvent
        fields = ["team", "kind", "name", "start", "end", "location", "time_zone", "slot", "date", "cancelled"]
        extra_kwargs = {"start": {"required": False}, "end": {"required": False}, "time_zone": {"required": False}}
        validators = []  # an occurrence that is a row already is not a duplicate: the view repeats safely


class EventArcherSerializer(serializers.Serializer):
    user_id = serializers.IntegerField()
    name = serializers.CharField()
    managed = serializers.BooleanField()
    sessions = serializers.ListField(child=serializers.UUIDField(), help_text="Sessions of the archer linked to the event")
    notes = serializers.IntegerField(help_text="Notes of the event about this archer that you may read")
    media = serializers.IntegerField(help_text="Photos and videos of the event of this archer")


class MineEventSerializer(serializers.Serializer):
    event = EventSerializer()
    notes = serializers.IntegerField(help_text="Notes of the event about this archer, in no session, that you may read")
    media = serializers.IntegerField(help_text="Photos and videos of the event of this archer, in no session")
