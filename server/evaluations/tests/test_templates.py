import pytest

from evaluations.defaults import default_criteria
from evaluations.models import Template


@pytest.fixture
def api(client_for, club):
    return lambda who: client_for(club[who])


def url(club, team="a"):
    return f"/api/teams/{club[team].pk}/evaluation-templates/"


def test_a_team_starts_with_the_shooting_technique_form(api, club):
    res = api("coach").get(url(club))
    assert res.status_code == 200 and len(res.data) == 1
    form = res.data[0]
    assert form["name"] == "Shooting technique" and form["version"] == 1 and form["scale"] == 5
    assert len(form["criteria"]) == 20 and len({c["key"] for c in form["criteria"]}) == 20
    assert [g for g in dict.fromkeys(c["group"] for c in form["criteria"])] == ["Pre-tension", "Raising the bow", "Holding", "Follow-through", "Whole sequence"]
    assert api("coach").get(url(club)).data[0]["id"] == form["id"]  # it is made once


def test_the_default_is_in_german_for_a_german_request(client_for, club):
    res = client_for(club["coach"]).get(url(club), HTTP_ACCEPT_LANGUAGE="de")
    assert res.data[0]["name"] == "Schießtechnik" and res.data[0]["criteria"][0]["group"] == "Vorspannung"


def test_archers_can_read_the_forms_of_their_team_and_nobody_else(api, club):
    assert api("archer1").get(url(club)).status_code == 200
    assert api("b_archer").get(url(club)).status_code == 404


def test_a_coach_makes_a_form_and_new_criteria_get_keys(api, club):
    res = api("coach").post(url(club), {"name": "Mental", "scale": 3, "criteria": [{"label": "Focus", "group": "Head"}, {"label": "Focus"}]}, format="json")
    assert res.status_code == 201, res.data
    assert res.data["scale"] == 3 and [c["key"] for c in res.data["criteria"]] == ["focus", "focus_2"]


def test_only_coaches_change_forms(api, club):
    assert api("archer1").post(url(club), {"name": "x", "criteria": [{"label": "a"}]}, format="json").status_code == 403
    form = api("coach").get(url(club)).data[0]
    assert api("archer1").put(f"/api/evaluation-templates/{form['id']}/", {"name": "x"}, format="json").status_code == 403
    assert api("b_admin").put(f"/api/evaluation-templates/{form['id']}/", {"name": "x"}, format="json").status_code == 404


def test_a_change_makes_a_new_version_and_keeps_the_keys(api, club):
    form = api("coach").get(url(club)).data[0]
    criteria = form["criteria"][:3] + [{"label": "Breathing", "group": "Whole sequence"}]
    res = api("coach").put(f"/api/evaluation-templates/{form['id']}/", {"criteria": criteria}, format="json")
    assert res.status_code == 200 and res.data["version"] == 2
    assert [c["key"] for c in res.data["criteria"]] == [c["key"] for c in form["criteria"][:3]] + ["breathing"]
    assert Template.objects.get(pk=form["id"]).versions.count() == 2  # the old version is still there


def test_no_change_makes_no_version(api, club):
    form = api("coach").get(url(club)).data[0]
    res = api("coach").put(f"/api/evaluation-templates/{form['id']}/", {"criteria": form["criteria"], "name": form["name"]}, format="json")
    assert res.data["version"] == 1


def test_a_dropped_key_is_not_given_to_something_else(api, club):
    form = api("coach").post(url(club), {"name": "F", "criteria": [{"label": "Anchor"}, {"label": "Release"}]}, format="json").data
    one = api("coach").put(f"/api/evaluation-templates/{form['id']}/", {"criteria": [{"key": "release", "label": "Release"}]}, format="json").data
    two = api("coach").put(f"/api/evaluation-templates/{form['id']}/", {"criteria": one["criteria"] + [{"label": "Anchor"}]}, format="json").data
    assert [c["key"] for c in two["criteria"]] == ["release", "anchor_2"]


@pytest.mark.parametrize(
    "criteria",
    [[], [{"label": " "}], [{"label": "a", "key": "Bad Key"}], [{"key": "x", "label": "a"}, {"key": "x", "label": "b"}], [{"label": str(i)} for i in range(61)]],
)
def test_wrong_criteria_are_refused(api, club, criteria):
    form = api("coach").get(url(club)).data[0]
    assert api("coach").put(f"/api/evaluation-templates/{form['id']}/", {"criteria": criteria}, format="json").status_code == 400


def test_a_form_with_evaluations_cannot_be_deleted(api, club):
    form = api("coach").get(url(club)).data[0]
    spare = api("coach").post(url(club), {"name": "Spare", "criteria": [{"label": "a"}]}, format="json").data
    assert api("coach").delete(f"/api/evaluation-templates/{spare['id']}/").status_code == 204
    from evaluations.tests.test_evaluations import rate

    rate(api, club, form)
    assert api("coach").delete(f"/api/evaluation-templates/{form['id']}/").status_code == 409


def test_the_default_wording_has_a_german_text_for_every_criterion():
    from django.utils import translation

    with translation.override("de"):
        assert all(c["label"] and c["group"] for c in default_criteria())


# --- the language of the built-in form ----------------------------------------------------------


def test_a_form_made_in_one_language_reads_in_the_language_of_each_member(client_for, club):
    en = client_for(club["coach"]).get(url(club)).data[0]  # made in English
    de = client_for(club["archer1"]).get(url(club), HTTP_ACCEPT_LANGUAGE="de").data[0]
    assert en["name"] == "Shooting technique" and de["name"] == "Schießtechnik"
    assert en["criteria"][0]["label"] == "Upright back, hips tilted, shoulders low" and de["criteria"][0]["label"] == "Aufrechter Rücken, Becken gekippt, Schultern tief"
    assert {c["group"] for c in de["criteria"]} == {"Vorspannung", "Anheben", "Halten", "Nachhalten", "Gesamtablauf"}
    assert [c["key"] for c in en["criteria"]] == [c["key"] for c in de["criteria"]]


def test_a_text_a_coach_changed_stays_as_written(client_for, club):
    form = client_for(club["coach"]).get(url(club)).data[0]
    criteria = [dict(c) for c in form["criteria"]]
    criteria[0]["label"] = "Straight spine"
    client_for(club["coach"]).put(f"/api/evaluation-templates/{form['id']}/", {"criteria": criteria}, format="json")
    de = client_for(club["archer1"]).get(url(club), HTTP_ACCEPT_LANGUAGE="de").data[0]
    assert de["criteria"][0]["label"] == "Straight spine" and de["criteria"][1]["label"] == "Kopf ruhig und zur Scheibe gerichtet"


def test_saving_the_form_unchanged_in_another_language_makes_no_new_version(client_for, club):
    form = client_for(club["coach"]).get(url(club)).data[0]  # English
    de = client_for(club["coach"]).get(url(club), HTTP_ACCEPT_LANGUAGE="de").data[0]
    res = client_for(club["coach"]).put(f"/api/evaluation-templates/{form['id']}/", {"name": de["name"], "criteria": de["criteria"]}, format="json", HTTP_ACCEPT_LANGUAGE="de")
    assert res.data["version"] == 1
