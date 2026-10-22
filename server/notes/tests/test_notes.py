import uuid

import pytest

from core.models import Role, TeamMember
from notes.models import Note
from training.models import End
from training.tests.test_overview import make_session


@pytest.fixture
def api(client_for, club):
    return lambda who: client_for(club[who])


def write(api, club, who="coach", about="archer1", **extra):
    body = {"archer": club[about].pk, "body": "Watch the bow arm", **extra}
    return api(who).post("/api/notes/", body, format="json")


def ids(res):
    return {n["id"] for n in res.data}


# --- writing ------------------------------------------------------------------------------------


def test_notes_are_coach_only_unless_shared(api, club):
    res = write(api, club)
    assert res.status_code == 201, res.data
    assert res.data["visibility"] == "coach_only"
    assert res.data["team"] == club["a"].pk
    assert res.data["author"] == club["coach"].pk and res.data["author_name"] == "coach"
    assert write(api, club, visibility="shared").data["visibility"] == "shared"


def test_a_note_can_be_about_a_session_and_an_end(api, club):
    session = make_session(club["archer1"])
    end = End.objects.create(id=uuid.uuid4(), session=session, index=0, distance_m=18, face="wa-40", arrows_per_end=3)
    assert write(api, club, session=str(session.pk)).status_code == 201
    res = write(api, club, session=str(session.pk), end=str(end.pk))
    assert res.status_code == 201 and str(res.data["end"]) == str(end.pk)


@pytest.mark.parametrize("who", ["coach", "admin"])
def test_coaches_and_admins_can_write(api, club, who):
    assert write(api, club, who).status_code == 201


def test_archers_cannot_write(api, club):
    assert write(api, club, "archer1", about="archer1").status_code == 403
    assert write(api, club, "archer2", about="archer1").status_code == 403
    assert not Note.objects.exists()


def test_a_note_needs_text(api, club):
    for body in ["", "   "]:
        assert write(api, club, body=body).status_code == 400


def test_only_about_archers_in_a_team_you_coach(api, club):
    assert write(api, club, about="b_archer").status_code == 400  # the other team's archer
    assert write(api, club, "b_admin", about="archer1").status_code == 400
    assert write(api, club, about="admin").status_code == 400  # a coach who has not opted in
    assert not Note.objects.exists()


def test_a_coach_who_shares_their_training_can_be_written_about(api, club):
    TeamMember.objects.filter(user=club["coach"]).update(also_shoots=True)
    assert write(api, club, "admin", about="coach").status_code == 201


def test_session_and_end_must_belong_to_that_archer(api, club):
    other = make_session(club["archer2"])
    mine = make_session(club["archer1"])
    end_of_other = End.objects.create(id=uuid.uuid4(), session=other, index=0, distance_m=18, face="wa-40", arrows_per_end=3)
    assert write(api, club, session=str(other.pk)).status_code == 400
    assert write(api, club, session=str(mine.pk), end=str(end_of_other.pk)).status_code == 400
    assert write(api, club, end=str(end_of_other.pk)).status_code == 400, "an end needs its session"


def test_the_team_is_needed_only_when_it_is_ambiguous(api, club, join):
    join(club["coach"], club["b"], Role.COACH)
    join(club["archer1"], club["b"], Role.ARCHER)
    res = write(api, club)
    assert res.status_code == 400 and "team" in res.data
    ok = write(api, club, team=club["b"].pk)
    assert ok.status_code == 201 and ok.data["team"] == club["b"].pk


def test_a_team_you_do_not_coach_is_refused(api, club):
    assert write(api, club, team=club["b"].pk).status_code == 400


# --- reading --------------------------------------------------------------------------------------


def test_coach_only_notes_are_for_the_coaches_of_the_team(api, club):
    note = write(api, club).data["id"]
    for who in ("coach", "admin"):
        assert note in ids(api(who).get("/api/notes/")), who
        assert api(who).get(f"/api/notes/{note}/").status_code == 200
    for who in ("archer1", "archer2", "b_admin", "b_archer"):
        assert api(who).get("/api/notes/").data == [], who
        assert api(who).get(f"/api/notes/{note}/").status_code == 404, who


