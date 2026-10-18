from drf_spectacular.utils import extend_schema
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .catalogue import load_faces
from .serializers import FaceSerializer


@extend_schema(responses=FaceSerializer(many=True))
@api_view(["GET"])
def face_list(request):
    return Response(load_faces())
