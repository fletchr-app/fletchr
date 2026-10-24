import secrets
import uuid
from datetime import timedelta

from django.conf import settings
from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone

INVITE_LIFETIME = timedelta(days=14)
# Codes are read aloud, typed from a message and copied by hand, so no look-alikes: no 0 and O, no 1, I and L.
# 31 symbols; 12 of them are about 59 bits, plenty for a code that is single-use, short-lived and rate-limited.
INVITE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
CODE_LENGTH = 12


def normalize_code(raw):
    """What was typed, as a code is stored: upper case, without spaces, dashes or other separators."""
    return "".join(c for c in raw.upper() if c.isalnum())


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra):
        if not email:
            raise ValueError("An email address is required")
        user = self.model(email=self.normalize_email(email).lower(), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_managed(self, name):
        """A profile a coach keeps for an archer without an account: nobody can sign in as it."""
        user = self.model(email=f"managed-{uuid.uuid4().hex}@managed.invalid", is_managed=True, is_active=False)
        user.set_unusable_password()
        user.save(using=self._db)
        user.profile.name = name
        user.profile.save()
        return user

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        return self.create_user(email, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    email = models.EmailField(unique=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    # A profile that a coach keeps for an archer without an account. It has no password and an address
    # that cannot receive mail; when the archer joins, they take it over (see core/claims.py).
    is_managed = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    USERNAME_FIELD = "email"
    objects = UserManager()

    def __str__(self):
        return self.email


def age_in_years(born, today=None):
    """Whole years since `born`, or None when it is not known."""
    if born is None:
        return None
    today = today or timezone.localdate()
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


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
    # Video of an archer under 18 needs the consent of the parents. A coach records that it was given.
    video_consent_at = models.DateTimeField(null=True, blank=True)
    video_consent_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")

    def __str__(self):
        return self.name or self.user.email

    @property
    def age(self):
        return age_in_years(self.date_of_birth)

    @property
    def video_allowed(self) -> bool:
        """Adults, and archers whose age is not known (nothing says they are young), may be filmed; archers under 18 need consent on record."""
        return self.age is None or self.age >= 18 or self.video_consent_at is not None


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
    # A coach or admin who also trains. Off by default: only when the person turns it on do the other
    # coaches of the team see their sessions, as they see the archers'.
    also_shoots = models.BooleanField(default=False)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["team", "user"], name="one_membership_per_team")]

    def __str__(self):
        return f"{self.user} in {self.team} ({self.role})"


def new_invite_code():
    return "".join(secrets.choice(INVITE_ALPHABET) for _ in range(CODE_LENGTH))


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


class ClaimCode(models.Model):
    """Single-use code with which an archer takes over a profile that a coach keeps for them."""

    profile = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="claim_codes")
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="claim_codes")
    code = models.CharField(max_length=20, unique=True, default=new_invite_code)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(default=default_invite_expiry)

    @property
    def is_usable(self):
        return self.expires_at > timezone.now()

    def __str__(self):
        return f"{self.code} -> {self.profile} in {self.team}"


class PasswordReset(models.Model):
    """A code mailed to someone who forgot their password. Only a hash of the code is kept."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="password_resets")
    code_hash = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)
    attempts = models.PositiveSmallIntegerField(default=0, help_text="Wrong codes typed for this account since it was created")

    def __str__(self):
        return f"reset for {self.user} ({self.created_at:%Y-%m-%d %H:%M})"
