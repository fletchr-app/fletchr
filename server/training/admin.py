from django.contrib import admin

from .models import End, SessionTombstone, Shot, TrainingEvent, TrainingSession, TrainingSlot, VolumeEntry

for model in (TrainingSession, SessionTombstone, End, Shot, VolumeEntry):
    admin.site.register(model)


@admin.register(TrainingSlot)
class TrainingSlotAdmin(admin.ModelAdmin):
    list_display = ("team", "name", "weekday", "start_time", "end_time", "time_zone", "valid_from", "valid_until")
    list_filter = ("team",)


@admin.register(TrainingEvent)
class TrainingEventAdmin(admin.ModelAdmin):
    list_display = ("team", "kind", "name", "start", "cancelled")
    list_filter = ("team", "kind", "cancelled")
