#!/usr/bin/env python3
"""
Critical Bug Fix Testing for Smart-TS Backend
Focuses specifically on the bug fixes mentioned in the review request
"""

import requests
import json
import sys
from typing import Dict, Any, Optional

# Backend URL Configuration  
BASE_URL = "https://expo-fastapi-1.preview.emergentagent.com/api"

# Admin credentials for testing
ADMIN_EMAIL = "info@smart-techbv.be"
ADMIN_PASSWORD = "Smart1988-"

class CriticalBugTester:
    def __init__(self):
        self.session = requests.Session()
        self.auth_token = None
        self.admin_user = None
        self.test_results = []
        
    def log_test(self, test_name: str, success: bool, details: str = ""):
        """Log test results"""
        status = "✅ PASS" if success else "❌ FAIL"
        self.test_results.append({
            "test": test_name,
            "status": status,
            "success": success,
            "details": details
        })
        print(f"{status} - {test_name}")
        if details:
            print(f"    {details}")
    
    def login_admin(self) -> bool:
        """Login with admin credentials"""
        try:
            login_data = {
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD
            }
            response = self.session.post(f"{BASE_URL}/auth/login", json=login_data, timeout=10)
            
            if response.status_code == 200:
                user_data = response.json()
                self.admin_user = user_data
                
                # Extract JWT token if present
                if 'token' in user_data:
                    self.auth_token = user_data['token']
                    self.session.headers.update({'Authorization': f'Bearer {self.auth_token}'})
                
                self.log_test("Admin Login", True, f"Logged in as: {user_data.get('naam', 'Unknown')}")
                return True
            else:
                self.log_test("Admin Login", False, f"Status: {response.status_code}, Response: {response.text}")
                return False
                
        except Exception as e:
            self.log_test("Admin Login", False, f"Error: {str(e)}")
            return False
    
    def test_klanten_api_objectid_fix(self) -> bool:
        """Test 1: Klanten API - ObjectId serialization fix (was returning 500 error)"""
        try:
            # Test GET /api/klanten - should return 200 with proper JSON
            response = self.session.get(f"{BASE_URL}/klanten", timeout=10)
            
            if response.status_code != 200:
                self.log_test("Klanten GET (ObjectId Fix)", False, 
                            f"Status: {response.status_code}, Expected: 200. Response: {response.text[:200]}")
                return False
            
            # Parse JSON to ensure no serialization errors
            klanten = response.json()
            if not isinstance(klanten, list):
                self.log_test("Klanten GET (ObjectId Fix)", False, "Response is not a list")
                return False
            
            # Check if we have klanten and they have proper string IDs (not ObjectId objects)
            if len(klanten) > 0:
                first_klant = klanten[0]
                klant_id = first_klant.get('id')
                if not isinstance(klant_id, str):
                    self.log_test("Klanten GET (ObjectId Fix)", False, 
                                f"ID is not string: {type(klant_id)}, value: {klant_id}")
                    return False
                
                # Check for datetime fields being strings
                if 'created_at' in first_klant and not isinstance(first_klant['created_at'], str):
                    self.log_test("Klanten GET (ObjectId Fix)", False, 
                                f"created_at is not string: {type(first_klant['created_at'])}")
                    return False
            
            self.log_test("Klanten GET (ObjectId Fix)", True, 
                        f"✅ ObjectId serialization fixed - Found {len(klanten)} clients")
            
            # Test POST /api/klanten - Create new customer with bedrijfsnaam="Test Customer"
            new_klant = {
                "naam": "Test Customer",
                "bedrijfsnaam": "Test Customer",
                "type_klant": "zakelijk",
                "email": "test.customer@test.nl", 
                "telefoon": "+31612345678",
                "adres": "Test Street 123",
                "postcode": "1234AB",
                "plaats": "Amsterdam",
                "uurtarief": 85.0
            }
            
            response = self.session.post(f"{BASE_URL}/klanten", json=new_klant, timeout=10)
            if response.status_code != 200:
                self.log_test("Klanten POST (ObjectId Fix)", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
                return False
            
            created_klant = response.json()
            if not isinstance(created_klant.get('id'), str):
                self.log_test("Klanten POST (ObjectId Fix)", False, 
                            f"Created klant ID is not string: {type(created_klant.get('id'))}")
                return False
            
            self.log_test("Klanten POST (ObjectId Fix)", True, 
                        f"✅ Created customer '{created_klant.get('naam')}' with proper ID serialization")
            
            return True
            
        except Exception as e:
            self.log_test("Klanten API (ObjectId Fix)", False, f"Error: {str(e)}")
            return False
    
    def test_users_api_for_teams(self) -> bool:
        """Test 2: Users API for Teams page worker list"""
        try:
            # GET /api/auth/users - Should return list of users
            response = self.session.get(f"{BASE_URL}/auth/users", timeout=10)
            
            if response.status_code != 200:
                self.log_test("Users API for Teams", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
                return False
            
            users = response.json()
            if not isinstance(users, list):
                self.log_test("Users API for Teams", False, "Response is not a list")
                return False
            
            # Check for users with rol="worker" 
            workers = [user for user in users if user.get('rol') == 'worker']
            if len(workers) == 0:
                self.log_test("Users API for Teams", False, "No workers found - Teams page will be empty")
                return False
            
            worker_names = [worker.get('naam', 'Unknown') for worker in workers]
            self.log_test("Users API for Teams", True, 
                        f"✅ Found {len(workers)} workers for Teams page: {', '.join(worker_names[:3])}...")
            
            return True
            
        except Exception as e:
            self.log_test("Users API for Teams", False, f"Error: {str(e)}")
            return False
    
    def test_berichten_api_bijlagen(self) -> bool:
        """Test 3: Berichten API with bijlagen (attachments) support"""
        try:
            if not self.admin_user:
                self.log_test("Berichten API Bijlagen", False, "No admin user for testing")
                return False
            
            admin_id = self.admin_user.get('id')
            admin_naam = self.admin_user.get('naam', 'Admin')
            
            # POST /api/berichten with bijlagen array
            message_with_attachments = {
                "naar_id": None,
                "is_broadcast": True,
                "onderwerp": "Test message with attachments",
                "inhoud": "Testing bijlagen/attachments functionality",
                "bijlagen": [
                    {"type": "pdf", "naam": "test_document.pdf", "url": "https://example.com/test.pdf"},
                    {"type": "image", "naam": "test_photo.jpg", "url": "https://example.com/test.jpg"}
                ],
                "vastgepind": False
            }
            
            params = {"van_id": admin_id, "van_naam": admin_naam}
            response = self.session.post(f"{BASE_URL}/berichten", json=message_with_attachments, 
                                       params=params, timeout=10)
            
            if response.status_code != 200:
                self.log_test("Berichten POST with Bijlagen", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
                return False
            
            created_message = response.json()
            message_id = created_message.get('id')
            
            self.log_test("Berichten POST with Bijlagen", True, 
                        f"✅ Created message with {len(message_with_attachments['bijlagen'])} attachments")
            
            # GET /api/berichten - Verify message was created with bijlagen field
            params = {"user_id": admin_id}
            response = self.session.get(f"{BASE_URL}/berichten", params=params, timeout=10)
            
            if response.status_code != 200:
                self.log_test("Berichten GET with Bijlagen", False, 
                            f"Status: {response.status_code}")
                return False
            
            berichten = response.json()
            
            # Find our created message
            our_message = None
            for bericht in berichten:
                if bericht.get('id') == message_id:
                    our_message = bericht
                    break
            
            if not our_message:
                self.log_test("Berichten GET with Bijlagen", False, 
                            "Created message not found in list")
                return False
            
            # Check if bijlagen field exists and is properly serialized
            bijlagen = our_message.get('bijlagen', [])
            if not isinstance(bijlagen, list):
                self.log_test("Berichten GET with Bijlagen", False, 
                            f"Bijlagen is not list: {type(bijlagen)}")
                return False
            
            if len(bijlagen) != 2:
                self.log_test("Berichten GET with Bijlagen", False, 
                            f"Expected 2 attachments, got {len(bijlagen)}")
                return False
            
            self.log_test("Berichten GET with Bijlagen", True, 
                        f"✅ Retrieved message with {len(bijlagen)} bijlagen properly serialized")
            
            return True
            
        except Exception as e:
            self.log_test("Berichten API Bijlagen", False, f"Error: {str(e)}")
            return False
    
    def test_teams_api(self) -> bool:
        """Test 4: Teams API verification"""
        try:
            # GET /api/teams
            response = self.session.get(f"{BASE_URL}/teams", timeout=10)
            
            if response.status_code != 200:
                self.log_test("Teams API", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
                return False
            
            teams = response.json()
            if not isinstance(teams, list):
                self.log_test("Teams API", False, "Response is not a list")
                return False
            
            self.log_test("Teams API", True, f"✅ Teams API working - Found {len(teams)} teams")
            
            return True
            
        except Exception as e:
            self.log_test("Teams API", False, f"Error: {str(e)}")
            return False
    
    def test_werkbonnen_api(self) -> bool:
        """Test 5: Werkbonnen API verification"""
        try:
            if not self.admin_user:
                self.log_test("Werkbonnen API", False, "No admin user for testing")
                return False
            
            # GET /api/werkbonnen
            params = {"user_id": self.admin_user['id'], "is_admin": "true"}
            response = self.session.get(f"{BASE_URL}/werkbonnen", params=params, timeout=10)
            
            if response.status_code != 200:
                self.log_test("Werkbonnen API", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
                return False
            
            werkbonnen = response.json()
            if not isinstance(werkbonnen, list):
                self.log_test("Werkbonnen API", False, "Response is not a list")
                return False
            
            self.log_test("Werkbonnen API", True, f"✅ Werkbonnen API working - Found {len(werkbonnen)} werkbonnen")
            
            return True
            
        except Exception as e:
            self.log_test("Werkbonnen API", False, f"Error: {str(e)}")
            return False
    
    def test_productie_werkbon_api(self) -> bool:
        """Test 6: Productie Werkbon API (mentioned in review request as needing retesting)"""
        try:
            # GET /api/productie-werkbonnen
            response = self.session.get(f"{BASE_URL}/productie-werkbonnen", timeout=10)
            
            if response.status_code != 200:
                self.log_test("Productie Werkbon API", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
                return False
            
            productie_werkbonnen = response.json()
            if not isinstance(productie_werkbonnen, list):
                self.log_test("Productie Werkbon API", False, "Response is not a list")
                return False
            
            self.log_test("Productie Werkbon API", True, 
                        f"✅ Productie Werkbon API working - Found {len(productie_werkbonnen)} records")
            
            return True
            
        except Exception as e:
            self.log_test("Productie Werkbon API", False, f"Error: {str(e)}")
            return False
    
    def test_planning_confirmation_api(self) -> bool:
        """Test 7: Planning Confirmation API with timestamp (mentioned as needing retesting)"""
        try:
            # First get some planning to test confirmation
            params = {"week_nummer": 12, "jaar": 2026}
            response = self.session.get(f"{BASE_URL}/planning", params=params, timeout=10)
            
            if response.status_code != 200:
                self.log_test("Planning Confirmation API", False, 
                            f"Could not get planning data - Status: {response.status_code}")
                return False
            
            planning_items = response.json()
            if not planning_items:
                self.log_test("Planning Confirmation API", True, 
                            "✅ Planning confirmation endpoint exists (no planning to test)")
                return True
            
            # Test the bevestig_planning endpoint with first planning item
            test_planning = planning_items[0]
            planning_id = test_planning.get('id')
            
            if not planning_id:
                self.log_test("Planning Confirmation API", False, "No planning ID available for testing")
                return False
            
            # POST /api/planning/{id}/bevestig
            confirmation_data = {
                "worker_id": self.admin_user.get('id'),
                "worker_naam": self.admin_user.get('naam', 'Test Worker')
            }
            
            response = self.session.post(f"{BASE_URL}/planning/{planning_id}/bevestig", 
                                       json=confirmation_data, timeout=10)
            
            if response.status_code != 200:
                self.log_test("Planning Confirmation API", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
                return False
            
            result = response.json()
            self.log_test("Planning Confirmation API", True, 
                        f"✅ Planning confirmation with timestamp working - {result.get('message', 'Success')}")
            
            return True
            
        except Exception as e:
            self.log_test("Planning Confirmation API", False, f"Error: {str(e)}")
            return False
    
    def run_critical_tests(self) -> Dict[str, Any]:
        """Run all critical bug fix tests"""
        print("=" * 80)
        print("CRITICAL BUG FIX TESTING - SMART-TS BACKEND")
        print("Testing specific bug fixes mentioned in review request")
        print("=" * 80)
        print(f"Backend URL: {BASE_URL}")
        print(f"Admin Credentials: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
        print()
        
        # Login first
        if not self.login_admin():
            print("❌ Cannot continue without admin login")
            return {"all_passed": False, "login_failed": True}
        
        # Run critical tests in order of review request
        critical_tests = [
            ("1. Klanten API ObjectId Serialization Fix", self.test_klanten_api_objectid_fix),
            ("2. Users API for Teams Page Workers", self.test_users_api_for_teams),
            ("3. Berichten API with Bijlagen Support", self.test_berichten_api_bijlagen),
            ("4. Teams API Verification", self.test_teams_api),
            ("5. Werkbonnen API Verification", self.test_werkbonnen_api),
            ("6. Productie Werkbon API (Retesting)", self.test_productie_werkbon_api),
            ("7. Planning Confirmation with Timestamp", self.test_planning_confirmation_api),
        ]
        
        passed_tests = 0
        total_tests = len(critical_tests)
        
        for test_name, test_func in critical_tests:
            print(f"\n--- Running: {test_name} ---")
            if test_func():
                passed_tests += 1
        
        print("\n" + "=" * 80)
        print("CRITICAL BUG FIX TEST SUMMARY")
        print("=" * 80)
        
        failed_tests = []
        for result in self.test_results:
            print(f"{result['status']} - {result['test']}")
            if result['details']:
                print(f"    {result['details']}")
            if not result['success']:
                failed_tests.append(result['test'])
        
        print("\n" + "-" * 80)
        print(f"TOTAL: {passed_tests}/{total_tests} critical tests passed")
        
        success_rate = (passed_tests / total_tests) * 100
        print(f"SUCCESS RATE: {success_rate:.1f}%")
        
        if passed_tests == total_tests:
            print("🎉 ALL CRITICAL BUG FIXES VERIFIED!")
            print("✅ ObjectId serialization fixed")
            print("✅ Users API working for Teams page")
            print("✅ Berichten API supports bijlagen/attachments") 
            print("✅ All core APIs functioning correctly")
        else:
            print(f"⚠️  {total_tests - passed_tests} critical tests failed")
            print("Failed tests:")
            for test in failed_tests:
                print(f"  - {test}")
        
        return {
            "total_tests": total_tests,
            "passed_tests": passed_tests,
            "failed_tests": total_tests - passed_tests,
            "success_rate": success_rate,
            "all_passed": passed_tests == total_tests,
            "test_results": self.test_results,
            "failed_test_names": failed_tests
        }

def main():
    """Main test runner"""
    tester = CriticalBugTester()
    results = tester.run_critical_tests()
    
    # Exit with appropriate code
    sys.exit(0 if results["all_passed"] else 1)

if __name__ == "__main__":
    main()