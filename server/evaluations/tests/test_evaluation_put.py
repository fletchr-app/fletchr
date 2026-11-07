"""An evaluation written by the uid the phone gave it (#84): safe to send twice, gone when it was deleted, and told to the phones."""
import uuid

import pytest

from core.models import Tombstone, TeamMember
from evaluations.models import Evaluation
from media.models import Media
from privacy.tests.test_media import give

from .test_evaluations import form_of


@pytest.fixture
def api(client_for, club):
    return lambda who: client_for(club[who])


def body(api, club, about="archer1", **extra):
    form = form_of(api, club)
    return {
        "archer": club[about].pk, "template": form["id"], "kind": "coach", "date": "2026-10-01", "comment": "Good block", "goals": "",
        "scores": [{"criterion": form["criteria"][0]["key"], "rating": 4}, {"criterion": form["criteria"][1]["key"], "rating": 2}],
        **extra,
    }


def put(api, club, uid, who="coach", **extra):
    return api(who).put(f"/api/evaluations/{uid}/", body(api, club, **extra), format="json")


def test_a_put_creates_the_evaluation_with_the_uid_and_a_repeat_changes_nothing(api, club):
    uid = uuid.uuid4()
    first = put(api, club, uid)
    assert first.status_code == 201, first.data
    assert first.data["uid"] == str(uid) and first.data["author"] == club["coach"].pk
    again = put(api, club, uid)
    assert again.status_code == 200
    assert Evaluation.objects.count() == 1
    assert Evaluation.objects.get().scores.count() == 2
    assert again.data["id"] == first.data["id"]


def test_a_put_changes_what_was_written_and_replaces_the_scores_whole(api, club):
    uid = uuid.uuid4()
    put(api, club, uid)
    form = form_of(api, club)
    changed = body(api, club, comment="Better", scores=[{"criterion": form["criteria"][2]["key"], "rating": 5}])
    res = api("coach").put(f"/api/evaluations/{uid}/", changed, format="json")
    assert res.status_code == 200, res.data
    ev = Evaluation.objects.get()
    assert ev.comment == "Better"
    assert [(s.criterion, s.rating) for s in ev.scores.all()] == [(form["criteria"][2]["key"], 5)]


def test_a_put_follows_the_rules_of_a_post(api, club):
    form = form_of(api, club)
    assert put(api, club, uuid.uuid4(), who="archer1").status_code == 403  # only a coach rates an archer
    assert put(api, club, uuid.uuid4(), who="b_admin").status_code == 400  # coaches another team
    bad = body(api, club, scores=[{"criterion": "no_such_key", "rating": 3}])
    assert api("coach").put(f"/api/evaluations/{uuid.uuid4()}/", bad, format="json").status_code == 400
    assert Evaluation.objects.count() == 0
    assert form["id"]


def test_the_evaluation_of_somebody_else_is_not_found_and_nothing_changes(api, club):
    uid = uuid.uuid4()
    put(api, club, uid)
    other = put(api, club, uid, who="admin", comment="Mine now")
    assert other.status_code == 404
    assert api("archer1").put(f"/api/evaluations/{uid}/", body(api, club), format="json").status_code == 404
    assert Evaluation.objects.get().comment == "Good block"


def test_a_coach_who_left_the_team_meanwhile_is_refused_and_nothing_is_written(api, club):
    uid = uuid.uuid4()
    written = body(api, club)  # what the phone wrote offline
    TeamMember.objects.filter(user=club["coach"]).delete()
    res = api("coach").put(f"/api/evaluations/{uid}/", written, format="json")
    assert res.status_code in (400, 403, 404)
    assert Evaluation.objects.count() == 0


def test_a_photo_the_server_has_not_seen_is_a_400_on_that_field(api, club):
    form = form_of(api, club)
    scores = [{"criterion": form["criteria"][0]["key"], "rating": 4, "media": str(uuid.uuid4())}]
    res = api("coach").put(f"/api/evaluations/{uuid.uuid4()}/", body(api, club, scores=scores), format="json")
    assert res.status_code == 400
    assert Evaluation.objects.count() == 0


