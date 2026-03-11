"""
Backend tests for new features:
- DELETE /api/werkbonnen/{id}
- POST /api/werkbonnen/{id}/dupliceer
- POST /api/klanten with btw_nummer
- GET /api/werkbonnen list
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
    """Create a test klant with btw_nummer for use in tests"""
    unique = uuid.uuid4().hex[:6]
    resp = api_client.post(
        f"{BASE_URL}/api/klanten",
        json={
            "naam": f"TEST_Klant_{unique}",
            "email": f"test-klant-{unique}@example.com",
            "uurtarief": 55,
            "btw_nummer": "BE0123456789",
        },
    )
    assert resp.status_code == 200, f"Create klant failed: {resp.text}"
    klant = resp.json()
    yield klant
    # Cleanup
    api_client.delete(f"{BASE_URL}/api/klanten/{klant['id']}")


@pytest.fixture(scope="session")
def test_werf(api_client, test_klant):
    """Create a test werf for use in tests"""
    unique = uuid.uuid4().hex[:6]
    resp = api_client.post(
        f"{BASE_URL}/api/werven",
        json={
            "naam": f"TEST_Werf_{unique}",
            "klant_id": test_klant["id"],
            "adres": "TEST Straat 1, Antwerpen",
        },
    )
    assert resp.status_code == 200, f"Create werf failed: {resp.text}"
    werf = resp.json()
    yield werf
    # Cleanup
    api_client.delete(f"{BASE_URL}/api/werven/{werf['id']}")


# ==================== KLANT TESTS ====================

class TestKlantWithBtwNummer:
    """Tests for klant creation with btw_nummer field"""

    def test_create_klant_with_btw_nummer(self, api_client):
        """POST /api/klanten with btw_nummer creates klant with field present"""
        unique = uuid.uuid4().hex[:6]
        resp = api_client.post(
            f"{BASE_URL}/api/klanten",
            json={
                "naam": f"TEST_BTW_{unique}",
                "email": f"btw-test-{unique}@example.com",
                "uurtarief": 0,
                "btw_nummer": "BE0987654321",
            },
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data["btw_nummer"] == "BE0987654321"
        assert data["naam"] == f"TEST_BTW_{unique}"

        # Cleanup
        api_client.delete(f"{BASE_URL}/api/klanten/{data['id']}")

    def test_create_klant_without_btw_nummer(self, api_client):
        """POST /api/klanten without btw_nummer should succeed (optional field)"""
        unique = uuid.uuid4().hex[:6]
        resp = api_client.post(
            f"{BASE_URL}/api/klanten",
            json={
                "naam": f"TEST_NoBTW_{unique}",
                "email": f"no-btw-{unique}@example.com",
                "uurtarief": 0,
            },
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        # btw_nummer should be None or absent
        assert data.get("btw_nummer") is None

        # Cleanup
        api_client.delete(f"{BASE_URL}/api/klanten/{data['id']}")

    def test_klant_btw_nummer_persists_after_update(self, api_client, test_klant):
        """PUT /api/klanten/{id} preserves btw_nummer when updating"""
        updated_resp = api_client.put(
            f"{BASE_URL}/api/klanten/{test_klant['id']}",
            json={
                "naam": test_klant["naam"],
                "email": test_klant["email"],
                "uurtarief": test_klant["uurtarief"],
                "btw_nummer": "BE9999999999",
            },
        )
        assert updated_resp.status_code == 200
        updated = updated_resp.json()
        assert updated["btw_nummer"] == "BE9999999999"

        # GET to verify persistence
        get_resp = api_client.get(f"{BASE_URL}/api/klanten")
        assert get_resp.status_code == 200
        klanten = get_resp.json()
        found = next((k for k in klanten if k["id"] == test_klant["id"]), None)
        assert found is not None
        assert found["btw_nummer"] == "BE9999999999"


# ==================== WERKBON LIST TESTS ====================

class TestWerkbonList:
    """Tests for GET /api/werkbonnen"""

    def test_get_werkbonnen_as_admin(self, api_client, admin_user):
        """GET /api/werkbonnen as admin returns a list"""
        resp = api_client.get(
            f"{BASE_URL}/api/werkbonnen",
            params={"user_id": admin_user["id"]},
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert isinstance(data, list)

    def test_werkbonnen_list_contains_required_fields(self, api_client, admin_user):
        """Werkbon list items contain week_nummer, klant_naam, status, uren"""
        resp = api_client.get(
            f"{BASE_URL}/api/werkbonnen",
            params={"user_id": admin_user["id"]},
        )
        assert resp.status_code == 200
        data = resp.json()
        if len(data) > 0:
            item = data[0]
            assert "week_nummer" in item
            assert "klant_naam" in item
            assert "status" in item
            assert "uren" in item
            assert isinstance(item["uren"], list)


# ==================== WERKBON DELETE TESTS ====================

class TestWerkbonDelete:
    """Tests for DELETE /api/werkbonnen/{id}"""

    def test_delete_werkbon(self, api_client, admin_user, test_klant, test_werf):
        """DELETE /api/werkbonnen/{id} removes the werkbon"""
        # Create werkbon
        create_resp = api_client.post(
            f"{BASE_URL}/api/werkbonnen",
            params={"user_id": admin_user["id"], "user_naam": admin_user["naam"]},
            json={
                "week_nummer": 3,
                "jaar": 2026,
                "klant_id": test_klant["id"],
                "werf_id": test_werf["id"],
                "uren": [
                    {
                        "teamlid_naam": "TEST Worker",
                        "maandag": 8, "dinsdag": 8, "woensdag": 8,
                        "donderdag": 8, "vrijdag": 8, "zaterdag": 0, "zondag": 0,
                        "afkorting_ma": "", "afkorting_di": "", "afkorting_wo": "",
                        "afkorting_do": "", "afkorting_vr": "", "afkorting_za": "", "afkorting_zo": "",
                    }
                ],
                "uitgevoerde_werken": "TEST delete test",
            },
        )
        assert create_resp.status_code == 200, f"Create failed: {create_resp.text}"
        werkbon = create_resp.json()
        werkbon_id = werkbon["id"]

        # Delete werkbon
        del_resp = api_client.delete(f"{BASE_URL}/api/werkbonnen/{werkbon_id}")
        assert del_resp.status_code == 200, f"Delete failed: {del_resp.text}"
        assert del_resp.json().get("message") == "Werkbon verwijderd"

        # Verify deletion
        get_resp = api_client.get(f"{BASE_URL}/api/werkbonnen/{werkbon_id}")
        assert get_resp.status_code == 404, "Werkbon should be gone after delete"

    def test_delete_nonexistent_werkbon_returns_404(self, api_client):
        """DELETE non-existing werkbon returns 404"""
        fake_id = str(uuid.uuid4())
        resp = api_client.delete(f"{BASE_URL}/api/werkbonnen/{fake_id}")
        assert resp.status_code == 404


# ==================== WERKBON DUPLICATE TESTS ====================

class TestWerkbonDuplicate:
    """Tests for POST /api/werkbonnen/{id}/dupliceer"""

    def test_duplicate_werkbon(self, api_client, admin_user, test_klant, test_werf):
        """POST /api/werkbonnen/{id}/dupliceer creates copy with current week"""
        # Create original werkbon
        create_resp = api_client.post(
            f"{BASE_URL}/api/werkbonnen",
            params={"user_id": admin_user["id"], "user_naam": admin_user["naam"]},
            json={
                "week_nummer": 1,
                "jaar": 2025,
                "klant_id": test_klant["id"],
                "werf_id": test_werf["id"],
                "uren": [
                    {
                        "teamlid_naam": "TEST Duplicate Worker",
                        "maandag": 7, "dinsdag": 7, "woensdag": 7,
                        "donderdag": 7, "vrijdag": 7, "zaterdag": 0, "zondag": 0,
                        "afkorting_ma": "", "afkorting_di": "", "afkorting_wo": "",
                        "afkorting_do": "", "afkorting_vr": "", "afkorting_za": "", "afkorting_zo": "",
                    }
                ],
                "uitgevoerde_werken": "TEST original",
                "extra_materialen": "TEST materials",
            },
        )
        assert create_resp.status_code == 200
        original = create_resp.json()

        # Duplicate werkbon
        dup_resp = api_client.post(
            f"{BASE_URL}/api/werkbonnen/{original['id']}/dupliceer",
            params={"user_id": admin_user["id"], "user_naam": admin_user["naam"]},
        )
        assert dup_resp.status_code == 200, f"Duplicate failed: {dup_resp.text}"
        duplicate = dup_resp.json()

        # Verify copy has correct attributes
        assert duplicate["id"] != original["id"], "Duplicate should have new ID"
        assert duplicate["klant_id"] == original["klant_id"]
        assert duplicate["werf_id"] == original["werf_id"]
        assert duplicate["klant_naam"] == original["klant_naam"]
        assert duplicate["werf_naam"] == original["werf_naam"]
        assert duplicate["status"] == "concept"
        # Duplicate should have current year (2026)
        assert duplicate["jaar"] >= 2025, "Duplicate should use current year"
        # Uren should be copied
        assert len(duplicate["uren"]) == len(original["uren"])
        assert duplicate["uren"][0]["teamlid_naam"] == original["uren"][0]["teamlid_naam"]
        # Beschrijvingen cleared
        assert duplicate["uitgevoerde_werken"] == ""
        assert duplicate["extra_materialen"] == ""

        # Cleanup
        api_client.delete(f"{BASE_URL}/api/werkbonnen/{original['id']}")
        api_client.delete(f"{BASE_URL}/api/werkbonnen/{duplicate['id']}")

    def test_duplicate_nonexistent_werkbon_returns_404(self, api_client, admin_user):
        """POST /api/werkbonnen/{fake_id}/dupliceer returns 404"""
        fake_id = str(uuid.uuid4())
        resp = api_client.post(
            f"{BASE_URL}/api/werkbonnen/{fake_id}/dupliceer",
            params={"user_id": admin_user["id"], "user_naam": admin_user["naam"]},
        )
        assert resp.status_code == 404


# ==================== HEALTH CHECK ====================

def test_api_health(api_client):
    """Basic health check"""
    resp = api_client.get(f"{BASE_URL}/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("status") == "healthy"
