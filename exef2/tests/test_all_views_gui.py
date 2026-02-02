"""EXEF E2E GUI Tests for All Views - Comprehensive UI Testing"""
import pytest
from playwright.sync_api import Page, expect
import httpx
import time

API_URL = "http://backend:8000"
APP_URL = "http://frontend:80"


class TestAllViewsGUI:
    """Comprehensive GUI tests for all application views"""
    
    @pytest.fixture(autouse=True)
    def setup(self, page: Page):
        """Setup for each test - navigate to app and wait for load"""
        page.goto(APP_URL)
        time.sleep(0.5)
        # Wait for Alpine to initialize
        expect(page.locator(".app")).to_be_visible()
    
    def test_profiles_view_loads(self, page: Page):
        """Profiles view loads and displays correctly"""
        # Navigate to profiles
        page.locator(".nav-group:has-text('Profile') .nav-item:has-text('Zarządzanie')").click()
        time.sleep(0.3)
        
        # Check main elements
        expect(page.locator("h1:has-text('Profile')")).to_be_visible()
        expect(page.locator(".view-toggle")).to_be_visible()
        expect(page.locator("button:has-text('Nowy profil')")).to_be_visible()
        
        # Check for profiles (cards or table)
        expect(page.locator(".cards, table")).to_be_visible()
        
        # Test view toggle
        page.locator(".view-toggle button:has-text('Tabela')").click()
        time.sleep(0.2)
        expect(page.locator("table")).to_be_visible()
        
        page.locator(".view-toggle button:has-text('Karty')").click()
        time.sleep(0.2)
        expect(page.locator(".cards")).to_be_visible()
    
    def test_documents_view_loads(self, page: Page):
        """Documents view loads and displays correctly"""
        # Navigate to documents
        page.locator(".nav-group:has-text('Dokumenty') .nav-item:has-text('Zarządzanie')").click()
        time.sleep(0.3)
        
        # Check main elements
        expect(page.locator("h1:has-text('Dokumenty')")).to_be_visible()
        expect(page.locator(".view-toggle")).to_be_visible()
        expect(page.locator("button:has-text('Nowy dokument')")).to_be_visible()
        
        # Check filters
        expect(page.locator("input[placeholder='Numer lub kontrahent']")).to_be_visible()
        expect(page.locator("select:has-text('Wszystkie')")).to_have_count(2)  # Status and Type filters
        
        # Test view toggle
        page.locator(".view-toggle button:has-text('Karty')").click()
        time.sleep(0.2)
        # Cards might be hidden if no documents, but the container exists
        expect(page.locator(".cards")).to_be_attached()
        
        page.locator(".view-toggle button:has-text('Tabela')").click()
        time.sleep(0.2)
        expect(page.locator("table")).to_be_visible()
    
    def test_create_view_loads(self, page: Page):
        """Create document view loads"""
        page.locator(".nav-item:has-text('Utwórz')").click()
        time.sleep(0.3)
        
        expect(page.locator("h1:has-text('Utwórz')")).to_be_visible()
        # Should show placeholder
        expect(page.locator(".empty:has-text('Widok w przygotowaniu')")).to_be_visible()
    
    def test_describe_view_loads(self, page: Page):
        """Describe view loads"""
        page.locator(".nav-item:has-text('Opisz')").click()
        time.sleep(0.3)
        
        expect(page.locator("h1:has-text('Opisz')")).to_be_visible()
        # Should show placeholder
        expect(page.locator(".empty:has-text('Widok w przygotowaniu')")).to_be_visible()
    
    def test_sign_view_loads(self, page: Page):
        """Sign view loads"""
        page.locator(".nav-item:has-text('Podpisz')").click()
        time.sleep(0.3)
        
        expect(page.locator("h1:has-text('Podpisz')")).to_be_visible()
        # Sign view has special implementation - check for signature component
        expect(page.locator("template[x-if=\"view=='sign'\"]")).to_be_visible()
    
    def test_upload_view_loads(self, page: Page):
        """Upload view loads"""
        page.locator(".nav-item:has-text('Wgraj plik')").click()
        time.sleep(0.3)
        
        expect(page.locator("h1:has-text('Wgraj plik')")).to_be_visible()
        # Should show placeholder
        expect(page.locator(".empty:has-text('Widok w przygotowaniu')")).to_be_visible()
    
    def test_import_view_loads(self, page: Page):
        """Import view loads"""
        page.locator(".nav-item:has-text('Import')").click()
        time.sleep(0.3)
        
        expect(page.locator("h1:has-text('Import')")).to_be_visible()
        # Should show placeholder
        expect(page.locator(".empty:has-text('Widok w przygotowaniu')")).to_be_visible()
    
    def test_export_view_loads(self, page: Page):
        """Export view loads"""
        page.locator(".nav-item:has-text('Export')").click()
        time.sleep(0.3)
        
        expect(page.locator("h1:has-text('Export')")).to_be_visible()
        # Should show placeholder
        expect(page.locator(".empty:has-text('Widok w przygotowaniu')")).to_be_visible()
    
    def test_export_file_view_loads(self, page: Page):
        """Export file view loads"""
        page.locator(".nav-item:has-text('Eksport pliku')").click()
        time.sleep(0.3)
        
        expect(page.locator("h1:has-text('Eksport do pliku')")).to_be_visible()
        # Should show placeholder
        expect(page.locator(".empty:has-text('Widok w przygotowaniu')")).to_be_visible()
    
    def test_navigation_between_views(self, page: Page):
        """Test smooth navigation between different views"""
        views = [
            ("Profile", ".nav-group:has-text('Profile') .nav-item:has-text('Zarządzanie')"),
            ("Dokumenty", ".nav-group:has-text('Dokumenty') .nav-item:has-text('Zarządzanie')"),
            ("Utwórz", ".nav-item:has-text('Utwórz')"),
            ("Opisz", ".nav-item:has-text('Opisz')"),
            ("Podpisz", ".nav-item:has-text('Podpisz')"),
            ("Wgraj plik", ".nav-item:has-text('Wgraj plik')"),
            ("Import", ".nav-item:has-text('Import')"),
            ("Export", ".nav-item:has-text('Export')"),
        ]
        
        for view_name, selector in views:
            page.locator(selector).click()
            time.sleep(0.3)
            expect(page.locator("h1:has-text('" + view_name + "')")).to_be_visible()
    
    def test_sidebar_navigation(self, page: Page):
        """Test sidebar navigation is functional"""
        # Check all navigation groups are present
        expect(page.locator(".nav-group:has-text('Profile')")).to_be_visible()
        expect(page.locator(".nav-group:has-text('Dokumenty')")).to_be_visible()
        expect(page.locator(".nav-group:has-text('Transfer')")).to_be_visible()
        
        # Check version info
        expect(page.locator(".version:has-text('EXEF v1.2.0')")).to_be_visible()
    
    def test_profile_selector_functionality(self, page: Page):
        """Test profile selector dropdown works"""
        # Click profile selector
        page.click(".profile-selector")
        time.sleep(0.3)
        
        # Dropdown should be visible
        expect(page.locator(".profile-dropdown")).to_be_visible()
        
        # Should have default profile
        expect(page.locator(".profile-dropdown .profile-option").first).to_be_visible()
        
        # Should have "Add profile" option
        expect(page.locator(".profile-option:has-text('Dodaj profil')")).to_be_visible()
        
        # Click outside to close
        page.click(".sidebar")
        time.sleep(0.2)
        expect(page.locator(".profile-dropdown")).not_to_be_visible()
    
    def test_responsive_layout(self, page: Page):
        """Test layout is responsive"""
        # Test desktop size
        page.set_viewport_size({"width": 1200, "height": 800})
        expect(page.locator(".sidebar")).to_be_visible()
        expect(page.locator(".main")).to_be_visible()
        
        # Test tablet size
        page.set_viewport_size({"width": 768, "height": 1024})
        expect(page.locator(".sidebar")).to_be_visible()
        expect(page.locator(".main")).to_be_visible()
        
        # Test mobile size
        page.set_viewport_size({"width": 375, "height": 667})
        expect(page.locator(".sidebar")).to_be_visible()
        expect(page.locator(".main")).to_be_visible()
    
    def test_url_parameters(self, page: Page):
        """Test URL parameters work correctly"""
        # Test direct navigation with view parameter
        page.goto(f"{APP_URL}?view=profiles")
        time.sleep(0.5)
        expect(page.locator("h1:has-text('Profile')")).to_be_visible()
        
        page.goto(f"{APP_URL}?view=docs")
        time.sleep(0.5)
        expect(page.locator("h1:has-text('Dokumenty')")).to_be_visible()
        
        # Test profile parameter
        page.goto(f"{APP_URL}?view=docs&profile=default")
        time.sleep(0.5)
        expect(page.locator("h1:has-text('Dokumenty')")).to_be_visible()
    
    def test_badges_and_counts(self, page: Page):
        """Test badges and counts display correctly"""
        # Navigate to documents view to see badges
        page.locator(".nav-group:has-text('Dokumenty') .nav-item:has-text('Zarządzanie')").click()
        time.sleep(0.3)
        
        # Document count badge should be visible
        expect(page.locator(".nav-item:has-text('Zarządzanie') .badge")).to_be_visible()
        
        # Check other badges in Transfer section
        expect(page.locator(".nav-item:has-text('Import') .badge")).to_be_visible()
        expect(page.locator(".nav-item:has-text('Export') .badge")).to_be_visible()


