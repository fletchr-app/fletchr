"""Who sees a session (specs/design/session-visibility.md). The weak spot is a coach-facing route that forgets the filter.

`test_every_route_is_classified` fails for a route that is in neither `COVERED` nor `NO_TRAINING_DATA`, so a new route has to be
looked at. The matrix then runs every covered route as five viewers against a private and a shared session.
"""

import uuid
from datetime import timedelta

import pytest
from django.urls import URLResolver, get_resolver
from django.utils import timezone

from core.models import Role, TeamMember
from media.models import Media
from notes.models import Note
from privacy.tests.test_media import give
from training.models import End, SessionTombstone, Shot, TrainingEvent, TrainingSession, VolumeEntry

VIEWERS = ["archer1", "coach", "b_admin", "archer2", "b_archer"]  # the owner, their coach, the coach of another team, a teammate, a stranger
SHOTS = {"P": 7, "S": 6}  # the private and the shared session (6 plotted arrows each is what the arrow statistics need)
VOLUME = {"P": 7, "S": 11}


def seen_by(viewer, labels):
    """What a viewer may see of `labels`: the owner everything, the coach of the team what is shared, nobody else anything."""
    if viewer == "archer1":
        return set(labels)
    if viewer == "coach":
        return {x for x in labels if x not in PRIVATE_LABELS}
    return set()


PRIVATE_LABELS = {"P", "cP", "cLP", "nP", "nCP"}


def arrows_seen(viewer):
    return {"archer1": sum(SHOTS.values()), "coach": SHOTS["S"]}.get(viewer, 0)


def arrows_and_volume_seen(viewer):
    return {"archer1": sum(SHOTS.values()) + sum(VOLUME.values()), "coach": SHOTS["S"] + VOLUME["S"]}.get(viewer, 0)


def add_session(owner, visibility, label, event):
    started = timezone.now() - timedelta(hours=2 if label == "P" else 1)
    session = TrainingSession.objects.create(
        id=uuid.uuid4(), owner=owner, started_at=started, ended_at=started + timedelta(minutes=30), type="scoring", visibility=visibility, event=event
    )
    end = End.objects.create(id=uuid.uuid4(), session=session, index=0, distance_m=18, face="wa-40", arrows_per_end=12)
    for i in range(SHOTS[label]):
        Shot.objects.create(id=uuid.uuid4(), end=end, index=i, value=9, x=0.05 * i, y=0.1, arrow_number=i + 1)
    VolumeEntry.objects.create(id=uuid.uuid4(), session=session, distance_m=18, arrow_count=VOLUME[label])
    return session


def note(author, archer, team, label, **extra):
    return Note.objects.create(author=author, archer=archer, team=team, body=label, visibility=Note.Visibility.SHARED, **extra)


@pytest.fixture
def world(club):
    owner, coach = club["archer1"], club["coach"]
    team = club["a"]
    club["a"].show_ranking = True
    club["a"].save()
    now = timezone.now()
    event = TrainingEvent.objects.create(id=uuid.uuid4(), team=team, name="Squad", start=now - timedelta(hours=3), end=now, time_zone="UTC")
    p, s = add_session(owner, "me", "P", event), add_session(owner, "coaches", "S", event)
    clips = {
        "cP": give(owner, "photo", session=p),
        "cS": give(owner, "photo", session=s),
        "cL": give(owner, "photo"),  # in no session: follows the archer's default, `coaches`
        "cLP": give(owner, "photo"),
    }
    Media.objects.filter(pk=clips["cLP"].pk).update(visibility="me")
    Media.objects.filter(pk__in=[c.pk for c in clips.values()]).update(event=event)
    notes = {
        "nP": note(coach, owner, team, "nP", session=p),
        "nS": note(coach, owner, team, "nS", session=s),
        "nCP": note(coach, owner, team, "nCP", session=p, media=clips["cP"]),
        "nCS": note(coach, owner, team, "nCS", session=s, media=clips["cS"]),
    }
    return {"club": club, "P": p, "S": s, "event": event, "clips": clips, "notes": notes}


def labels_of_sessions(world):
    return {str(world["P"].pk): "P", str(world["S"].pk): "S"}


def labels_of_clips(world):
    return {str(c.pk): label for label, c in world["clips"].items()}


# --- the routes: each returns what a viewer can reach, as labels or an arrow count -----------------------------------


