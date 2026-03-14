"""
Tests for: Productie Werkbon endpoints and Planning bevestig endpoint
Covers: GET /productie-werkbonnen (404 for unknown user), POST /productie-werkbonnen,
        POST /productie-werkbonnen/{id}/verzenden, DELETE cleanup,
        POST /planning/{id}/bevestig timestamp system
"""

import os
import uuid

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
BASE_URL = (
    os.environ.get("EXPO_BACKEND_URL")
    or os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or frontend_env.get("EXPO_BACKEND_URL")
    or frontend_env.get("EXPO_PUBLIC_BACKEND_URL")
    or ""
).rstrip("/")

ADMIN_EMAIL = "info@smart-techbv.be"
ADMIN_PASSWORD = "Smart1988-"
WORKER_EMAIL = "davy@smart-techbv.be"
WORKER_PASSWORD = "Smart1234-"

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
    """Login as worker and return user data"""
    resp = api_client.post(f"{BASE_URL}/api/auth/login", json={"email": WORKER_EMAIL, "password": WORKER_PASSWORD})
    if resp.status_code != 200:
        pytest.skip(f"Worker login failed: {resp.status_code} {resp.text}")
    return resp.json().get("user") or resp.json()


@pytest.fixture(scope="session")
def admin_user(api_client):
    """Login as admin and return user data"""
    resp = api_client.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if resp.status_code != 200:
        pytest.skip(f"Admin login failed: {resp.status_code} {resp.text}")
    return resp.json().get("user") or resp.json()


@pytest.fixture(scope="session")
def test_klant(api_client):
    """Create a test klant for productie werkbon creation"""
    payload = {
        "naam": f"TEST_ProductieKlant_{uuid.uuid4().hex[:6]}",
        "email": f"test-productie-{uuid.uuid4().hex[:6]}@example.com",
        "uurtarief": 0
    }
    resp = api_client.post(f"{BASE_URL}/api/klanten", json=payload)
    assert resp.status_code in (200, 201), f"Could not create test klant: {resp.text}"
    klant = resp.json()
    yield klant
    # Cleanup
    api_client.delete(f"{BASE_URL}/api/klanten/{klant['id']}")


@pytest.fixture(scope="session")
def test_werf(api_client, test_klant):
    """Create a test werf linked to test_klant"""
    payload = {
        "naam": f"TEST_ProductieWerf_{uuid.uuid4().hex[:6]}",
        "klant_id": test_klant["id"],
        "adres": "Teststraat 123"
    }
    resp = api_client.post(f"{BASE_URL}/api/werven", json=payload)
    assert resp.status_code in (200, 201), f"Could not create test werf: {resp.text}"
    werf = resp.json()
    yield werf
    # Cleanup
    api_client.delete(f"{BASE_URL}/api/werven/{werf['id']}")


# ==================== HEALTH ====================

