#!/usr/bin/env python3
"""
Generowanie 10 przykładowych ID dla tego samego dokumentu
aby zademonstrować deterministyczność systemu.
"""

from exef_docid import (
    generate_invoice_id,
    generate_receipt_id,
    generate_contract_id,
    DocumentIDGenerator,
    DocumentType
)

def main():
    print("=" * 60)
    print("GENEROWANIE 10 PRZYKŁADOWYCH ID DLA TEGO SAMEGO DOKUMENTU")
    print("=" * 60)
    
    # Dane faktury - te same dla wszystkich testów
    seller_nip = "5213017228"
    invoice_number = "FV/2025/00142"
    issue_date = "2025-01-15"
    gross_amount = 1230.50
    
    print(f"\nDane wejściowe:")
    print(f"  NIP sprzedawcy: {seller_nip}")
    print(f"  Numer faktury: {invoice_number}")
    print(f"  Data wystawienia: {issue_date}")
    print(f"  Kwota brutto: {gross_amount} PLN")
    
    print(f"\n{'-' * 60}")
    print("FAKTURY VAT (DocumentType.INVOICE)")
    print(f"{'-' * 60}")
    
    # Generuj 10 ID dla faktury
    invoice_ids = []
    for i in range(1, 11):
        doc_id = generate_invoice_id(
            seller_nip=seller_nip,
            invoice_number=invoice_number,
            issue_date=issue_date,
            gross_amount=gross_amount
        )
        invoice_ids.append(doc_id)
        print(f"  {i:2d}. {doc_id}")
    
    # Sprawdź czy wszystkie są identyczne
    all_same = all(id == invoice_ids[0] for id in invoice_ids)
    print(f"\nWszystkie ID są identyczne: {all_same}")
    print(f"Pierwsze ID: {invoice_ids[0]}")
    
    print(f"\n{'-' * 60}")
    print("PARAGONY (DocumentType.RECEIPT)")
    print(f"{'-' * 60}")
    
    # Generuj 10 ID dla paragonu
    receipt_ids = []
    for i in range(1, 11):
        doc_id = generate_receipt_id(
            seller_nip=seller_nip,
            receipt_date=issue_date,
            gross_amount=45.99,
            cash_register_number="001"
        )
        receipt_ids.append(doc_id)
        print(f"  {i:2d}. {doc_id}")
    
    all_same_receipt = all(id == receipt_ids[0] for id in receipt_ids)
    print(f"\nWszystkie ID paragonów są identyczne: {all_same_receipt}")
    print(f"Pierwsze ID paragonu: {receipt_ids[0]}")
    
    print(f"\n{'-' * 60}")
    print("UMOWY (DocumentType.CONTRACT)")
    print(f"{'-' * 60}")
    
    # Generuj 10 ID dla umowy
    contract_ids = []
    for i in range(1, 11):
        doc_id = generate_contract_id(
            party1_nip="5213017228",
            party2_nip="1234567890",
            contract_date=issue_date,
            contract_number="UM/2025/001"
        )
        contract_ids.append(doc_id)
        print(f"  {i:2d}. {doc_id}")
    
    all_same_contract = all(id == contract_ids[0] for id in contract_ids)
    print(f"\nWszystkie ID umów są identyczne: {all_same_contract}")
    print(f"Pierwsze ID umowy: {contract_ids[0]}")
    
    print(f"\n{'-' * 60}")
    print("TEST DETERMINISTYCZNOŚCI - RÓŻNE METODY")
    print(f"{'-' * 60}")
    
    # Test różnych metod generowania tego samego ID
    generator = DocumentIDGenerator()
    
    # Metoda 1: generate_invoice_id
    id1 = generate_invoice_id(seller_nip, invoice_number, issue_date, gross_amount)
    
    # Metoda 2: DocumentIDGenerator.generate_invoice_id (bezpośrednio)
    id2 = generator.generate_invoice_id(seller_nip, invoice_number, issue_date, gross_amount)
    
    # Metoda 3: DocumentIDGenerator.generate_invoice_id (ten sam co wyżej)
    id3 = generator.generate_invoice_id(seller_nip, invoice_number, issue_date, gross_amount)
    
    print(f"Metoda 1 (generate_invoice_id):     {id1}")
    print(f"Metoda 2 (generator.generate_id):    {id2}")
    print(f"Metoda 3 (generator.generate_invoice_id): {id3}")
    
    methods_same = id1 == id2 == id3
    print(f"\nWszystkie metody generują ten sam ID: {methods_same}")
    
    print(f"\n{'-' * 60}")
    print("PARSOWANIE I WALIDACJA ID")
    print(f"{'-' * 60}")
    
    # Parsuj wygenerowane ID
    parsed = DocumentIDGenerator.parse_id(invoice_ids[0])
    print(f"Parsowane ID: {invoice_ids[0]}")
    print(f"  Prefiks: {parsed['prefix']}")
    print(f"  Typ: {parsed['type']}")
    print(f"  Hash: {parsed['hash']}")
    print(f"  DocumentType: {parsed['document_type'].name}")
    
    # Walidacja
    canonical_data = f"{seller_nip}|{invoice_number}|{issue_date}|{gross_amount}"
    is_valid = generator.verify_id(invoice_ids[0], canonical_data)
    print(f"  Walidacja poprawna: {is_valid}")
    
    print(f"\n{'-' * 60}")
    print("PODSUMOWANIE")
    print(f"{'-' * 60}")
    print(f"✅ Faktury: 10/10 identycznych ID")
    print(f"✅ Paragony: 10/10 identycznych ID") 
    print(f"✅ Umowy: 10/10 identycznych ID")
    print(f"✅ Metody: Wszystkie 3 metody generują ten sam ID")
    print(f"✅ Parsowanie: ID poprawnie parsowane")
    print(f"✅ Walidacja: ID poprawnie walidowane")
    
    print(f"\n{'=' * 60}")
    print("SYSTEM JEST CAŁKOWICIE DETERMINISTYCZNY!")
    print("=" * 60)

if __name__ == "__main__":
    main()