def r_sessions_list(c, w):
    ids = [x["id"] for x in c.get("/api/sessions/", {"owner": w["club"]["archer1"].pk}).data]
    return {labels_of_sessions(w)[i] for i in ids}


def r_sessions_updated_after(c, w):
    ids = [x["id"] for x in c.get("/api/sessions/", {"owner": w["club"]["archer1"].pk, "updated_after": "2000-01-01T00:00:00Z"}).data]
    return {labels_of_sessions(w)[i] for i in ids}


def r_session_detail(c, w):
    return {label for sid, label in labels_of_sessions(w).items() if c.get(f"/api/sessions/{sid}/").status_code == 200}


def r_end_write(c, w):
    """404 is "not there"; a 403 (not yours to change) or a 400 (an empty body) means the route found the session."""
    return {label for sid, label in labels_of_sessions(w).items() if c.put(f"/api/sessions/{sid}/ends/{uuid.uuid4()}/", {}, format="json").status_code != 404}


def r_volume_write(c, w):
    return {label for sid, label in labels_of_sessions(w).items() if c.put(f"/api/sessions/{sid}/volume/{uuid.uuid4()}/", {}, format="json").status_code != 404}


def r_session_put(c, w):
    """The `PUT` of an existing session id: a coach who may not see it gets 404, one who may gets 403 (not theirs)."""
    return {label for sid, label in labels_of_sessions(w).items() if c.put(f"/api/sessions/{sid}/", {"started_at": "2026-10-18T09:00:00Z"}, format="json").status_code != 404}


def r_gone(c, w):
    """Ids merged into a session: only those merged into one the viewer may see."""
    owner = w["club"]["archer1"]
    by_target = {}
    for label in ("P", "S"):
        row = SessionTombstone.objects.create(id=uuid.uuid4(), owner=owner, merged_into=w[label])
        by_target[str(row.pk)] = label
    ids = [x["id"] for x in c.get("/api/sessions/gone/", {"owner": owner.pk}).data]
    return {by_target[i] for i in ids if i in by_target}


def r_stats(c, w):
    res = c.get("/api/stats/", {"owner": w["club"]["archer1"].pk})
    return sum(x["arrows"] for x in res.data["scores"]) if res.status_code == 200 else 0


def r_positions(c, w):
    res = c.get("/api/stats/positions/", {"owner": w["club"]["archer1"].pk, "face": "wa-40", "distance_m": "18"})
    return res.data["arrows"] if res.status_code == 200 else 0


def r_arrow_stats(c, w):
    res = c.get("/api/stats/arrows/", {"owner": w["club"]["archer1"].pk})
    if res.status_code != 200:
        return 0
    return sum(a["shots"] for group in res.data for s in group["sets"] for a in s["arrows"])


def r_overview(c, w):
    res = c.get(f"/api/teams/{w['club']['a'].pk}/overview/")
    if res.status_code != 200:
        return 0
    row = next(r for r in res.data if r["user_id"] == w["club"]["archer1"].pk)
    last = row["last_session"] and row["last_session"]["id"]
    assert last in (None, str(w["S"].pk)), "the last session of the overview is a private one"
    return row["arrows_7d"]


def r_ranking(c, w):
    res = c.get(f"/api/teams/{w['club']['a'].pk}/ranking/")
    if res.status_code != 200:
        return 0
    return next(r for r in res.data["rows"] if r["user_id"] == w["club"]["archer1"].pk)["arrows"]


def r_media_list(c, w):
    ids = [x["id"] for x in c.get("/api/media/", {"owner": w["club"]["archer1"].pk}).data]
    return {labels_of_clips(w)[i] for i in ids}


def r_media_detail(c, w):
    return {label for i, label in labels_of_clips(w).items() if c.get(f"/api/media/{i}/").status_code == 200}


def r_media_file(c, w):
    return {label for i, label in labels_of_clips(w).items() if c.get(f"/api/media/{i}/file/").status_code == 200}


def r_media_thumbnail(c, w):
    return {label for i, label in labels_of_clips(w).items() if c.get(f"/api/media/{i}/thumbnail/").status_code == 200}


def r_media_by_session(c, w):
    """`?session=` also brings the owner's clips of the session's event that are in no session."""
    out = set()
    for sid in labels_of_sessions(w):
        out |= {labels_of_clips(w)[x["id"]] for x in c.get("/api/media/", {"session": sid}).data}
    return out


