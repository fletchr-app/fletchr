"""Basic statistics of an archer's training. Pure functions over plain rows, so they are easy to test."""

from collections import defaultdict
from datetime import date, datetime, timedelta
from math import hypot
from decimal import Decimal
from zoneinfo import ZoneInfo

from targets.catalogue import get_face


def week_start(day: date) -> date:
    """Weeks start on Monday."""
    return day - timedelta(days=day.weekday())


def spot_radius_cm(face: dict) -> float:
    """Where position 1 is: the outer edge of the outermost scoring ring."""
    return face["rings"][-1]["diameter_cm"] / 2


def distribution(face: dict, rows) -> list[dict]:
    """How many arrows scored each value, best ring first, misses (0) last."""
    counts = defaultdict(int)
    for row in rows:
        counts[row[3]] += 1
    return [{"value": v, "count": counts[v]} for v in [ring["value"] for ring in face["rings"]] + [0]]


def group_of(points) -> dict:
    """Centre and mean distance from it, as a fraction of the spot radius. Arrows on different spots of a triple face are
    taken together: every position is relative to its own spot, so the centre is the drift of the sight."""
    if not points:
        return {"plotted": 0, "centre_x": None, "centre_y": None, "spread": None}
    n = len(points)
    cx = sum(p[0] for p in points) / n
    cy = sum(p[1] for p in points) / n
    return {
        "plotted": n,
        "centre_x": round(cx, 4),
        "centre_y": round(cy, 4),
        "spread": round(sum(hypot(p[0] - cx, p[1] - cy) for p in points) / n, 4),
    }


def compute_stats(shots, volume, now: datetime, tz: ZoneInfo, weeks: int) -> dict:
    """
    shots:  (session_id, started_at, session_type, distance_m, face, value, is_x, is_miss, x, y) for every arrow shot at a face;
            x and y are the position in the spot (x right, y up, 1 = outer edge), None for a typed score
    volume: (started_at, arrow_count) for every volume entry
    Arrows are dated by the day their session started, in the viewer's time zone.
    """
    today = now.astimezone(tz).date()
    local = lambda moment: moment.astimezone(tz).date()

    # --- volume: every arrow counts, scored or not ---------------------------------------------
    first_week = week_start(today) - timedelta(weeks=weeks - 1)
    per_week = {first_week + timedelta(weeks=i): 0 for i in range(weeks)}
    this_month = total = 0
    dated = [(local(s[1]), 1) for s in shots] + [(local(v[0]), v[1]) for v in volume]
    for day, count in dated:
        total += count
        if (day.year, day.month) == (today.year, today.month):
            this_month += count
        if week_start(day) in per_week:
            per_week[week_start(day)] += count
    volume_stats = {
        "weeks": [{"week_start": start, "arrows": per_week[start]} for start in sorted(per_week)],
        "this_week": per_week[week_start(today)],
        "this_month": this_month,
        "total": total,
    }

    # --- scores: per face and distance, because points on different faces cannot be compared ---------
    groups = defaultdict(list)
    for session_id, started_at, session_type, distance, slug, value, is_x, is_miss, x, y in shots:
        face = get_face(slug)
        if face is None or not face["rings"] or (value is None and not is_miss):
            continue  # blank face, or no score
        groups[(slug, Decimal(distance).quantize(Decimal("0.1")))].append(
            (session_id, started_at, session_type, 0 if is_miss else value, is_x, is_miss, x, y)
        )

    scores = []
    for (slug, distance), rows in groups.items():
        face = get_face(slug)
        top = face["rings"][0]["value"]
        n = len(rows)
        per_session = defaultdict(list)
        for row in rows:
            per_session[row[0]].append(row)
        sessions = []
        for session_rows in per_session.values():
            centre = group_of([(r[6], r[7]) for r in session_rows if r[6] is not None and r[7] is not None])
            sessions.append(
                {
                    "session": session_rows[0][0],
                    "date": local(session_rows[0][1]),
                    "competition": session_rows[0][2] == "competition",
                    "arrows": len(session_rows),
                    "average": round(sum(r[3] for r in session_rows) / len(session_rows), 3),
                    **centre,
                    "_started_at": session_rows[0][1],
                }
            )
        sessions.sort(key=lambda s: s["_started_at"])
        for s in sessions:
            del s["_started_at"]
        scores.append(
            {
                "face": slug,
                "face_name": face["name"],
                "distance_m": str(distance),
                "max_value": top,
                "arrows": n,
                "average": round(sum(r[3] for r in rows) / n, 3),
                "top_rate": round(sum(1 for r in rows if not r[5] and r[3] == top) / n, 4),
                "x_rate": round(sum(1 for r in rows if r[4]) / n, 4) if face.get("x_diameter_cm") else None,
                "miss_rate": round(sum(1 for r in rows if r[5]) / n, 4),
                "radius_cm": spot_radius_cm(face),
                "distribution": distribution(face, rows),
                "sessions": sessions,
            }
        )
    scores.sort(key=lambda g: (-g["arrows"], g["face"], g["distance_m"]))
    return {"volume": volume_stats, "scores": scores}
