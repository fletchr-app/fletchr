"""Basic statistics of an archer's training. Pure functions over plain rows, so they are easy to test."""

from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

from targets.catalogue import get_face


def week_start(day: date) -> date:
    """Weeks start on Monday."""
    return day - timedelta(days=day.weekday())


def compute_stats(shots, volume, now: datetime, tz: ZoneInfo, weeks: int) -> dict:
    """
    shots:  (session_id, started_at, session_type, distance_m, face, value, is_x, is_miss) for every arrow shot at a face
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
    for session_id, started_at, session_type, distance, slug, value, is_x, is_miss in shots:
        face = get_face(slug)
        if face is None or not face["rings"] or (value is None and not is_miss):
            continue  # blank face, or no score
        groups[(slug, Decimal(distance).quantize(Decimal("0.1")))].append(
            (session_id, started_at, session_type, 0 if is_miss else value, is_x, is_miss)
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
            sessions.append(
                {
                    "session": session_rows[0][0],
                    "date": local(session_rows[0][1]),
                    "competition": session_rows[0][2] == "competition",
                    "arrows": len(session_rows),
                    "average": round(sum(r[3] for r in session_rows) / len(session_rows), 3),
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
                "sessions": sessions,
            }
        )
    scores.sort(key=lambda g: (-g["arrows"], g["face"], g["distance_m"]))
    return {"volume": volume_stats, "scores": scores}
