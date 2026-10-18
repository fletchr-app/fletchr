from django.urls import path

from . import views

urlpatterns = [path("faces/", views.face_list)]
