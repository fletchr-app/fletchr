from django.urls import path

from . import views

urlpatterns = [
    path("me/delete-data/", views.DeleteMyDataView.as_view()),
    path("me/delete-account/", views.DeleteMyAccountView.as_view()),
    path("me/export/", views.ExportMyDataView.as_view()),
    path("me/export/media/", views.ExportMyMediaLinkView.as_view()),
    path("me/export/media/file/", views.ExportMyMediaFileView.as_view()),
]
