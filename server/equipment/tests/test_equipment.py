import pytest

from equipment.models import ArrowSet, ArrowSetRevision, Bow, BowRevision, Setup

BOW = {"name": "Hoyt Formula", "type": "recurve", "draw_weight": "38.0", "tiller": "-2.5", "sight": "Shibuya"}
ARROWS = {"name": "X10 600", "shaft_model": "Easton X10", "spine": "600", "point_weight": 100, "count": 12}

KINDS = {
    "bows": (BOW, "draw_weight", "40.0", Bow, BowRevision),
    "arrow-sets": (ARROWS, "point_weight", 110, ArrowSet, ArrowSetRevision),
}


@pytest.fixture(params=KINDS)
def kind(request):
    payload, field, new_value, model, revision_model = KINDS[request.param]
    return {"url": f"/api/{request.param}/", "payload": payload, "field": field, "new": new_value, "model": model, "revision": revision_model}


def create(client, kind, **extra):
    res = client.post(kind["url"], {**kind["payload"], **extra}, format="json")
    assert res.status_code == 201, res.data
    return res.data


def test_create_writes_revision_one_for_the_caller(client_for, club, kind):
    data = create(client_for(club["archer1"]), kind, owner=club["archer2"].pk)
    assert data["owner"] == club["archer1"].pk  # owner can't be set by the client
    assert data["revision_number"] == 1
    assert kind["revision"].objects.count() == 1
    assert kind["model"].objects.get().current_revision_id == data["revision"]


def test_changing_a_field_adds_a_revision_and_keeps_the_old_values(client_for, club, kind):
    client = client_for(club["archer1"])
    data = create(client, kind)
    url = f"{kind['url']}{data['id']}/"
    res = client.patch(url, {kind["field"]: kind["new"]}, format="json")
    assert res.status_code == 200 and res.data["revision_number"] == 2
    history = client.get(f"{url}revisions/").data
    assert [r["number"] for r in history] == [2, 1]
    assert str(history[1][kind["field"]]) == str(kind["payload"][kind["field"]])
    assert str(history[0][kind["field"]]) == str(kind["new"])


def test_saving_without_a_real_change_adds_no_revision(client_for, club, kind):
    client = client_for(club["archer1"])
    data = create(client, kind)
    url = f"{kind['url']}{data['id']}/"
    client.patch(url, kind["payload"], format="json")  # same values
    client.patch(url, {"is_active": False}, format="json")  # not a tracked field
    assert kind["revision"].objects.count() == 1
    assert client.get(url).data["is_active"] is False


def test_owner_sees_only_own_equipment(client_for, club, kind):
    create(client_for(club["archer1"]), kind)
    assert len(client_for(club["archer1"]).get(kind["url"]).data) == 1
    # Another archer in the same team, and archers in other teams, see nothing.
    for who in ("archer2", "b_archer", "b_admin"):
        assert client_for(club[who]).get(kind["url"]).data == []


def test_coach_reads_but_cannot_change_archers_equipment(client_for, club, kind):
    data = create(client_for(club["archer1"]), kind)
    url = f"{kind['url']}{data['id']}/"
    for who in ("coach", "admin"):
        client = client_for(club[who])
        assert len(client.get(kind["url"]).data) == 1
        assert client.get(url).status_code == 200
        assert client.get(f"{url}revisions/").status_code == 200
        assert client.patch(url, {"name": "Mine now"}, format="json").status_code == 403
        assert client.delete(url).status_code == 403
    assert kind["model"].objects.get().name == kind["payload"]["name"]


def test_coach_of_another_team_gets_404(client_for, club, kind):
    data = create(client_for(club["archer1"]), kind)
    url = f"{kind['url']}{data['id']}/"
    client = client_for(club["b_admin"])
    assert client.get(url).status_code == 404
    assert client.get(f"{url}revisions/").status_code == 404
    assert client.patch(url, {"name": "x"}, format="json").status_code == 404
    assert client.delete(url).status_code == 404


def test_other_archer_in_same_team_gets_404(client_for, club, kind):
    data = create(client_for(club["archer1"]), kind)
    assert client_for(club["archer2"]).get(f"{kind['url']}{data['id']}/").status_code == 404


def test_coach_can_filter_by_owner(client_for, club, kind):
    create(client_for(club["archer1"]), kind)
    create(client_for(club["archer2"]), kind)
    create(client_for(club["coach"]), kind)
    client = client_for(club["coach"])
    assert len(client.get(kind["url"]).data) == 3
    assert len(client.get(kind["url"], {"owner": club["archer2"].pk}).data) == 1


