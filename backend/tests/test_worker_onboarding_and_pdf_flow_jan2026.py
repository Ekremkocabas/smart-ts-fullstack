import os
import uuid
import requests
import pytest
from dotenv import dotenv_values


# Worker onboarding + resend-info + signed PDF send graceful-failure regression
frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or frontend_env.get("EXPO_PUBLIC_BACKEND_URL")
    or ""
).rstrip("/")


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


def test_worker_onboarding_active_toggle_and_resend_info(api_client):
    unique = uuid.uuid4().hex[:8]
    worker_email = f"TEST_worker_{unique}@example.com"
    initial_password = "Temp1234"

    create_resp = api_client.post(
        f"{BASE_URL}/api/auth/register-worker",
        params={
            "email": worker_email,
            "naam": f"TEST Worker {unique}",
            "password": initial_password,
        },
    )
    assert create_resp.status_code == 200
    created = create_resp.json()
    assert created["user"]["email"] == worker_email
    assert created["user"]["rol"] == "werknemer"
    assert created["user"]["actief"] is True
    assert isinstance(created.get("temp_password"), str)

    # With unverified Resend domain this should fail gracefully, not 500
    assert created.get("email_sent") in [True, False]
    if created.get("email_sent") is False:
        assert "domain" in (created.get("email_error") or "").lower()

    worker_id = created["user"]["id"]

    login_ok = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": worker_email, "password": initial_password},
    )
    assert login_ok.status_code == 200
    assert login_ok.json()["id"] == worker_id

    deactivate = api_client.put(
        f"{BASE_URL}/api/auth/users/{worker_id}",
        json={"actief": False},
    )
    assert deactivate.status_code == 200
    assert deactivate.json()["actief"] is False

    login_blocked = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": worker_email, "password": initial_password},
    )
    assert login_blocked.status_code == 401
    assert "gedeactiveerd" in login_blocked.json().get("detail", "").lower()

    resend_resp = api_client.post(f"{BASE_URL}/api/auth/users/{worker_id}/resend-info")
    assert resend_resp.status_code == 200
    resend_data = resend_resp.json()
    assert resend_data["user"]["actief"] is True
    assert isinstance(resend_data.get("temp_password"), str)
    assert len(resend_data.get("temp_password") or "") >= 6

    if resend_data.get("email_sent") is False:
        assert "domain" in (resend_data.get("email_error") or "").lower()

    new_password = resend_data["temp_password"]
    login_after_resend = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": worker_email, "password": new_password},
    )
    assert login_after_resend.status_code == 200
    assert login_after_resend.json()["id"] == worker_id

    cleanup = api_client.delete(f"{BASE_URL}/api/auth/users/{worker_id}")
    assert cleanup.status_code == 200


def test_signed_werkbon_send_handles_unverified_domain_without_500(api_client, admin_user):
    unique = uuid.uuid4().hex[:6]

    klant_resp = api_client.post(
        f"{BASE_URL}/api/klanten",
        json={
            "naam": f"TEST Flow Klant {unique}",
            "email": f"test-klant-{unique}@example.com",
            "uurtarief": 60,
        },
    )
    assert klant_resp.status_code == 200
    klant = klant_resp.json()

    werf_resp = api_client.post(
        f"{BASE_URL}/api/werven",
        json={
            "naam": f"TEST Flow Werf {unique}",
            "klant_id": klant["id"],
            "adres": "TEST Straat 2",
        },
    )
    assert werf_resp.status_code == 200
    werf = werf_resp.json()

    werkbon_resp = api_client.post(
        f"{BASE_URL}/api/werkbonnen",
        params={"user_id": admin_user["id"], "user_naam": admin_user["naam"]},
        json={
            "week_nummer": 3,
            "jaar": 2026,
            "klant_id": klant["id"],
            "werf_id": werf["id"],
            "uren": [
                {
                    "teamlid_naam": "TEST Worker",
                    "maandag": 8,
                    "dinsdag": 8,
                    "woensdag": 8,
                    "donderdag": 8,
                    "vrijdag": 8,
                    "zaterdag": 0,
                    "zondag": 0,
                    "afkorting_ma": "",
                    "afkorting_di": "",
                    "afkorting_wo": "",
                    "afkorting_do": "",
                    "afkorting_vr": "",
                    "afkorting_za": "",
                    "afkorting_zo": "",
                }
            ],
        },
    )
    assert werkbon_resp.status_code == 200
    werkbon = werkbon_resp.json()

    sign_resp = api_client.put(
        f"{BASE_URL}/api/werkbonnen/{werkbon['id']}",
        json={
            "handtekening_data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
            "handtekening_naam": "TEST Signer",
        },
    )
    assert sign_resp.status_code == 200
    assert sign_resp.json()["status"] == "ondertekend"

    send_resp = api_client.post(f"{BASE_URL}/api/werkbonnen/{werkbon['id']}/verzenden")
    assert send_resp.status_code == 200
    send_data = send_resp.json()
    assert send_data["success"] is True
    assert send_data["status"] in ["ondertekend", "verzonden"]

    persisted_resp = api_client.get(f"{BASE_URL}/api/werkbonnen/{werkbon['id']}")
    assert persisted_resp.status_code == 200
    persisted = persisted_resp.json()

    if send_data.get("email_sent") is False:
        assert send_data["status"] == "ondertekend"
        assert persisted["status"] == "ondertekend"
        assert "domain" in (send_data.get("email_error") or "").lower()
    else:
        assert send_data["status"] == "verzonden"
        assert persisted["status"] == "verzonden"

    assert api_client.delete(f"{BASE_URL}/api/werkbonnen/{werkbon['id']}").status_code == 200
    assert api_client.delete(f"{BASE_URL}/api/werven/{werf['id']}").status_code == 200
    assert api_client.delete(f"{BASE_URL}/api/klanten/{klant['id']}").status_code == 200