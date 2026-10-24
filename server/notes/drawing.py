"""The drawing on a frame of a clip. The app draws it; the server only checks that it is what it says it is."""

import re

from django.utils.translation import gettext

VERSION = 1
MAX_SHAPES = 40
POINTS = {"line": 2, "angle": 3, "circle": 2}  # an angle: end, corner, end; a circle: centre, a point on it
COLOUR = re.compile(r"#[0-9a-fA-F]{6}")


def check_drawing(value):
    """The drawing as it is to be stored, or a ValueError with the reason."""
    if value is None:
        return None
    if not isinstance(value, dict) or value.get("v") != VERSION or not isinstance(value.get("shapes"), list):
        raise ValueError(gettext("This is not a drawing"))
    shapes = value["shapes"]
    if len(shapes) > MAX_SHAPES:
        raise ValueError(gettext("A drawing can have %(n)s shapes at most") % {"n": MAX_SHAPES})
    clean = []
    for shape in shapes:
        if not isinstance(shape, dict) or shape.get("t") not in POINTS:
            raise ValueError(gettext("This is not a drawing"))
        points = shape.get("p")
        if not isinstance(points, list) or len(points) != POINTS[shape["t"]]:
            raise ValueError(gettext("This is not a drawing"))
        cleaned = []
        for point in points:
            ok = isinstance(point, list) and len(point) == 2 and all(isinstance(c, (int, float)) and not isinstance(c, bool) and 0 <= c <= 1 for c in point)
            if not ok:
                raise ValueError(gettext("This is not a drawing"))
            cleaned.append([round(float(point[0]), 5), round(float(point[1]), 5)])
        item = {"t": shape["t"], "p": cleaned}
        if "c" in shape:
            if not isinstance(shape["c"], str) or not COLOUR.fullmatch(shape["c"]):
                raise ValueError(gettext("This is not a drawing"))
            item["c"] = shape["c"].lower()
        clean.append(item)
    return {"v": VERSION, "shapes": clean}
