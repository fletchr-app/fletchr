from datetime import date

from django.db.models import Sum
from django.http import StreamingHttpResponse
from django.utils.translation import gettext
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from rest_framework import status

from core.models import User

from . import media_zip
from .serializers import (
    AccountBlockedSerializer,
    DeleteAccountRequestSerializer,
    DeleteAccountResponseSerializer,
    DeleteDataRequestSerializer,
    DeleteDataResponseSerializer,
    ExportRequestSerializer,
    MediaExportLinkSerializer,
)
from .export import export_user_data
from .services import AccountBlocked, delete_account, delete_my_data


class DeleteMyDataView(APIView):
    """Erase my sessions, equipment and the coach notes about me, for good. Needs my password."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "sensitive"

    @extend_schema(request=DeleteDataRequestSerializer, responses=DeleteDataResponseSerializer)
    def post(self, request):
        serializer = DeleteDataRequestSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        return Response({"deleted": delete_my_data(request.user)})


class DeleteMyAccountView(APIView):
    """Erase my account and all my data, for good. Needs my password. Refused while I am the only admin of a team others are in."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "sensitive"

    @extend_schema(
        request=DeleteAccountRequestSerializer,
        responses={200: DeleteAccountResponseSerializer, 409: AccountBlockedSerializer},
    )
    def post(self, request):
        serializer = DeleteAccountRequestSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        try:
            return Response(delete_account(request.user))
        except AccountBlocked as blocked:
            teams = [{"id": team.pk, "name": team.name, "members": others} for team, others in blocked.teams]
            names = ", ".join(t["name"] for t in teams)
            return Response(
                {"detail": gettext("You are the only admin of %(teams)s. Make someone else an admin there first.") % {"teams": names}, "teams": teams},
                status=status.HTTP_409_CONFLICT,
            )


class ExportMyDataView(APIView):
    """Everything the server has about me, as one JSON document. Needs my password."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "sensitive"

    @extend_schema(request=ExportRequestSerializer, responses=OpenApiTypes.OBJECT)
    def post(self, request):
        serializer = ExportRequestSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        response = Response(export_user_data(request.user))
        response["Content-Disposition"] = f'attachment; filename="fletchr-data-{date.today().isoformat()}.json"'
        return response


class ExportMyMediaLinkView(APIView):
    """A link to a zip of my photos and videos. Needs my password. The files are big, so the zip is fetched by the link, not in this answer."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "sensitive"

    @extend_schema(request=ExportRequestSerializer, responses=MediaExportLinkSerializer)
    def post(self, request):
        serializer = ExportRequestSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        media = media_zip.media_of(request.user)
        url = request.build_absolute_uri(f"/api/me/export/media/file/?token={media_zip.sign_link(request.user.pk)}")
        return Response({"url": url, "files": media.count(), "bytes": media.aggregate(total=Sum("size"))["total"] or 0})


class ExportMyMediaFileView(APIView):
    """The zip. The link carries a token because a browser opens it, without the sign-in header."""

    permission_classes = [AllowAny]

    @extend_schema(parameters=[OpenApiParameter("token", str, description="From the link")], responses={(200, "application/zip"): OpenApiTypes.BINARY})
    def get(self, request):
        user_id = media_zip.read_link(request.query_params.get("token", ""))
        user = User.objects.filter(pk=user_id, is_active=True).first() if user_id else None
        if user is None:
            raise NotFound()
        response = StreamingHttpResponse(media_zip.stream(user), content_type="application/zip")
        response["Content-Disposition"] = f'attachment; filename="fletchr-media-{date.today().isoformat()}.zip"'
        response["Cache-Control"] = "private, no-store"
        return response
