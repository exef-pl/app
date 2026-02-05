"""
DOC Document ID Generator

Deterministyczny generator identyfikatorów dokumentów z OCR.
Generuje zawsze ten sam ID dla tego samego dokumentu,
niezależnie od formatu źródłowego (skan, PDF, KSeF XML).

Przykład użycia:
    from docid import process_document, get_document_id

    # Pełne przetwarzanie
    result = process_document("faktura.pdf")
    print(result.document_id)      # DOC-FV-A7B3C9D2E1F04856
    print(result.extraction.issuer_nip)  # 5213017228

    # Tylko ID
    doc_id = get_document_id("paragon.jpg")

    # Weryfikacja
    is_same = verify_document_id("skan.png", "DOC-FV-A7B3C9D2E1F04856")

Wymagania:
    pip install paddleocr paddlepaddle pdf2image pillow

    Lub dla Tesseract:
    apt install tesseract-ocr tesseract-ocr-pol
    pip install pytesseract pdf2image pillow
"""

__version__ = "0.1.6"
__author__ = "Softreck"

# Główne API
# Generator ID (bez OCR)
from .document_id import (
    AmountNormalizer,
    DateNormalizer,
    DocumentIDGenerator,
    DocumentType,
    InvoiceNumberNormalizer,
    NIPValidator,
    generate_contract_id,
    generate_invoice_id,
    generate_receipt_id,
)

# Ekstraktory
from .extractors import (
    DocumentCategory,
    DocumentExtractor,
    ExtractionResult,
)

# OCR
from .ocr_processor import (
    DocumentOCRResult,
    OCREngine,
    OCRProcessor,
    OCRResult,
    PaddleOCRProcessor,
    TesseractOCRProcessor,
    preprocess_image_for_ocr,
)

# Universal Document ID Generator
from .document_id_universal import (
    UniversalDocumentIDGenerator,
    UniversalDocumentFeatures,
    DocumentType as UniversalDocumentType,
    generate_universal_document_id,
    verify_universal_document_id,
    compare_universal_documents,
)
from .pipeline import (
    DocumentPipeline,
    ProcessedDocument,
    get_document_id,
    get_pipeline,
    process_document,
    verify_document_id,
)

__all__ = [
    # Wersja
    '__version__',

    # Pipeline (główne API)
    'DocumentPipeline',
    'ProcessedDocument',
    'process_document',
    'get_document_id',
    'verify_document_id',
    'get_pipeline',

    # Generator ID
    'DocumentIDGenerator',
    'DocumentType',
    'generate_invoice_id',
    'generate_receipt_id',
    'generate_contract_id',

    # Normalizatory
    'NIPValidator',
    'AmountNormalizer',
    'DateNormalizer',
    'InvoiceNumberNormalizer',

    # OCR
    'OCRProcessor',
    'OCREngine',
    'DocumentOCRResult',
    'OCRResult',
    'PaddleOCRProcessor',
    'TesseractOCRProcessor',
    'preprocess_image_for_ocr',

    # Ekstraktory
    'DocumentExtractor',
    'ExtractionResult',
    'DocumentCategory',

    # Universal Document ID Generator
    'UniversalDocumentIDGenerator',
    'UniversalDocumentFeatures',
    'UniversalDocumentType',
    'generate_universal_document_id',
    'verify_universal_document_id',
    'compare_universal_documents',
]
