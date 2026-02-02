#!/usr/bin/env python3
"""Fix all test methods in test_all_views_gui.py to be properly async"""

import re

def fix_test_file():
    with open("tests/test_all_views_gui.py", 'r') as f:
        content = f.read()
    
    # Fix all test method definitions to be async
    content = re.sub(
        r'(\s+)def (test_\w+)\(self, page: Page\):',
        r'\1async def \2(self, page: Page):',
        content
    )
    
    # Fix all page method calls to have await
    page_methods = [
        'goto', 'click', 'fill', 'select_option', 'check', 'uncheck',
        'press', 'type', 'focus', 'blur', 'hover', 'screenshot', 'reload',
        'wait_for_selector', 'wait_for_load_state', 'locator'
    ]
    
    for method in page_methods:
        # Fix page.method() calls
        content = re.sub(
            rf'(\s+)page\.{method}\(',
            rf'\1await page.{method}(',
            content
        )
        
        # Fix page.locator().method() calls
        if method != 'locator':
            content = re.sub(
                rf'(\s+)page\.locator\((.*?)\)\.{method}\(',
                rf'\1await page.locator(\2).{method}(',
                content
            )
    
    # Fix expect calls
    content = re.sub(
        r'(\s+)expect\(',
        r'\1await expect(',
        content
    )
    
    # Fix context methods
    content = re.sub(
        r'(\s+)page\.context\.set_offline\(',
        r'\1await page.context.set_offline(',
        content
    )
    
    # Remove double awaits
    content = re.sub(r'await await', 'await', content)
    
    with open("tests/test_all_views_gui.py", 'w') as f:
        f.write(content)
    
    print("Fixed all test methods")

if __name__ == "__main__":
    fix_test_file()
