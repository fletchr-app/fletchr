from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import ClaimCode, Invite, Profile, SocialIdentity, Team, TeamMember, User


class SocialIdentityInline(admin.TabularInline):
    """Attach a Google identity to an account (the person changes how they sign in). The subject is in the server log
    line "Social sign-in refused (no account)" after they tried to sign in: docker compose logs django | grep "Social sign-in refused"."""

    model = SocialIdentity
    extra = 0


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    inlines = [SocialIdentityInline]
    ordering = ["email"]
    list_display = ["email", "is_staff", "is_active", "is_managed"]
    search_fields = ["email"]
    fieldsets = [
        (None, {"fields": ["email", "password"]}),
        ("Permissions", {"fields": ["is_active", "is_staff", "is_superuser", "groups", "user_permissions"]}),
    ]
    add_fieldsets = [(None, {"classes": ["wide"], "fields": ["email", "password1", "password2"]})]


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ["user", "name"]


class TeamMemberInline(admin.TabularInline):
    model = TeamMember
    extra = 0


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    inlines = [TeamMemberInline]


@admin.register(Invite)
class InviteAdmin(admin.ModelAdmin):
    list_display = ["code", "team", "role", "expires_at", "used_by"]
    readonly_fields = ["code"]


@admin.register(ClaimCode)
class ClaimCodeAdmin(admin.ModelAdmin):
    list_display = ["code", "profile", "team", "expires_at"]
    readonly_fields = ["code"]


@admin.register(SocialIdentity)
class SocialIdentityAdmin(admin.ModelAdmin):
    list_display = ["provider", "subject", "user", "created_at"]
    search_fields = ["subject", "user__email"]
    autocomplete_fields = ["user"]
