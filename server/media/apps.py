from django.apps import AppConfig


class MediaConfig(AppConfig):
    name = "media"

    def ready(self):
        from . import signals  # noqa: F401
