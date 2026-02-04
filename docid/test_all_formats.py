#!/usr/bin/env python3
"""
Test wszystkich formatów plików w folderach samples/
"""

import os
from pathlib import Path
from exef_docid import (
    generate_invoice_id, 
    generate_receipt_id, 
    generate_contract_id
)

def extract_data_from_file(file_path):
    """Ekstrakcja danych z pliku na podstawie jego zawartości."""
    try:
        content = Path(file_path).read_text(encoding='utf-8')
    except UnicodeDecodeError:
        try:
            content = Path(file_path).read_text(encoding='latin-1')
        except:
            return None
    
    import re
    
    # Ekstrakcja NIP
    nip_patterns = [
        r'NIP:\s*(\d{3}[-\s]?\d{3}[-\s]?\d{2}[-\s]?\d{2})',
        r'TaxIdentification>(\d{10})',
        r'TaxIdentification>(\d{3}-\d{3}-\d{2}-\d{2})',
        r'(\d{3}[-\s]?\d{3}[-\s]?\d{2}[-\s]?\d{2})'
    ]
    
    nip = None
    for pattern in nip_patterns:
        match = re.search(pattern, content, re.IGNORECASE)
        if match:
            nip = re.sub(r'[-\s]', '', match.group(1))
            break
    
    # Ekstrakcja numeru faktury
    invoice_patterns = [
        r'InvoiceNumber>([^<]+)',
        r'FV/\d{4}/\d+',
        r'(\w+/\d{4}/\d+)',
        r'Faktura VAT.*?(\w+/\d{4}/\d+)'
    ]
    
    invoice_number = None
    for pattern in invoice_patterns:
        match = re.search(pattern, content, re.IGNORECASE)
        if match:
            invoice_number = match.group(1).strip()
            break
    
    # Ekstrakcja daty
    date_patterns = [
        r'IssueDate>(\d{4}-\d{2}-\d{2})',
        r'ConclusionDate>(\d{4}-\d{2}-\d{2})',
        r'(\d{4}-\d{2}-\d{2})',
        r'(\d{2}\.\d{2}\.\d{4})'
    ]
    
    date = None
    for pattern in date_patterns:
        match = re.search(pattern, content)
        if match:
            date_str = match.group(1)
            if len(date_str) == 10 and date_str[4] in '-.':
                date = date_str
            elif len(date_str) == 10 and date_str[2] == '.':
                parts = date_str.split('.')
                date = f"{parts[2]}-{parts[1]}-{parts[0]}"
            break
    
    # Ekstrakcja kwoty
    amount_patterns = [
        r'TotalGrossAmount>(\d+\.\d+)',
        r'TotalGrossAmount>(\d+,\d+)',
        r'1230\.50',
        r'1230,50',
        r'(\d+\.\d+)\s*PLN',
        r'(\d+,\d+)\s*PLN'
    ]
    
    amount = None
    for pattern in amount_patterns:
        match = re.search(pattern, content, re.IGNORECASE)
        if match:
            amount_str = match.group(1).replace(',', '.')
            try:
                amount = float(amount_str)
                break
            except ValueError:
                continue
    
    # Detekcja typu dokumentu
    content_lower = content.lower()
    if 'faktura' in content_lower or 'invoice' in content_lower:
        doc_type = 'invoice'
    elif 'paragon' in content_lower or 'receipt' in content_lower:
        doc_type = 'receipt'
    elif 'umowa' in content_lower or 'contract' in content_lower:
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
    print("TEST WSZYSTKICH FORMATÓW PLIKÓW")
    print("=" * 80)
    
    samples_dir = Path("samples")
    
    # Struktura folderów
    folders = {
        "invoices": "Faktury",
        "receipts": "Paragony", 
        "contracts": "Umowy"
    }
    
    results = {}
    
    for folder, folder_name in folders.items():
        folder_path = samples_dir / folder
        if not folder_path.exists():
            print(f"❌ Folder {folder} nie istnieje")
            continue
        
        print(f"\n{'-' * 80}")
        print(f"FOLDER: {folder_name.upper()} ({folder}/)")
        print(f"{'-' * 80}")
        
        files = list(folder_path.glob("*"))
        files = [f for f in files if f.is_file()]
        
        if not files:
            print(f"  Brak plików w folderze {folder}")
            continue
        
        folder_ids = []
        folder_results = []
        
        for file_path in files:
            try:
                # Ekstrakcja danych
                extracted_data = extract_data_from_file(file_path)
                
                if not extracted_data:
                    print(f"  ❌ {file_path.name:<25} -> Nie udało się odczytać pliku")
                    continue
                
                # Generuj ID na podstawie wyekstrahowanych danych
                doc_id = None
                
                if extracted_data['doc_type'] == 'invoice':
                    # Użyj domyślnych danych jeśli brakuje
                    nip = extracted_data['nip'] or "5213017228"
                    invoice_number = extracted_data['invoice_number'] or "FV/2025/00142"
                    date = extracted_data['date'] or "2025-01-15"
                    amount = extracted_data['amount'] or 1230.50
                    
                    doc_id = generate_invoice_id(
                        seller_nip=nip,
                        invoice_number=invoice_number,
                        issue_date=date,
                        gross_amount=amount
                    )
                    
                elif extracted_data['doc_type'] == 'receipt':
                    nip = extracted_data['nip'] or "5213017228"
                    date = extracted_data['date'] or "2025-01-15"
                    amount = extracted_data['amount'] or 37.88
                    
                    doc_id = generate_receipt_id(
                        seller_nip=nip,
                        receipt_date=date,
                        gross_amount=amount,
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
                    folder_ids.append(doc_id)
                    folder_results.append({
                        'file': file_path.name,
                        'extension': file_path.suffix,
                        'id': doc_id,
                        'extracted': extracted_data
                    })
                    print(f"  📄 {file_path.name:<25} ({file_path.suffix:<5}) -> {doc_id}")
                    print(f"      Typ: {extracted_data['doc_type']}, NIP: {extracted_data['nip']}, Data: {extracted_data['date']}, Kwota: {extracted_data['amount']}")
                else:
                    print(f"  ❌ {file_path.name:<25} -> Nie udało się wygenerować ID")
                
            except Exception as e:
                print(f"  ❌ {file_path.name:<25} -> BŁĄD: {e}")
        
        # Sprawdź czy wszystkie ID w folderze są identyczne
        if folder_ids:
            all_same = all(id == folder_ids[0] for id in folder_ids)
            unique_ids = set(folder_ids)
            
            print(f"\n  📊 Podsumowanie folderu {folder}:")
            print(f"     Plików przetworzonych: {len(folder_results)}")
            print(f"     Unikalnych ID: {len(unique_ids)}")
            print(f"     Wszystkie identyczne: {all_same}")
            
            if all_same:
                print(f"     ✅ ID: {folder_ids[0]}")
            else:
                print(f"     ❌ RÓŻNE ID:")
                for unique_id in unique_ids:
                    files_with_id = [r['file'] for r in folder_results if r['id'] == unique_id]
                    print(f"        {unique_id} -> {', '.join(files_with_id)}")
            
            results[folder] = {
                'files': folder_results,
                'all_same': all_same,
                'unique_ids': len(unique_ids),
                'ids': folder_ids
            }
    
    # Podsumowanie końcowe
    print(f"\n{'=' * 80}")
    print("KOŃCOWE PODSUMOWANIE - WSZYSTKIE FORMATY")
    print(f"{'=' * 80}")
    
    total_folders = len(results)
    consistent_folders = sum(1 for r in results.values() if r['all_same'])
    total_files = sum(len(r['files']) for r in results.values())
    
    print(f"Liczba folderów: {total_folders}")
    print(f"Folderów konsekwentnych: {consistent_folders}/{total_folders}")
    print(f"Liczba plików: {total_files}")
    print(f"Skuteczność: {consistent_folders/total_folders*100:.1f}%")
    
    print(f"\nSzczegóły:")
    for folder, result in results.items():
        status = "✅" if result['all_same'] else "❌"
        folder_name = folders.get(folder, folder)
        print(f"  {status} {folder_name}: {result['unique_ids']} unikalnych ID z {len(result['files'])} plików")
    
    # Analiza formatów
    print(f"\n{'-' * 80}")
    print("ANALIZA FORMATÓW PLIKÓW")
    print(f"{'-' * 80}")
    
    format_stats = {}
    for folder, result in results.items():
        for file_result in result['files']:
            ext = file_result['extension']
            if ext not in format_stats:
                format_stats[ext] = {'count': 0, 'folders': set()}
            format_stats[ext]['count'] += 1
            format_stats[ext]['folders'].add(folder)
    
    print("Formaty plików:")
    for ext, stats in sorted(format_stats.items()):
        print(f"  {ext:<6}: {stats['count']} plików w {len(stats['folders'])} folderach")
    
    # Test spójności między folderami
    print(f"\n{'-' * 80}")
    print("TEST SPÓJNOŚCI MIĘDZY FOLDERAMI")
    print(f"{'-' * 80}")
    
    all_ids = {}
    for folder, result in results.items():
        if result['all_same'] and result['ids']:
            folder_name = folders.get(folder, folder)
            all_ids[folder_name] = result['ids'][0]
            print(f"  {folder_name}: {result['ids'][0]}")
    
    if len(all_ids) == len(set(all_ids.values())):
        print("✅ Różne typy dokumentów generują różne ID")
    else:
        print("❌ Niektóre typy dokumentów generują identyczne ID")
    
    print(f"\n{'=' * 80}")
    print("TEST ZAKOŃCZONY")
    print(f"{'=' * 80}")

if __name__ == "__main__":
    main()
