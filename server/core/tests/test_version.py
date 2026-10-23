import json
import tomllib
from pathlib import Path

from django.conf import settings

ROOT = Path(__file__).resolve().parents[3]


def test_app_and_server_have_the_same_version():
    app = json.loads((ROOT / "package.json").read_text())["version"]
    server = tomllib.loads((ROOT / "server" / "pyproject.toml").read_text())["project"]["version"]
    assert server == app == settings.SPECTACULAR_SETTINGS["VERSION"], "change the version in package.json, pyproject.toml and the API settings together (docs/releasing.md)"
