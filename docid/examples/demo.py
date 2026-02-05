#!/usr/bin/env python3
"""
Przykład użycia DOC Document ID Generator.

Ten skrypt demonstruje wszystkie główne funkcjonalności pakietu.
"""

from docid import (
    AmountNormalizer,
    DateNormalizer,
    # Główne API
    DocumentIDGenerator,
    DocumentType,
    # Normalizatory
    NIPValidator,
    generate_contract_id,
    generate_invoice_id,
    generate_receipt_id,
)


def demo_basic_usage():
    """Podstawowe użycie - generowanie ID z danych."""
    print("=" * 60)
    print("1. Podstawowe użycie - generowanie ID z danych")
    print("=" * 60)

    # Prosty przypadek - faktura
    doc_id = generate_invoice_id(
        seller_nip="521-301-72-28",      # Normalizuje do 5213017228
        invoice_number="fv/2025/00142",  # Normalizuje do FV/2025/00142
        issue_date="15.01.2025",         # Normalizuje do 2025-01-15
        gross_amount="1 230,50 zł",      # Normalizuje do 1230.50
    )
    print(f"Faktura ID: {doc_id}")

    # Paragon
    receipt_id = generate_receipt_id(
        seller_nip="5213017228",
        receipt_date="2025-01-15",
        gross_amount=45.99,
        cash_register_number="001",
    )
    print(f"Paragon ID: {receipt_id}")

    # Umowa
    contract_id = generate_contract_id(
        party1_nip="5213017228",
        party2_nip="1234567890",
        contract_date="2025-01-15",
        contract_number="UMO/2025/001",
    )
    print(f"Umowa ID: {contract_id}")


def demo_deterministic():
    """Demonstracja deterministyczności - różne formaty, ten sam ID."""
    print("\n" + "=" * 60)
    print("2. Deterministyczność - różne formaty = ten sam ID")
    print("=" * 60)

    # Format 1: z separatorami i walutą
    id1 = generate_invoice_id(
        seller_nip="521-301-72-28",
        invoice_number="fv 2025 00142",
        issue_date="15.01.2025",
        gross_amount="1 230,50 zł",
    )

    # Format 2: czysty, znormalizowany
    id2 = generate_invoice_id(
        seller_nip="5213017228",
        invoice_number="FV/2025/00142",
        issue_date="2025-01-15",
        gross_amount=1230.50,
    )

    # Format 3: z prefiksem kraju
    id3 = generate_invoice_id(
        seller_nip="PL5213017228",
        invoice_number="FV-2025-00142",
        issue_date="2025/01/15",
        gross_amount="1230.50 PLN",
    )

    print(f"Format 1: {id1}")
    print(f"Format 2: {id2}")
    print(f"Format 3: {id3}")
    print(f"Wszystkie równe: {id1 == id2 == id3}")


def demo_normalization():
    """Demonstracja normalizacji danych."""
    print("\n" + "=" * 60)
    print("3. Normalizacja danych")
    print("=" * 60)

    # NIP
    print("\nNormalizacja NIP:")
    for nip in ["521-301-72-28", "PL 521 301 72 28", "5213017228"]:
        normalized = NIPValidator.normalize(nip)
        is_valid = NIPValidator.validate(normalized)
        print(f"  {nip:25} -> {normalized} (valid: {is_valid})")

    # Kwoty
    print("\nNormalizacja kwot:")
    for amount in ["1 230,50 zł", "1230.50 PLN", 1230.5, "1,230.50"]:
        normalized = AmountNormalizer.normalize(amount)
        print(f"  {str(amount):20} -> {normalized}")

    # Daty
    print("\nNormalizacja dat:")
    for date in ["15.01.2025", "2025-01-15", "15/01/2025", "20250115"]:
        normalized = DateNormalizer.normalize(date)
        print(f"  {date:15} -> {normalized}")


