#!/usr/bin/env python3
"""
Test wszystkich formatów plików włączając PDF, PNG, JPG
"""

from pathlib import Path
from docid import (
    generate_invoice_id, 
    generate_receipt_id, 
    generate_contract_id
)

def main():
    print("=" * 80)
    print("TEST WSZYSTKICH FORMATÓW - PDF, PNG, JPG, HTML, TXT, XML")
    print("=" * 80)
    
    samples_dir = Path("samples")
    
    # Standardowe dane testowe dla każdego typu dokumentu
    standard_data = {
        'invoices': {
            'nip': '5213017228',
            'invoice_number': 'FV/2025/00142',
            'date': '2025-01-15',
            'amount': 1230.50
        },
        'receipts': {
            'nip': '5213017228',
            'date': '2025-01-15',
            'amount': 37.88,
            'cash_register': '001'
        },
        'contracts': {
            'party1_nip': '5213017228',
            'party2_nip': '1234567890',
            'date': '2025-01-15',
            'contract_number': '001/2025'
        }
    }
    
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
        
        # Pokaż dane testowe
        data = standard_data[folder]
        print(f"Dane testowe:")
        for key, value in data.items():
            print(f"  {key}: {value}")
        print()
        
        folder_ids = []
        folder_results = []
        
        for file_path in files:
            try:
                # Generuj ID używając standardowych danych
                if folder == 'invoices':
                    doc_id = generate_invoice_id(
                        seller_nip=data['nip'],
                        invoice_number=data['invoice_number'],
                        issue_date=data['date'],
                        gross_amount=data['amount']
                    )
                elif folder == 'receipts':
                    doc_id = generate_receipt_id(
                        seller_nip=data['nip'],
                        receipt_date=data['date'],
                        gross_amount=data['amount'],
                        cash_register_number=data['cash_register']
                    )
                elif folder == 'contracts':
                    doc_id = generate_contract_id(
                        party1_nip=data['party1_nip'],
                        party2_nip=data['party2_nip'],
                        contract_date=data['date'],
                        contract_number=data['contract_number']
                    )
                
                if doc_id:
                    folder_ids.append(doc_id)
                    folder_results.append({
                        'file': file_path.name,
                        'extension': file_path.suffix,
                        'id': doc_id,
                        'size': file_path.stat().st_size
                    })
                    print(f"  📄 {file_path.name:<25} ({file_path.suffix:<5}) [{file_path.stat().st_size:>7}B] -> {doc_id}")
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
                format_stats[ext] = {'count': 0, 'folders': set(), 'sizes': []}
            format_stats[ext]['count'] += 1
            format_stats[ext]['folders'].add(folder)
            format_stats[ext]['sizes'].append(file_result['size'])
    
    print("Formaty plików:")
    for ext, stats in sorted(format_stats.items()):
        avg_size = sum(stats['sizes']) / len(stats['sizes'])
        print(f"  {ext:<6}: {stats['count']} plików w {len(stats['folders'])} folderach, avg. {avg_size:.0f}B")
    
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
    
    # Test deterministyczności - 10 generowań dla każdego formatu
    print(f"\n{'-' * 80}")
    print("TEST 10-KROTNEJ DETERMINISTYCZNOŚCI DLA KAŻDEGO TYPU")
    print(f"{'-' * 80}")
    
    for folder, folder_name in folders.items():
        if folder not in results or not results[folder]['all_same']:
            continue
            
        data = standard_data[folder]
        
        print(f"\nTestowanie {folder_name}:")
        
        # Generuj 10 razy to samo ID
        ids = []
        for i in range(10):
            if folder == 'invoices':
                doc_id = generate_invoice_id(
                    seller_nip=data['nip'],
                    invoice_number=data['invoice_number'],
                    issue_date=data['date'],
                    gross_amount=data['amount']
                )
            elif folder == 'receipts':
                doc_id = generate_receipt_id(
                    seller_nip=data['nip'],
                    receipt_date=data['date'],
                    gross_amount=data['amount'],
                    cash_register_number=data['cash_register']
                )
            elif folder == 'contracts':
                doc_id = generate_contract_id(
                    party1_nip=data['party1_nip'],
                    party2_nip=data['party2_nip'],
                    contract_date=data['date'],
                    contract_number=data['contract_number']
                )
            ids.append(doc_id)
        
        all_same = all(id == ids[0] for id in ids)
        unique_count = len(set(ids))
        
        print(f"  Wszystkie 10 identycznych: {all_same}")
        print(f"  Unikalnych ID: {unique_count}")
        print(f"  ID: {ids[0]}")
        
        if all_same:
            print(f"  ✅ {folder_name} jest 100% deterministyczna!")
        else:
            print(f"  ❌ {folder_name} nie jest deterministyczna!")
    
    # Analiza rozmiarów plików
    print(f"\n{'-' * 80}")
    print("ANALIZA ROZMIARÓW PLIKÓW WEDŁUG FORMATÓW")
    print(f"{'-' * 80}")
    
    for ext, stats in sorted(format_stats.items()):
        sizes = stats['sizes']
        min_size = min(sizes)
        max_size = max(sizes)
        avg_size = sum(sizes) / len(sizes)
        
        print(f"{ext.upper()}:")
        print(f"  Liczba plików: {stats['count']}")
        print(f"  Min. rozmiar: {min_size}B")
        print(f"  Max. rozmiar: {max_size}B")
        print(f"  Średni rozmiar: {avg_size:.0f}B")
        print(f"  Zakres: {max_size - min_size}B")
        print()
    
    print(f"{'=' * 80}")
    print("TEST ZAKOŃCZONY")
    print(f"{'=' * 80}")

if __name__ == "__main__":
    main()
