"""Push notifications: who gets one, what it says, and that nothing breaks when Firebase does (specs/design/push-notifications.md)."""
import json
from datetime import timedelta

import pytest
from django.db import transaction
from django.utils import timezone

from core.models import Invite, Role, TeamMember, User
from push import fcm, notify
from push.models import Device

TOKEN = "token-of-archer1-phone"


class Answer:
    def __init__(self, status=200, body=None):
        self.status_code = status
        self._body = body or {}

    def json(self):
        return self._body


class FakeSession:
    """Stands for the HTTP session to Firebase: remembers what was sent, answers what the test says."""

    def __init__(self):
        self.sent = []
        self.answers = {}  # token -> Answer or an exception to raise
        self.default = Answer()

    def post(self, url, json, timeout):
        self.sent.append(json["message"])
        answer = self.answers.get(json["message"]["token"], self.default)
        if isinstance(answer, Exception):
            raise answer
        return answer


@pytest.fixture
def firebase(monkeypatch, settings):
    settings.FCM_CREDENTIALS = "/run/secrets/fcm.json"
    session = FakeSession()
    monkeypatch.setattr(fcm, "client", lambda: (session, "fletchr-test"))
    return session


REAL_ON_COMMIT = transaction.on_commit


@pytest.fixture(autouse=True)
def push_at_once(monkeypatch):
    """A test runs in a transaction that never commits, so what `on_commit` waits for would never run: run it at once."""
    monkeypatch.setattr(transaction, "on_commit", lambda function: function())


@pytest.fixture
def api(client_for, club):
    return lambda who: client_for(club[who])


@pytest.fixture
def phone(club):
    return Device.objects.create(user=club["archer1"], token=TOKEN, app_id="de.fletchr.app", language="en")


def write_note(api, club, who="coach", visibility="shared", **extra):
    body = {"archer": club["archer1"].pk, "body": "Secret words about the bow arm", "visibility": visibility, **extra}
    return api(who).post("/api/notes/", body, format="json")


def types(firebase):
    return [m["data"]["type"] for m in firebase.sent]


# --- push off ----------------------------------------------------------------------------------------


def test_without_a_key_push_is_off(api, club, settings):
    settings.FCM_CREDENTIALS = ""
    assert api("archer1").get("/api/health/").data["push"] is False
    assert api("archer1").put("/api/devices/", {"token": TOKEN}, format="json").status_code == 404
    assert api("archer1").delete("/api/devices/", {"token": TOKEN}, format="json").status_code == 404


def test_a_key_that_cannot_be_read_acts_as_off(settings, tmp_path):
    settings.FCM_CREDENTIALS = str(tmp_path / "missing.json")
    fcm._clients.clear()
    assert fcm.available() is False
    fcm._clients.clear()


def test_with_a_key_health_says_so(api, firebase):
    assert api("archer1").get("/api/health/").data["push"] is True


def test_a_shared_note_still_saves_with_push_off(api, club, settings, phone):
    settings.FCM_CREDENTIALS = ""
    assert write_note(api, club).status_code == 201


# --- the endpoints -----------------------------------------------------------------------------------


def test_registering_a_phone(api, club, firebase):
    res = api("archer1").put("/api/devices/", {"token": TOKEN, "app_id": "de.fletchr.app", "language": "de"}, format="json")
    assert res.status_code == 201
    device = Device.objects.get(token=TOKEN)
    assert (device.user, device.app_id, device.language) == (club["archer1"], "de.fletchr.app", "de")


def test_registering_twice_updates_and_does_not_duplicate(api, club, firebase, phone):
    Device.objects.filter(pk=phone.pk).update(last_seen_at=timezone.now() - timedelta(days=3))
    res = api("archer1").put("/api/devices/", {"token": TOKEN, "language": "de"}, format="json")
    assert res.status_code == 200
    device = Device.objects.get()
    assert device.language == "de" and device.last_seen_at > timezone.now() - timedelta(minutes=1)


def test_an_unknown_language_becomes_english(api, club, firebase):
    api("archer1").put("/api/devices/", {"token": TOKEN, "language": "xx-YY"}, format="json")
    assert Device.objects.get().language == "en"


