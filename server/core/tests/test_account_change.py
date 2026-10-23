from core.models import User

OLD = "correct-horse-battery"
NEW = "a-better-password-9"


def sign_in(client_for, email, password):
    return client_for().post("/api/token/", {"email": email, "password": password})


def password(client, **body):
    return client.post("/api/me/password/", {"current_password": OLD, "new_password": NEW, **body}, format="json")


def email(client, **body):
    return client.post("/api/me/email/", {"current_password": OLD, "new_email": "new@x.test", **body}, format="json")


# --- password -------------------------------------------------------------------------------------


def test_a_new_password_replaces_the_old_one(client_for, make_user):
    make_user("me@x.test")
    first = sign_in(client_for, "me@x.test", OLD).data
    res = password(client_for(User.objects.get(email="me@x.test")))
    assert res.status_code == 200 and {"access", "refresh"} <= set(res.data)
    assert sign_in(client_for, "me@x.test", OLD).status_code == 401
    assert sign_in(client_for, "me@x.test", NEW).status_code == 200
    # this session continues with the new tokens
    assert client_for().post("/api/token/refresh/", {"refresh": res.data["refresh"]}).status_code == 200
    # and every earlier session is signed out
    assert client_for().post("/api/token/refresh/", {"refresh": first["refresh"]}).status_code == 401


def test_the_current_password_is_needed(client_for, make_user):
    user = make_user("me@x.test")
    res = password(client_for(user), current_password="not-it")
    assert res.status_code == 400 and "current_password" in res.data
    assert sign_in(client_for, "me@x.test", OLD).status_code == 200


def test_a_weak_or_unchanged_password_is_refused(client_for, make_user):
    user = make_user("me@x.test")
    client = client_for(user)
    for weak in ["short", "12345678901", "me@x.test"]:
        res = password(client, new_password=weak)
        assert res.status_code == 400 and "new_password" in res.data, weak
    res = password(client, new_password=OLD)
    assert res.status_code == 400 and "different" in str(res.data)
    assert sign_in(client_for, "me@x.test", OLD).status_code == 200


def test_changing_the_password_needs_a_login_and_is_limited(client_for, make_user):
    assert password(client_for()).status_code == 401
    client = client_for(make_user("me@x.test"))
    codes = [password(client, current_password="wrong").status_code for _ in range(6)]
    assert codes == [400] * 5 + [429]


# --- email ----------------------------------------------------------------------------------------


def test_a_new_address_becomes_the_login(client_for, make_user):
    user = make_user("me@x.test")
    res = email(client_for(user), new_email="  New@X.test ")
    assert res.status_code == 200 and res.data["email"] == "new@x.test"
    assert sign_in(client_for, "new@x.test", OLD).status_code == 200
    assert sign_in(client_for, "me@x.test", OLD).status_code == 401
    assert client_for(user).get("/api/me/").data["email"] == "new@x.test"


def test_the_address_must_be_free_valid_and_confirmed_with_the_password(client_for, make_user):
    user = make_user("me@x.test")
    make_user("taken@x.test")
    client = client_for(user)
    for taken in ["taken@x.test", "TAKEN@x.test"]:
        res = email(client, new_email=taken)
        assert res.status_code == 400 and "not available" in str(res.data), taken
    assert email(client, new_email="not-an-address").status_code == 400
    assert email(client, current_password="wrong").status_code == 400
    assert User.objects.get(pk=user.pk).email == "me@x.test"


def test_keeping_the_same_address_is_fine_and_changes_need_a_login(client_for, make_user):
    user = make_user("me@x.test")
    assert email(client_for(user), new_email="me@x.test").status_code == 200
    assert email(client_for()).status_code == 401
