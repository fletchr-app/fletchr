from django.conf import settings
from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.exceptions import NotFound
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from . import fcm
from .models import Device

LANGUAGES = [code for code, _ in settings.LANGUAGES]


class DeviceSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=512, help_text="The Firebase token of this phone")
    replaces = serializers.CharField(max_length=512, required=False, allow_blank=True, help_text="The token this one replaces (Firebase changed it)")
    app_id = serializers.CharField(max_length=100, required=False, allow_blank=True, help_text="de.fletchr.app, or de.fletchr.app.dev for the debug app")
    language = serializers.CharField(max_length=10, required=False, allow_blank=True, help_text="The app's language, for the text of the notifications: `en` or `de`")


class DeleteSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=512)


class DeviceView(APIView):
    """The phones of the signed-in person that get notifications. 404 when the server has no Firebase key (push is off)."""

    permission_classes = [IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not fcm.available():
            raise NotFound

    @extend_schema(request=DeviceSerializer, responses={200: None, 201: None})
    @transaction.atomic
    def put(self, request):
        """Register this phone, or tell the server it is still there. Safe to repeat. A token that belongs to another person moves
        to the caller (the phone changed account)."""
        serializer = DeviceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        language = data.get("language", "")[:2].lower()
        if data.get("replaces"):
            Device.objects.filter(user=request.user, token=data["replaces"]).exclude(token=data["token"]).delete()
        _, created = Device.objects.update_or_create(
            token=data["token"],
            defaults={
                "user": request.user,
                "app_id": data.get("app_id", ""),
                "language": language if language in LANGUAGES else "en",
                "last_seen_at": timezone.now(),
            },
        )
        mine = Device.objects.filter(user=request.user)
        for old in mine.order_by("-last_seen_at")[Device.MAX_DEVICES :]:
            old.delete()
        return Response(status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    @extend_schema(request=DeleteSerializer, responses={204: None})
    def delete(self, request):
        """Remove this phone. Only the caller's own; a token that is unknown or someone else's is answered the same."""
        serializer = DeleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        Device.objects.filter(user=request.user, token=serializer.validated_data["token"]).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
