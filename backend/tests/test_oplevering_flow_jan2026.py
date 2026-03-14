import os
import uuid

import pytest
import requests
from dotenv import dotenv_values


# Oplevering flow regression: worker/admin login + create/send + schade foto validation
frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or frontend_env.get("EXPO_BACKEND_URL")
    or frontend_env.get("EXPO_PUBLIC_BACKEND_URL")
    or ""
).rstrip("/")

ONE_PIXEL_PNG = (
    "data:image/png;base64,"
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII="
)


@pytest.fixture(scope="session")
def api_client():
    if not BASE_URL:
        pytest.skip("EXPO_BACKEND_URL / EXPO_PUBLIC_BACKEND_URL is not set")
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture(scope="session")
def worker_user(api_client):
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "davy@smart-techbv.be", "password": "Smart1234-"},
    )
    if response.status_code != 200:
        pytest.skip(f"Worker login unavailable: {response.status_code} {response.text}")
    user = response.json()
    assert user["email"] == "davy@smart-techbv.be"
    assert user.get("actief") is True
    return user


@pytest.fixture(scope="session")
def admin_user(api_client):
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "hr@smart-techbv.be", "password": "Smart1234-"},
    )
    if response.status_code != 200:
        pytest.skip(f"Admin login unavailable: {response.status_code} {response.text}")
    user = response.json()
    assert user["email"] == "hr@smart-techbv.be"
    assert user.get("rol") in ["admin", "beheerder"]
    return user


@pytest.fixture
def oplevering_setup(api_client):
    unique = uuid.uuid4().hex[:8]
    klant_resp = api_client.post(
        f"{BASE_URL}/api/klanten",
        json={
            "naam": f"TEST_OpleveringKlant_{unique}",
            "email": f"test-oplevering-{unique}@example.com",
            "uurtarief": 0,
        },
    )
    assert klant_resp.status_code == 200, klant_resp.text
    klant = klant_resp.json()

    werf_resp = api_client.post(
        f"{BASE_URL}/api/werven",
        json={
            "naam": f"TEST_OpleveringWerf_{unique}",
            "klant_id": klant["id"],
            "adres": "TEST Opleveringstraat 1",
        },
    )
    assert werf_resp.status_code == 200, werf_resp.text
    werf = werf_resp.json()

    created_oplevering_ids = []
    yield {"klant": klant, "werf": werf, "created_oplevering_ids": created_oplevering_ids}

    for oplevering_id in created_oplevering_ids:
        api_client.delete(f"{BASE_URL}/api/oplevering-werkbonnen/{oplevering_id}")
    api_client.delete(f"{BASE_URL}/api/werven/{werf['id']}")
    api_client.delete(f"{BASE_URL}/api/klanten/{klant['id']}")


def _base_payload(klant_id: str, werf_id: str):
    return {
        "klant_id": klant_id,
        "werf_id": werf_id,
        "datum": "2026-01-15",
        "installatie_type": "Warmtepomp",
        "werk_beschrijving": "TEST oplevering uitgevoerd",
        "gebruikte_materialen": "TEST materiaal",
        "extra_opmerkingen": "TEST opmerking",
        "schade_status": "geen_schade",
        "schade_opmerking": "",
        "schade_checks": [
            {"label": "Geen schade", "checked": True, "opmerking": ""},
            {"label": "Schade aanwezig", "checked": False, "opmerking": ""},
        ],
        "alles_ok": True,
        "beoordelingen": [
            {"categorie": "Kwaliteit van afwerking", "score": 5, "opmerking": ""},
            {"categorie": "Netheid werkplek", "score": 5, "opmerking": ""},
            {"categorie": "Communicatie", "score": 5, "opmerking": ""},
            {"categorie": "Stiptheid", "score": 5, "opmerking": ""},
            {"categorie": "Algemene tevredenheid", "score": 5, "opmerking": ""},
        ],
        "fotos": [],
        "foto_labels": [],
        "handtekening_klant": ONE_PIXEL_PNG,
        "handtekening_klant_naam": "TEST Klant",
        "handtekening_monteur_naam": "TEST Monteur",
        "verstuur_naar_klant": False,
        "klant_email_override": "",
    }


