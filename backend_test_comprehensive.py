#!/usr/bin/env python3
"""
Comprehensive Backend API Test for Werkbon App
Tests all endpoints based on specific review requirements
"""

import requests
import json
from datetime import datetime
import uuid
import sys

# Configuration - Using the correct backend URL from frontend .env
BACKEND_URL = "https://web-portal-debug.preview.emergentagent.com/api"
HEADERS = {"Content-Type": "application/json"}

class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.critical_failures = []
        self.tests_run = []
    
    def log_test(self, name, success, details=""):
        status = "✅ PASS" if success else "❌ FAIL"
        message = f"{status} {name}"
        if details:
            message += f" - {details}"
        print(message)
        self.tests_run.append({"name": name, "success": success, "details": details})
        
        if success:
            self.passed += 1
        else:
            self.failed += 1
            if "critical" in name.lower() or "login" in name.lower():
                self.critical_failures.append(f"{name}: {details}")

def make_request(method, endpoint, data=None, params=None):
    """Helper function to make HTTP requests with proper error handling"""
    url = f"{BACKEND_URL}{endpoint}"
    try:
        if method.upper() == "GET":
            response = requests.get(url, headers=HEADERS, params=params)
        elif method.upper() == "POST":
            response = requests.post(url, headers=HEADERS, json=data, params=params)
        elif method.upper() == "PUT":
            response = requests.put(url, headers=HEADERS, json=data)
        elif method.upper() == "DELETE":
            response = requests.delete(url, headers=HEADERS)
        else:
            raise ValueError(f"Unsupported HTTP method: {method}")
            
        return response
    except requests.exceptions.RequestException as e:
        print(f"❌ Network error for {method} {endpoint}: {e}")
        return None

