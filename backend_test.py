#!/usr/bin/env python3

import requests
import json
import uuid
from datetime import datetime
import sys

# Base URL from frontend environment  
BASE_URL = "https://expo-fastapi-1.preview.emergentagent.com/api"

# Test credentials from review request
ADMIN_EMAIL = "info@smart-techbv.be"
ADMIN_PASSWORD = "Smart1988-"
WORKER_EMAIL = "davy@smart-techbv.be" 
WORKER_PASSWORD = "Smart1988-"
PLANNER_EMAIL = "hr@smart-techbv.be"
PLANNER_PASSWORD = "Smart1988-"

# Test data with correct structure
TEST_KLANT_DATA = {
    "bedrijfsnaam": "Test Security Klant BV",
    "type_klant": "bedrijf",
    "btw_nummer": "BE123456789",
    "algemeen_email": "test@example.com",
    "algemeen_telefoon": "0123456789",
    "adres_structured": {
        "straat": "Test Street",
        "huisnummer": "1",
        "postcode": "1000",
        "stad": "Brussels",
        "land": "België"
    }
}

TEST_WERF_DATA = {
    "naam": "Test Security Werf",
    "adres": "Test Site Street 1, 1000 Brussels",
    "klant_id": "b3dbf862-2ece-43f6-ab35-31366f99effb"  # Valid existing klant
}

TEST_PLANNING_DATA = {
    "week_nummer": 12,
    "jaar": 2026,
    "dag": "maandag",
    "datum": datetime.now().strftime("%Y-%m-%d"),
    "klant_id": "b3dbf862-2ece-43f6-ab35-31366f99effb",
    "werf_id": "12ad7b78-ff5a-415f-a39b-9f19aa93138b",
    "werknemer_ids": ["64fa6af4-630e-4f90-9452-fb3b74b4b432"],
    "werknemer_namen": ["Test Worker"],
    "omschrijving": "Test security planning"
}

TEST_WERKBON_DATA = {
    "week_nummer": 12,
    "jaar": 2026,
    "klant_id": "b3dbf862-2ece-43f6-ab35-31366f99effb",
    "werf_id": "12ad7b78-ff5a-415f-a39b-9f19aa93138b",
    "omschrijving": "Security test werkbon", 
    "datum": datetime.now().isoformat(),
    "uren_begin": "08:00",
    "uren_eind": "16:00",
    "team_leden": ["64fa6af4-630e-4f90-9452-fb3b74b4b432"]
}

TEST_BERICHT_DATA = {
    "naar_id": "2c4998b1-0f65-474d-ba53-196c8d3770c4",
    "is_broadcast": False,
    "onderwerp": "Security Test Bericht",
    "inhoud": "Testing user identity from JWT token"
}

def get_auth_token(email, password):
    """Get JWT token for authentication"""
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": email,
            "password": password
        })
        if response.status_code == 200:
            data = response.json()
            return data.get("token"), data.get("user", {})
        else:
            print(f"   ❌ Login failed: {response.text}")
            return None, None
    except Exception as e:
        print(f"   ❌ Login error: {e}")
        return None, None

def test_endpoint_without_auth(method, endpoint, data=None):
    """Test endpoint without authentication (should get 401)"""
    try:
        if method.upper() == "POST":
            response = requests.post(f"{BASE_URL}{endpoint}", json=data)
        elif method.upper() == "PUT":
            response = requests.put(f"{BASE_URL}{endpoint}", json=data)
        elif method.upper() == "DELETE":
            response = requests.delete(f"{BASE_URL}{endpoint}")
        else:
            response = requests.get(f"{BASE_URL}{endpoint}")
        
        return response.status_code, response.text
    except Exception as e:
        return 0, str(e)

def test_endpoint_with_auth(method, endpoint, token, data=None):
    """Test endpoint with authentication"""
    try:
        headers = {"Authorization": f"Bearer {token}"}
        
        if method.upper() == "POST":
            response = requests.post(f"{BASE_URL}{endpoint}", json=data, headers=headers)
        elif method.upper() == "PUT":
            response = requests.put(f"{BASE_URL}{endpoint}", json=data, headers=headers)
        elif method.upper() == "DELETE":
            response = requests.delete(f"{BASE_URL}{endpoint}", headers=headers)
        else:
            response = requests.get(f"{BASE_URL}{endpoint}", headers=headers)
        
        return response.status_code, response.text
    except Exception as e:
        return 0, str(e)