def r_notes_list(c, w):
    labels = {str(n.pk): label for label, n in w["notes"].items()}
    return {labels[str(x["id"])] for x in c.get("/api/notes/", {"archer": w["club"]["archer1"].pk}).data if str(x["id"]) in labels}


def r_notes_by_session(c, w):
    labels = {str(n.pk): label for label, n in w["notes"].items()}
    out = set()
    for sid in labels_of_sessions(w):
        out |= {labels[str(x["id"])] for x in c.get("/api/notes/", {"session": sid}).data if str(x["id"]) in labels}
    return out


def r_note_detail(c, w):
    return {label for label, n in w["notes"].items() if c.get(f"/api/notes/{n.pk}/").status_code == 200}


# Routes that give back a set of labels (the owner reaches all, the coach of the team what is shared, nobody else anything) or a count.
LABEL_ROUTES = {
    "api/sessions/": (r_sessions_list, ["P", "S"]),
    "api/sessions/ (updated_after)": (r_sessions_updated_after, ["P", "S"]),
    "api/sessions/<uuid:session_id>/ (get)": (r_session_detail, ["P", "S"]),
    "api/sessions/<uuid:session_id>/ (put)": (r_session_put, ["P", "S"]),
    "api/sessions/<uuid:session_id>/ends/<uuid:end_id>/": (r_end_write, ["P", "S"]),
    "api/sessions/<uuid:session_id>/volume/<uuid:entry_id>/": (r_volume_write, ["P", "S"]),
    "api/sessions/gone/": (r_gone, ["P", "S"]),
    "api/media/": (r_media_list, ["cP", "cS", "cL", "cLP"]),
    "api/media/ (session)": (r_media_by_session, ["cP", "cS", "cL", "cLP"]),
    "api/media/<uuid:media_id>/": (r_media_detail, ["cP", "cS", "cL", "cLP"]),
    "api/media/<uuid:media_id>/file/": (r_media_file, ["cP", "cS", "cL", "cLP"]),
    "api/media/<uuid:media_id>/thumbnail/": (r_media_thumbnail, ["cP", "cS", "cL", "cLP"]),
    "api/^notes/$": (r_notes_list, ["nP", "nS", "nCP", "nCS"]),
    "api/^notes/$ (session)": (r_notes_by_session, ["nP", "nS", "nCP", "nCS"]),
    "api/^notes/(?P<pk>[^/.]+)/$": (r_note_detail, ["nP", "nS", "nCP", "nCS"]),
}
COUNT_ROUTES = {
    "api/stats/": (r_stats, arrows_seen),
    "api/stats/positions/": (r_positions, arrows_seen),
    "api/stats/arrows/": (r_arrow_stats, arrows_seen),
}
COACH_COUNT_ROUTES = {  # for coaches only: the owner is an archer and gets 403
    "api/teams/<int:team_id>/overview/": (r_overview, lambda viewer: arrows_and_volume_seen("coach") if viewer == "coach" else 0),
    "api/teams/<int:team_id>/ranking/": (r_ranking, lambda viewer: arrows_and_volume_seen("coach") if viewer == "coach" else 0),
}
# Routes that carry no training data of another person, and why. A new route lands here or in the matrix above.
NO_TRAINING_DATA = {
    "api/health/", "api/gone/", "api/register/", "api/auth/google/", "api/invites/redeem/", "api/codes/preview/", "api/claims/redeem/",
    "api/password-reset/", "api/password-reset/confirm/", "api/token/", "api/token/refresh/", "api/token/blacklist/", "api/schema/", "api/faces/",
    "api/me/", "api/me/avatar/", "api/me/password/", "api/me/email/", "api/me/delete-data/", "api/me/delete-account/",
    "api/me/export/", "api/me/export/media/", "api/me/export/media/file/",  # own data only
    "api/users/<int:user_id>/avatar/", "api/archers/<int:user_id>/", "api/archers/<int:user_id>/video-consent/",
    "api/teams/", "api/teams/<int:team_id>/", "api/teams/<int:team_id>/membership/", "api/teams/<int:team_id>/members/",
    "api/teams/<int:team_id>/members/<int:user_id>/", "api/teams/<int:team_id>/archers/", "api/teams/<int:team_id>/archers/<int:user_id>/",
    "api/teams/<int:team_id>/archers/<int:user_id>/avatar/", "api/teams/<int:team_id>/archers/<int:user_id>/claim-code/",
    "api/teams/<int:team_id>/invites/", "api/teams/<int:team_id>/invites/<int:pk>/",
    "api/bows/<uuid:uid>/", "api/arrow-sets/<uuid:uid>/", "api/^bows/$", "api/^bows/(?P<pk>[^/.]+)/$", "api/^bows/(?P<pk>[^/.]+)/revisions/$",
    "api/^arrow-sets/$", "api/^arrow-sets/(?P<pk>[^/.]+)/$", "api/^arrow-sets/(?P<pk>[^/.]+)/revisions/$", "api/setups/", "api/setups/<int:pk>/",  # equipment is not part of a session's audience
    "api/slots/", "api/slots/<uuid:slot_id>/", "api/events/agenda/", "api/events/<uuid:event_id>/",  # the schedule of a team
    "api/notes/teams/", "api/teams/<int:team_id>/evaluation-templates/", "api/evaluation-templates/<int:pk>/",
    "api/^evaluations/$", "api/^evaluations/(?P<pk>[^/.]+)/$",  # evaluations do not read sessions; their clip links are tested below
    "api/notes/<uuid:uid>/",  # write only, author only: tested below
}
COVERED_ELSEWHERE = {"api/events/<uuid:event_id>/archers/", "api/events/<uuid:event_id>/attach/", "api/events/mine/"}


