"""EXEF E2E Tests with Playwright - v1.1.0 with Profiles"""
import pytest
from playwright.sync_api import Page, expect
import httpx
import time
import uuid

API_URL = "http://backend:8000"
APP_URL = "http://frontend:80"


# === Profile API Tests ===
class TestProfileAPI:
    """Tests for profile management API (v1.1.0)"""
    
    def test_list_profiles(self):
        """Default profile should exist"""
        r = httpx.get(f"{API_URL}/api/profiles")
        assert r.status_code == 200
        profiles = r.json()
        assert isinstance(profiles, list)
        assert any(p["id"] == "default" for p in profiles)
    
    def test_create_profile(self):
        """Can create a new profile"""
        profile_data = {
            "name": "Test Company",
            "nip": "1234567890",
            "address": "Test Street 1",
            "color": "#ff5733"
        }
        r = httpx.post(f"{API_URL}/api/profiles", json=profile_data)
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "Test Company"
        assert data["nip"] == "1234567890"
        assert data["id"] is not None
        # Cleanup
        httpx.delete(f"{API_URL}/api/profiles/{data['id']}")
    
    def test_get_profile(self):
        """Can get a specific profile"""
        r = httpx.get(f"{API_URL}/api/profiles/default")
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == "default"
    
    def test_update_profile(self):
        """Can update a profile"""
        # Create profile
        r = httpx.post(f"{API_URL}/api/profiles", json={"name": "Update Test", "nip": "111"})
        profile_id = r.json()["id"]
        
        # Update
        r = httpx.patch(f"{API_URL}/api/profiles/{profile_id}", json={"name": "Updated Name"})
        assert r.status_code == 200
        assert r.json()["name"] == "Updated Name"
        
        # Cleanup
        httpx.delete(f"{API_URL}/api/profiles/{profile_id}")
    
    def test_delete_profile(self):
        """Can delete a profile (except default)"""
        # Create profile
        r = httpx.post(f"{API_URL}/api/profiles", json={"name": "Delete Test", "nip": "222"})
        profile_id = r.json()["id"]
        
        # Delete
        r = httpx.delete(f"{API_URL}/api/profiles/{profile_id}")
        assert r.status_code == 200
        
        # Verify deleted
        r = httpx.get(f"{API_URL}/api/profiles/{profile_id}")
        assert r.status_code == 404
    
    def test_cannot_delete_default_profile(self):
        """Cannot delete the default profile"""
        r = httpx.delete(f"{API_URL}/api/profiles/default")
        assert r.status_code == 400
    
    def test_profile_isolation(self):
        """Documents in one profile are not visible in another"""
        # Create two profiles
        r1 = httpx.post(f"{API_URL}/api/profiles", json={"name": "Profile A", "nip": "AAA"})
        profile_a = r1.json()["id"]
        r2 = httpx.post(f"{API_URL}/api/profiles", json={"name": "Profile B", "nip": "BBB"})
        profile_b = r2.json()["id"]
        
        # Create document in profile A
        r = httpx.post(f"{API_URL}/api/profiles/{profile_a}/documents", json={
            "type": "invoice", "number": "ISO-A-001", "amount": 100
        })
        doc_a_id = r.json()["id"]
        
        # Create document in profile B
        r = httpx.post(f"{API_URL}/api/profiles/{profile_b}/documents", json={
            "type": "invoice", "number": "ISO-B-001", "amount": 200
        })
        doc_b_id = r.json()["id"]
        
        # Check profile A only sees its documents
        docs_a = httpx.get(f"{API_URL}/api/profiles/{profile_a}/documents").json()
        assert any(d["number"] == "ISO-A-001" for d in docs_a)
        assert not any(d["number"] == "ISO-B-001" for d in docs_a)
        
        # Check profile B only sees its documents
        docs_b = httpx.get(f"{API_URL}/api/profiles/{profile_b}/documents").json()
        assert any(d["number"] == "ISO-B-001" for d in docs_b)
        assert not any(d["number"] == "ISO-A-001" for d in docs_b)
        
        # Cleanup
        httpx.delete(f"{API_URL}/api/profiles/{profile_a}")
        httpx.delete(f"{API_URL}/api/profiles/{profile_b}")