def test_auth_enforcement():
    """Test 1: Auth Enforcement for CUD Operations"""
    print("🔐 TESTING AUTH ENFORCEMENT FOR CUD OPERATIONS")
    print("-" * 60)
    
    results = {}
    
    # Test endpoints that should require admin/master_admin auth
    test_cases = [
        ("POST", "/klanten", TEST_KLANT_DATA),
        ("PUT", "/klanten/test-id", TEST_KLANT_DATA),
        ("DELETE", "/klanten/test-id", None),
        ("POST", "/werven", TEST_WERF_DATA),
        ("PUT", "/werven/test-id", TEST_WERF_DATA), 
        ("DELETE", "/werven/test-id", None),
        ("POST", "/planning", TEST_PLANNING_DATA),
        ("PUT", "/planning/test-id", TEST_PLANNING_DATA),
        ("DELETE", "/planning/test-id", None)
    ]
    
    print("Testing endpoints WITHOUT auth (expecting 401):")
    for method, endpoint, data in test_cases:
        status_code, response_text = test_endpoint_without_auth(method, endpoint, data)
        expected_401 = status_code == 401
        result_symbol = "✅" if expected_401 else "❌"
        print(f"   {result_symbol} {method} {endpoint}: {status_code}")
        results[f"no_auth_{method.lower()}{endpoint.replace('/', '_')}"] = expected_401
    
    return results

def test_admin_access():
    """Test 2: Admin Access (should get 200/201)"""
    print("\n👨‍💼 TESTING ADMIN ACCESS (expecting 200/201)")
    print("-" * 60)
    
    results = {}
    
    # Get admin token
    admin_token, admin_user = get_auth_token(ADMIN_EMAIL, ADMIN_PASSWORD)
    if not admin_token:
        print("❌ Cannot get admin token")
        return {"admin_login": False}
    
    print(f"✅ Admin login successful: {admin_user.get('naam', 'Unknown')}")
    results["admin_login"] = True
    
    # Test admin endpoints
    test_cases = [
        ("POST", "/klanten", TEST_KLANT_DATA),
        ("POST", "/werven", TEST_WERF_DATA),
        ("POST", "/planning", TEST_PLANNING_DATA)
    ]
    
    print("Testing endpoints WITH admin auth (expecting 200/201):")
    for method, endpoint, data in test_cases:
        status_code, response_text = test_endpoint_with_auth(method, endpoint, admin_token, data)
        success = status_code in [200, 201]
        result_symbol = "✅" if success else "❌"
        print(f"   {result_symbol} {method} {endpoint}: {status_code}")
        if not success:
            print(f"      Response: {response_text[:200]}...")
        results[f"admin_auth_{method.lower()}{endpoint.replace('/', '_')}"] = success
    
    return results, admin_token

def test_worker_access():
    """Test 3: Worker Access (should get 403 for admin operations)"""
    print("\n👷 TESTING WORKER ACCESS (expecting 403 for admin ops)")
    print("-" * 60)
    
    results = {}
    
    # Get worker token
    worker_token, worker_user = get_auth_token(WORKER_EMAIL, WORKER_PASSWORD)
    if not worker_token:
        print("❌ Cannot get worker token")
        return {"worker_login": False}
    
    print(f"✅ Worker login successful: {worker_user.get('naam', 'Unknown')}")
    results["worker_login"] = True
    
    # Test worker trying admin endpoints (should get 403)
    test_cases = [
        ("POST", "/klanten", TEST_KLANT_DATA),
        ("POST", "/planning", TEST_PLANNING_DATA)
    ]
    
    print("Testing admin endpoints WITH worker auth (expecting 403):")
    for method, endpoint, data in test_cases:
        status_code, response_text = test_endpoint_with_auth(method, endpoint, worker_token, data)
        expected_403 = status_code == 403
        result_symbol = "✅" if expected_403 else "❌"
        print(f"   {result_symbol} {method} {endpoint}: {status_code}")
        results[f"worker_forbidden_{method.lower()}{endpoint.replace('/', '_')}"] = expected_403
    
    return results, worker_token

def test_planner_access():
    """Test 4: Planner Access (should get 403 for CUD operations)"""
    print("\n📋 TESTING PLANNER ACCESS (expecting 403 for CUD ops)")
    print("-" * 60)
    
    results = {}
    
    # Get planner token
    planner_token, planner_user = get_auth_token(PLANNER_EMAIL, PLANNER_PASSWORD)
    if not planner_token:
        print("❌ Cannot get planner token")
        return {"planner_login": False}
    
    print(f"✅ Planner login successful: {planner_user.get('naam', 'Unknown')}")
    results["planner_login"] = True
    
    # Test planner trying CUD endpoints (should get 403)
    test_cases = [
        ("POST", "/klanten", TEST_KLANT_DATA),
        ("POST", "/planning", TEST_PLANNING_DATA)
    ]
    
    print("Testing CUD endpoints WITH planner auth (expecting 403):")
    for method, endpoint, data in test_cases:
        status_code, response_text = test_endpoint_with_auth(method, endpoint, planner_token, data)
        expected_403 = status_code == 403
        result_symbol = "✅" if expected_403 else "❌"
        print(f"   {result_symbol} {method} {endpoint}: {status_code}")
        results[f"planner_forbidden_{method.lower()}{endpoint.replace('/', '_')}"] = expected_403
    
    return results