def test_a_token_moves_to_the_person_who_signs_in_on_that_phone(api, club, firebase, phone):
    api("coach").put("/api/devices/", {"token": TOKEN}, format="json")
    assert Device.objects.get().user == club["coach"]


def test_a_new_token_replaces_the_old_one_of_the_same_person(api, club, firebase, phone):
    api("archer1").put("/api/devices/", {"token": "new-token", "replaces": TOKEN}, format="json")
    assert list(Device.objects.values_list("token", flat=True)) == ["new-token"]


def test_replaces_cannot_delete_the_phone_of_somebody_else(api, club, firebase, phone):
    api("coach").put("/api/devices/", {"token": "coach-token", "replaces": TOKEN}, format="json")
    assert Device.objects.filter(token=TOKEN, user=club["archer1"]).exists()


def test_removing_my_phone(api, club, firebase, phone):
    assert api("archer1").delete("/api/devices/", {"token": TOKEN}, format="json").status_code == 204
    assert not Device.objects.exists()


def test_removing_the_phone_of_somebody_else_is_answered_the_same_and_changes_nothing(api, club, firebase, phone):
    assert api("coach").delete("/api/devices/", {"token": TOKEN}, format="json").status_code == 204
    assert api("coach").delete("/api/devices/", {"token": "unknown"}, format="json").status_code == 204
    assert Device.objects.filter(token=TOKEN).exists()


def test_the_endpoints_need_a_sign_in(client_for, firebase):
    assert client_for().put("/api/devices/", {"token": TOKEN}, format="json").status_code == 401
    assert client_for().delete("/api/devices/", {"token": TOKEN}, format="json").status_code == 401


def test_a_person_keeps_at_most_ten_phones(api, club, firebase):
    for i in range(12):
        api("archer1").put("/api/devices/", {"token": f"t{i}"}, format="json")
    assert Device.objects.filter(user=club["archer1"]).count() == Device.MAX_DEVICES


# --- notes -------------------------------------------------------------------------------------------


def test_a_shared_note_notifies_every_phone_of_the_archer(api, club, firebase, phone):
    Device.objects.create(user=club["archer1"], token="second", language="de")
    assert write_note(api, club).status_code == 201
    assert sorted(m["token"] for m in firebase.sent) == ["second", TOKEN]
    assert types(firebase) == ["note", "note"]


@pytest.mark.parametrize("visibility", ["private", "coach_only"])
def test_a_note_the_archer_cannot_read_never_notifies(api, club, firebase, phone, visibility):
    who = "coach"
    res = write_note(api, club, who, visibility=visibility)
    if res.status_code == 201:
        note_id = res.data["id"]
        api(who).patch(f"/api/notes/{note_id}/", {"body": "Edited"}, format="json")
    assert firebase.sent == []


def test_a_private_note_of_the_archer_about_themself_never_notifies(api, club, firebase, phone):
    res = api("archer1").post("/api/notes/", {"archer": club["archer1"].pk, "body": "Mine"}, format="json")
    assert res.status_code == 201
    assert firebase.sent == []


def test_a_coach_only_note_that_is_shared_later_notifies_once(api, club, firebase, phone):
    note_id = write_note(api, club, visibility="coach_only").data["id"]
    assert firebase.sent == []
    api("coach").patch(f"/api/notes/{note_id}/", {"visibility": "shared"}, format="json")
    assert len(firebase.sent) == 1
    api("coach").patch(f"/api/notes/{note_id}/", {"body": "Edited"}, format="json")
    assert len(firebase.sent) == 1  # an edit of a note the archer reads already is no news


def test_a_shared_note_that_is_withdrawn_and_shared_again_notifies_again(api, club, firebase, phone):
    note_id = write_note(api, club).data["id"]
    api("coach").patch(f"/api/notes/{note_id}/", {"visibility": "coach_only"}, format="json")
    api("coach").patch(f"/api/notes/{note_id}/", {"visibility": "shared"}, format="json")
    assert len(firebase.sent) == 2


