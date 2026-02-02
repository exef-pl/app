"""EXEF Signature API Tests"""
import pytest
import httpx
import time
from playwright.async_api import Page, expect

API_URL = "http://backend:8000"
APP_URL = "http://frontend:80"

class TestSignatureAPI:
    """Tests for electronic signature API"""
    
    @pytest.fixture(autouse=True)
    async def setup_profile(self):
        """Create test profile and cleanup after"""
        # Create profile
        r = await httpx.post(f"{API_URL}/api/profiles", json={
            "name": "Signature Test Profile",
            "nip": "999888777"
        })
        self.profile_id = r.json()["id"]
        
        # Create test document
        r = await httpx.post(f"{API_URL}/api/profiles/{self.profile_id}/documents", json={
            "type": "invoice",
            "number": "SIG-001",
            "contractor": "Test Contractor",
            "amount": 1000,
            "status": "described"
        })
        self.document_id = r.json()["id"]
        
        yield
        
        # Cleanup
        await httpx.delete(f"{API_URL}/api/profiles/{self.profile_id}")
    
    async def test_get_certificates(self):
        """Should return available certificates"""
        r = await httpx.get(f"{API_URL}/api/profiles/{self.profile_id}/signature/certificates")
        assert r.status_code == 200
        data = r.json()
        assert data["success"] == True
        assert "certificates" in data
        assert len(data["certificates"]) > 0
        assert data["provider"] == "mock"  # Default provider
    
    async def test_sign_single_document(self):
        """Should sign a single document"""
        r = await httpx.post(f"{API_URL}/api/profiles/{self.profile_id}/signature/sign", json={
            "document_ids": [self.document_id],
            "signature_type": "QES",
            "signature_format": "PADES",
            "signature_level": "T"
        })
        assert r.status_code == 200
        result = r.json()
        assert result["success"] == True
        assert result["total"] == 1
        assert result["signed"] == 1
        assert len(result["results"]) == 1
        assert result["results"][0]["success"] == True
        assert "signature_id" in result["results"][0]
        assert "signer" in result["results"][0]
    
    async def test_sign_multiple_documents(self):
        """Should sign multiple documents"""
        # Create second document
        r = await httpx.post(f"{API_URL}/api/profiles/{self.profile_id}/documents", json={
            "type": "invoice",
            "number": "SIG-002",
            "contractor": "Test Contractor 2",
            "amount": 2000,
            "status": "described"
        })
        doc2_id = r.json()["id"]
        
        # Sign both documents
        r = await httpx.post(f"{API_URL}/api/profiles/{self.profile_id}/signature/sign", json={
            "document_ids": [self.document_id, doc2_id],
            "signature_type": "QES",
            "signature_format": "PADES",
            "signature_level": "T"
        })
        assert r.status_code == 200
        result = r.json()
        assert result["success"] == True
        assert result["total"] == 2
        assert result["signed"] == 2
    
    async def test_sign_with_seal(self):
        """Should sign with qualified seal"""
        r = await httpx.post(f"{API_URL}/api/profiles/{self.profile_id}/signature/sign", json={
            "document_ids": [self.document_id],
            "signature_type": "QSEAL",
            "signature_format": "XADES",
            "signature_level": "LT"
        })
        assert r.status_code == 200
        result = r.json()
        assert result["signature_type"] == "QSEAL"
        assert result["format"] == "XADES"
        assert result["level"] == "LT"
    
    async def test_sign_nonexistent_document(self):
        """Should fail for non-existent document"""
        r = await httpx.post(f"{API_URL}/api/profiles/{self.profile_id}/signature/sign", json={
            "document_ids": ["nonexistent-id"],
            "signature_type": "QES",
            "signature_format": "PADES",
            "signature_level": "T"
        })
        assert r.status_code == 404
    
    async def test_verify_signature(self):
        """Should verify document signature"""
        # First sign the document
        r = await httpx.post(f"{API_URL}/api/profiles/{self.profile_id}/signature/sign", json={
            "document_ids": [self.document_id],
            "signature_type": "QES",
            "signature_format": "PADES",
            "signature_level": "T"
        })
        
        # Then verify it
        r = await httpx.post(f"{API_URL}/api/profiles/{self.profile_id}/signature/verify", json={
            "document_id": self.document_id
        })
        assert r.status_code == 200
        result = r.json()
        assert result["document_id"] == self.document_id
        assert result["valid"] == True
        assert "signatures" in result
        assert len(result["signatures"]) > 0
    
    async def test_verify_unsigned_document(self):
        """Should return error for unsigned document"""
        r = await httpx.post(f"{API_URL}/api/profiles/{self.profile_id}/signature/verify", json={
            "document_id": self.document_id
        })
        assert r.status_code == 200
        result = r.json()
        assert result["valid"] == False
        assert "error" in result
    
    async def test_add_timestamp(self):
        """Should add timestamp to document"""
        r = await httpx.post(f"{API_URL}/api/profiles/{self.profile_id}/signature/timestamp", json={
            "document_id": self.document_id
        })
        assert r.status_code == 200
        result = r.json()
        assert result["document_id"] == self.document_id
        assert result["success"] == True
        assert "timestamp" in result
        assert "tsa" in result
    
    async def test_document_status_after_signing(self):
        """Document status should change to 'signed' after signing"""
        # Sign document
        await httpx.post(f"{API_URL}/api/profiles/{self.profile_id}/signature/sign", json={
            "document_ids": [self.document_id],
            "signature_type": "QES",
            "signature_format": "PADES",
            "signature_level": "T"
        })
        
        # Check document status
        r = await httpx.get(f"{API_URL}/api/profiles/{self.profile_id}/documents/{self.document_id}")
        assert r.status_code == 200
        doc = r.json()
        assert doc["status"] == "signed"
        assert "signature_id" in doc
        assert "signature_data" in doc


