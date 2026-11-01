from django.urls import path

from . import views

urlpatterns = [
    path("devices/", views.DeviceView.as_view()),
]
