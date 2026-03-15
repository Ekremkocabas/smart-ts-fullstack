#!/usr/bin/env python3

import requests
import base64
import json
import uuid
from datetime import datetime
import sys

# Base URL from frontend environment
BASE_URL = "https://expo-fastapi-1.preview.emergentagent.com/api"

# Test credentials
TEST_EMAIL = "info@smart-techbv.be"
TEST_PASSWORD = "SmartTech2025!"

# Small test image data (1x1 PNG)
TEST_IMAGE_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

def test_health_check():
    """Test basic health endpoint"""
    print("🏥 Testing Health Check...")
    try:
        response = requests.get(f"{BASE_URL}/health")
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"   Response: {data}")
            return data.get("status") == "healthy"
        return False
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

def test_auth_login():
    """Test authentication and get JWT token"""
    print("🔑 Testing Authentication...")
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json={
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD
        })
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            token = data.get("token")
            print(f"   Token length: {len(token) if token else 0}")
            print(f"   User: {data.get('user', {}).get('naam', 'Unknown')}")
            return token
        else:
            print(f"   ❌ Error: {response.text}")
            return None
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return None

def test_gridfs_file_upload(token):
    """Test GridFS file upload endpoint"""
    print("📁 Testing GridFS File Upload...")
    try:
        headers = {"Authorization": f"Bearer {token}"}
        payload = {
            "data": TEST_IMAGE_BASE64,
            "filename": "test_image.png",
            "content_type": "image/png"
        }
        
        response = requests.post(f"{BASE_URL}/files/upload", 
                               json=payload, headers=headers)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            file_id = data.get("file_id")
            print(f"   File ID: {file_id}")
            print(f"   Filename: {data.get('filename')}")
            return file_id
        else:
            print(f"   ❌ Error: {response.text}")
            return None
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return None

