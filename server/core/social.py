"""Sign in with a provider (Google now, Apple later). One verifier per provider turns a token into `Claims`;
`sign_in` is the same for all of them (ADR 0005: accounts are separate, an unknown subject never signs in to an existing account)."""

import logging
from dataclasses import dataclass

from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils.translation import gettext

from . import claims as claim_codes
from .models import SocialIdentity, User

logger = logging.getLogger("core")

GOOGLE = "google"


class SocialError(Exception):
    """`code` is what the app reacts to; `status` the HTTP status."""

    def __init__(self, code, message, status=400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


@dataclass
class Claims:
    sub: str
    email: str
    email_verified: bool
    name: str


def enabled(provider=GOOGLE) -> bool:
    return bool(settings.GOOGLE_CLIENT_IDS) if provider == GOOGLE else False


def verify_google(id_token) -> Claims:
    """Check signature, expiry, issuer and audience of a Google ID token (the library fetches and caches Google's public certificates)."""
    from google.auth.transport import requests
    from google.oauth2 import id_token as google_id_token

    try:
        info = google_id_token.verify_oauth2_token(id_token, requests.Request(), settings.GOOGLE_CLIENT_IDS)
    except ValueError as e:  # wrong audience, issuer, signature or expired
        logger.info("Google ID token refused: %s", e)
        raise SocialError("invalid_token", gettext("Google sign-in failed. Please try again."), 401)
    except Exception:  # certificates not reachable and the like
        logger.exception("Google ID token could not be checked")
        raise SocialError("invalid_token", gettext("Google sign-in failed. Please try again."), 401)
    if not info.get("sub"):
        raise SocialError("invalid_token", gettext("Google sign-in failed. Please try again."), 401)
    return Claims(sub=info["sub"], email=info.get("email", ""), email_verified=bool(info.get("email_verified")), name=info.get("name", ""))


def _refuse(reason, provider, claims, error):
    # The admin gets the subject for the "attach" path from this line (see specs/design/accounts.md).
    logger.info("Social sign-in refused (%s): %s %s %s", reason, provider, claims.sub, claims.email)
    raise error


def _user_of(provider, subject):
    identity = SocialIdentity.objects.select_related("user").filter(provider=provider, subject=subject).first()
    return identity.user if identity else None


def _existing(user):
    if not user.is_active:
        raise SocialError("invalid_token", gettext("This account cannot sign in."), 401)
    return user, False


def sign_in(provider, claims, invite_code="") -> tuple[User, bool]:
    """The user of this identity, or a new account when a valid code comes with it. Returns (user, created)."""
    user = _user_of(provider, claims.sub)
    if user is not None:
        return _existing(user)
    if not invite_code:
        _refuse("no account", provider, claims, SocialError("no_account", gettext("There is no account for this Google sign-in yet. Register with your invite code."), 403))
    if not claims.email or not claims.email_verified:
        _refuse("email not verified", provider, claims, SocialError("email_unverified", gettext("Google did not confirm your email address."), 400))
    email = claims.email.strip().lower()
    taken = SocialError("email_taken", gettext("This email address already has an account. Ask an admin to connect it with your Google sign-in."), 409)
    if User.objects.filter(email__iexact=email).exists():
        _refuse("email taken", provider, claims, taken)
    try:
        with transaction.atomic():  # a bad code rolls back everything
            user = User.objects.create_user(email)
            user.set_unusable_password()
            user.save(update_fields=["password"])
            user.profile.name = claims.name.strip()[:150] or email.split("@")[0]
            user.profile.save()
            SocialIdentity.objects.create(user=user, provider=provider, subject=claims.sub)
            claim_codes.redeem_code(invite_code, user)
    except IntegrityError:
        # Two requests with the same new subject: the other one won.
        winner = _user_of(provider, claims.sub)
        if winner is None:
            _refuse("email taken", provider, claims, taken)
        return _existing(winner)
    return user, True
