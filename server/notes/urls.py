from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("notes", views.NoteViewSet, basename="note")

urlpatterns = [
    # Before the router, whose detail route would read "teams" as a note id.
    path("notes/teams/", views.writable_teams),
    *router.urls,
]
