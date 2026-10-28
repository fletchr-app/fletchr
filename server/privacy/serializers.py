from django.utils.translation import gettext
from rest_framework import serializers

from core import social


class PasswordProofMixin(serializers.Serializer):
    """The proof that it is me at the phone: my password, or for an account made with Google (no password) a fresh Google token of that account."""

    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    id_token = serializers.CharField(write_only=True, required=False, allow_blank=True, help_text="Instead of the password, for an account that signs in with Google")

    def validate(self, attrs):
        user = self.context["request"].user
        if user.has_usable_password():
            if not user.check_password(attrs.get("password", "")):
                raise serializers.ValidationError({"password": gettext("Wrong password")})
        else:
            try:
                claims = social.verify_google(attrs["id_token"]) if social.enabled() and attrs.get("id_token") else None
            except social.SocialError:
                claims = None
            if claims is None or not user.social_identities.filter(provider=social.GOOGLE, subject=claims.sub).exists():
                raise serializers.ValidationError({"id_token": gettext("Confirm with Google first")})
        return attrs


class ConfirmedRequestSerializer(PasswordProofMixin):
    """Password plus a confirmation word that is typed out, so it cannot be done by accident."""

    confirmation_word = ""
    confirm = serializers.CharField(write_only=True, help_text="The confirmation word shown in the app")

    def validate_confirm(self, value):
        if value.strip() != self.confirmation_word:
            raise serializers.ValidationError(gettext('Type the words "%(word)s" to confirm') % {"word": self.confirmation_word})
        return value


class DeleteDataRequestSerializer(ConfirmedRequestSerializer):
    confirmation_word = "DELETE"


class DeleteAccountRequestSerializer(ConfirmedRequestSerializer):
    confirmation_word = "DELETE ACCOUNT"


class DeletedCountsSerializer(serializers.Serializer):
    sessions = serializers.IntegerField()
    shots = serializers.IntegerField()
    media = serializers.IntegerField(help_text="Photos and videos")
    avatar = serializers.IntegerField(help_text="1 if a profile picture was removed")
    bows = serializers.IntegerField()
    arrow_sets = serializers.IntegerField()
    notes_about_me = serializers.IntegerField()
    evaluations = serializers.IntegerField(help_text="Evaluations about me, by coaches and by me")


class DeleteDataResponseSerializer(serializers.Serializer):
    deleted = DeletedCountsSerializer()


class DeletedAccountCountsSerializer(DeletedCountsSerializer):
    sign_in_methods = serializers.IntegerField(help_text="Google sign-ins removed with the account")


class DeleteAccountResponseSerializer(serializers.Serializer):
    deleted = DeletedAccountCountsSerializer()
    teams_left = serializers.IntegerField(help_text="Teams I was a member of; they go on without me")
    teams_deleted = serializers.IntegerField(help_text="Teams where I was the only member")


class BlockingTeamSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    members = serializers.IntegerField(help_text="Members other than me")


class AccountBlockedSerializer(serializers.Serializer):
    detail = serializers.CharField()
    teams = BlockingTeamSerializer(many=True)


class ExportRequestSerializer(PasswordProofMixin):
    pass


class MediaExportLinkSerializer(serializers.Serializer):
    url = serializers.CharField(help_text="Opens the zip of my photos and videos. Valid for ten minutes, no sign-in header needed")
    files = serializers.IntegerField()
    bytes = serializers.IntegerField()
