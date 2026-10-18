from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .serializers import DeleteDataRequestSerializer, DeleteDataResponseSerializer
from .services import delete_my_data


class DeleteMyDataView(APIView):
    """Erase my sessions, equipment and the coach notes about me, for good. Needs my password."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "sensitive"

    @extend_schema(request=DeleteDataRequestSerializer, responses=DeleteDataResponseSerializer)
    def post(self, request):
        serializer = DeleteDataRequestSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        return Response({"deleted": delete_my_data(request.user)})
