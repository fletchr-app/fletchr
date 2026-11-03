from django.contrib import admin

from .merge import delete_session
from .models import End, SessionTombstone, Shot, TrainingEvent, TrainingSession, TrainingSlot, VolumeEntry

for model in (SessionTombstone, End, Shot, VolumeEntry):
    admin.site.register(model)


@admin.register(TrainingSession)
class TrainingSessionAdmin(admin.ModelAdmin):
    """Deleting here goes through `delete_session`, so the phones learn the session is gone (the API's delete does the same)."""

    def delete_model(self, request, obj):
        delete_session(obj)

    def delete_queryset(self, request, queryset):
        for session in queryset:
            delete_session(session)


@admin.register(TrainingSlot)
class TrainingSlotAdmin(admin.ModelAdmin):
    list_display = ("team", "name", "weekday", "start_time", "end_time", "time_zone", "valid_from", "valid_until")
    list_filter = ("team",)


@admin.register(TrainingEvent)
class TrainingEventAdmin(admin.ModelAdmin):
    list_display = ("team", "kind", "name", "start", "cancelled")
    list_filter = ("team", "kind", "cancelled")
