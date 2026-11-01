"""Firebase Cloud Messaging over its HTTP v1 API, with the libraries the server has anyway (google-auth, requests).

Push is on only when `DJANGO_FCM_CREDENTIALS` names a readable service-account key. `client()` is the one place that
touches Google; the tests replace it.
"""
import logging

from django.conf import settings

log = logging.getLogger(__name__)

SCOPE = "https://www.googleapis.com/auth/firebase.messaging"
TIMEOUT = (2, 3)  # connect, read: a slow Google must not hold up saving a note
OK, GONE, FAILED = "ok", "gone", "failed"
# What FCM answers when a token can never work again: the app was uninstalled, or the token belongs to another Firebase project.
GONE_CODES = {"UNREGISTERED", "SENDER_ID_MISMATCH"}

_clients: dict[str, tuple | None] = {}


def client():
    """`(session, project_id)` for the configured key, or None when push is off or the key cannot be used."""
    path = settings.FCM_CREDENTIALS
    if not path:
        return None
    if path not in _clients:
        try:
            from google.auth.transport.requests import AuthorizedSession
            from google.oauth2 import service_account

            credentials = service_account.Credentials.from_service_account_file(path, scopes=[SCOPE])
            _clients[path] = (AuthorizedSession(credentials, refresh_timeout=3), credentials.project_id)
        except Exception:
            log.exception("Push is off: cannot use the key %s", path)
            _clients[path] = None
    return _clients[path]


def available():
    return client() is not None


def send(token, message):
    """Send one message to one phone. Returns OK, GONE (delete the device) or FAILED. Never raises."""
    found = client()
    if found is None:
        return FAILED
    session, project = found
    try:
        answer = session.post(
            f"https://fcm.googleapis.com/v1/projects/{project}/messages:send",
            json={"message": {"token": token, **message}},
            timeout=TIMEOUT,
        )
    except Exception:
        log.exception("Push to a device failed")
        return FAILED
    if answer.status_code == 200:
        return OK
    try:
        error = answer.json().get("error", {})
    except ValueError:
        error = {}
    codes = {d.get("errorCode") for d in error.get("details", []) if isinstance(d, dict)}
    if codes & GONE_CODES or (answer.status_code == 404 and error.get("status") == "NOT_FOUND"):
        return GONE
    if answer.status_code in (401, 403):
        log.error("Firebase refused the credentials (%s): check DJANGO_FCM_CREDENTIALS", answer.status_code)
    elif answer.status_code == 400:
        log.error("Firebase refused a message: %s", error.get("message", ""))
    else:
        log.warning("Firebase answered %s", answer.status_code)
    return FAILED
