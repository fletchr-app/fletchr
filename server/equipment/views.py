from django.utils.translation import gettext
from django.db import transaction
from django.db.models import ProtectedError
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import SAFE_METHODS, BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from core.access import archers_visible_to

from .models import ArrowSet, ArrowSetRevision, Bow, BowRevision, Setup
from .revisions import record_revision
from .serializers import (
    ArrowSetPutSerializer,
    ArrowSetRevisionSerializer,
    ArrowSetSerializer,
    BowPutSerializer,
    BowRevisionSerializer,
    BowSerializer,
    SetupSerializer,
)


class IsOwnerOrReadOnly(BasePermission):
    """Coaches can see an archer's equipment (the queryset decides that) but only the owner can change it."""

    def has_object_permission(self, request, view, obj):
        return request.method in SAFE_METHODS or obj.owner_id == request.user.id


class EquipmentViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsOwnerOrReadOnly]
    filterset_fields = ["owner", "is_active"]
    model = None
    revision_serializer = None

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return self.model.objects.none()
        return (
            self.model.objects.filter(owner__in=archers_visible_to(self.request.user))
            .select_related("current_revision")
            .order_by("name", "id")
        )

    @transaction.atomic
    def perform_create(self, serializer):
        record_revision(serializer.save(owner=self.request.user))

    @transaction.atomic
    def perform_update(self, serializer):
        record_revision(serializer.save())

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return Response(
                {"detail": gettext("This has been used in a session. Deactivate it instead of deleting it.")},
                status=status.HTTP_409_CONFLICT,
            )

    @action(detail=True, methods=["get"])
    def revisions(self, request, pk=None):
        item = self.get_object()
        serializer = self.revision_serializer(item.revisions.all(), many=True)
        return Response(serializer.data)


@extend_schema(tags=["bows"])
class BowViewSet(EquipmentViewSet):
    model = Bow
    serializer_class = BowSerializer
    revision_serializer = BowRevisionSerializer

    @extend_schema(responses=BowRevisionSerializer(many=True))
    @action(detail=True, methods=["get"])
    def revisions(self, request, pk=None):
        return super().revisions(request, pk)


@extend_schema(tags=["arrow-sets"])
class ArrowSetViewSet(EquipmentViewSet):
    model = ArrowSet
    serializer_class = ArrowSetSerializer
    revision_serializer = ArrowSetRevisionSerializer

    @extend_schema(responses=ArrowSetRevisionSerializer(many=True))
    @action(detail=True, methods=["get"])
    def revisions(self, request, pk=None):
        return super().revisions(request, pk)


class EquipmentPutView(APIView):
    """Create or update an item by the uid the app gave it. Safe to repeat: the same values add no revision.

    The body may carry `revision_uid`, the uid the app gave the revision these values make; it is used if the values
    are new. Only the owner can write: an item of somebody else is answered like one that does not exist.
    """

    permission_classes = [IsAuthenticated]
    model = None
    put_serializer = None
    serializer = None

    def put(self, request, uid):
        item = self.model.objects.filter(uid=uid).select_related("current_revision").first()
        if item is not None and item.owner_id != request.user.id:
            raise NotFound
        body = self.put_serializer(item, data=request.data, context={"request": request})
        body.is_valid(raise_exception=True)
        revision_uid = body.validated_data.pop("revision_uid", None)
        if revision_uid is not None and self.revision_model.objects.filter(uid=revision_uid).exclude(**{self.link: item}).exists():
            raise ValidationError({"revision_uid": gettext("This revision belongs to something else")})
        with transaction.atomic():
            saved = body.save(owner=request.user, uid=uid) if item is None else body.save()
            record_revision(saved, uid=revision_uid)
        saved.refresh_from_db()
        return Response(self.serializer(saved, context={"request": request}).data, status=200 if item else 201)


@extend_schema(tags=["bows"], request=BowPutSerializer, responses={200: BowSerializer, 201: BowSerializer})
class BowPutView(EquipmentPutView):
    model = Bow
    revision_model = BowRevision
    link = "bow"
    put_serializer = BowPutSerializer
    serializer = BowSerializer


@extend_schema(tags=["arrow-sets"], request=ArrowSetPutSerializer, responses={200: ArrowSetSerializer, 201: ArrowSetSerializer})
class ArrowSetPutView(EquipmentPutView):
    model = ArrowSet
    revision_model = ArrowSetRevision
    link = "arrow_set"
    put_serializer = ArrowSetPutSerializer
    serializer = ArrowSetSerializer


class SetupListCreateView(generics.ListCreateAPIView):
    """Setups are immutable. Posting a pair of revisions returns the existing setup for it if there is one."""

    serializer_class = SetupSerializer
    filterset_fields = ["owner"]

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Setup.objects.none()
        return (
            Setup.objects.filter(owner__in=archers_visible_to(self.request.user))
            .select_related("bow_revision", "arrow_set_revision")
            .order_by("-created_at")
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        setup, created = Setup.objects.get_or_create(
            owner=request.user,
            bow_revision=serializer.validated_data["bow_revision"],
            arrow_set_revision=serializer.validated_data.get("arrow_set_revision"),
        )
        data = self.get_serializer(setup).data
        return Response(data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class SetupDetailView(generics.RetrieveAPIView):
    serializer_class = SetupSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Setup.objects.none()
        return Setup.objects.filter(owner__in=archers_visible_to(self.request.user)).select_related(
            "bow_revision", "arrow_set_revision"
        )
