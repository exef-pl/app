"""EXEF E2E GUI Tests for All Views - Comprehensive UI Testing"""
import pytest
from playwright.sync_api import Page, expect
import httpx
import time

API_URL = "http://backend:8000"
APP_URL = "http://frontend:80"


class TestAllViewsGUI:
    """Comprehensive GUI tests for all application views"""
    
    async def setup_test_data(self):
        """Create test data for tests"""
        async with httpx.AsyncClient() as client:
            # Create test profile
            await client.post(f"{API_URL}/api/profiles", json={
                "name": "Test Profile",
                "nip": "1234567890"
            })
            
            # Create test document
            await client.post(f"{API_URL}/api/profiles/default/documents", json={
                "type": "invoice",
                "number": "TEST/001",
                "contractor": "Test Contractor",
                "amount": 1000,
                "status": "created"
            })
    
    async def setup_page(self, page: Page):
        """Setup page for tests"""
        await page.goto(APP_URL)
        time.sleep(0.5)
        # Wait for Alpine to initialize
        await expect(page.locator(".app")).to_be_visible()
    
    async def test_profiles_view_loads(self, page: Page):
        """Profiles view loads and displays correctly"""
        await self.setup_test_data()
        await self.setup_page(page)
        
        # Navigate to profiles
        await page.locator(".nav-group:has-text('Profile') .nav-item:has-text('Zarządzanie')").click()
        time.sleep(0.3)
        
        # Check main elements
        await expect(page.locator("h1:has-text('Profile')")).to_be_visible()
        await expect(page.locator(".view-toggle")).to_be_visible()
        await expect(page.locator("button:has-text('Nowy profil')")).to_be_visible()
        
        # Wait for profiles to load
        await page.wait_for_selector(".cards .card, table tbody tr", timeout=5000)
        
        # Check for profiles (cards or table)
        await expect(page.locator(".cards, table")).to_be_visible()
        
        # Test view toggle
        await page.locator(".view-toggle button:has-text('Tabela')").click()
        time.sleep(0.2)
        await expect(page.locator("table")).to_be_visible()
        
        await page.locator(".view-toggle button:has-text('Karty')").click()
        time.sleep(0.2)
        await expect(page.locator(".cards")).to_be_visible()
    
    async def test_documents_view_loads(self, page: Page):
        """Documents view loads and displays correctly"""
        # Navigate to documents
        await page.locator(".nav-group:has-text('Dokumenty') .nav-item:has-text('Zarządzanie')").click()
        time.sleep(0.3)
        
        # Check main elements
        await expect(page.locator("h1:has-text('Dokumenty')")).to_be_visible()
        await expect(page.locator(".view-toggle")).to_be_visible()
        await expect(page.locator("button:has-text('Nowy dokument')")).to_be_visible()
        
        # Check filters
        await expect(page.locator("input[placeholder='Numer lub kontrahent']")).to_be_visible()
        await expect(page.locator("select:has-text('Wszystkie')")).to_have_count(2)  # Status and Type filters
        
        # Test view toggle
        await page.locator(".view-toggle button:has-text('Karty')").click()
        time.sleep(0.2)
        # Cards might be hidden if no documents, but the container exists
        await expect(page.locator(".cards")).to_be_attached()
        
        await page.locator(".view-toggle button:has-text('Tabela')").click()
        time.sleep(0.2)
        await expect(page.locator("table")).to_be_visible()
    
    async def test_create_view_loads(self, page: Page):
        """Create document view loads"""
        await page.locator(".nav-item:has-text('Utwórz')").click()
        time.sleep(0.3)
        
        # Check if view loaded
        await expect(page.locator("h1")).to_be_visible()
        # View exists (may be placeholder or actual content)
        await expect(page.locator(".card, .empty")).to_be_visible()
    
    async def test_describe_view_loads(self, page: Page):
        """Describe view loads"""
        await page.locator(".nav-item:has-text('Opisz')").click()
        time.sleep(0.3)
        
        # Check if view loaded (may be placeholder or actual content)
        await expect(page.locator("h1")).to_be_visible()
        # View exists even if it's placeholder
        await expect(page.locator(".card, .empty")).to_be_visible()
    
    async def test_sign_view_loads(self, page: Page):
        """Sign view loads"""
        await page.locator(".nav-item:has-text('Podpisz')").click()
        time.sleep(0.3)
        
        await expect(page.locator("h1:has-text('Podpis Elektroniczny')")).to_be_visible()
        # Check for signature view elements
        await expect(page.locator("h3:has-text('Dostępne certyfikaty')")).to_be_visible()
        await expect(page.locator("h3:has-text('Konfiguracja podpisu')")).to_be_visible()
    
    async def test_upload_view_loads(self, page: Page):
        """Upload view loads"""
        await page.locator(".nav-item:has-text('Wgraj plik')").click()
        time.sleep(0.3)
        
        # Check if view loaded
        await expect(page.locator("h1")).to_be_visible()
        await expect(page.locator(".card, .empty")).to_be_visible()
    
    async def test_import_view_loads(self, page: Page):
        """Import view loads"""
        await page.locator(".nav-item:has-text('Import')").click()
        time.sleep(0.3)
        
        # Check if view loaded
        await expect(page.locator("h1")).to_be_visible()
        await expect(page.locator(".card, .empty")).to_be_visible()
    
    async def test_export_view_loads(self, page: Page):
        """Export view loads"""
        await page.locator(".nav-item:has-text('Export')").click()
        time.sleep(0.3)
        
        # Check if view loaded
        await expect(page.locator("h1")).to_be_visible()
        await expect(page.locator(".card, .empty")).to_be_visible()
    
    async def test_export_file_view_loads(self, page: Page):
        """Export file view loads"""
        await page.locator(".nav-item:has-text('Eksport pliku')").click()
        time.sleep(0.3)
        
        # Check if view loaded
        await expect(page.locator("h1")).to_be_visible()
        await expect(page.locator(".card, .empty")).to_be_visible()
    
    async def test_navigation_between_views(self, page: Page):
        """Test smooth navigation between different views"""
        views = [
            (".nav-group:has-text('Profile') .nav-item:has-text('Zarządzanie')"),
            (".nav-group:has-text('Dokumenty') .nav-item:has-text('Zarządzanie')"),
            (".nav-item:has-text('Utwórz')"),
            (".nav-item:has-text('Opisz')"),
            (".nav-item:has-text('Podpisz')"),
            (".nav-item:has-text('Wgraj plik')"),
            (".nav-item:has-text('Import')"),
            (".nav-item:has-text('Export')"),
        ]
        
        for selector in views:
            await page.locator(selector).click()
            time.sleep(0.3)
            # Just check that h1 exists (don't check specific text)
            await expect(page.locator("h1")).to_be_visible()
    
    async def test_sidebar_navigation(self, page: Page):
        """Test sidebar navigation is functional"""
        # Check all navigation groups are present
        await expect(page.locator(".nav-group:has-text('Profile')")).to_be_visible()
        await expect(page.locator(".nav-group:has-text('Dokumenty')")).to_be_visible()
        await expect(page.locator(".nav-group:has-text('Transfer')")).to_be_visible()
        
        # Check version info
        await expect(page.locator(".version:has-text('EXEF v1.2.0')")).to_be_visible()
    
    async def test_profile_selector_functionality(self, page: Page):
        """Test profile selector dropdown works"""
        # Click profile selector
        await page.click(".profile-selector")
        time.sleep(0.3)
        
        # Dropdown should be visible
        await expect(page.locator(".profile-dropdown")).to_be_visible()
        
        # Should have default profile
        await expect(page.locator(".profile-dropdown .profile-option").first).to_be_visible()
        
        # Should have "Add profile" option
        await expect(page.locator(".profile-option:has-text('Dodaj profil')")).to_be_visible()
        
        # Click outside to close
        await page.click(".sidebar")
        time.sleep(0.2)
        await expect(page.locator(".profile-dropdown")).not_to_be_visible()
    
    async def test_responsive_layout(self, page: Page):
        """Test layout is responsive"""
        # Test desktop size
        await page.set_viewport_size({"width": 1200, "height": 800})
        await expect(page.locator(".sidebar")).to_be_visible()
        await expect(page.locator(".main")).to_be_visible()
        
        # Test tablet size
        await page.set_viewport_size({"width": 768, "height": 1024})
        await expect(page.locator(".sidebar")).to_be_visible()
        await expect(page.locator(".main")).to_be_visible()
        
        # Test mobile size
        await page.set_viewport_size({"width": 375, "height": 667})
        await expect(page.locator(".sidebar")).to_be_visible()
        await expect(page.locator(".main")).to_be_visible()
    
    async def test_url_parameters(self, page: Page):
        """Test URL parameters work correctly"""
        # Test direct navigation with view parameter
        await page.goto(f"{APP_URL}?view=profiles")
        time.sleep(0.5)
        await expect(page.locator("h1:has-text('Profile')")).to_be_visible()
        
        await page.goto(f"{APP_URL}?view=docs")
        time.sleep(0.5)
        await expect(page.locator("h1:has-text('Dokumenty')")).to_be_visible()
        
        # Test profile parameter
        await page.goto(f"{APP_URL}?view=docs&profile=default")
        time.sleep(0.5)
        await expect(page.locator("h1:has-text('Dokumenty')")).to_be_visible()
    
    async def test_badges_and_counts(self, page: Page):
        """Test badges and counts display correctly"""
        # Navigate to documents view to see badges
        await page.locator(".nav-group:has-text('Dokumenty') .nav-item:has-text('Zarządzanie')").click()
        time.sleep(0.3)
        
        # Document count badge should be visible
        await expect(page.locator(".nav-item:has-text('Zarządzanie') .badge")).to_be_visible()
        
        # Check other badges in Transfer section
        await expect(page.locator(".nav-item:has-text('Import') .badge")).to_be_visible()
        await expect(page.locator(".nav-item:has-text('Export') .badge")).to_be_visible()


