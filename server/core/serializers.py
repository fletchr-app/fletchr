from django.utils.translation import gettext
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework import serializers

from . import access, audience
from .avatar import sign_link
from .models import COACH_ROLES, ClaimCode, Invite, Profile, Role, Team, TeamMember, User


def check_birth_date(value):
    if value is not None and (value > timezone.localdate() or value.year < 1900):
        raise serializers.ValidationError(gettext("Enter a date of birth in the past"))
    return value


def avatar_url(request, person_id) -> str:
    return request.build_absolute_uri(f"/api/users/{person_id}/avatar/?token={sign_link(person_id, request.user.pk)}")


class ProfileSerializer(serializers.ModelSerializer):
    video_allowed = serializers.BooleanField(read_only=True, help_text="False for an archer under 18 whose parents' consent is not on record")
    avatar_allowed = serializers.BooleanField(read_only=True, help_text="False for an archer under 18 whose parents' consent is not on record")
    avatar_url = serializers.SerializerMethodField(help_text="Empty without a picture; opens for an hour, fetch again for a new link")

    class Meta:
        model = Profile
        fields = ["name", "dominant_hand", "dominant_eye", "date_of_birth", "units", "training_visibility", "visibility", "push_notes", "push_evaluations", "push_team", "video_allowed", "avatar_allowed", "avatar_url"]
        extra_kwargs = {
            "training_visibility": {"help_text": "Who sees a new session unless the session says otherwise: `me` or `coaches`. `team` and `everyone` are refused for now"},
            "visibility": {"help_text": "Who sees my name and picture in the team: `team`, `coaches` or `me`. `everyone` is refused for now"},
            "push_notes": {"help_text": "Notify me when a coach shares a note with me"},
            "push_evaluations": {"help_text": "Notify me when a coach shares an evaluation with me"},
            "push_team": {"help_text": "Notify me when somebody uses an invite or claim code I made"},
        }

    def validate_training_visibility(self, value):
        user = self.context["request"].user
        return access.check_visibility(value, user, user)

    def validate_visibility(self, value):
        if value not in audience.PROFILE_ACCEPTED:
            raise serializers.ValidationError(gettext("Not available yet"))
        return value

    def get_avatar_url(self, profile) -> str:
        request = self.context.get("request")
        if request is None or not profile.avatar or not profile.avatar_allowed:
            return ""
        return avatar_url(request, profile.user_id)

    def validate_date_of_birth(self, value):
        return check_birth_date(value)


class MeSerializer(serializers.ModelSerializer):
    profile = ProfileSerializer()
    has_password = serializers.SerializerMethodField(help_text="False for an account made with Google: no password, no email change")
    sign_in_providers = serializers.SerializerMethodField(help_text="Providers (google) that can sign in to this account")

    class Meta:
        model = User
        fields = ["id", "email", "profile", "has_password", "sign_in_providers"]
        read_only_fields = ["id", "email"]

    def get_has_password(self, user) -> bool:
        return user.has_usable_password()

    def get_sign_in_providers(self, user) -> list[str]:
        return sorted(user.social_identities.values_list("provider", flat=True))

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
            raise serializers.ValidationError(gettext("An account with this email already exists"))
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
        fields = ["id", "name", "show_ranking", "my_role", "also_shoots"]


class TeamNameSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150)

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError(gettext("A team needs a name"))
        return value


class TeamUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=150, required=False)
    show_ranking = serializers.BooleanField(required=False, help_text="Whether coaches see the table that compares the archers")

    def validate_name(self, value):
        return TeamNameSerializer().validate_name(value)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError(gettext("Give a name or show_ranking"))
        return attrs


class RoleChangeSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=Role.choices)


class MembershipSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = TeamMember
        fields = ["also_shoots"]


class MemberSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    name = serializers.CharField(source="user.profile.name", read_only=True)
    email = serializers.SerializerMethodField(help_text="Empty for an archer without an account, and for a viewer who is an archer (only coaches and admins see addresses)")
    managed = serializers.BooleanField(source="user.is_managed", read_only=True, help_text="A profile kept by a coach, without an account")

    avatar_url = serializers.SerializerMethodField(help_text="Empty if there is no picture or the viewer may not see it; opens for an hour")

    class Meta:
        model = TeamMember
        fields = ["user_id", "name", "email", "managed", "role", "also_shoots", "joined_at", "avatar_url"]

    def _relations(self):
        request = self.context["request"]
        return self.context.setdefault("_relations", access.relations_of(request.user))

    def get_avatar_url(self, member) -> str:
        """The rule of access.can_see_avatar (`sees_person`), with the viewer's relations read once per request."""
        request = self.context.get("request")
        profile = member.user.profile
        if request is None or not profile.avatar or not profile.avatar_allowed:
            return ""
        if not access.sees_person(self._relations().get(member.user_id), profile, member.user.is_managed):
            return ""
        return avatar_url(request, member.user_id)

    def get_email(self, obj) -> str:
        """Only for the viewer themselves and for the coaches and admins of the team: archers see no addresses."""
        request = self.context.get("request")
        if obj.user.is_managed or request is None:
            return ""
        roles = self.context.setdefault("_viewer_roles", {})
        if obj.team_id not in roles:
            roles[obj.team_id] = access.role_in(request.user, obj.team_id)
        if obj.user_id == request.user.pk or roles[obj.team_id] in COACH_ROLES:
            return obj.user.email
        return ""


class RosterMemberSerializer(MemberSerializer):
    """What a team member sees of another: name, role and picture. No email."""

    name = serializers.SerializerMethodField(help_text="Empty if the person has not set a name; the app shows a placeholder")

    class Meta:
        model = TeamMember
        fields = ["user_id", "name", "role", "avatar_url"]

    def get_name(self, member) -> str:
        return member.user.profile.name


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
            raise serializers.ValidationError(gettext("An archer needs a name"))
        return value


class ManagedArcherSerializer(serializers.Serializer):
    """What a coach may change on the profile of an archer without an account."""

    name = serializers.CharField(max_length=150, required=False)
    dominant_hand = serializers.ChoiceField(choices=Profile.Hand.choices, required=False, allow_blank=True)
    dominant_eye = serializers.ChoiceField(choices=Profile.Hand.choices, required=False, allow_blank=True)
    date_of_birth = serializers.DateField(required=False, allow_null=True)

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError(gettext("An archer needs a name"))
        return value

    def validate_date_of_birth(self, value):
        return check_birth_date(value)


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
    dominant_hand = serializers.CharField(allow_blank=True)
    dominant_eye = serializers.CharField(allow_blank=True)
    age = serializers.IntegerField(allow_null=True, help_text="Whole years; the date of birth itself is private")
    date_of_birth = serializers.DateField(allow_null=True, help_text="Only for a profile without an account, which the coach keeps")
    video_allowed = serializers.BooleanField(help_text="False for an archer under 18 whose parents' consent is not on record")
    video_consent_at = serializers.DateTimeField(allow_null=True, help_text="When a coach recorded the parents' consent for video")
    video_consent_by = serializers.CharField(allow_null=True, help_text="Who recorded it")
    avatar_allowed = serializers.BooleanField(help_text="False for an archer under 18 whose parents' consent is not on record")
    avatar_url = serializers.CharField(help_text="Empty without a picture; opens for an hour")


class VideoConsentSerializer(serializers.Serializer):
    video_allowed = serializers.BooleanField()
    video_consent_at = serializers.DateTimeField(allow_null=True)
    video_consent_by = serializers.CharField(allow_null=True)


class CodePreviewSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=["invite", "claim"])
    team_name = serializers.CharField()
    profile_name = serializers.CharField(allow_null=True, help_text="For a claim code: the profile you would take over")


class CurrentPasswordMixin(serializers.Serializer):
    """Changing the login needs the current password, even when signed in: a stolen phone must not be enough."""

    current_password = serializers.CharField(write_only=True)

    def validate_current_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError(gettext("Wrong password"))
        return value


class PasswordChangeSerializer(CurrentPasswordMixin):
    new_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value):
        user = self.context["request"].user
        if user.check_password(value):
            raise serializers.ValidationError(gettext("Choose a different password"))
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
            raise serializers.ValidationError(gettext("This address is not available"))
        return value


class TokenPairSerializer(serializers.Serializer):
    access = serializers.CharField()
    refresh = serializers.CharField()


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    email = serializers.EmailField()
    code = serializers.CharField(help_text="The code from the mail, with or without the dash")
    new_password = serializers.CharField(write_only=True)


class GoogleSignInSerializer(serializers.Serializer):
    id_token = serializers.CharField(write_only=True, help_text="From the Google sign-in on the phone")
    invite_code = serializers.CharField(required=False, allow_blank=True, help_text="Only to register: an invite or claim code")
