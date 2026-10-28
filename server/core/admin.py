from django import forms
from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.core.exceptions import PermissionDenied
from django.http import HttpResponseRedirect
from django.template.response import TemplateResponse
from django.urls import path, reverse

from . import transfer
from .models import ClaimCode, Invite, Profile, SocialIdentity, Team, TeamMember, User


class TransferForm(forms.Form):
    target = forms.ModelChoiceField(queryset=User.objects.filter(is_active=True, is_managed=False), label="Move the data to")


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
    actions = ["transfer_data"]

    @admin.action(description="Transfer data to another account...", permissions=["transfer"])
    def transfer_data(self, request, queryset):
        if queryset.count() != 1:
            self.message_user(request, "Select exactly one account to transfer from.", messages.ERROR)
            return None
        return HttpResponseRedirect(reverse("admin:core_user_transfer", args=[queryset.get().pk]))

    def has_transfer_permission(self, request):
        return request.user.is_superuser

    def get_urls(self):
        return [path("<int:source_id>/transfer/", self.admin_site.admin_view(self.transfer_view), name="core_user_transfer")] + super().get_urls()

    def transfer_view(self, request, source_id):
        """Pick the target, see the dry run, then confirm. Nothing moves before the confirm button."""
        if not self.has_transfer_permission(request):
            raise PermissionDenied
        source = User.objects.get(pk=source_id)
        form = TransferForm(request.POST or None)
        context = {**self.admin_site.each_context(request), "source": source, "form": form, "title": "Transfer data", "opts": self.model._meta}
        if request.method == "POST" and form.is_valid():
            target = form.cleaned_data["target"]
            context["target"] = target
            try:
                if "confirm" in request.POST:
                    report = transfer.transfer_account(source, target)
                    total = sum(report.moved.values()) + report.memberships_moved
                    self.message_user(request, f"Moved {total} items from {source.email} to {target.email}. {source.email} is deactivated.", messages.SUCCESS)
                    return HttpResponseRedirect(reverse("admin:core_user_change", args=[source.pk]))
                context["report"] = transfer.transfer_account(source, target, dry_run=True)
            except transfer.TransferError as e:
                context["error"] = str(e)
        return TemplateResponse(request, "admin/core/transfer.html", context)


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
