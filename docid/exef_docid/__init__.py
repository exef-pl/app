"""
EXEF Document ID Generator

Deterministyczny generator identyfikatorów dokumentów z OCR.
Generuje zawsze ten sam ID dla tego samego dokumentu,
niezależnie od formatu źródłowego (skan, PDF, KSeF XML).

Przykład użycia:
    from exef_docid import process_document, get_document_id
    
    # Pełne przetwarzanie
    result = process_document("faktura.pdf")
    print(result.document_id)      # EXEF-FV-A7B3C9D2E1F04856
    print(result.extraction.issuer_nip)  # 5213017228
    
    # Tylko ID
    doc_id = get_document_id("paragon.jpg")
    
    # Weryfikacja
    is_same = verify_document_id("skan.png", "EXEF-FV-A7B3C9D2E1F04856")

Wymagania:
    pip install paddleocr paddlepaddle pdf2image pillow
    
    Lub dla Tesseract:
    apt install tesseract-ocr tesseract-ocr-pol
    pip install pytesseract pdf2image pillow
"""

__version__ = "0.1.0"
__author__ = "Softreck"

# Główne API
from .pipeline import (
    DocumentPipeline,
    ProcessedDocument,
    process_document,
    get_document_id,
    verify_document_id,
    get_pipeline,
)

# Generator ID (bez OCR)
from .document_id import (
    DocumentIDGenerator,
    DocumentType,
    generate_invoice_id,
    generate_receipt_id,
    generate_contract_id,
    NIPValidator,
    AmountNormalizer,
    DateNormalizer,
    InvoiceNumberNormalizer,
)

# OCR
from .ocr_processor import (
    OCRProcessor,
    OCREngine,
    DocumentOCRResult,
    OCRResult,
    PaddleOCRProcessor,
    TesseractOCRProcessor,
    preprocess_image_for_ocr,
)

# Ekstraktory
from .extractors import (
    DocumentExtractor,
    ExtractionResult,
    DocumentCategory,
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
]
