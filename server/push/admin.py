from django.contrib import admin

from .models import Device


@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = ["user", "app_id", "language", "created_at", "last_seen_at"]
    fields = ["user", "app_id", "language", "created_at", "last_seen_at"]  # the token is not shown
    readonly_fields = ["created_at", "last_seen_at"]
