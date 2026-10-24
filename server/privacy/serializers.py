from django.utils.translation import gettext
from rest_framework import serializers


class ConfirmedRequestSerializer(serializers.Serializer):
    """Password plus a confirmation word that is typed out, so it cannot be done by accident."""

    confirmation_word = ""
    password = serializers.CharField(write_only=True)
    confirm = serializers.CharField(write_only=True, help_text="The confirmation word shown in the app")

    def validate_confirm(self, value):
        if value.strip() != self.confirmation_word:
            raise serializers.ValidationError(gettext('Type the words "%(word)s" to confirm') % {"word": self.confirmation_word})
        return value

    def validate_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError(gettext("Wrong password"))
        return value


class DeleteDataRequestSerializer(ConfirmedRequestSerializer):
    confirmation_word = "DELETE"


class DeleteAccountRequestSerializer(ConfirmedRequestSerializer):
    confirmation_word = "DELETE ACCOUNT"


class DeletedCountsSerializer(serializers.Serializer):
    sessions = serializers.IntegerField()
    shots = serializers.IntegerField()
    media = serializers.IntegerField(help_text="Photos and videos")
    bows = serializers.IntegerField()
    arrow_sets = serializers.IntegerField()
    notes_about_me = serializers.IntegerField()


class DeleteDataResponseSerializer(serializers.Serializer):
    deleted = DeletedCountsSerializer()


class DeleteAccountResponseSerializer(DeleteDataResponseSerializer):
    teams_left = serializers.IntegerField(help_text="Teams I was a member of; they go on without me")
    teams_deleted = serializers.IntegerField(help_text="Teams where I was the only member")


class BlockingTeamSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    members = serializers.IntegerField(help_text="Members other than me")


class AccountBlockedSerializer(serializers.Serializer):
    detail = serializers.CharField()
    teams = BlockingTeamSerializer(many=True)


class ExportRequestSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True)

    def validate_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError(gettext("Wrong password"))
        return value


class MediaExportLinkSerializer(serializers.Serializer):
    url = serializers.CharField(help_text="Opens the zip of my photos and videos. Valid for ten minutes, no sign-in header needed")
    files = serializers.IntegerField()
    bytes = serializers.IntegerField()
