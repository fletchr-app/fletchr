"""Forgotten password: a code goes to the email address, with it the person sets a new password."""
import hmac
import secrets
from datetime import timedelta

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import F
from django.utils import timezone
from django.utils.crypto import salted_hmac
from django.utils.translation import gettext
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from . import mail
from .models import INVITE_ALPHABET, PasswordReset, User, normalize_code

RESET_LIFETIME = timedelta(hours=1)
MAX_WRONG_CODES = 5  # then the codes of that account are dead and a new one has to be asked for
MAX_REQUESTS_PER_HOUR = 3  # per account, whoever asks: nobody can fill a mailbox
RESET_CODE_LENGTH = 8  # about 40 bits, with five tries and an hour: out of reach


class ResetError(Exception):
    def __init__(self, field, messages):
        super().__init__(field)
        self.field = field
        self.messages = messages if isinstance(messages, list) else [messages]


def _hash(code):
    return salted_hmac("fletchr.password-reset", normalize_code(code), algorithm="sha256").hexdigest()


def _can_reset(user):
    return user.is_active and user.has_usable_password()  # not the placeholders of archers without an account


def _live(user):
    return PasswordReset.objects.filter(user=user, created_at__gt=timezone.now() - RESET_LIFETIME, attempts__lt=MAX_WRONG_CODES)


def request_reset(email):
    """Mail a code if the address has an account. Says nothing either way."""
    user = User.objects.filter(email__iexact=email.strip()).first()
    if user is None or not _can_reset(user):
        return
    if PasswordReset.objects.filter(user=user, created_at__gt=timezone.now() - timedelta(hours=1)).count() >= MAX_REQUESTS_PER_HOUR:
        return
    code = "".join(secrets.choice(INVITE_ALPHABET) for _ in range(RESET_CODE_LENGTH))
    PasswordReset.objects.create(user=user, code_hash=_hash(code))
    mail.send_reset_code(user, code)


def confirm_reset(email, code, new_password):
    """Set the new password. Wrong address, wrong code and expired code all give the same error."""
    invalid = ResetError("code", gettext("Invalid or expired code"))
    user = User.objects.filter(email__iexact=email.strip()).first()
    if user is None or not _can_reset(user):
        raise invalid
    resets = list(_live(user))
    wanted = _hash(code)
    if not any(hmac.compare_digest(r.code_hash, wanted) for r in resets):
        PasswordReset.objects.filter(pk__in=[r.pk for r in resets]).update(attempts=F("attempts") + 1)
        raise invalid
    try:
        validate_password(new_password, user)
    except DjangoValidationError as e:
        raise ResetError("new_password", list(e.messages))
    with transaction.atomic():
        user.set_password(new_password)
        user.save(update_fields=["password"])
        for token in OutstandingToken.objects.filter(user=user):
            BlacklistedToken.objects.get_or_create(token=token)
        user.password_resets.all().delete()
        user.push_devices.all().delete()  # every phone is signed out
    mail.send_password_changed(user)
