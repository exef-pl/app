"""EXEF E2E Tests with Playwright"""
import pytest
from playwright.sync_api import Page, expect
import httpx
import time

API_URL = "http://backend:8000"
APP_URL = "http://frontend:80"

# === API Tests ===
class TestAPI:
    def test_health(self):
        r = httpx.get(f"{API_URL}/health")
        assert r.status_code == 200
        assert r.json()["status"] == "ok"
    
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
        
        # Send webhook
        r = httpx.post(f"{API_URL}/api/webhook/receive/{ep_id}", json={
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
        expect(page.locator("text=EXEF")).to_be_visible()
    
    def test_navigation(self, page: Page):
        page.goto(APP_URL)
        
        # Navigate to Create
        page.click("text=Utwórz")
        expect(page.locator("text=Utwórz dokument")).to_be_visible()
        
        # Navigate to Import
        page.click("text=Import")
        expect(page.locator("text=Dodaj źródło")).to_be_visible()
        
        # Navigate to Export
        page.click("text=Export")
        expect(page.locator("text=Dodaj cel")).to_be_visible()
        
        # Navigate back to Documents
        page.click("text=Zarządzanie")
        expect(page.locator("text=Dokumenty")).to_be_visible()
    
    def test_create_document_ui(self, page: Page):
        page.goto(APP_URL)
        
        # Go to create view
        page.click("text=Utwórz")
        
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
        expect(page.locator("text=Dodaj endpoint")).to_be_visible()
        
        # Fill form
        page.fill("input[placeholder='np. Skrzynka faktur']", "UI Test Import")
        
        # Submit
        page.click("button:has-text('Dodaj')")
        
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
        
        # 2. Simulate external system sending document
        r = httpx.post(f"{API_URL}/api/webhook/receive/{import_ep_id}", json={
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


@pytest.fixture(scope="session")
def browser_context_args():
    return {"viewport": {"width": 1280, "height": 720}}