class TestViewSpecificFeatures:
    """Test specific features in each view"""
    
    async def test_profiles_crud_operations(self, page: Page):
        """Test CRUD operations in profiles view"""
        await page.goto(APP_URL)
        await page.locator(".nav-group:has-text('Profile') .nav-item:has-text('Zarządzanie')").click()
        time.sleep(0.5)
        
        # Wait for profiles to load
        await page.wait_for_selector(".cards .card, table tbody tr", timeout=5000)
        
        # Create new profile
        await page.locator("button:has-text('Nowy profil')").click()
        time.sleep(0.5)
        
        # Wait for form and fill it
        await page.wait_for_selector("input[placeholder*='Firma']", timeout=5000)
        await page.fill("input[placeholder*='Firma']", "Test CRUD Profile")
        await page.fill("input[placeholder='1234567890']", "9876543210")
        await page.click("button:has-text('Utwórz')")
        time.sleep(0.5)
        
        # Verify profile created
        await expect(page.locator(".card-title:has-text('Test CRUD Profile')")).to_be_visible()
        
        # Edit profile
        await page.locator(".card-footer button[title='Edytuj']").first.click()
        time.sleep(0.3)
        await page.fill("input[placeholder='Moja Firma Sp. z o.o.']", "Test CRUD Profile Edited")
        await page.click("button:has-text('✓')")
        time.sleep(0.3)
        
        # Verify edited
        await expect(page.locator(".card-title:has-text('Test CRUD Profile Edited')")).to_be_visible()
        
        # Cleanup via API
        r = httpx.get(f"{API_URL}/api/profiles")
        profile = next((p for p in r.json() if "Test CRUD" in p["name"]), None)
        if profile:
            httpx.delete(f"{API_URL}/api/profiles/{profile['id']}")
    
    async def test_documents_filters(self, page: Page):
        """Test document filtering functionality"""
        await page.goto(APP_URL)
        await page.locator(".nav-group:has-text('Dokumenty') .nav-item:has-text('Zarządzanie')").click()
        time.sleep(0.3)
        
        # Test search filter
        search_input = await page.locator("input[placeholder='Numer lub kontrahent']")
        search_input.fill("test")
        time.sleep(0.3)
        
        # Test status filter
        status_select = await page.locator("select").first
        status_select.select_option("created")
        time.sleep(0.3)
        
        # Test type filter
        type_select = await page.locator("select").nth(1)
        type_select.select_option("invoice")
        time.sleep(0.3)
        
        # Clear filters
        search_input.fill("")
        status_select.select_option("")
        type_select.select_option("")
        time.sleep(0.3)
    
    async def test_bulk_actions(self, page: Page):
        """Test bulk actions in documents view"""
        await page.goto(APP_URL)
        await page.locator(".nav-group:has-text('Dokumenty') .nav-item:has-text('Zarządzanie')").click()
        time.sleep(0.3)
        
        # Switch to table view for bulk actions
        await page.locator(".view-toggle button:has-text('Tabela')").click()
        time.sleep(0.3)
        
        # Look for bulk action bar (should appear when items selected)
        # Note: This test verifies the UI elements exist, actual selection would need documents
        await expect(page.locator("table")).to_be_visible()
        await expect(page.locator("th input[type='checkbox']")).to_be_visible()


class TestErrorHandling:
    """Test error handling in various views"""
    
    async def test_404_handling(self, page: Page):
        """Test 404 error handling"""
        await page.goto(f"{APP_URL}?view=nonexistent")
        time.sleep(0.5)
        
        # Should show some kind of error or fall back to default view
        await expect(page.locator(".app")).to_be_visible()
        # Should show default view or error message
        await expect(page.locator("h1")).to_be_visible()
    
    async def test_network_error_handling(self, page: Page):
        """Test handling of network errors"""
        # Navigate to documents view
        await page.goto(APP_URL)
        await page.locator(".nav-group:has-text('Dokumenty') .nav-item:has-text('Zarządzanie')").click()
        time.sleep(0.3)
        
        # Simulate network offline
        await page.context.set_offline(True)
        
        # Try to perform an action that requires network - expect it to fail
        try:
            await page.reload(timeout=5000)
        except Exception:
            # Expected to fail when offline
            pass
        time.sleep(0.5)
        
        # Should still show the UI, possibly with error indicators
        await expect(page.locator(".app")).to_be_visible()
        
        # Restore network
        await page.context.set_offline(False)
