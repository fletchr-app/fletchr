from django.conf import settings
from django.db.models import Sum
from django.utils.translation import gettext
from rest_framework import serializers

from training.serializers import SessionRefField

from .access import can_change, media_link
from .files import is_jpeg, is_mp4
from .models import Media

MB = 1024 * 1024
REQUIRED = serializers.Field.default_error_messages["required"]  # the framework's text, already translated


class MediaSerializer(serializers.ModelSerializer):
    owner_name = serializers.SerializerMethodField()
    uploaded_by_name = serializers.SerializerMethodField(help_text="Empty if that account is gone")
    file_url = serializers.SerializerMethodField(help_text="Opens for an hour; fetch the clip again for a new link")
    thumbnail_url = serializers.SerializerMethodField(help_text="Opens for an hour; fetch the clip again for a new link")
    can_edit = serializers.SerializerMethodField()

    class Meta:
        model = Media
        fields = [
            "id", "owner", "owner_name", "uploaded_by", "uploaded_by_name", "session", "kind", "taken_at", "width", "height", "size",
            "duration_ms", "capture_fps", "frame_count", "note", "created_at", "file_url", "thumbnail_url", "can_edit",
        ]

    def get_owner_name(self, media) -> str:
        return media.owner.profile.name or media.owner.email

    def get_uploaded_by_name(self, media) -> str:
        who = media.uploaded_by
        return (who.profile.name or who.email) if who else ""

    def get_file_url(self, media) -> str:
        return media_link(self.context["request"], media, "file")

    def get_thumbnail_url(self, media) -> str:
        return media_link(self.context["request"], media, "thumbnail")

    def get_can_edit(self, media) -> bool:
        return can_change(self.context["request"].user, media)


class MediaWriteSerializer(serializers.Serializer):
    """A new clip needs everything but `note` and `session`. Repeating the request for a clip that exists changes only those two."""

    kind = serializers.ChoiceField(choices=Media.Kind.choices, required=False)
    file = serializers.FileField(required=False, help_text="A JPEG photo or an MP4 video, converted by the phone")
    thumbnail = serializers.FileField(required=False, help_text="A small JPEG")
    taken_at = serializers.DateTimeField(required=False)
    width = serializers.IntegerField(min_value=1, max_value=32767, required=False)
    height = serializers.IntegerField(min_value=1, max_value=32767, required=False)
    duration_ms = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    capture_fps = serializers.FloatField(min_value=1, max_value=1000, required=False, allow_null=True)
    frame_count = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    note = serializers.CharField(required=False, allow_blank=True)
    session = SessionRefField(required=False, allow_null=True)

    CREATE_ONLY = ["kind", "file", "thumbnail", "taken_at", "width", "height"]

    def validate_session(self, session):
        if session is not None and session.owner_id != self.context["owner"].pk:
            raise serializers.ValidationError(gettext("This session belongs to another archer"))
        return session

    def validate(self, attrs):
        if self.instance is not None:
            return {k: v for k, v in attrs.items() if k in ("note", "session")}
        missing = {k: str(REQUIRED) for k in self.CREATE_ONLY if k not in attrs}
        if missing:
            raise serializers.ValidationError(missing)
        kind, file, thumbnail = attrs["kind"], attrs["file"], attrs["thumbnail"]
        if kind == Media.Kind.VIDEO:
            if not is_mp4(file):
                raise serializers.ValidationError({"file": gettext("A video must be an MP4 file")})
            if file.size > settings.MEDIA_MAX_VIDEO_BYTES:
                raise serializers.ValidationError({"file": gettext("The video is larger than %(n)s MB") % {"n": settings.MEDIA_MAX_VIDEO_BYTES // MB}})
            if not attrs.get("duration_ms"):
                raise serializers.ValidationError({"duration_ms": str(REQUIRED)})
            if attrs["duration_ms"] > settings.MEDIA_MAX_VIDEO_SECONDS * 1000:
                raise serializers.ValidationError({"duration_ms": gettext("The video is longer than %(n)s seconds") % {"n": settings.MEDIA_MAX_VIDEO_SECONDS}})
        else:
            if not is_jpeg(file):
                raise serializers.ValidationError({"file": gettext("A photo must be a JPEG file")})
            if file.size > settings.MEDIA_MAX_PHOTO_BYTES:
                raise serializers.ValidationError({"file": gettext("The photo is larger than %(n)s MB") % {"n": settings.MEDIA_MAX_PHOTO_BYTES // MB}})
            for field in ("duration_ms", "capture_fps", "frame_count"):
                attrs[field] = None
        if not is_jpeg(thumbnail) or thumbnail.size > settings.MEDIA_MAX_THUMBNAIL_BYTES:
            raise serializers.ValidationError({"thumbnail": gettext("The preview must be a small JPEG file")})
        used = Media.objects.filter(owner=self.context["owner"]).aggregate(total=Sum("size"))["total"] or 0
        if used + file.size + thumbnail.size > settings.MEDIA_QUOTA_BYTES:
            raise serializers.ValidationError(gettext("There is no room left for this archer's photos and videos"))
        return attrs
