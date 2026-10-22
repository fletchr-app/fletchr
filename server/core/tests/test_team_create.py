from core.models import Role, Team, TeamMember

URL = "/api/teams/"


def test_a_signed_in_user_creates_a_team_and_becomes_its_admin(client_for, make_user):
    me = make_user("new@x.test")
    client = client_for(me)
    res = client.post(URL, {"name": "  Archery Göttingen "}, format="json")
    assert res.status_code == 201
    assert (res.data["name"], res.data["my_role"], res.data["also_shoots"]) == ("Archery Göttingen", "admin", False)
    assert TeamMember.objects.get(team__name="Archery Göttingen", user=me).role == Role.ADMIN
    teams = client.get(URL).data
    teams = teams["results"] if isinstance(teams, dict) else teams
    assert [t["name"] for t in teams] == ["Archery Göttingen"]


def test_the_new_admin_can_use_the_team_screens(client_for, make_user):
    client = client_for(make_user("new@x.test"))
    team = client.post(URL, {"name": "Club"}, format="json").data
    invite = client.post(f"{URL}{team['id']}/invites/", {"role": "coach"}, format="json")
    assert invite.status_code == 201
    assert client.post(f"{URL}{team['id']}/archers/", {"name": "Max"}, format="json").status_code == 201


def test_a_team_needs_a_name_and_a_login(client_for, make_user):
    assert client_for().post(URL, {"name": "Club"}, format="json").status_code == 401
    client = client_for(make_user("new@x.test"))
    assert client.post(URL, {"name": "   "}, format="json").status_code == 400
    assert client.post(URL, {}, format="json").status_code == 400
    assert not Team.objects.exists()


def test_a_person_may_administer_at_most_five_teams(client_for, make_user, join):
    me = make_user("new@x.test")
    for i in range(5):
        join(me, Team.objects.create(name=f"Old {i}"), Role.ADMIN)
    res = client_for(me).post(URL, {"name": "One too many"}, format="json")
    assert res.status_code == 400 and "5 teams" in str(res.data)
    # being a coach or archer elsewhere does not count
    other = make_user("other@x.test")
    for i in range(5):
        join(other, Team.objects.create(name=f"Coach {i}"), Role.COACH)
    assert client_for(other).post(URL, {"name": "Mine"}, format="json").status_code == 201


def test_creating_teams_is_rate_limited_but_reading_is_not(client_for, make_user, settings):
    me = make_user("new@x.test")
    client = client_for(me)
    # the cap of five teams would stop us first, so lift it for this test
    from core import views

    views.MAX_TEAMS_PER_USER, old = 100, views.MAX_TEAMS_PER_USER
    try:
        codes = [client.post(URL, {"name": f"T{i}"}, format="json").status_code for i in range(6)]
    finally:
        views.MAX_TEAMS_PER_USER = old
    assert codes == [201, 201, 201, 201, 201, 429]
    assert all(client.get(URL).status_code == 200 for _ in range(8))
