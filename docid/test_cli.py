#!/usr/bin/env python3
"""
Test CLI commands
"""

import subprocess
import json
import sys
from pathlib import Path

def run_command(cmd, expect_success=True):
    """Run CLI command and return result"""
    print(f"\n🔧 Running: {' '.join(cmd)}")
    try:
        # Use bash -c to handle source command
        if isinstance(cmd, list):
            cmd_str = ' '.join(cmd)
        else:
            cmd_str = cmd
        
        result = subprocess.run(
            ["bash", "-c", cmd_str],
            capture_output=True,
            text=True,
            timeout=30,
            cwd="/home/tom/github/exef-pl/app/docid"
        )
        
        if result.stdout:
            print(f"📤 STDOUT:\n{result.stdout}")
        if result.stderr:
            print(f"📤 STDERR:\n{result.stderr}")
        
        if expect_success and result.returncode != 0:
            print(f"❌ Command failed with return code {result.returncode}")
            return False
        
        return result.returncode == 0
    except subprocess.TimeoutExpired:
        print("❌ Command timed out")
        return False
    except Exception as e:
        print(f"❌ Error running command: {e}")
        return False

def test_basic_commands():
    """Test basic CLI commands"""
    print("=" * 80)
    print("TESTING BASIC CLI COMMANDS")
    print("=" * 80)
    
    base_cmd = ["source", "venv/bin/activate", "&&", "docid-universal"]
    
    # Test help
    if not run_command(base_cmd + ["--help"]):
        return False
    
    # Test version
    if not run_command(base_cmd + ["--version"]):
        return False
    
    # Test generate business ID
    if not run_command(base_cmd + [
        "generate", "invoice",
        "--nip", "5213017228",
        "--number", "FV/2025/00142",
        "--date", "2025-01-15",
        "--amount", "1230.50"
    ]):
        return False
    
    # Test generate universal ID
    if not run_command(base_cmd + ["universal", "samples/invoices/faktura_full.pdf"]):
        return False
    
    # Test process document
    if not run_command(base_cmd + ["process", "samples/invoices/faktura_full.txt", "--no-ocr"]):
        return False
    
    # Test analyze file
    if not run_command(base_cmd + ["analyze", "samples/universal/pdf_with_graphics.pdf"]):
        return False
    
    # Test compare documents
    if not run_command(base_cmd + [
        "compare",
        "samples/invoices/faktura_full.pdf",
        "samples/invoices/faktura_full.txt"
    ]):
        return False
    
    # Test verify ID
    if not run_command(base_cmd + [
        "verify",
        "samples/invoices/faktura_full.txt",
        "EXEF-FV-F0BE35240C77B2DB"
    ]):
        return False
    
    # Test verify universal ID
    if not run_command(base_cmd + [
        "verify",
        "samples/universal/pdf_with_graphics.pdf",
        "UNIV-PDF-A6BECE56B7FE21DC",
        "--universal"
    ]):
        return False
    
    # Test determinism
    if not run_command(base_cmd + [
        "test",
        "samples/invoices/faktura_full.txt",
        "--iterations", "5",
        "--no-ocr"
    ]):
        return False
    
    return True

def test_batch_processing():
    """Test batch processing"""
    print("\n" + "=" * 80)
    print("TESTING BATCH PROCESSING")
    print("=" * 80)
    
    base_cmd = ["source", "venv/bin/activate", "&&", "docid-universal"]
    
    # Test batch processing
    if not run_command(base_cmd + [
        "batch",
        "samples/invoices",
        "--no-ocr",
        "--duplicates"
    ]):
        return False
    
    # Test batch with JSON output
    if not run_command(base_cmd + [
        "batch",
        "samples/invoices",
        "--no-ocr",
        "--output", "batch_test.json"
    ]):
        return False
    
    # Check if output file was created
    if Path("batch_test.json").exists():
        print("✅ Batch output file created")
        with open("batch_test.json") as f:
            data = json.load(f)
            print(f"📊 Processed {len(data)} files")
        Path("batch_test.json").unlink()  # Clean up
    else:
        print("❌ Batch output file not created")
        return False
    
    return True

def test_json_output():
    """Test JSON output formats"""
    print("\n" + "=" * 80)
    print("TESTING JSON OUTPUT")
    print("=" * 80)
    
    base_cmd = ["source", "venv/bin/activate", "&&", "docid-universal"]
    
    # Test process with JSON
    if not run_command(base_cmd + [
        "process",
        "samples/invoices/faktura_full.txt",
        "--format", "json",
        "--no-ocr"
    ]):
        return False
    
    # Test analyze with JSON
    if not run_command(base_cmd + [
        "analyze",
        "samples/universal/pdf_with_graphics.pdf",
        "--format", "json"
    ]):
        return False
    
    # Test compare with JSON
    if not run_command(base_cmd + [
        "compare",
        "samples/invoices/faktura_full.pdf",
        "samples/invoices/faktura_full.txt",
        "--format", "json"
    ]):
        return False
    
    return True

def test_error_handling():
    """Test error handling"""
    print("\n" + "=" * 80)
    print("TESTING ERROR HANDLING")
    print("=" * 80)
    
    base_cmd = ["source", "venv/bin/activate", "&&", "docid-universal"]
    
    # Test non-existent file
    if run_command(base_cmd + ["universal", "non_existent.pdf"], expect_success=False):
        print("❌ Should have failed for non-existent file")
        return False
    
    # Test invalid ID verification
    if run_command(base_cmd + [
        "verify",
        "samples/invoices/faktura_full.txt",
        "INVALID-ID"
    ], expect_success=False):
        print("❌ Should have failed for invalid ID")
        return False
    
    # Test missing required arguments
    if run_command(base_cmd + ["generate", "invoice"], expect_success=False):
        print("❌ Should have failed for missing arguments")
        return False
    
    return True

def main():
    """Run all CLI tests"""
    print("🧪 TESTING CLI COMMANDS")
    print("=" * 80)
    
    all_passed = True
    
    # Run tests
    if not test_basic_commands():
        all_passed = False
    
    if not test_batch_processing():
        all_passed = False
    
    if not test_json_output():
        all_passed = False
    
    if not test_error_handling():
        all_passed = False
    
    # Summary
    print("\n" + "=" * 80)
    if all_passed:
        print("✅ ALL CLI TESTS PASSED!")
        return 0
    else:
        print("❌ SOME CLI TESTS FAILED!")
        return 1

if __name__ == "__main__":
    sys.exit(main())