def test_gridfs_file_download(file_id, token):
    """Test GridFS file download endpoint"""
    print("📥 Testing GridFS File Download...")
    try:
        headers = {"Authorization": f"Bearer {token}"}
        
        # Test direct file download
        response = requests.get(f"{BASE_URL}/files/{file_id}", headers=headers)
        print(f"   Direct download status: {response.status_code}")
        print(f"   Content-Type: {response.headers.get('Content-Type')}")
        print(f"   Content-Length: {len(response.content)} bytes")
        
        # Test base64 download
        response = requests.get(f"{BASE_URL}/files/{file_id}/base64", headers=headers)
        print(f"   Base64 download status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            retrieved_data = data.get("data")
            print(f"   Base64 data length: {len(retrieved_data) if retrieved_data else 0}")
            print(f"   Content type: {data.get('content_type')}")
            print(f"   Filename: {data.get('filename')}")
            
            # Verify data matches original
            return retrieved_data == TEST_IMAGE_BASE64
        
        return response.status_code == 200
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

def test_productie_werkbon_with_photos(token):
    """Test Productie Werkbon creation with photos stored in GridFS"""
    print("🏭 Testing Productie Werkbon with GridFS Photos...")
    try:
        headers = {
            "Authorization": f"Bearer {token}",
        }
        
        # Create a productie werkbon with photos
        werkbon_data = {
            "klant_id": "b3dbf862-2ece-43f6-ab35-31366f99effb",
            "werf_id": "12ad7b78-ff5a-415f-a39b-9f19aa93138b", 
            "omschrijving": "GridFS Test Werkbon",
            "m_kwadraat": 50.5,
            "datum": datetime.now().isoformat(),
            "fotos": [
                {
                    "base64": f"data:image/png;base64,{TEST_IMAGE_BASE64}",
                    "timestamp": datetime.now().isoformat(),
                    "werknemer_id": "64fa6af4-630e-4f90-9452-fb3b74b4b432",
                    "gps": "51.2211,4.4051"
                }
            ],
            "handtekening": f"data:image/png;base64,{TEST_IMAGE_BASE64}",
            "team_leden": ["64fa6af4-630e-4f90-9452-fb3b74b4b432"],
            "pur_schuimwerk": True,
            "gps_locatie": "51.2211,4.4051",
            "selfie_base64": f"data:image/png;base64,{TEST_IMAGE_BASE64}",
            "schuurwerken": True,
            "stofzuigen": True,
            "status": "voltooid"
        }
        
        # Use query parameters as expected by the API
        response = requests.post(f"{BASE_URL}/productie-werkbonnen?user_id=admin-001&user_naam=Test%20User", 
                               json=werkbon_data, headers=headers)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            werkbon_id = data.get("id")
            print(f"   Werkbon ID: {werkbon_id}")
            
            # Check if fotos array contains file_id instead of base64
            fotos = data.get("fotos", [])
            if fotos and len(fotos) > 0:
                first_foto = fotos[0]
                has_file_id = "file_id" in first_foto
                no_base64 = "base64" not in first_foto
                print(f"   Photo stored as file_id: {has_file_id}")
                print(f"   No base64 in response: {no_base64}")
                
                # Check handtekening field
                handtekening = data.get("handtekening")
                handtekening_is_file_id = handtekening and len(handtekening) == 24  # ObjectId length
                print(f"   Handtekening as file_id: {handtekening_is_file_id}")
                
                return has_file_id and no_base64 and handtekening_is_file_id
            
            return True
        else:
            print(f"   ❌ Error: {response.text}")
            return False
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

def test_berichten_with_bijlagen(token):
    """Test Berichten API with GridFS attachments"""
    print("💬 Testing Berichten with GridFS Bijlagen...")
    try:
        headers = {
            "Authorization": f"Bearer {token}",
        }
        
        # Create a message with attachment
        bericht_data = {
            "naar_id": "2c4998b1-0f65-474d-ba53-196c8d3770c4",
            "is_broadcast": False,
            "onderwerp": "GridFS Test Bericht",
            "inhoud": "Testing GridFS file storage for attachments",
            "vastgepind": False,
            "bijlagen": [
                {
                    "naam": "test_attachment.png",
                    "type": "image/png", 
                    "data": f"data:image/png;base64,{TEST_IMAGE_BASE64}"
                }
            ],
            "planning_id": None
        }
        
        # Use query parameters as expected by the API
        response = requests.post(f"{BASE_URL}/berichten?van_id=admin-001&van_naam=Test%20User", 
                               json=bericht_data, headers=headers)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            bericht_id = data.get("id")
            print(f"   Bericht ID: {bericht_id}")
            
            # Check if bijlagen contains file_id
            bijlagen = data.get("bijlagen", [])
            if bijlagen and len(bijlagen) > 0:
                first_bijlage = bijlagen[0]
                has_file_id = "file_id" in first_bijlage
                no_data = "data" not in first_bijlage
                print(f"   Attachment stored as file_id: {has_file_id}")
                print(f"   No data in response: {no_data}")
                print(f"   Attachment filename: {first_bijlage.get('naam')}")
                
                return has_file_id and no_data
            
            return True
        else:
            print(f"   ❌ Error: {response.text}")
            return False
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

def test_admin_werkbonnen_access(token):
    """Test admin access to werkbonnen list"""
    print("👨‍💼 Testing Admin Werkbonnen Access...")
    try:
        headers = {"Authorization": f"Bearer {token}"}
        
        # Test admin access to werkbonnen
        response = requests.get(f"{BASE_URL}/werkbonnen?is_admin=true&user_id=admin-001", 
                               headers=headers)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"   Werkbonnen count: {len(data) if isinstance(data, list) else 'Not a list'}")
            return True
        else:
            print(f"   ❌ Error: {response.text}")
            return False
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

def run_gridfs_tests():
    """Run comprehensive GridFS implementation tests"""
    print("🚀 SMART-TS WERKBON GRIDFS IMPLEMENTATION TESTS")
    print("="*60)
    
    results = {}
    
    # 1. Health Check
    results["health"] = test_health_check()
    
    # 2. Authentication
    token = test_auth_login()
    results["auth"] = token is not None
    
    if not token:
        print("\n❌ Cannot proceed without authentication token")
        return results
    
    # 3. GridFS File Upload/Download
    file_id = test_gridfs_file_upload(token)
    results["gridfs_upload"] = file_id is not None
    
    if file_id:
        results["gridfs_download"] = test_gridfs_file_download(file_id, token)
    else:
        results["gridfs_download"] = False
    
    # 4. Productie Werkbon with Photos
    results["productie_werkbon"] = test_productie_werkbon_with_photos(token)
    
    # 5. Berichten with Bijlagen
    results["berichten_bijlagen"] = test_berichten_with_bijlagen(token)
    
    # 6. Admin API Access
    results["admin_access"] = test_admin_werkbonnen_access(token)
    
    print("\n" + "="*60)
    print("📊 TEST RESULTS SUMMARY:")
    print("="*60)
    
    total_tests = len(results)
    passed_tests = sum(1 for result in results.values() if result)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{test_name:20}: {status}")
    
    print(f"\nSUCCESS RATE: {passed_tests}/{total_tests} ({(passed_tests/total_tests)*100:.1f}%)")
    
    return results

if __name__ == "__main__":
    run_gridfs_tests()