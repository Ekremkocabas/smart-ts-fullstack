#!/usr/bin/env python3
"""
Admin Login Test for Werkbon App
Tests the specific admin login scenario with info@smart-techbv.be credentials
"""

import requests
import json
from datetime import datetime

# Configuration
BACKEND_URL = "https://smart-ops-deploy.preview.emergentagent.com/api"
HEADERS = {"Content-Type": "application/json"}

# Admin credentials as requested
ADMIN_CREDENTIALS = {
    "email": "info@smart-techbv.be",
    "password": "smart123"
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
            response = requests.get(url, headers=HEADERS, params=params, timeout=30)
        elif method.upper() == "POST":
            response = requests.post(url, headers=HEADERS, json=data, params=params, timeout=30)
        elif method.upper() == "PUT":
            response = requests.put(url, headers=HEADERS, json=data, timeout=30)
        elif method.upper() == "DELETE":
            response = requests.delete(url, headers=HEADERS, timeout=30)
        else:
            raise ValueError(f"Unsupported HTTP method: {method}")
            
        return response
    except requests.exceptions.RequestException as e:
        print(f"❌ Network error for {method} {endpoint}: {e}")
        return None

def test_admin_login_success():
    """Test 1: Login with admin credentials and verify admin role"""
    print("\n=== TEST 1: ADMIN LOGIN SUCCESS ===")
    
    login_data = {
        "email": ADMIN_CREDENTIALS["email"],
        "password": ADMIN_CREDENTIALS["password"]
    }
    
    print(f"Attempting login with: {login_data['email']}")
    response = make_request("POST", "/auth/login", login_data)
    
    if not response:
        print_test_result("Admin login request", False, "No response received")
        return None
    
    if response.status_code != 200:
        print_test_result("Admin login request", False, f"Status: {response.status_code}, Error: {response.text}")
        return None
    
    try:
        user_data = response.json()
    except json.JSONDecodeError:
        print_test_result("Admin login response", False, "Invalid JSON response")
        return None
    
    # Test successful login
    print_test_result("Admin login request", True, f"Status: {response.status_code}")
    
    return user_data

def test_required_fields(user_data):
    """Test 2: Verify the response contains all required fields"""
    print("\n=== TEST 2: VERIFY REQUIRED FIELDS ===")
    
    if not user_data:
        print_test_result("Required fields check", False, "No user data to check")
        return False
    
    required_fields = ["id", "email", "naam", "rol", "actief"]
    missing_fields = []
    
    for field in required_fields:
        if field not in user_data:
            missing_fields.append(field)
    
    if missing_fields:
        print_test_result("Required fields check", False, f"Missing fields: {missing_fields}")
        return False
    
    print_test_result("Required fields check", True, f"All required fields present: {required_fields}")
    
    # Print the actual values for verification
    print(f"   User Data:")
    for field in required_fields:
        print(f"     {field}: {user_data.get(field)}")
    
    return True

def test_admin_role(user_data):
    """Test 3: Verify the user has admin role"""
    print("\n=== TEST 3: VERIFY ADMIN ROLE ===")
    
    if not user_data:
        print_test_result("Admin role check", False, "No user data to check")
        return False
    
    user_role = user_data.get("rol")
    expected_role = "admin"
    
    if user_role == expected_role:
        print_test_result("Admin role check", True, f"User role is '{user_role}' as expected")
        return True
    else:
        print_test_result("Admin role check", False, f"Expected '{expected_role}', got '{user_role}'")
        return False

def test_wrong_password():
    """Test 4: Test wrong password scenario"""
    print("\n=== TEST 4: WRONG PASSWORD SCENARIO ===")
    
    wrong_login_data = {
        "email": ADMIN_CREDENTIALS["email"],
        "password": "wrong"  # Wrong password as requested
    }
    
    print(f"Attempting login with wrong password: {wrong_login_data['email']}")
    
    # Use direct requests call for debugging
    url = f"{BACKEND_URL}/auth/login"
    try:
        response = requests.post(url, headers=HEADERS, json=wrong_login_data, timeout=30)
        print(f"Debug: Response object received, status code: {response.status_code}")
        
        expected_status = 401
        actual_status = response.status_code
        
        if actual_status == expected_status:
            print_test_result("Wrong password test", True, f"Correctly returned {actual_status} Unauthorized")
            return True
        else:
            print_test_result("Wrong password test", False, f"Expected {expected_status}, got {actual_status}")
            return False
            
    except Exception as e:
        print(f"Debug: Exception occurred: {e}")
        print_test_result("Wrong password test", False, f"Exception: {e}")
        return False

def ensure_admin_user_exists():
    """Ensure the admin user exists in the database"""
    print("\n=== SETUP: ENSURE ADMIN USER EXISTS ===")
    
    # Try to register the admin user first (it will fail if already exists, which is fine)
    admin_registration = {
        "email": ADMIN_CREDENTIALS["email"],
        "password": ADMIN_CREDENTIALS["password"],
        "naam": "System Administrator",
        "rol": "admin"
    }
    
    response = make_request("POST", "/auth/register", admin_registration)
    
    if response:
        if response.status_code == 200:
            print_test_result("Admin user registration", True, "Admin user created successfully")
        elif response.status_code == 400 and "al geregistreerd" in response.text:
            print_test_result("Admin user exists", True, "Admin user already exists (expected)")
        else:
            print_test_result("Admin user setup", False, f"Unexpected response: {response.status_code} - {response.text}")
    else:
        print_test_result("Admin user setup", False, "No response from registration endpoint")

def run_admin_login_tests():
    """Run all admin login tests"""
    print("🚀 Starting Admin Login Tests")
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Testing admin email: {ADMIN_CREDENTIALS['email']}")
    print("=" * 60)
    
    test_results = {
        "total_tests": 4,
        "passed_tests": 0,
        "failed_tests": 0,
        "critical_failures": []
    }
    
    try:
        # Ensure admin user exists
        ensure_admin_user_exists()
        
        # Test 1: Admin login success
        user_data = test_admin_login_success()
        if user_data:
            test_results["passed_tests"] += 1
        else:
            test_results["failed_tests"] += 1
            test_results["critical_failures"].append("Admin login failed")
        
        # Test 2: Required fields
        if test_required_fields(user_data):
            test_results["passed_tests"] += 1
        else:
            test_results["failed_tests"] += 1
            test_results["critical_failures"].append("Required fields missing")
        
        # Test 3: Admin role verification
        if test_admin_role(user_data):
            test_results["passed_tests"] += 1
        else:
            test_results["failed_tests"] += 1
            test_results["critical_failures"].append("Admin role not assigned correctly")
        
        # Test 4: Wrong password
        if test_wrong_password():
            test_results["passed_tests"] += 1
        else:
            test_results["failed_tests"] += 1
            test_results["critical_failures"].append("Wrong password handling failed")
        
    except Exception as e:
        print(f"\n❌ CRITICAL ERROR during testing: {e}")
        test_results["critical_failures"].append(f"Test execution error: {e}")
    
    # Print summary
    print("\n" + "=" * 60)
    print("📊 ADMIN LOGIN TEST SUMMARY")
    print("=" * 60)
    print(f"Total Tests: {test_results['total_tests']}")
    print(f"Passed: {test_results['passed_tests']}")
    print(f"Failed: {test_results['failed_tests']}")
    
    if test_results['critical_failures']:
        print(f"\n❌ CRITICAL FAILURES:")
        for failure in test_results['critical_failures']:
            print(f"   - {failure}")
    
    success_rate = (test_results['passed_tests'] / test_results['total_tests']) * 100
    print(f"\nSuccess Rate: {success_rate:.1f}%")
    
    if test_results['passed_tests'] == test_results['total_tests']:
        print("🎉 ALL ADMIN LOGIN TESTS PASSED!")
    else:
        print("⚠️  Some tests failed - see details above")
    
    return test_results

if __name__ == "__main__":
    run_admin_login_tests()