def demo_document_types():
    """Demonstracja różnych typów dokumentów."""
    print("\n" + "=" * 60)
    print("4. Różne typy dokumentów")
    print("=" * 60)

    generator = DocumentIDGenerator(prefix="DOC")

    # Faktura korygująca
    correction_id = generator.generate_correction_id(
        seller_nip="5213017228",
        correction_number="KOR/2025/001",
        issue_date="2025-01-20",
        original_invoice_number="FV/2025/00142",
        gross_amount=-100.00,
    )
    print(f"Faktura korygująca: {correction_id}")

    # Wyciąg bankowy
    statement_id = generator.generate_bank_statement_id(
        account_number="PL61 1090 1014 0000 0712 1981 2874",
        statement_date="2025-01-31",
        statement_number="001/2025",
    )
    print(f"Wyciąg bankowy: {statement_id}")

    # Dokument generyczny
    import hashlib
    content = "Treść dokumentu do identyfikacji..."
    content_hash = hashlib.sha256(content.encode()).hexdigest()

    generic_id = generator.generate_generic_id(
        document_type=DocumentType.OTHER,
        content_hash=content_hash,
        document_date="2025-01-15",
        issuer_nip="5213017228",
    )
    print(f"Dokument generyczny: {generic_id}")


def demo_custom_prefix():
    """Demonstracja niestandardowego prefiksu."""
    print("\n" + "=" * 60)
    print("5. Niestandardowy prefiks")
    print("=" * 60)

    # Dla różnych systemów
    for prefix in ["DOC", "KSEF", "ACME", "TEST"]:
        gen = DocumentIDGenerator(prefix=prefix)
        doc_id = gen.generate_invoice_id(
            seller_nip="5213017228",
            invoice_number="FV/2025/001",
            issue_date="2025-01-15",
            gross_amount=100.00,
        )
        print(f"  Prefiks {prefix}: {doc_id}")


def demo_parsing():
    """Demonstracja parsowania ID."""
    print("\n" + "=" * 60)
    print("6. Parsowanie identyfikatora")
    print("=" * 60)

    doc_id = "DOC-FV-A7B3C9D2E1F04856"
    parsed = DocumentIDGenerator.parse_id(doc_id)

    print(f"ID: {doc_id}")
    print(f"  Prefiks: {parsed['prefix']}")
    print(f"  Typ: {parsed['type']}")
    print(f"  Hash: {parsed['hash']}")
    print(f"  DocumentType: {parsed['document_type']}")


def demo_contract_order_independence():
    """Demonstracja niezależności od kolejności stron w umowie."""
    print("\n" + "=" * 60)
    print("7. Umowa - niezależność od kolejności stron")
    print("=" * 60)

    # Strona A jako pierwsza
    id1 = generate_contract_id(
        party1_nip="5213017228",
        party2_nip="9876543210",
        contract_date="2025-01-15",
    )

    # Strona B jako pierwsza
    id2 = generate_contract_id(
        party1_nip="9876543210",
        party2_nip="5213017228",
        contract_date="2025-01-15",
    )

    print(f"Kolejność A-B: {id1}")
    print(f"Kolejność B-A: {id2}")
    print(f"ID są równe: {id1 == id2}")


def main():
    """Uruchom wszystkie demonstracje."""
    print("\n" + "#" * 60)
    print("# DOC Document ID Generator - Demonstracja")
    print("#" * 60)

    demo_basic_usage()
    demo_deterministic()
    demo_normalization()
    demo_document_types()
    demo_custom_prefix()
    demo_parsing()
    demo_contract_order_independence()

    print("\n" + "=" * 60)
    print("Demonstracja zakończona!")
    print("=" * 60)
    print("\nAby przetworzyć rzeczywiste dokumenty z OCR:")
    print("  from docid import process_document, get_document_id")
    print("  result = process_document('faktura.pdf')")
    print("  print(result.document_id)")


if __name__ == "__main__":
    main()
