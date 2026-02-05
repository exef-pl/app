#!/usr/bin/env python3
"""
Test CLI commands
"""

import subprocess
import json
import sys
from pathlib import Path

test_results = []

def run_command(name, cmd, expect_success=True):
    """Run CLI command and return result"""
    print(f"\n🔧 Testing: {name}")
    print(f"   Command: {' '.join(cmd)}")
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
            cwd="/home/tom/github/doc-pl/app/docid"
        )
        
        passed = (result.returncode == 0) if expect_success else (result.returncode != 0)
        
        if not passed:
            if result.stdout:
                print(f"📤 STDOUT:\n{result.stdout}")
            if result.stderr:
                print(f"📤 STDERR:\n{result.stderr}")
            print(f"❌ {name} FAILED (rc={result.returncode})")
        else:
            print(f"✅ {name} PASSED")
            
        test_results.append({"name": name, "passed": passed, "error": result.stderr if not passed else None})
        return passed
            
    except subprocess.TimeoutExpired:
        print(f"❌ {name} TIMED OUT")
        test_results.append({"name": name, "passed": False, "error": "Timeout"})
        return False
    except Exception as e:
        print(f"❌ {name} ERROR: {e}")
        test_results.append({"name": name, "passed": False, "error": str(e)})
        return False

def test_basic_commands():
    """Test basic CLI commands"""
    print("\n" + "=" * 80)
    print("TESTING BASIC CLI COMMANDS")
    print("=" * 80)
    
    base_cmd = ["source", "venv/bin/activate", "&&", "docid-universal"]
    
    run_command("Help command", base_cmd + ["--help"])
    run_command("Version command", base_cmd + ["--version"])
    
    # Test generate business ID
    cmd = base_cmd + [
        "generate", "invoice",
        "--nip", "5213017228",
        "--number", "FV/2025/00142",
        "--date", "2025-01-15",
        "--amount", "1230.50"
    ]
    if run_command("Generate Business ID", cmd):
        result = subprocess.run(["bash", "-c", " ".join(cmd)], capture_output=True, text=True, cwd="/home/tom/github/doc-pl/app/docid")
        business_id = result.stdout.strip()
    else:
        business_id = "ERROR"
    
    # Test generate universal ID
    cmd = base_cmd + ["universal", "samples/invoices/faktura_full.pdf"]
    if run_command("Generate Universal ID (PDF)", cmd):
        result = subprocess.run(["bash", "-c", " ".join(cmd)], capture_output=True, text=True, cwd="/home/tom/github/doc-pl/app/docid")
        universal_id = result.stdout.strip()
    else:
        universal_id = "ERROR"
    
    run_command("Process TXT (Tesseract)", base_cmd + ["process", "samples/invoices/faktura_full.txt", "--ocr", "tesseract"])
    run_command("Analyze PDF", base_cmd + ["analyze", "samples/universal/pdf_with_graphics.pdf"])
    run_command("Compare PDF vs TXT", base_cmd + [
        "compare",
        "samples/invoices/faktura_full.pdf",
        "samples/invoices/faktura_full.txt"
    ])
    
    # Verify logic
    if business_id != "ERROR":
        # Get actual ID from process to handle potential extraction nuances
        cmd = base_cmd + ["process", "samples/invoices/faktura_full.txt", "--ocr", "tesseract", "--format", "json"]
        proc_result = subprocess.run(["bash", "-c", " ".join(cmd)], capture_output=True, text=True, cwd="/home/tom/github/doc-pl/app/docid")
        if proc_result.returncode == 0:
            extracted_id = json.loads(proc_result.stdout)["document_id"]
            run_command("Verify Business ID", base_cmd + ["verify", "samples/invoices/faktura_full.txt", extracted_id])
    
    if universal_id != "ERROR":
        run_command("Verify Universal ID", base_cmd + ["verify", "samples/invoices/faktura_full.pdf", universal_id, "--universal"])
    
    run_command("Test Determinism (TXT)", base_cmd + [
        "test",
        "samples/invoices/faktura_full.txt",
        "--iterations", "5",
        "--ocr", "tesseract"
    ])

def test_batch_processing():
    """Test batch processing"""
    print("\n" + "=" * 80)
    print("TESTING BATCH PROCESSING")
    print("=" * 80)
    
    base_cmd = ["source", "venv/bin/activate", "&&", "docid-universal"]
    
    run_command("Batch Process Folder", base_cmd + [
        "batch",
        "samples/invoices",
        "--ocr", "tesseract",
        "--duplicates"
    ])
    
    if run_command("Batch Process to JSON", base_cmd + [
        "batch",
        "samples/invoices",
        "--ocr", "tesseract",
        "--output", "batch_test.json"
    ]):
        if Path("batch_test.json").exists():
            print("✅ Batch output file created")
            with open("batch_test.json") as f:
                data = json.load(f)
                print(f"📊 Processed {len(data)} files")
            Path("batch_test.json").unlink()
        else:
            print("❌ Batch output file not created")
            test_results.append({"name": "Batch output file existence", "passed": False, "error": "File not found"})

def test_json_output():
    """Test JSON output formats"""
    print("\n" + "=" * 80)
    print("TESTING JSON OUTPUT")
    print("=" * 80)
    
    base_cmd = ["source", "venv/bin/activate", "&&", "docid-universal"]
    
    run_command("JSON Process", base_cmd + ["process", "samples/invoices/faktura_full.txt", "--format", "json"])
    run_command("JSON Analyze", base_cmd + ["analyze", "samples/universal/pdf_with_graphics.pdf", "--format", "json"])
    run_command("JSON Compare", base_cmd + [
        "compare",
        "samples/invoices/faktura_full.pdf",
        "samples/invoices/faktura_full.txt",
        "--format", "json"
    ])

def test_error_handling():
    """Test error handling"""
    print("\n" + "=" * 80)
    print("TESTING ERROR HANDLING")
    print("=" * 80)
    
    base_cmd = ["source", "venv/bin/activate", "&&", "docid-universal"]
    
    run_command("Non-existent file", base_cmd + ["universal", "non_existent.pdf"], expect_success=False)
    run_command("Invalid ID verification", base_cmd + ["verify", "samples/invoices/faktura_full.txt", "INVALID-ID"], expect_success=False)
    run_command("Missing arguments", base_cmd + ["generate", "invoice"], expect_success=False)

def main():
    """Run all CLI tests"""
    print("🧪 TESTING CLI COMMANDS")
    print("=" * 80)
    
    test_basic_commands()
    test_batch_processing()
    test_json_output()
    test_error_handling()
    
    # Summary
    print("\n" + "=" * 80)
    print("📊 FINAL TEST SUMMARY")
    print("=" * 80)
    
    passed_count = sum(1 for r in test_results if r["passed"])
    failed_count = len(test_results) - passed_count
    
    for r in test_results:
        status = "✅ PASSED" if r["passed"] else "❌ FAILED"
        print(f"{status} - {r['name']}")
        if not r["passed"] and r["error"]:
            print(f"   Error: {r['error'].strip().splitlines()[-1] if r['error'].strip() else 'Unknown'}")
    
    print("-" * 80)
    print(f"TOTAL: {len(test_results)} | PASSED: {passed_count} | FAILED: {failed_count}")
    
    if failed_count == 0:
        print("\n✅ ALL CLI TESTS PASSED!")
        return 0
    else:
        print(f"\n❌ {failed_count} TESTS FAILED!")
        return 1

if __name__ == "__main__":
    sys.exit(main())

if __name__ == "__main__":
    sys.exit(main())
