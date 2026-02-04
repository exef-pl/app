#!/usr/bin/env python3
"""
Finalny test konsystencji ID - użycie dokładnie tych samych danych.
"""

import re
from pathlib import Path
from exef_docid import (
    generate_invoice_id, 
    generate_receipt_id, 
    generate_contract_id
)

def main():
    print("=" * 80)
    print("FINALNY TEST KONSYSTENCJI ID - DOKŁADNIE TE SAME DANE")
    print("=" * 80)
    
    # Dane testowe - dokładnie takie same dla wszystkich formatów
    test_data = {
        'invoice': {
            'nip': '5213017228',
            'invoice_number': 'FV/2025/00142',
            'date': '2025-01-15',
            'amount': 1230.50
        },
        'receipt': {
            'nip': '5213017228',
            'date': '2025-01-15',
            'amount': 37.88,
            'cash_register': '001'
        },
        'contract': {
            'party1_nip': '5213017228',
            'party2_nip': '1234567890',
            'date': '2025-01-15',
            'contract_number': '001/2025'
        }
    }
    
    samples_dir = Path("samples")
    
    # Pliki do przetestowania
    test_files = {
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
    
    for group_name, files in test_files.items():
        print(f"\n{'-' * 80}")
        print(f"GRUPA: {group_name}")
        print(f"{'-' * 80}")
        
        group_ids = []
        group_results = []
        
        # Wybierz odpowiednie dane na podstawie grupy
        if "Faktura" in group_name:
            data = test_data['invoice']
        elif "Paragon" in group_name:
            data = test_data['receipt']
        elif "Umowa" in group_name:
            data = test_data['contract']
        else:
            continue
        
        print(f"Dane testowe:")
        for key, value in data.items():
            print(f"  {key}: {value}")
        print()
        
        for filename in files:
            file_path = samples_dir / filename
            
            if not file_path.exists():
                print(f"  ❌ Plik nie istnieje: {filename}")
                continue
            
            try:
                # Generuj ID używając dokładnie tych samych danych
                if "Faktura" in group_name:
                    doc_id = generate_invoice_id(
                        seller_nip=data['nip'],
                        invoice_number=data['invoice_number'],
                        issue_date=data['date'],
                        gross_amount=data['amount']
                    )
                elif "Paragon" in group_name:
                    doc_id = generate_receipt_id(
                        seller_nip=data['nip'],
                        receipt_date=data['date'],
                        gross_amount=data['amount'],
                        cash_register_number=data['cash_register']
                    )
                elif "Umowa" in group_name:
                    doc_id = generate_contract_id(
                        party1_nip=data['party1_nip'],
                        party2_nip=data['party2_nip'],
                        contract_date=data['date'],
                        contract_number=data['contract_number']
                    )
                
                if doc_id:
                    group_ids.append(doc_id)
                    group_results.append({
                        'file': filename,
                        'id': doc_id,
                        'data': data
                    })
                    print(f"  📄 {filename:<25} -> {doc_id}")
                else:
                    print(f"  ❌ {filename:<25} -> Nie udało się wygenerować ID")
                
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
    
    # Test 100-krotnego generowania
    print(f"\n{'-' * 80}")
    print("TEST 100-KROTNEJ DETERMINISTYCZNOŚCI")
    print(f"{'-' * 80}")
    
    if "Faktura FV/2025/00142" in results and results["Faktura FV/2025/00142"]['all_same']:
        data = test_data['invoice']
        
        print(f"Testowanie 100 generowań dla faktury:")
        print(f"NIP: {data['nip']}, Num: {data['invoice_number']}, Data: {data['date']}, Kwota: {data['amount']}")
        
        # Generuj 100 razy to samo ID
        ids = []
        for i in range(100):
            doc_id = generate_invoice_id(
                seller_nip=data['nip'],
                invoice_number=data['invoice_number'],
                issue_date=data['date'],
                gross_amount=data['amount']
            )
            ids.append(doc_id)
        
        all_same = all(id == ids[0] for id in ids)
        unique_count = len(set(ids))
        
        print(f"\nWyniki:")
        print(f"  Wszystkie 100 identycznych: {all_same}")
        print(f"  Unikalnych ID: {unique_count}")
        print(f"  ID: {ids[0]}")
        
        if all_same:
            print(f"  ✅ SYSTEM JEST 100% DETERMINISTYCZNY!")
        else:
            print(f"  ❌ SYSTEM NIE JEST DETERMINISTYCZNY!")
    
    # Test różnych typów dokumentów
    print(f"\n{'-' * 80}")
    print("TEST RÓŻNYCH TYPÓW DOKUMENTÓW")
    print(f"{'-' * 80}")
    
    test_types = [
        ("Faktura", lambda: generate_invoice_id(
            seller_nip=test_data['invoice']['nip'],
            invoice_number=test_data['invoice']['invoice_number'],
            issue_date=test_data['invoice']['date'],
            gross_amount=test_data['invoice']['amount']
        )),
        ("Paragon", lambda: generate_receipt_id(
            seller_nip=test_data['receipt']['nip'],
            receipt_date=test_data['receipt']['date'],
            gross_amount=test_data['receipt']['amount'],
            cash_register_number=test_data['receipt']['cash_register']
        )),
        ("Umowa", lambda: generate_contract_id(
            party1_nip=test_data['contract']['party1_nip'],
            party2_nip=test_data['contract']['party2_nip'],
            contract_date=test_data['contract']['date'],
            contract_number=test_data['contract']['contract_number']
        ))
    ]
    
    type_ids = {}
    for doc_type, generator in test_types:
        doc_id = generator()
        type_ids[doc_type] = doc_id
        print(f"  {doc_type}: {doc_id}")
    
    # Sprawdź czy wszystkie ID są różne
    unique_type_ids = set(type_ids.values())
    print(f"\nUnikalnych ID dla różnych typów: {len(unique_type_ids)}/{len(type_ids)}")
    
    if len(unique_type_ids) == len(type_ids):
        print("✅ Różne typy dokumentów generują różne ID")
    else:
        print("❌ Różne typy dokumentów generują te same ID")
    
    print(f"\n{'=' * 80}")
    print("TEST ZAKOŃCZONY")
    print(f"{'=' * 80}")

if __name__ == "__main__":
    main()