class TestSignatureUI:
    """UI tests for signature functionality"""
    
    async def test_navigate_to_signature_view(self, page: Page):
        """Should navigate to signature view"""
        await page.goto(APP_URL)
        
        # Navigate to signature view
        await page.locator(".nav-item:has-text('Podpisz')").click()
        time.sleep(0.3)
        
        await expect(page.locator("h1:has-text('Podpis Elektroniczny')")).to_be_visible()
        await expect(page.locator("h3:has-text('Dostępne certyfikaty')")).to_be_visible()
        await expect(page.locator("h3:has-text('Konfiguracja podpisu')")).to_be_visible()
    
    async def test_signature_provider_selection(self, page: Page):
        """Should select signature provider"""
        await page.goto(APP_URL + "?view=sign")
        time.sleep(0.3)
        
        # Select different provider
        await page.select_option("select", "mobywatel")
        
        # Check provider info updates
        await expect(page.locator("text=Bezpłatny - 5 podpisów/miesiąc")).to_be_visible()
    
    async def test_signature_configuration(self, page: Page):
        """Should configure signature parameters"""
        await page.goto(APP_URL + "?view=sign")
        time.sleep(0.3)
        
        # Change signature type
        await page.select_option("select[placeholder*='Typ podpisu']", "QSEAL")
        
        # Change format
        await page.select_option("select[placeholder*='Format']", "XADES")
        
        # Change level
        await page.select_option("select[placeholder*='Poziom']", "LT")
        
        # Values should be selected
        await expect(page.locator("select[placeholder*='Typ podpisu']")).to_have_value("QSEAL")
        await expect(page.locator("select[placeholder*='Format']")).to_have_value("XADES")
        await expect(page.locator("select[placeholder*='Poziom']")).to_have_value("LT")
    
    async def test_sign_documents_flow(self, page: Page):
        """Should complete document signing flow"""
        # First go to documents and select some
        await page.goto(APP_URL + "?view=docs")
        time.sleep(0.3)
        
        # Select a document
        await page.locator("input[type='checkbox']").first().check()
        
        # Click electronic signature button
        await page.locator("button:has-text('Podpis elektroniczny')").click()
        time.sleep(0.3)
        
        # Should be in signature view with selected documents
        await expect(page.locator("h1:has-text('Podpis Elektroniczny')")).to_be_visible()
        await expect(page.locator("text=Wybrano: 1 dokumentów")).to_be_visible()
        
        # Click sign button
        await page.locator("button:has-text('Podpisz wybrane')").click()
        time.sleep(2)  # Wait for signing to complete
        
        # Should show results
        await expect(page.locator("text=Podpisany")).to_be_visible()
        await expect(page.locator("th:has-text('ID podpisu')")).to_be_visible()