def all_routes():
    def walk(patterns, prefix=""):
        for p in patterns:
            if isinstance(p, URLResolver):
                yield from walk(p.url_patterns, prefix + str(p.pattern))
            else:
                yield prefix + str(p.pattern)

    return {r for r in walk(get_resolver().url_patterns) if not r.startswith("admin/")}


def test_every_route_is_classified():
    covered = {name.split(" (")[0] for name in [*LABEL_ROUTES, *COUNT_ROUTES, *COACH_COUNT_ROUTES]}
    known = covered | NO_TRAINING_DATA | COVERED_ELSEWHERE
    unclassified = all_routes() - known
    assert not unclassified, f"routes that are not in the visibility matrix (tests/test_visibility.py): {sorted(unclassified)}. Filter them through visible_to and add them."
    assert not known - all_routes(), f"entries for routes that no longer exist: {sorted(known - all_routes())}"


@pytest.mark.parametrize("viewer", VIEWERS)
@pytest.mark.parametrize("name", sorted(LABEL_ROUTES))
def test_label_routes(name, viewer, world, client_for):
    route, labels = LABEL_ROUTES[name]
    got = route(client_for(world["club"][viewer]), world)
    expected = seen_by(viewer, labels)  # a write route answers 403 (not yours) on a shared session: that counts as reached
    assert got == expected, f"{viewer} reaches {sorted(got)} through {name}, expected {sorted(expected)}"


@pytest.mark.parametrize("viewer", VIEWERS)
@pytest.mark.parametrize("name", sorted(COUNT_ROUTES))
def test_stats_routes(name, viewer, world, client_for):
    route, expected = COUNT_ROUTES[name]
    assert route(client_for(world["club"][viewer]), world) == expected(viewer), f"{viewer} through {name}"


@pytest.mark.parametrize("viewer", VIEWERS)
@pytest.mark.parametrize("name", sorted(COACH_COUNT_ROUTES))
def test_team_routes(name, viewer, world, client_for):
    route, expected = COACH_COUNT_ROUTES[name]
    assert route(client_for(world["club"][viewer]), world) == expected(viewer), f"{viewer} through {name}"


def test_the_owner_changing_nothing_is_not_blocked(world, client_for):
    """The owner reaches the private session on every route they may use (so a filter that is too tight shows up too)."""
    c = client_for(world["club"]["archer1"])
    assert c.get(f"/api/sessions/{world['P'].pk}/").status_code == 200
    assert c.get("/api/stats/").status_code == 200


# --- events ---------------------------------------------------------------------------------------------------------


def test_event_participants_count_shared_sessions_notes_and_clips_only(world, client_for):
    res = client_for(world["club"]["coach"]).get(f"/api/events/{world['event'].pk}/archers/")
    [row] = [r for r in res.data if r["user_id"] == world["club"]["archer1"].pk]
    assert row["sessions"] == [str(world["S"].pk)]
    assert (row["notes"], row["media"]) == (0, 2)  # the notes about a session are not "event" notes here; the clips cS and cL
    for hidden in ("P",):
        assert str(world[hidden].pk) not in row["sessions"]


