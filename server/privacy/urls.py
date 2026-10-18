from django.urls import path

from . import views

urlpatterns = [
    path("me/delete-data/", views.DeleteMyDataView.as_view()),
    path("me/delete-account/", views.DeleteMyAccountView.as_view()),
    path("me/export/", views.ExportMyDataView.as_view()),
]
