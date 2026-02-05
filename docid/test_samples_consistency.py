#!/usr/bin/env python3
"""
Testowanie czy ID są zawsze takie same dla różnych formatów tego samego dokumentu.
"""

import os
from pathlib import Path
from docid import get_document_id, process_document

def main():
    print("=" * 70)
    print("TEST KONSYSTENCJI ID - RÓŻNE FORMATY TEGO SAMEGO DOKUMENTU")
    print("=" * 70)
    
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
        print(f"\n{'-' * 70}")
        print(f"GRUPA: {group_name}")
        print(f"{'-' * 70}")
        
        group_ids = []
        group_results = []
        
        for filename in files:
            file_path = samples_dir / filename
            
            if not file_path.exists():
                print(f"  ❌ Plik nie istnieje: {filename}")
                continue
            
            try:
                # Próbuj uzyskać ID dokumentu
                doc_id = get_document_id(str(file_path))
                group_ids.append(doc_id)
                
                # Dodatkowo próbuj pełnego przetwarzania
                try:
                    result = process_document(str(file_path))
                    confidence = result.ocr_confidence if hasattr(result, 'ocr_confidence') else 'N/A'
                    extraction = result.extraction if hasattr(result, 'extraction') else None
                except Exception as e:
                    confidence = f"Błąd: {e}"
                    extraction = None
                
                group_results.append({
                    'file': filename,
                    'id': doc_id,
                    'confidence': confidence,
                    'extraction': extraction
                })
                
                print(f"  📄 {filename:<25} -> {doc_id} (conf: {confidence})")
                
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
    print(f"\n{'=' * 70}")
    print("KOŃCOWE PODSUMOWANIE")
    print(f"{'=' * 70}")
    
    total_groups = len(results)
    consistent_groups = sum(1 for r in results.values() if r['all_same'])
    
    print(f"Liczba grup testowych: {total_groups}")
    print(f"Grup konsekwentnych: {consistent_groups}/{total_groups}")
    print(f"Skuteczność: {consistent_groups/total_groups*100:.1f}%")
    
    print(f"\nSzczegóły:")
    for group_name, result in results.items():
        status = "✅" if result['all_same'] else "❌"
        print(f"  {status} {group_name}: {result['unique_ids']} unikalnych ID z {len(result['files'])} plików")
    
    # Test szczegółowy ekstrakcji
    print(f"\n{'-' * 70}")
    print("SZCZEGÓŁOWA EKSTRAKCJA DANYCH")
    print(f"{'-' * 70}")
    
    for group_name, result in results.items():
        if not result['files']:
            continue
            
        print(f"\n📋 {group_name}:")
        for file_result in result['files']:
            filename = file_result['file']
            extraction = file_result['extraction']
            
            print(f"  📄 {filename}:")
            if extraction and hasattr(extraction, '__dict__'):
                for attr, value in extraction.__dict__.items():
                    if value and not attr.startswith('_'):
                        print(f"      {attr}: {value}")
            else:
                print(f"      Brak danych ekstrakcji")
    
    print(f"\n{'=' * 70}")
    print("TEST ZAKOŃCZONY")
    print(f"{'=' * 70}")

if __name__ == "__main__":
    main()
