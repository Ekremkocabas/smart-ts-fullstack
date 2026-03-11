"""
Backend tests for new Rapport & Copy features (Jan 2026):
- GET /api/rapporten/uren?jaar=2026&maand=X  (monthly report)
- GET /api/rapporten/uren?jaar=2026&week=X   (weekly report)
- POST /api/werkbonnen/{id}/dupliceer        (copy without dialog)
"""
import os
import uuid
import requests
import pytest
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
def admin_user(api_client):
    """Login as admin and return user data"""
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "info@smart-techbv.be", "password": "smart123"},
    )
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert data["rol"] == "admin"
    return data


@pytest.fixture(scope="session")
def test_klant(api_client):
    """Create a temporary test klant"""
    unique = uuid.uuid4().hex[:6]
    resp = api_client.post(
        f"{BASE_URL}/api/klanten",
        json={"naam": f"TEST_RapportKlant_{unique}", "email": f"rapport-{unique}@test.com", "uurtarief": 50},
    )
    assert resp.status_code == 200, f"Create klant failed: {resp.text}"
    klant = resp.json()
    yield klant
    api_client.delete(f"{BASE_URL}/api/klanten/{klant['id']}")


@pytest.fixture(scope="session")
def test_werf(api_client, test_klant):
    """Create a temporary test werf"""
    unique = uuid.uuid4().hex[:6]
    resp = api_client.post(
        f"{BASE_URL}/api/werven",
        json={"naam": f"TEST_RapportWerf_{unique}", "klant_id": test_klant["id"], "adres": "TEST Straat 1"},
    )
    assert resp.status_code == 200, f"Create werf failed: {resp.text}"
    werf = resp.json()
    yield werf
    api_client.delete(f"{BASE_URL}/api/werven/{werf['id']}")


@pytest.fixture(scope="session")
def test_werkbon_for_rapport(api_client, admin_user, test_klant, test_werf):
    """Create a werkbon in March 2026 (week 10) for rapport testing"""
    resp = api_client.post(
        f"{BASE_URL}/api/werkbonnen",
        params={"user_id": admin_user["id"], "user_naam": admin_user["naam"]},
        json={
            "week_nummer": 10,
            "jaar": 2026,
            "klant_id": test_klant["id"],
            "werf_id": test_werf["id"],
            "uren": [
                {
                    "teamlid_naam": "TEST_RapportWorker",
                    "maandag": 8, "dinsdag": 8, "woensdag": 8,
                    "donderdag": 8, "vrijdag": 8, "zaterdag": 0, "zondag": 0,
                    "afkorting_ma": "", "afkorting_di": "", "afkorting_wo": "",
                    "afkorting_do": "", "afkorting_vr": "", "afkorting_za": "", "afkorting_zo": "",
                }
            ],
            "uitgevoerde_werken": "TEST rapport test werkzaamheden",
        },
    )
    assert resp.status_code == 200, f"Create werkbon failed: {resp.text}"
    werkbon = resp.json()
    yield werkbon
    api_client.delete(f"{BASE_URL}/api/werkbonnen/{werkbon['id']}")


# ==================== RAPPORT WEEK TESTS ====================

