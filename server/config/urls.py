from django.contrib import admin
from django.urls import include, path
from rest_framework.permissions import IsAdminUser
from drf_spectacular.views import SpectacularAPIView
from rest_framework_simplejwt.views import TokenBlacklistView, TokenObtainPairView, TokenRefreshView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("core.urls")),
    path("api/", include("equipment.urls")),
    path("api/", include("targets.urls")),
    path("api/", include("training.urls")),
    path("api/", include("notes.urls")),
    path("api/token/", TokenObtainPairView.as_view()),
    path("api/token/refresh/", TokenRefreshView.as_view()),
    path("api/token/blacklist/", TokenBlacklistView.as_view()),
    path("api/schema/", SpectacularAPIView.as_view(permission_classes=[IsAdminUser])),
]