class TestViewSpecificFeatures:
    """Test specific features in each view"""
    
    def test_profiles_crud_operations(self, page: Page):
        """Test CRUD operations in profiles view"""
        page.goto(APP_URL)
        page.locator(".nav-group:has-text('Profile') .nav-item:has-text('Zarządzanie')").click()
        time.sleep(0.3)
        
        # Create new profile
        page.locator("button:has-text('Nowy profil')").click()
        time.sleep(0.3)
        
        # Fill form
        page.fill("input[placeholder='Moja Firma Sp. z o.o.']", "Test CRUD Profile")
        page.fill("input[placeholder='1234567890']", "9876543210")
        page.click("button:has-text('Utwórz')")
        time.sleep(0.5)
        
        # Verify profile created
        expect(page.locator(".card-title:has-text('Test CRUD Profile')")).to_be_visible()
        
        # Edit profile
        page.locator(".card-footer button[title='Edytuj']").first.click()
        time.sleep(0.3)
        page.fill("input[placeholder='Moja Firma Sp. z o.o.']", "Test CRUD Profile Edited")
        page.click("button:has-text('✓')")
        time.sleep(0.3)
        
        # Verify edited
        expect(page.locator(".card-title:has-text('Test CRUD Profile Edited')")).to_be_visible()
        
        # Cleanup via API
        r = httpx.get(f"{API_URL}/api/profiles")
        profile = next((p for p in r.json() if "Test CRUD" in p["name"]), None)
        if profile:
            httpx.delete(f"{API_URL}/api/profiles/{profile['id']}")
    
    def test_documents_filters(self, page: Page):
        """Test document filtering functionality"""
        page.goto(APP_URL)
        page.locator(".nav-group:has-text('Dokumenty') .nav-item:has-text('Zarządzanie')").click()
        time.sleep(0.3)
        
        # Test search filter
        search_input = page.locator("input[placeholder='Numer lub kontrahent']")
        search_input.fill("test")
        time.sleep(0.3)
        
        # Test status filter
        status_select = page.locator("select").first
        status_select.select_option("created")
        time.sleep(0.3)
        
        # Test type filter
        type_select = page.locator("select").nth(1)
        type_select.select_option("invoice")
        time.sleep(0.3)
        
        # Clear filters
        search_input.fill("")
        status_select.select_option("")
        type_select.select_option("")
        time.sleep(0.3)
    
    def test_bulk_actions(self, page: Page):
        """Test bulk actions in documents view"""
        page.goto(APP_URL)
        page.locator(".nav-group:has-text('Dokumenty') .nav-item:has-text('Zarządzanie')").click()
        time.sleep(0.3)
        
        # Switch to table view for bulk actions
        page.locator(".view-toggle button:has-text('Tabela')").click()
        time.sleep(0.3)
        
        # Look for bulk action bar (should appear when items selected)
        # Note: This test verifies the UI elements exist, actual selection would need documents
        expect(page.locator("table")).to_be_visible()
        expect(page.locator("th input[type='checkbox']")).to_be_visible()


class TestErrorHandling:
    """Test error handling in various views"""
    
    def test_404_handling(self, page: Page):
        """Test 404 error handling"""
        page.goto(f"{APP_URL}?view=nonexistent")
        time.sleep(0.5)
        
        # Should show some kind of error or fall back to default view
        expect(page.locator(".app")).to_be_visible()
        # Should show default view or error message
        expect(page.locator("h1")).to_be_visible()
    
    def test_network_error_handling(self, page: Page):
        """Test handling of network errors"""
        # Navigate to documents view
        page.goto(APP_URL)
        page.locator(".nav-group:has-text('Dokumenty') .nav-item:has-text('Zarządzanie')").click()
        time.sleep(0.3)
        
        # Simulate network offline
        page.context.set_offline(True)
        
        # Try to perform an action that requires network
        page.reload()
        time.sleep(0.5)
        
        # Should still show the UI, possibly with error indicators
        expect(page.locator(".app")).to_be_visible()
        
        # Restore network
        page.context.set_offline(False)
