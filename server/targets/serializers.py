from rest_framework import serializers


class RingSerializer(serializers.Serializer):
    value = serializers.IntegerField()
    diameter_cm = serializers.FloatField(help_text="Outer diameter of the ring")


class SpotSerializer(serializers.Serializer):
    x = serializers.FloatField(help_text="cm from the middle of the face, right is positive")
    y = serializers.FloatField(help_text="cm from the middle of the face, up is positive")


class FaceSerializer(serializers.Serializer):
    slug = serializers.CharField()
    name = serializers.CharField()
    kind = serializers.ChoiceField(choices=["wa", "field", "blank"])
    compound = serializers.BooleanField(help_text="Small 10 ring, as used for compound")
    rings = RingSerializer(many=True, help_text="Inner to outer")
    spots = SpotSerializer(many=True)
    x_diameter_cm = serializers.FloatField(required=False)
    note = serializers.CharField(required=False)
