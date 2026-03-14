"""
Project werkbon multi-day + app settings regression tests (Jan 2026 review batch).
"""
import os
import uuid

import pytest
import requests
from dotenv import dotenv_values


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
def worker_user(api_client):
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "davy@smart-techbv.be", "password": "Smart1234-"},
    )
    if response.status_code != 200:
        pytest.skip(f"Worker auth failed: {response.status_code} {response.text}")
    data = response.json()
    assert data.get("id")
    return data


@pytest.fixture
def temp_klant_werf(api_client):
    unique = uuid.uuid4().hex[:8]
    klant_resp = api_client.post(
        f"{BASE_URL}/api/klanten",
        json={
            "naam": f"TEST_ProjectKlant_{unique}",
            "email": f"test-project-klant-{unique}@example.com",
            "uurtarief": 50,
        },
    )
    assert klant_resp.status_code == 200
    klant = klant_resp.json()

    werf_resp = api_client.post(
        f"{BASE_URL}/api/werven",
        json={
            "naam": f"TEST_ProjectWerf_{unique}",
            "klant_id": klant["id"],
            "adres": "TEST Projectstraat 10",
        },
    )
    assert werf_resp.status_code == 200
    werf = werf_resp.json()

    yield klant, werf

    api_client.delete(f"{BASE_URL}/api/werven/{werf['id']}")
    api_client.delete(f"{BASE_URL}/api/klanten/{klant['id']}")


# Project werkbon routes: create with multi-day payload + verzending + persistence checks
def test_project_werkbon_create_multiday_calculates_total_hours(api_client, worker_user, temp_klant_werf):
    klant, werf = temp_klant_werf

    payload = {
        "klant_id": klant["id"],
        "werf_id": werf["id"],
        "datum": "2026-01-13",
        "dag_regels": [
            {
                "datum": "2026-01-13",
                "start_tijd": "07:00",
                "stop_tijd": "16:00",
                "pauze_minuten": 60,
                "omschrijving": "Dag 1 testwerk",
            },
            {
                "datum": "2026-01-14",
                "start_tijd": "08:00",
                "stop_tijd": "12:00",
                "pauze_minuten": 0,
                "omschrijving": "Dag 2 testwerk",
            },
        ],
        "werk_beschrijving": "TEST multi-day project werkbon",
        "extra_opmerkingen": "TEST opmerking",
        "klant_feedback_items": [
            {"label": "Werken uitgevoerd volgens planning", "checked": True},
            {"label": "Communicatie met klant was duidelijk", "checked": True},
            {"label": "Werf proper en veilig achtergelaten", "checked": False},
            {"label": "Afspraken correct nageleefd", "checked": True},
            {"label": "Klant tevreden over algemene prestatie", "checked": True},
        ],
        "klant_feedback_opmerking": "TEST feedback",
        "klant_prestatie_score": 3,
        "handtekening_klant": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
        "handtekening_klant_naam": "TEST Klant",
        "handtekening_monteur_naam": worker_user["naam"],
        "verstuur_naar_klant": False,
    }

    create_resp = api_client.post(
        f"{BASE_URL}/api/project-werkbonnen",
        params={"user_id": worker_user["id"], "user_naam": worker_user["naam"]},
        json=payload,
    )
    assert create_resp.status_code == 200
    created = create_resp.json()
    assert created["dag_regels"]
    assert len(created["dag_regels"]) == 2
    assert created["totaal_uren"] == 12.0
    assert created["status"] == "ondertekend"

    get_resp = api_client.get(f"{BASE_URL}/api/project-werkbonnen/{created['id']}")
    assert get_resp.status_code == 200
    persisted = get_resp.json()
    assert persisted["totaal_uren"] == 12.0
    assert persisted["dag_regels"][0]["datum"] == "2026-01-13"

    delete_resp = api_client.delete(f"{BASE_URL}/api/project-werkbonnen/{created['id']}")
    assert delete_resp.status_code == 200


# Project werkbon verzending route: signed create -> send PDF email endpoint response
def test_project_werkbon_verzenden_returns_pdf_filename(api_client, worker_user, temp_klant_werf):
    klant, werf = temp_klant_werf

    create_resp = api_client.post(
        f"{BASE_URL}/api/project-werkbonnen",
        params={"user_id": worker_user["id"], "user_naam": worker_user["naam"]},
        json={
            "klant_id": klant["id"],
            "werf_id": werf["id"],
            "datum": "2026-01-15",
            "dag_regels": [
                {
                    "datum": "2026-01-15",
                    "start_tijd": "07:30",
                    "stop_tijd": "15:30",
                    "pauze_minuten": 30,
                    "omschrijving": "TEST dag",
                }
            ],
            "werk_beschrijving": "TEST verzend flow",
            "klant_feedback_items": [{"label": "check", "checked": True}],
            "klant_prestatie_score": 2,
            "handtekening_klant": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=",
            "handtekening_klant_naam": "TEST Sign",
            "handtekening_monteur_naam": worker_user["naam"],
            "verstuur_naar_klant": False,
        },
    )
    assert create_resp.status_code == 200
    created = create_resp.json()

    send_resp = api_client.post(f"{BASE_URL}/api/project-werkbonnen/{created['id']}/verzenden")
    assert send_resp.status_code == 200
    send_data = send_resp.json()
    assert send_data["success"] is True
    assert isinstance(send_data.get("pdf_filename"), str)
    assert send_data["pdf_filename"].endswith(".pdf")

    get_resp = api_client.get(f"{BASE_URL}/api/project-werkbonnen/{created['id']}")
    assert get_resp.status_code == 200
    persisted = get_resp.json()
    assert persisted.get("pdf_bestandsnaam") == send_data["pdf_filename"]

    delete_resp = api_client.delete(f"{BASE_URL}/api/project-werkbonnen/{created['id']}")
    assert delete_resp.status_code == 200


# Theme settings route: app should receive logo + color + werkbon text fields
def test_app_settings_exposes_logo_theme_and_text_fields(api_client):
    resp = api_client.get(f"{BASE_URL}/api/app-settings")
    assert resp.status_code == 200
    data = resp.json()
    assert "bedrijfsnaam" in data
    assert "logo_base64" in data
    assert "primary_color" in data
    assert "secondary_color" in data
    assert "accent_color" in data
    assert "project_confirmation_text" in data


# Admin settings route: should include editable color and werkbon text payload fields
def test_instellingen_payload_has_editable_theme_and_werkbon_text_fields(api_client):
    resp = api_client.get(f"{BASE_URL}/api/instellingen")
    assert resp.status_code == 200
    data = resp.json()
    for required_key in [
        "primary_color",
        "secondary_color",
        "accent_color",
        "uren_confirmation_text",
        "oplevering_confirmation_text",
        "project_confirmation_text",
    ]:
        assert required_key in data
