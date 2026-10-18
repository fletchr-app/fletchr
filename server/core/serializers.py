from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import Invite, Profile, Role, Team, TeamMember, User


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


class MembershipSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = TeamMember
        fields = ["also_shoots"]


class MemberSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    name = serializers.CharField(source="user.profile.name", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = TeamMember
        fields = ["user_id", "name", "email", "role", "also_shoots", "joined_at"]


class InviteSerializer(serializers.ModelSerializer):
    role = serializers.ChoiceField(choices=Role.choices, default=Role.ARCHER)

    class Meta:
        model = Invite
        fields = ["id", "code", "role", "created_at", "expires_at", "used_at"]
        read_only_fields = ["id", "code", "created_at", "expires_at", "used_at"]
