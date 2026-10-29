from django.utils.translation import gettext
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers
from rest_framework.exceptions import PermissionDenied

from core.access import archers_visible_to, note_teams
from core.models import COACH_ROLES, Team, TeamMember, User
from media.access import media_link, visible_media
from media.models import Media
from training.serializers import SessionRefField
from training.models import End

from .drawing import check_drawing
from .models import Note

IMMUTABLE = ("team", "archer", "session", "end", "media", "frame", "time_ms")  # the drawing can change


class NoteTeamSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()


class VisibleMediaField(serializers.PrimaryKeyRelatedField):
    """Only photos and clips the user may see; one they may not is answered like one that does not exist."""

    def get_queryset(self):
        return visible_media(self.context["request"].user)


class NotePictureSerializer(serializers.Serializer):
    kind = serializers.CharField()
    width = serializers.IntegerField()
    height = serializers.IntegerField()
    thumbnail_url = serializers.CharField(help_text="Opens for an hour")
    file_url = serializers.CharField(help_text="Opens for an hour")


class NoteSerializer(serializers.ModelSerializer):
    team = serializers.PrimaryKeyRelatedField(
        queryset=Team.objects.all(), required=False, help_text="Only needed if you coach this archer in several teams"
    )
    archer = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())
    session = SessionRefField(required=False, allow_null=True)
    end = serializers.PrimaryKeyRelatedField(queryset=End.objects.all(), required=False, allow_null=True)
    media = VisibleMediaField(queryset=Media.objects.none(), required=False, allow_null=True, help_text="A note on this photo, or on a frame of this clip (needs `frame`)")
    frame = serializers.IntegerField(min_value=0, required=False, allow_null=True, help_text="The frame, counted from 0")
    time_ms = serializers.IntegerField(min_value=0, required=False, allow_null=True, help_text="Where that frame is in the clip")
    drawing = serializers.JSONField(required=False, allow_null=True, help_text="Lines, angles and circles on the photo or frame; see notes/drawing.py for the format")
    picture = serializers.SerializerMethodField(help_text="The photo or clip of the note; empty if it is gone or you may not see it")
    author_name = serializers.SerializerMethodField()
    archer_name = serializers.SerializerMethodField()
    can_edit = serializers.SerializerMethodField()
    can_delete = serializers.SerializerMethodField()

    class Meta:
        model = Note
        fields = [
            "id", "uid", "team", "author", "author_name", "archer", "archer_name", "session", "end", "media", "picture", "frame", "time_ms", "drawing", "body",
            "visibility", "can_edit", "can_delete", "created_at", "updated_at",
        ]
        read_only_fields = ["author", "created_at", "updated_at"]

    @extend_schema_field(NotePictureSerializer(allow_null=True))
    def get_picture(self, note):
        media = note.media
        if media is None:
            return None
        visible = self.context.get("visible_owner_ids")
        if visible is None:
            visible = set(archers_visible_to(self.context["request"].user).values_list("pk", flat=True))
        if media.owner_id not in visible:
            return None
        request = self.context["request"]
        return {
            "kind": media.kind, "width": media.width, "height": media.height,
            "thumbnail_url": media_link(request, media, "thumbnail"), "file_url": media_link(request, media, "file"),
        }

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

    def validate_drawing(self, value):
        try:
            return check_drawing(value)
        except ValueError as e:
            raise serializers.ValidationError(str(e))

    def validate(self, attrs):
        if attrs.get("drawing") is not None:
            on_media = self.instance.media_id is not None if self.instance is not None else attrs.get("media") is not None
            if not on_media:
                raise serializers.ValidationError({"drawing": gettext("A drawing belongs to a photo or a frame of a clip")})
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
        media, frame = attrs.get("media"), attrs.get("frame")
        if media is not None:
            if media.owner_id != archer.id:
                raise serializers.ValidationError({"media": gettext("This is not a photo or video of that archer")})
            if media.kind == Media.Kind.PHOTO:
                if frame is not None or attrs.get("time_ms") is not None:
                    raise serializers.ValidationError({"frame": gettext("A photo has no frames")})
            elif frame is None:
                raise serializers.ValidationError({"frame": gettext("Say which frame the note is about")})
            elif media.frame_count and frame >= media.frame_count:
                raise serializers.ValidationError({"frame": gettext("The clip has no such frame")})
            if session is None and media.session_id:
                attrs["session"] = media.session  # the note belongs to the session the clip was taken in
            elif session is not None and media.session_id not in (None, session.id):
                raise serializers.ValidationError({"media": gettext("This clip is from another session")})
        elif frame is not None or attrs.get("time_ms") is not None:
            raise serializers.ValidationError({"media": gettext("Give the clip the frame is in")})
        attrs["team"] = team
        return attrs
