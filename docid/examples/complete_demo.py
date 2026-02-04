#!/usr/bin/env python3
"""
EXEF Document ID Generator - Kompletna demonstracja

Ten skrypt pokazuje wszystkie możliwości pakietu:
1. Generowanie deterministycznych ID dla różnych typów dokumentów
2. Obsługa różnych formatów danych (normalizacja)
3. Obsługa OCR (opcjonalnie)

Uruchomienie:
    python complete_demo.py
    
Z OCR (wymaga paddleocr lub tesseract):
    python complete_demo.py --with-ocr sample.pdf
"""

import sys
import json
from pathlib import Path
from datetime import date

# Import pakietu
from exef_docid import (
    # Główny generator
    DocumentIDGenerator,
    DocumentType,
    
    # Skróty dla popularnych typów
    generate_invoice_id,
    generate_receipt_id,
    generate_contract_id,
    
    # Normalizatory
    NIPValidator,
    AmountNormalizer,
    DateNormalizer,
    InvoiceNumberNormalizer,
)


def print_header(title: str):
    """Drukuje nagłówek sekcji."""
    print(f"\n{'='*70}")
    print(f"  {title}")
    print(f"{'='*70}")


def print_subheader(title: str):
    """Drukuje podtytuł sekcji."""
    print(f"\n  {title}")
    print(f"  {'-'*60}")


def demo_invoice():
    """Demonstracja generowania ID faktur."""
    print_header("FAKTURY VAT")
    
    # Standardowa faktura
    doc_id = generate_invoice_id(
        seller_nip="5213017228",
        invoice_number="FV/2025/00142",
        issue_date="2025-01-15",
        gross_amount=1230.50,
    )
    print(f"  Faktura VAT:        {doc_id}")
    
    # Ta sama faktura w różnych formatach danych
    print_subheader("Determinizm - różne formaty, ten sam ID:")
    
    formats = [
        ("NIP z myślnikami", "521-301-72-28", "fv/2025/00142", "15.01.2025", "1 230,50 zł"),
        ("NIP z prefiksem PL", "PL5213017228", "FV-2025-00142", "2025/01/15", "1230.50 PLN"),
        ("NIP ze spacjami", "521 301 72 28", "FV 2025 142", "15-01-2025", 1230.5),
    ]
    
    for desc, nip, number, date_str, amount in formats:
        doc_id = generate_invoice_id(
            seller_nip=nip,
            invoice_number=number,
            issue_date=date_str,
            gross_amount=amount,
        )
        print(f"    {desc:25} -> {doc_id}")


def demo_receipt():
    """Demonstracja generowania ID paragonów."""
    print_header("PARAGONY FISKALNE")
    
    gen = DocumentIDGenerator()
    
    # Paragon podstawowy
    receipt_id = gen.generate_receipt_id(
        seller_nip="5213017228",
        receipt_date="2025-01-15",
        gross_amount=45.99,
    )
    print(f"  Paragon (podstawowy):     {receipt_id}")
    
    # Paragon z numerem
    receipt_id = gen.generate_receipt_id(
        seller_nip="5213017228",
        receipt_date="2025-01-15",
        gross_amount=45.99,
        receipt_number="00012345",
    )
    print(f"  Paragon (z numerem):      {receipt_id}")
    
    # Paragon z numerem kasy
    receipt_id = gen.generate_receipt_id(
        seller_nip="5213017228",
        receipt_date="2025-01-15",
        gross_amount=45.99,
        receipt_number="00012345",
        cash_register_number="001",
    )
    print(f"  Paragon (pełny):          {receipt_id}")
    
    print_subheader("Porównanie - różne paragony tego samego dnia:")
    for i, amount in enumerate([15.99, 29.50, 45.00], 1):
        receipt_id = gen.generate_receipt_id(
            seller_nip="5213017228",
            receipt_date="2025-01-15",
            gross_amount=amount,
            receipt_number=f"000{i}",
        )
        print(f"    Paragon {i} ({amount:>6.2f} zł): {receipt_id}")


