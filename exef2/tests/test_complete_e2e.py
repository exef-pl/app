"""EXEF Complete E2E Tests with Mock Services
Tests all major functionality:
- Profile management
- Document workflow
- Delegation system
- Electronic signature
- Import/Export endpoints
"""

import asyncio
import httpx
import json
import time
from datetime import datetime
from playwright.async_api import Page, expect
import pytest

API_URL = "http://backend:8000"
APP_URL = "http://frontend:80"
MOCK_URL = "http://mock-services:8888"

class TestCompleteWorkflow:
    """Complete E2E workflow tests"""
    
    async def setup_test_environment(self):
        """Setup test environment with mock data"""
        # Reset mock services
        async with httpx.AsyncClient() as client:
            await client.get(f"{MOCK_URL}/reset")
        
        # Create test profile
        async with httpx.AsyncClient() as client:
            r = await client.post(f"{API_URL}/api/profiles", json={
                "name": "Firma Testowa E2E",
                "nip": "9876554433",
                "address": "ul. Testowa 123, 00-999 Testowo"
            })
            self.profile_id = r.json()["id"]
            
            # Create test documents
            self.documents = []
            for i in range(3):
                r = await client.post(f"{API_URL}/api/profiles/{self.profile_id}/documents", json={
                    "type": "invoice",
                    "number": f"FV/2024/00{i+1}",
                    "contractor": f"Kontrahent {i+1}",
                    "contractor_nip": f"123456789{i}",
                    "amount": 1000 * (i + 1),
                    "status": "created"
                })
                self.documents.append(r.json())
            
            # Create delegates
            self.delegates = []
            for i in range(2):
                r = await client.post(f"{API_URL}/api/profiles/{self.profile_id}/delegates", json={
                    "delegate_name": f"Użytkownik {i+1}",
                    "delegate_email": f"user{i+1}@test.pl",
                    "delegate_nip": f"98700000{i}2",
                    "role": "admin" if i == 0 else "editor"
                })
                self.delegates.append(r.json())
    
    async def cleanup_test_environment(self):
        """Cleanup test data"""
        async with httpx.AsyncClient() as client:
            await client.delete(f"{API_URL}/api/profiles/{self.profile_id}")
    
    @pytest.fixture(autouse=True)
    async def setup(self):
        """Setup and cleanup for each test"""
        await self.setup_test_environment()
        yield
        await self.cleanup_test_environment()
    
    async def test_complete_document_workflow(self, page: Page):
        """Test complete document workflow: create -> describe -> sign -> export"""
        
        # 1. Navigate to documents view
        await page.goto(APP_URL)
        await page.locator(".nav-item:has-text('Zarządzanie')").click()
        time.sleep(0.5)
        
        # Verify documents are loaded
        await expect(page.locator("table tbody tr")).to_have_count(3)
        
        # 2. Select documents and update status to 'described'
        await page.locator("input[type='checkbox']").first().check()
        await page.locator("input[type='checkbox']").nth(1).check()
        await page.locator("button:has-text('Opisz')").click()
        time.sleep(0.5)
        
        # Verify status updated
        await page.reload()
        await expect(page.locator("tbody tr:has-text('Opisane')")).to_have_count(2)
        
        # 3. Navigate to signature view
        await page.locator(".nav-item:has-text('Podpisz')").click()
        time.sleep(0.5)
        
        # 4. Configure signature
        await page.select_option("select[placeholder*='Typ podpisu']", "QES")
        await page.select_option("select[placeholder*='Format']", "PADES")
        await page.select_option("select[placeholder*='Poziom']", "T")
        
        # 5. Sign documents
        await page.locator("button:has-text('Podpisz wybrane')").click()
        time.sleep(3)  # Wait for signing
        
        # Verify signing results
        await expect(page.locator("text=Podpisany")).to_be_visible()
        await expect(page.locator("th:has-text('ID podpisu')")).to_be_visible()
        
        # 6. Verify documents are signed
        await page.locator(".nav-item:has-text('Zarządzanie')").click()
        time.sleep(0.5)
        await expect(page.locator("tbody tr:has-text('Podpisane')")).to_have_count(2)
        
        # 7. Create export endpoint
        await page.locator(".nav-item:has-text('Export')").click()
        time.sleep(0.5)
        
        # Mock export endpoint creation
        async with httpx.AsyncClient() as client:
            await client.post(f"{API_URL}/api/profiles/{self.profile_id}/endpoints", json={
                "name": "Test Export",
                "type": "export",
                "direction": "out",
                "config": {
                    "provider": "wfirma",
                    "api_key": "test-key"
                }
            })
        
        # Export documents
        await page.reload()
        await page.locator("button:has-text('Eksportuj')").click()
        time.sleep(1)
        
        # Verify export success
        await expect(page.locator(".toast:has-text('Wyeksportowano')")).to_be_visible()
    
    async def test_profile_delegation_workflow(self, page: Page):
        """Test profile delegation management"""
        
        # 1. Navigate to profiles
        await page.goto(APP_URL)
        await page.locator(".nav-item:has-text('Profile')").click()
        time.sleep(0.5)
        
        # 2. Switch to table view
        await page.locator("button:has-text('Tabela')").click()
        time.sleep(0.3)
        
        # 3. Expand profile to see delegates
        await page.locator("tbody tr").first().click()
        time.sleep(0.5)
        
        # 4. Verify delegates are visible
        await expect(page.locator("text=Uprawnienia do profilu")).to_be_visible()
        await expect(page.locator("table:has-text('Użytkownik 1')")).to_be_visible()
        await expect(page.locator("table:has-text('Użytkownik 2')")).to_be_visible()
        
        # 5. Add new delegate
        await page.locator("button:has-text('Dodaj osobę')").click()
        time.sleep(0.3)
        
        # Fill delegate form
        await page.locator("input[placeholder='Nazwa']").fill("Nowy Delegat")
        await page.locator("input[placeholder='Email']").fill("delegat@test.pl")
        await page.locator("input[placeholder='NIP']").fill("5555555555")
        await page.locator("select").select_option("viewer")
        await page.locator("button:has-text('Dodaj')").click()
        time.sleep(0.5)
        
        # 6. Verify new delegate added
        await expect(page.locator("text=Nowy Delegat")).to_be_visible()
        
        # 7. Edit delegate role
        await page.locator("select:has-text('Podgląd')").select_option("admin")
        time.sleep(0.3)
        await expect(page.locator("select:has-text('Administrator')")).to_be_visible()
        
        # 8. Deactivate delegate
        await page.locator("button:has-text('Dezaktywuj')").first().click()
        time.sleep(0.3)
        await expect(page.locator("text=Nieaktywny")).to_be_visible()
    
    async def test_signature_provider_switching(self, page: Page):
        """Test switching between signature providers"""
        
        # Navigate to signature view
        await page.goto(APP_URL + "?view=sign")
        time.sleep(0.5)
        
        # Test each provider
        providers = [
            ("mock", "Dostawca testowy - symuluje podpis"),
            ("mszafir", "Podpis kwalifikowany - od 299 zł/rok"),
            ("simplysign", "Popularny w administracji"),
            ("mobywatel", "Bezpłatny - 5 podpisów/miesiąc")
        ]
        
        for provider_value, provider_desc in providers:
            await page.select_option("select", provider_value)
            time.sleep(0.3)
            await expect(page.locator(f"text={provider_desc}")).to_be_visible()
            
            # Load certificates
            await page.locator("button:has-text('Odśwież certyfikaty')").click()
            time.sleep(0.5)
            
            # Verify certificates are loaded
            await expect(page.locator("table:has-text('Jan Kowalski')")).to_be_visible()
    
    async def test_bulk_document_operations(self, page: Page):
        """Test bulk operations on documents"""
        
        # Navigate to documents
        await page.goto(APP_URL + "?view=docs")
        time.sleep(0.5)
        
        # Select all documents
        await page.locator("thead input[type='checkbox']").check()
        time.sleep(0.3)
        await expect(page.locator("text=Wybrano: 3 dokumentów")).to_be_visible()
        
        # Bulk update status
        await page.locator("button:has-text('Opisz')").click()
        time.sleep(0.5)
        
        # Verify all updated
        await page.reload()
        for i in range(3):
            await expect(page.locator(f"tbody tr:nth-child({i+1}) :has-text('Opisane')")).to_be_visible()
        
        # Bulk sign
        await page.locator("thead input[type='checkbox']").check()
        await page.locator("button:has-text('Podpis elektroniczny')").click()
        time.sleep(0.5)
        
        # In signature view
        await page.locator("button:has-text('Podpisz wybrane')").click()
        time.sleep(3)
        
        # Verify all signed
        await expect(page.locator("text=Pomyślnie podpisano 3 z 3 dokumentów")).to_be_visible()
    
    async def test_document_filters_and_search(self, page: Page):
        """Test document filtering and search"""
        
        # Navigate to documents
        await page.goto(APP_URL + "?view=docs")
        time.sleep(0.5)
        
        # Test status filter
        await page.select_option("select:has-text('Wszystkie')", "created")
        time.sleep(0.3)
        await expect(page.locator("tbody tr")).to_have_count(3)
        
        await page.select_option("select:has-text('Wszystkie')", "described")
        time.sleep(0.3)
        await expect(page.locator("tbody tr")).to_have_count(0)
        
        # Reset filter
        await page.select_option("select:has-text('Wszystkie')", "")
        time.sleep(0.3)
        
        # Test search
        await page.locator("input[placeholder='Numer lub kontrahent']").fill("Kontrahent 1")
        await page.locator("button:has-text('Opisz')").click()
        time.sleep(0.5)
        
        await expect(page.locator("tbody tr")).to_have_count(1)
        await expect(page.locator("text=Kontrahent 1")).to_be_visible()
    
    async def test_profile_switching(self, page: Page):
        """Test switching between profiles"""
        
        # Create second profile
        async with httpx.AsyncClient() as client:
            await client.post(f"{API_URL}/api/profiles", json={
                "name": "Druga Firma",
                "nip": "1122334455"
            })
        
        # Navigate to profiles
        await page.goto(APP_URL + "?view=profiles")
        time.sleep(0.5)
        
        # Switch profile
        await page.locator(".profile-selector").click()
        time.sleep(0.3)
        await page.locator(".profile-option:has-text('Druga Firma')").click()
        time.sleep(0.5)
        
        # Verify profile switched
        await expect(page.locator(".profile-current:has-text('Druga Firma')")).to_be_visible()
        
        # Check documents list is empty for new profile
        await page.locator(".nav-item:has-text('Zarządzanie')").click()
        time.sleep(0.5)
        await expect(page.locator("text=Brak dokumentów")).to_be_visible()
    
    async def test_error_handling(self, page: Page):
        """Test error handling in various scenarios"""
        
        # Test signing without documents
        await page.goto(APP_URL + "?view=sign")
        time.sleep(0.5)
        await page.locator("button:has-text('Podpisz wybrane')").click()
        time.sleep(0.3)
        await expect(page.locator(".toast:has-text('Wybierz dokumenty')")).to_be_visible()
        
        # Test invalid document operations
        await page.goto(APP_URL + "?view=docs")
        time.sleep(0.5)
        
        # Try to delete non-existent document (should show error)
        await page.evaluate("""
            async () => {
                const response = await fetch('/api/profiles/default/documents/nonexistent', {
                    method: 'DELETE'
                });
                return response.status;
            }
        """)
        
        # Test network error handling
        await page.route("**/api/**", lambda route: route.fulfill(status=500))
        await page.locator(".nav-item:has-text('Zarządzanie')").click()
        time.sleep(0.5)
        await expect(page.locator("text=Błąd ładowania dokumentów")).to_be_visible()