def test_a_photo_is_evidence_without_a_frame_and_a_clip_needs_one_through_a_put(api, club):
    photo = give(club["archer1"], "photo")
    clip = give(club["archer1"], "video")
    Media.objects.filter(pk=clip.pk).update(frame_count=240)
    ok = api("coach").put(f"/api/evaluations/{uuid.uuid4()}/", body(api, club, scores=[{"criterion": "pre_back", "rating": 3, "media": str(photo.pk)}]), format="json")
    assert ok.status_code == 201, ok.data
    assert (ok.data["scores"][0]["frame"], ok.data["scores"][0]["time_ms"]) == (None, None)
    bare = body(api, club, scores=[{"criterion": "pre_back", "rating": 3, "media": str(clip.pk)}])
    assert api("coach").put(f"/api/evaluations/{uuid.uuid4()}/", bare, format="json").status_code == 400
    framed = body(api, club, scores=[{"criterion": "pre_back", "rating": 3, "media": str(clip.pk), "frame": 143, "time_ms": 1192}])
    assert api("coach").put(f"/api/evaluations/{uuid.uuid4()}/", framed, format="json").status_code == 201


def test_a_put_to_a_deleted_uid_is_410(api, club):
    uid = uuid.uuid4()
    pk = put(api, club, uid).data["id"]
    assert api("coach").delete(f"/api/evaluations/{pk}/").status_code == 204
    assert put(api, club, uid).status_code == 410
    assert Evaluation.objects.count() == 0


def test_a_tombstone_is_written_on_delete_for_the_author_and_for_the_archer_who_could_read_it(api, club):
    shared = put(api, club, uuid.uuid4(), visibility="shared")
    hidden = put(api, club, uuid.uuid4())
    api("coach").delete(f"/api/evaluations/{shared.data['id']}/")
    api("coach").delete(f"/api/evaluations/{hidden.data['id']}/")
    gone = lambda who: {(t["uid"]) for t in api(who).get("/api/gone/?kind=evaluation").data}  # noqa: E731
    assert gone("coach") == {shared.data["uid"], hidden.data["uid"]}
    assert gone("archer1") == {shared.data["uid"]}  # a coach only one was never theirs
    assert gone("archer2") == set()


def test_taking_a_shared_evaluation_back_tells_the_archers_phone_to_drop_it(api, club):
    res = put(api, club, uuid.uuid4(), visibility="shared")
    uid = res.data["uid"]
    assert Tombstone.objects.filter(kind=Tombstone.Kind.EVALUATION).count() == 0
    again = api("coach").put(f"/api/evaluations/{uid}/", body(api, club, visibility="coach_only"), format="json")
    assert again.status_code == 200
    assert {t["uid"] for t in api("archer1").get("/api/gone/?kind=evaluation").data} == {uid}
    assert api("coach").get("/api/gone/?kind=evaluation").data == []  # the author still has it
    # through a PATCH too
    other = put(api, club, uuid.uuid4(), visibility="shared")
    api("coach").patch(f"/api/evaluations/{other.data['id']}/", {"visibility": "coach_only"}, format="json")
    assert other.data["uid"] in {t["uid"] for t in api("archer1").get("/api/gone/?kind=evaluation").data}


def test_the_list_can_be_asked_for_what_changed_since(api, club):
    from datetime import timedelta

    from django.utils import timezone

    old = put(api, club, uuid.uuid4()).data
    new = put(api, club, uuid.uuid4()).data
    Evaluation.objects.filter(pk=old["id"]).update(updated_at=timezone.now() - timedelta(days=2))
    since = (timezone.now() - timedelta(days=1)).isoformat()
    res = api("coach").get("/api/evaluations/", {"updated_after": since})
    assert [e["id"] for e in res.data] == [new["id"]]


def test_an_evaluation_made_with_post_has_a_uid_too(api, club):
    res = api("coach").post("/api/evaluations/", body(api, club), format="json")
    assert res.status_code == 201
    assert uuid.UUID(res.data["uid"])
