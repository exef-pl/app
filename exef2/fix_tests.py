#!/usr/bin/env python3
"""Fix sync/async issues in test files"""

import re
import sys

def fix_test_file(filepath):
    """Fix sync/async issues in a test file"""
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Fix method definitions
    content = re.sub(r'^(\s*)def test_(.*?\(.*?\):)', r'\1async def test_\2:', content, flags=re.MULTILINE)
    
    # Fix page interactions
    page_methods = [
        'goto', 'click', 'fill', 'select_option', 'check', 'uncheck',
        'press', 'type', 'focus', 'blur', 'hover', 'screenshot'
    ]
    
    for method in page_methods:
        # Fix page.locator().method() calls
        pattern = rf'(\s*)page\.locator\((.*?)\)\.{method}\((.*?)\)'
        replacement = rf'\1await page.locator(\2).{method}(\3)'
        content = re.sub(pattern, replacement, content)
        
        # Fix direct page.method() calls
        pattern = rf'(\s*)page\.{method}\((.*?)\)'
        replacement = rf'\1await page.{method}(\2)'
        content = re.sub(pattern, replacement, content)
    
    # Fix expect calls
    content = re.sub(r'(\s*)expect\(', r'\1await expect(', content)
    
    # Write back
    with open(filepath, 'w') as f:
        f.write(content)
    
    print(f"Fixed {filepath}")

if __name__ == "__main__":
    files = [
        "tests/test_all_views_gui.py"
    ]
    
    for file in files:
        fix_test_file(file)
