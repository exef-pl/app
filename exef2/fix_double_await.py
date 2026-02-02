#!/usr/bin/env python3
"""Fix double await issues in test files"""

import re

def fix_double_await(filepath):
    """Fix double await issues"""
    with open(filepath, 'r') as f:
        content = f.read()
    
    # Fix double await
    content = re.sub(r'await await', 'await', content)
    
    # Fix double colon in method definitions
    content = re.sub(r'::\s*\n', ':\n', content)
    
    with open(filepath, 'w') as f:
        f.write(content)
    
    print(f"Fixed double await in {filepath}")

if __name__ == "__main__":
    fix_double_await("tests/test_all_views_gui.py")
