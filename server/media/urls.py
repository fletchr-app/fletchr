from django.urls import path

from . import views

urlpatterns = [
    path("media/", views.MediaListView.as_view()),
    path("media/<uuid:media_id>/", views.MediaDetailView.as_view()),
    path("media/<uuid:media_id>/file/", views.MediaFileView.as_view()),
    path("media/<uuid:media_id>/thumbnail/", views.MediaThumbnailView.as_view()),
]
