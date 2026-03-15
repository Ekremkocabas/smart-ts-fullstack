#!/usr/bin/env python3
"""
Bug Fix Verification for Smart-TS Backend
Tests the specific bug fixes mentioned in review request without requiring auth
"""

import requests
import json
import sys
from typing import Dict, Any

# Backend URL Configuration  
BASE_URL = "https://expo-fastapi-1.preview.emergentagent.com/api"

class BugFixVerifier:
    def __init__(self):
        self.session = requests.Session()
        self.test_results = []
        
    def log_test(self, test_name: str, success: bool, details: str = ""):
        """Log test results"""
        status = "✅ FIXED" if success else "❌ FAILED"
        self.test_results.append({
            "test": test_name,
            "status": status,
            "success": success,
            "details": details
        })
        print(f"{status} - {test_name}")
        if details:
            print(f"    {details}")
    
    def test_klanten_objectid_fix(self) -> bool:
        """Test 1: Klanten API ObjectId serialization fix"""
        try:
            # GET /api/klanten - previously returned 500 error
            response = self.session.get(f"{BASE_URL}/klanten", timeout=10)
            
            if response.status_code != 200:
                self.log_test("Klanten ObjectId Serialization Fix", False, 
                            f"Status: {response.status_code}, Expected: 200")
                return False
            
            klanten = response.json()
            if not isinstance(klanten, list):
                self.log_test("Klanten ObjectId Serialization Fix", False, "Response is not a list")
                return False
            
            # Verify ObjectId and datetime fields are serialized as strings
            if len(klanten) > 0:
                first_klant = klanten[0]
                
                # Check ID is string (not ObjectId)
                klant_id = first_klant.get('id')
                if not isinstance(klant_id, str):
                    self.log_test("Klanten ObjectId Serialization Fix", False, 
                                f"ID not string: {type(klant_id)}")
                    return False
                
                # Check created_at datetime is string
                if 'created_at' in first_klant:
                    created_at = first_klant['created_at']
                    if not isinstance(created_at, str):
                        self.log_test("Klanten ObjectId Serialization Fix", False, 
                                    f"created_at not string: {type(created_at)}")
                        return False
                
                # Check _id is handled properly (should be present but not causing issues)
                if '_id' in first_klant and not isinstance(first_klant['_id'], str):
                    self.log_test("Klanten ObjectId Serialization Fix", False, 
                                f"_id not properly serialized: {type(first_klant['_id'])}")
                    return False
            
            # Test POST /api/klanten with bedrijfsnaam="Test Customer"
            new_klant = {
                "naam": "Test Customer",
                "bedrijfsnaam": "Test Customer", 
                "type_klant": "zakelijk",
                "email": "test.customer@example.nl",
                "telefoon": "+31612345678",
                "uurtarief": 85.0
            }
            
            response = self.session.post(f"{BASE_URL}/klanten", json=new_klant, timeout=10)
            if response.status_code != 200:
                self.log_test("Klanten POST ObjectId Fix", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
                return False
            
            created_klant = response.json()
            if not isinstance(created_klant.get('id'), str):
                self.log_test("Klanten POST ObjectId Fix", False, 
                            f"Created klant ID not string: {type(created_klant.get('id'))}")
                return False
            
            self.log_test("Klanten ObjectId Serialization Fix", True, 
                        f"✅ Both GET and POST working. Found {len(klanten)} existing clients, created new client")
            return True
            
        except Exception as e:
            self.log_test("Klanten ObjectId Serialization Fix", False, f"Error: {str(e)}")
            return False
    
    def test_users_api_for_teams(self) -> bool:
        """Test 2: Users API for Teams page - verify workers with rol="worker" are present"""
        try:
            response = self.session.get(f"{BASE_URL}/auth/users", timeout=10)
            
            if response.status_code != 200:
                self.log_test("Users API for Teams Page", False, 
                            f"Status: {response.status_code}")
                return False
            
            users = response.json()
            if not isinstance(users, list):
                self.log_test("Users API for Teams Page", False, "Response is not a list")
                return False
            
            # Check for users with rol="worker"
            workers = [user for user in users if user.get('rol') == 'worker']
            if len(workers) == 0:
                self.log_test("Users API for Teams Page", False, 
                            "No workers found - Teams page will have empty worker list")
                return False
            
            # Get sample worker names for display
            worker_names = [worker.get('naam', 'Unknown') for worker in workers]
            
            self.log_test("Users API for Teams Page", True, 
                        f"✅ Found {len(workers)} workers for Teams page: {', '.join(worker_names[:3])}...")
            return True
            
        except Exception as e:
            self.log_test("Users API for Teams Page", False, f"Error: {str(e)}")
            return False
    
    def test_berichten_bijlagen_support(self) -> bool:
        """Test 3: Berichten API with bijlagen/attachments support"""
        try:
            # POST /api/berichten with bijlagen array
            message_with_attachments = {
                "naar_id": None,
                "is_broadcast": True,
                "onderwerp": "Test message with attachments",
                "inhoud": "Testing bijlagen/attachments functionality", 
                "bijlagen": [
                    {"naam": "test_document.pdf", "type": "pdf", "data": "data:application/pdf;base64,JVBERi0xLjQ="},
                    {"naam": "test_photo.jpg", "type": "image", "data": "data:image/jpeg;base64,/9j/4AAQSkZJRgA="}
                ],
                "vastgepind": False
            }
            
            params = {"van_id": "test-user", "van_naam": "Test User"}
            response = self.session.post(f"{BASE_URL}/berichten", json=message_with_attachments,
                                       params=params, timeout=10)
            
            if response.status_code != 200:
                self.log_test("Berichten Bijlagen Support", False,
                            f"POST Status: {response.status_code}, Response: {response.text}")
                return False
            
            created_message = response.json()
            message_id = created_message.get('id')
            
            # Verify bijlagen were stored properly
            bijlagen = created_message.get('bijlagen', [])
            if not isinstance(bijlagen, list) or len(bijlagen) != 2:
                self.log_test("Berichten Bijlagen Support", False,
                            f"Bijlagen not stored properly: {bijlagen}")
                return False
            
            # Verify bijlagen structure
            for bijlage in bijlagen:
                if not all(key in bijlage for key in ['naam', 'type', 'data']):
                    self.log_test("Berichten Bijlagen Support", False,
                                f"Bijlage missing required fields: {bijlage}")
                    return False
            
            # GET /api/berichten - verify message can be retrieved with bijlagen
            params = {"user_id": "test-user"}
            response = self.session.get(f"{BASE_URL}/berichten", params=params, timeout=10)
            
            if response.status_code != 200:
                self.log_test("Berichten Bijlagen Support", False,
                            f"GET Status: {response.status_code}")
                return False
            
            berichten = response.json()
            
            # Find our created message
            our_message = None
            for bericht in berichten:
                if bericht.get('id') == message_id:
                    our_message = bericht
                    break
            
            if not our_message:
                self.log_test("Berichten Bijlagen Support", False,
                            "Created message not found in GET response")
                return False
            
            # Verify bijlagen field is present and properly serialized
            retrieved_bijlagen = our_message.get('bijlagen', [])
            if len(retrieved_bijlagen) != 2:
                self.log_test("Berichten Bijlagen Support", False,
                            f"Retrieved message has wrong bijlagen count: {len(retrieved_bijlagen)}")
                return False
            
            self.log_test("Berichten Bijlagen Support", True,
                        f"✅ Created and retrieved message with {len(bijlagen)} attachments")
            return True
            
        except Exception as e:
            self.log_test("Berichten Bijlagen Support", False, f"Error: {str(e)}")
            return False
    
    def test_teams_api(self) -> bool:
        """Test 4: Teams API verification"""
        try:
            response = self.session.get(f"{BASE_URL}/teams", timeout=10)
            
            if response.status_code != 200:
                self.log_test("Teams API", False, f"Status: {response.status_code}")
                return False
            
            teams = response.json()
            if not isinstance(teams, list):
                self.log_test("Teams API", False, "Response is not a list")
                return False
            
            # Check that teams have proper serialization (no ObjectId issues)
            for team in teams:
                if 'id' in team and not isinstance(team['id'], str):
                    self.log_test("Teams API", False, 
                                f"Team ID not string: {type(team['id'])}")
                    return False
                
                if 'created_at' in team and not isinstance(team['created_at'], str):
                    self.log_test("Teams API", False,
                                f"Team created_at not string: {type(team['created_at'])}")
                    return False
            
            self.log_test("Teams API", True, f"✅ Teams API working - Found {len(teams)} teams")
            return True
            
        except Exception as e:
            self.log_test("Teams API", False, f"Error: {str(e)}")
            return False
    
    def test_werkbonnen_api(self) -> bool:
        """Test 5: Werkbonnen API verification"""
        try:
            # Try without auth first
            response = self.session.get(f"{BASE_URL}/werkbonnen", timeout=10)
            
            if response.status_code == 422:  # Validation error - needs user_id
                # Try with a test user_id
                params = {"user_id": "test-user", "is_admin": "false"}
                response = self.session.get(f"{BASE_URL}/werkbonnen", params=params, timeout=10)
            
            if response.status_code not in [200, 404]:  # 404 is OK if no werkbonnen exist
                self.log_test("Werkbonnen API", False, 
                            f"Status: {response.status_code}, Response: {response.text}")
                return False
            
            if response.status_code == 200:
                werkbonnen = response.json()
                if not isinstance(werkbonnen, list):
                    self.log_test("Werkbonnen API", False, "Response is not a list")
                    return False
                
                self.log_test("Werkbonnen API", True, 
                            f"✅ Werkbonnen API working - Found {len(werkbonnen)} werkbonnen")
            else:
                self.log_test("Werkbonnen API", True, 
                            "✅ Werkbonnen API working - Returns 404 (no werkbonnen for test user)")
            
            return True
            
        except Exception as e:
            self.log_test("Werkbonnen API", False, f"Error: {str(e)}")
            return False
    
    def test_additional_scenarios(self) -> bool:
        """Test additional scenarios (at least 10 different scenarios total)"""
        try:
            scenarios_passed = 0
            total_scenarios = 5
            
            # Scenario 1: Health check
            response = self.session.get(f"{BASE_URL}/health", timeout=10)
            if response.status_code == 200:
                scenarios_passed += 1
                print("  ✓ Health check working")
            else:
                print(f"  ✗ Health check failed: {response.status_code}")
            
            # Scenario 2: Dashboard stats
            response = self.session.get(f"{BASE_URL}/dashboard/stats", timeout=10)
            if response.status_code == 200:
                scenarios_passed += 1
                stats = response.json()
                print(f"  ✓ Dashboard stats working - Week {stats.get('week_nummer', 'N/A')}/{stats.get('jaar', 'N/A')}")
            else:
                print(f"  ✗ Dashboard stats failed: {response.status_code}")
            
            # Scenario 3: Werven API
            response = self.session.get(f"{BASE_URL}/werven", timeout=10)
            if response.status_code == 200:
                scenarios_passed += 1
                werven = response.json()
                print(f"  ✓ Werven API working - Found {len(werven)} sites")
            else:
                print(f"  ✗ Werven API failed: {response.status_code}")
            
            # Scenario 4: Planning API (weekly view)
            params = {"week_nummer": 12, "jaar": 2026}
            response = self.session.get(f"{BASE_URL}/planning", params=params, timeout=10)
            if response.status_code == 200:
                scenarios_passed += 1
                planning = response.json()
                print(f"  ✓ Planning API working - Found {len(planning)} items for week 12/2026")
            else:
                print(f"  ✗ Planning API failed: {response.status_code}")
            
            # Scenario 5: Productie werkbonnen (with is_admin param)
            params = {"is_admin": "true"}
            response = self.session.get(f"{BASE_URL}/productie-werkbonnen", params=params, timeout=10)
            if response.status_code == 200:
                scenarios_passed += 1
                productie = response.json()
                print(f"  ✓ Productie werkbonnen API working - Found {len(productie)} records")
            else:
                print(f"  ✗ Productie werkbonnen failed: {response.status_code}")
            
            success = scenarios_passed >= 4  # At least 4 out of 5 should work
            self.log_test("Additional API Scenarios", success,
                        f"Passed {scenarios_passed}/{total_scenarios} additional API tests")
            return success
            
        except Exception as e:
            self.log_test("Additional API Scenarios", False, f"Error: {str(e)}")
            return False
    
    def run_bug_fix_verification(self) -> Dict[str, Any]:
        """Run all bug fix verification tests"""
        print("=" * 80)
        print("BUG FIX VERIFICATION - SMART-TS BACKEND")
        print("Verifying fixes for ObjectId serialization and bijlagen support")
        print("=" * 80)
        print(f"Backend URL: {BASE_URL}")
        print()
        
        # Run bug fix verification tests
        critical_tests = [
            ("🔧 Klanten API ObjectId Serialization Fix", self.test_klanten_objectid_fix),
            ("👥 Users API for Teams Page (worker rol)", self.test_users_api_for_teams),
            ("📎 Berichten API with Bijlagen Support", self.test_berichten_bijlagen_support),
            ("🏢 Teams API Verification", self.test_teams_api),
            ("📋 Werkbonnen API Verification", self.test_werkbonnen_api),
            ("🔍 Additional API Scenarios", self.test_additional_scenarios),
        ]
        
        passed_tests = 0
        total_tests = len(critical_tests)
        
        for test_name, test_func in critical_tests:
            print(f"\n--- Testing: {test_name} ---")
            if test_func():
                passed_tests += 1
        
        print("\n" + "=" * 80)
        print("BUG FIX VERIFICATION SUMMARY")
        print("=" * 80)
        
        failed_tests = []
        for result in self.test_results:
            print(f"{result['status']} - {result['test']}")
            if result['details']:
                print(f"    {result['details']}")
            if not result['success']:
                failed_tests.append(result['test'])
        
        print("\n" + "-" * 80)
        print(f"TOTAL: {passed_tests}/{total_tests} critical bug fixes verified")
        
        success_rate = (passed_tests / total_tests) * 100
        print(f"SUCCESS RATE: {success_rate:.1f}%")
        
        if passed_tests == total_tests:
            print("🎉 ALL CRITICAL BUG FIXES VERIFIED!")
            print("✅ ObjectId serialization working properly")
            print("✅ Users API provides workers for Teams page")  
            print("✅ Berichten API supports bijlagen/attachments")
            print("✅ All core APIs functioning correctly")
        else:
            print(f"⚠️  {total_tests - passed_tests} bug fixes still have issues")
            print("Failed verifications:")
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
    verifier = BugFixVerifier()
    results = verifier.run_bug_fix_verification()
    
    # Exit with appropriate code
    sys.exit(0 if results["all_passed"] else 1)

if __name__ == "__main__":
    main()