def demo_contracts():
    """Demonstracja generowania ID umów."""
    print_header("UMOWY")
    
    gen = DocumentIDGenerator()
    
    # Umowa podstawowa
    contract_id = gen.generate_contract_id(
        party1_nip="5213017228",
        party2_nip="9876543210",
        contract_date="2025-01-15",
    )
    print(f"  Umowa (podstawowa):       {contract_id}")
    
    # Umowa z numerem
    contract_id = gen.generate_contract_id(
        party1_nip="5213017228",
        party2_nip="9876543210",
        contract_date="2025-01-15",
        contract_number="UMO/2025/001",
        contract_type="ZLECENIE",
    )
    print(f"  Umowa zlecenie:           {contract_id}")
    
    print_subheader("Niezależność od kolejności stron:")
    id_ab = gen.generate_contract_id(
        party1_nip="5213017228",
        party2_nip="9876543210",
        contract_date="2025-01-15",
    )
    id_ba = gen.generate_contract_id(
        party1_nip="9876543210",  # Zamienione!
        party2_nip="5213017228",
        contract_date="2025-01-15",
    )
    print(f"    Strona A-B: {id_ab}")
    print(f"    Strona B-A: {id_ba}")
    print(f"    Identyczne: {id_ab == id_ba}")


def demo_cash_documents():
    """Demonstracja dokumentów kasowych KP/KW."""
    print_header("DOKUMENTY KASOWE (KP/KW)")
    
    gen = DocumentIDGenerator()
    
    # KP - Kasa Przyjmie
    kp_id = gen.generate_cash_receipt_id(
        document_number="KP/2025/001",
        document_date="2025-01-15",
        amount=500.00,
        issuer_nip="5213017228",
        payer_name="Jan Kowalski",
    )
    print(f"  KP (wpłata gotówki):      {kp_id}")
    
    # KW - Kasa Wyda
    kw_id = gen.generate_cash_disbursement_id(
        document_number="KW/2025/001",
        document_date="2025-01-15",
        amount=200.00,
        issuer_nip="5213017228",
        recipient_name="Anna Nowak",
    )
    print(f"  KW (wypłata gotówki):     {kw_id}")


def demo_other_documents():
    """Demonstracja innych typów dokumentów."""
    print_header("INNE DOKUMENTY")
    
    gen = DocumentIDGenerator()
    
    # Rachunek (bez VAT)
    bill_id = gen.generate_bill_id(
        issuer_nip="5213017228",
        bill_number="R/2025/001",
        issue_date="2025-01-15",
        gross_amount=500.00,
    )
    print(f"  Rachunek (bez VAT):       {bill_id}")
    
    # Nota księgowa
    note_id = gen.generate_debit_note_id(
        issuer_nip="5213017228",
        note_number="NK/2025/001",
        issue_date="2025-01-15",
        amount=100.00,
        recipient_nip="9876543210",
    )
    print(f"  Nota księgowa:            {note_id}")
    
    # Faktura korygująca
    correction_id = gen.generate_correction_id(
        seller_nip="5213017228",
        correction_number="KOR/2025/001",
        issue_date="2025-01-20",
        original_invoice_number="FV/2025/00142",
        gross_amount=-100.00,
    )
    print(f"  Faktura korygująca:       {correction_id}")
    
    # Wyciąg bankowy
    statement_id = gen.generate_bank_statement_id(
        account_number="PL61 1090 1014 0000 0712 1981 2874",
        statement_date="2025-01-31",
        statement_number="001/2025",
    )
    print(f"  Wyciąg bankowy:           {statement_id}")
    
    # WZ - Wydanie Zewnętrzne
    wz_id = gen.generate_delivery_note_id(
        issuer_nip="5213017228",
        document_number="WZ/2025/001",
        issue_date="2025-01-15",
        recipient_nip="9876543210",
    )
    print(f"  WZ (wydanie zewn.):       {wz_id}")
    
    # Delegacja
    expense_id = gen.generate_expense_report_id(
        employee_id="EMP001",
        report_date="2025-01-20",
        total_amount=1500.00,
        report_number="DEL/2025/001",
        company_nip="5213017228",
    )
    print(f"  Delegacja:                {expense_id}")


