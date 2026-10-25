"""How the archers of a team compare. Pure functions over plain rows, like stats.py."""

from collections import defaultdict
from decimal import Decimal

from targets.catalogue import get_face


def compute_ranking(members, shots, volume, face: str | None, distance: Decimal | None) -> dict:
    """
    members: (user_id, name, managed) for everyone who is listed
    shots:   (owner_id, face, distance_m, value, is_miss) for every arrow shot at a face in the period
    volume:  (owner_id, arrow_count) for every volume entry in the period
    face and distance choose what the average is taken over; without them the face and distance with most arrows is used.
    Arrows count for the volume whether they were scored or not; the average only counts scored arrows on that face and distance.
    """
    arrows = defaultdict(int)
    for owner, _face, _distance, _value, _miss in shots:
        arrows[owner] += 1
    for owner, count in volume:
        arrows[owner] += count

    scored = defaultdict(list)  # (face, distance) -> [(owner, points)]
    for owner, slug, distance_m, value, is_miss in shots:
        spec = get_face(slug)
        if spec is None or not spec["rings"] or (value is None and not is_miss):
            continue
        scored[(slug, Decimal(distance_m).quantize(Decimal("0.1")))].append((owner, 0 if is_miss else value))

    choices = [
        {"face": slug, "face_name": get_face(slug)["name"], "distance_m": str(distance_m), "arrows": len(rows)}
        for (slug, distance_m), rows in scored.items()
    ]
    choices.sort(key=lambda c: (-c["arrows"], c["face"], c["distance_m"]))
    if face is None and choices:
        face, distance = choices[0]["face"], Decimal(choices[0]["distance_m"])
    points = defaultdict(list)
    for owner, value in scored.get((face, distance), []):
        points[owner].append(value)

    rows = [
        {
            "user_id": user_id,
            "name": name,
            "managed": managed,
            "arrows": arrows[user_id],
            "scored_arrows": len(points[user_id]),
            "average": round(sum(points[user_id]) / len(points[user_id]), 3) if points[user_id] else None,
        }
        for user_id, name, managed in members
    ]
    rows.sort(key=lambda r: (-r["arrows"], r["name"]))
    return {
        "face": face,
        "distance_m": str(distance) if distance is not None else None,
        "max_value": get_face(face)["rings"][0]["value"] if face else None,
        "choices": choices,
        "rows": rows,
    }
