import django_filters
from django.utils.translation import gettext
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from core.access import archers_visible_to
from core.models import User

from .access import can_add_for, can_change
from .files import read_link, serve
from .models import Media
from .serializers import MediaSerializer, MediaWriteSerializer


def visible_media(user):
    """The clips of the archers whose training `user` may see."""
    return Media.objects.filter(owner__in=archers_visible_to(user)).select_related("owner__profile")


def get_media(request, media_id, write=False):
    """Clips of archers you can't see are 404. Ones you can see but may not change are read-only."""
    media = visible_media(request.user).filter(pk=media_id).first()
    if media is None:
        raise NotFound()
    if write and not can_change(request.user, media):
        raise PermissionDenied(gettext("Only the archer or whoever added it can change a photo or video"))
    return media


class MediaFilter(django_filters.FilterSet):
    class Meta:
        model = Media
        fields = ["owner", "session", "kind"]


class MediaListView(generics.ListAPIView):
    """Photos and videos you may see: your own and those of the archers you coach, newest first."""

    serializer_class = MediaSerializer
    filterset_class = MediaFilter

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Media.objects.none()
        return visible_media(self.request.user)


class MediaDetailView(APIView):
    parser_classes = [MultiPartParser, FormParser]

    @extend_schema(responses=MediaSerializer)
    def get(self, request, media_id):
        return Response(MediaSerializer(get_media(request, media_id), context={"request": request}).data)

    @extend_schema(
        request={"multipart/form-data": MediaWriteSerializer},
        parameters=[OpenApiParameter("owner", int, description="Upload for an archer you coach; default: yourself")],
        responses={200: MediaSerializer, 201: MediaSerializer},
    )
    def put(self, request, media_id):
        """Upload the clip with this id, or change its note and session. Safe to repeat: the files of a clip that exists are not replaced."""
        existing = Media.objects.filter(pk=media_id).first()
        if existing is not None:
            existing = get_media(request, media_id, write=True)
        owner = existing.owner if existing else request.user
        if existing is None and "owner" in request.query_params:
            try:
                owner = User.objects.filter(pk=int(request.query_params["owner"])).first()
            except ValueError:
                raise ValidationError({"owner": gettext("Give the id of the archer")})
            if owner is None or not can_add_for(request.user, owner):
                raise NotFound()
        serializer = MediaWriteSerializer(existing, data=request.data, context={"owner": owner})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if existing is None:
            file, thumbnail = data.pop("file"), data.pop("thumbnail")
            media = Media(id=media_id, owner=owner, uploaded_by=request.user, size=file.size + thumbnail.size, **data)
            media.file.save("file", file, save=False)  # the name comes from the owner and the id (models.file_path)
            media.thumbnail.save("thumbnail", thumbnail, save=False)
            media.save()
        else:
            media = existing
            for name, value in data.items():
                setattr(media, name, value)
            media.save()
        media = visible_media(request.user).get(pk=media.pk)
        return Response(MediaSerializer(media, context={"request": request}).data, status=status.HTTP_200_OK if existing else status.HTTP_201_CREATED)

    @extend_schema(responses={204: None})
    def delete(self, request, media_id):
        get_media(request, media_id, write=True).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MediaFileView(APIView):
    """The file itself. The <video> and <img> elements cannot send the sign-in header, so the link from the clip
    carries a token (one user, one clip, an hour); the sign-in header works too."""

    permission_classes = [AllowAny]
    part = "file"

    @extend_schema(
        parameters=[OpenApiParameter("token", str, description="From `file_url`; not needed with the sign-in header")],
        responses={(200, "application/octet-stream"): OpenApiTypes.BINARY, (206, "application/octet-stream"): OpenApiTypes.BINARY},
    )
    def get(self, request, media_id):
        user = request.user if request.user.is_authenticated else None
        if user is None and "token" in request.query_params:
            user_id = read_link(request.query_params["token"], media_id)
            user = User.objects.filter(pk=user_id, is_active=True).first() if user_id else None
        if user is None:
            raise NotFound()  # the same answer as for a clip that is not yours
        media = visible_media(user).filter(pk=media_id).first()
        if media is None:
            raise NotFound()
        if self.part == "thumbnail":
            return serve(request, media.thumbnail, "image/jpeg")
        return serve(request, media.file, "video/mp4" if media.kind == Media.Kind.VIDEO else "image/jpeg")


class MediaThumbnailView(MediaFileView):
    part = "thumbnail"
