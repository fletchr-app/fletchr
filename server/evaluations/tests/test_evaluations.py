import pytest

from evaluations.models import Evaluation
from media.models import Media
from privacy.tests.test_media import give


@pytest.fixture
def api(client_for, club):
    return lambda who: client_for(club[who])


def form_of(api, club, team="a", who="coach"):
    return api(who).get(f"/api/teams/{club[team].pk}/evaluation-templates/").data[0]


def rate(api, club, form=None, who="coach", about="archer1", **extra):
    form = form or form_of(api, club)
    body = {
        "archer": club[about].pk, "template": form["id"], "date": "2026-10-01", "comment": "Good block", "goals": "Quieter release",
        "scores": [{"criterion": form["criteria"][0]["key"], "rating": 4, "comment": "Better"}, {"criterion": form["criteria"][1]["key"], "rating": 2}],
        **extra,
    }
    return api(who).post("/api/evaluations/", body, format="json")


# --- a coach rates an archer ---------------------------------------------------------------------


def test_a_coach_saves_an_evaluation_with_a_date_and_it_shows_the_form_it_was_made_with(api, club):
    res = rate(api, club)
    assert res.status_code == 201, res.data
    d = res.data
    assert (d["kind"], str(d["date"]), d["visibility"], d["team"]) == ("coach", "2026-10-01", "coach_only", club["a"].pk)  # nothing reaches the archer by accident
    assert d["author"] == club["coach"].pk and d["version"] == 1 and d["scale"] == 5 and len(d["criteria"]) == 20
    assert [(s["rating"], s["comment"]) for s in d["scores"]] == [(4, "Better"), (2, "")]


def test_the_date_defaults_to_today_and_can_be_in_the_past(api, club):
    from datetime import date

    form = form_of(api, club)
    body = {"archer": club["archer1"].pk, "template": form["id"], "scores": []}
    assert str(api("coach").post("/api/evaluations/", body, format="json").data["date"]) == date.today().isoformat()


def test_the_archer_sees_it_if_it_is_shared_and_not_if_it_is_coach_only(api, club):
    shared = rate(api, club, visibility="shared").data["id"]
    hidden = rate(api, club).data["id"]
    seen = {e["id"] for e in api("archer1").get("/api/evaluations/").data}
    assert seen == {shared}
    assert api("archer1").get(f"/api/evaluations/{hidden}/").status_code == 404
    assert {e["id"] for e in api("coach").get("/api/evaluations/").data} == {shared, hidden}
    assert api("archer2").get("/api/evaluations/").data == []
    assert api("b_admin").get(f"/api/evaluations/{shared}/").status_code == 404


def test_the_coach_can_share_an_evaluation_later_and_take_it_back(api, club):
    ev = rate(api, club).data["id"]
    assert api("archer1").get("/api/evaluations/").data == []
    assert api("coach").patch(f"/api/evaluations/{ev}/", {"visibility": "shared"}, format="json").status_code == 200
    assert [e["id"] for e in api("archer1").get("/api/evaluations/").data] == [ev]
    api("coach").patch(f"/api/evaluations/{ev}/", {"visibility": "coach_only"}, format="json")
    assert api("archer1").get("/api/evaluations/").data == []


def test_only_a_coach_of_the_archer_rates_them(api, club):
    form = form_of(api, club)
    assert rate(api, club, form, who="archer1").status_code == 403
    assert rate(api, club, form, who="b_admin").status_code == 400  # coaches another team
    assert rate(api, club, form, who="coach", about="b_archer").status_code == 400


def test_the_form_must_be_the_teams_and_be_named(api, club):
    other = form_of(api, club, team="b", who="b_admin")
    assert rate(api, club, other).status_code == 400
    body = {"archer": club["archer1"].pk, "scores": []}
    assert api("coach").post("/api/evaluations/", body, format="json").status_code == 400


@pytest.mark.parametrize("score", [{"criterion": "nope", "rating": 3}, {"criterion": "pre_back", "rating": 0}, {"criterion": "pre_back", "rating": 6}])
def test_wrong_scores_are_refused(api, club, score):
    assert rate(api, club, scores=[score]).status_code == 400


