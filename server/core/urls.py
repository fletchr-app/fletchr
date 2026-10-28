from django.urls import path

from . import views

urlpatterns = [
    path("health/", views.health),
    path("register/", views.RegisterView.as_view()),
    path("auth/google/", views.GoogleSignInView.as_view()),
    path("invites/redeem/", views.RedeemInviteView.as_view()),
    path("codes/preview/", views.CodePreviewView.as_view()),
    path("claims/redeem/", views.RedeemClaimView.as_view()),
    path("archers/<int:user_id>/", views.ArcherView.as_view()),
    path("archers/<int:user_id>/video-consent/", views.VideoConsentView.as_view()),
    path("password-reset/", views.PasswordResetRequestView.as_view()),
    path("password-reset/confirm/", views.PasswordResetConfirmView.as_view()),
    path("me/", views.MeView.as_view()),
    path("me/avatar/", views.MyAvatarView.as_view()),
    path("users/<int:user_id>/avatar/", views.AvatarFileView.as_view()),
    path("me/password/", views.ChangePasswordView.as_view()),
    path("me/email/", views.ChangeEmailView.as_view()),
    path("teams/", views.TeamListView.as_view()),
    path("teams/<int:team_id>/", views.TeamDetailView.as_view()),
    path("teams/<int:team_id>/membership/", views.MyMembershipView.as_view()),
    path("teams/<int:team_id>/members/", views.MemberListView.as_view()),
    path("teams/<int:team_id>/members/<int:user_id>/", views.MemberDetailView.as_view()),
    path("teams/<int:team_id>/archers/", views.ManagedArcherListView.as_view()),
    path("teams/<int:team_id>/archers/<int:user_id>/", views.ManagedArcherDetailView.as_view()),
    path("teams/<int:team_id>/archers/<int:user_id>/avatar/", views.ManagedArcherAvatarView.as_view()),
    path("teams/<int:team_id>/archers/<int:user_id>/claim-code/", views.ClaimCodeView.as_view()),
    path("teams/<int:team_id>/invites/", views.InviteListCreateView.as_view()),
    path("teams/<int:team_id>/invites/<int:pk>/", views.InviteDetailView.as_view()),
]
