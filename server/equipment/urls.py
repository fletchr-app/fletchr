from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("bows", views.BowViewSet, basename="bow")
router.register("arrow-sets", views.ArrowSetViewSet, basename="arrow-set")

urlpatterns = [
    *router.urls,
    path("setups/", views.SetupListCreateView.as_view()),
    path("setups/<int:pk>/", views.SetupDetailView.as_view()),
]