def demo_normalization():
    """Demonstracja normalizacji danych."""
    print_header("NORMALIZACJA DANYCH")
    
    print_subheader("NIP:")
    nip_examples = [
        "521-301-72-28",
        "PL 521 301 72 28",
        "5213017228",
        "PL5213017228",
    ]
    for nip in nip_examples:
        normalized = NIPValidator.normalize(nip)
        is_valid = NIPValidator.validate(normalized)
        status = "✓" if is_valid else "✗"
        print(f"    {nip:25} -> {normalized} {status}")
    
    print_subheader("Kwoty:")
    amount_examples = [
        "1 230,50 zł",
        "1230.50 PLN",
        1230.5,
        "1,230.50",
        "12 500 000,99",
    ]
    for amount in amount_examples:
        normalized = AmountNormalizer.normalize(amount)
        print(f"    {str(amount):25} -> {normalized}")
    
    print_subheader("Daty:")
    date_examples = [
        "15.01.2025",
        "2025-01-15",
        "15/01/2025",
        "20250115",
        "15-01-2025",
        date(2025, 1, 15),
    ]
    for d in date_examples:
        normalized = DateNormalizer.normalize(d)
        print(f"    {str(d):25} -> {normalized}")
    
    print_subheader("Numery faktur:")
    number_examples = [
        "fv/2025/00142",
        "FV 2025 142",
        "FV-2025-00142",
        "fv_2025_142",
    ]
    for num in number_examples:
        normalized = InvoiceNumberNormalizer.normalize(num)
        print(f"    {num:25} -> {normalized}")


def demo_id_parsing():
    """Demonstracja parsowania ID."""
    print_header("PARSOWANIE IDENTYFIKATORÓW")
    
    ids = [
        "EXEF-FV-A7B3C9D2E1F04856",
        "EXEF-PAR-D5F3AF3409E0E9FF",
        "EXEF-UMO-4B0C3F5FD6D34939",
        "EXEF-KP-1234567890ABCDEF",
        "EXEF-KOR-FEDCBA0987654321",
    ]
    
    for doc_id in ids:
        try:
            parsed = DocumentIDGenerator.parse_id(doc_id)
            print(f"  {doc_id}")
            print(f"    Prefiks: {parsed['prefix']}")
            print(f"    Typ:     {parsed['type']} ({parsed['document_type'].name if parsed['document_type'] else 'UNKNOWN'})")
            print(f"    Hash:    {parsed['hash']}")
        except ValueError as e:
            print(f"  {doc_id} -> BŁĄD: {e}")


def demo_document_types():
    """Pokazuje wszystkie obsługiwane typy dokumentów."""
    print_header("OBSŁUGIWANE TYPY DOKUMENTÓW")
    
    print(f"  {'Kod':<6} {'Nazwa':<20} {'Opis':<40}")
    print(f"  {'-'*6} {'-'*20} {'-'*40}")
    
    descriptions = {
        "FV": "Faktura VAT",
        "PAR": "Paragon fiskalny",
        "UMO": "Umowa",
        "WB": "Wyciąg bankowy",
        "KOR": "Faktura korygująca",
        "PRO": "Faktura proforma",
        "ZAL": "Faktura zaliczkowa",
        "RAC": "Rachunek (bez VAT)",
        "KP": "Kasa Przyjmie (wpłata)",
        "KW": "Kasa Wyda (wypłata)",
        "NK": "Nota księgowa",
        "WZ": "Wydanie zewnętrzne",
        "PZ": "Przyjęcie zewnętrzne",
        "DEL": "Delegacja / rozliczenie",
        "DOC": "Inny dokument",
    }
    
    for doc_type in DocumentType:
        desc = descriptions.get(doc_type.value, "")
        print(f"  {doc_type.value:<6} {doc_type.name:<20} {desc:<40}")


def demo_custom_prefix():
    """Demonstracja niestandardowego prefiksu."""
    print_header("NIESTANDARDOWE PREFIKSY")
    
    print_subheader("Ta sama faktura, różne systemy:")
    
    for prefix in ["EXEF", "KSEF", "ACME", "INT"]:
        gen = DocumentIDGenerator(prefix=prefix)
        doc_id = gen.generate_invoice_id(
            seller_nip="5213017228",
            invoice_number="FV/2025/001",
            issue_date="2025-01-15",
            gross_amount=100.00,
        )
        print(f"    Prefiks {prefix}: {doc_id}")