def test_the_attach_of_an_event_cannot_use_a_private_session(world, client_for):
    c = client_for(world["club"]["coach"])
    body = {"archer": world["club"]["archer1"].pk, "session": str(world["P"].pk)}
    assert c.post(f"/api/events/{world['event'].pk}/attach/", body, format="json").status_code == 404
    assert client_for(world["club"]["archer1"]).post(f"/api/events/{world['event'].pk}/attach/", body, format="json").status_code == 200


def test_events_mine_lists_only_what_the_coach_may_see_of_the_loose_rows(world, client_for):
    coach = client_for(world["club"]["coach"])
    query = {"archer": world["club"]["archer1"].pk}
    assert coach.get("/api/events/mine/", query).data == []  # the event is linked to a session the coach can see
    TrainingSession.objects.filter(pk=world["S"].pk).update(event=None)
    [row] = coach.get("/api/events/mine/", query).data
    assert (row["notes"], row["media"]) == (0, 1)  # the clip in no session that is shared (cL), not the private one (cLP)


# --- stats numbers, in words ---------------------------------------------------------------------------------------------


def test_a_private_session_does_not_change_the_coachs_numbers_but_the_owners(world, client_for):
    owner, coach = client_for(world["club"]["archer1"]), client_for(world["club"]["coach"])
    before = r_stats(coach, world), r_stats(owner, world)
    TrainingSession.objects.filter(pk=world["P"].pk).update(visibility="coaches")
    after = r_stats(coach, world), r_stats(owner, world)
    assert before == (6, 13)
    assert after == (13, 13)


# --- writes -----------------------------------------------------------------------------------------------------------


def test_a_coach_cannot_write_a_note_on_a_private_session_end_or_clip(world, club, client_for):
    c = client_for(club["coach"])
    owner = club["archer1"].pk
    for extra in ({"session": str(world["P"].pk)}, {"media": str(world["clips"]["cP"].pk)}):
        body = {"archer": owner, "body": "Hello", **extra}
        assert c.post("/api/notes/", body, format="json").status_code == 400, extra
        assert c.put(f"/api/notes/{uuid.uuid4()}/", body, format="json").status_code == 400, extra
    ok = c.post("/api/notes/", {"archer": owner, "body": "Hello", "session": str(world["S"].pk)}, format="json")
    assert ok.status_code == 201


def test_a_coachs_own_note_on_a_session_that_became_private_is_hidden_from_them_and_comes_back(world, club, client_for):
    c = client_for(club["coach"])
    uid = world["notes"]["nS"].uid
    pk = world["notes"]["nS"].pk
    assert c.get(f"/api/notes/{pk}/").status_code == 200
    TrainingSession.objects.filter(pk=world["S"].pk).update(visibility="me")
    assert c.get(f"/api/notes/{pk}/").status_code == 404
    assert c.put(f"/api/notes/{uid}/", {"archer": club["archer1"].pk, "body": "Changed"}, format="json").status_code == 404
    assert c.patch(f"/api/notes/{pk}/", {"body": "Changed"}, format="json").status_code == 404
    assert c.delete(f"/api/notes/{pk}/").status_code == 404
    TrainingSession.objects.filter(pk=world["S"].pk).update(visibility="coaches")
    assert c.get(f"/api/notes/{pk}/").status_code == 200


def test_a_coach_cannot_move_a_clip_into_a_private_session(world, club, client_for):
    clip = world["clips"]["cL"]
    Media.objects.filter(pk=clip.pk).update(uploaded_by=club["coach"])
    res = client_for(club["coach"]).put(f"/api/media/{clip.pk}/", {"session": str(world["P"].pk)}, format="multipart")
    assert res.status_code == 400 and "session" in res.data
    assert client_for(club["coach"]).put(f"/api/media/{clip.pk}/", {"session": str(world["S"].pk)}, format="multipart").status_code == 200


def test_an_evaluation_leaves_out_a_clip_the_coach_may_not_see(world, club, client_for):
    c = client_for(club["coach"])
    form = c.get(f"/api/teams/{club['a'].pk}/evaluation-templates/").data[0]
    clip = world["clips"]["cS"].pk
    score = {"criterion": form["criteria"][0]["key"], "rating": 4, "media": str(clip), "frame": 0}
    made = c.post("/api/evaluations/", {"archer": club["archer1"].pk, "template": form["id"], "scores": [score]}, format="json")
    assert made.status_code == 201, made.data
    assert made.data["scores"][0]["media"] == clip
    TrainingSession.objects.filter(pk=world["S"].pk).update(visibility="me")
    shown = c.get(f"/api/evaluations/{made.data['id']}/")
    assert shown.status_code == 200 and shown.data["scores"][0]["media"] is None
    TrainingSession.objects.filter(pk=world["P"].pk).update(visibility="coaches")
    refused = c.post("/api/evaluations/", {"archer": club["archer1"].pk, "template": form["id"], "scores": [{**score, "media": str(clip)}]}, format="json")
    assert refused.status_code == 400  # the clip is not one the coach may see now


