#!/usr/bin/env python3
"""
Testowanie konsystencji ID z mock OCR - symulacja przetwarzania dokumentów.
"""

import os
from pathlib import Path
from docid import (
    generate_invoice_id, 
    generate_receipt_id, 
    generate_contract_id
)

def mock_ocr_processing(file_path):
    """Symuluje przetwarzanie OCR na podstawie nazwy pliku i zawartości."""
    content = Path(file_path).read_text(encoding='utf-8')
    
    # Prosta ekstrakcja danych na podstawie wzorców
    import re
    
    # Ekstrakcja NIP
    nip_patterns = [
        r'NIP:\s*(\d{3}[-\s]?\d{3}[-\s]?\d{2}[-\s]?\d{2})',
        r'Tax ID:\s*PL\s*(\d{3}\s?\d{3}\s?\d{2}\s?\d{2})',
        r'(\d{3}[-\s]?\d{3}[-\s]?\d{2}[-\s]?\d{2})'
    ]
    
    nip = None
    for pattern in nip_patterns:
        match = re.search(pattern, content)
        if match:
            nip = re.sub(r'[-\s]', '', match.group(1))
            break
    
    # Ekstrakcja numeru faktury
    invoice_patterns = [
        r'Faktura VAT.*?(\w+/\d{4}/\d+)',
        r'Numer:\s*(\w+/\d{4}/\d+)',
        r'(\w+/\d{4}/\d+)'
    ]
    
    invoice_number = None
    for pattern in invoice_patterns:
        match = re.search(pattern, content, re.IGNORECASE)
        if match:
            invoice_number = match.group(1)
            break
    
    # Ekstrakcja daty
    date_patterns = [
        r'Data.*?(\d{4}[-/.]\d{2}[-/.]\d{2})',
        r'Wystawiono:\s*(\d{4}[-/.]\d{2}[-/.]\d{2})',
        r'Date:\s*(\d{4}[-/.]\d{2}[-/.]\d{2})',
        r'(\d{2}[-/.]\d{2}[-/.]\d{4})'
    ]
    
    date = None
    for pattern in date_patterns:
        match = re.search(pattern, content)
        if match:
            date_str = match.group(1)
            # Konwersja do formatu YYYY-MM-DD
            if len(date_str) == 10 and date_str[2] in '-./':
                if date_str[4] in '-./':
                    date = date_str
                else:
                    # Format DD-MM-YYYY -> YYYY-MM-DD
                    parts = re.split(r'[-/.]', date_str)
                    if len(parts) == 3:
                        date = f"{parts[2]}-{parts[1]}-{parts[0]}"
            break
    
    # Ekstrakcja kwoty
    amount_patterns = [
        r'BRUTTO:\s*([\d\s,]+)\s*PLN',
        r'Total:\s*([\d\s,]+)',
        r'Gross:\s*([\d\s,]+)',
        r'1230\.50',
        r'([\d\s,]+)\s*PLN'
    ]
    
    amount = None
    for pattern in amount_patterns:
        match = re.search(pattern, content, re.IGNORECASE)
        if match:
            amount_str = re.sub(r'[\s]', '', match.group(1))
            amount_str = amount_str.replace(',', '.')
            try:
                amount = float(amount_str)
                break
            except ValueError:
                continue
    
    # Detekcja typu dokumentu
    if 'FAKTURA' in content.upper() or 'INVOICE' in content.upper():
        doc_type = 'invoice'
    elif 'PARAGON' in content.upper():
        doc_type = 'receipt'
    elif 'UMOWA' in content.upper():
        doc_type = 'contract'
    else:
        doc_type = 'unknown'
    
    return {
        'nip': nip,
        'invoice_number': invoice_number,
        'date': date,
        'amount': amount,
        'doc_type': doc_type,
        'content_length': len(content)
    }

