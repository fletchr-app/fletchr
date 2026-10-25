import json

import pytest
from django.conf import settings

from targets.catalogue import get_face
from targets.centred import MIN_ARROWS, centred_score

VECTORS = json.load(open(settings.SHARED_DIR / "centred-vectors.json", encoding="utf-8"))["vectors"]


@pytest.mark.parametrize("v", VECTORS, ids=lambda v: f"{v['face']} {v['why'][:50]}")
def test_shared_centred_vectors(v):
    result = centred_score(get_face(v["face"]), v["points"])
    if v["expect"] is None:
        assert result is None
        return
    assert (result.n, result.real, result.centred) == (v["expect"]["n"], v["expect"]["real"], v["expect"]["centred"])
    assert (result.centre_x, result.centre_y) == pytest.approx(tuple(v["expect"]["centre"]), abs=1e-5)


def test_the_minimum_is_six_arrows():
    assert MIN_ARROWS == 6
    face = get_face("wa-40")
    assert centred_score(face, [(0.2, 0)] * 5) is None
    assert centred_score(face, [(0.2, 0)] * 6) is not None