def test_shared_notes_are_also_for_the_archer_they_are_about(api, club):
    note = write(api, club, visibility="shared").data["id"]
    assert note in ids(api("archer1").get("/api/notes/"))
    assert api("archer1").get(f"/api/notes/{note}/").status_code == 200
    for who in ("archer2", "b_admin", "b_archer"):
        assert api(who).get("/api/notes/").data == [], who


def test_turning_a_note_to_coach_only_hides_it_from_the_archer(api, club):
    note = write(api, club, visibility="shared").data["id"]
    api("coach").patch(f"/api/notes/{note}/", {"visibility": "coach_only"}, format="json")
    assert api("archer1").get("/api/notes/").data == []


def test_coaches_of_the_archers_other_team_do_not_see_it(api, club, join):
    join(club["archer1"], club["b"], Role.ARCHER)
    write(api, club, visibility="shared")
    assert api("b_admin").get("/api/notes/").data == []
    # The archer sees it wherever it was written.
    assert len(api("archer1").get("/api/notes/").data) == 1


def test_filters(api, club):
    session = make_session(club["archer1"])
    write(api, club, session=str(session.pk))
    write(api, club, about="archer2")
    write(api, club, "admin", visibility="shared")
    coach = api("coach")
    assert len(coach.get("/api/notes/").data) == 3
    assert len(coach.get("/api/notes/", {"archer": club["archer2"].pk}).data) == 1
    assert len(coach.get("/api/notes/", {"session": str(session.pk)}).data) == 1
    assert len(coach.get("/api/notes/", {"author": club["admin"].pk}).data) == 1
    assert len(coach.get("/api/notes/", {"visibility": "shared"}).data) == 1


def test_newest_first(api, club):
    first = write(api, club, body="one").data["id"]
    second = write(api, club, body="two").data["id"]
    assert [n["id"] for n in api("coach").get("/api/notes/").data] == [second, first]


# --- changing -------------------------------------------------------------------------------------


def test_the_author_edits_text_and_visibility(api, club):
    note = write(api, club).data["id"]
    res = api("coach").patch(f"/api/notes/{note}/", {"body": "  Better now  ", "visibility": "shared"}, format="json")
    assert res.status_code == 200 and res.data["body"] == "Better now" and res.data["visibility"] == "shared"


def test_nobody_else_edits_it(api, club):
    note = write(api, club, visibility="shared").data["id"]
    for who in ("admin", "archer1"):
        assert api(who).patch(f"/api/notes/{note}/", {"body": "mine"}, format="json").status_code == 403, who
    assert api("b_admin").patch(f"/api/notes/{note}/", {"body": "mine"}, format="json").status_code == 404
    assert Note.objects.get().body == "Watch the bow arm"


def test_who_a_note_is_about_cannot_change(api, club):
    note = write(api, club).data["id"]
    for change in ({"archer": club["archer2"].pk}, {"team": club["b"].pk}):
        assert api("coach").patch(f"/api/notes/{note}/", change, format="json").status_code == 400
    same = api("coach").patch(f"/api/notes/{note}/", {"archer": club["archer1"].pk, "body": "ok"}, format="json")
    assert same.status_code == 200


def test_the_author_and_team_admins_delete(api, club):
    mine = write(api, club).data["id"]
    assert api("coach").delete(f"/api/notes/{mine}/").status_code == 204
    other = write(api, club, "coach").data["id"]
    assert api("admin").delete(f"/api/notes/{other}/").status_code == 204
    assert not Note.objects.exists()


def test_other_coaches_and_archers_cannot_delete(api, club):
    by_admin = write(api, club, "admin", visibility="shared").data["id"]
    assert api("coach").delete(f"/api/notes/{by_admin}/").status_code == 403, "a coach is not an admin"
    assert api("archer1").delete(f"/api/notes/{by_admin}/").status_code == 403
    assert Note.objects.count() == 1


def test_the_flags_say_what_i_may_do(api, club):
    note = write(api, club).data["id"]
    as_author = api("coach").get(f"/api/notes/{note}/").data
    as_admin = api("admin").get(f"/api/notes/{note}/").data
    assert (as_author["can_edit"], as_author["can_delete"]) == (True, True)
    assert (as_admin["can_edit"], as_admin["can_delete"]) == (False, True)
    api("coach").patch(f"/api/notes/{note}/", {"visibility": "shared"}, format="json")
    as_archer = api("archer1").get(f"/api/notes/{note}/").data
    assert (as_archer["can_edit"], as_archer["can_delete"]) == (False, False)


