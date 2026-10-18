import json

import pytest
from django.conf import settings

from targets.catalogue import get_face, load_faces
from targets.scoring import Score, score

VECTORS = json.load(open(settings.SHARED_DIR / "scoring-vectors.json", encoding="utf-8"))["vectors"]


@pytest.mark.parametrize("v", VECTORS, ids=lambda v: f"{v['face']} ({v['x']:.4f},{v['y']:.4f}) {v['why']}")
def test_shared_scoring_vectors(v):
    face = get_face(v["face"])
    expected = Score(v["expect"]["value"], v["expect"]["is_x"], v["expect"]["is_miss"])
    assert score(face, v["x"], v["y"]) == expected


def test_vectors_cover_every_scored_face_kind():
    used = {v["face"] for v in VECTORS}
    assert {"wa-122", "wa-40", "wa-40-compound", "wa-80-6ring", "wa-field-80", "blank"} <= used


def test_score_is_the_same_in_every_direction():
    face = get_face("wa-122")
    for x, y in [(0.15, 0), (-0.15, 0), (0, 0.15), (0, -0.15), (0.106, 0.106), (-0.106, -0.106)]:
        assert score(face, x, y).value == 9


def test_catalogue_is_well_formed():
    faces = load_faces()
    slugs = [f["slug"] for f in faces]
    assert len(slugs) == len(set(slugs))
    for face in faces:
        rings = face["rings"]
        assert face["spots"], face["slug"]
        assert [r["diameter_cm"] for r in rings] == sorted(r["diameter_cm"] for r in rings), face["slug"]
        assert len({r["diameter_cm"] for r in rings}) == len(rings), face["slug"]
        values = [r["value"] for r in rings]
        assert values == sorted(values, reverse=True), face["slug"]
        if face["kind"] == "blank":
            assert rings == []
        else:
            assert rings[0]["diameter_cm"] > 0
        if "x_diameter_cm" in face:
            assert face["x_diameter_cm"] < rings[0]["diameter_cm"], face["slug"]
            assert rings[0]["value"] == 10


def test_faces_endpoint_requires_login_and_returns_the_catalogue(client_for, make_user):
    assert client_for().get("/api/faces/").status_code == 401
    res = client_for(make_user("a@x.test")).get("/api/faces/")
    assert res.status_code == 200
    assert {f["slug"] for f in res.data} == {f["slug"] for f in load_faces()}
