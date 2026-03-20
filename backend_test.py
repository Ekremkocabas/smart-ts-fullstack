#!/usr/bin/env python3
"""
Backend API Testing for Werkbon Management System
Tests the specific endpoints mentioned in the review request
"""

import requests
import json
import sys
from datetime import datetime

# Configuration
BASE_URL = "https://expo-fastapi-1.preview.emergentagent.com/api"
LOGIN_EMAIL = "info@smart-techbv.be"
LOGIN_PASSWORD = "Smart1988-"

class WerkbonAPITester:
    def __init__(self):
        self.base_url = BASE_URL
        self.session = requests.Session()
        self.auth_token = None
        self.test_results = []
        
    def log_result(self, test_name: str, success: bool, status_code: int, response_data: str, error: str = ""):
        """Log test results"""
        result = {
            "test": test_name,
            "success": success,
            "status_code": status_code,
            "response": response_data,
            "error": error,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        
        status_symbol = "✅" if success else "❌"
        print(f"{status_symbol} {test_name}: {status_code} - {error if error else 'SUCCESS'}")
    
    def test_authentication(self):
        """Test POST /api/auth/login"""
        print("\n=== Testing Authentication ===")
        
        try:
            login_data = {
                "email": LOGIN_EMAIL,
                "password": LOGIN_PASSWORD
            }
            
            response = self.session.post(f"{self.base_url}/auth/login", json=login_data)
            
            if response.status_code == 200:
                data = response.json()
                if "token" in data:
                    self.auth_token = data["token"]
                    self.session.headers.update({"Authorization": f"Bearer {self.auth_token}"})
                    self.log_result("Authentication", True, 200, f"Token received: {self.auth_token[:50]}...")
                    return True
                else:
                    self.log_result("Authentication", False, 200, str(data), "No token in response")
                    return False
            else:
                self.log_result("Authentication", False, response.status_code, response.text, "Login failed")
                return False
                
        except Exception as e:
            self.log_result("Authentication", False, 0, "", str(e))
            return False
    
    def test_users_endpoints(self):
        """Test GET /api/auth/users and POST /api/auth/register-worker endpoints"""
        print("\n=== Testing Users (Werknemers) Endpoints ===")
        
        # Test GET users
        try:
            response = self.session.get(f"{self.base_url}/auth/users")
            if response.status_code == 200:
                users = response.json()
                self.log_result("GET Users", True, 200, f"Found {len(users)} users")
            else:
                self.log_result("GET Users", False, response.status_code, response.text, "Failed to get users")
        except Exception as e:
            self.log_result("GET Users", False, 0, "", str(e))
        
        # Test POST register-worker (create new user)
        try:
            # Use timestamp to ensure unique email
            timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
            new_user_params = {
                "email": f"test.werknemer.{timestamp}@smart-techbv.be",
                "naam": "Test Werknemer",
                "password": "Test1234!",
                "rol": "werknemer",
                "werkbon_types": "uren,project"
            }
            
            response = self.session.post(f"{self.base_url}/auth/register-worker", params=new_user_params)
            if response.status_code in [200, 201]:
                data = response.json()
                self.log_result("POST Register Worker", True, response.status_code, f"User created: {data.get('user', {}).get('email', 'N/A')}")
            else:
                self.log_result("POST Register Worker", False, response.status_code, response.text, "Failed to create user")
        except Exception as e:
            self.log_result("POST Register Worker", False, 0, "", str(e))
    
    def test_teams_endpoints(self):
        """Test GET/POST /api/teams endpoints"""
        print("\n=== Testing Teams Endpoints ===")
        
        # Test GET teams
        try:
            response = self.session.get(f"{self.base_url}/teams")
            if response.status_code == 200:
                teams = response.json()
                self.log_result("GET Teams", True, 200, f"Found {len(teams)} teams")
            else:
                self.log_result("GET Teams", False, response.status_code, response.text, "Failed to get teams")
        except Exception as e:
            self.log_result("GET Teams", False, 0, "", str(e))
        
        # Test POST teams (create new team)
        try:
            new_team = {
                "naam": "Test Team Alpha",
                "omschrijving": "Test team for werkbon testing"
            }
            
            response = self.session.post(f"{self.base_url}/teams", json=new_team)
            if response.status_code in [200, 201]:
                data = response.json()
                self.log_result("POST Teams", True, response.status_code, f"Team created: {data.get('naam', 'N/A')}")
            else:
                self.log_result("POST Teams", False, response.status_code, response.text, "Failed to create team")
        except Exception as e:
            self.log_result("POST Teams", False, 0, "", str(e))
    
    def test_klanten_endpoints(self):
        """Test GET/POST /api/klanten endpoints"""
        print("\n=== Testing Klanten (Customers) Endpoints ===")
        
        # Test GET klanten
        try:
            response = self.session.get(f"{self.base_url}/klanten")
            if response.status_code == 200:
                klanten = response.json()
                self.log_result("GET Klanten", True, 200, f"Found {len(klanten)} customers")
            else:
                self.log_result("GET Klanten", False, response.status_code, response.text, "Failed to get customers")
        except Exception as e:
            self.log_result("GET Klanten", False, 0, "", str(e))
        
        # Test POST klanten (create new customer)
        try:
            new_klant = {
                "bedrijfsnaam": "Test Klant BV",
                "naam": "Test Klant BV",
                "contactpersoon": "Jan Test",
                "email": "test@testklant.be",
                "telefoon": "+32471234567",
                "adres": "Teststraat 123",
                "postcode": "1000",
                "stad": "Brussel",
                "land": "België",
                "actief": True
            }
            
            response = self.session.post(f"{self.base_url}/klanten", json=new_klant)
            if response.status_code in [200, 201]:
                data = response.json()
                self.log_result("POST Klanten", True, response.status_code, f"Customer created: {data.get('naam', 'N/A')}")
            else:
                self.log_result("POST Klanten", False, response.status_code, response.text, "Failed to create customer")
        except Exception as e:
            self.log_result("POST Klanten", False, 0, "", str(e))
    
    def test_werven_endpoints(self):
        """Test GET/POST /api/werven endpoints"""
        print("\n=== Testing Werven (Worksites) Endpoints ===")
        
        # Test GET werven
        try:
            response = self.session.get(f"{self.base_url}/werven")
            if response.status_code == 200:
                werven = response.json()
                self.log_result("GET Werven", True, 200, f"Found {len(werven)} worksites")
            else:
                self.log_result("GET Werven", False, response.status_code, response.text, "Failed to get worksites")
        except Exception as e:
            self.log_result("GET Werven", False, 0, "", str(e))
        
        # Test POST werven (create new worksite) - need to get a klant_id first
        try:
            # First get klanten to get a klant_id
            klanten_response = self.session.get(f"{self.base_url}/klanten")
            if klanten_response.status_code != 200:
                self.log_result("POST Werven", False, 0, "", "Could not get klanten for klant_id")
                return
                
            klanten = klanten_response.json()
            if not klanten:
                self.log_result("POST Werven", False, 0, "", "No klanten available for klant_id")
                return
                
            # Use first klant_id
            klant_id = klanten[0].get("id")
            
            new_werf = {
                "naam": "Test Werf Centrum",
                "adres": "Centrumstraat 50",
                "postcode": "2000",
                "stad": "Antwerpen",
                "omschrijving": "Test werklocatie",
                "actief": True,
                "klant_id": klant_id
            }
            
            response = self.session.post(f"{self.base_url}/werven", json=new_werf)
            if response.status_code in [200, 201]:
                data = response.json()
                self.log_result("POST Werven", True, response.status_code, f"Worksite created: {data.get('naam', 'N/A')}")
            else:
                self.log_result("POST Werven", False, response.status_code, response.text, "Failed to create worksite")
        except Exception as e:
            self.log_result("POST Werven", False, 0, "", str(e))
    
    def test_werkbonnen_endpoints(self):
        """Test GET /api/werkbonnen and POST /api/werkbonnen endpoints"""
        print("\n=== Testing Werkbonnen (Work Orders) Endpoints ===")
        
        # Test GET werkbonnen - requires user_id parameter
        try:
            # Use authenticated admin user ID
            response = self.session.get(f"{self.base_url}/werkbonnen?user_id=64fa6af4-630e-4f90-9452-fb3b74b4b432")
            if response.status_code == 200:
                werkbonnen = response.json()
                self.log_result("GET Werkbonnen", True, 200, f"Found {len(werkbonnen)} work orders")
            else:
                self.log_result("GET Werkbonnen", False, response.status_code, response.text, "Failed to get work orders")
        except Exception as e:
            self.log_result("GET Werkbonnen", False, 0, "", str(e))
        
        # Test POST werkbonnen (create new werkbon using JWT authentication)
        try:
            # First get klanten and werven to get IDs
            klanten_response = self.session.get(f"{self.base_url}/klanten")
            werven_response = self.session.get(f"{self.base_url}/werven")
            
            if klanten_response.status_code != 200 or werven_response.status_code != 200:
                self.log_result("POST Werkbonnen", False, 0, "", "Could not get klanten/werven for werkbon creation")
                return
                
            klanten = klanten_response.json()
            werven = werven_response.json()
            
            if not klanten or not werven:
                self.log_result("POST Werkbonnen", False, 0, "", "No klanten/werven available for werkbon creation")
                return
            
            new_werkbon = {
                "week_nummer": 12,  # Required field
                "jaar": 2026,       # Required field
                "klant_id": klanten[0].get("id"),
                "werf_id": werven[0].get("id"),
                "uren": [{
                    "teamlid_naam": "Test Werknemer",
                    "maandag": 8,
                    "dinsdag": 0,
                    "woensdag": 0,
                    "donderdag": 0,
                    "vrijdag": 0,
                    "zaterdag": 0,
                    "zondag": 0
                }],
                "uitgevoerde_werken": "Test werkbon voor API verificatie",
                "extra_materialen": "Test materiaal"
            }
            
            response = self.session.post(f"{self.base_url}/werkbonnen", json=new_werkbon)
            if response.status_code in [200, 201]:
                data = response.json()
                self.log_result("POST Werkbonnen", True, response.status_code, f"Work order created: {data.get('id', 'N/A')}")
            else:
                self.log_result("POST Werkbonnen", False, response.status_code, response.text, "Failed to create work order")
        except Exception as e:
            self.log_result("POST Werkbonnen", False, 0, "", str(e))
    
    def test_health_check(self):
        """Test GET /api/health endpoint"""
        print("\n=== Testing Health Check ===")
        
        try:
            response = self.session.get(f"{self.base_url}/health")
            if response.status_code == 200:
                data = response.json()
                self.log_result("Health Check", True, 200, str(data))
            else:
                self.log_result("Health Check", False, response.status_code, response.text, "Health check failed")
        except Exception as e:
            self.log_result("Health Check", False, 0, "", str(e))
    
    def run_all_tests(self):
        """Run all API tests"""
        print("🚀 Starting Werkbon Management System API Testing")
        print(f"Base URL: {self.base_url}")
        
        # Test authentication first
        if not self.test_authentication():
            print("\n❌ CRITICAL: Authentication failed - cannot continue with secured endpoints")
            self.print_summary()
            return False
        
        # Run all other tests
        self.test_health_check()
        self.test_users_endpoints()
        self.test_teams_endpoints()
        self.test_klanten_endpoints()
        self.test_werven_endpoints()
        self.test_werkbonnen_endpoints()
        
        self.print_summary()
        return True
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*80)
        print("📊 TEST SUMMARY")
        print("="*80)
        
        total_tests = len(self.test_results)
        passed_tests = sum(1 for result in self.test_results if result["success"])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests} ✅")
        print(f"Failed: {failed_tests} ❌")
        print(f"Success Rate: {(passed_tests/total_tests*100):.1f}%")
        
        if failed_tests > 0:
            print("\n🚨 FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"  ❌ {result['test']}: {result['status_code']} - {result['error']}")
        
        print("\n✅ PASSED TESTS:")
        for result in self.test_results:
            if result["success"]:
                print(f"  ✅ {result['test']}: {result['status_code']}")


def main():
    """Main test execution function"""
    tester = WerkbonAPITester()
    success = tester.run_all_tests()
    
    # Exit with proper code
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()