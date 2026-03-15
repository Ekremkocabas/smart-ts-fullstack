#!/usr/bin/env python3
"""
Backend API Test Suite for Smart-TS - 10 Specific Scenarios
Tests the exact 10 scenarios mentioned in the review request
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

class SmartTSBackendTester:
    def __init__(self):
        self.session = requests.Session()
        self.admin_token = None
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
            print(f"    Details: {details}")
    
    def authenticate_admin(self) -> bool:
        """Authenticate admin user and get JWT token"""
        try:
            login_data = {
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD
            }
            response = self.session.post(f"{BASE_URL}/auth/login", json=login_data, timeout=10)
            
            if response.status_code == 200:
                auth_data = response.json()
                if "user" in auth_data and "token" in auth_data:
                    self.admin_user = auth_data["user"]
                    self.admin_token = auth_data["token"]
                    # Set Authorization header for subsequent requests
                    self.session.headers.update({"Authorization": f"Bearer {self.admin_token}"})
                    self.log_test("Admin Authentication", True, f"Authenticated as {self.admin_user['naam']}")
                    return True
                else:
                    self.log_test("Admin Authentication", False, "Invalid response format")
                    return False
            else:
                self.log_test("Admin Authentication", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Admin Authentication", False, f"Error: {str(e)}")
            return False
    
    def test_scenario_1_auth_login(self) -> bool:
        """Scenario 1: POST /api/auth/login - Login with info@smart-techbv.be / Smart1988-"""
        try:
            login_data = {
                "email": ADMIN_EMAIL,
                "password": ADMIN_PASSWORD
            }
            
            response = requests.post(f"{BASE_URL}/auth/login", json=login_data, timeout=10)
            
            if response.status_code == 200:
                auth_data = response.json()
                
                # Verify JWT token is returned
                if "token" in auth_data and auth_data["token"]:
                    token = auth_data["token"]
                    # Basic JWT format check (header.payload.signature)
                    if token.count('.') == 2:
                        self.log_test("1. Auth Login & JWT Token", True, 
                                    f"Login successful, JWT token received (length: {len(token)})")
                        return True
                    else:
                        self.log_test("1. Auth Login & JWT Token", False, "Invalid JWT token format")
                        return False
                else:
                    self.log_test("1. Auth Login & JWT Token", False, "JWT token not found in response")
                    return False
            else:
                self.log_test("1. Auth Login & JWT Token", False, f"Login failed: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("1. Auth Login & JWT Token", False, f"Error: {str(e)}")
            return False
    
    def test_scenario_2_klanten_apis(self) -> bool:
        """Scenario 2: GET /api/klanten - Should return list of customers with proper JSON"""
        try:
            # GET /api/klanten - Should return list without 500 error
            response = self.session.get(f"{BASE_URL}/klanten", timeout=10)
            
            if response.status_code == 200:
                klanten = response.json()
                if isinstance(klanten, list):
                    # Verify ObjectId serialization is working correctly 
                    if klanten:
                        first_klant = klanten[0]
                        if "id" in first_klant and isinstance(first_klant["id"], str):
                            self.log_test("2a. Klanten GET - JSON Serialization", True, 
                                        f"Found {len(klanten)} customers, ObjectId properly serialized")
                        else:
                            self.log_test("2a. Klanten GET - JSON Serialization", False, 
                                        "ObjectId not properly serialized")
                            return False
                    else:
                        self.log_test("2a. Klanten GET - JSON Serialization", True, 
                                    "Empty customer list (no data yet)")
                else:
                    self.log_test("2a. Klanten GET - JSON Serialization", False, 
                                "Response is not a list")
                    return False
                
                # POST /api/klanten - Create a new customer
                new_klant_data = {
                    "bedrijfsnaam": "Test Smart-TS Customer BV",
                    "algemeen_email": "test@smartts-customer.be",
                    "algemeen_telefoon": "+32 9 123 45 67",
                    "standaard_uurtarief": 85.0,
                    "adres_structured": {
                        "straat": "Teststraat",
                        "huisnummer": "42",
                        "postcode": "9000",
                        "stad": "Gent",
                        "land": "België"
                    },
                    "type_klant": "bedrijf",
                    "prijsmodel": "uurtarief"
                }
                
                create_response = self.session.post(f"{BASE_URL}/klanten", json=new_klant_data, timeout=10)
                
                if create_response.status_code == 200:
                    new_klant = create_response.json()
                    # Verify ObjectId serialization works correctly in creation
                    if "id" in new_klant and isinstance(new_klant["id"], str):
                        self.log_test("2b. Klanten POST - Create Customer", True, 
                                    f"Created customer: {new_klant['bedrijfsnaam']}, ID: {new_klant['id']}")
                        return True
                    else:
                        self.log_test("2b. Klanten POST - Create Customer", False, 
                                    "ObjectId not properly serialized in created customer")
                        return False
                else:
                    self.log_test("2b. Klanten POST - Create Customer", False, 
                                f"Status: {create_response.status_code}, Response: {create_response.text}")
                    return False
                    
            else:
                self.log_test("2a. Klanten GET - JSON Serialization", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("2. Klanten APIs", False, f"Error: {str(e)}")
            return False
    
    def test_scenario_3_teams_users_apis(self) -> bool:
        """Scenario 3: GET /api/teams and GET /api/auth/users for team member selection"""
        try:
            # GET /api/teams - Should return list of teams
            teams_response = self.session.get(f"{BASE_URL}/teams", timeout=10)
            
            if teams_response.status_code != 200:
                self.log_test("3a. Teams API", False, f"Status: {teams_response.status_code}")
                return False
            
            teams = teams_response.json()
            if not isinstance(teams, list):
                self.log_test("3a. Teams API", False, "Response is not a list")
                return False
            
            self.log_test("3a. Teams API", True, f"Found {len(teams)} teams")
            
            # GET /api/auth/users - Should return list of users for team member selection
            users_response = self.session.get(f"{BASE_URL}/auth/users", timeout=10)
            
            if users_response.status_code != 200:
                self.log_test("3b. Users API for Team Selection", False, f"Status: {users_response.status_code}")
                return False
            
            users = users_response.json()
            if not isinstance(users, list):
                self.log_test("3b. Users API for Team Selection", False, "Response is not a list")
                return False
            
            # Count users suitable for team selection (workers)
            workers = [u for u in users if u.get("rol") in ["worker", "werknemer"]]
            
            self.log_test("3b. Users API for Team Selection", True, 
                        f"Found {len(users)} total users, {len(workers)} workers for team assignment")
            return True
            
        except Exception as e:
            self.log_test("3. Teams & Users APIs", False, f"Error: {str(e)}")
            return False
    
    def test_scenario_4_berichten_apis(self) -> bool:
        """Scenario 4: POST /api/berichten - Create message with bijlagen array, GET /api/berichten"""
        try:
            if not self.admin_user:
                self.log_test("4. Berichten APIs", False, "No admin user available")
                return False
            
            # POST /api/berichten - Create message with bijlagen (attachment) array
            message_data = {
                "naar_id": None,
                "is_broadcast": True,
                "onderwerp": "Test Smart-TS Message with Attachments",
                "inhoud": "This is a test message to verify bijlagen (attachment) support.",
                "vastgepind": False,
                "bijlagen": [
                    {
                        "naam": "test-document.pdf",
                        "type": "application/pdf",
                        "data": "JVBERi0xLjMKJcTl8uXrp/Og0MTGCjQgMCBvYmoKPDwKL0xlbmd0aCA0NTAKL0ZpbHRlciAvRmxhdGVEZWNvZGUKPj4Kc3RyZWFtCg=="
                    },
                    {
                        "naam": "project-image.jpg",
                        "type": "image/jpeg",
                        "data": "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwC/gA="
                    }
                ]
            }
            
            params = {"van_id": self.admin_user["id"], "van_naam": self.admin_user["naam"]}
            create_response = self.session.post(f"{BASE_URL}/berichten", json=message_data, params=params, timeout=10)
            
            if create_response.status_code != 200:
                self.log_test("4a. Berichten POST with Bijlagen", False, 
                            f"Status: {create_response.status_code}, Response: {create_response.text}")
                return False
            
            created_message = create_response.json()
            message_id = created_message["id"]
            
            # Verify bijlagen field exists and has our attachments
            if "bijlagen" not in created_message:
                self.log_test("4a. Berichten POST with Bijlagen", False, 
                            "bijlagen field missing from created message")
                return False
            
            bijlagen = created_message["bijlagen"]
            if len(bijlagen) != 2:
                self.log_test("4a. Berichten POST with Bijlagen", False, 
                            f"Expected 2 bijlagen, got {len(bijlagen)}")
                return False
            
            self.log_test("4a. Berichten POST with Bijlagen", True, 
                        f"Created message with {len(bijlagen)} attachments")
            
            # GET /api/berichten - Verify message has bijlagen field
            get_params = {"user_id": self.admin_user["id"]}
            get_response = self.session.get(f"{BASE_URL}/berichten", params=get_params, timeout=10)
            
            if get_response.status_code != 200:
                self.log_test("4b. Berichten GET - Verify Bijlagen", False, f"Status: {get_response.status_code}")
                return False
            
            messages = get_response.json()
            if not isinstance(messages, list):
                self.log_test("4b. Berichten GET - Verify Bijlagen", False, "Response is not a list")
                return False
            
            # Find our created message
            found_message = None
            for msg in messages:
                if msg.get("id") == message_id:
                    found_message = msg
                    break
            
            if not found_message:
                self.log_test("4b. Berichten GET - Verify Bijlagen", False, "Created message not found in list")
                return False
            
            if "bijlagen" not in found_message:
                self.log_test("4b. Berichten GET - Verify Bijlagen", False, "bijlagen field missing from retrieved message")
                return False
            
            retrieved_bijlagen = found_message["bijlagen"]
            if len(retrieved_bijlagen) != 2:
                self.log_test("4b. Berichten GET - Verify Bijlagen", False, 
                            f"Expected 2 bijlagen, got {len(retrieved_bijlagen)}")
                return False
            
            self.log_test("4b. Berichten GET - Verify Bijlagen", True, 
                        f"Retrieved message has {len(retrieved_bijlagen)} attachments")
            
            return True
            
        except Exception as e:
            self.log_test("4. Berichten APIs", False, f"Error: {str(e)}")
            return False
    
    def test_scenario_5_planning_apis(self) -> bool:
        """Scenario 5: GET /api/planning?week_nummer=12&jaar=2026, POST /api/planning"""
        try:
            # GET /api/planning?week_nummer=12&jaar=2026
            get_params = {"week_nummer": 12, "jaar": 2026}
            get_response = self.session.get(f"{BASE_URL}/planning", params=get_params, timeout=10)
            
            if get_response.status_code != 200:
                self.log_test("5a. Planning GET Weekly", False, f"Status: {get_response.status_code}")
                return False
            
            planning_items = get_response.json()
            if not isinstance(planning_items, list):
                self.log_test("5a. Planning GET Weekly", False, "Response is not a list")
                return False
            
            self.log_test("5a. Planning GET Weekly", True, 
                        f"Found {len(planning_items)} planning items for week 12/2026")
            
            # POST /api/planning - Create a planning item
            # First get klanten and werven for valid IDs
            klanten_response = self.session.get(f"{BASE_URL}/klanten", timeout=10)
            werven_response = self.session.get(f"{BASE_URL}/werven", timeout=10)
            
            if klanten_response.status_code != 200 or werven_response.status_code != 200:
                self.log_test("5b. Planning POST - Setup", False, "Could not get klanten/werven data")
                return False
            
            klanten = klanten_response.json()
            werven = werven_response.json()
            
            if not klanten or not werven:
                self.log_test("5b. Planning POST - Setup", False, "No klanten or werven available")
                return False
            
            planning_data = {
                "week_nummer": 12,
                "jaar": 2026,
                "dag": "woensdag",
                "datum": "19-03-2026",
                "start_uur": "08:30",
                "eind_uur": "17:00",
                "voorziene_uur": "8u30",
                "werknemer_ids": [self.admin_user["id"]],
                "werknemer_namen": [self.admin_user["naam"]],
                "klant_id": klanten[0]["id"],
                "werf_id": werven[0]["id"],
                "omschrijving": "Test Smart-TS planning taak",
                "materiaallijst": ["Gereedschap", "Isolatiemateriaal", "Veiligheidsequipment"],
                "nodige_materiaal": "Gereedschap\nIsolatiemateriaal\nVeiligheidsequipment",
                "opmerking_aandachtspunt": "Let op: werkzaamheden op hoogte, extra veiligheidsmaatregelen nodig",
                "prioriteit": "hoog",
                "belangrijk": True,
                "notities": "Test planning item voor Smart-TS systeem"
            }
            
            create_response = self.session.post(f"{BASE_URL}/planning", json=planning_data, timeout=10)
            
            if create_response.status_code != 200:
                self.log_test("5b. Planning POST - Create Item", False, 
                            f"Status: {create_response.status_code}, Response: {create_response.text}")
                return False
            
            created_planning = create_response.json()
            
            # Verify required fields are present
            required_fields = ["id", "week_nummer", "jaar", "dag", "klant_naam", "werf_naam"]
            missing_fields = [field for field in required_fields if field not in created_planning]
            
            if missing_fields:
                self.log_test("5b. Planning POST - Create Item", False, f"Missing fields: {missing_fields}")
                return False
            
            self.log_test("5b. Planning POST - Create Item", True, 
                        f"Created planning item for {created_planning.get('klant_naam', 'Unknown')} - Week {created_planning['week_nummer']}/{created_planning['jaar']}")
            
            return True
            
        except Exception as e:
            self.log_test("5. Planning APIs", False, f"Error: {str(e)}")
            return False
    
    def test_scenario_6_werven_apis(self) -> bool:
        """Scenario 6: GET /api/werven - List projects"""
        try:
            response = self.session.get(f"{BASE_URL}/werven", timeout=10)
            
            if response.status_code != 200:
                self.log_test("6. Werven APIs", False, f"Status: {response.status_code}")
                return False
            
            werven = response.json()
            if not isinstance(werven, list):
                self.log_test("6. Werven APIs", False, "Response is not a list")
                return False
            
            # Verify structure of werven (projects)
            if werven:
                first_werf = werven[0]
                required_fields = ["id", "naam", "klant_id"]
                missing_fields = [field for field in required_fields if field not in first_werf]
                
                if missing_fields:
                    self.log_test("6. Werven APIs", False, f"Missing required fields: {missing_fields}")
                    return False
                
                self.log_test("6. Werven APIs", True, 
                            f"Found {len(werven)} projects/sites, first: '{first_werf['naam']}'")
            else:
                self.log_test("6. Werven APIs", True, "No projects/sites found (empty database)")
            
            return True
            
        except Exception as e:
            self.log_test("6. Werven APIs", False, f"Error: {str(e)}")
            return False
    
    def test_scenario_7_dashboard_stats(self) -> bool:
        """Scenario 7: GET /api/dashboard/stats"""
        try:
            response = self.session.get(f"{BASE_URL}/dashboard/stats", timeout=10)
            
            if response.status_code != 200:
                self.log_test("7. Dashboard Stats", False, f"Status: {response.status_code}")
                return False
            
            stats = response.json()
            if not isinstance(stats, dict):
                self.log_test("7. Dashboard Stats", False, "Response is not a dictionary")
                return False
            
            # Verify comprehensive statistics are present
            expected_stats = [
                "werknemers", "teams", "klanten", "werven", 
                "werkbonnen_deze_week", "planning_deze_week", 
                "week_nummer", "jaar"
            ]
            
            missing_stats = [stat for stat in expected_stats if stat not in stats]
            
            if missing_stats:
                self.log_test("7. Dashboard Stats", False, f"Missing statistics: {missing_stats}")
                return False
            
            # Verify data types are correct
            for stat in expected_stats:
                if not isinstance(stats[stat], int):
                    self.log_test("7. Dashboard Stats", False, f"Stat '{stat}' is not integer: {type(stats[stat])}")
                    return False
            
            self.log_test("7. Dashboard Stats", True, 
                        f"Comprehensive stats: {stats['werknemers']} workers, {stats['klanten']} clients, {stats['werven']} sites - Week {stats['week_nummer']}/{stats['jaar']}")
            
            return True
            
        except Exception as e:
            self.log_test("7. Dashboard Stats", False, f"Error: {str(e)}")
            return False
    
    def test_scenario_8_app_settings(self) -> bool:
        """Scenario 8: GET /api/app-settings"""
        try:
            # Test both /api/app-settings and /api/instellingen endpoints
            endpoints_to_test = [
                ("app-settings", "/api/app-settings"),
                ("instellingen", "/api/instellingen")
            ]
            
            success_count = 0
            
            for name, endpoint in endpoints_to_test:
                response = self.session.get(f"{BASE_URL.replace('/api', '')}{endpoint}", timeout=10)
                
                if response.status_code == 200:
                    settings = response.json()
                    if isinstance(settings, dict):
                        company_name = settings.get("bedrijfsnaam", "Unknown")
                        self.log_test(f"8a. App Settings ({name})", True, f"Company: {company_name}")
                        success_count += 1
                    else:
                        self.log_test(f"8a. App Settings ({name})", False, "Response is not a dictionary")
                elif response.status_code == 404:
                    self.log_test(f"8a. App Settings ({name})", False, f"Endpoint not found: {endpoint}")
                else:
                    self.log_test(f"8a. App Settings ({name})", False, f"Status: {response.status_code}")
            
            # If neither endpoint works, it's a failure
            if success_count == 0:
                return False
            
            return True
            
        except Exception as e:
            self.log_test("8. App Settings", False, f"Error: {str(e)}")
            return False
    
    def test_scenario_9_health_check(self) -> bool:
        """Scenario 9: GET /api/health"""
        try:
            response = self.session.get(f"{BASE_URL}/health", timeout=10)
            
            if response.status_code == 200:
                health_data = response.json()
                if isinstance(health_data, dict):
                    status = health_data.get("status", "unknown")
                    self.log_test("9. Health Check", True, f"Health status: {status}")
                else:
                    # Some health endpoints just return simple text
                    self.log_test("9. Health Check", True, "Health endpoint responding")
                return True
            else:
                self.log_test("9. Health Check", False, f"Status: {response.status_code}")
                return False
            
        except Exception as e:
            self.log_test("9. Health Check", False, f"Error: {str(e)}")
            return False
    
    def test_scenario_10_werkbonnen_apis(self) -> bool:
        """Scenario 10: Test werkbon creation with user_id parameter"""
        try:
            if not self.admin_user:
                self.log_test("10. Werkbonnen APIs", False, "No admin user available")
                return False
            
            # GET /api/werkbonnen?user_id=admin-001 - Test werkbon retrieval
            get_params = {"user_id": self.admin_user["id"], "is_admin": "true"}
            get_response = self.session.get(f"{BASE_URL}/werkbonnen", params=get_params, timeout=10)
            
            if get_response.status_code != 200:
                self.log_test("10a. Werkbonnen GET", False, f"Status: {get_response.status_code}")
                return False
            
            werkbonnen = get_response.json()
            if not isinstance(werkbonnen, list):
                self.log_test("10a. Werkbonnen GET", False, "Response is not a list")
                return False
            
            self.log_test("10a. Werkbonnen GET", True, f"Found {len(werkbonnen)} werkbonnen")
            
            # Test POST /api/werkbonnen - Create werkbon with user_id parameter
            # Need klant and werf data first
            klanten_response = self.session.get(f"{BASE_URL}/klanten", timeout=10)
            werven_response = self.session.get(f"{BASE_URL}/werven", timeout=10)
            
            if klanten_response.status_code != 200 or werven_response.status_code != 200:
                self.log_test("10b. Werkbonnen POST Setup", False, "Could not get klanten/werven data")
                return False
            
            klanten = klanten_response.json()
            werven = werven_response.json()
            
            if not klanten or not werven:
                self.log_test("10b. Werkbonnen POST Setup", False, "No klanten or werven available")
                return False
            
            werkbon_data = {
                "week_nummer": 12,
                "jaar": 2026,
                "klant_id": klanten[0]["id"],
                "werf_id": werven[0]["id"],
                "uren": [
                    {
                        "teamlid_naam": self.admin_user["naam"],
                        "maandag": 8.0,
                        "dinsdag": 8.0,
                        "woensdag": 7.5,
                        "donderdag": 8.0,
                        "vrijdag": 6.0,
                        "zaterdag": 0.0,
                        "zondag": 0.0
                    }
                ],
                "km_afstand": {
                    "maandag": 50.0,
                    "dinsdag": 50.0,
                    "woensdag": 50.0,
                    "donderdag": 50.0,
                    "vrijdag": 50.0,
                    "zaterdag": 0.0,
                    "zondag": 0.0
                },
                "uitgevoerde_werken": "PUR isolatie aanbrengen, afwerking",
                "extra_materialen": "Extra isolatiemateriaal gebruikt"
            }
            
            create_params = {"user_id": self.admin_user["id"], "user_naam": self.admin_user["naam"]}
            create_response = self.session.post(f"{BASE_URL}/werkbonnen", json=werkbon_data, params=create_params, timeout=10)
            
            if create_response.status_code == 200:
                created_werkbon = create_response.json()
                werkbon_id = created_werkbon.get("id")
                
                if werkbon_id:
                    self.log_test("10b. Werkbonnen POST with user_id", True, 
                                f"Created werkbon with ID: {werkbon_id}, Week: {created_werkbon.get('week_nummer')}/{created_werkbon.get('jaar')}")
                    return True
                else:
                    self.log_test("10b. Werkbonnen POST with user_id", False, "Created werkbon missing ID")
                    return False
            else:
                self.log_test("10b. Werkbonnen POST with user_id", False, 
                            f"Status: {create_response.status_code}, Response: {create_response.text}")
                return False
            
        except Exception as e:
            self.log_test("10. Werkbonnen APIs", False, f"Error: {str(e)}")
            return False
    
    def run_all_specific_tests(self) -> Dict[str, Any]:
        """Run all 10 specific test scenarios from the review request"""
        print("=" * 80)
        print("SMART-TS BACKEND API TEST SUITE")
        print("Testing 10 Specific Scenarios from Review Request")
        print("=" * 80)
        print(f"Backend URL: {BASE_URL}")
        print(f"Admin Credentials: {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
        print()
        
        # Authenticate admin first
        if not self.authenticate_admin():
            print("❌ Failed to authenticate admin user. Cannot proceed with tests.")
            return {"total_tests": 0, "passed_tests": 0, "failed_tests": 0, "success_rate": 0.0, "all_passed": False}
        
        print()
        
        # Run the 10 specific test scenarios
        tests = [
            ("1. Auth API Login & JWT Token", self.test_scenario_1_auth_login),
            ("2. Klanten APIs & ObjectId Serialization", self.test_scenario_2_klanten_apis),
            ("3. Teams & Users APIs", self.test_scenario_3_teams_users_apis),
            ("4. Berichten APIs with Bijlagen", self.test_scenario_4_berichten_apis),
            ("5. Planning APIs", self.test_scenario_5_planning_apis),
            ("6. Werven (Projects) APIs", self.test_scenario_6_werven_apis),
            ("7. Dashboard Statistics", self.test_scenario_7_dashboard_stats),
            ("8. App Settings", self.test_scenario_8_app_settings),
            ("9. Health Check", self.test_scenario_9_health_check),
            ("10. Werkbonnen APIs with user_id", self.test_scenario_10_werkbonnen_apis),
        ]
        
        passed_tests = 0
        total_tests = len(tests)
        
        for test_name, test_func in tests:
            print(f"\n--- Running: {test_name} ---")
            if test_func():
                passed_tests += 1
        
        print("\n" + "=" * 80)
        print("TEST SUMMARY - 10 SPECIFIC SCENARIOS")
        print("=" * 80)
        
        failed_tests = []
        for result in self.test_results:
            print(f"{result['status']} - {result['test']}")
            if result['details']:
                print(f"    {result['details']}")
            if not result['success'] and result['test'] != "Admin Authentication":
                failed_tests.append(result['test'])
        
        print("\n" + "-" * 80)
        print(f"TOTAL: {passed_tests}/{total_tests} scenarios passed")
        
        success_rate = (passed_tests / total_tests) * 100
        print(f"SUCCESS RATE: {success_rate:.1f}%")
        
        if passed_tests == total_tests:
            print("🎉 ALL 10 SCENARIOS PASSED!")
            print("Smart-TS backend APIs are working correctly for all test scenarios.")
        else:
            print(f"⚠️  {total_tests - passed_tests} scenarios failed")
            print("Failed scenarios:")
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
    """Main test runner for 10 specific scenarios"""
    tester = SmartTSBackendTester()
    results = tester.run_all_specific_tests()
    
    # Exit with appropriate code
    sys.exit(0 if results["all_passed"] else 1)

if __name__ == "__main__":
    main()