from django.urls import path

from . import views

urlpatterns = [
    path("stats/", views.StatsView.as_view()),
    path("stats/positions/", views.PositionsView.as_view()),
    path("teams/<int:team_id>/overview/", views.TeamOverviewView.as_view()),
    path("teams/<int:team_id>/ranking/", views.TeamRankingView.as_view()),
    path("sessions/", views.SessionListView.as_view()),
    path("sessions/<uuid:session_id>/", views.SessionDetailView.as_view()),
    path("sessions/<uuid:session_id>/ends/<uuid:end_id>/", views.EndView.as_view()),
    path("sessions/<uuid:session_id>/volume/<uuid:entry_id>/", views.VolumeEntryView.as_view()),
]