class TestRapportWeek:
    """Tests for GET /api/rapporten/uren (week filter)"""

    def test_rapport_week_returns_200(self, api_client):
        """GET /api/rapporten/uren?jaar=2026&week=10 returns 200"""
        resp = api_client.get(f"{BASE_URL}/api/rapporten/uren", params={"jaar": 2026, "week": 10})
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_rapport_week_returns_list(self, api_client):
        """Rapport week response is a list"""
        resp = api_client.get(f"{BASE_URL}/api/rapporten/uren", params={"jaar": 2026, "week": 10})
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list), f"Expected list, got {type(data)}"

    def test_rapport_week_contains_correct_fields(self, api_client, test_werkbon_for_rapport):
        """Rapport items have werknemer_naam, werven, totaal_uren fields"""
        resp = api_client.get(f"{BASE_URL}/api/rapporten/uren", params={"jaar": 2026, "week": 10})
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) > 0, "Expected at least one worker in rapport"
        item = data[0]
        assert "werknemer_naam" in item, "Missing werknemer_naam"
        assert "werven" in item, "Missing werven"
        assert "totaal_uren" in item, "Missing totaal_uren"

    def test_rapport_week_includes_test_worker(self, api_client, test_werkbon_for_rapport):
        """Rapport week 10 includes TEST_RapportWorker"""
        resp = api_client.get(f"{BASE_URL}/api/rapporten/uren", params={"jaar": 2026, "week": 10})
        assert resp.status_code == 200
        data = resp.json()
        names = [w["werknemer_naam"] for w in data]
        assert "TEST_RapportWorker" in names, f"TEST_RapportWorker not found in {names}"

    def test_rapport_week_correct_uren(self, api_client, test_werkbon_for_rapport):
        """TEST_RapportWorker has 40 uren (5 days x 8h) in week 10"""
        resp = api_client.get(f"{BASE_URL}/api/rapporten/uren", params={"jaar": 2026, "week": 10})
        assert resp.status_code == 200
        data = resp.json()
        worker = next((w for w in data if w["werknemer_naam"] == "TEST_RapportWorker"), None)
        assert worker is not None, "TEST_RapportWorker not found"
        assert worker["totaal_uren"] >= 40, f"Expected >= 40 uren, got {worker['totaal_uren']}"

    def test_rapport_week_werven_breakdown(self, api_client, test_werkbon_for_rapport):
        """TEST_RapportWorker werven list contains the test werf"""
        resp = api_client.get(f"{BASE_URL}/api/rapporten/uren", params={"jaar": 2026, "week": 10})
        assert resp.status_code == 200
        data = resp.json()
        worker = next((w for w in data if w["werknemer_naam"] == "TEST_RapportWorker"), None)
        assert worker is not None
        assert isinstance(worker["werven"], list)
        assert len(worker["werven"]) > 0, "No werven in rapport for worker"
        werf = worker["werven"][0]
        assert "werf_naam" in werf
        assert "uren" in werf

    def test_rapport_empty_week_returns_empty_list(self, api_client):
        """GET /api/rapporten/uren?jaar=2000&week=1 returns empty list"""
        resp = api_client.get(f"{BASE_URL}/api/rapporten/uren", params={"jaar": 2000, "week": 1})
        assert resp.status_code == 200
        data = resp.json()
        assert data == [], f"Expected empty list, got {data}"

    def test_rapport_week_without_params_returns_error_or_list(self, api_client):
        """GET /api/rapporten/uren without jaar returns 422 (validation error)"""
        resp = api_client.get(f"{BASE_URL}/api/rapporten/uren")
        assert resp.status_code == 422, f"Expected 422 for missing jaar, got {resp.status_code}"


# ==================== RAPPORT MAAND TESTS ====================

class TestRapportMaand:
    """Tests for GET /api/rapporten/uren (maand filter)"""

    def test_rapport_maand_returns_200(self, api_client):
        """GET /api/rapporten/uren?jaar=2026&maand=3 returns 200"""
        resp = api_client.get(f"{BASE_URL}/api/rapporten/uren", params={"jaar": 2026, "maand": 3})
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

    def test_rapport_maand_returns_list(self, api_client):
        """Rapport maand response is a list"""
        resp = api_client.get(f"{BASE_URL}/api/rapporten/uren", params={"jaar": 2026, "maand": 3})
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    def test_rapport_maand_includes_test_worker(self, api_client, test_werkbon_for_rapport):
        """Rapport month 3 (March 2026) includes TEST_RapportWorker (week 10 is in March)"""
        resp = api_client.get(f"{BASE_URL}/api/rapporten/uren", params={"jaar": 2026, "maand": 3})
        assert resp.status_code == 200
        data = resp.json()
        names = [w["werknemer_naam"] for w in data]
        assert "TEST_RapportWorker" in names, f"TEST_RapportWorker not found in March 2026 rapport. Names: {names}"

    def test_rapport_maand_correct_fields(self, api_client):
        """Rapport maand items have required fields"""
        resp = api_client.get(f"{BASE_URL}/api/rapporten/uren", params={"jaar": 2026, "maand": 3})
        assert resp.status_code == 200
        data = resp.json()
        if data:
            item = data[0]
            assert "werknemer_naam" in item
            assert "werven" in item
            assert "totaal_uren" in item

    def test_rapport_empty_maand_returns_empty_list(self, api_client):
        """GET /api/rapporten/uren?jaar=2000&maand=1 returns empty list"""
        resp = api_client.get(f"{BASE_URL}/api/rapporten/uren", params={"jaar": 2000, "maand": 1})
        assert resp.status_code == 200
        data = resp.json()
        assert data == [], f"Expected empty list, got {data}"


