#!/usr/bin/env python3
"""
CLI dla EXEF Document ID Generator.

Użycie:
    # Przetwórz pojedynczy plik
    docid process faktura.pdf
    
    # Przetwórz wiele plików
    docid process *.pdf *.jpg
    
    # Batch z katalogu
    docid batch ./dokumenty/ --output results.json
    
    # Weryfikacja ID
    docid verify faktura.pdf EXEF-FV-A7B3C9D2E1F04856
    
    # Tylko OCR (bez generowania ID)
    docid ocr skan.jpg
    
    # Generuj ID bez OCR (z podanych danych)
    docid generate-id --type invoice --nip 5213017228 --number FV/2025/001 --date 2025-01-15 --amount 1230.00
"""

import argparse
import json
import sys
import os
from pathlib import Path
from typing import List, Optional
import logging

# Konfiguracja logowania
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def cmd_process(args):
    """Przetwarza pliki i generuje ID."""
    from . import DocumentPipeline, OCREngine
    
    engine = OCREngine.PADDLE if args.engine == 'paddle' else OCREngine.TESSERACT
    pipeline = DocumentPipeline(
        ocr_engine=engine,
        id_prefix=args.prefix,
        lang=args.lang,
        use_gpu=args.gpu,
    )
    
    results = []
    
    for file_path in args.files:
        file_path = Path(file_path)
        
        if not file_path.exists():
            logger.error(f"File not found: {file_path}")
            continue
        
        try:
            result = pipeline.process(file_path)
            
            output = {
                'file': str(file_path),
                'document_id': result.document_id,
                'type': result.document_type.value,
                'confidence': round(result.ocr_confidence, 3),
                'is_duplicate': result.is_duplicate,
            }
            
            if args.verbose:
                output['extraction'] = {
                    'category': result.extraction.category.value,
                    'issuer_nip': result.extraction.issuer_nip,
                    'document_date': result.extraction.document_date,
                    'gross_amount': result.extraction.gross_amount,
                    'invoice_number': result.extraction.invoice_number,
                }
                output['canonical_string'] = result.canonical_string
            
            results.append(output)
            
            if not args.quiet:
                print(f"{file_path}: {result.document_id}")
                if result.is_duplicate:
                    print(f"  ⚠ Duplicate of: {result.duplicate_of}")
        
        except Exception as e:
            logger.error(f"Error processing {file_path}: {e}")
            if args.verbose:
                import traceback
                traceback.print_exc()
    
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        print(f"\nResults saved to: {args.output}")
    
    return results


def cmd_batch(args):
    """Przetwarza wszystkie pliki z katalogu."""
    from . import DocumentPipeline, OCREngine
    
    directory = Path(args.directory)
    if not directory.is_dir():
        logger.error(f"Not a directory: {directory}")
        sys.exit(1)
    
    # Znajdź pliki
    extensions = {'.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.bmp'}
    files = [
        f for f in directory.rglob('*') 
        if f.suffix.lower() in extensions
    ]
    
    if not files:
        logger.warning(f"No supported files found in {directory}")
        sys.exit(0)
    
    logger.info(f"Found {len(files)} files to process")
    
    # Przetwarzanie
    engine = OCREngine.PADDLE if args.engine == 'paddle' else OCREngine.TESSERACT
    pipeline = DocumentPipeline(
        ocr_engine=engine,
        id_prefix=args.prefix,
        lang=args.lang,
        use_gpu=args.gpu,
    )
    
    results = pipeline.process_batch(
        files,
        skip_duplicates=not args.keep_duplicates,
    )
    
    # Raport
    print(f"\n{'='*60}")
    print(f"Processed: {len(results)} documents")
    print(f"Duplicates found: {sum(1 for r in results if r.is_duplicate)}")
    print(f"{'='*60}\n")
    
    # Zapisz wyniki
    if args.output:
        output_data = [r.to_dict() for r in results]
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False, default=str)
        print(f"Results saved to: {args.output}")
    
    # Podsumowanie po typach
    by_type = {}
    for r in results:
        t = r.document_type.value
        by_type[t] = by_type.get(t, 0) + 1
    
    print("\nBy document type:")
    for t, count in sorted(by_type.items()):
        print(f"  {t}: {count}")


def cmd_verify(args):
    """Weryfikuje czy dokument ma oczekiwany ID."""
    from . import DocumentPipeline, OCREngine
    
    engine = OCREngine.PADDLE if args.engine == 'paddle' else OCREngine.TESSERACT
    pipeline = DocumentPipeline(
        ocr_engine=engine,
        id_prefix=args.prefix,
        lang=args.lang,
    )
    
    result = pipeline.process(args.file)
    
    if result.document_id == args.expected_id:
        print(f"✓ MATCH: {result.document_id}")
        sys.exit(0)
    else:
        print(f"✗ MISMATCH:")
        print(f"  Expected: {args.expected_id}")
        print(f"  Got:      {result.document_id}")
        sys.exit(1)


