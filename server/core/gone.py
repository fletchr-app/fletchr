import django_filters
from rest_framework import generics, serializers

from .models import Tombstone


class TombstoneSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tombstone
        fields = ["kind", "uid", "at"]


class TombstoneFilter(django_filters.FilterSet):
    updated_after = django_filters.IsoDateTimeFilter(field_name="at", lookup_expr="gt", help_text="Deleted after this time")

    class Meta:
        model = Tombstone
        fields = ["kind"]


class GoneListView(generics.ListAPIView):
    """Photos, videos and notes you may have a copy of that were deleted, oldest first. Sessions: `/api/sessions/gone/`."""

    serializer_class = TombstoneSerializer
    filterset_class = TombstoneFilter

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Tombstone.objects.none()
        return Tombstone.objects.filter(owner=self.request.user).order_by("at", "pk")
