"""The shared statistics fixture (shared/stats-vectors.json) as rows for the server's functions.

The app computes the same statistics on the device (src/lib/stats.ts) and is tested against the same file.
"""

import json
from datetime import datetime
from decimal import Decimal

from django.conf import settings


def load_cases() -> list[dict]:
    with open(settings.SHARED_DIR / "stats-vectors.json", encoding="utf-8") as f:
        return json.load(f)["cases"]


def instant(text: str) -> datetime:
    return datetime.fromisoformat(text)


def shot_rows(sessions: list[dict]) -> list[tuple]:
    """(session_id, started_at, type, distance_m, face, value, is_x, is_miss, x, y, physical, mental, setup_id) for every arrow."""
    return [
        (s["id"], instant(s["started_at"]), s["type"], Decimal(e["distance_m"]), e["face"], sh["value"], sh["is_x"], sh["is_miss"], sh.get("x"), sh.get("y"), s["physical_rating"], s["mental_rating"], s["setup"])
        for s in sessions
        for e in s["ends"]
        for sh in e["shots"]
    ]


def volume_rows(sessions: list[dict]) -> list[tuple]:
    return [(instant(s["started_at"]), v["arrow_count"]) for s in sessions for v in s["volume"]]


def arrow_rows(sessions: list[dict]) -> list[tuple]:
    """(session_id, arrow_set_id, arrow_set_name, face, distance_m, arrow_number, x, y) for every arrow with a position."""
    return [
        (s["id"], s["arrow_set"] and s["arrow_set"]["id"], s["arrow_set"] and s["arrow_set"]["name"], e["face"], Decimal(e["distance_m"]), sh.get("arrow_number"), sh["x"], sh["y"])
        for s in sessions
        for e in s["ends"]
        for sh in e["shots"]
        if sh.get("x") is not None and sh.get("y") is not None
    ]


def plain(result):
    """The result as the JSON of the fixture has it: dates as text."""
    return json.loads(json.dumps(result, default=str))
