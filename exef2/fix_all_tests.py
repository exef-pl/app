#!/usr/bin/env python3
"""Fix all test methods to be async"""

import re

def fix_all_test_methods():
    """Fix all test methods to be async"""
    with open("tests/test_all_views_gui.py", 'r') as f:
        content = f.read()
    
    # Fix setup method
    content = re.sub(
        r'def setup\(self, page: Page\):',
        'async def setup(self, page: Page):',
        content
    )
    
    # Fix all page interactions in setup
    content = re.sub(
        r'(\s+)page\.goto\(',
        r'\1await page.goto(',
        content
    )
    content = re.sub(
        r'(\s+)expect\(page\.locator\(',
        r'\1await expect(page.locator(',
        content
    )
    
    # Fix all test methods
    lines = content.split('\n')
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.strip().startswith('def test_'):
            # Make method async
            lines[i] = line.replace('def test_', 'async def test_')
            i += 1
            # Fix following lines
            while i < len(lines) and (lines[i].startswith('        ') or lines[i].strip() == ''):
                # Add await to page and expect calls
                lines[i] = re.sub(r'^(\s*)page\.', r'\1await page.', lines[i])
                lines[i] = re.sub(r'^(\s*)expect\(', r'\1await expect(', lines[i])
                i += 1
            continue
        i += 1
    
    with open("tests/test_all_views_gui.py", 'w') as f:
        f.write('\n'.join(lines))
    
    print("Fixed all test methods to be async")

if __name__ == "__main__":
    fix_all_test_methods()
