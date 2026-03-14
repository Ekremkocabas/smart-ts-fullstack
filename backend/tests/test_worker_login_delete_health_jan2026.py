import os
import uuid

import pytest
import requests
from dotenv import dotenv_values


# Auth + health regression checks for worker login and non-admin deletion
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


def test_health_endpoint_healthy(api_client):
    response = api_client.get(f"{BASE_URL}/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data.get("status") == "healthy"
    assert data.get("database") == "connected"


def test_active_worker_login_success(api_client):
    response = api_client.post(
        f"{BASE_URL}/api/auth/login",
        json={
            "email": "haluk_ayar61@hotmail.com",
            "password": "Smart1234-",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data.get("email") == "haluk_ayar61@hotmail.com"
    assert data.get("actief") is True
    assert data.get("rol") != "admin"
    assert isinstance(data.get("id"), str) and data["id"]


def test_delete_non_admin_temp_user(api_client):
    unique = uuid.uuid4().hex[:8]
    temp_email = f"TEST_temp_delete_{unique}@example.com"

    create_response = api_client.post(
        f"{BASE_URL}/api/auth/register",
        json={
            "email": temp_email,
            "password": "TestDelete123!",
            "naam": f"TEST Temp Delete {unique}",
            "rol": "werknemer",
        },
    )
    assert create_response.status_code == 200
    created = create_response.json()
    user_id = created.get("id")
    assert created.get("email") == temp_email
    assert created.get("rol") == "werknemer"

    users_before_delete = api_client.get(f"{BASE_URL}/api/auth/users")
    assert users_before_delete.status_code == 200
    ids_before = {user.get("id") for user in users_before_delete.json()}
    assert user_id in ids_before

    delete_response = api_client.delete(f"{BASE_URL}/api/auth/users/{user_id}")
    assert delete_response.status_code == 200
    delete_data = delete_response.json()
    assert "verwijderd" in (delete_data.get("message") or "").lower()

    users_after_delete = api_client.get(f"{BASE_URL}/api/auth/users")
    assert users_after_delete.status_code == 200
    ids_after = {user.get("id") for user in users_after_delete.json()}
    assert user_id not in ids_after
