from django.urls import path

from . import views

urlpatterns = [path("me/delete-data/", views.DeleteMyDataView.as_view())]