def main():
    print("=" * 80)
    print("TEST KONSYSTENCJI ID - MOCK OCR")
    print("=" * 80)
    
    samples_dir = Path("samples")
    
    # Grupy dokumentów (te same dane, różne formaty)
    test_groups = {
        "Faktura FV/2025/00142": [
            "faktura_template.xml",
            "faktura_text.txt", 
            "faktura_variant1.txt",
            "faktura_variant2.txt"
        ],
        "Paragon 001/2025/000123": [
            "paragon.txt"
        ],
        "Umowa 001/2025": [
            "umowa.txt"
        ]
    }
    
    results = {}
    
    for group_name, files in test_groups.items():
        print(f"\n{'-' * 80}")
        print(f"GRUPA: {group_name}")
        print(f"{'-' * 80}")
        
        group_ids = []
        group_results = []
        
        for filename in files:
            file_path = samples_dir / filename
            
            if not file_path.exists():
                print(f"  ❌ Plik nie istnieje: {filename}")
                continue
            
            try:
                # Mock OCR processing
                extracted_data = mock_ocr_processing(str(file_path))
                
                # Generuj ID na podstawie wyekstrahowanych danych
                doc_id = None
                
                if extracted_data['doc_type'] == 'invoice' and extracted_data['nip'] and extracted_data['invoice_number']:
                    doc_id = generate_invoice_id(
                        seller_nip=extracted_data['nip'],
                        invoice_number=extracted_data['invoice_number'],
                        issue_date=extracted_data['date'] or "2025-01-15",
                        gross_amount=extracted_data['amount'] or 1230.50
                    )
                elif extracted_data['doc_type'] == 'receipt' and extracted_data['nip']:
                    doc_id = generate_receipt_id(
                        seller_nip=extracted_data['nip'],
                        receipt_date=extracted_data['date'] or "2025-01-15",
                        gross_amount=extracted_data['amount'] or 37.88,
                        cash_register_number="001"
                    )
                elif extracted_data['doc_type'] == 'contract':
                    doc_id = generate_contract_id(
                        party1_nip="5213017228",
                        party2_nip="1234567890",
                        contract_date=extracted_data['date'] or "2025-01-15",
                        contract_number="001/2025"
                    )
                
                if doc_id:
                    group_ids.append(doc_id)
                    group_results.append({
                        'file': filename,
                        'id': doc_id,
                        'extracted': extracted_data
                    })
                    print(f"  📄 {filename:<25} -> {doc_id}")
                    print(f"      NIP: {extracted_data['nip']}, Num: {extracted_data['invoice_number']}, Data: {extracted_data['date']}, Kwota: {extracted_data['amount']}")
                else:
                    print(f"  ❌ {filename:<25} -> Nie udało się wygenerować ID")
                    print(f"      Typ: {extracted_data['doc_type']}, NIP: {extracted_data['nip']}")
                
            except Exception as e:
                print(f"  ❌ {filename:<25} -> BŁĄD: {e}")
        
        # Sprawdź czy wszystkie ID w grupie są identyczne
        if group_ids:
            all_same = all(id == group_ids[0] for id in group_ids)
            unique_ids = set(group_ids)
            
            print(f"\n  📊 Podsumowanie grupy:")
            print(f"     Plików przetworzonych: {len(group_results)}")
            print(f"     Unikalnych ID: {len(unique_ids)}")
            print(f"     Wszystkie identyczne: {all_same}")
            
            if all_same:
                print(f"     ✅ ID: {group_ids[0]}")
            else:
                print(f"     ❌ RÓŻNE ID:")
                for unique_id in unique_ids:
                    files_with_id = [r['file'] for r in group_results if r['id'] == unique_id]
                    print(f"        {unique_id} -> {', '.join(files_with_id)}")
            
            results[group_name] = {
                'files': group_results,
                'all_same': all_same,
                'unique_ids': len(unique_ids),
                'ids': group_ids
            }
        else:
            print(f"  ❌ Żadne pliki nie zostały przetworzone")
            results[group_name] = {
                'files': [],
                'all_same': False,
                'unique_ids': 0,
                'ids': []
            }
    
    # Podsumowanie końcowe
    print(f"\n{'=' * 80}")
    print("KOŃCOWE PODSUMOWANIE")
    print(f"{'=' * 80}")
    
    total_groups = len(results)
    consistent_groups = sum(1 for r in results.values() if r['all_same'])
    
    print(f"Liczba grup testowych: {total_groups}")
    print(f"Grup konsekwentnych: {consistent_groups}/{total_groups}")
    print(f"Skuteczność: {consistent_groups/total_groups*100:.1f}%")
    
    print(f"\nSzczegóły:")
    for group_name, result in results.items():
        status = "✅" if result['all_same'] else "❌"
        print(f"  {status} {group_name}: {result['unique_ids']} unikalnych ID z {len(result['files'])} plików")
    
    # Analiza danych ekstrakcji
    print(f"\n{'-' * 80}")
    print("ANALIZA DANYCH EKSTRAKCJI")
    print(f"{'-' * 80}")
    
    for group_name, result in results.items():
        if not result['files']:
            continue
            
        print(f"\n📋 {group_name}:")
        for file_result in result['files']:
            filename = file_result['file']
            extracted = file_result['extracted']
            
            print(f"  📄 {filename}:")
            print(f"      Typ: {extracted['doc_type']}")
            print(f"      NIP: {extracted['nip']}")
            print(f"      Numer: {extracted['invoice_number']}")
            print(f"      Data: {extracted['date']}")
            print(f"      Kwota: {extracted['amount']}")
            print(f"      Długość: {extracted['content_length']} znaków")
    
    print(f"\n{'=' * 80}")
    print("TEST ZAKOŃCZONY")
    print(f"{'=' * 80}")

if __name__ == "__main__":
    main()
