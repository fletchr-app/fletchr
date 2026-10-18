import secrets
import string
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

INVITE_LIFETIME = timedelta(days=14)
INVITE_ALPHABET = string.ascii_uppercase + string.digits


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra):
        if not email:
            raise ValueError("An email address is required")
        user = self.model(email=self.normalize_email(email).lower(), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        return self.create_user(email, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    USERNAME_FIELD = "email"
    objects = UserManager()

    def __str__(self):
        return self.email


class Profile(models.Model):
    class Hand(models.TextChoices):
        RIGHT = "right"
        LEFT = "left"

    class Units(models.TextChoices):
        METRIC = "metric"
        IMPERIAL = "imperial"

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    name = models.CharField(max_length=150, blank=True)
    dominant_hand = models.CharField(max_length=5, choices=Hand.choices, blank=True)
    dominant_eye = models.CharField(max_length=5, choices=Hand.choices, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    units = models.CharField(max_length=8, choices=Units.choices, default=Units.METRIC)

    def __str__(self):
        return self.name or self.user.email


@receiver(post_save, sender=settings.AUTH_USER_MODEL)
def create_profile(sender, instance, created, **kwargs):
    if created:
        Profile.objects.create(user=instance)


class Role(models.TextChoices):
    ARCHER = "archer"
    COACH = "coach"
    ADMIN = "admin"


# Roles that may see the training data of the archers in a team.
COACH_ROLES = (Role.COACH, Role.ADMIN)


class Team(models.Model):
    name = models.CharField(max_length=150)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class TeamMember(models.Model):
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField(max_length=10, choices=Role.choices)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["team", "user"], name="one_membership_per_team")]

    def __str__(self):
        return f"{self.user} in {self.team} ({self.role})"


def new_invite_code():
    return "".join(secrets.choice(INVITE_ALPHABET) for _ in range(10))


def default_invite_expiry():
    return timezone.now() + INVITE_LIFETIME


class Invite(models.Model):
    """Single-use code that adds someone to a team with the given role."""

    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="invites")
    role = models.CharField(max_length=10, choices=Role.choices, default=Role.ARCHER)
    code = models.CharField(max_length=20, unique=True, default=new_invite_code)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(default=default_invite_expiry)
    used_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    used_at = models.DateTimeField(null=True, blank=True)

    @property
    def is_usable(self):
        return self.used_at is None and self.expires_at > timezone.now()

    def __str__(self):
        return f"{self.code} -> {self.team} ({self.role})"
