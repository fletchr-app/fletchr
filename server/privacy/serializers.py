from rest_framework import serializers

CONFIRMATION_WORD = "DELETE"


class DeleteDataRequestSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True)
    confirm = serializers.CharField(write_only=True, help_text=f'Must be the word "{CONFIRMATION_WORD}"')

    def validate_confirm(self, value):
        if value.strip() != CONFIRMATION_WORD:
            raise serializers.ValidationError(f'Type the word "{CONFIRMATION_WORD}" to confirm')
        return value

    def validate_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Wrong password")
        return value


class DeletedCountsSerializer(serializers.Serializer):
    sessions = serializers.IntegerField()
    shots = serializers.IntegerField()
    bows = serializers.IntegerField()
    arrow_sets = serializers.IntegerField()
    notes_about_me = serializers.IntegerField()


class DeleteDataResponseSerializer(serializers.Serializer):
    deleted = DeletedCountsSerializer()