# ==================== WERKBON DUPLICEER TESTS ====================

class TestWerkbonDupliceer:
    """Tests for POST /api/werkbonnen/{id}/dupliceer (copy feature)"""

    def test_dupliceer_creates_new_werkbon(self, api_client, admin_user, test_klant, test_werf):
        """POST /api/werkbonnen/{id}/dupliceer returns new werkbon with different ID"""
        # Create original
        create_resp = api_client.post(
            f"{BASE_URL}/api/werkbonnen",
            params={"user_id": admin_user["id"], "user_naam": admin_user["naam"]},
            json={
                "week_nummer": 5, "jaar": 2026,
                "klant_id": test_klant["id"], "werf_id": test_werf["id"],
                "uren": [{"teamlid_naam": "TEST_Copy_Worker",
                           "maandag": 8, "dinsdag": 8, "woensdag": 8,
                           "donderdag": 8, "vrijdag": 8, "zaterdag": 0, "zondag": 0,
                           "afkorting_ma": "", "afkorting_di": "", "afkorting_wo": "",
                           "afkorting_do": "", "afkorting_vr": "", "afkorting_za": "", "afkorting_zo": ""}],
                "uitgevoerde_werken": "TEST copy original",
                "extra_materialen": "TEST mats",
            },
        )
        assert create_resp.status_code == 200
        original = create_resp.json()

        # Duplicate
        dup_resp = api_client.post(
            f"{BASE_URL}/api/werkbonnen/{original['id']}/dupliceer",
            params={"user_id": admin_user["id"], "user_naam": admin_user["naam"]},
        )
        assert dup_resp.status_code == 200, f"Dupliceer failed: {dup_resp.text}"
        duplicate = dup_resp.json()

        # Verify
        assert duplicate["id"] != original["id"]
        assert duplicate["klant_id"] == original["klant_id"]
        assert duplicate["werf_id"] == original["werf_id"]
        assert duplicate["status"] == "concept"
        assert duplicate["uitgevoerde_werken"] == ""  # description cleared
        assert duplicate["extra_materialen"] == ""  # materials cleared
        assert len(duplicate["uren"]) == 1

        # Cleanup
        api_client.delete(f"{BASE_URL}/api/werkbonnen/{original['id']}")
        api_client.delete(f"{BASE_URL}/api/werkbonnen/{duplicate['id']}")

    def test_dupliceer_nonexistent_returns_404(self, api_client, admin_user):
        """POST /api/werkbonnen/{fake}/dupliceer returns 404"""
        resp = api_client.post(
            f"{BASE_URL}/api/werkbonnen/{uuid.uuid4()}/dupliceer",
            params={"user_id": admin_user["id"], "user_naam": admin_user["naam"]},
        )
        assert resp.status_code == 404


# ==================== HEALTH CHECK ====================

def test_api_health(api_client):
    """Basic health check"""
    resp = api_client.get(f"{BASE_URL}/api/health")
    assert resp.status_code == 200
    assert resp.json().get("status") == "healthy"
