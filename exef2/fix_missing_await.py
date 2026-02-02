#!/usr/bin/env python3
"""Fix missing await in test_signature.py UI tests"""

import re

def fix_missing_await():
    """Fix missing await in UI test methods"""
    with open("tests/test_signature.py", 'r') as f:
        content = f.read()
    
    # Fix all page and expect calls in TestSignatureUI class
    lines = content.split('\n')
    in_ui_class = False
    i = 0
    
    while i < len(lines):
        line = lines[i]
        
        if 'class TestSignatureUI:' in line:
            in_ui_class = True
        elif line.startswith('class ') and in_ui_class:
            in_ui_class = False
        
        if in_ui_class and line.strip().startswith(('page.', 'expect(')):
            # Add await if not already present
            if not line.strip().startswith('await'):
                # Count leading spaces
                spaces = len(line) - len(line.lstrip())
                lines[i] = ' ' * spaces + 'await ' + line.strip()
        
        i += 1
    
    with open("tests/test_signature.py", 'w') as f:
        f.write('\n'.join(lines))
    
    print("Fixed missing await in test_signature.py")

if __name__ == "__main__":
    fix_missing_await()
