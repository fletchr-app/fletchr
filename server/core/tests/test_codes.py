from core.models import CODE_LENGTH, INVITE_ALPHABET, ClaimCode, Invite, Role, Team, TeamMember, User, new_invite_code, normalize_code

LOOK_ALIKES = set("01OIL")


def test_codes_have_no_look_alike_characters():
    assert not LOOK_ALIKES & set(INVITE_ALPHABET) and len(INVITE_ALPHABET) == 31
    codes = {new_invite_code() for _ in range(2000)}
    assert all(len(c) == CODE_LENGTH == 12 and set(c) <= set(INVITE_ALPHABET) for c in codes)
    assert len(codes) == 2000  # and they do not repeat
    assert not any(LOOK_ALIKES & set(c) for c in codes)


def test_what_is_typed_is_cleaned_up():
    assert normalize_code(" abcd-efgh jkmn ") == "ABCDEFGHJKMN"
    assert normalize_code("ABCD_EFGH.JKMN\n") == "ABCDEFGHJKMN"
    assert normalize_code("") == ""


def test_an_invite_works_typed_in_groups_and_lower_case(client_for, club, make_user):
    invite = Invite.objects.create(team=club["a"], role=Role.ARCHER, created_by=club["admin"])
    typed = "-".join(invite.code[i : i + 4] for i in range(0, 12, 4)).lower()
    me = make_user("new@x.test")
    preview = client_for().post("/api/codes/preview/", {"invite_code": typed}, format="json")
    assert preview.status_code == 200 and preview.data["kind"] == "invite"
    res = client_for(me).post("/api/invites/redeem/", {"invite_code": f" {typed} "}, format="json")
    assert res.status_code == 201 and TeamMember.objects.filter(team=club["a"], user=me).exists()


def test_a_claim_code_works_typed_in_groups(client_for, club, make_user):
    managed = User.objects.create_managed("Max")
    TeamMember.objects.create(team=club["a"], user=managed, role=Role.ARCHER)
    claim = ClaimCode.objects.create(profile=managed, team=club["a"])
    typed = f"{claim.code[:4]} {claim.code[4:8]} {claim.code[8:]}".lower()
    assert client_for().post("/api/codes/preview/", {"invite_code": typed}, format="json").data["kind"] == "claim"
    me = make_user("max@x.test")
    assert client_for(me).post("/api/claims/redeem/", {"invite_code": typed}, format="json").status_code == 201
    assert not User.objects.filter(pk=managed.pk).exists()


def test_codes_made_before_still_work(client_for, club, make_user):
    # 10 characters with 0, O, 1 and I, as the old generator made them
    old = Invite.objects.create(team=club["a"], role=Role.ARCHER, code="AB01OI23EF", created_by=club["admin"])
    me = make_user("old@x.test")
    assert client_for(me).post("/api/invites/redeem/", {"invite_code": "ab01-oi23-ef"}, format="json").status_code == 201
    assert old.pk and Team.objects.filter(pk=club["a"].pk).exists()