def test_a_note_outlives_the_session_it_is_about(api, club):
    session = make_session(club["archer1"])
    note = write(api, club, session=str(session.pk)).data["id"]
    api("archer1").delete(f"/api/sessions/{session.pk}/")
    res = api("coach").get(f"/api/notes/{note}/")
    assert res.status_code == 200 and res.data["session"] is None


def test_a_note_outlives_its_author(api, club):
    note = write(api, club).data["id"]
    club["coach"].delete()
    res = api("admin").get(f"/api/notes/{note}/")
    assert res.data["author"] is None and res.data["author_name"] == "Former coach"


# --- where I can write ------------------------------------------------------------------------------


def test_writable_teams(api, club, join):
    get = lambda who, archer: api(who).get("/api/notes/teams/", {"archer": club[archer].pk})
    assert [t["name"] for t in get("coach", "archer1").data] == ["Team A"]
    assert get("archer1", "archer2").data == []
    assert get("b_admin", "archer1").data == []
    join(club["coach"], club["b"], Role.COACH)
    join(club["archer1"], club["b"], Role.ARCHER)
    assert [t["name"] for t in get("coach", "archer1").data] == ["Team A", "Team B"]
    assert api("coach").get("/api/notes/teams/").status_code == 400
    assert api("coach").get("/api/notes/teams/", {"archer": 99999}).data == []


@pytest.mark.parametrize("url", ["/api/notes/", "/api/notes/teams/?archer=1"])
def test_login_required(client_for, db, url):
    assert client_for().get(url).status_code == 401


# --- private notes ("only me") --------------------------------------------------------------------


def test_a_private_note_is_for_its_author_alone(api, club):
    note = write(api, club, visibility="private").data["id"]
    assert note in ids(api("coach").get("/api/notes/"))
    assert api("coach").get(f"/api/notes/{note}/").status_code == 200
    # not the other coaches and admins of the team, not the archer, nobody elsewhere
    for who in ("admin", "archer1", "archer2", "b_admin", "b_archer"):
        assert api(who).get("/api/notes/").data == [], who
        assert api(who).get(f"/api/notes/{note}/").status_code == 404, who


def test_nobody_else_can_change_or_delete_a_private_note(api, club):
    note = write(api, club, visibility="private").data["id"]
    for who in ("admin", "archer1"):
        assert api(who).patch(f"/api/notes/{note}/", {"body": "x"}, format="json").status_code == 404, who
        assert api(who).delete(f"/api/notes/{note}/").status_code == 404, who
    assert Note.objects.get(pk=note).body == "Watch the bow arm"


def test_the_author_edits_and_deletes_it(api, club):
    note = write(api, club, visibility="private").data
    assert note["can_edit"] is True and note["can_delete"] is True
    res = api("coach").patch(f"/api/notes/{note['id']}/", {"visibility": "coach_only"}, format="json")
    assert res.status_code == 200
    assert note["id"] in ids(api("admin").get("/api/notes/"))  # now the other coaches see it
    again = api("coach").patch(f"/api/notes/{note['id']}/", {"visibility": "private"}, format="json")
    assert again.status_code == 200 and api("admin").get("/api/notes/").data == []
    assert api("coach").delete(f"/api/notes/{note['id']}/").status_code == 204


def test_filters_never_show_what_you_may_not_read(api, club):
    write(api, club, visibility="private")
    admin = api("admin")
    assert admin.get("/api/notes/", {"visibility": "private"}).data == []
    assert admin.get("/api/notes/", {"author": club["coach"].pk}).data == []
    assert len(api("coach").get("/api/notes/", {"visibility": "private"}).data) == 1


def test_a_private_note_survives_the_author_losing_the_coach_role(api, club):
    note = write(api, club, visibility="private").data["id"]
    TeamMember.objects.filter(user=club["coach"]).update(role=Role.ARCHER)
    assert note in ids(api("coach").get("/api/notes/"))
