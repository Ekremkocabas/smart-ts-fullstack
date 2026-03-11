import os
import sys
import asyncio
import requests
import pytest
from dotenv import dotenv_values


# Regression coverage: worker-scoped werkbonnen, admin-overview dataset, and welcome/info mail branding/template
frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or frontend_env.get("EXPO_PUBLIC_BACKEND_URL")
    or ""
).rstrip("/")

if "/app/backend" not in sys.path:
    sys.path.append("/app/backend")


@pytest.fixture(scope="session")
def api_client():
    if not BASE_URL:
        pytest.skip("EXPO_PUBLIC_BACKEND_URL is not set")
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="session")
def admin_user(api_client):
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "info@smart-techbv.be", "password": "smart123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["rol"] == "admin"
    return data


@pytest.fixture(scope="session")
def worker_user(api_client):
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "worker-list-736372@example.com", "password": "Worker123!"},
    )
    if response.status_code != 200:
        pytest.skip("Worker credentials invalid or worker user unavailable")
    data = response.json()
    assert data["rol"] == "werknemer"
    return data


def test_worker_api_scope_only_own_werkbonnen(api_client, worker_user):
    own_response = api_client.get(f"{BASE_URL}/api/werkbonnen/user/{worker_user['id']}")
    assert own_response.status_code == 200
    own_werkbonnen = own_response.json()
    assert isinstance(own_werkbonnen, list)
    assert len(own_werkbonnen) >= 1
    assert all(wb["ingevuld_door_id"] == worker_user["id"] for wb in own_werkbonnen)


def test_admin_overview_api_contains_multiple_accounts(api_client, admin_user, worker_user):
    all_response = api_client.get(f"{BASE_URL}/api/werkbonnen")
    assert all_response.status_code == 200
    all_werkbonnen = all_response.json()
    assert isinstance(all_werkbonnen, list)
    assert len(all_werkbonnen) >= 1

    worker_present = any(wb.get("ingevuld_door_id") == worker_user["id"] for wb in all_werkbonnen)
    assert worker_present is True

    has_other_account = any(wb.get("ingevuld_door_id") != worker_user["id"] for wb in all_werkbonnen)
    assert has_other_account is True


def test_email_brand_helper_strips_test_suffix():
    from server import get_email_brand_name

    assert get_email_brand_name({"bedrijfsnaam": "Smart-Tech BV Test"}) == "Smart-Tech BV"
    assert get_email_brand_name({"bedrijfsnaam": "Smart-Tech BV"}) == "Smart-Tech BV"


def test_welcome_mail_sender_and_formal_instruction_template(monkeypatch):
    import server

    captured = {}

    def fake_send(params):
        captured["params"] = params
        return {"id": "email-test-id"}

    monkeypatch.setattr(server.resend.Emails, "send", fake_send)
    monkeypatch.setattr(server.resend, "api_key", "test_api_key")

    instellingen = {
        "bedrijfsnaam": "Smart-Tech BV Test",
        "email": "info@smart-techbv.be",
    }

    result = asyncio.run(
        server.send_welcome_email(
            user_email="worker-list-736372@example.com",
            user_naam="Worker List Test",
            temp_password="Worker123!",
            instellingen=instellingen,
        )
    )

    assert result["success"] is True
    assert "params" in captured

    sender = captured["params"]["from"]
    html = captured["params"]["html"]

    assert sender == "Smart-Tech BV <info@smart-techbv.be>"
    assert "Smart-Tech BV Test" not in sender

    assert "Instructies voor de werknemer" in html
    assert "effectief gewerkte uren" in html
    assert "Versturen als PDF" in html
    assert html.count('class="step"') >= 8
