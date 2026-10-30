from django.urls import path

from . import schedule_views, views

urlpatterns = [
    path("stats/", views.StatsView.as_view()),
    path("stats/positions/", views.PositionsView.as_view()),
    path("stats/arrows/", views.ArrowStatsView.as_view()),
    path("teams/<int:team_id>/overview/", views.TeamOverviewView.as_view()),
    path("teams/<int:team_id>/ranking/", views.TeamRankingView.as_view()),
    path("sessions/", views.SessionListView.as_view()),
    path("sessions/gone/", views.SessionTombstoneListView.as_view()),
    path("sessions/<uuid:session_id>/", views.SessionDetailView.as_view()),
    path("sessions/<uuid:session_id>/ends/<uuid:end_id>/", views.EndView.as_view()),
    path("sessions/<uuid:session_id>/volume/<uuid:entry_id>/", views.VolumeEntryView.as_view()),
    path("slots/", schedule_views.SlotListView.as_view()),
    path("slots/<uuid:slot_id>/", schedule_views.SlotDetailView.as_view()),
    path("events/agenda/", schedule_views.AgendaView.as_view()),
    path("events/mine/", schedule_views.EventsMineView.as_view()),
    path("events/<uuid:event_id>/", schedule_views.EventDetailView.as_view()),
    path("events/<uuid:event_id>/archers/", schedule_views.EventArchersView.as_view()),
    path("events/<uuid:event_id>/attach/", schedule_views.EventAttachView.as_view()),
]
