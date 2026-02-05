#!/usr/bin/env python3
"""
Test uniwersalnych dokumentów - PDF z grafiką, zdjęcia, wektory
"""

from pathlib import Path
from docid.document_id_universal import (
    UniversalDocumentIDGenerator,
    generate_universal_document_id,
    verify_universal_document_id,
    compare_universal_documents
)

def main():
    print("=" * 80)
    print("TEST UNIWERSALNYCH DOKUMENTÓW")
    print("=" * 80)
    
    samples_dir = Path("samples")
    universal_dir = samples_dir / "universal"
    
    if not universal_dir.exists():
        print(f"❌ Folder {universal_dir} nie istnieje")
        return
    
    generator = UniversalDocumentIDGenerator()
    
    # Pobierz wszystkie pliki
    files = list(universal_dir.glob("*"))
    files = [f for f in files if f.is_file()]
    
    print(f"\nZnaleziono {len(files)} plików w folderze universal/")
    
    # Grupuj pliki według typu
    pdf_files = [f for f in files if f.suffix.lower() == '.pdf']
    image_files = [f for f in files if f.suffix.lower() in ['.png', '.jpg', '.jpeg']]
    
    print(f"  PDF: {len(pdf_files)} plików")
    print(f"  Obrazy: {len(image_files)} plików")
    
    results = {}
    
    # Testuj pliki PDF
    print(f"\n{'-' * 80}")
    print("TESTY PLIKÓW PDF")
    print(f"{'-' * 80}")
    
    pdf_ids = []
    for pdf_file in pdf_files:
        try:
            features = generator.get_document_features(pdf_file)
            doc_id = generator.generate_universal_id(pdf_file)
            
            pdf_ids.append(doc_id)
            results[pdf_file.name] = {
                'id': doc_id,
                'features': features,
                'type': 'PDF'
            }
            
            print(f"  📄 {pdf_file.name:<25} -> {doc_id}")
            print(f"      Typ: {features.file_type}, Rozmiar: {features.file_size}B")
            print(f"      Strony: {features.page_count}, Wymiary: {features.dimensions}")
            print(f"      Hash treści: {features.content_hash}")
            if features.visual_hash:
                print(f"      Hash wizualny: {features.visual_hash}")
            if features.text_hash:
                print(f"      Hash tekstu: {features.text_hash}")
            
        except Exception as e:
            print(f"  ❌ {pdf_file.name:<25} -> BŁĄD: {e}")
    
    # Testuj pliki obrazów
    print(f"\n{'-' * 80}")
    print("TESTY PLIKÓW OBRAZÓW")
    print(f"{'-' * 80}")
    
    image_ids = []
    for img_file in image_files:
        try:
            features = generator.get_document_features(img_file)
            doc_id = generator.generate_universal_id(img_file)
            
            image_ids.append(doc_id)
            results[img_file.name] = {
                'id': doc_id,
                'features': features,
                'type': 'IMAGE'
            }
            
            print(f"  🖼️  {img_file.name:<25} -> {doc_id}")
            print(f"      Typ: {features.file_type}, Rozmiar: {features.file_size}B")
            print(f"      Wymiary: {features.dimensions}")
            print(f"      Hash treści: {features.content_hash}")
            if features.visual_hash:
                print(f"      Hash wizualny: {features.visual_hash}")
            if features.color_profile_hash:
                print(f"      Hash kolorów: {features.color_profile_hash}")
            
        except Exception as e:
            print(f"  ❌ {img_file.name:<25} -> BŁĄD: {e}")
    
    # Test spójności między formatami (ten sam dokument, różne formaty)
    print(f"\n{'-' * 80}")
    print("TEST SPOJNOŚCI MIĘDZY FORMATAMI")
    print(f"{'-' * 80}")
    
    # Grupuj pliki po nazwie bazowej (bez rozszerzenia)
    base_names = {}
    for file_path in files:
        base_name = file_path.stem
        if base_name not in base_names:
            base_names[base_name] = []
        base_names[base_name].append(file_path)
    
    consistency_results = {}
    
    for base_name, file_list in base_names.items():
        if len(file_list) > 1:  # Tylko jeśli są różne formaty tej samej nazwy
            print(f"\nGrupa: {base_name}")
            ids_in_group = []
            
            for file_path in file_list:
                if file_path.name in results:
                    doc_id = results[file_path.name]['id']
                    ids_in_group.append(doc_id)
                    print(f"  📄 {file_path.name:<25} -> {doc_id}")
            
            # Sprawdź spójność
            if ids_in_group:
                all_same = all(id == ids_in_group[0] for id in ids_in_group)
                unique_ids = set(ids_in_group)
                
                consistency_results[base_name] = {
                    'files': [f.name for f in file_list],
                    'all_same': all_same,
                    'unique_ids': len(unique_ids),
                    'ids': ids_in_group
                }
                
                print(f"  📊 Wszystkie identyczne: {all_same}")
                if all_same:
                    print(f"  ✅ ID: {ids_in_group[0]}")
                else:
                    print(f"  ❌ Różne ID: {len(unique_ids)} unikalnych")
    
    # Test deterministyczności
    print(f"\n{'-' * 80}")
    print("TEST DETERMINISTYCZNOŚCI (10 GENEROWAŃ)")
    print(f"{'-' * 80}")
    
    # Wybierz kilka plików do testu
    test_files = files[:3] if len(files) >= 3 else files
    
    for test_file in test_files:
        print(f"\nTestowanie: {test_file.name}")
        
        # Generuj 10 razy
        ids = []
        for i in range(10):
            try:
                doc_id = generator.generate_universal_id(test_file)
                ids.append(doc_id)
                print(f"  {i+1:2d}. {doc_id}")
            except Exception as e:
                print(f"  {i+1:2d}. BŁĄD: {e}")
        
        if ids:
            all_same = all(id == ids[0] for id in ids)
            unique_count = len(set(ids))
            
            print(f"  Wszystkie 10 identycznych: {all_same}")
            print(f"  Unikalnych ID: {unique_count}")
            print(f"  ID: {ids[0]}")
            
            if all_same:
                print(f"  ✅ {test_file.name} jest 100% deterministyczny!")
            else:
                print(f"  ❌ {test_file.name} nie jest deterministyczny!")
    
    # Test weryfikacji ID
    print(f"\n{'-' * 80}")
    print("TEST WERYFIKACJI ID")
    print(f"{'-' * 80}")
    
    verification_results = {}
    
    for file_name, result in results.items():
        file_path = universal_dir / file_name
        doc_id = result['id']
        
        try:
            is_valid = generator.verify_universal_id(file_path, doc_id)
            verification_results[file_name] = is_valid
            
            status = "✅" if is_valid else "❌"
            print(f"  {status} {file_name:<25} -> {is_valid}")
        except Exception as e:
            verification_results[file_name] = False
            print(f"  ❌ {file_name:<25} -> BŁĄD: {e}")
    
    # Test porównywania dokumentów
    print(f"\n{'-' * 80}")
    print("TEST PORÓWNYWANIA DOKUMENTÓW")
    print(f"{'-' * 80}")
    
    # Porównaj kilka par dokumentów
    if len(files) >= 2:
        test_pairs = [
            (files[0], files[1]),
            (pdf_files[0] if pdf_files else files[0], image_files[0] if image_files else files[1])
        ]
        
        for file1, file2 in test_pairs:
            if file1.exists() and file2.exists():
                print(f"\nPorównanie: {file1.name} vs {file2.name}")
                
                try:
                    comparison = generator.compare_documents(file1, file2)
                    
                    print(f"  Identyczne ID: {comparison['identical_ids']}")
                    print(f"  ID1: {comparison['id1']}")
                    print(f"  ID2: {comparison['id2']}")
                    print(f"  Ten sam typ: {comparison['same_type']}")
                    print(f"  Ten sam rozmiar: {comparison['same_size']}")
                    print(f"  Ten sam hash treści: {comparison['same_content_hash']}")
                    
                    if comparison['same_visual_hash'] is not None:
                        print(f"  Ten sam hash wizualny: {comparison['same_visual_hash']}")
                    
                    if comparison['same_text_hash'] is not None:
                        print(f"  Ten sam hash tekstu: {comparison['same_text_hash']}")
                        
                except Exception as e:
                    print(f"  ❌ Błąd porównania: {e}")
    
    # Podsumowanie końcowe
    print(f"\n{'=' * 80}")
    print("KOŃCOWE PODSUMOWANIE")
    print(f"{'=' * 80}")
    
    total_files = len(results)
    total_consistent_groups = sum(1 for r in consistency_results.values() if r['all_same'])
    total_verification_passed = sum(1 for v in verification_results.values() if v)
    
    print(f"Liczba przetworzonych plików: {total_files}")
    print(f"Liczba grup spójnych: {total_consistent_groups}/{len(consistency_results)}")
    print(f"Weryfikacje poprawne: {total_verification_passed}/{len(verification_results)}")
    
    print(f"\nTypy dokumentów:")
    type_counts = {}
    for result in results.values():
        doc_type = result['type']
        type_counts[doc_type] = type_counts.get(doc_type, 0) + 1
    
    for doc_type, count in type_counts.items():
        print(f"  {doc_type}: {count} plików")
    
    print(f"\nSpójność grup:")
    for group_name, result in consistency_results.items():
        status = "✅" if result['all_same'] else "❌"
        print(f"  {status} {group_name}: {result['unique_ids']} unikalnych ID z {len(result['files'])} plików")
    
    print(f"\n{'=' * 80}")
    print("TEST ZAKOŃCZONY")
    print(f"{'=' * 80}")

if __name__ == "__main__":
    main()
