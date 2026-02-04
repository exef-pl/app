#!/usr/bin/env python3
"""Test script for EXEF3 API endpoints."""

import requests
import json

BASE_URL = "http://localhost:8003/api/v1"

def test_api():
    print("Testing EXEF3 API...")
    
    # Test health endpoint
    print("\n1. Health check:")
    response = requests.get(f"{BASE_URL.replace('/api/v1', '')}/health")
    print(f"   Status: {response.status_code}")
    print(f"   Response: {response.json()}")
    
    # Register user
    print("\n2. Register user:")
    register_data = {
        "email": "test2@example.com",
        "password": "Test123",
        "nip": "9876543210",
        "first_name": "Test",
        "last_name": "User2"
    }
    response = requests.post(f"{BASE_URL}/auth/register", json=register_data)
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        user_data = response.json()
        print(f"   User ID: {user_data['id']}")
        print(f"   Email: {user_data['email']}")
    else:
        print(f"   Error: {response.text}")
    
    # Login
    print("\n3. Login:")
    login_data = {
        "username": "test@example.com",
        "password": "Test123"
    }
    response = requests.post(f"{BASE_URL}/auth/login", data=login_data)
    print(f"   Status: {response.status_code}")
    if response.status_code == 200:
        token_data = response.json()
        token = token_data["access_token"]
        print(f"   Token received: {token[:50]}...")
        
        # Test authenticated endpoints
        headers = {"Authorization": f"Bearer {token}"}
        
        print("\n4. Get entities (empty list expected):")
        response = requests.get(f"{BASE_URL}/entities", headers=headers)
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.json()}")
        
        print("\n5. Create entity:")
        entity_data = {
            "type": "jdg",
            "name": "Test JDG Entity",
            "nip": "1234567890",
            "description": "Test entity for API verification"
        }
        response = requests.post(f"{BASE_URL}/entities", json=entity_data, headers=headers)
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            created_entity = response.json()
            print(f"   Entity ID: {created_entity['id']}")
            print(f"   Entity name: {created_entity['name']}")
        
        print("\n6. Get entities (should have one):")
        response = requests.get(f"{BASE_URL}/entities", headers=headers)
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.json()}")
        
    else:
        print(f"   Error: {response.text}")
    
    print("\n✅ API tests completed!")

if __name__ == "__main__":
    test_api()
