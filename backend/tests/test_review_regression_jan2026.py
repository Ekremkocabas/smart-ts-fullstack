import os
import uuid
import requests
import pytest
from dotenv import dotenv_values


# Review regression coverage for worker delete + signature/PDF send flow
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


def test_delete_worker_endpoint(api_client, admin_user):
    unique = uuid.uuid4().hex[:8]
    worker_email = f"TEST_delete_{unique}@example.com"

    create_response = api_client.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "email": worker_email,
            "password": "Test12345!",
            "naam": f"TEST Delete {unique}",
            "rol": "werknemer",
        },
    )
    assert create_response.status_code == 200
    worker = create_response.json()
    assert worker["email"] == worker_email

    delete_response = api_client.delete(f"{BASE_URL}/api/auth/users/{worker['id']}")
    assert delete_response.status_code == 200

    users_response = api_client.get(f"{BASE_URL}/api/auth/users")
    assert users_response.status_code == 200
    users = users_response.json()
    assert all(u["id"] != worker["id"] for u in users)


def test_signature_and_verzenden_status_behavior(api_client, admin_user):
    unique = uuid.uuid4().hex[:6]

    klant_resp = api_client.post(
        f"{BASE_URL}/api/klanten",
        json={
            "naam": f"TEST Klant {unique}",
            "email": f"test-klant-{unique}@example.com",
            "uurtarief": 55,
        },
    )
    assert klant_resp.status_code == 200
    klant = klant_resp.json()

    werf_resp = api_client.post(
        f"{BASE_URL}/api/werven",
        json={
            "naam": f"TEST Werf {unique}",
            "klant_id": klant["id"],
            "adres": "TEST Straat 1",
        },
    )
    assert werf_resp.status_code == 200
    werf = werf_resp.json()

    werkbon_resp = api_client.post(
        f"{BASE_URL}/api/werkbonnen",
        params={"user_id": admin_user["id"], "user_naam": admin_user["naam"]},
        json={
            "week_nummer": 2,
            "jaar": 2026,
            "klant_id": klant["id"],
            "werf_id": werf["id"],
            "uren": [
                {
                    "teamlid_naam": "TEST Werknemer",
                    "maandag": 8,
                    "dinsdag": 8,
                    "woensdag": 8,
                    "donderdag": 8,
                    "vrijdag": 6,
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
            "uitgevoerde_werken": "TEST werkzaamheden",
            "extra_materialen": "TEST materiaal",
        },
    )
    assert werkbon_resp.status_code == 200
    werkbon = werkbon_resp.json()

    sign_resp = api_client.put(
        f"{BASE_URL}/api/werkbonnen/{werkbon['id']}",
        json={
            "handtekening_data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
            "handtekening_naam": "TEST Ondertekenaar",
            "status": "ondertekend",
        },
    )
    assert sign_resp.status_code == 200
    signed = sign_resp.json()
    assert signed["status"] == "ondertekend"

    send_resp = api_client.post(f"{BASE_URL}/api/werkbonnen/{werkbon['id']}/verzenden")
    assert send_resp.status_code == 200
    send_data = send_resp.json()
    assert send_data["success"] is True
    assert isinstance(send_data.get("pdf_filename"), str)
    assert send_data["status"] in ["ondertekend", "verzonden"]

    persisted_resp = api_client.get(f"{BASE_URL}/api/werkbonnen/{werkbon['id']}")
    assert persisted_resp.status_code == 200
    persisted = persisted_resp.json()

    if send_data.get("email_sent") is False:
        assert send_data["status"] == "ondertekend"
        assert persisted["status"] == "ondertekend"
    else:
        assert send_data["status"] == "verzonden"
        assert persisted["status"] == "verzonden"

    delete_werkbon = api_client.delete(f"{BASE_URL}/api/werkbonnen/{werkbon['id']}")
    assert delete_werkbon.status_code == 200
    delete_werf = api_client.delete(f"{BASE_URL}/api/werven/{werf['id']}")
    assert delete_werf.status_code == 200
    delete_klant = api_client.delete(f"{BASE_URL}/api/klanten/{klant['id']}")
    assert delete_klant.status_code == 200