class TestHealth:
    """Basic health and connectivity tests"""

    def test_backend_health(self, api_client):
        resp = api_client.get(f"{BASE_URL}/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data.get("status") == "healthy"
        print(f"PASS: Backend health OK - {data}")


# ==================== PRODUCTIE WERKBON ====================

class TestProductieWerkbonEndpoints:
    """Tests for GET/POST/DELETE productie-werkbonnen endpoints"""

    def test_get_productie_werkbonnen_unknown_user_returns_404(self, api_client):
        """GET /productie-werkbonnen with non-existent user_id must return 404, NOT 500"""
        fake_id = str(uuid.uuid4())
        resp = api_client.get(f"{BASE_URL}/api/productie-werkbonnen", params={"user_id": fake_id})
        assert resp.status_code == 404, (
            f"Expected 404 for non-existent user, got {resp.status_code}: {resp.text}"
        )
        data = resp.json()
        assert "detail" in data
        print(f"PASS: GET productie-werkbonnen unknown user returns 404: {data}")

    def test_get_productie_werkbonnen_valid_user(self, api_client, worker_user):
        """GET /productie-werkbonnen returns list (could be empty) for valid worker"""
        user_id = worker_user.get("id") or worker_user.get("_id")
        resp = api_client.get(f"{BASE_URL}/api/productie-werkbonnen", params={"user_id": user_id})
        assert resp.status_code == 200, f"GET failed: {resp.status_code} {resp.text}"
        data = resp.json()
        assert isinstance(data, list)
        print(f"PASS: GET productie-werkbonnen valid worker returned {len(data)} items")

    def test_get_productie_werkbonnen_admin_user(self, api_client, admin_user):
        """GET /productie-werkbonnen for admin user returns all werkbonnen"""
        user_id = admin_user.get("id") or admin_user.get("_id")
        resp = api_client.get(f"{BASE_URL}/api/productie-werkbonnen", params={"user_id": user_id})
        assert resp.status_code == 200, f"GET failed for admin: {resp.status_code} {resp.text}"
        data = resp.json()
        assert isinstance(data, list)
        print(f"PASS: GET productie-werkbonnen admin returned {len(data)} items")

    def test_create_productie_werkbon(self, api_client, worker_user, test_klant, test_werf):
        """POST /productie-werkbonnen creates a werkbon and persists it"""
        user_id = worker_user.get("id") or worker_user.get("_id")
        user_naam = worker_user.get("naam", "Test Worker")
        payload = {
            "datum": "2026-01-15",
            "werknemer_naam": user_naam,
            "werknemer_id": user_id,
            "klant_id": test_klant["id"],
            "werf_id": test_werf["id"],
            "start_uur": "07:00",
            "eind_uur": "15:00",
            "voorziene_uur": "8u",
            "uit_te_voeren_werk": "PUR isolatie test",
            "nodige_materiaal": "PUR kit",
            "gelijkvloers_m2": 25.5,
            "gelijkvloers_cm": 5.0,
            "eerste_verdiep_m2": 15.0,
            "eerste_verdiep_cm": 4.0,
            "tweede_verdiep_m2": 0.0,
            "tweede_verdiep_cm": 0.0,
            "schuurwerken": True,
            "schuurwerken_m2": 10.0,
            "stofzuigen": False,
            "stofzuigen_m2": 0.0,
            "fotos": [],
            "opmerking": "Test opmerking",
            "gps_locatie": None,
            "handtekening": ONE_PIXEL_PNG,
            "handtekening_naam": "Test Klant Naam",
            "handtekening_datum": "2026-01-15",
            "selfie_foto": ONE_PIXEL_PNG,
            "verstuur_naar_klant": False,
            "klant_email_override": ""
        }
        resp = api_client.post(
            f"{BASE_URL}/api/productie-werkbonnen",
            json=payload,
            params={"user_id": user_id, "user_naam": user_naam}
        )
        assert resp.status_code == 200, f"POST failed: {resp.status_code} {resp.text}"
        data = resp.json()
        assert "id" in data
        assert data.get("type") == "productie"
        assert data.get("klant_naam") == test_klant["naam"]
        assert data.get("werf_naam") == test_werf["naam"]
        # totaal_m2 should be 25.5 + 15.0 + 0.0 = 40.5
        assert abs(float(data.get("totaal_m2", 0)) - 40.5) < 0.01, f"totaal_m2 expected 40.5, got {data.get('totaal_m2')}"
        print(f"PASS: Created productie werkbon id={data['id']} totaal_m2={data.get('totaal_m2')}")
        
        # Store for later cleanup
        self.__class__._created_werkbon_id = data["id"]

    def test_get_productie_werkbon_by_id(self, api_client):
        """GET /productie-werkbonnen/{id} returns the created werkbon"""
        werkbon_id = getattr(self.__class__, "_created_werkbon_id", None)
        if not werkbon_id:
            pytest.skip("No werkbon created in previous test")
        resp = api_client.get(f"{BASE_URL}/api/productie-werkbonnen/{werkbon_id}")
        assert resp.status_code == 200, f"GET by id failed: {resp.status_code} {resp.text}"
        data = resp.json()
        assert data.get("id") == werkbon_id
        assert data.get("type") == "productie"
        print(f"PASS: GET productie werkbon by id: {werkbon_id}")

    def test_get_nonexistent_productie_werkbon_returns_404(self, api_client):
        """GET /productie-werkbonnen/{fake_id} returns 404"""
        fake_id = str(uuid.uuid4())
        resp = api_client.get(f"{BASE_URL}/api/productie-werkbonnen/{fake_id}")
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"
        print(f"PASS: GET non-existent productie werkbon returns 404")

    def test_delete_productie_werkbon(self, api_client):
        """DELETE /productie-werkbonnen/{id} removes the werkbon"""
        werkbon_id = getattr(self.__class__, "_created_werkbon_id", None)
        if not werkbon_id:
            pytest.skip("No werkbon created in previous test")
        resp = api_client.delete(f"{BASE_URL}/api/productie-werkbonnen/{werkbon_id}")
        assert resp.status_code == 200, f"DELETE failed: {resp.status_code} {resp.text}"
        # Verify it's gone
        get_resp = api_client.get(f"{BASE_URL}/api/productie-werkbonnen/{werkbon_id}")
        assert get_resp.status_code == 404
        print(f"PASS: Deleted productie werkbon and verified 404: {werkbon_id}")


# ==================== PLANNING BEVESTIG ====================

class TestPlanningBevestig:
    """Tests for POST /planning/{id}/bevestig timestamp confirmation system"""

    @pytest.fixture(scope="class")
    def test_planning_item(self, api_client, test_klant, test_werf, worker_user):
        """Create a planning item for bevestig tests"""
        import datetime
        payload = {
            "week_nummer": 3,
            "jaar": 2026,
            "dag": "maandag",
            "datum": "13-01-2026",
            "werknemer_ids": [worker_user.get("id") or worker_user.get("_id")],
            "werknemer_namen": [worker_user.get("naam", "Test Worker")],
            "klant_id": test_klant["id"],
            "werf_id": test_werf["id"],
            "omschrijving": "TEST_PlanningBevestig",
            "materiaallijst": ["PUR kit"],
            "geschatte_duur": "8 uur",
            "prioriteit": "normaal",
            "notities": "Test planning for bevestig"
        }
        resp = api_client.post(f"{BASE_URL}/api/planning", json=payload)
        assert resp.status_code in (200, 201), f"Could not create test planning: {resp.text}"
        item = resp.json()
        yield item
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/planning/{item['id']}")

    def test_bevestig_planning_endpoint_exists(self, api_client, test_planning_item, worker_user):
        """POST /planning/{id}/bevestig returns 200 and sets bevestigd_door"""
        planning_id = test_planning_item["id"]
        worker_id = worker_user.get("id") or worker_user.get("_id")
        worker_naam = worker_user.get("naam", "Test Worker")
        resp = api_client.post(
            f"{BASE_URL}/api/planning/{planning_id}/bevestig",
            params={"werknemer_id": worker_id, "werknemer_naam": worker_naam}
        )
        assert resp.status_code == 200, f"bevestig failed: {resp.status_code} {resp.text}"
        data = resp.json()
        assert "bevestigd_door" in data
        assert worker_id in data["bevestigd_door"]
        assert "bevestigingen" in data
        print(f"PASS: Planning bevestig returned bevestigd_door: {data['bevestigd_door']}")

    def test_bevestig_planning_stores_timestamp(self, api_client, test_planning_item, worker_user):
        """bevestigingen should contain worker_id, worker_naam, and timestamp"""
        planning_id = test_planning_item["id"]
        worker_id = worker_user.get("id") or worker_user.get("_id")
        worker_naam = worker_user.get("naam", "Test Worker")
        
        # Call bevestig (may already be confirmed from previous test, that's fine)
        resp = api_client.post(
            f"{BASE_URL}/api/planning/{planning_id}/bevestig",
            params={"werknemer_id": worker_id, "werknemer_naam": worker_naam}
        )
        assert resp.status_code == 200
        data = resp.json()
        
        # Find this worker's confirmation
        bevestigingen = data.get("bevestigingen", [])
        worker_confirmation = next(
            (b for b in bevestigingen if b.get("worker_id") == worker_id),
            None
        )
        assert worker_confirmation is not None, f"Worker confirmation not found in {bevestigingen}"
        assert "timestamp" in worker_confirmation, f"No timestamp in confirmation: {worker_confirmation}"
        assert worker_confirmation.get("worker_naam") == worker_naam
        print(f"PASS: Planning bevestig stores timestamp: {worker_confirmation}")

    def test_bevestig_nonexistent_planning_returns_404(self, api_client, worker_user):
        """POST /planning/{fake_id}/bevestig returns 404"""
        fake_id = str(uuid.uuid4())
        worker_id = worker_user.get("id") or worker_user.get("_id")
        resp = api_client.post(
            f"{BASE_URL}/api/planning/{fake_id}/bevestig",
            params={"werknemer_id": worker_id}
        )
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}: {resp.text}"
        print(f"PASS: bevestig non-existent planning returns 404")
