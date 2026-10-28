from pathlib import Path

from babel.messages.extract import extract_from_dir
from babel.messages.pofile import read_po

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "locale" / "de" / "LC_MESSAGES" / "django.po"


def post(client, url, body, language=None):
    extra = {"HTTP_ACCEPT_LANGUAGE": language} if language else {}
    return client.post(url, body, format="json", **extra)


def test_errors_are_in_german_when_the_app_asks_for_it(client_for, make_user):
    client = client_for(make_user("me@x.test"))
    body = {"current_password": "wrong", "new_password": "a-better-password-9"}
    assert "Falsches Passwort" in str(post(client, "/api/me/password/", body, "de").data)
    assert "Falsches Passwort" in str(post(client, "/api/me/password/", body, "de-DE,de;q=0.9,en;q=0.8").data)
    assert "Wrong password" in str(post(client, "/api/me/password/", body, "en").data)
    assert "Wrong password" in str(post(client, "/api/me/password/", body).data)  # no header: English
    assert "Wrong password" in str(post(client, "/api/me/password/", body, "fr").data)  # a language we do not have


def test_the_built_in_messages_of_django_and_the_framework_follow(client_for, make_user):
    client = client_for(make_user("me@x.test"))
    res = post(client, "/api/me/email/", {}, "de")
    assert res.status_code == 400 and "Dieses Feld ist zwingend erforderlich" in str(res.data)
    weak = post(client, "/api/me/password/", {"current_password": "correct-horse-battery", "new_password": "12345678901"}, "de")
    assert "new_password" in weak.data and "Passwort" in str(weak.data["new_password"])


def test_messages_with_values_and_the_permission_texts(client_for, club):
    admin_client = client_for(club["admin"])
    res = post(admin_client, f"/api/teams/{club['a'].pk}/members/{club['admin'].pk}/", {}, "de")  # wrong method: 405
    assert res.status_code == 405
    coach = client_for(club["archer1"])
    denied = coach.post(f"/api/teams/{club['a'].pk}/invites/", {}, format="json", HTTP_ACCEPT_LANGUAGE="de")
    assert denied.status_code == 403 and "Nur Team-Admins" in str(denied.data)


def test_the_catalog_is_complete():
    with open(CATALOG, "rb") as f:
        catalog = read_po(f, locale="de")
    translated = {m.id: m.string for m in catalog if m.id}
    assert all(translated.values()), "an untranslated text"
    assert not [m.id for m in catalog if m.id and "fuzzy" in m.flags]
    # every text the code asks for is in the catalog (run specs/steering/i18n.md's update steps after adding one)
    used = {
        message
        for path, _line, message, _comments, _context in extract_from_dir(str(ROOT), method_map=[("**.py", "python")], keywords={"gettext": None})
        if isinstance(message, str) and "/tests/" not in path and "/migrations/" not in path
    }
    assert used - set(translated) == set(), "texts missing in locale/de/LC_MESSAGES/django.po"
    assert set(translated) - used == set(), "texts in the catalog that no code asks for any more"
