#!/usr/bin/env python3
"""
Universal Document ID CLI - Complete command-line interface
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Optional, Dict, Any, List
import os

from .document_id import (
    generate_invoice_id,
    generate_receipt_id,
    generate_contract_id,
    DocumentIDGenerator,
)
from .document_id_universal import (
    UniversalDocumentIDGenerator,
    generate_universal_document_id,
    verify_universal_document_id,
    compare_universal_documents
)
from .pipeline import process_document, get_pipeline, DocumentPipeline
from .ocr_processor import OCREngine


def cmd_generate_business_id(args):
    """Generate business document ID"""
    if args.type == 'invoice':
        doc_id = generate_invoice_id(
            seller_nip=args.nip,
            invoice_number=args.number,
            issue_date=args.date,
            gross_amount=args.amount
        )
    elif args.type == 'receipt':
        doc_id = generate_receipt_id(
            seller_nip=args.nip,
            receipt_date=args.date,
            gross_amount=args.amount,
            cash_register_number=args.register
        )
    elif args.type == 'contract':
        doc_id = generate_contract_id(
            party1_nip=args.nip,
            party2_nip=args.party2_nip,
            contract_date=args.date,
            contract_number=args.number
        )
    else:
        print(f"❌ Nieznany typ dokumentu: {args.type}", file=sys.stderr)
        return 1
    
    print(doc_id)
    return 0


def cmd_generate_universal_id(args):
    """Generate universal document ID"""
    try:
        doc_id = generate_universal_document_id(args.file)
        print(doc_id)
        return 0
    except Exception as e:
        print(f"❌ Błąd generowania ID: {e}", file=sys.stderr)
        return 1


def cmd_process_document(args):
    """Process document with full OCR and extraction"""
    try:
        # Choose OCR engine
        ocr_engine = OCREngine.PADDLE
        if args.ocr == 'tesseract':
            ocr_engine = OCREngine.TESSERACT
        
        # Create pipeline with specific settings
        pipeline = DocumentPipeline(ocr_engine=ocr_engine)
        
        # Process document
        result = pipeline.process(args.file)
        
        # Output format
        if args.format == 'json':
            ocr_text = result.ocr_result.full_text if result.ocr_result else ""
            output = {
                'document_id': result.document_id,
                'document_type': result.document_type.value if result.document_type else None,
                'confidence': result.ocr_confidence,
                'extraction': None,
                'ocr_text': ocr_text[:500] + '...' if ocr_text and len(ocr_text) > 500 else ocr_text
            }
            
            if result.extraction:
                output['extraction'] = {
                    'issuer_nip': result.extraction.issuer_nip,
                    'buyer_nip': result.extraction.buyer_nip,
                    'invoice_number': result.extraction.invoice_number,
                    'issue_date': result.extraction.document_date,
                    'gross_amount': result.extraction.gross_amount,
                    'net_amount': result.extraction.net_amount,
                    'vat_amount': result.extraction.vat_amount,
                    'cash_register_number': result.extraction.cash_register_number,
                    'contract_number': result.extraction.contract_number,
                    'party1_nip': result.extraction.issuer_nip,
                    'party2_nip': result.extraction.party2_nip,
                    'contract_date': result.extraction.document_date
                }
            
            ocr_text = result.ocr_result.full_text if result.ocr_result else ""
            output['ocr_text'] = ocr_text[:500] + '...' if ocr_text and len(ocr_text) > 500 else ocr_text
            
            print(json.dumps(output, indent=2, ensure_ascii=False))
        else:
            # Human readable format
            print(f"📄 Dokument: {args.file}")
            print(f"🆔 ID: {result.document_id}")
            if result.document_type:
                print(f"📋 Typ: {result.document_type.value}")
            print(f"🎯 Pewność OCR: {result.ocr_confidence:.2%}")
            if args.verbose:
                print(f"🔗 Canonical: {result.canonical_string}")
            
            if result.extraction:
                print("\n📊 Wyekstrahowane dane:")
                if result.extraction.issuer_nip:
                    print(f"  NIP sprzedawcy: {result.extraction.issuer_nip}")
                if result.extraction.buyer_nip:
                    print(f"  NIP nabywcy: {result.extraction.buyer_nip}")
                if result.extraction.invoice_number:
                    print(f"  Numer faktury: {result.extraction.invoice_number}")
                if result.extraction.document_date:
                    print(f"  Data: {result.extraction.document_date}")
                if result.extraction.gross_amount:
                    print(f"  Kwota brutto: {result.extraction.gross_amount}")
                if result.extraction.cash_register_number:
                    print(f"  Kasa fiskalna: {result.extraction.cash_register_number}")
                if result.extraction.contract_number:
                    print(f"  Numer umowy: {result.extraction.contract_number}")
                if result.extraction.issuer_nip and result.extraction.party2_nip:
                    print(f"  Strony umowy: {result.extraction.issuer_nip} ↔ {result.extraction.party2_nip}")
            
            ocr_text = result.ocr_result.full_text if result.ocr_result else ""
            if args.verbose and ocr_text:
                print(f"\n📝 Tekst OCR:\n{ocr_text}")
        
        return 0
    except Exception as e:
        print(f"❌ Błąd przetwarzania: {e}", file=sys.stderr)
        return 1


def cmd_verify_id(args):
    """Verify document ID"""
    try:
        if args.universal:
            is_valid = verify_universal_document_id(args.file, args.id)
        else:
            # Use pipeline to verify business ID
            pipeline = get_pipeline()
            result = pipeline.process(args.file)
            is_valid = result.document_id == args.id
        
        print(f"✅ Poprawny" if is_valid else "❌ Niepoprawny")
        return 0 if is_valid else 1
    except Exception as e:
        print(f"❌ Błąd weryfikacji: {e}", file=sys.stderr)
        return 1


def cmd_compare_documents(args):
    """Compare two documents (Universal and Business)"""
    try:
        # 1. Universal comparison
        comparison = compare_universal_documents(args.file1, args.file2)
        
        # 2. Business ID comparison (using pipeline)
        pipeline = get_pipeline()
        res1 = pipeline.process(args.file1)
        res2 = pipeline.process(args.file2)
        
        comparison['business_id1'] = res1.document_id
        comparison['business_id2'] = res2.document_id
        comparison['canonical1'] = res1.canonical_string
        comparison['canonical2'] = res2.canonical_string
        comparison['identical_business_ids'] = res1.document_id == res2.document_id
        
        if args.format == 'json':
            print(json.dumps(comparison, indent=2, ensure_ascii=False))
        else:
            print(f"📄 Porównanie dokumentów:")
            print(f"  Plik 1: {args.file1}")
            print(f"  Plik 2: {args.file2}")
            
            print(f"\n✨ WYNIK: {'✅ DOKUMENTY IDENTYCZNE' if comparison['identical_business_ids'] else '❌ DOKUMENTY RÓŻNE'}")
            
            print(f"\n🏢 Identyfikatory Biznesowe (OCR - spójne między formatami):")
            print(f"  Identyczne: {'✅' if comparison['identical_business_ids'] else '❌'}")
            print(f"  ID1: {res1.document_id}")
            print(f"  ID2: {res2.document_id}")
            
            if not comparison['identical_business_ids']:
                print(f"\n🔍 Analiza różnic (Dane kanoniczne):")
                c1 = res1.canonical_string.split('|')
                c2 = res2.canonical_string.split('|')
                labels = ["NIP", "Numer", "Data", "Kwota", "Dodatkowe"]
                
                for i in range(max(len(c1), len(c2))):
                    val1 = c1[i] if i < len(c1) else "BRAK"
                    val2 = c2[i] if i < len(c2) else "BRAK"
                    label = labels[i] if i < len(labels) else f"Pole {i+1}"
                    
                    status = "✅" if val1 == val2 else "❌"
                    print(f"  {status} {label:10}: {val1} vs {val2}")
            
            if res1.document_type:
                print(f"\n📋 Typ: {res1.document_type.value}")

            print(f"\n🌍 Identyfikatory Uniwersalne (Cechy pliku - czułe na format):")
            print(f"  Identyczne: {'✅' if comparison['identical_ids'] else '❌'}")
            print(f"  ID1: {comparison['id1']}")
            print(f"  ID2: {comparison['id2']}")
            
            print(f"\n📊 Szczegóły techniczne:")
            print(f"  Ten sam typ pliku: {'✅' if comparison['same_type'] else '❌'}")
            print(f"  Ten sam rozmiar: {'✅' if comparison['same_size'] else '❌'}")
            print(f"  Ten sam hash treści: {'✅' if comparison['same_content_hash'] else '❌'}")
            if comparison.get('same_visual_hash') is not None:
                print(f"  Ten sam hash wizualny: {'✅' if comparison['same_visual_hash'] else '❌'}")
            if comparison.get('same_text_hash') is not None:
                print(f"  Ten sam hash tekstu: {'✅' if comparison['same_text_hash'] else '❌'}")
        
        return 0
    except Exception as e:
        print(f"❌ Błąd porównywania: {e}", file=sys.stderr)
        return 1


def cmd_batch_process(args):
    """Process multiple documents"""
    try:
        # Choose OCR engine
        ocr_engine = OCREngine.PADDLE
        if args.ocr == 'tesseract':
            ocr_engine = OCREngine.TESSERACT
        
        # Get files
        if args.recursive:
            files = list(Path(args.directory).rglob("*"))
        else:
            files = list(Path(args.directory).glob("*"))
        
        files = [f for f in files if f.is_file()]
        
        if not files:
            print(f"❌ Brak plików w folderze: {args.directory}", file=sys.stderr)
            return 1
        
        print(f"📁 Przetwarzanie {len(files)} plików z {args.directory}")
        
        # Process files
        pipeline = DocumentPipeline(ocr_engine=ocr_engine)
        results = []
        
        for i, file_path in enumerate(files, 1):
            try:
                print(f"\n[{i}/{len(files)}] 📄 {file_path.name}", end="")
                
                result = pipeline.process(str(file_path))
                results.append(result)
                
                print(f" → {result.document_id}")
                
                if args.verbose and result.extraction:
                    print(f"   📊 {result.document_type.value if result.document_type else 'Unknown'}")
                    
            except Exception as e:
                print(f" ❌ Błąd: {e}")
                if args.continue_on_error:
                    continue
                else:
                    return 1
        
        # Summary
        print(f"\n✅ Przetworzono: {len(results)} plików")
        
        if args.duplicates:
            # Find duplicates
            id_counts = {}
            for result in results:
                doc_id = result.document_id
                if doc_id not in id_counts:
                    id_counts[doc_id] = []
                id_counts[doc_id].append(result.source_file)
            
            duplicates = {id_: files for id_, files in id_counts.items() if len(files) > 1}
            
            if duplicates:
                print(f"\n🔍 Znalezione duplikaty ({len(duplicates)} grup):")
                for doc_id, files in duplicates.items():
                    print(f"  {doc_id}:")
                    for file_path in files:
                        print(f"    - {file_path}")
            else:
                print(f"\n✅ Brak duplikatów")
        
        # Save results if requested
        if args.output:
            output_data = []
            for result in results:
                output_data.append({
                    'file': result.source_file,
                    'id': result.document_id,
                    'type': result.document_type.value if result.document_type else None,
                    'confidence': result.ocr_confidence
                })
            
            with open(args.output, 'w', encoding='utf-8') as f:
                json.dump(output_data, f, indent=2, ensure_ascii=False)
            
            print(f"\n💾 Zapisano wyniki do: {args.output}")
        
        return 0
    except Exception as e:
        print(f"❌ Błąd przetwarzania wsadowego: {e}", file=sys.stderr)
        return 1


def cmd_analyze_file(args):
    """Analyze file features (universal)"""
    try:
        generator = UniversalDocumentIDGenerator()
        features = generator.get_document_features(args.file)
        
        if args.format == 'json':
            output = {
                'file': str(args.file),
                'type': features.file_type,
                'size': features.file_size,
                'content_hash': features.content_hash,
                'visual_hash': features.visual_hash,
                'text_hash': features.text_hash,
                'metadata_hash': features.metadata_hash,
                'structure_hash': features.structure_hash,
                'color_profile_hash': features.color_profile_hash,
                'dimensions': features.dimensions,
                'page_count': features.page_count,
                'creation_time': features.creation_time,
                'modification_time': features.modification_time
            }
            print(json.dumps(output, indent=2, ensure_ascii=False))
        else:
            print(f"📄 Analiza pliku: {args.file}")
            print(f"\n📊 Podstawowe informacje:")
            print(f"  Typ: {features.file_type}")
            print(f"  Rozmiar: {features.file_size}B")
            
            if features.dimensions:
                print(f"  Wymiary: {features.dimensions[0]} × {features.dimensions[1]}")
            
            if features.page_count:
                print(f"  Stron: {features.page_count}")
            
            print(f"\n🔐 Hashy:")
            print(f"  Treści: {features.content_hash}")
            if features.visual_hash:
                print(f"  Wizualny: {features.visual_hash}")
            if features.text_hash:
                print(f"  Tekstu: {features.text_hash}")
            if features.metadata_hash:
                print(f"  Metadanych: {features.metadata_hash}")
            if features.color_profile_hash:
                print(f"  Kolorów: {features.color_profile_hash}")
        
        return 0
    except Exception as e:
        print(f"❌ Błąd analizy: {e}", file=sys.stderr)
        return 1


def cmd_test_determinism(args):
    """Test ID determinism"""
    try:
        print(f"🧪 Testowanie determinizmu dla: {args.file}")
        print(f"🔄 Liczba iteracji: {args.iterations}")
        
        ids = []
        
        for i in range(args.iterations):
            if args.universal:
                doc_id = generate_universal_document_id(args.file)
            else:
                # Use pipeline with specified OCR engine
                ocr_engine = OCREngine.PADDLE
                if args.ocr == 'tesseract':
                    ocr_engine = OCREngine.TESSERACT
                
                result = process_document(args.file, ocr_engine=ocr_engine)
                doc_id = result.document_id
            
            ids.append(doc_id)
            
            if args.verbose or i < 5 or i >= args.iterations - 5:
                print(f"  {i+1:3d}. {doc_id}")
            elif i == 5:
                print(f"  ...")
        
        # Check results
        all_same = all(id == ids[0] for id in ids)
        unique_count = len(set(ids))
        
        print(f"\n📊 Wyniki:")
        print(f"  Wszystkie identyczne: {'✅' if all_same else '❌'}")
        print(f"  Unikalnych ID: {unique_count}")
        print(f"  ID: {ids[0]}")
        
        if all_same:
            print(f"\n✅ {args.file} jest 100% deterministyczny!")
        else:
            print(f"\n❌ {args.file} NIE jest deterministyczny!")
        
        return 0 if all_same else 1
    except Exception as e:
        print(f"❌ Błąd testu: {e}", file=sys.stderr)
        return 1


def main():
    """Main CLI entry point"""
    parser = argparse.ArgumentParser(
        prog='docid',
        description='DOC Document ID Generator - CLI'
    )
    
    parser.add_argument('--version', action='version', version='%(prog)s 0.1.0')
    
    subparsers = parser.add_subparsers(dest='command', help='Dostępne komendy')
    
    # Generate business ID
    parser_gen = subparsers.add_parser('generate', help='Generuj ID dokumentu biznesowego')
    parser_gen.add_argument('type', choices=['invoice', 'receipt', 'contract'], help='Typ dokumentu')
    parser_gen.add_argument('--nip', required=True, help='NIP sprzedawcy/strony')
    parser_gen.add_argument('--number', help='Numer dokumentu')
    parser_gen.add_argument('--date', required=True, help='Data dokumentu')
    parser_gen.add_argument('--amount', type=float, help='Kwota')
    parser_gen.add_argument('--register', help='Numer kasy fiskalnej (dla paragonów)')
    parser_gen.add_argument('--party2-nip', help='NIP drugiej strony (dla umów)')
    parser_gen.set_defaults(func=cmd_generate_business_id)
    
    # Generate universal ID
    parser_univ = subparsers.add_parser('universal', help='Generuj uniwersalne ID dokumentu')
    parser_univ.add_argument('file', help='Ścieżka do pliku')
    parser_univ.set_defaults(func=cmd_generate_universal_id)
    
    # Process document
    parser_proc = subparsers.add_parser('process', help='Przetwarzaj dokument z OCR')
    parser_proc.add_argument('file', help='Ścieżka do pliku')
    parser_proc.add_argument('--format', choices=['text', 'json'], default='text', help='Format wyjściowy')
    parser_proc.add_argument('--ocr', choices=['paddle', 'tesseract', 'auto'], default='auto', help='Silnik OCR (domyślnie auto)')
    parser_proc.add_argument('-v', '--verbose', action='store_true', help='Szczegółowe informacje')
    parser_proc.set_defaults(func=cmd_process_document)
    
    # Verify ID
    parser_verify = subparsers.add_parser('verify', help='Weryfikuj ID dokumentu')
    parser_verify.add_argument('file', help='Ścieżka do pliku')
    parser_verify.add_argument('id', help='ID do weryfikacji')
    parser_verify.add_argument('--universal', action='store_true', help='Uniwersalne ID')
    parser_verify.set_defaults(func=cmd_verify_id)
    
    # Compare documents
    parser_compare = subparsers.add_parser('compare', help='Porównaj dwa dokumenty')
    parser_compare.add_argument('file1', help='Pierwszy plik')
    parser_compare.add_argument('file2', help='Drugi plik')
    parser_compare.add_argument('--format', choices=['text', 'json'], default='text', help='Format wyjściowy')
    parser_compare.set_defaults(func=cmd_compare_documents)
    
    # Batch process
    parser_batch = subparsers.add_parser('batch', help='Przetwarzaj wsadowe dokumenty')
    parser_batch.add_argument('directory', help='Folder z dokumentami')
    parser_batch.add_argument('--output', '-o', help='Plik wyjściowy (JSON)')
    parser_batch.add_argument('--ocr', choices=['paddle', 'tesseract', 'auto'], default='auto', help='Silnik OCR (domyślnie auto)')
    parser_batch.add_argument('--recursive', '-r', action='store_true', help='Przetwarzaj rekurencyjnie')
    parser_batch.add_argument('--duplicates', '-d', action='store_true', help='Pokaż duplikaty')
    parser_batch.add_argument('--continue-on-error', action='store_true', help='Kontynuuj przy błędach')
    parser_batch.add_argument('-v', '--verbose', action='store_true', help='Szczegółowe informacje')
    parser_batch.set_defaults(func=cmd_batch_process)
    
    # Analyze file
    parser_analyze = subparsers.add_parser('analyze', help='Analizuj cechy pliku')
    parser_analyze.add_argument('file', help='Ścieżka do pliku')
    parser_analyze.add_argument('--format', choices=['text', 'json'], default='text', help='Format wyjściowy')
    parser_analyze.set_defaults(func=cmd_analyze_file)
    
    # Test determinism
    parser_test = subparsers.add_parser('test', help='Test determinizmu ID')
    parser_test.add_argument('file', help='Ścieżka do pliku')
    parser_test.add_argument('--iterations', '-n', type=int, default=10, help='Liczba iteracji')
    parser_test.add_argument('--universal', action='store_true', help='Uniwersalne ID')
    parser_test.add_argument('--ocr', choices=['paddle', 'tesseract', 'auto'], default='auto', help='Silnik OCR (domyślnie auto)')
    parser_test.add_argument('-v', '--verbose', action='store_true', help='Pokaż wszystkie iteracje')
    parser_test.set_defaults(func=cmd_test_determinism)
    
    # Parse arguments
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return 1
    
    # Execute command
    return args.func(args)


if __name__ == '__main__':
    sys.exit(main())
