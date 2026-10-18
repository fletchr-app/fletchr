import json
from pathlib import Path

from django.conf import settings


def catalogue_path() -> Path:
    return Path(settings.SHARED_DIR) / "target-faces.json"


def load_faces() -> list[dict]:
    with open(catalogue_path(), encoding="utf-8") as f:
        return json.load(f)["faces"]


def get_face(slug: str) -> dict | None:
    return next((f for f in load_faces() if f["slug"] == slug), None)
