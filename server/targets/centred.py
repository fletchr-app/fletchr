"""What a group of arrows would have scored with its centre in the middle of the spot.

Same rules as src/lib/centred.ts; both are tested against shared/centred-vectors.json.

The centre is the mean position of the arrows, every arrow is moved by it and scored again. An arrow that is then outside the
face is a miss. Positions are relative to the spot, 1 = outer edge, so the arrows of all spots of a face are taken together.
"""

from dataclasses import dataclass

from .scoring import score

MIN_ARROWS = 6  # fewer arrows say too little about where the centre is


@dataclass(frozen=True)
class CentredScore:
    n: int
    real: int
    centred: int
    centre_x: float
    centre_y: float


def points_of(face: dict, points, x: float = 0.0, y: float = 0.0) -> int:
    """Points of the arrows when every position is moved by (-x, -y). A miss is 0."""
    return sum(score(face, px - x, py - y).value or 0 for px, py in points)


def centred_score(face: dict, points) -> CentredScore | None:
    """None for a face without rings and for fewer than MIN_ARROWS arrows."""
    points = list(points)
    if not face["rings"] or len(points) < MIN_ARROWS:
        return None
    cx = sum(p[0] for p in points) / len(points)
    cy = sum(p[1] for p in points) / len(points)
    return CentredScore(len(points), points_of(face, points), points_of(face, points, cx, cy), cx, cy)
