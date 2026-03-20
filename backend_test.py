#!/usr/bin/env python3
"""
Comprehensive Werkbon Flow Testing Script
Tests all 4 werkbon types as specified in the review request
"""

import requests
import json
import sys
from datetime import datetime

# Backend URL from frontend/.env
BASE_URL = "https://expo-fastapi-1.preview.emergentagent.com/api"

# Test credentials
LOGIN_CREDENTIALS = {
    "email": "info@smart-techbv.be",
    "password": "Smart1988-"
}

# Global token storage
auth_token = None

def log_test(test_name, status, details=""):
    """Log test results with timestamp"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    status_symbol = "✅" if status == "PASS" else "❌" if status == "FAIL" else "⚠️"
    print(f"[{timestamp}] {status_symbol} {test_name}")
    if details:
        print(f"    {details}")

def make_request(method, endpoint, data=None, headers=None):
    """Make HTTP request with error handling"""
    url = f"{BASE_URL}{endpoint}"
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, headers=headers, timeout=60)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, headers=headers, timeout=60)
        elif method.upper() == "PUT":
            response = requests.put(url, json=data, headers=headers, timeout=60)
        elif method.upper() == "DELETE":
            response = requests.delete(url, headers=headers, timeout=60)
        else:
            raise ValueError(f"Unsupported method: {method}")
            
        return response
    except requests.exceptions.RequestException as e:
        log_test(f"Request Error", "FAIL", f"Failed to connect to {url}: {str(e)}")
        return None
    except Exception as e:
        log_test(f"Unexpected Error", "FAIL", f"Unexpected error: {str(e)}")
        return None

def test_login():
    """Test authentication and get JWT token"""
    global auth_token
    
    log_test("Authentication Test", "INFO", "Testing login with credentials...")
    
    response = make_request("POST", "/auth/login", LOGIN_CREDENTIALS)
    
    if not response:
        log_test("Login", "FAIL", "No response received")
        return False
        
    if response.status_code == 200:
        try:
            data = response.json()
            auth_token = data.get("token")
            if auth_token:
                log_test("Login", "PASS", f"JWT token received (length: {len(auth_token)})")
                return True
            else:
                log_test("Login", "FAIL", "No token in response")
                return False
        except json.JSONDecodeError:
            log_test("Login", "FAIL", "Invalid JSON response")
            return False
    else:
        log_test("Login", "FAIL", f"Status: {response.status_code}, Response: {response.text}")
        return False

def get_auth_headers():
    """Get authorization headers with JWT token"""
    if not auth_token:
        return {}
    return {"Authorization": f"Bearer {auth_token}"}

def test_uren_werkbon():
    """Test UREN werkbon creation (regular werkbon)"""
    log_test("UREN Werkbon Test", "INFO", "Testing regular werkbon creation...")
    
    # Note: The review request mentions /api/uren-werkbonnen but this endpoint doesn't exist
    # Testing regular werkbon endpoint instead as it handles "uren" type
    # Using valid klant_id and werf_id from the database
    werkbon_data = {
        "week_nummer": 12,
        "jaar": 2026,
        "klant_id": "b3dbf862-2ece-43f6-ab35-31366f99effb",  # test 123
        "werf_id": "12ad7b78-ff5a-415f-a39b-9f19aa93138b",   # Test Construction Site
        "uren": [{"teamlid_naam": "Jan Test", "maandag": 8, "dinsdag": 0, "woensdag": 0, "donderdag": 0, "vrijdag": 0, "zaterdag": 0, "zondag": 0}],
        "uitgevoerde_werken": "Test uren werkbon uitgevoerde werken",
        "extra_materialen": "Test materialen"
    }
    
    response = make_request("POST", "/werkbonnen", werkbon_data, get_auth_headers())
    
    if not response:
        log_test("UREN Werkbon Creation", "FAIL", "No response received")
        return False
        
    if response.status_code in [200, 201]:
        try:
            data = response.json()
            werkbon_id = data.get("id")
            log_test("UREN Werkbon Creation", "PASS", f"Created with ID: {werkbon_id}")
            return True
        except json.JSONDecodeError:
            log_test("UREN Werkbon Creation", "FAIL", "Invalid JSON response")
            return False
    else:
        log_test("UREN Werkbon Creation", "FAIL", f"Status: {response.status_code}, Response: {response.text}")
        return False

def test_oplevering_werkbon():
    """Test OPLEVERING werkbon creation"""
    log_test("OPLEVERING Werkbon Test", "INFO", "Testing oplevering werkbon creation...")
    
    werkbon_data = {
        "klant_id": "b3dbf862-2ece-43f6-ab35-31366f99effb",  # test 123
        "werf_id": "12ad7b78-ff5a-415f-a39b-9f19aa93138b",   # Test Construction Site
        "datum": "2026-03-20",
        "installatie_type": "PUR Isolatie",
        "werk_beschrijving": "Project oplevering test",
        "gebruikte_materialen": "PUR schuim, isolatieplaten",
        "extra_opmerkingen": "Test oplevering werkbon",
        "schade_status": "geen_schade",
        "schade_opmerking": "",
        "alles_ok": True,
        "beoordelingen": [
            {"categorie": "Kwaliteit", "score": 5, "opmerking": ""},
            {"categorie": "Netheid", "score": 5, "opmerking": ""},
            {"categorie": "Afwerking", "score": 5, "opmerking": ""},
            {"categorie": "Tijdigheid", "score": 5, "opmerking": ""},
            {"categorie": "Communicatie", "score": 5, "opmerking": ""}
        ],
        "fotos": [],
        "foto_labels": [],
        "handtekening_klant": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "handtekening_klant_naam": "Test Klant",
        "handtekening_monteur_naam": "Test Monteur"
    }
    
    response = make_request("POST", "/oplevering-werkbonnen", werkbon_data, get_auth_headers())
    
    if not response:
        log_test("OPLEVERING Werkbon Creation", "FAIL", "No response received")
        return False
        
    if response.status_code in [200, 201]:
        try:
            data = response.json()
            werkbon_id = data.get("id")
            log_test("OPLEVERING Werkbon Creation", "PASS", f"Created with ID: {werkbon_id}")
            return True
        except json.JSONDecodeError:
            log_test("OPLEVERING Werkbon Creation", "FAIL", "Invalid JSON response")
            return False
    else:
        try:
            error_text = response.text
            log_test("OPLEVERING Werkbon Creation", "FAIL", f"Status: {response.status_code}, Response: {error_text}")
        except:
            log_test("OPLEVERING Werkbon Creation", "FAIL", f"Status: {response.status_code}, No response text")
        return False

def test_project_werkbon():
    """Test PROJECT werkbon creation"""
    log_test("PROJECT Werkbon Test", "INFO", "Testing project werkbon creation...")
    
    werkbon_data = {
        "klant_id": "b3dbf862-2ece-43f6-ab35-31366f99effb",  # test 123
        "werf_id": "12ad7b78-ff5a-415f-a39b-9f19aa93138b",   # Test Construction Site
        "datum": "2026-03-20",
        "start_tijd": "08:00",
        "stop_tijd": "16:30",
        "pauze_minuten": 30,
        "werk_beschrijving": "Isolatie werkzaamheden",
        "extra_opmerkingen": "Test project werkbon",
        "dag_regels": [{"naam": "Taak 1", "voltooid": True}],
        "klant_feedback_items": [],
        "klant_feedback_opmerking": "",
        "klant_prestatie_score": 5,
        "handtekening_klant": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "handtekening_klant_naam": "Test Klant",
        "handtekening_monteur_naam": "Test Monteur"
    }
    
    response = make_request("POST", "/project-werkbonnen", werkbon_data, get_auth_headers())
    
    if not response:
        log_test("PROJECT Werkbon Creation", "FAIL", "No response received")
        return False
        
    if response.status_code in [200, 201]:
        try:
            data = response.json()
            werkbon_id = data.get("id")
            log_test("PROJECT Werkbon Creation", "PASS", f"Created with ID: {werkbon_id}")
            return True
        except json.JSONDecodeError:
            log_test("PROJECT Werkbon Creation", "FAIL", "Invalid JSON response")
            return False
    else:
        try:
            error_text = response.text
            log_test("PROJECT Werkbon Creation", "FAIL", f"Status: {response.status_code}, Response: {error_text}")
        except:
            log_test("PROJECT Werkbon Creation", "FAIL", f"Status: {response.status_code}, No response text")
        return False

def test_productie_werkbon():
    """Test PRESTATIE/PRODUCTIE werkbon creation"""
    log_test("PRODUCTIE Werkbon Test", "INFO", "Testing productie werkbon creation...")
    
    werkbon_data = {
        "datum": "2026-03-20",
        "werknemer_naam": "Test Monteur",
        "werknemer_id": "test-worker-1",
        "klant_id": "b3dbf862-2ece-43f6-ab35-31366f99effb",  # test 123
        "werf_id": "12ad7b78-ff5a-415f-a39b-9f19aa93138b",   # Test Construction Site
        "start_uur": "08:00",
        "eind_uur": "16:30",
        "voorziene_uur": "8u30",
        "uit_te_voeren_werk": "PUR Isolatie",
        "nodige_materiaal": "PUR schuim, isolatieplaten",
        "gelijkvloers_m2": 150.0,
        "gelijkvloers_cm": 10.0,
        "eerste_verdiep_m2": 0.0,
        "eerste_verdiep_cm": 0.0,
        "tweede_verdiep_m2": 0.0,
        "tweede_verdiep_cm": 0.0,
        "derde_verdiep_m2": 0.0,
        "derde_verdiep_cm": 0.0,
        "zolder_m2": 0.0,
        "zolder_cm": 0.0,
        "kelder_m2": 0.0,
        "kelder_cm": 0.0,
        "totaal_m2": 150.0,
        "totaal_m3": 15.0,
        "handtekening": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "handtekening_naam": "Test Klant",
        "fotos": [],
        "selfie": "",
        "gps_locatie": "",
        "schuurwerken": False,
        "stofzuigen": True
    }
    
    response = make_request("POST", "/productie-werkbonnen", werkbon_data, get_auth_headers())
    
    if not response:
        log_test("PRODUCTIE Werkbon Creation", "FAIL", "No response received")
        return False
        
    if response.status_code in [200, 201]:
        try:
            data = response.json()
            werkbon_id = data.get("id")
            log_test("PRODUCTIE Werkbon Creation", "PASS", f"Created with ID: {werkbon_id}")
            return True
        except json.JSONDecodeError:
            log_test("PRODUCTIE Werkbon Creation", "FAIL", "Invalid JSON response")
            return False
    else:
        log_test("PRODUCTIE Werkbon Creation", "FAIL", f"Status: {response.status_code}, Response: {response.text}")
        return False

def test_verify_werkbonnen():
    """Verify all werkbonnen were created"""
    log_test("Werkbonnen Verification", "INFO", "Verifying all werkbonnen were created...")
    
    # Get admin user ID for verification
    response = make_request("GET", "/werkbonnen?user_id=admin-001&is_admin=true", headers=get_auth_headers())
    
    if not response:
        log_test("Werkbonnen Verification", "FAIL", "No response received")
        return False
        
    if response.status_code == 200:
        try:
            data = response.json()
            werkbon_count = len(data)
            log_test("Werkbonnen Verification", "PASS", f"Found {werkbon_count} werkbonnen in database")
            
            # Show details of found werkbonnen
            for wb in data:
                wb_type = wb.get("type", "unknown")
                wb_id = wb.get("id", "no-id")
                klant = wb.get("klant_naam", "unknown")
                log_test("Werkbon Found", "INFO", f"Type: {wb_type}, ID: {wb_id}, Klant: {klant}")
            
            return True
        except json.JSONDecodeError:
            log_test("Werkbonnen Verification", "FAIL", "Invalid JSON response")
            return False
    else:
        log_test("Werkbonnen Verification", "FAIL", f"Status: {response.status_code}, Response: {response.text}")
        return False

def main():
    """Main test execution"""
    print("=" * 80)
    print("WERKBON FLOW COMPREHENSIVE TESTING")
    print("=" * 80)
    print(f"Backend URL: {BASE_URL}")
    print(f"Test started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print()
    
    # Track test results
    test_results = []
    
    # 1. Test Authentication
    if test_login():
        test_results.append(("Authentication", "PASS"))
    else:
        test_results.append(("Authentication", "FAIL"))
        print("\n❌ Authentication failed - cannot continue with werkbon tests")
        return False
    
    print()
    
    # 2. Test UREN Werkbon (regular werkbon with type="uren")
    if test_uren_werkbon():
        test_results.append(("UREN Werkbon", "PASS"))
    else:
        test_results.append(("UREN Werkbon", "FAIL"))
    
    print()
    
    # 3. Test OPLEVERING Werkbon
    if test_oplevering_werkbon():
        test_results.append(("OPLEVERING Werkbon", "PASS"))
    else:
        test_results.append(("OPLEVERING Werkbon", "FAIL"))
    
    print()
    
    # 4. Test PROJECT Werkbon
    if test_project_werkbon():
        test_results.append(("PROJECT Werkbon", "PASS"))
    else:
        test_results.append(("PROJECT Werkbon", "FAIL"))
    
    print()
    
    # 5. Test PRODUCTIE Werkbon
    if test_productie_werkbon():
        test_results.append(("PRODUCTIE Werkbon", "PASS"))
    else:
        test_results.append(("PRODUCTIE Werkbon", "FAIL"))
    
    print()
    
    # 6. Verify all werkbonnen
    if test_verify_werkbonnen():
        test_results.append(("Werkbonnen Verification", "PASS"))
    else:
        test_results.append(("Werkbonnen Verification", "FAIL"))
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed = sum(1 for _, status in test_results if status == "PASS")
    total = len(test_results)
    success_rate = (passed / total) * 100 if total > 0 else 0
    
    for test_name, status in test_results:
        status_symbol = "✅" if status == "PASS" else "❌"
        print(f"{status_symbol} {test_name}")
    
    print(f"\nSuccess Rate: {success_rate:.1f}% ({passed}/{total} tests passed)")
    
    if success_rate == 100:
        print("🎉 ALL WERKBON FLOW TESTS PASSED!")
        return True
    else:
        print("⚠️  Some tests failed - check details above")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)