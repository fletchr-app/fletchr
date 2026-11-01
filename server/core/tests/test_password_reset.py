import re
from datetime import timedelta

from django.core import mail
from django.utils import timezone

from core.models import PasswordReset, User

OLD = "correct-horse-battery"
NEW = "a-better-password-9"
ASK = "/api/password-reset/"
CONFIRM = "/api/password-reset/confirm/"


def ask(client_for, email="me@x.test"):
    return client_for().post(ASK, {"email": email}, format="json")


def code_in_mail():
    return re.search(r"Your code: (\S+)|Dein Code: (\S+)", mail.outbox[-1].body).group(0).split(": ")[1]


def confirm(client_for, code, email="me@x.test", password=NEW):
    return client_for().post(CONFIRM, {"email": email, "code": code, "new_password": password}, format="json")


def sign_in(client_for, password):
    return client_for().post("/api/token/", {"email": "me@x.test", "password": password}).status_code


def test_the_code_from_the_mail_sets_a_new_password(client_for, make_user):
    make_user("me@x.test")
    assert ask(client_for).status_code == 204
    assert len(mail.outbox) == 1 and mail.outbox[0].to == ["me@x.test"]
    assert confirm(client_for, code_in_mail()).status_code == 204
    assert sign_in(client_for, OLD) == 401
    assert sign_in(client_for, NEW) == 200
    assert "was changed" in mail.outbox[-1].subject  # the notice


def test_the_answer_is_the_same_for_an_unknown_address(client_for, make_user):
    make_user("me@x.test")
    known, unknown = ask(client_for), ask(client_for, "nobody@x.test")
    assert (known.status_code, known.content) == (unknown.status_code, unknown.content)
    assert [m.to for m in mail.outbox] == [["me@x.test"]]


def test_address_is_matched_without_regard_to_case(client_for, make_user):
    make_user("me@x.test")
    ask(client_for, "ME@X.test")
    assert confirm(client_for, code_in_mail(), email="Me@x.TEST").status_code == 204


def test_code_is_forgiving_about_dash_and_case(client_for, make_user):
    make_user("me@x.test")
    ask(client_for)
    assert confirm(client_for, code_in_mail().lower().replace("-", " ")).status_code == 204


def test_a_code_works_once(client_for, make_user):
    make_user("me@x.test")
    ask(client_for)
    code = code_in_mail()
    assert confirm(client_for, code).status_code == 204
    assert confirm(client_for, code, password="another-password-7").status_code == 400
    assert sign_in(client_for, NEW) == 200


def test_a_code_expires_after_an_hour(client_for, make_user):
    make_user("me@x.test")
    ask(client_for)
    PasswordReset.objects.update(created_at=timezone.now() - timedelta(hours=1, minutes=1))
    assert confirm(client_for, code_in_mail()).status_code == 400
    assert sign_in(client_for, OLD) == 200


def test_five_wrong_codes_kill_the_code(client_for, make_user):
    make_user("me@x.test")
    ask(client_for)
    code = code_in_mail()
    for _ in range(5):
        assert confirm(client_for, "WRONGWRONG").status_code == 400
    assert confirm(client_for, code).status_code == 400  # even the right one
    assert sign_in(client_for, OLD) == 200


def test_wrong_code_and_unknown_address_give_the_same_error(client_for, make_user):
    make_user("me@x.test")
    ask(client_for)
    wrong = confirm(client_for, "WRONGWRONG")
    unknown = confirm(client_for, "WRONGWRONG", email="nobody@x.test")
    assert wrong.status_code == unknown.status_code == 400 and wrong.data == unknown.data


def test_a_weak_password_is_refused_and_the_code_stays_good(client_for, make_user):
    make_user("me@x.test")
    ask(client_for)
    code = code_in_mail()
    res = confirm(client_for, code, password="12345678")
    assert res.status_code == 400 and "new_password" in res.data
    assert PasswordReset.objects.get().attempts == 0
    assert confirm(client_for, code).status_code == 204


def test_a_reset_signs_out_every_session(client_for, make_user):
    make_user("me@x.test")
    tokens = client_for().post("/api/token/", {"email": "me@x.test", "password": OLD}).data
    ask(client_for)
    confirm(client_for, code_in_mail())
    assert client_for().post("/api/token/refresh/", {"refresh": tokens["refresh"]}).status_code == 401


def test_only_three_mails_an_hour_per_account(client_for, make_user, settings):
    make_user("me@x.test")
    for i in range(5):
        ask(client_for)
    assert len(mail.outbox) == 3


def test_requests_are_limited_per_client(client_for, make_user):
    make_user("me@x.test")
    assert [ask(client_for, f"n{i}@x.test").status_code for i in range(5)] == [204] * 5
    assert ask(client_for).status_code == 429


def test_placeholders_of_archers_without_account_get_nothing(client_for, db):
    managed = User.objects.create_managed("Anna")
    ask(client_for, managed.email)
    assert mail.outbox == []


def test_changing_the_password_in_the_app_sends_the_notice(client_for, make_user):
    user = make_user("me@x.test")
    res = client_for(user).post("/api/me/password/", {"current_password": OLD, "new_password": NEW}, format="json")
    assert res.status_code == 200
    assert [m.to for m in mail.outbox] == [["me@x.test"]] and "was changed" in mail.outbox[0].subject


def test_the_mail_follows_the_language_of_the_request(client_for, make_user):
    make_user("me@x.test")
    client_for().post(ASK, {"email": "me@x.test"}, format="json", HTTP_ACCEPT_LANGUAGE="de")
    assert "Passwort" in mail.outbox[0].subject


def test_the_mail_has_a_link_when_the_site_is_known(client_for, make_user, settings):
    settings.SITE_URL = "https://fletchr.de"
    make_user("me@x.test")
    ask(client_for)
    link = re.search(r"https://fletchr\.de/reset/(\S+)", mail.outbox[-1].body)
    assert link and link.group(1) == code_in_mail().replace("-", "")
    assert confirm(client_for, link.group(1)).status_code == 204  # the code in the link is the code


def test_the_german_mail_has_the_link_too(client_for, make_user, settings):
    settings.SITE_URL = "https://fletchr.de"
    make_user("me@x.test")
    client_for().post(ASK, {"email": "me@x.test"}, format="json", HTTP_ACCEPT_LANGUAGE="de")
    assert "Tippe auf deinem Handy" in mail.outbox[-1].body
    assert "https://fletchr.de/reset/" in mail.outbox[-1].body


def test_the_mail_has_no_link_without_a_site(client_for, make_user, settings):
    settings.SITE_URL = ""
    make_user("me@x.test")
    ask(client_for)
    assert "http" not in mail.outbox[-1].body