class TestMockServicesIntegration:
    """Test integration with mock services"""
    
    async def test_mock_ksef_integration(self):
        """Test KSeF mock service integration"""
        async with httpx.AsyncClient() as client:
            # Reset mock
            await client.get(f"{MOCK_URL}/reset")
            
            # Upload invoice to KSeF
            invoice_data = {
                "invoiceNumber": "TEST/2024/001",
                "issueDate": "2024-01-01",
                "seller": {
                    "name": "Test Seller",
                    "nip": "1234567890"
                }
            }
            
            response = await client.post(
                f"{MOCK_URL}/api/v1/oauth/token"
            )
            assert response.status_code == 200
            token = response.json()["access_token"]
            
            response = await client.post(
                f"{MOCK_URL}/api/v1/invoices",
                json=invoice_data,
                headers={"Authorization": f"Bearer {token}"}
            )
            assert response.status_code == 200
            assert "elementReferenceNumber" in response.json()
    
    async def test_mock_email_integration(self):
        """Test email mock service integration"""
        async with httpx.AsyncClient() as client:
            # Get folders
            response = await client.get(f"{MOCK_URL}/imap/folders")
            assert response.status_code == 200
            assert "INBOX" in response.json()["folders"]
            
            # Get messages
            response = await client.get(f"{MOCK_URL}/imap/messages")
            assert response.status_code == 200
            messages = response.json()["messages"]
            assert len(messages) > 0
            assert messages[0]["from"] == "faktura@example.com"
    
    async def test_mock_ocr_integration(self):
        """Test OCR mock service integration"""
        async with httpx.AsyncClient() as client:
            # Extract text from document
            response = await client.post(
                f"{MOCK_URL}/ocr/extract",
                json={
                    "document_type": "invoice",
                    "content": "base64encodedcontent"
                }
            )
            assert response.status_code == 200
            result = response.json()
            assert result["document_type"] == "invoice"
            assert "fields" in result
            assert result["fields"]["number"] == "FV/2024/001"
    
    async def test_mock_signature_integration(self):
        """Test signature mock service integration"""
        async with httpx.AsyncClient() as client:
            # Get certificates
            response = await client.post(
                f"{MOCK_URL}/signature/oauth/token"
            )
            token = response.json()["access_token"]
            
            response = await client.post(
                f"{MOCK_URL}/signature/certificates/list",
                headers={"Authorization": f"Bearer {token}"}
            )
            assert response.status_code == 200
            certs = response.json()["certificates"]
            assert len(certs) > 0
            assert certs[0]["subject"].startswith("CN=Jan Kowalski")