def demo_ocr():
    """Demonstracja OCR (jeśli dostępny)."""
    print_header("PRZETWARZANIE OCR")
    
    try:
        from exef_docid import (
            OCRProcessor,
            OCREngine,
            DocumentPipeline,
            process_document,
        )
        
        print("  ✓ Moduł OCR dostępny")
        
        # Sprawdź dostępne silniki
        for engine in [OCREngine.PADDLE, OCREngine.TESSERACT]:
            try:
                processor = OCRProcessor(preferred_engine=engine)
                processor._init_processor()
                print(f"    ✓ {engine.value}: dostępny")
            except ImportError as e:
                print(f"    ✗ {engine.value}: niedostępny ({e})")
        
        print_subheader("Przykład użycia (z plikiem):")
        print("""
    from exef_docid import process_document, get_document_id
    
    # Pełne przetwarzanie
    result = process_document("faktura.pdf")
    print(result.document_id)           # EXEF-FV-A7B3C9D2E1F04856
    print(result.extraction.issuer_nip) # 5213017228
    print(result.ocr_confidence)        # 0.95
    
    # Tylko ID
    doc_id = get_document_id("paragon.jpg")
    
    # Weryfikacja
    is_same = verify_document_id("skan.png", "EXEF-FV-A7B3C9D2E1F04856")
        """)
        
    except ImportError as e:
        print(f"  ✗ Moduł OCR niedostępny: {e}")
        print("\n  Aby zainstalować OCR:")
        print("    pip install paddleocr paddlepaddle  # Zalecane dla CPU")
        print("    # lub")
        print("    apt install tesseract-ocr tesseract-ocr-pol && pip install pytesseract")


def demo_json_export():
    """Demonstracja eksportu do JSON."""
    print_header("EKSPORT DO JSON")
    
    gen = DocumentIDGenerator()
    
    # Przykładowe dokumenty
    documents = []
    
    # Faktura
    doc_id = gen.generate_invoice_id("5213017228", "FV/2025/001", "2025-01-15", 1230.50)
    documents.append({
        "id": doc_id,
        "type": "FV",
        "seller_nip": "5213017228",
        "number": "FV/2025/001",
        "date": "2025-01-15",
        "amount": 1230.50,
    })
    
    # Paragon
    doc_id = gen.generate_receipt_id("5213017228", "2025-01-15", 45.99, "00012345")
    documents.append({
        "id": doc_id,
        "type": "PAR",
        "seller_nip": "5213017228",
        "date": "2025-01-15",
        "amount": 45.99,
        "receipt_number": "00012345",
    })
    
    # KP
    doc_id = gen.generate_cash_receipt_id("KP/2025/001", "2025-01-15", 500.00, "5213017228")
    documents.append({
        "id": doc_id,
        "type": "KP",
        "number": "KP/2025/001",
        "date": "2025-01-15",
        "amount": 500.00,
    })
    
    print("  Przykładowy eksport:")
    print(json.dumps(documents, indent=4, ensure_ascii=False))


def main():
    """Główna funkcja demonstracyjna."""
    print("\n" + "#" * 70)
    print("#" + " " * 68 + "#")
    print("#" + "  EXEF Document ID Generator - Kompletna demonstracja".center(66) + "#")
    print("#" + "  Deterministyczne identyfikatory dokumentów".center(66) + "#")
    print("#" + " " * 68 + "#")
    print("#" * 70)
    
    # Uruchom wszystkie demonstracje
    demo_document_types()
    demo_invoice()
    demo_receipt()
    demo_contracts()
    demo_cash_documents()
    demo_other_documents()
    demo_normalization()
    demo_id_parsing()
    demo_custom_prefix()
    demo_json_export()
    demo_ocr()
    
    print_header("PODSUMOWANIE")
    print("""
  ✓ Generowanie deterministycznych ID dla 15 typów dokumentów
  ✓ Normalizacja NIP, kwot, dat, numerów dokumentów
  ✓ Niezależność od formatu danych wejściowych
  ✓ Opcjonalna obsługa OCR (PaddleOCR / Tesseract)
  ✓ CLI do przetwarzania plików
  
  Użycie w kodzie:
    from exef_docid import generate_invoice_id, process_document
    
  Użycie CLI:
    docid process faktura.pdf
    docid generate-id --type invoice --nip 5213017228 ...
    """)


if __name__ == "__main__":
    main()