def test_the_offline_queue_repeating_a_put_notifies_once(api, club, firebase, phone):
    uid = "9b1c3a7e-5d0f-4c52-8e44-0a1b2c3d4e5f"
    body = {"archer": club["archer1"].pk, "body": "From the field", "visibility": "shared"}
    assert api("coach").put(f"/api/notes/{uid}/", body, format="json").status_code == 201
    assert api("coach").put(f"/api/notes/{uid}/", body, format="json").status_code == 200
    assert len(firebase.sent) == 1


def test_a_person_who_turned_notes_off_gets_nothing(api, club, firebase, phone):
    club["archer1"].profile.push_notes = False
    club["archer1"].profile.save()
    write_note(api, club)
    assert firebase.sent == []


def test_a_person_who_turned_notes_off_still_gets_evaluations(api, club, firebase, phone):
    club["archer1"].profile.push_notes = False
    club["archer1"].profile.save()
    rate(api, club, visibility="shared")
    assert types(firebase) == ["evaluation"]


def test_a_deactivated_archer_gets_nothing(api, club, firebase, phone):
    User.objects.filter(pk=club["archer1"].pk).update(is_active=False)
    write_note(api, club)
    assert firebase.sent == []


def test_a_note_that_is_rolled_back_notifies_nobody(club, firebase, phone, monkeypatch, django_capture_on_commit_callbacks):
    monkeypatch.setattr(transaction, "on_commit", REAL_ON_COMMIT)
    with django_capture_on_commit_callbacks(execute=True):
        with pytest.raises(RuntimeError):
            with transaction.atomic():
                notify.notify(club["archer1"].pk, notify.NOTE, note=1)
                raise RuntimeError
    assert firebase.sent == []


# --- evaluations -------------------------------------------------------------------------------------


def rate(api, club, who="coach", **extra):
    form = api(who).get(f"/api/teams/{club['a'].pk}/evaluation-templates/").data[0]
    body = {
        "archer": club["archer1"].pk, "template": form["id"], "date": "2026-10-01", "comment": "Private words",
        "scores": [{"criterion": form["criteria"][0]["key"], "rating": 4}],
        **extra,
    }
    return api(who).post("/api/evaluations/", body, format="json")


def test_a_shared_evaluation_notifies_the_archer(api, club, firebase, phone):
    assert rate(api, club, visibility="shared").status_code == 201
    assert types(firebase) == ["evaluation"]


def test_a_coach_only_evaluation_notifies_nobody_until_it_is_shared(api, club, firebase, phone):
    evaluation_id = rate(api, club).data["id"]
    assert firebase.sent == []
    api("coach").patch(f"/api/evaluations/{evaluation_id}/", {"visibility": "shared"}, format="json")
    assert types(firebase) == ["evaluation"]
    api("coach").patch(f"/api/evaluations/{evaluation_id}/", {"comment": "Edited"}, format="json")
    assert len(firebase.sent) == 1


def test_a_self_assessment_does_not_notify_the_archer(api, club, firebase, phone):
    res = rate(api, club, who="archer1", kind="self")
    assert res.status_code == 201
    assert firebase.sent == []


# --- invites and claim codes -------------------------------------------------------------------------


def test_the_creator_of_an_invite_hears_when_it_is_used(api, club, firebase, invite):
    Device.objects.create(user=club["admin"], token="admin-phone")
    code = "-".join(invite.code[i : i + 4] for i in range(0, 12, 4))
    assert api("b_archer").post("/api/invites/redeem/", {"invite_code": code}, format="json").status_code == 201
    assert [(m["token"], m["data"]["type"], m["data"]["team"]) for m in firebase.sent] == [("admin-phone", "team", str(club["a"].pk))]


def test_the_creator_who_left_the_team_hears_nothing(api, club, firebase, invite):
    Device.objects.create(user=club["admin"], token="admin-phone")
    TeamMember.objects.filter(user=club["admin"], team=club["a"]).update(role=Role.ARCHER)
    api("b_archer").post("/api/invites/redeem/", {"invite_code": invite.code}, format="json")
    assert firebase.sent == []