# Performance Tests
class TestPerformance:
    """Performance and load tests"""
    
    async def test_bulk_document_creation(self):
        """Test creating many documents"""
        async with httpx.AsyncClient() as client:
            # Create profile
            r = await client.post(f"{API_URL}/api/profiles", json={
                "name": "Performance Test",
                "nip": "9990000000"
            })
            profile_id = r.json()["id"]
            
            # Create 100 documents
            start_time = time.time()
            tasks = []
            
            for i in range(100):
                task = client.post(f"{API_URL}/api/profiles/{profile_id}/documents", json={
                    "type": "invoice",
                    "number": f"PERF/{i:03d}",
                    "contractor": f"Perf Contractor {i}",
                    "amount": 100 + i,
                    "status": "created"
                })
                tasks.append(task)
            
            # Execute in parallel
            results = await asyncio.gather(*tasks)
            end_time = time.time()
            
            # Verify all created
            assert all(r.status_code == 200 for r in results)
            assert end_time - start_time < 10  # Should complete in < 10 seconds
            
            # Cleanup
            await client.delete(f"{API_URL}/api/profiles/{profile_id}")
    
    async def test_concurrent_signature_operations(self):
        """Test concurrent signing operations"""
        async with httpx.AsyncClient() as client:
            # Setup
            r = await client.post(f"{API_URL}/api/profiles", json={
                "name": "Concurrent Test",
                "nip": "1111111111"
            })
            profile_id = r.json()["id"]
            
            # Create documents
            doc_ids = []
            for i in range(10):
                r = await client.post(f"{API_URL}/api/profiles/{profile_id}/documents", json={
                    "type": "invoice",
                    "number": f"CONC/{i:03d}",
                    "amount": 1000
                })
                doc_ids.append(r.json()["id"])
            
            # Sign all concurrently
            start_time = time.time()
            tasks = []
            
            for doc_id in doc_ids:
                task = client.post(
                    f"{API_URL}/api/profiles/{profile_id}/signature/sign",
                    json={
                        "document_ids": [doc_id],
                        "signature_type": "QES",
                        "signature_format": "PADES"
                    }
                )
                tasks.append(task)
            
            results = await asyncio.gather(*tasks)
            end_time = time.time()
            
            # Verify all signed
            assert all(r.status_code == 200 for r in results)
            assert end_time - start_time < 15  # Should complete in < 15 seconds
            
            # Cleanup
            await client.delete(f"{API_URL}/api/profiles/{profile_id}")