def test_deleted_sessions_of_somebody_else_say_nothing_to_a_coach(world, club, client_for):
    for label in ("P", "S"):
        SessionTombstone.objects.create(id=uuid.uuid4(), owner=club["archer1"], merged_into=None)
    assert client_for(club["coach"]).get("/api/sessions/gone/", {"owner": club["archer1"].pk}).data == []
    assert len(client_for(club["archer1"]).get("/api/sessions/gone/").data) == 2


def test_a_coach_can_still_read_their_own_tombstones(world, club, client_for):
    mine = SessionTombstone.objects.create(id=uuid.uuid4(), owner=club["coach"], merged_into=None)
    assert [x["id"] for x in client_for(club["coach"]).get("/api/sessions/gone/", {"owner": club["coach"].pk}).data] == [str(mine.pk)]


# --- clips without a session ------------------------------------------------------------------------------------------


def test_a_clip_without_a_session_follows_the_archers_default_unless_it_has_its_own(world, club, client_for):
    coach = client_for(club["coach"])
    ids = lambda: {x["id"] for x in coach.get("/api/media/", {"owner": club["archer1"].pk}).data}  # noqa: E731
    cl, clp = str(world["clips"]["cL"].pk), str(world["clips"]["cLP"].pk)
    assert cl in ids() and clp not in ids()
    club["archer1"].profile.training_visibility = "me"
    club["archer1"].profile.save()
    assert cl not in ids() and clp not in ids()
    Media.objects.filter(pk=cl).update(visibility="coaches")  # its own value wins over the default
    assert cl in ids()


def test_a_clip_in_a_session_follows_the_session_not_its_own_value(world, club, client_for):
    clip = world["clips"]["cS"]
    Media.objects.filter(pk=clip.pk).update(visibility="coaches")
    TrainingSession.objects.filter(pk=world["S"].pk).update(visibility="me")
    assert str(clip.pk) not in {x["id"] for x in client_for(club["coach"]).get("/api/media/", {"owner": club["archer1"].pk}).data}


# --- merge --------------------------------------------------------------------------------------------------------------


def test_a_coach_opening_a_session_over_a_private_one_is_not_merged_into_it(club, client_for):
    owner = club["archer1"]
    started = timezone.now() - timedelta(hours=2)
    private = TrainingSession.objects.create(id=uuid.uuid4(), owner=owner, started_at=started, ended_at=started + timedelta(hours=1), type="scoring", visibility="me")
    End.objects.create(id=uuid.uuid4(), session=private, index=0, distance_m=18, face="wa-40", arrows_per_end=3)
    sid = str(uuid.uuid4())
    res = client_for(club["coach"]).put(f"/api/sessions/{sid}/?owner={owner.pk}", {"started_at": (started + timedelta(minutes=10)).isoformat()}, format="json")
    assert res.status_code == 201 and res.data["id"] == sid  # stays its own session: merging would hand the coach the private one
    assert res.data["visibility"] == "coaches" and TrainingSession.objects.filter(pk=private.pk, visibility="me").exists()


def test_the_merge_keeps_the_archers_visibility(club):
    from training.merge import merge

    owner, coach = club["archer1"], club["coach"]
    started = timezone.now() - timedelta(hours=2)
    mine = TrainingSession.objects.create(id=uuid.uuid4(), owner=owner, started_at=started, ended_at=started + timedelta(hours=1), type="scoring", visibility="me", opened_by=owner)
    End.objects.create(id=uuid.uuid4(), session=mine, index=0, distance_m=18, face="wa-40", arrows_per_end=3)
    theirs = TrainingSession.objects.create(id=uuid.uuid4(), owner=owner, started_at=started, type="", visibility="coaches", opened_by=coach)
    merge(theirs, mine)
    mine.refresh_from_db()
    assert mine.visibility == "me" and not TrainingSession.objects.filter(pk=theirs.pk).exists()
