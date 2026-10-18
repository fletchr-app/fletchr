from datetime import date

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from rest_framework import status

from .serializers import (
    AccountBlockedSerializer,
    DeleteAccountRequestSerializer,
    DeleteAccountResponseSerializer,
    DeleteDataRequestSerializer,
    DeleteDataResponseSerializer,
    ExportRequestSerializer,
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
                {"detail": f"You are the only admin of {names}. Make someone else an admin there first.", "teams": teams},
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
        response["Content-Disposition"] = f'attachment; filename="archery-coach-data-{date.today().isoformat()}.json"'
        return response