def test_read_operations():
    """Test 5: Read Operations (should work without auth)"""
    print("\n📖 TESTING READ OPERATIONS (should work without auth)")
    print("-" * 60)
    
    results = {}
    
    # Test GET endpoints that should work without auth
    test_cases = [
        "/klanten",
        "/werven", 
        "/planning?week_nummer=12&jaar=2026"
    ]
    
    print("Testing GET endpoints WITHOUT auth (expecting 200):")
    for endpoint in test_cases:
        status_code, response_text = test_endpoint_without_auth("GET", endpoint)
        success = status_code == 200
        result_symbol = "✅" if success else "❌"
        print(f"   {result_symbol} GET {endpoint}: {status_code}")
        results[f"read_access{endpoint.split('?')[0].replace('/', '_')}"] = success
    
    return results

def test_user_trust_fixes(admin_token, worker_token):
    """Test 6: User Trust Fixes (user identity from JWT)"""
    print("\n🛡️ TESTING USER TRUST FIXES (JWT identity)")
    print("-" * 60)
    
    results = {}
    
    if not admin_token:
        print("❌ Cannot test without admin token")
        return {"missing_token": False}
    
    # Test werkbon creation uses JWT identity (not URL params)
    print("Testing werkbon creation with JWT auth:")
    
    werkbon_endpoints = [
        "/werkbonnen",
        "/oplevering-werkbonnen", 
        "/project-werkbonnen",
        "/productie-werkbonnen"
    ]
    
    for endpoint in werkbon_endpoints:
        status_code, response_text = test_endpoint_with_auth("POST", endpoint, admin_token, TEST_WERKBON_DATA)
        success = status_code in [200, 201]
        result_symbol = "✅" if success else "❌"
        print(f"   {result_symbol} POST {endpoint}: {status_code}")
        if not success:
            print(f"      Response: {response_text[:200]}...")
        results[f"werkbon_jwt{endpoint.replace('/', '_').replace('-', '_')}"] = success
    
    # Test bericht creation uses JWT identity
    print("Testing bericht creation with JWT auth:")
    status_code, response_text = test_endpoint_with_auth("POST", "/berichten", admin_token, TEST_BERICHT_DATA)
    success = status_code in [200, 201]
    result_symbol = "✅" if success else "❌"
    print(f"   {result_symbol} POST /berichten: {status_code}")
    if not success:
        print(f"      Response: {response_text[:200]}...")
    results["bericht_jwt_identity"] = success
    
    return results

def run_phase2a_security_tests():
    """Run comprehensive Phase 2A security tests"""
    print("🚀 PHASE 2A BACKEND SECURITY TESTING")
    print("=" * 60)
    print("Testing auth enforcement and user trust fixes")
    print("=" * 60)
    
    all_results = {}
    
    # Test 1: Auth Enforcement
    auth_results = test_auth_enforcement()
    all_results.update(auth_results)
    
    # Test 2: Admin Access
    admin_results, admin_token = test_admin_access()
    all_results.update(admin_results)
    
    # Test 3: Worker Access 
    worker_results, worker_token = test_worker_access()
    all_results.update(worker_results)
    
    # Test 4: Planner Access
    planner_results = test_planner_access()
    all_results.update(planner_results)
    
    # Test 5: Read Operations
    read_results = test_read_operations()
    all_results.update(read_results)
    
    # Test 6: User Trust Fixes
    trust_results = test_user_trust_fixes(admin_token, worker_token)
    all_results.update(trust_results)
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 PHASE 2A SECURITY TEST RESULTS SUMMARY:")
    print("=" * 60)
    
    total_tests = len(all_results)
    passed_tests = sum(1 for result in all_results.values() if result)
    
    # Group results by category
    categories = {
        "Auth Enforcement (401 without auth)": [k for k in all_results.keys() if k.startswith("no_auth_")],
        "Admin Access (200/201 with admin)": [k for k in all_results.keys() if k.startswith("admin_")],
        "Worker Access (403 for admin ops)": [k for k in all_results.keys() if k.startswith("worker_")],
        "Planner Access (403 for CUD)": [k for k in all_results.keys() if k.startswith("planner_")],
        "Read Operations (200 without auth)": [k for k in all_results.keys() if k.startswith("read_")],
        "User Trust Fixes (JWT identity)": [k for k in all_results.keys() if k.startswith(("werkbon_", "bericht_"))]
    }
    
    for category, test_keys in categories.items():
        if test_keys:
            print(f"\n{category}:")
            for key in test_keys:
                result = all_results[key]
                status = "✅ PASS" if result else "❌ FAIL"
                clean_name = key.replace("_", " ").title()
                print(f"   {clean_name:30}: {status}")
    
    print(f"\nOVERALL SUCCESS RATE: {passed_tests}/{total_tests} ({(passed_tests/total_tests)*100:.1f}%)")
    
    return all_results

if __name__ == "__main__":
    run_phase2a_security_tests()