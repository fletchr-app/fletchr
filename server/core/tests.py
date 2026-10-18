import pytest
from rest_framework.test import APIClient


@pytest.mark.django_db
def test_health_is_public():
    assert APIClient().get("/api/health/").status_code == 200
