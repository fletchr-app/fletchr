from django.contrib import admin

from .models import End, SessionTombstone, Shot, TrainingSession, VolumeEntry

for model in (TrainingSession, SessionTombstone, End, Shot, VolumeEntry):
    admin.site.register(model)
