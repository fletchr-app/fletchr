import logging
from unittest import mock

import pytest

from core import social
from core.models import ClaimCode, Invite, Role, SocialIdentity, Team, TeamMember, User

URL = "/api/auth/google/"
PASSWORD = "correct-horse-battery"


@pytest.fixture(autouse=True)
def google_on(settings):
    settings.GOOGLE_CLIENT_IDS = ["web-client.apps.googleusercontent.com"]


@pytest.fixture
def token_of(monkeypatch, db):
    """The verifier answers with the claims registered for the token string."""
    known = {}

    def verify(token):
        if token not in known:
            raise social.SocialError("invalid_token", "bad", 401)
        return known[token]

    monkeypatch.setattr("core.social.verify_google", verify)

    def make(sub="sub-1", email="new@gmail.test", verified=True, name="New Archer"):
        known[sub] = social.Claims(sub=sub, email=email, email_verified=verified, name=name)
        return sub

    return make


def sign_in(client_for, token, code=None):
    body = {"id_token": token, **({"invite_code": code} if code else {})}
    return client_for().post(URL, body, format="json")


def test_a_known_subject_signs_in(client_for, token_of, make_user):
    user = make_user("me@x.test")
    SocialIdentity.objects.create(user=user, provider="google", subject="sub-1")
    res = sign_in(client_for, token_of("sub-1", email="other@gmail.test"))
    assert res.status_code == 200 and res.data["user"]["id"] == user.pk and res.data["access"] and res.data["refresh"]
    assert res.data["user"]["sign_in_providers"] == ["google"]


def test_an_unknown_subject_without_a_code_is_refused_and_nothing_is_created(client_for, token_of, caplog):
    caplog.set_level(logging.INFO, logger="core")
    res = sign_in(client_for, token_of("sub-9", email="new@gmail.test"))
    assert res.status_code == 403 and res.data["code"] == "no_account"
    assert not User.objects.filter(email="new@gmail.test").exists() and not SocialIdentity.objects.exists()
    assert "Social sign-in refused (no account): google sub-9 new@gmail.test" in caplog.text


def test_an_invite_creates_the_account(client_for, token_of, club, invite):
    res = sign_in(client_for, token_of(email="New@Gmail.test", name="Nina Neu"), invite.code)
    assert res.status_code == 201
    user = User.objects.get(email="new@gmail.test")
    assert not user.has_usable_password() and user.profile.name == "Nina Neu"
    assert TeamMember.objects.get(user=user, team=club["a"]).role == Role.ARCHER
    assert SocialIdentity.objects.get(user=user).subject == "sub-1"
    assert res.data["user"]["has_password"] is False and res.data["user"]["sign_in_providers"] == ["google"]
    assert Invite.objects.get(pk=invite.pk).used_by == user


def test_the_name_falls_back_to_the_part_before_the_at(client_for, token_of, invite):
    sign_in(client_for, token_of(email="nina@gmail.test", name=""), invite.code)
    assert User.objects.get(email="nina@gmail.test").profile.name == "nina"


def test_a_claim_code_takes_over_the_managed_profile(client_for, token_of, club):
    managed = User.objects.create_managed("Kid")
    TeamMember.objects.create(team=club["a"], user=managed, role=Role.ARCHER)
    claim = ClaimCode.objects.create(profile=managed, team=club["a"])
    res = sign_in(client_for, token_of(), claim.code)
    assert res.status_code == 201
    user = User.objects.get(email="new@gmail.test")
    assert TeamMember.objects.filter(user=user, team=club["a"]).exists() and not User.objects.filter(pk=managed.pk).exists()


def test_a_bad_code_leaves_nothing_behind(client_for, token_of):
    res = sign_in(client_for, token_of(), "NOSUCHCODE12")
    assert res.status_code == 400 and "invite_code" in res.data
    assert not User.objects.filter(email="new@gmail.test").exists() and not SocialIdentity.objects.exists()


@pytest.mark.parametrize("address", ["new@gmail.test", "NEW@Gmail.test"])
def test_an_address_of_another_account_is_refused_and_logged(client_for, token_of, make_user, invite, caplog, address):
    caplog.set_level(logging.INFO, logger="core")
    make_user("new@gmail.test")
    res = sign_in(client_for, token_of(email=address), invite.code)
    assert res.status_code == 409 and res.data["code"] == "email_taken"
    assert not SocialIdentity.objects.exists()
    assert "Social sign-in refused (email taken)" in caplog.text
    invite.refresh_from_db()
    assert invite.used_at is None


def test_an_unverified_address_is_refused(client_for, token_of, invite):
    res = sign_in(client_for, token_of(verified=False), invite.code)
    assert res.status_code == 400 and res.data["code"] == "email_unverified"
    assert not User.objects.filter(email="new@gmail.test").exists()


def test_an_inactive_account_is_refused(client_for, token_of, make_user):
    user = make_user("me@x.test")
    user.is_active = False
    user.save()
    SocialIdentity.objects.create(user=user, provider="google", subject="sub-1")
    assert sign_in(client_for, token_of("sub-1")).status_code == 401


