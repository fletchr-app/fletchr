from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.health),
    path("register/", views.RegisterView.as_view()),
    path("invites/redeem/", views.RedeemInviteView.as_view()),
    path("me/", views.MeView.as_view()),
    path("teams/", views.TeamListView.as_view()),
    path("teams/<int:team_id>/membership/", views.MyMembershipView.as_view()),
    path("teams/<int:team_id>/members/", views.MemberListView.as_view()),
    path("teams/<int:team_id>/members/<int:user_id>/", views.MemberDetailView.as_view()),
    path("teams/<int:team_id>/invites/", views.InviteListCreateView.as_view()),
    path("teams/<int:team_id>/invites/<int:pk>/", views.InviteDetailView.as_view()),
]
