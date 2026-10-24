from django.contrib import admin

from .models import Media


@admin.register(Media)
class MediaAdmin(admin.ModelAdmin):
    list_display = ("id", "owner", "kind", "taken_at", "size")
    list_filter = ("kind",)
    readonly_fields = ("id", "owner", "uploaded_by", "session", "kind", "file", "thumbnail", "size", "taken_at", "created_at")
