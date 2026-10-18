from django.contrib import admin

from .models import ArrowSet, ArrowSetRevision, Bow, BowRevision, Setup

for model in (Bow, BowRevision, ArrowSet, ArrowSetRevision, Setup):
    admin.site.register(model)
