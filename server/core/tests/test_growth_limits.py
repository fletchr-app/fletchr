"""The server's limits on who gets in: who creates teams, members per team, accounts (settings TEAM_CREATION_OPEN, MAX_*)."""

from core.models import ClaimCode, Invite, Role, Team, TeamMember, User

REGISTER = {"email": "new@example.com", "password": "correct-horse-battery", "name": "New Archer"}


def accounts():
    return User.objects.filter(is_managed=False).count()


# Creating teams


def test_with_creation_closed_only_allowed_accounts_and_superusers_create_teams(settings, client_for, make_user):
    settings.TEAM_CREATION_OPEN = False
    plain = make_user("plain@x.test")
    res = client_for(plain).post("/api/teams/", {"name": "Mine"}, format="json")
    assert res.status_code == 403 and "not open" in str(res.data)
    assert client_for(plain).get("/api/me/").data["can_create_teams"] is False

    allowed = make_user("allowed@x.test")
    allowed.can_create_teams = True
    allowed.save()
    assert client_for(allowed).post("/api/teams/", {"name": "Allowed"}, format="json").status_code == 201
    assert client_for(allowed).get("/api/me/").data["can_create_teams"] is True

    boss = User.objects.create_superuser("boss@x.test", "correct-horse-battery")
    assert client_for(boss).post("/api/teams/", {"name": "Boss"}, format="json").status_code == 201
    assert set(Team.objects.values_list("name", flat=True)) == {"Allowed", "Boss"}


def test_with_creation_open_everybody_creates_teams(settings, client_for, make_user):
    settings.TEAM_CREATION_OPEN = True
    me = make_user("plain@x.test")
    assert client_for(me).get("/api/me/").data["can_create_teams"] is True
    assert client_for(me).post("/api/teams/", {"name": "Mine"}, format="json").status_code == 201


# Members per team (team A of `club` has four: admin, coach, two archers)


def test_a_full_team_refuses_invites_new_ones_and_profiles(settings, client_for, club, invite, make_user):
    settings.MAX_TEAM_MEMBERS = 4
    team = club["a"]
    newcomer = make_user("newcomer@x.test")
    res = client_for(newcomer).post("/api/invites/redeem/", {"invite_code": invite.code}, format="json")
    assert res.status_code == 400 and "limit of 4 members" in str(res.data)
    assert not TeamMember.objects.filter(team=team, user=newcomer).exists()
    assert Invite.objects.get(pk=invite.pk).used_at is None  # still usable once there is room

    admin = client_for(club["admin"])
    assert admin.post(f"/api/teams/{team.pk}/invites/", {"role": "archer"}, format="json").status_code == 400
    assert admin.post(f"/api/teams/{team.pk}/archers/", {"name": "Max"}, format="json").status_code == 400
    assert TeamMember.objects.filter(team=team).count() == 4

    settings.MAX_TEAM_MEMBERS = 5
    assert client_for(newcomer).post("/api/invites/redeem/", {"invite_code": invite.code}, format="json").status_code in (200, 201)


def test_registering_into_a_full_team_leaves_no_account(settings, client_for, club, invite):
    settings.MAX_TEAM_MEMBERS = 4
    before = accounts()
    res = client_for().post("/api/register/", {**REGISTER, "invite_code": invite.code})
    assert res.status_code == 400 and "limit of 4 members" in str(res.data)
    assert accounts() == before


def test_taking_over_a_profile_needs_no_room(settings, client_for, club):
    """The archer takes the profile's place in the team, so a full team does not stop it."""
    team = club["a"]
    profile = client_for(club["coach"]).post(f"/api/teams/{team.pk}/archers/", {"name": "Max"}, format="json").data
    settings.MAX_TEAM_MEMBERS = 5  # full with the profile
    code = ClaimCode.objects.create(profile_id=profile["user_id"], team=team, created_by=club["coach"])
    res = client_for().post("/api/register/", {**REGISTER, "invite_code": code.code})
    assert res.status_code == 201
    assert TeamMember.objects.filter(team=team).count() == 5


def test_no_limit_by_default(client_for, club, invite, make_user):
    for i in range(3):
        client_for(club["admin"]).post(f"/api/teams/{club['a'].pk}/archers/", {"name": f"P{i}"}, format="json")
    res = client_for(make_user("newcomer@x.test")).post("/api/invites/redeem/", {"invite_code": invite.code}, format="json")
    assert res.status_code in (200, 201)


# Accounts on the server


def test_a_full_server_refuses_new_accounts_but_not_profiles(settings, client_for, club, invite):
    settings.MAX_ACCOUNTS = accounts()
    res = client_for().post("/api/register/", {**REGISTER, "invite_code": invite.code})
    assert res.status_code == 403 and "no new accounts" in str(res.data)
    assert not User.objects.filter(email="new@example.com").exists()
    # A profile without an account is not an account: coaches still add them (the team cap limits those).
    assert client_for(club["coach"]).post(f"/api/teams/{club['a'].pk}/archers/", {"name": "Max"}, format="json").status_code == 201

    settings.MAX_ACCOUNTS = accounts() + 1
    assert client_for().post("/api/register/", {**REGISTER, "invite_code": invite.code}).status_code == 201


def test_deactivated_accounts_do_not_count(settings, client_for, club, invite):
    club["archer1"].is_active = False
    club["archer1"].save()
    settings.MAX_ACCOUNTS = accounts()
    assert client_for().post("/api/register/", {**REGISTER, "invite_code": invite.code}).status_code == 201