def test_1_user_authentication(results):
    """Test Suite 1: User Authentication Tests"""
    print("\n" + "="*50)
    print("TEST SUITE 1: USER AUTHENTICATION")
    print("="*50)
    
    # Test admin login with specific credentials
    admin_login_data = {
        "email": "info@smart-techbv.be", 
        "password": "smart123"
    }
    
    print("Testing admin login with info@smart-techbv.be / smart123...")
    response = make_request("POST", "/auth/login", admin_login_data)
    if response and response.status_code == 200:
        admin_data = response.json()
        expected_role = admin_data.get("rol")
        if expected_role == "admin":
            results.log_test("Admin Login - Correct Role", True, f"Role: {expected_role}")
        else:
            results.log_test("Admin Login - Correct Role", False, f"Expected 'admin', got '{expected_role}'")
        
        # Check all required fields
        required_fields = ["id", "email", "naam", "rol", "actief"]
        missing_fields = [field for field in required_fields if field not in admin_data]
        if not missing_fields:
            results.log_test("Admin Login - All Fields Present", True, "All required fields returned")
        else:
            results.log_test("Admin Login - All Fields Present", False, f"Missing fields: {missing_fields}")
    else:
        error_msg = response.text if response else "No response"
        results.log_test("Admin Login - Authentication", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
        return None
    
    # Test getting all users (including werknemers)
    print("Testing GET /api/auth/users...")
    response = make_request("GET", "/auth/users")
    if response and response.status_code == 200:
        users = response.json()
        results.log_test("Get All Users", True, f"Retrieved {len(users)} users")
        return users, admin_data
    else:
        error_msg = response.text if response else "No response"  
        results.log_test("Get All Users", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
        return [], admin_data

def test_2_werknemers_management(results, users):
    """Test Suite 2: Werknemers Management Tests"""
    print("\n" + "="*50)
    print("TEST SUITE 2: WERKNEMERS MANAGEMENT")
    print("="*50)
    
    # Test registering a new werknemer
    new_werknemer = {
        "email": f"werknemer{datetime.now().strftime('%H%M%S')}@smart-techbv.be",
        "password": "werknemer123", 
        "naam": "Nieuwe Werknemer",
        "rol": "werknemer"
    }
    
    print("Testing POST /api/auth/register with new werknemer...")
    response = make_request("POST", "/auth/register", new_werknemer)
    if response and response.status_code == 200:
        werknemer_data = response.json()
        results.log_test("Register New Werknemer", True, f"Created: {werknemer_data.get('naam')}")
        werknemer_id = werknemer_data.get("id")
    else:
        error_msg = response.text if response else "No response"
        results.log_test("Register New Werknemer", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
        return None
    
    # Test deactivating user
    if werknemer_id:
        print(f"Testing PUT /api/auth/users/{werknemer_id} with actief: false...")
        deactivate_data = {"actief": False}
        response = make_request("PUT", f"/auth/users/{werknemer_id}", deactivate_data)
        if response and response.status_code == 200:
            updated_user = response.json()
            if updated_user.get("actief") == False:
                results.log_test("Deactivate User", True, "User successfully deactivated")
            else:
                results.log_test("Deactivate User", False, f"User actief status: {updated_user.get('actief')}")
        else:
            error_msg = response.text if response else "No response"
            results.log_test("Deactivate User", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
    
    return werknemer_id

def test_3_teams(results):
    """Test Suite 3: Teams Tests"""
    print("\n" + "="*50)
    print("TEST SUITE 3: TEAMS")
    print("="*50)
    
    # Test GET /api/teams
    print("Testing GET /api/teams...")
    response = make_request("GET", "/teams")
    if response and response.status_code == 200:
        teams = response.json()
        results.log_test("Get Teams", True, f"Retrieved {len(teams)} teams")
    else:
        error_msg = response.text if response else "No response"
        results.log_test("Get Teams", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
    
    # Test POST /api/teams
    team_data = {
        "naam": "Test Team",
        "leden": ["Jan", "Piet"]
    }
    print("Testing POST /api/teams...")
    response = make_request("POST", "/teams", team_data)
    if response and response.status_code == 200:
        created_team = response.json()
        results.log_test("Create Team", True, f"Created team: {created_team.get('naam')}")
        team_id = created_team.get("id")
    else:
        error_msg = response.text if response else "No response"
        results.log_test("Create Team", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
        return None
    
    # Test PUT /api/teams/{id}
    if team_id:
        update_data = {
            "naam": "Updated Test Team",
            "leden": ["Jan", "Piet", "Klaas"]
        }
        print(f"Testing PUT /api/teams/{team_id}...")
        response = make_request("PUT", f"/teams/{team_id}", update_data)
        if response and response.status_code == 200:
            updated_team = response.json()
            results.log_test("Update Team", True, f"Updated team: {updated_team.get('naam')}")
        else:
            error_msg = response.text if response else "No response"
            results.log_test("Update Team", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
    
    # Test DELETE /api/teams/{id}
    if team_id:
        print(f"Testing DELETE /api/teams/{team_id}...")
        response = make_request("DELETE", f"/teams/{team_id}")
        if response and response.status_code == 200:
            result = response.json()
            results.log_test("Delete Team", True, result.get("message", "Team deleted"))
        else:
            error_msg = response.text if response else "No response"
            results.log_test("Delete Team", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
    
    return team_id

def test_4_klanten(results):
    """Test Suite 4: Klanten Tests"""
    print("\n" + "="*50)
    print("TEST SUITE 4: KLANTEN")
    print("="*50)
    
    # Test GET /api/klanten
    print("Testing GET /api/klanten...")
    response = make_request("GET", "/klanten")
    if response and response.status_code == 200:
        klanten = response.json()
        results.log_test("Get Klanten", True, f"Retrieved {len(klanten)} klanten")
    else:
        error_msg = response.text if response else "No response"
        results.log_test("Get Klanten", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
    
    # Test POST /api/klanten
    klant_data = {
        "naam": "Test Klant",
        "email": "klant@test.nl",
        "uurtarief": 50
    }
    print("Testing POST /api/klanten...")
    response = make_request("POST", "/klanten", klant_data)
    if response and response.status_code == 200:
        created_klant = response.json()
        results.log_test("Create Klant", True, f"Created klant: {created_klant.get('naam')}")
        return created_klant.get("id")
    else:
        error_msg = response.text if response else "No response"
        results.log_test("Create Klant", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
        return None

def test_5_werven(results, klant_id):
    """Test Suite 5: Werven Tests"""
    print("\n" + "="*50)
    print("TEST SUITE 5: WERVEN")
    print("="*50)
    
    if not klant_id:
        results.log_test("Werven Tests - Prerequisite", False, "No valid klant_id available")
        return None
    
    # Test GET /api/werven
    print("Testing GET /api/werven...")
    response = make_request("GET", "/werven")
    if response and response.status_code == 200:
        werven = response.json()
        results.log_test("Get Werven", True, f"Retrieved {len(werven)} werven")
    else:
        error_msg = response.text if response else "No response"
        results.log_test("Get Werven", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
    
    # Test POST /api/werven
    werf_data = {
        "naam": "Test Werf",
        "klant_id": klant_id,
        "adres": "Test Adres 123"
    }
    print("Testing POST /api/werven...")
    response = make_request("POST", "/werven", werf_data)
    if response and response.status_code == 200:
        created_werf = response.json()
        results.log_test("Create Werf", True, f"Created werf: {created_werf.get('naam')}")
        werf_id = created_werf.get("id")
    else:
        error_msg = response.text if response else "No response"
        results.log_test("Create Werf", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
        return None
    
    # Test GET /api/werven/klant/{klant_id}
    print(f"Testing GET /api/werven/klant/{klant_id}...")
    response = make_request("GET", f"/werven/klant/{klant_id}")
    if response and response.status_code == 200:
        werven_by_klant = response.json()
        results.log_test("Get Werven by Klant", True, f"Retrieved {len(werven_by_klant)} werven for klant")
    else:
        error_msg = response.text if response else "No response"
        results.log_test("Get Werven by Klant", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
    
    return werf_id

def test_6_werkbonnen(results, klant_id, werf_id, admin_data):
    """Test Suite 6: Werkbon Tests"""
    print("\n" + "="*50)
    print("TEST SUITE 6: WERKBONNEN")
    print("="*50)
    
    if not klant_id or not werf_id or not admin_data:
        results.log_test("Werkbonnen Tests - Prerequisites", False, "Missing required data (klant_id, werf_id, or user_data)")
        return None
    
    # Test GET /api/werkbonnen
    print("Testing GET /api/werkbonnen...")
    response = make_request("GET", "/werkbonnen")
    if response and response.status_code == 200:
        werkbonnen = response.json()
        results.log_test("Get Werkbonnen", True, f"Retrieved {len(werkbonnen)} werkbonnen")
    else:
        error_msg = response.text if response else "No response"
        results.log_test("Get Werkbonnen", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
    
    # Test POST /api/werkbonnen with full data
    werkbon_data = {
        "week_nummer": 47,
        "jaar": 2024,
        "klant_id": klant_id,
        "werf_id": werf_id,
        "uitgevoerde_werken": "Muren bouwen en afwerking",
        "extra_materialen": "Extra cement en stenen",
        "uren": [
            {
                "teamlid_naam": "Jan Timmermans",
                "maandag": 8.0,
                "dinsdag": 8.0,
                "woensdag": 7.5,
                "donderdag": 8.0,
                "vrijdag": 6.0,
                "zaterdag": 0.0,
                "zondag": 0.0
            }
        ]
    }
    
    params = {
        "user_id": admin_data.get("id"),
        "user_naam": admin_data.get("naam")
    }
    
    print("Testing POST /api/werkbonnen with full data...")
    response = make_request("POST", "/werkbonnen", werkbon_data, params)
    if response and response.status_code == 200:
        created_werkbon = response.json()
        results.log_test("Create Werkbon", True, f"Created werkbon for week {created_werkbon.get('week_nummer')}")
        werkbon_id = created_werkbon.get("id")
    else:
        error_msg = response.text if response else "No response"
        results.log_test("Create Werkbon", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
        return None
    
    # Test GET /api/werkbonnen/{id}
    if werkbon_id:
        print(f"Testing GET /api/werkbonnen/{werkbon_id}...")
        response = make_request("GET", f"/werkbonnen/{werkbon_id}")
        if response and response.status_code == 200:
            single_werkbon = response.json()
            results.log_test("Get Single Werkbon", True, f"Retrieved werkbon for week {single_werkbon.get('week_nummer')}")
        else:
            error_msg = response.text if response else "No response"
            results.log_test("Get Single Werkbon", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
    
    # Test PUT /api/werkbonnen/{id} with signature data
    if werkbon_id:
        signature_data = {
            "handtekening_data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
            "handtekening_naam": "Jan Timmermans"
        }
        
        print(f"Testing PUT /api/werkbonnen/{werkbon_id} with signature data...")
        response = make_request("PUT", f"/werkbonnen/{werkbon_id}", signature_data)
        if response and response.status_code == 200:
            updated_werkbon = response.json()
            results.log_test("Update Werkbon - Add Signature", True, f"Status: {updated_werkbon.get('status')}")
        else:
            error_msg = response.text if response else "No response"
            results.log_test("Update Werkbon - Add Signature", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
    
    # Test POST /api/werkbonnen/{id}/verzenden
    if werkbon_id:
        print(f"Testing POST /api/werkbonnen/{werkbon_id}/verzenden...")
        response = make_request("POST", f"/werkbonnen/{werkbon_id}/verzenden")
        if response and response.status_code == 200:
            send_result = response.json()
            results.log_test("Send Werkbon", True, send_result.get("message", "Email sent"))
        else:
            error_msg = response.text if response else "No response"
            results.log_test("Send Werkbon", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
    
    return werkbon_id

def test_7_settings(results):
    """Test Suite 7: Settings Tests"""
    print("\n" + "="*50)
    print("TEST SUITE 7: SETTINGS")
    print("="*50)
    
    # Test GET /api/instellingen
    print("Testing GET /api/instellingen...")
    response = make_request("GET", "/instellingen")
    if response and response.status_code == 200:
        settings = response.json()
        results.log_test("Get Settings", True, f"Company: {settings.get('bedrijfsnaam')}")
    else:
        error_msg = response.text if response else "No response"
        results.log_test("Get Settings", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")
    
    # Test PUT /api/instellingen
    settings_update = {
        "bedrijfsnaam": "Smart-Tech BV Test",
        "adres": "Test Straat 123, 1234 AB Amsterdam",
        "logo_base64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
        "pdf_voettekst": "Test footer voor PDF documenten"
    }
    
    print("Testing PUT /api/instellingen...")
    response = make_request("PUT", "/instellingen", settings_update)
    if response and response.status_code == 200:
        updated_settings = response.json()
        results.log_test("Update Settings", True, f"Updated company: {updated_settings.get('bedrijfsnaam')}")
    else:
        error_msg = response.text if response else "No response"
        results.log_test("Update Settings", False, f"Status: {response.status_code if response else 'None'}, Error: {error_msg}")

def run_comprehensive_tests():
    """Run all comprehensive tests based on review requirements"""
    print("🚀 COMPREHENSIVE WERKBON BACKEND TESTING")
    print(f"Backend URL: {BACKEND_URL}")
    print("=" * 70)
    
    results = TestResults()
    
    try:
        # Test Suite 1: User Authentication Tests
        users, admin_data = test_1_user_authentication(results)
        
        # Test Suite 2: Werknemers Management Tests  
        werknemer_id = test_2_werknemers_management(results, users)
        
        # Test Suite 3: Teams Tests
        team_id = test_3_teams(results)
        
        # Test Suite 4: Klanten Tests
        klant_id = test_4_klanten(results)
        
        # Test Suite 5: Werven Tests
        werf_id = test_5_werven(results, klant_id)
        
        # Test Suite 6: Werkbon Tests
        werkbon_id = test_6_werkbonnen(results, klant_id, werf_id, admin_data)
        
        # Test Suite 7: Settings Tests
        test_7_settings(results)
        
    except Exception as e:
        print(f"\n❌ CRITICAL ERROR during testing: {e}")
        results.critical_failures.append(f"Test execution error: {e}")
    
    # Print summary
    print("\n" + "="*70)
    print("🏁 COMPREHENSIVE TEST SUMMARY")
    print("="*70)
    print(f"Total Tests: {results.passed + results.failed}")
    print(f"✅ Passed: {results.passed}")
    print(f"❌ Failed: {results.failed}")
    
    if results.critical_failures:
        print(f"\n⚠️  CRITICAL FAILURES ({len(results.critical_failures)}):")
        for failure in results.critical_failures:
            print(f"   • {failure}")
    
    print(f"\nSuccess Rate: {(results.passed/(results.passed + results.failed)*100):.1f}%")
    
    # Return results for further processing
    return results

if __name__ == "__main__":
    results = run_comprehensive_tests()
    
    # Exit with error code if there are critical failures
    if results.critical_failures:
        sys.exit(1)
    else:
        sys.exit(0)