def cmd_ocr(args):
    """Wykonuje tylko OCR bez generowania ID."""
    from . import OCRProcessor, OCREngine
    
    engine = OCREngine.PADDLE if args.engine == 'paddle' else OCREngine.TESSERACT
    processor = OCRProcessor(
        preferred_engine=engine,
        lang=args.lang,
        use_gpu=args.gpu,
    )
    
    result = processor.process(args.file)
    
    if isinstance(result, list):
        # PDF z wieloma stronami
        for i, page in enumerate(result):
            print(f"\n--- Page {i+1} ---")
            print(page.full_text)
            if args.verbose:
                print(f"\nConfidence: {page.average_confidence:.2%}")
                print(f"NIPs: {page.detected_nips}")
                print(f"Amounts: {page.detected_amounts}")
                print(f"Dates: {page.detected_dates}")
    else:
        print(result.full_text)
        if args.verbose:
            print(f"\nConfidence: {result.average_confidence:.2%}")
            print(f"NIPs: {result.detected_nips}")
            print(f"Amounts: {result.detected_amounts}")
            print(f"Dates: {result.detected_dates}")
            print(f"Invoice numbers: {result.detected_invoice_numbers}")


def cmd_generate_id(args):
    """Generuje ID bez OCR - z podanych danych."""
    from . import DocumentIDGenerator, DocumentType
    
    generator = DocumentIDGenerator(prefix=args.prefix)
    
    if args.type == 'invoice':
        if not all([args.nip, args.number, args.date, args.amount]):
            logger.error("Invoice requires: --nip, --number, --date, --amount")
            sys.exit(1)
        
        doc_id = generator.generate_invoice_id(
            seller_nip=args.nip,
            invoice_number=args.number,
            issue_date=args.date,
            gross_amount=args.amount,
        )
    
    elif args.type == 'receipt':
        if not all([args.nip, args.date, args.amount]):
            logger.error("Receipt requires: --nip, --date, --amount")
            sys.exit(1)
        
        doc_id = generator.generate_receipt_id(
            seller_nip=args.nip,
            receipt_date=args.date,
            gross_amount=args.amount,
            receipt_number=args.number,
        )
    
    elif args.type == 'contract':
        if not all([args.nip, args.nip2, args.date]):
            logger.error("Contract requires: --nip, --nip2, --date")
            sys.exit(1)
        
        doc_id = generator.generate_contract_id(
            party1_nip=args.nip,
            party2_nip=args.nip2,
            contract_date=args.date,
            contract_number=args.number,
        )
    
    else:
        logger.error(f"Unknown type: {args.type}")
        sys.exit(1)
    
    print(doc_id)


def main():
    parser = argparse.ArgumentParser(
        description='EXEF Document ID Generator - deterministyczne ID dokumentów z OCR',
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument('--version', action='version', version='docid 0.1.0')
    
    subparsers = parser.add_subparsers(dest='command', help='Dostępne komendy')
    
    # Wspólne argumenty
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument('--engine', choices=['paddle', 'tesseract'], default='paddle',
                       help='Silnik OCR (domyślnie: paddle)')
    common.add_argument('--lang', default='pl', help='Język dokumentów')
    common.add_argument('--prefix', default='EXEF', help='Prefiks ID')
    common.add_argument('--gpu', action='store_true', help='Użyj GPU')
    common.add_argument('-v', '--verbose', action='store_true', help='Więcej szczegółów')
    
    # process
    p_process = subparsers.add_parser('process', parents=[common],
                                       help='Przetwórz pliki i wygeneruj ID')
    p_process.add_argument('files', nargs='+', help='Pliki do przetworzenia')
    p_process.add_argument('-o', '--output', help='Zapisz wyniki do JSON')
    p_process.add_argument('-q', '--quiet', action='store_true', help='Cichy tryb')
    p_process.set_defaults(func=cmd_process)
    
    # batch
    p_batch = subparsers.add_parser('batch', parents=[common],
                                     help='Przetwórz cały katalog')
    p_batch.add_argument('directory', help='Katalog z dokumentami')
    p_batch.add_argument('-o', '--output', help='Zapisz wyniki do JSON')
    p_batch.add_argument('--keep-duplicates', action='store_true',
                        help='Zachowaj duplikaty w wynikach')
    p_batch.set_defaults(func=cmd_batch)
    
    # verify
    p_verify = subparsers.add_parser('verify', parents=[common],
                                      help='Zweryfikuj ID dokumentu')
    p_verify.add_argument('file', help='Plik do weryfikacji')
    p_verify.add_argument('expected_id', help='Oczekiwany ID')
    p_verify.set_defaults(func=cmd_verify)
    
    # ocr
    p_ocr = subparsers.add_parser('ocr', parents=[common],
                                   help='Wykonaj tylko OCR')
    p_ocr.add_argument('file', help='Plik do OCR')
    p_ocr.set_defaults(func=cmd_ocr)
    
    # generate-id
    p_gen = subparsers.add_parser('generate-id', 
                                   help='Wygeneruj ID z podanych danych (bez OCR)')
    p_gen.add_argument('--type', required=True, 
                      choices=['invoice', 'receipt', 'contract'],
                      help='Typ dokumentu')
    p_gen.add_argument('--nip', help='NIP sprzedawcy/strony 1')
    p_gen.add_argument('--nip2', help='NIP nabywcy/strony 2')
    p_gen.add_argument('--number', help='Numer dokumentu')
    p_gen.add_argument('--date', help='Data (YYYY-MM-DD)')
    p_gen.add_argument('--amount', help='Kwota brutto')
    p_gen.add_argument('--prefix', default='EXEF', help='Prefiks ID')
    p_gen.set_defaults(func=cmd_generate_id)
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
    args.func(args)


if __name__ == '__main__':
    main()
