#!/usr/bin/env python3
"""Simple test runner for GUI tests without fixtures"""

import pytest
import asyncio
from playwright.async_api import async_playwright
import httpx
import time

API_URL = "http://backend:8000"
APP_URL = "http://frontend:80"

async def run_test(test_func):
    """Run a single test with setup"""
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        
        # Create test data
        async with httpx.AsyncClient() as client:
            await client.post(f"{API_URL}/api/profiles", json={
                "name": "Test Profile",
                "nip": "1234567890"
            })
            await client.post(f"{API_URL}/api/profiles/default/documents", json={
                "type": "invoice",
                "number": "TEST/001",
                "contractor": "Test Contractor",
                "amount": 1000,
                "status": "created"
            })
        
        # Navigate to app
        await page.goto(APP_URL)
        time.sleep(0.5)
        await page.locator(".app").wait_for(state="visible")
        
        try:
            await test_func(page)
            print(f"✅ {test_func.__name__} PASSED")
        except Exception as e:
            print(f"❌ {test_func.__name__} FAILED: {str(e)}")
        
        await browser.close()

async def test_profiles_view(page):
    """Test profiles view"""
    await page.locator(".nav-group:has-text('Profile') .nav-item:has-text('Zarządzanie')").click()
    time.sleep(0.3)
    await page.locator("h1:has-text('Profile')").wait_for(state="visible")
    await page.locator(".view-toggle").wait_for(state="visible")

async def test_documents_view(page):
    """Test documents view"""
    await page.locator(".nav-group:has-text('Dokumenty') .nav-item:has-text('Zarządzanie')").click()
    time.sleep(0.3)
    await page.locator("h1:has-text('Dokumenty')").wait_for(state="visible")

async def test_sign_view(page):
    """Test signature view"""
    await page.locator(".nav-item:has-text('Podpisz')").click()
    time.sleep(0.3)
    await page.locator("h1:has-text('Podpis Elektroniczny')").wait_for(state="visible")

async def test_create_view(page):
    """Test create view"""
    print("Clicking 'Utwórz' nav item...")
    await page.locator(".nav-item:has-text('Utwórz')").click()
    time.sleep(0.5)
    
    # Check URL
    url = page.url
    print(f"Current URL after click: {url}")
    
    # Check if h1 exists in main content
    h1 = await page.locator("main h1").first.text_content()
    print(f"H1 content: {h1}")
    
    await page.locator("main h1").wait_for(state="visible")

async def test_import_view(page):
    """Test import view"""
    print("Clicking 'Import' nav item...")
    await page.locator(".nav-item:has-text('Import')").click()
    time.sleep(0.5)

    url = page.url
    print(f"Current URL after click: {url}")

    await page.locator("main h1:has-text('Import')").wait_for(state="visible")
    h1 = await page.locator("main h1").first.text_content()
    print(f"H1 content: {h1}")

    await page.locator("main h1").wait_for(state="visible")

async def test_export_view(page):
    """Test export view"""
    print("Clicking 'Export' nav item...")
    await page.locator(".nav-item:has-text('Export')").click()
    time.sleep(0.5)

    url = page.url
    print(f"Current URL after click: {url}")

    h1 = await page.locator("main h1").first.text_content()
    print(f"H1 content: {h1}")

    await page.locator("main h1").wait_for(state="visible")

async def test_exportfile_view(page):
    """Test exportfile view"""
    print("Clicking 'Eksport pliku' nav item...")
    await page.locator(".nav-item:has-text('Eksport pliku')").click()
    time.sleep(0.5)

    url = page.url
    print(f"Current URL after click: {url}")

    h1 = await page.locator("main h1").first.text_content()
    print(f"H1 content: {h1}")

    await page.locator("main h1").wait_for(state="visible")

async def test_doc_view(page):
    """Test document detail view"""
    print("Navigating to documents view...")
    await page.locator(".nav-group:has-text('Dokumenty') .nav-item:has-text('Zarządzanie')").click()
    time.sleep(0.5)

    await page.locator("main h1:has-text('Dokumenty')").wait_for(state="visible")
    # Ensure table mode (doc number is clickable only in table view)
    await page.locator("main .view-toggle button:has-text('Tabela')").click()
    time.sleep(0.2)

    row = page.locator("main table tbody tr:has-text('TEST/001')").first
    await row.wait_for(state="visible")

    # Click on test document number to open details
    await row.locator(".inline-edit").first.click()
    time.sleep(0.5)

    url = page.url
    print(f"Current URL after opening doc: {url}")

    await page.locator("main h1:has-text('Szczegóły dokumentu')").wait_for(state="visible")
    h1 = await page.locator("main h1").first.text_content()
    print(f"H1 content: {h1}")

    await page.locator("main h1").wait_for(state="visible")

async def test_upload_view(page):
    """Test upload view"""
    print("Clicking 'Wgraj plik' nav item...")
    await page.locator(".nav-item:has-text('Wgraj plik')").click()
    time.sleep(0.5)
    
    url = page.url
    print(f"Current URL after click: {url}")
    
    h1 = await page.locator("main h1").first.text_content()
    print(f"H1 content: {h1}")
    
    await page.locator("main h1").wait_for(state="visible")

async def test_describe_view(page):
    """Test describe view"""
    print("Clicking 'Opisz' nav item...")
    await page.locator(".nav-item:has-text('Opisz')").click()
    time.sleep(0.5)
    
    url = page.url
    print(f"Current URL after click: {url}")
    
    h1 = await page.locator("main h1").first.text_content()
    print(f"H1 content: {h1}")
    
    await page.locator("main h1").wait_for(state="visible")

async def main():
    """Run all tests"""
    tests = [
        test_profiles_view,
        test_documents_view,
        test_sign_view,
        test_create_view,
        test_upload_view,
        test_describe_view,
        test_import_view,
        test_export_view,
        test_exportfile_view,
        test_doc_view
    ]
    
    for test in tests:
        await run_test(test)

if __name__ == "__main__":
    asyncio.run(main())
