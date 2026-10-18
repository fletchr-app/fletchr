"""Score of an arrow from where it hit.

Same rules as src/lib/scoring.ts; both are tested against shared/scoring-vectors.json.

Position: x to the right, y up, relative to the centre of the spot the arrow is in,
in units where 1 is the outer edge of the face's outermost scoring ring.
"""

from dataclasses import dataclass
from math import hypot

# Rounding noise from the normalised coordinates must not push an arrow on a line to the lower ring.
TOLERANCE_CM = 1e-9


@dataclass(frozen=True)
class Score:
    value: int | None
    is_x: bool
    is_miss: bool


def outer_radius_cm(face: dict) -> float:
    """Size of one spot, the unit of the shot coordinates."""
    if not face["rings"]:
        return 20.0  # blank face: a 40 cm circle
    return face["rings"][-1]["diameter_cm"] / 2


def score(face: dict, x: float, y: float) -> Score:
    """A position exactly on a line scores the higher value. The archer places an arrow that touches
    a line into the higher ring, so the position is taken as it is."""
    if not face["rings"]:
        return Score(None, False, False)
    distance_cm = hypot(x, y) * outer_radius_cm(face)
    for ring in face["rings"]:  # inner to outer
        if distance_cm <= ring["diameter_cm"] / 2 + TOLERANCE_CM:
            x_diameter = face.get("x_diameter_cm")
            is_x = ring["value"] == 10 and x_diameter is not None and distance_cm <= x_diameter / 2 + TOLERANCE_CM
            return Score(ring["value"], is_x, False)
    return Score(None, False, True)
