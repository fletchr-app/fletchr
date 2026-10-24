import json
import tomllib
from pathlib import Path

from django.conf import settings

ROOT = Path(__file__).resolve().parents[3]


def test_app_and_server_have_the_same_version():
    app = json.loads((ROOT / "package.json").read_text())["version"]
    server = tomllib.loads((ROOT / "server" / "pyproject.toml").read_text())["project"]["version"]
    assert server == app == settings.SPECTACULAR_SETTINGS["VERSION"], "change the version in package.json, pyproject.toml and the API settings together (docs/releasing.md)"


def test_the_minimum_app_version_is_a_version_not_newer_than_the_server():
    def numbers(v):
        return tuple(int(n) for n in v.split("."))

    assert numbers(settings.MIN_APP_VERSION) <= numbers(settings.SPECTACULAR_SETTINGS["VERSION"])


def test_health_tells_the_app_the_oldest_version_that_works(client_for):
    res = client_for().get("/api/health/")
    assert res.data["min_app_version"] == settings.MIN_APP_VERSION and res.data["version"] == settings.SPECTACULAR_SETTINGS["VERSION"]