def test_a_criterion_is_rated_once(api, club):
    s = {"criterion": "pre_back", "rating": 3}
    assert rate(api, club, scores=[s, s]).status_code == 400


# --- the frame as evidence ----------------------------------------------------------------------


def clip_of(owner):
    clip = give(owner, "video")
    Media.objects.filter(pk=clip.pk).update(frame_count=240)
    return clip


def test_a_score_can_point_at_a_frame_of_the_archers_clip(api, club):
    clip = clip_of(club["archer1"])
    s = [{"criterion": "pre_back", "rating": 3, "media": str(clip.pk), "frame": 143, "time_ms": 1192}]
    res = rate(api, club, scores=s)
    assert res.status_code == 201, res.data
    assert (str(res.data["scores"][0]["media"]), res.data["scores"][0]["frame"]) == (str(clip.pk), 143)


@pytest.mark.parametrize("extra", [{"frame": None}, {"frame": 240}])
def test_the_frame_must_exist(api, club, extra):
    clip = clip_of(club["archer1"])
    s = [{"criterion": "pre_back", "rating": 3, "media": str(clip.pk), "frame": 3, **extra}]
    assert rate(api, club, scores=s).status_code == 400


def test_the_clip_must_be_the_archers(api, club):
    clip = clip_of(club["archer2"])
    assert rate(api, club, scores=[{"criterion": "pre_back", "rating": 3, "media": str(clip.pk), "frame": 1}]).status_code == 400


def test_the_score_stays_when_the_clip_is_deleted(api, club):
    clip = clip_of(club["archer1"])
    rate(api, club, scores=[{"criterion": "pre_back", "rating": 3, "media": str(clip.pk), "frame": 1}])
    clip.delete()
    assert Evaluation.objects.get().scores.get().media is None


# --- the archer's own ---------------------------------------------------------------------------


def test_an_archer_rates_themselves_and_the_coach_reads_it_apart_from_their_own(api, club):
    form = form_of(api, club, who="archer1")
    res = rate(api, club, form, who="archer1", kind="self", visibility="coach_only")
    assert res.status_code == 201, res.data
    assert (res.data["kind"], res.data["visibility"], res.data["author"]) == ("self", "shared", club["archer1"].pk)
    rate(api, club, form, visibility="shared")
    assert [e["kind"] for e in api("coach").get("/api/evaluations/?archer=%d&kind=self" % club["archer1"].pk).data] == ["self"]
    assert len(api("archer1").get("/api/evaluations/").data) == 2  # their own and the one the coach shared
    assert api("archer2").get("/api/evaluations/").data == []


def test_a_self_assessment_is_about_yourself(api, club):
    form = form_of(api, club, who="archer1")
    assert rate(api, club, form, who="archer1", kind="self", about="archer2").status_code == 400


# --- changing and deleting ----------------------------------------------------------------------


def test_the_author_changes_the_text_the_date_and_the_ratings(api, club):
    ev = rate(api, club).data
    res = api("coach").patch(f"/api/evaluations/{ev['id']}/", {"comment": "Changed", "date": "2026-09-01", "scores": [{"criterion": "pre_back", "rating": 5}]}, format="json")
    assert res.status_code == 200, res.data
    assert (res.data["comment"], str(res.data["date"]), [s["rating"] for s in res.data["scores"]]) == ("Changed", "2026-09-01", [5])


def test_who_and_what_cannot_change(api, club):
    ev = rate(api, club).data
    assert api("coach").patch(f"/api/evaluations/{ev['id']}/", {"archer": club["archer2"].pk}, format="json").status_code == 400
    assert api("coach").patch(f"/api/evaluations/{ev['id']}/", {"kind": "self"}, format="json").status_code == 400
    assert api("admin").patch(f"/api/evaluations/{ev['id']}/", {"comment": "x"}, format="json").status_code == 403


def test_the_author_or_a_team_admin_deletes(api, club):
    one, two = rate(api, club, visibility="shared").data["id"], rate(api, club).data["id"]
    assert api("archer1").delete(f"/api/evaluations/{one}/").status_code == 403
    assert api("coach").delete(f"/api/evaluations/{one}/").status_code == 204
    assert api("admin").delete(f"/api/evaluations/{two}/").status_code == 204


