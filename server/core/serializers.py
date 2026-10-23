from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import ClaimCode, Invite, Profile, Role, Team, TeamMember, User


class ProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = Profile
        fields = ["name", "dominant_hand", "dominant_eye", "date_of_birth", "units"]


class MeSerializer(serializers.ModelSerializer):
    profile = ProfileSerializer()

    class Meta:
        model = User
        fields = ["id", "email", "profile"]
        read_only_fields = ["id", "email"]

    def update(self, instance, validated_data):
        profile = validated_data.pop("profile", {})
        for field, value in profile.items():
            setattr(instance.profile, field, value)
        instance.profile.save()
        return instance


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    name = serializers.CharField(max_length=150)
    invite_code = serializers.CharField()

    def validate_email(self, value):
        value = value.lower()
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError("An account with this email already exists")
        return value

    def validate(self, attrs):
        validate_password(attrs["password"], User(email=attrs["email"]))
        return attrs


class RegisterResponseSerializer(serializers.Serializer):
    access = serializers.CharField()
    refresh = serializers.CharField()
    user = MeSerializer()


class RedeemSerializer(serializers.Serializer):
    invite_code = serializers.CharField()


class TeamSerializer(serializers.ModelSerializer):
    my_role = serializers.CharField(read_only=True)
    also_shoots = serializers.BooleanField(read_only=True, help_text="Whether I share my own training with the other coaches")

    class Meta:
        model = Team
        fields = ["id", "name", "my_role", "also_shoots"]


class TeamNameSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150)

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("A team needs a name")
        return value


class RoleChangeSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=Role.choices)


class MembershipSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = TeamMember
        fields = ["also_shoots"]


class MemberSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    name = serializers.CharField(source="user.profile.name", read_only=True)
    email = serializers.SerializerMethodField(help_text="Empty for an archer without an account")
    managed = serializers.BooleanField(source="user.is_managed", read_only=True, help_text="A profile kept by a coach, without an account")

    class Meta:
        model = TeamMember
        fields = ["user_id", "name", "email", "managed", "role", "also_shoots", "joined_at"]

    def get_email(self, obj) -> str:
        return "" if obj.user.is_managed else obj.user.email


class InviteSerializer(serializers.ModelSerializer):
    role = serializers.ChoiceField(choices=Role.choices, default=Role.ARCHER)

    class Meta:
        model = Invite
        fields = ["id", "code", "role", "created_at", "expires_at", "used_at"]
        read_only_fields = ["id", "code", "created_at", "expires_at", "used_at"]


class ArcherNameSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150)

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("An archer needs a name")
        return value


class ClaimCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClaimCode
        fields = ["code", "expires_at"]
        read_only_fields = ["code", "expires_at"]


class ArcherSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    managed = serializers.BooleanField(help_text="A profile kept by a coach, without an account")
    team_id = serializers.IntegerField(allow_null=True, help_text="A team you coach that the archer is in")
    team_name = serializers.CharField(allow_null=True)


class CodePreviewSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=["invite", "claim"])
    team_name = serializers.CharField()
    profile_name = serializers.CharField(allow_null=True, help_text="For a claim code: the profile you would take over")


class CurrentPasswordMixin(serializers.Serializer):
    """Changing the login needs the current password, even when signed in: a stolen phone must not be enough."""

    current_password = serializers.CharField(write_only=True)

    def validate_current_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Wrong password")
        return value


class PasswordChangeSerializer(CurrentPasswordMixin):
    new_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value):
        user = self.context["request"].user
        if user.check_password(value):
            raise serializers.ValidationError("Choose a different password")
        try:
            validate_password(value, user)
        except DjangoValidationError as e:
            raise serializers.ValidationError(list(e.messages))
        return value


class EmailChangeSerializer(CurrentPasswordMixin):
    new_email = serializers.EmailField()

    def validate_new_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exclude(pk=self.context["request"].user.pk).exists():
            raise serializers.ValidationError("This address is not available")
        return value


class TokenPairSerializer(serializers.Serializer):
    access = serializers.CharField()
    refresh = serializers.CharField()
