"""Which numbered arrows group away from the rest. Pure functions over plain rows, like stats.py."""

from collections import defaultdict
from decimal import Decimal
from math import hypot

from targets.catalogue import get_face
from targets.centred import MIN_ARROWS
from .stats import spot_radius_cm


def compute_arrow_stats(rows) -> list[dict]:
    """
    rows: (session_id, arrow_set_id, arrow_set_name, face, distance_m, arrow_number, x, y) for every arrow with a position
          (numbered or not: the unnumbered ones are needed to find the centre of the group)
    Per face and distance, each session has a group centre (the mean of its plotted arrows; sessions with fewer than
    MIN_ARROWS are left out, they say too little). A numbered arrow's offset is where it hit relative to that centre, so a
    sight that is off on one day does not count against an arrow. Per arrow number and arrow set: the mean offset, how far
    that is from the centre, and the spread of its offsets around their mean. All as fractions of the spot radius.
    """
    blocks = defaultdict(lambda: defaultdict(list))  # (face, distance) -> session -> rows
    for row in rows:
        face = get_face(row[3])
        if face is None or not face["rings"]:
            continue
        blocks[(row[3], Decimal(row[4]).quantize(Decimal("0.1")))][row[0]].append(row)

    groups = []
    for (slug, distance), sessions in blocks.items():
        offsets = defaultdict(list)  # (arrow_set_id, arrow_set_name, number) -> [(dx, dy, session)]
        for session_id, session_rows in sessions.items():
            if len(session_rows) < MIN_ARROWS:
                continue
            cx = sum(r[6] for r in session_rows) / len(session_rows)
            cy = sum(r[7] for r in session_rows) / len(session_rows)
            for r in session_rows:
                if r[5] is not None:
                    offsets[(r[1], r[2], r[5])].append((r[6] - cx, r[7] - cy, session_id))
        if not offsets:
            continue
        sets = defaultdict(list)
        for (set_id, set_name, number), items in offsets.items():
            n = len(items)
            ox = sum(i[0] for i in items) / n
            oy = sum(i[1] for i in items) / n
            sets[(set_id, set_name)].append(
                {
                    "number": number,
                    "shots": n,
                    "sessions": len({i[2] for i in items}),
                    "offset_x": round(ox, 4),
                    "offset_y": round(oy, 4),
                    "offset": round(hypot(ox, oy), 4),
                    "spread": round(sum(hypot(i[0] - ox, i[1] - oy) for i in items) / n, 4),
                }
            )
        face = get_face(slug)
        groups.append(
            {
                "face": slug,
                "face_name": face["name"],
                "distance_m": str(distance),
                "radius_cm": spot_radius_cm(face),
                "sets": [
                    {"arrow_set": set_id, "arrow_set_name": set_name, "arrows": sorted(arrows, key=lambda a: (-a["offset"], a["number"]))}
                    for (set_id, set_name), arrows in sorted(sets.items(), key=lambda kv: (kv[0][1] or "", kv[0][0] or 0))
                ],
                "_shots": sum(a["shots"] for arrows in sets.values() for a in arrows),
            }
        )
    groups.sort(key=lambda g: (-g["_shots"], g["face"], g["distance_m"]))
    for g in groups:
        del g["_shots"]
    return groups
