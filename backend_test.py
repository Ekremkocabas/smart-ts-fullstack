#!/usr/bin/env python3
"""
Comprehensive Backend API Test for Werkbon App
Tests all endpoints with realistic data for construction timesheet application
"""

import requests
import json
from datetime import datetime
import uuid

# Configuration
BACKEND_URL = "https://smart-ts-build.preview.emergentagent.com/api"
HEADERS = {"Content-Type": "application/json"}

# Test data - realistic construction company data
TEST_USER = {
    "email": "test@smart-techbv.be", 
    "password": "test123",
    "naam": "Jan Timmermans",
    "rol": "werknemer"
}

def print_test_result(test_name, success, details=""):
    """Helper function to print test results consistently"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status} {test_name}")
    if details:
        print(f"   Details: {details}")

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

def test_health_check():
    """Test basic connectivity"""
    print("\n=== HEALTH CHECK ===")
    
    # Test root endpoint
    response = make_request("GET", "/")
    if response and response.status_code == 200:
        data = response.json()
        print_test_result("Root endpoint", True, data.get("message", ""))
    else:
        print_test_result("Root endpoint", False, f"Status: {response.status_code if response else 'No response'}")
    
    # Test health endpoint
    response = make_request("GET", "/health")
    if response and response.status_code == 200:
        data = response.json()
        print_test_result("Health check", True, f"Status: {data.get('status')}, DB: {data.get('database')}")
    else:
        print_test_result("Health check", False, f"Status: {response.status_code if response else 'No response'}")

def test_authentication():
    """Test user authentication endpoints"""
    print("\n=== AUTHENTICATION TESTS ===")
    
    # Test user registration (if not exists)
    print("Testing user registration...")
    response = make_request("POST", "/auth/register", TEST_USER)
    if response:
        if response.status_code == 200:
            user_data = response.json()
            print_test_result("User registration", True, f"Created user: {user_data.get('naam')}")
        elif response.status_code == 400:
            print_test_result("User registration", True, "User already exists (expected)")
        else:
            print_test_result("User registration", False, f"Status: {response.status_code}, Error: {response.text}")
    else:
        print_test_result("User registration", False, "No response")
    
    # Test user login
    print("Testing user login...")
    login_data = {"email": TEST_USER["email"], "password": TEST_USER["password"]}
    response = make_request("POST", "/auth/login", login_data)
    if response and response.status_code == 200:
        user_data = response.json()
        print_test_result("User login", True, f"Logged in as: {user_data.get('naam')}")
        return user_data
    else:
        error = response.text if response else "No response"
        print_test_result("User login", False, f"Status: {response.status_code if response else 'None'}, Error: {error}")
        return None
    
def test_get_all_users():
    """Test getting all users"""
    print("Testing get all users...")
    response = make_request("GET", "/auth/users")
    if response and response.status_code == 200:
        users = response.json()
        print_test_result("Get all users", True, f"Found {len(users)} users")
        return users
    else:
        error = response.text if response else "No response"
        print_test_result("Get all users", False, f"Status: {response.status_code if response else 'None'}, Error: {error}")
        return []

def test_team_crud():
    """Test team member CRUD operations"""
    print("\n=== TEAM MEMBERS CRUD TESTS ===")
    
    created_members = []
    
    # Test CREATE team member
    print("Testing create team member...")
    team_data = {"naam": "Piet van der Berg"}
    response = make_request("POST", "/team", team_data)
    if response and response.status_code == 200:
        member = response.json()
        created_members.append(member)
        print_test_result("Create team member", True, f"Created: {member.get('naam')}")
        member_id = member.get('id')
    else:
        error = response.text if response else "No response"
        print_test_result("Create team member", False, f"Status: {response.status_code if response else 'None'}, Error: {error}")
        return []
    
    # Test GET all team members
    print("Testing get team members...")
    response = make_request("GET", "/team")
    if response and response.status_code == 200:
        members = response.json()
        print_test_result("Get team members", True, f"Found {len(members)} active members")
    else:
        error = response.text if response else "No response"
        print_test_result("Get team members", False, f"Status: {response.status_code if response else 'None'}, Error: {error}")
    
    # Test UPDATE team member
    if member_id:
        print("Testing update team member...")
        update_data = {"naam": "Piet van der Berg (Voorman)"}
        response = make_request("PUT", f"/team/{member_id}", update_data)
        if response and response.status_code == 200:
            updated_member = response.json()
            print_test_result("Update team member", True, f"Updated to: {updated_member.get('naam')}")
        else:
            error = response.text if response else "No response"
            print_test_result("Update team member", False, f"Status: {response.status_code if response else 'None'}, Error: {error}")
    
    # Test DELETE team member (soft delete)
    if member_id:
        print("Testing delete team member...")
        response = make_request("DELETE", f"/team/{member_id}")
        if response and response.status_code == 200:
            result = response.json()
            print_test_result("Delete team member", True, result.get('message', ''))
        else:
            error = response.text if response else "No response"
            print_test_result("Delete team member", False, f"Status: {response.status_code if response else 'None'}, Error: {error}")
    
    return created_members

def test_klanten_crud():
    """Test customer (klanten) CRUD operations"""
    print("\n=== KLANTEN (CUSTOMERS) CRUD TESTS ===")
    
    # Test CREATE klant
    print("Testing create klant...")
    klant_data = {
        "naam": "Bouwbedrijf Van Houten BV",
        "email": "info@vanhouten-bouw.nl",
        "telefoon": "+31 20 123 4567",
        "adres": "Keizersgracht 123, 1015 CJ Amsterdam"
    }
    response = make_request("POST", "/klanten", klant_data)
    if response and response.status_code == 200:
        klant = response.json()
        print_test_result("Create klant", True, f"Created: {klant.get('naam')}")
        klant_id = klant.get('id')
    else:
        error = response.text if response else "No response"
        print_test_result("Create klant", False, f"Status: {response.status_code if response else 'None'}, Error: {error}")
        return None
    
    # Test GET all klanten
    print("Testing get klanten...")
    response = make_request("GET", "/klanten")
    if response and response.status_code == 200:
        klanten = response.json()
        print_test_result("Get klanten", True, f"Found {len(klanten)} active customers")
    else:
        error = response.text if response else "No response"
        print_test_result("Get klanten", False, f"Status: {response.status_code if response else 'None'}, Error: {error}")
    
    # Test UPDATE klant
    if klant_id:
        print("Testing update klant...")
        update_data = {
            "naam": "Bouwbedrijf Van Houten BV (Hoofdvestiging)",
            "email": "hoofdvestiging@vanhouten-bouw.nl",
            "telefoon": "+31 20 123 4567",
            "adres": "Keizersgracht 123, 1015 CJ Amsterdam"
        }
        response = make_request("PUT", f"/klanten/{klant_id}", update_data)
        if response and response.status_code == 200:
            updated_klant = response.json()
            print_test_result("Update klant", True, f"Updated to: {updated_klant.get('naam')}")
        else:
            error = response.text if response else "No response"
            print_test_result("Update klant", False, f"Status: {response.status_code if response else 'None'}, Error: {error}")
    
    return klant_id

def test_werven_crud(klant_id):
    """Test worksite (werven) CRUD operations"""
    print("\n=== WERVEN (WORKSITES) CRUD TESTS ===")
    
    if not klant_id:
        print("⚠️  Skipping werven tests - no valid klant_id available")
        return None
    
    # Test CREATE werf
    print("Testing create werf...")
    werf_data = {
        "naam": "Nieuwbouw Appartementen",
        "klant_id": klant_id,
        "adres": "Bouwterrein Zuidplein 45, Amsterdam"
    }
    response = make_request("POST", "/werven", werf_data)
    if response and response.status_code == 200:
        werf = response.json()
        print_test_result("Create werf", True, f"Created: {werf.get('naam')}")
        werf_id = werf.get('id')
    else:
        error = response.text if response else "No response"
        print_test_result("Create werf", False, f"Status: {response.status_code if response else 'None'}, Error: {error}")
        return None
    
    # Test GET all werven
    print("Testing get werven...")
    response = make_request("GET", "/werven")
    if response and response.status_code == 200:
        werven = response.json()
        print_test_result("Get werven", True, f"Found {len(werven)} active worksites")
    else:
        error = response.text if response else "No response"
        print_test_result("Get werven", False, f"Status: {response.status_code if response else 'None'}, Error: {error}")
    
    # Test GET werven by klant
    print("Testing get werven by klant...")
    response = make_request("GET", f"/werven/klant/{klant_id}")
    if response and response.status_code == 200:
        werven_by_klant = response.json()
        print_test_result("Get werven by klant", True, f"Found {len(werven_by_klant)} worksites for customer")
    else:
        error = response.text if response else "No response"
        print_test_result("Get werven by klant", False, f"Status: {response.status_code if response else 'None'}, Error: {error}")
    
    return werf_id

def test_werkbonnen_crud(klant_id, werf_id, user_data):
    """Test timesheet (werkbonnen) CRUD operations"""
    print("\n=== WERKBONNEN (TIMESHEETS) CRUD TESTS ===")
    
    if not klant_id or not werf_id or not user_data:
        print("⚠️  Skipping werkbonnen tests - missing required data")
        return None
    
    # Test CREATE werkbon
    print("Testing create werkbon...")
    werkbon_data = {
        "week_nummer": 45,
        "jaar": 2024,
        "klant_id": klant_id,
        "werf_id": werf_id,
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
            },
            {
                "teamlid_naam": "Piet van der Berg",
                "maandag": 8.0,
                "dinsdag": 8.0,
                "woensdag": 8.0,
                "donderdag": 4.0,
                "vrijdag": 8.0,
                "zaterdag": 0.0,
                "zondag": 0.0
            }
        ]
    }
    
    # Create werkbon with query parameters
    params = {
        "user_id": user_data.get("id"),
        "user_naam": user_data.get("naam")
    }
    response = make_request("POST", "/werkbonnen", werkbon_data, params)
    if response and response.status_code == 200:
        werkbon = response.json()
        print_test_result("Create werkbon", True, f"Created werkbon for week {werkbon.get('week_nummer')}")
        werkbon_id = werkbon.get('id')
    else:
        error = response.text if response else "No response"
        print_test_result("Create werkbon", False, f"Status: {response.status_code if response else 'None'}, Error: {error}")
        return None
    
    # Test GET all werkbonnen
    print("Testing get werkbonnen...")
    response = make_request("GET", "/werkbonnen")
    if response and response.status_code == 200:
        werkbonnen = response.json()
        print_test_result("Get werkbonnen", True, f"Found {len(werkbonnen)} timesheets")
    else:
        error = response.text if response else "No response"
        print_test_result("Get werkbonnen", False, f"Status: {response.status_code if response else 'None'}, Error: {error}")
    
    # Test GET single werkbon
    if werkbon_id:
        print("Testing get single werkbon...")
        response = make_request("GET", f"/werkbonnen/{werkbon_id}")
        if response and response.status_code == 200:
            single_werkbon = response.json()
            print_test_result("Get single werkbon", True, f"Retrieved werkbon for week {single_werkbon.get('week_nummer')}")
        else:
            error = response.text if response else "No response"
            print_test_result("Get single werkbon", False, f"Status: {response.status_code if response else 'None'}, Error: {error}")
    
    # Test UPDATE werkbon (add signature)
    if werkbon_id:
        print("Testing update werkbon with signature...")
        signature_data = {
            "handtekening_data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
            "handtekening_naam": "Jan Timmermans",
            "status": "ondertekend"
        }
        response = make_request("PUT", f"/werkbonnen/{werkbon_id}", signature_data)
        if response and response.status_code == 200:
            updated_werkbon = response.json()
            print_test_result("Update werkbon signature", True, f"Status changed to: {updated_werkbon.get('status')}")
        else:
            error = response.text if response else "No response"
            print_test_result("Update werkbon signature", False, f"Status: {response.status_code if response else 'None'}, Error: {error}")
    
    # Test SEND werkbon (email placeholder)
    if werkbon_id:
        print("Testing send werkbon...")
        response = make_request("POST", f"/werkbonnen/{werkbon_id}/verzenden")
        if response and response.status_code == 200:
            result = response.json()
            print_test_result("Send werkbon", True, result.get('message', ''))
        else:
            error = response.text if response else "No response"
            print_test_result("Send werkbon", False, f"Status: {response.status_code if response else 'None'}, Error: {error}")
    
    return werkbon_id

def test_company_settings():
    """Test company settings CRUD operations"""
    print("\n=== COMPANY SETTINGS TESTS ===")
    
    # Test GET instellingen
    print("Testing get company settings...")
    response = make_request("GET", "/instellingen")
    if response and response.status_code == 200:
        settings = response.json()
        print_test_result("Get company settings", True, f"Company: {settings.get('bedrijfsnaam')}")
    else:
        error = response.text if response else "No response"
        print_test_result("Get company settings", False, f"Status: {response.status_code if response else 'None'}, Error: {error}")
    
    # Test UPDATE instellingen
    print("Testing update company settings...")
    update_data = {
        "bedrijfsnaam": "Smart-Tech BV (Updated)",
        "telefoon": "+31 88 123 4567",
        "kvk_nummer": "12345678"
    }
    response = make_request("PUT", "/instellingen", update_data)
    if response and response.status_code == 200:
        updated_settings = response.json()
        print_test_result("Update company settings", True, f"Updated company: {updated_settings.get('bedrijfsnaam')}")
    else:
        error = response.text if response else "No response"
        print_test_result("Update company settings", False, f"Status: {response.status_code if response else 'None'}, Error: {error}")

def test_error_handling():
    """Test API error handling"""
    print("\n=== ERROR HANDLING TESTS ===")
    
    # Test invalid login
    print("Testing invalid login...")
    invalid_login = {"email": "invalid@example.com", "password": "wrongpassword"}
    response = make_request("POST", "/auth/login", invalid_login)
    if response and response.status_code == 401:
        print_test_result("Invalid login error handling", True, "Correctly returned 401 Unauthorized")
    else:
        print_test_result("Invalid login error handling", False, f"Expected 401, got {response.status_code if response else 'None'}")
    
    # Test non-existent resource
    print("Testing non-existent werkbon...")
    fake_id = str(uuid.uuid4())
    response = make_request("GET", f"/werkbonnen/{fake_id}")
    if response and response.status_code == 404:
        print_test_result("Non-existent resource error handling", True, "Correctly returned 404 Not Found")
    else:
        print_test_result("Non-existent resource error handling", False, f"Expected 404, got {response.status_code if response else 'None'}")
    
    # Test invalid data format
    print("Testing invalid data format...")
    invalid_klant = {"naam": "", "email": "invalid-email"}  # Empty name, invalid email
    response = make_request("POST", "/klanten", invalid_klant)
    if response and response.status_code in [400, 422]:  # Either 400 Bad Request or 422 Unprocessable Entity
        print_test_result("Invalid data error handling", True, f"Correctly returned {response.status_code}")
    else:
        print_test_result("Invalid data error handling", False, f"Expected 400/422, got {response.status_code if response else 'None'}")

def run_all_tests():
    """Run all test suites"""
    print("🚀 Starting Werkbon API Backend Tests")
    print(f"Backend URL: {BACKEND_URL}")
    print("=" * 60)
    
    # Store test results for summary
    test_results = {
        "total_tests": 0,
        "passed_tests": 0,
        "failed_tests": 0,
        "critical_failures": []
    }
    
    try:
        # Basic connectivity
        test_health_check()
        
        # Authentication
        user_data = test_authentication()
        test_get_all_users()
        
        # CRUD operations
        test_team_crud()
        klant_id = test_klanten_crud()
        werf_id = test_werven_crud(klant_id)
        werkbon_id = test_werkbonnen_crud(klant_id, werf_id, user_data)
        
        # Settings
        test_company_settings()
        
        # Error handling
        test_error_handling()
        
    except Exception as e:
        print(f"\n❌ CRITICAL ERROR during testing: {e}")
        test_results["critical_failures"].append(f"Test execution error: {e}")
    
    print("\n" + "=" * 60)
    print("🏁 Backend API Testing Complete")
    print("=" * 60)

if __name__ == "__main__":
    run_all_tests()