def test_validation(client_for, club):
    client = client_for(club["archer1"])
    assert client.post("/api/bows/", {**BOW, "draw_weight": "-5"}, format="json").status_code == 400
    assert client.post("/api/bows/", {**BOW, "type": "crossbow"}, format="json").status_code == 400
    assert client.post("/api/bows/", {"type": "recurve"}, format="json").status_code == 400
    assert client.post("/api/arrow-sets/", {**ARROWS, "count": -1}, format="json").status_code == 400
    assert Bow.objects.count() == 0


@pytest.mark.parametrize("url", ["/api/bows/", "/api/arrow-sets/", "/api/setups/"])
def test_login_required(client_for, db, url):
    assert client_for().get(url).status_code == 401


def test_unused_equipment_can_be_deleted_but_used_equipment_cannot(client_for, club):
    client = client_for(club["archer1"])
    bow = create(client, {"url": "/api/bows/", "payload": BOW})
    other = create(client, {"url": "/api/bows/", "payload": BOW}, name="Spare")
    client.post("/api/setups/", {"bow_revision": bow["revision"]}, format="json")
    assert client.delete(f"/api/bows/{bow['id']}/").status_code == 409
    assert Bow.objects.filter(pk=bow["id"]).exists()
    assert client.delete(f"/api/bows/{other['id']}/").status_code == 204


@pytest.fixture
def gear(client_for, club):
    client = client_for(club["archer1"])
    bow = create(client, {"url": "/api/bows/", "payload": BOW})
    arrows = create(client, {"url": "/api/arrow-sets/", "payload": ARROWS})
    return {"client": client, "bow": bow, "arrows": arrows}


def test_setup_is_created_once_per_pair_of_revisions(gear):
    body = {"bow_revision": gear["bow"]["revision"], "arrow_set_revision": gear["arrows"]["revision"]}
    first = gear["client"].post("/api/setups/", body, format="json")
    again = gear["client"].post("/api/setups/", body, format="json")
    assert (first.status_code, again.status_code) == (201, 200)
    assert first.data["id"] == again.data["id"]
    assert first.data["bow"]["name"] == "Hoyt Formula"
    assert Setup.objects.count() == 1


def test_setup_without_arrows_is_also_deduplicated(gear):
    body = {"bow_revision": gear["bow"]["revision"]}
    ids = {gear["client"].post("/api/setups/", body, format="json").data["id"] for _ in range(3)}
    assert len(ids) == 1 and Setup.objects.count() == 1


def test_old_setup_keeps_the_bow_as_it_was(gear):
    client = gear["client"]
    old = client.post("/api/setups/", {"bow_revision": gear["bow"]["revision"]}, format="json").data
    edited = client.patch(f"/api/bows/{gear['bow']['id']}/", {"draw_weight": "42.0"}, format="json").data
    new = client.post("/api/setups/", {"bow_revision": edited["revision"]}, format="json").data
    assert old["id"] != new["id"]
    assert client.get(f"/api/setups/{old['id']}/").data["bow"]["draw_weight"] == "38.0"
    assert client.get(f"/api/setups/{new['id']}/").data["bow"]["draw_weight"] == "42.0"
    # A session logged offline before the edit can still reference the old revision.
    again = client.post("/api/setups/", {"bow_revision": gear["bow"]["revision"]}, format="json")
    assert again.status_code == 200 and again.data["id"] == old["id"]


def test_setup_cannot_use_someone_elses_equipment(client_for, club, gear):
    stranger = client_for(club["archer2"])
    assert stranger.post("/api/setups/", {"bow_revision": gear["bow"]["revision"]}, format="json").status_code == 400
    own = create(stranger, {"url": "/api/bows/", "payload": BOW})
    res = stranger.post(
        "/api/setups/", {"bow_revision": own["revision"], "arrow_set_revision": gear["arrows"]["revision"]}, format="json"
    )
    assert res.status_code == 400
    # Coaches can't build setups for their archers either.
    res = client_for(club["coach"]).post("/api/setups/", {"bow_revision": gear["bow"]["revision"]}, format="json")
    assert res.status_code == 400
    assert Setup.objects.count() == 0


def test_setup_visibility_follows_team_roles(client_for, club, gear):
    setup = gear["client"].post("/api/setups/", {"bow_revision": gear["bow"]["revision"]}, format="json").data
    assert len(client_for(club["coach"]).get("/api/setups/").data) == 1
    assert client_for(club["coach"]).get(f"/api/setups/{setup['id']}/").status_code == 200
    for who in ("archer2", "b_admin"):
        assert client_for(club[who]).get("/api/setups/").data == []
        assert client_for(club[who]).get(f"/api/setups/{setup['id']}/").status_code == 404


def test_setups_are_read_only_after_creation(gear):
    setup = gear["client"].post("/api/setups/", {"bow_revision": gear["bow"]["revision"]}, format="json").data
    url = f"/api/setups/{setup['id']}/"
    assert gear["client"].patch(url, {}, format="json").status_code == 405
    assert gear["client"].delete(url).status_code == 405
