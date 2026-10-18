from django.contrib import admin

from .models import End, Shot, TrainingSession, VolumeEntry

for model in (TrainingSession, End, Shot, VolumeEntry):
    admin.site.register(model)