# === Legacy API Tests (backward compatibility) ===
class TestLegacyAPI:
    """Tests for backward-compatible legacy API (uses default profile)"""
    
    def test_health(self):
        r = httpx.get(f"{API_URL}/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"
        assert "version" in r.json()
    
    def test_create_endpoint(self):
        r = httpx.post(f"{API_URL}/api/endpoints", json={
            "type": "email", "direction": "import", "name": "Test Email", "config": {}
        })
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "Test Email"
        assert data["id"] is not None
        # Cleanup
        httpx.delete(f"{API_URL}/api/endpoints/{data['id']}")
    
    def test_create_document(self):
        r = httpx.post(f"{API_URL}/api/documents", json={
            "type": "invoice", "number": "TEST-001", "contractor": "Test Corp", "amount": 1000
        })
        assert r.status_code == 200
        data = r.json()
        assert data["number"] == "TEST-001"
        assert data["status"] == "created"
        # Cleanup
        httpx.delete(f"{API_URL}/api/documents/{data['id']}")
    
    def test_document_flow(self):
        # Create
        r = httpx.post(f"{API_URL}/api/documents", json={
            "type": "invoice", "number": "FLOW-001", "contractor": "Flow Corp", "amount": 500
        })
        doc_id = r.json()["id"]
        
        # Update to described
        r = httpx.patch(f"{API_URL}/api/documents/{doc_id}", json={"status": "described"})
        assert r.json()["status"] == "described"
        
        # Update to signed
        r = httpx.patch(f"{API_URL}/api/documents/{doc_id}", json={"status": "signed"})
        assert r.json()["status"] == "signed"
        
        # Cleanup
        httpx.delete(f"{API_URL}/api/documents/{doc_id}")
    
    def test_pull_from_mock_ksef(self):
        # Create KSeF import endpoint
        r = httpx.post(f"{API_URL}/api/endpoints", json={
            "type": "ksef", "direction": "import", "name": "Test KSeF", "config": {}
        })
        ep_id = r.json()["id"]
        
        # Pull
        r = httpx.post(f"{API_URL}/api/flow/pull/{ep_id}")
        assert r.status_code == 200
        data = r.json()
        assert data["imported"] >= 1
        
        # Cleanup
        httpx.delete(f"{API_URL}/api/endpoints/{ep_id}")
        for doc in data["documents"]:
            httpx.delete(f"{API_URL}/api/documents/{doc['id']}")
    
    def test_push_to_mock_wfirma(self):
        # Create document
        r = httpx.post(f"{API_URL}/api/documents", json={
            "type": "invoice", "number": "EXP-001", "status": "signed", "amount": 100
        })
        doc_id = r.json()["id"]
        
        # Create export endpoint
        r = httpx.post(f"{API_URL}/api/endpoints", json={
            "type": "wfirma", "direction": "export", "name": "Test wFirma", "config": {}
        })
        ep_id = r.json()["id"]
        
        # Push
        r = httpx.post(f"{API_URL}/api/flow/push/{ep_id}", json=[doc_id])
        assert r.status_code == 200
        assert r.json()["success"] == True
        
        # Check document is now exported
        r = httpx.get(f"{API_URL}/api/documents")
        doc = next((d for d in r.json() if d["id"] == doc_id), None)
        assert doc["status"] == "exported"
        
        # Cleanup
        httpx.delete(f"{API_URL}/api/endpoints/{ep_id}")
        httpx.delete(f"{API_URL}/api/documents/{doc_id}")
    
    def test_webhook_receive(self):
        # Create webhook endpoint
        r = httpx.post(f"{API_URL}/api/endpoints", json={
            "type": "webhook", "direction": "import", "name": "Test Webhook", "config": {}
        })
        ep_id = r.json()["id"]
        
        # Send webhook (profile-scoped API)
        r = httpx.post(f"{API_URL}/api/webhook/default/{ep_id}", json={
            "type": "invoice", "number": "WH-001", "contractor": "Webhook Sender", "amount": 250
        })
        assert r.status_code == 200
        doc_id = r.json()["id"]
        
        # Verify document exists
        r = httpx.get(f"{API_URL}/api/documents")
        assert any(d["id"] == doc_id for d in r.json())
        
        # Cleanup
        httpx.delete(f"{API_URL}/api/endpoints/{ep_id}")
        httpx.delete(f"{API_URL}/api/documents/{doc_id}")
    
    def test_stats(self):
        r = httpx.get(f"{API_URL}/api/stats")
        assert r.status_code == 200
        data = r.json()
        assert "documents" in data
        assert "endpoints" in data


# === UI Tests ===
class TestUI:
    def test_page_loads(self, page: Page):
        page.goto(APP_URL)
        expect(page.locator(".logo")).to_be_visible()
    
    def test_navigation(self, page: Page):
        page.goto(APP_URL)
        
        # Navigate to Create
        page.locator(".nav-item:has-text('Utwórz')").click()
        expect(page.locator("h1:has-text('Utwórz dokument')")).to_be_visible()
        
        # Navigate to Import
        page.locator(".nav-item:has-text('Import')").click()
        expect(page.locator("text=Dodaj źródło")).to_be_visible()
        
        # Navigate to Export
        page.locator(".nav-item:has-text('Export')").click()
        expect(page.locator("text=Dodaj cel")).to_be_visible()
        
        # Navigate back to Documents
        page.locator(".nav-group:has-text('Dokumenty') .nav-item:has-text('Zarządzanie')").click()
        expect(page.locator("h1:has-text('Dokumenty')")).to_be_visible()
    
    def test_create_document_ui(self, page: Page):
        page.goto(APP_URL)
        
        # Go to create view
        page.locator(".nav-item:has-text('Utwórz')").click()
        
        # Fill form
        page.fill("input[placeholder='FV/2026/01/001']", "UI-TEST-001")
        page.fill("input[placeholder='Nazwa firmy']", "UI Test Company")
        page.fill("input[type='number']", "999")
        
        # Submit
        page.click("button:has-text('Utwórz dokument')")
        
        # Should redirect to docs and show new document
        time.sleep(0.5)
        expect(page.locator("text=UI-TEST-001")).to_be_visible()
        
        # Cleanup via API
        r = httpx.get(f"{API_URL}/api/documents")
        doc = next((d for d in r.json() if d["number"] == "UI-TEST-001"), None)
        if doc:
            httpx.delete(f"{API_URL}/api/documents/{doc['id']}")
    
    def test_add_import_endpoint_ui(self, page: Page):
        page.goto(APP_URL)
        
        # Go to import
        page.click("text=Import")
        
        # Open modal
        page.click("button:has-text('Dodaj źródło')")
        time.sleep(0.3)
        expect(page.locator(".modal-content:visible")).to_be_visible()
        
        # Fill form
        page.fill(".modal-content input[placeholder='np. Skrzynka faktur']", "UI Test Import")
        
        # Submit
        page.click(".modal-content button:has-text('Dodaj')")
        
        # Should show new endpoint
        time.sleep(0.5)
        expect(page.locator("text=UI Test Import")).to_be_visible()
        
        # Cleanup via API
        r = httpx.get(f"{API_URL}/api/endpoints")
        ep = next((e for e in r.json() if e["name"] == "UI Test Import"), None)
        if ep:
            httpx.delete(f"{API_URL}/api/endpoints/{ep['id']}")
    
    def test_document_status_workflow_ui(self, page: Page):
        # Create document via API
        r = httpx.post(f"{API_URL}/api/documents", json={
            "type": "invoice", "number": "WORKFLOW-UI-001", "contractor": "Workflow Test", "amount": 500
        })
        doc_id = r.json()["id"]
        
        page.goto(APP_URL)
        time.sleep(0.5)
        
        # Document should show with status created and "Opisz" button
        expect(page.locator("text=WORKFLOW-UI-001")).to_be_visible()
        
        # Click describe
        page.locator("tr:has-text('WORKFLOW-UI-001') button:has-text('Opisz')").click()
        time.sleep(0.3)
        
        # Now should show "Podpisz" button
        expect(page.locator("tr:has-text('WORKFLOW-UI-001') button:has-text('Podpisz')")).to_be_visible()
        
        # Click sign
        page.locator("tr:has-text('WORKFLOW-UI-001') button:has-text('Podpisz')").click()
        time.sleep(0.3)
        
        # Verify via API
        r = httpx.get(f"{API_URL}/api/documents")
        doc = next((d for d in r.json() if d["id"] == doc_id), None)
        assert doc["status"] == "signed"
        
        # Cleanup
        httpx.delete(f"{API_URL}/api/documents/{doc_id}")


# === Integration Tests ===
class TestIntegration:
    def test_full_import_export_flow(self):
        """Test complete flow: create import endpoint -> pull -> describe -> sign -> create export -> push"""
        
        # 1. Create import endpoint (KSeF mock)
        r = httpx.post(f"{API_URL}/api/endpoints", json={
            "type": "ksef", "direction": "import", "name": "Integration KSeF", "config": {}
        })
        import_ep_id = r.json()["id"]
        
        # 2. Pull documents from KSeF
        r = httpx.post(f"{API_URL}/api/flow/pull/{import_ep_id}")
        assert r.json()["imported"] >= 1
        doc_id = r.json()["documents"][0]["id"]
        
        # 3. Describe document
        r = httpx.patch(f"{API_URL}/api/documents/{doc_id}", json={"status": "described"})
        assert r.json()["status"] == "described"
        
        # 4. Sign document
        r = httpx.patch(f"{API_URL}/api/documents/{doc_id}", json={"status": "signed"})
        assert r.json()["status"] == "signed"
        
        # 5. Create export endpoint (wFirma mock)
        r = httpx.post(f"{API_URL}/api/endpoints", json={
            "type": "wfirma", "direction": "export", "name": "Integration wFirma", "config": {}
        })
        export_ep_id = r.json()["id"]
        
        # 6. Push to wFirma
        r = httpx.post(f"{API_URL}/api/flow/push/{export_ep_id}", json=[doc_id])
        assert r.json()["success"] == True
        assert r.json()["exported"] == 1
        
        # 7. Verify final status
        r = httpx.get(f"{API_URL}/api/documents")
        doc = next((d for d in r.json() if d["id"] == doc_id), None)
        assert doc["status"] == "exported"
        
        # Cleanup
        httpx.delete(f"{API_URL}/api/endpoints/{import_ep_id}")
        httpx.delete(f"{API_URL}/api/endpoints/{export_ep_id}")
        httpx.delete(f"{API_URL}/api/documents/{doc_id}")
    
    def test_webhook_integration(self):
        """Test webhook endpoint receiving external document and exporting it"""
        
        # 1. Create webhook import endpoint
        r = httpx.post(f"{API_URL}/api/endpoints", json={
            "type": "webhook", "direction": "import", "name": "External System", "config": {}
        })
        import_ep_id = r.json()["id"]
        
        # 2. Simulate external system sending document (profile-scoped API)
        r = httpx.post(f"{API_URL}/api/webhook/default/{import_ep_id}", json={
            "type": "invoice",
            "number": "EXT-2026-001",
            "contractor": "External Partner",
            "amount": 5000,
            "custom_field": "external_data"
        })
        doc_id = r.json()["id"]
        
        # 3. Verify document was created with source endpoint
        r = httpx.get(f"{API_URL}/api/documents")
        doc = next((d for d in r.json() if d["id"] == doc_id), None)
        assert doc["source_endpoint"] == import_ep_id
        assert doc["data"]["custom_field"] == "external_data"
        
        # Cleanup
        httpx.delete(f"{API_URL}/api/endpoints/{import_ep_id}")
        httpx.delete(f"{API_URL}/api/documents/{doc_id}")


# === Profile UI Tests ===
class TestProfileUI:
    """UI tests for profile management (v1.1.0)"""
    
    def test_profile_selector_visible(self, page: Page):
        """Profile selector should be visible in sidebar"""
        page.goto(APP_URL)
        expect(page.locator(".profile-selector")).to_be_visible()
    
    def test_profile_dropdown_opens(self, page: Page):
        """Clicking profile selector opens dropdown"""
        page.goto(APP_URL)
        page.click(".profile-selector")
        time.sleep(0.3)
        expect(page.locator(".profile-dropdown")).to_be_visible()
    
    def test_navigate_to_profiles_view(self, page: Page):
        """Can navigate to profiles management view"""
        page.goto(APP_URL)
        # Click on the Profile section's Zarządzanie nav item
        page.locator(".nav-group:has-text('Profile') .nav-item").click()
        time.sleep(0.3)
        expect(page.locator("h1:has-text('Profile')")).to_be_visible()
    
    def test_create_profile_ui(self, page: Page):
        """Can create a new profile via UI"""
        page.goto(APP_URL)
        
        # Navigate to profiles view
        page.locator(".nav-group:has-text('Profile') .nav-item").click()
        time.sleep(0.3)
        
        # Open modal
        page.locator(".header button:has-text('Dodaj profil')").click()
        time.sleep(0.3)
        expect(page.locator(".modal-content h3:has-text('Nowy profil')")).to_be_visible()
        
        # Fill form
        page.fill(".modal-content input[placeholder='Moja Firma Sp. z o.o.']", "UI Test Profile")
        page.fill(".modal-content input[placeholder='1234567890']", "9999999999")
        
        # Submit
        page.click(".modal-content button:has-text('Utwórz')")
        time.sleep(0.5)
        
        # Verify profile appears
        expect(page.locator(".card-title:has-text('UI Test Profile')")).to_be_visible()
        
        # Cleanup via API
        r = httpx.get(f"{API_URL}/api/profiles")
        profile = next((p for p in r.json() if p["name"] == "UI Test Profile"), None)
        if profile:
            httpx.delete(f"{API_URL}/api/profiles/{profile['id']}")
    
    def test_switch_profile_ui(self, page: Page):
        """Can switch between profiles"""
        # Create a test profile via API
        r = httpx.post(f"{API_URL}/api/profiles", json={
            "name": "Switch Test Profile", "nip": "1111111111"
        })
        profile_id = r.json()["id"]
        
        page.goto(APP_URL)
        time.sleep(0.5)
        
        # Open profile selector
        page.click(".profile-selector")
        time.sleep(0.3)
        
        # Click on the test profile option in dropdown
        page.locator(".profile-dropdown .profile-option:has-text('Switch Test Profile')").click()
        time.sleep(0.5)
        
        # Verify profile is now selected (name shown in selector)
        expect(page.locator(".profile-current .profile-name:has-text('Switch Test Profile')")).to_be_visible()
        
        # Cleanup
        httpx.delete(f"{API_URL}/api/profiles/{profile_id}")


# === Profile-Scoped API Tests ===
class TestProfileScopedAPI:
    """Tests for profile-scoped document and endpoint operations"""
    
    def test_create_document_in_profile(self):
        """Can create document in specific profile"""
        # Create profile
        r = httpx.post(f"{API_URL}/api/profiles", json={"name": "Doc Test", "nip": "123"})
        profile_id = r.json()["id"]
        
        # Create document in profile
        r = httpx.post(f"{API_URL}/api/profiles/{profile_id}/documents", json={
            "type": "invoice", "number": "PROF-DOC-001", "amount": 500
        })
        assert r.status_code == 200
        doc = r.json()
        assert doc["profile_id"] == profile_id
        
        # Cleanup
        httpx.delete(f"{API_URL}/api/profiles/{profile_id}")
    
    def test_create_endpoint_in_profile(self):
        """Can create endpoint in specific profile"""
        # Create profile
        r = httpx.post(f"{API_URL}/api/profiles", json={"name": "EP Test", "nip": "456"})
        profile_id = r.json()["id"]
        
        # Create endpoint in profile
        r = httpx.post(f"{API_URL}/api/profiles/{profile_id}/endpoints", json={
            "type": "email", "direction": "import", "name": "Profile Email"
        })
        assert r.status_code == 200
        ep = r.json()
        assert ep["profile_id"] == profile_id
        
        # Cleanup
        httpx.delete(f"{API_URL}/api/profiles/{profile_id}")
    
    def test_profile_stats(self):
        """Can get stats for specific profile"""
        # Create profile with some data
        r = httpx.post(f"{API_URL}/api/profiles", json={"name": "Stats Test", "nip": "789"})
        profile_id = r.json()["id"]
        
        # Add documents
        httpx.post(f"{API_URL}/api/profiles/{profile_id}/documents", json={
            "type": "invoice", "number": "STAT-001", "amount": 100
        })
        httpx.post(f"{API_URL}/api/profiles/{profile_id}/documents", json={
            "type": "invoice", "number": "STAT-002", "amount": 200, "status": "signed"
        })
        
        # Get stats
        r = httpx.get(f"{API_URL}/api/profiles/{profile_id}/stats")
        assert r.status_code == 200
        stats = r.json()
        assert stats["documents"]["total"] == 2
        
        # Cleanup
        httpx.delete(f"{API_URL}/api/profiles/{profile_id}")
    
    def test_full_profile_workflow(self):
        """Complete workflow within a profile: create -> import -> describe -> sign -> export"""
        # 1. Create profile
        r = httpx.post(f"{API_URL}/api/profiles", json={
            "name": "Full Workflow Test", "nip": "9876543210"
        })
        profile_id = r.json()["id"]
        
        # 2. Create import endpoint
        r = httpx.post(f"{API_URL}/api/profiles/{profile_id}/endpoints", json={
            "type": "ksef", "direction": "import", "name": "KSeF Import"
        })
        import_ep_id = r.json()["id"]
        
        # 3. Pull documents
        r = httpx.post(f"{API_URL}/api/profiles/{profile_id}/flow/pull/{import_ep_id}")
        assert r.json()["imported"] >= 1
        doc_id = r.json()["documents"][0]["id"]
        
        # 4. Process document through workflow
        httpx.patch(f"{API_URL}/api/profiles/{profile_id}/documents/{doc_id}", json={"status": "described"})
        httpx.patch(f"{API_URL}/api/profiles/{profile_id}/documents/{doc_id}", json={"status": "signed"})
        
        # 5. Create export endpoint
        r = httpx.post(f"{API_URL}/api/profiles/{profile_id}/endpoints", json={
            "type": "wfirma", "direction": "export", "name": "wFirma Export"
        })
        export_ep_id = r.json()["id"]
        
        # 6. Export document
        r = httpx.post(f"{API_URL}/api/profiles/{profile_id}/flow/push/{export_ep_id}", json=[doc_id])
        assert r.json()["success"] == True
        
        # 7. Verify final status
        r = httpx.get(f"{API_URL}/api/profiles/{profile_id}/documents")
        doc = next((d for d in r.json() if d["id"] == doc_id), None)
        assert doc["status"] == "exported"
        
        # Cleanup - deleting profile cascades to documents and endpoints
        httpx.delete(f"{API_URL}/api/profiles/{profile_id}")


# === Export & Categorization API Tests ===
class TestExportAPI:
    """Tests for export and categorization features"""
    
    def test_list_categories(self):
        """Can list available expense categories"""
        r = httpx.get(f"{API_URL}/api/categories")
        assert r.status_code == 200
        data = r.json()
        assert "categories" in data
        assert "towary" in data["categories"]
        assert "paliwo" in data["categories"]
    
    def test_list_export_formats(self):
        """Can list available export formats"""
        r = httpx.get(f"{API_URL}/api/export/formats")
        assert r.status_code == 200
        data = r.json()
        assert "formats" in data
        format_ids = [f["id"] for f in data["formats"]]
        assert "wfirma" in format_ids
        assert "jpk_pkpir" in format_ids
    
    def test_suggest_category(self):
        """Can get category suggestion for document"""
        # Create profile and document
        r = httpx.post(f"{API_URL}/api/profiles", json={"name": "Suggest Test", "nip": "111"})
        profile_id = r.json()["id"]
        
        # Create document with keywords that should trigger categorization
        r = httpx.post(f"{API_URL}/api/profiles/{profile_id}/documents", json={
            "type": "invoice",
            "number": "HOSTING-001",
            "contractor": "Cloud Hosting Provider",
            "amount": 500,
            "description": "Hosting serwera VPS"
        })
        doc_id = r.json()["id"]
        
        # Get suggestion
        r = httpx.post(f"{API_URL}/api/profiles/{profile_id}/documents/{doc_id}/suggest")
        assert r.status_code == 200
        data = r.json()
        assert "category" in data
        assert "confidence" in data
        # Should suggest "hosting" based on keywords
        assert data["category"] == "hosting"
        
        # Cleanup
        httpx.delete(f"{API_URL}/api/profiles/{profile_id}")
    
    def test_categorize_document(self):
        """Can apply category to document"""
        # Create profile and document
        r = httpx.post(f"{API_URL}/api/profiles", json={"name": "Cat Test", "nip": "222"})
        profile_id = r.json()["id"]
        
        r = httpx.post(f"{API_URL}/api/profiles/{profile_id}/documents", json={
            "type": "invoice",
            "number": "CAT-001",
            "contractor": "Supplier",
            "amount": 1000
        })
        doc_id = r.json()["id"]
        
        # Apply category
        r = httpx.post(f"{API_URL}/api/profiles/{profile_id}/documents/{doc_id}/categorize", 
                      json={"category": "oprogramowanie"})
        assert r.status_code == 200
        assert r.json()["category"] == "oprogramowanie"
        
        # Cleanup
        httpx.delete(f"{API_URL}/api/profiles/{profile_id}")
    
    def test_export_wfirma(self):
        """Can export documents to wFirma CSV format"""
        # Create profile with documents
        r = httpx.post(f"{API_URL}/api/profiles", json={"name": "Export Test", "nip": "9876543210"})
        profile_id = r.json()["id"]
        
        # Create signed document
        r = httpx.post(f"{API_URL}/api/profiles/{profile_id}/documents", json={
            "type": "invoice",
            "number": "EXP-001",
            "contractor": "Export Supplier",
            "contractor_nip": "1234567890",
            "amount": 1230,
            "status": "signed",
            "category": "uslugi"
        })
        doc_id = r.json()["id"]
        
        # Export to wFirma
        r = httpx.post(f"{API_URL}/api/profiles/{profile_id}/export/wfirma", 
                      json={"document_ids": [doc_id]})
        assert r.status_code == 200
        data = r.json()
        assert data["success"] == True
        assert data["format"] == "wfirma"
        assert data["count"] == 1
        assert "content" in data  # CSV content
        assert "EXP-001" in data["content"]
        
        # Cleanup
        httpx.delete(f"{API_URL}/api/profiles/{profile_id}")
    
    def test_export_jpk_pkpir(self):
        """Can export documents to JPK_PKPIR XML format"""
        # Create profile with documents
        r = httpx.post(f"{API_URL}/api/profiles", json={"name": "JPK Test", "nip": "5555555555"})
        profile_id = r.json()["id"]
        
        # Create signed document
        r = httpx.post(f"{API_URL}/api/profiles/{profile_id}/documents", json={
            "type": "invoice",
            "number": "JPK-001",
            "contractor": "JPK Supplier",
            "amount": 500,
            "status": "signed"
        })
        doc_id = r.json()["id"]
        
        # Export to JPK_PKPIR
        r = httpx.post(f"{API_URL}/api/profiles/{profile_id}/export/jpk_pkpir",
                      json={"document_ids": [doc_id]})
        assert r.status_code == 200
        data = r.json()
        assert data["success"] == True
        assert data["format"] == "jpk_pkpir"
        assert "<?xml" in data["content"]
        assert "JPK_PKPIR" in data["content"]
        
        # Cleanup
        httpx.delete(f"{API_URL}/api/profiles/{profile_id}")
    
    def test_list_adapters(self):
        """Can list available adapters"""
        r = httpx.get(f"{API_URL}/api/adapters")
        assert r.status_code == 200
        data = r.json()
        assert "adapters" in data
        # Should have at least the export adapters
        assert len(data["adapters"]) > 0
    
    def test_ocr_mock_processing(self):
        """Can process document with mock OCR"""
        # Create profile and document
        r = httpx.post(f"{API_URL}/api/profiles", json={"name": "OCR Test", "nip": "333"})
        profile_id = r.json()["id"]
        
        r = httpx.post(f"{API_URL}/api/profiles/{profile_id}/documents", json={
            "type": "invoice",
            "number": "",
            "contractor": "Unknown",
            "amount": 0
        })
        doc_id = r.json()["id"]
        
        # Process with mock OCR
        r = httpx.post(f"{API_URL}/api/profiles/{profile_id}/documents/{doc_id}/ocr",
                      json={"provider": "ocr_mock"})
        assert r.status_code == 200
        data = r.json()
        
        # Should have extracted data from mock OCR
        assert data["number"] == "FV/2026/01/001"
        assert data["amount"] == 1230.00
        assert "ocr_data" in data
        assert data["ocr_confidence"] == 85
        
        # Cleanup
        httpx.delete(f"{API_URL}/api/profiles/{profile_id}")


# === UI Tests for New Features ===
class TestCategorizationUI:
    """UI tests for categorization feature (now in describe view)"""
    
    def test_describe_view_loads(self, page: Page):
        """Describe view loads with categorization section"""
        page.goto(APP_URL)
        page.locator(".nav-item:has-text('Opis')").click()
        expect(page.locator("h1:has-text('Opis i kategoryzacja')")).to_be_visible()
        # Check categorization section is present
        expect(page.locator("h3:has-text('Kategoryzacja wszystkich')")).to_be_visible()
    
    def test_export_file_view_loads(self, page: Page):
        """Export file view loads with format cards"""
        page.goto(APP_URL)
        page.locator(".nav-item:has-text('Eksport pliku')").click()
        expect(page.locator("h1:has-text('Eksport do pliku')")).to_be_visible()
        # Check export format cards are visible
        expect(page.locator(".card-title:has-text('wFirma CSV')")).to_be_visible()
        expect(page.locator(".card-title:has-text('JPK_PKPIR')")).to_be_visible()


class TestURLRouting:
    """UI tests for URL-based routing"""
    
    def test_navigation_updates_url(self, page: Page):
        """Navigation clicks update URL with view parameter"""
        page.goto(APP_URL)
        
        # Click on Opis (describe)
        page.locator(".nav-item:has-text('Opis')").click()
        page.wait_for_timeout(300)
        
        # Check URL contains view=describe
        assert "view=describe" in page.url
    
    def test_url_restores_view(self, page: Page):
        """Loading URL with view param restores correct view"""
        # Navigate directly to describe view via URL
        page.goto(f"{APP_URL}?view=describe")
        page.wait_for_timeout(500)
        
        # Check describe view is shown (now includes categorization)
        expect(page.locator("h1:has-text('Opis i kategoryzacja')")).to_be_visible()
    
    def test_browser_back_works(self, page: Page):
        """Browser back button restores previous view"""
        page.goto(APP_URL)
        
        # Navigate to create
        page.locator(".nav-item:has-text('Utwórz')").click()
        page.wait_for_timeout(300)
        expect(page.locator("h1:has-text('Utwórz dokument')")).to_be_visible()
        
        # Navigate to describe (includes categorization)
        page.locator(".nav-item:has-text('Opis')").click()
        page.wait_for_timeout(300)
        expect(page.locator("h1:has-text('Opis i kategoryzacja')")).to_be_visible()
        
        # Go back
        page.go_back()
        page.wait_for_timeout(300)
        
        # Should be on create view
        expect(page.locator("h1:has-text('Utwórz dokument')")).to_be_visible()
    
    def test_document_detail_view(self, page: Page):
        """Can navigate to document detail via click on row"""
        # First create a document via API
        r = httpx.post(f"{API_URL}/api/profiles/default/documents", json={
            "type": "invoice",
            "number": "FV/URL/001",
            "contractor": "URL Test",
            "amount": 999
        })
        doc_id = r.json()["id"]
        
        # Go to docs view first to load documents
        page.goto(APP_URL)
        page.wait_for_timeout(500)
        
        # Click on the document row to navigate to detail
        page.locator("tr:has-text('FV/URL/001')").first.click()
        page.wait_for_timeout(300)
        
        # Check document detail view is shown
        expect(page.locator("h1:has-text('Szczegóły dokumentu')")).to_be_visible()
        
        # Check URL contains id param
        assert f"id={doc_id}" in page.url
        assert "view=doc" in page.url
        
        # Cleanup
        httpx.delete(f"{API_URL}/api/profiles/default/documents/{doc_id}")


class TestFileUpload:
    """Tests for file upload functionality"""
    
    def test_upload_file(self):
        """Can upload file and process with OCR"""
        # Create profile
        r = httpx.post(f"{API_URL}/api/profiles", json={"name": "Upload Test", "nip": "444"})
        profile_id = r.json()["id"]
        
        # Create a test file (simple text simulating PDF)
        test_content = b"Faktura VAT FV/2026/01/TEST\nNIP: 1234567890\nKwota: 1000.00 PLN"
        files = {"file": ("test_invoice.pdf", test_content, "application/pdf")}
        
        # Upload file
        r = httpx.post(f"{API_URL}/api/profiles/{profile_id}/upload", files=files)
        assert r.status_code == 200
        data = r.json()
        
        assert data["source"] == "upload"
        assert data["attachment_filename"] == "test_invoice.pdf"
        assert "ocr_data" in data
        # Mock OCR should have processed it
        assert data["ocr_confidence"] == 85
        
        # Cleanup
        httpx.delete(f"{API_URL}/api/profiles/{profile_id}")


@pytest.fixture(scope="session")
def browser_context_args():
    return {"viewport": {"width": 1280, "height": 720}}