def test_a_second_request_for_the_same_new_subject_gets_the_first_user(token_of, invite, monkeypatch):
    claims = social.Claims("sub-1", "new@gmail.test", True, "N")
    first, created = social.sign_in("google", claims, invite.code)
    assert created
    real = social._user_of
    calls = iter([None])  # the lookup before the creation does not see the other request yet
    monkeypatch.setattr(social, "_user_of", lambda p, s: next(calls, None) or real(p, s))
    second, created = social.sign_in("google", claims, invite.code)
    assert second == first and not created


def test_the_endpoint_is_off_without_a_client_id(client_for, token_of, settings):
    settings.GOOGLE_CLIENT_IDS = []
    assert sign_in(client_for, token_of()).status_code == 404


def test_the_endpoint_is_throttled(client_for, token_of):
    token = token_of()
    codes = [sign_in(client_for, token).status_code for _ in range(11)]
    assert codes[:10] == [403] * 10 and codes[10] == 429


def test_a_bad_token_is_refused(client_for):
    with mock.patch("google.oauth2.id_token.verify_oauth2_token", side_effect=ValueError("Token used too late")):
        res = sign_in(client_for, "garbage")
    assert res.status_code == 401 and res.data["code"] == "invalid_token"


def test_the_verifier_passes_the_client_ids_and_reads_the_claims(settings):
    info = {"sub": "s", "email": "a@b.test", "email_verified": True, "name": "A"}
    with mock.patch("google.oauth2.id_token.verify_oauth2_token", return_value=info) as verify:
        claims = social.verify_google("t")
    assert verify.call_args.args[2] == settings.GOOGLE_CLIENT_IDS
    assert claims == social.Claims("s", "a@b.test", True, "A")
    with mock.patch("google.oauth2.id_token.verify_oauth2_token", return_value={"sub": "s", "email": "a@b.test"}):
        assert social.verify_google("t").email_verified is False


# --- accounts without a password ---------------------------------------------------------------

@pytest.fixture
def google_user(make_user):
    user = User.objects.create_user("g@gmail.test")
    user.set_unusable_password()
    user.save()
    SocialIdentity.objects.create(user=user, provider="google", subject="sub-g")
    return user


def test_change_password_and_email_are_refused_for_a_google_account(client_for, google_user):
    c = client_for(google_user)
    res = c.post("/api/me/password/", {"current_password": "x", "new_password": "a-better-password-9"}, format="json")
    assert res.status_code == 400 and res.data["code"] == "password_not_set"
    res = c.post("/api/me/email/", {"current_password": "x", "new_email": "z@x.test"}, format="json")
    assert res.status_code == 400 and res.data["code"] == "password_not_set"
    google_user.refresh_from_db()
    assert google_user.email == "g@gmail.test"


def test_a_hybrid_account_keeps_both(client_for, make_user):
    user = make_user("h@x.test")
    SocialIdentity.objects.create(user=user, provider="google", subject="sub-h")
    c = client_for(user)
    assert c.post("/api/me/email/", {"current_password": PASSWORD, "new_email": "h2@x.test"}, format="json").status_code == 200
    me = c.get("/api/me/").data
    assert me["has_password"] is True and me["sign_in_providers"] == ["google"]


def test_a_password_account_has_no_providers(client_for, make_user):
    me = client_for(make_user("p@x.test")).get("/api/me/").data
    assert me["has_password"] is True and me["sign_in_providers"] == []


def test_reset_sends_nothing_to_a_google_address(client_for, google_user, mailoutbox):
    res = client_for().post("/api/password-reset/", {"email": "g@gmail.test"}, format="json")
    assert res.status_code == 204 and len(mailoutbox) == 0


def test_german_texts(client_for, token_of):
    res = client_for().post(URL, {"id_token": token_of()}, format="json", HTTP_ACCEPT_LANGUAGE="de")
    assert "Einladungscode" in res.data["detail"]


# --- privacy -----------------------------------------------------------------------------------

def test_export_and_delete_need_a_fresh_google_token_instead_of_the_password(client_for, token_of, google_user):
    c = client_for(google_user)
    assert c.post("/api/me/export/", {}, format="json").status_code == 400
    assert c.post("/api/me/export/", {"id_token": "unknown"}, format="json").status_code == 400
    token_of("sub-other", email="g@gmail.test")
    assert c.post("/api/me/export/", {"id_token": "sub-other"}, format="json").status_code == 400  # a token of somebody else
    token_of("sub-g", email="g@gmail.test")
    res = c.post("/api/me/export/", {"id_token": "sub-g"}, format="json")
    assert res.status_code == 200
    assert res.data["sign_in"] == [{"provider": "google", "subject": "sub-g", "created_at": mock.ANY}]
    assert "token" not in str(res.data["sign_in"])


def test_deleting_the_account_removes_the_identity(client_for, token_of, google_user):
    token_of("sub-g", email="g@gmail.test")
    res = client_for(google_user).post("/api/me/delete-account/", {"id_token": "sub-g", "confirm": "DELETE ACCOUNT"}, format="json")
    assert res.status_code == 200 and res.data["deleted"]["sign_in_methods"] == 1
    assert not SocialIdentity.objects.exists()
