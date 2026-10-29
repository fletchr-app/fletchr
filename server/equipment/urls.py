from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("bows", views.BowViewSet, basename="bow")
router.register("arrow-sets", views.ArrowSetViewSet, basename="arrow-set")

urlpatterns = [
    # By uid, before the router, whose detail route would also match a uid.
    path("bows/<uuid:uid>/", views.BowPutView.as_view()),
    path("arrow-sets/<uuid:uid>/", views.ArrowSetPutView.as_view()),
    *router.urls,
    path("setups/", views.SetupListCreateView.as_view()),
    path("setups/<int:pk>/", views.SetupDetailView.as_view()),
]
