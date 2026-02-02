#!/usr/bin/env python3
"""Fix async/await in test_signature.py UI tests"""

import re

def fix_signature_tests():
    """Fix UI test methods in test_signature.py"""
    with open("tests/test_signature.py", 'r') as f:
        content = f.read()
    
    # Find UI test class and fix methods
    lines = content.split('\n')
    in_ui_tests = False
    i = 0
    
    while i < len(lines):
        line = lines[i]
        
        if 'class TestSignatureUI:' in line:
            in_ui_tests = True
        elif line.startswith('class ') and in_ui_tests:
            in_ui_tests = False
        
        if in_ui_tests and line.strip().startswith('def test_'):
            # Make method async
            lines[i] = line.replace('def test_', 'async def test_')
            # Fix following lines
            i += 1
            while i < len(lines) and (lines[i].startswith('        ') or lines[i].strip() == ''):
                # Add await to page and expect calls
                lines[i] = re.sub(r'^(\s*)page\.', r'\1await page.', lines[i])
                lines[i] = re.sub(r'^(\s*)expect\(', r'\1await expect(', lines[i])
                i += 1
            continue
        
        i += 1
    
    with open("tests/test_signature.py", 'w') as f:
        f.write('\n'.join(lines))
    
    print("Fixed async/await in test_signature.py")

if __name__ == "__main__":
    fix_signature_tests()
