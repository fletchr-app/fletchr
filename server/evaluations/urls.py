from django.urls import path
from rest_framework.routers import SimpleRouter

from . import views

router = SimpleRouter()
router.register("evaluations", views.EvaluationViewSet, basename="evaluation")

urlpatterns = [
    path("teams/<int:team_id>/evaluation-templates/", views.TemplateListView.as_view()),
    path("evaluation-templates/<int:pk>/", views.TemplateDetailView.as_view()),
    *router.urls,
]