def test_worker_login_still_works(worker_user):
    assert worker_user["naam"]
    assert isinstance(worker_user["id"], str) and worker_user["id"]


def test_admin_login_still_works(admin_user):
    assert admin_user["naam"]
    assert isinstance(admin_user["id"], str) and admin_user["id"]


def test_create_no_damage_oplevering_with_signature(worker_user, api_client, oplevering_setup):
    payload = _base_payload(oplevering_setup["klant"]["id"], oplevering_setup["werf"]["id"])
    create_resp = api_client.post(
        f"{BASE_URL}/api/oplevering-werkbonnen",
        params={"user_id": worker_user["id"], "user_naam": worker_user["naam"]},
        json=payload,
    )
    assert create_resp.status_code == 200, create_resp.text
    created = create_resp.json()
    oplevering_setup["created_oplevering_ids"].append(created["id"])

    assert created["status"] == "ondertekend"
    assert created["schade_status"] == "geen_schade"
    assert created["handtekening_klant_naam"] == "TEST Klant"
    assert created["ingevuld_door_id"] == worker_user["id"]

    get_resp = api_client.get(f"{BASE_URL}/api/oplevering-werkbonnen/{created['id']}")
    assert get_resp.status_code == 200
    persisted = get_resp.json()
    assert persisted["id"] == created["id"]
    assert persisted["beoordelingen"][0]["score"] == 5


def test_create_oplevering_rejects_schade_without_photos(worker_user, api_client, oplevering_setup):
    payload = _base_payload(oplevering_setup["klant"]["id"], oplevering_setup["werf"]["id"])
    payload["schade_status"] = "schade_aanwezig"
    payload["schade_opmerking"] = "TEST schade"
    payload["schade_checks"] = [
        {"label": "Geen schade", "checked": False, "opmerking": ""},
        {"label": "Schade aanwezig", "checked": True, "opmerking": "TEST schade"},
    ]
    payload["fotos"] = []

    resp = api_client.post(
        f"{BASE_URL}/api/oplevering-werkbonnen",
        params={"user_id": worker_user["id"], "user_naam": worker_user["naam"]},
        json=payload,
    )
    assert resp.status_code == 400
    assert "foto" in resp.json().get("detail", "").lower()


def test_send_signed_oplevering_returns_success(worker_user, api_client, oplevering_setup):
    payload = _base_payload(oplevering_setup["klant"]["id"], oplevering_setup["werf"]["id"])
    create_resp = api_client.post(
        f"{BASE_URL}/api/oplevering-werkbonnen",
        params={"user_id": worker_user["id"], "user_naam": worker_user["naam"]},
        json=payload,
    )
    assert create_resp.status_code == 200
    created = create_resp.json()
    oplevering_setup["created_oplevering_ids"].append(created["id"])

    send_resp = api_client.post(f"{BASE_URL}/api/oplevering-werkbonnen/{created['id']}/verzenden")
    assert send_resp.status_code == 200, send_resp.text
    send_data = send_resp.json()
    assert send_data.get("success") is True
    assert isinstance(send_data.get("pdf_filename"), str) and send_data["pdf_filename"].endswith(".pdf")
    assert send_data.get("status") in ["ondertekend", "verzonden"]

    verify_resp = api_client.get(f"{BASE_URL}/api/oplevering-werkbonnen/{created['id']}")
    assert verify_resp.status_code == 200
    persisted = verify_resp.json()
    if send_data.get("email_sent"):
        assert persisted.get("status") == "verzonden"
    else:
        assert persisted.get("status") == "ondertekend"