def test_an_old_evaluation_keeps_its_form_when_the_form_changes(api, club):
    form = form_of(api, club)
    ev = rate(api, club, form).data
    api("coach").put(f"/api/evaluation-templates/{form['id']}/", {"criteria": form["criteria"][:2] + [{"label": "New"}]}, format="json")
    again = api("coach").get(f"/api/evaluations/{ev['id']}/").data
    assert again["version"] == 1 and len(again["criteria"]) == 20
    new = rate(api, club, form_of(api, club), scores=[{"criterion": "new", "rating": 3}]).data
    assert new["version"] == 2 and len(new["criteria"]) == 3


def test_filtering_by_date_for_trends(api, club):
    for d in ("2026-08-01", "2026-09-01", "2026-10-01"):
        rate(api, club, date=d)
    got = api("coach").get("/api/evaluations/?archer=%d&date_from=2026-09-01" % club["archer1"].pk).data
    assert [str(e["date"]) for e in got] == ["2026-10-01", "2026-09-01"]  # newest first


def test_the_team_can_be_deleted_with_its_forms_and_evaluations(api, club):
    from core import claims

    rate(api, club)
    claims.delete_team(club["a"])
    assert not Evaluation.objects.exists()


# --- export and deletion ------------------------------------------------------------------------


def test_the_export_has_the_evaluations_about_me_the_coach_only_ones_too_and_those_i_wrote(client_for, club):
    from privacy.tests.test_delete_data import PASSWORD

    api = lambda who: client_for(club[who])  # noqa: E731
    form = form_of(api, club)
    rate(api, club, form, visibility="shared")
    rate(api, club, form, date="2026-10-02")
    rate(api, club, form, who="archer1", kind="self")
    d = client_for(club["archer1"]).post("/api/me/export/", {"password": PASSWORD}, format="json").json()
    assert [(e["kind"], e["date"], e["visibility"]) for e in d["evaluations_about_me"]] == [("coach", "2026-10-01", "shared"), ("self", "2026-10-01", "shared"), ("coach", "2026-10-02", "coach_only")]  # by date
    first = d["evaluations_about_me"][0]
    assert first["form"] == {"name": "Shooting technique", "version": 1, "scale": 5} and first["scores"][0]["label"] and first["goals"] == "Quieter release"
    assert d["evaluations_i_wrote"] == []
    c = client_for(club["coach"]).post("/api/me/export/", {"password": PASSWORD}, format="json").json()
    assert len(c["evaluations_i_wrote"]) == 2 and c["evaluations_about_me"] == []  # the archer's own is not the coach's to write


def test_delete_my_data_removes_the_evaluations_about_me_and_keeps_the_ones_i_wrote(client_for, club):
    api = lambda who: client_for(club[who])  # noqa: E731
    form = form_of(api, club)
    rate(api, club, form)
    rate(api, club, form, who="archer1", kind="self")
    rate(api, club, form, about="archer2")
    res = api("archer1").post("/api/me/delete-data/", {"password": "correct-horse-battery", "confirm": "DELETE"}, format="json")
    assert res.status_code == 200 and res.data["deleted"]["evaluations"] == 2
    assert list(Evaluation.objects.values_list("archer__email", flat=True)) == ["archer2@a.test"]


def test_deleting_a_coach_account_keeps_the_evaluations_as_by_a_former_coach(client_for, club):
    api = lambda who: client_for(club[who])  # noqa: E731
    ev = rate(api, club, visibility="shared").data["id"]
    res = api("coach").post("/api/me/delete-account/", {"password": "correct-horse-battery", "confirm": "DELETE ACCOUNT"}, format="json")
    assert res.status_code == 200, res.data
    seen = api("archer1").get(f"/api/evaluations/{ev}/").data
    assert seen["author"] is None and seen["author_name"] == "Former coach"


def test_an_evaluation_shows_the_form_in_the_language_of_the_reader(client_for, club):
    api = lambda who: client_for(club[who])  # noqa: E731
    ev = rate(api, club, visibility="shared").data["id"]
    de = client_for(club["archer1"]).get(f"/api/evaluations/{ev}/", HTTP_ACCEPT_LANGUAGE="de").data
    assert de["template_name"] == "Schießtechnik" and de["criteria"][0]["group"] == "Vorspannung"