def test_a_claim_code_used_notifies_the_coach_who_made_it(api, club, firebase, make_user):
    Device.objects.create(user=club["coach"], token="coach-phone")
    profile = api("coach").post(f"/api/teams/{club['a'].pk}/archers/", {"name": "Max"}, format="json").data["user_id"]
    code = api("coach").post(f"/api/teams/{club['a'].pk}/archers/{profile}/claim-code/").data["code"]
    new = make_user("max@x.test")
    res = api_for(new).post("/api/claims/redeem/", {"invite_code": code}, format="json")
    assert res.status_code in (200, 201), res.data
    assert types(firebase) == ["team"]


def api_for(user):
    from rest_framework.test import APIClient

    client = APIClient()
    client.force_authenticate(user)
    return client


# --- what is sent ------------------------------------------------------------------------------------


def test_the_text_is_generic_and_follows_the_language_of_the_phone(api, club, firebase, phone):
    Device.objects.create(user=club["archer1"], token="german", language="de")
    write_note(api, club, session=None)
    by_token = {m["token"]: m for m in firebase.sent}
    assert by_token[TOKEN]["notification"]["title"] == "New note from your coach"
    assert by_token["german"]["notification"]["title"] == "Neue Notiz von deinem Trainer"
    wire = json.dumps(firebase.sent)
    assert "Secret words" not in wire and "coach@a.test" not in wire and "Team A" not in wire


def test_the_data_carries_ids_only(api, club, firebase, phone):
    note = write_note(api, club).data
    data = firebase.sent[0]["data"]
    assert data["type"] == "note" and data["note"] == str(note["id"]) and data["user"] == str(club["archer1"].pk)
    assert all(isinstance(v, str) for v in data.values())
    assert firebase.sent[0]["android"]["notification"]["channel_id"] == "notes"


# --- when Firebase fails -----------------------------------------------------------------------------


@pytest.mark.parametrize(
    "answer",
    [RuntimeError("down"), TimeoutError("slow"), Answer(500), Answer(401, {"error": {"status": "UNAUTHENTICATED"}}), Answer(400, {"error": {"message": "bad"}})],
    ids=["exception", "timeout", "500", "401", "400"],
)
def test_saving_works_whatever_firebase_does(api, club, firebase, phone, answer):
    firebase.answers[TOKEN] = answer
    assert write_note(api, club).status_code == 201
    assert Device.objects.filter(token=TOKEN).exists()  # a failure that may be temporary keeps the phone


@pytest.mark.parametrize(
    "answer",
    [
        Answer(404, {"error": {"status": "NOT_FOUND", "details": [{"errorCode": "UNREGISTERED"}]}}),
        Answer(403, {"error": {"status": "PERMISSION_DENIED", "details": [{"errorCode": "SENDER_ID_MISMATCH"}]}}),
    ],
    ids=["unregistered", "sender-id-mismatch"],
)
def test_a_token_that_can_never_work_is_removed(api, club, firebase, phone, answer):
    firebase.answers[TOKEN] = answer
    assert write_note(api, club).status_code == 201
    assert not Device.objects.exists()


def test_one_broken_phone_does_not_stop_the_others(api, club, firebase, phone):
    Device.objects.create(user=club["archer1"], token="second")
    firebase.answers[TOKEN] = RuntimeError("down")
    write_note(api, club)
    assert "second" in [m["token"] for m in firebase.sent]


def test_a_used_up_budget_drops_the_rest(api, club, firebase, phone, monkeypatch):
    Device.objects.create(user=club["archer1"], token="second")
    clock = iter([0, 0, 100, 100, 100])
    monkeypatch.setattr(notify.time, "monotonic", lambda: next(clock))
    write_note(api, club)
    assert len(firebase.sent) == 1


def test_phones_not_seen_for_270_days_are_dropped(api, club, firebase, phone):
    Device.objects.filter(pk=phone.pk).update(last_seen_at=timezone.now() - timedelta(days=300))
    write_note(api, club)
    assert firebase.sent == [] and not Device.objects.exists()


# --- signing out of everything -----------------------------------------------------------------------


def test_changing_the_password_removes_the_phones(api, club, firebase, phone):
    res = api("archer1").post("/api/me/password/", {"current_password": "correct-horse-battery", "new_password": "a-better-password-9"}, format="json")
    assert res.status_code == 200, res.data
    assert not Device.objects.exists()
