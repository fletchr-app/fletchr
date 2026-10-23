"""The mails the server sends. Texts follow the language of the request (Accept-Language)."""
import logging
import threading

from django.conf import settings
from django.core.mail import EmailMessage
from django.utils.translation import gettext

log = logging.getLogger(__name__)


def _deliver(message):
    try:
        message.send()
    except Exception:  # a mail that cannot be sent must not show in the answer: it would tell who has an account
        log.exception("Could not send mail %r", message.subject)


def run_in_background(function, *args):
    threading.Thread(target=function, args=args, daemon=True).start()


def send(to, subject, body):
    """Send in the background, so the answer takes as long for an address we know as for one we do not."""
    run_in_background(_deliver, EmailMessage(subject, body, settings.DEFAULT_FROM_EMAIL, [to]))


def send_reset_code(user, code):
    send(
        user.email,
        gettext("Fletchr: reset your password"),
        gettext(
            "Someone asked to reset the password of your Fletchr account.\n\n"
            "Your code: %(code)s\n\n"
            "Type it in the app. It works for one hour. If this was not you, ignore this mail: "
            "your password stays as it is."
        )
        % {"code": f"{code[:4]}-{code[4:]}"},
    )


def send_password_changed(user):
    send(
        user.email,
        gettext("Fletchr: your password was changed"),
        gettext(
            "The password of your Fletchr account was changed just now.\n\n"
            "If this was you, there is nothing to do. If not, set a new password in the app "
            "(Sign in, then Forgot password?) and check who else knows your email password."
        ),
    )
