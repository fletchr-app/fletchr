from django.utils.translation import gettext
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from core.access import note_teams
from core.models import COACH_ROLES, Team, TeamMember, User
from training.models import End, TrainingSession

from .models import Note

IMMUTABLE = ("team", "archer", "session", "end")


class NoteTeamSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class NoteSerializer(serializers.ModelSerializer):
    team = serializers.PrimaryKeyRelatedField(
        queryset=Team.objects.all(), required=False, help_text="Only needed if you coach this archer in several teams"
    )
    archer = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())
    session = serializers.PrimaryKeyRelatedField(queryset=TrainingSession.objects.all(), required=False, allow_null=True)
    end = serializers.PrimaryKeyRelatedField(queryset=End.objects.all(), required=False, allow_null=True)
    author_name = serializers.SerializerMethodField()
    archer_name = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField()

    class Meta:
        model = Note
        fields = [
            "id", "team", "author", "author_name", "archer", "archer_name", "session", "end", "body",
            "visibility", "can_edit", "can_delete", "created_at", "updated_at",
        ]
        read_only_fields = ["author", "created_at", "updated_at"]

    def get_author_name(self, note) -> str:
        return (note.author.profile.name or note.author.email) if note.author else "Former coach"

    def get_archer_name(self, note) -> str:
        return note.archer.profile.name or note.archer.email

    def get_can_edit(self, note) -> bool:
        return note.author_id == self.context["request"].user.id

    def get_can_delete(self, note) -> bool:
        return self.get_can_edit(note) or note.team_id in self.context["admin_team_ids"]

    def validate_body(self, body):
        body = body.strip()
        if not body:
            raise serializers.ValidationError(gettext("A note cannot be empty"))
        return body

    def validate(self, attrs):
        if self.instance is not None:
            for field in IMMUTABLE:
                if field in attrs and attrs[field] != getattr(self.instance, field):
                    raise serializers.ValidationError({field: gettext("This cannot be changed after the note is written")})
            return attrs

        user = self.context["request"].user
        if not TeamMember.objects.filter(user=user, role__in=COACH_ROLES).exists():
            raise PermissionDenied(gettext("Only coaches can write notes"))
        archer, session, end = attrs["archer"], attrs.get("session"), attrs.get("end")
        allowed = list(note_teams(user, archer))
        team = attrs.get("team")
        if team is not None:
            if team not in allowed:
                raise serializers.ValidationError({"team": gettext("You cannot write notes about this archer in that team")})
        elif len(allowed) == 1:
            team = allowed[0]
        elif not allowed:
            raise serializers.ValidationError({"archer": gettext("You cannot write notes about this person")})
        else:
            raise serializers.ValidationError({"team": gettext("You coach this archer in several teams: say which one")})
        if session is not None and session.owner_id != archer.id:
            raise serializers.ValidationError({"session": gettext("This is not a session of that archer")})
        if end is not None and (session is None or end.session_id != session.id):
            raise serializers.ValidationError({"end": gettext("Give the session this end belongs to")})
        attrs["team"] = team
        return attrs
