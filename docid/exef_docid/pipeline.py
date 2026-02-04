"""
Pipeline przetwarzania dokumentów.

Łączy OCR, ekstrakcję danych i generowanie deterministycznego ID
w jeden spójny proces.
"""

import hashlib
import logging
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from .document_id import (
    AmountNormalizer,
    DateNormalizer,
    DocumentIDGenerator,
    DocumentType,
    NIPValidator,
)
from .extractors import (
    DocumentCategory,
    DocumentExtractor,
    ExtractionResult,
)
from .ocr_processor import (
    DocumentOCRResult,
    OCREngine,
    OCRProcessor,
)

logger = logging.getLogger(__name__)


@dataclass
class ProcessedDocument:
    """
    Pełny wynik przetwarzania dokumentu.

    Zawiera wygenerowany ID, dane wyekstrahowane z OCR,
    oraz wszystkie metadane potrzebne do dalszego przetwarzania.
    """
    # Identyfikator
    document_id: str
    document_type: DocumentType

    # Dane kanoniczne (użyte do generowania ID)
    canonical_string: str

    # Wyekstrahowane dane
    extraction: ExtractionResult

    # OCR
    ocr_result: DocumentOCRResult
    ocr_confidence: float

    # Metadane
    source_file: str
    processed_at: datetime = field(default_factory=datetime.now)

    # Flagi
    is_duplicate: bool = False
    duplicate_of: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Konwertuje do słownika."""
        return {
            'document_id': self.document_id,
            'document_type': self.document_type.value,
            'canonical_string': self.canonical_string,
            'source_file': self.source_file,
            'processed_at': self.processed_at.isoformat(),
            'ocr_confidence': self.ocr_confidence,
            'is_duplicate': self.is_duplicate,
            'duplicate_of': self.duplicate_of,
            'extraction': {
                'category': self.extraction.category.value,
                'document_date': self.extraction.document_date,
                'issuer_nip': self.extraction.issuer_nip,
                'invoice_number': self.extraction.invoice_number,
                'buyer_nip': self.extraction.buyer_nip,
                'gross_amount': self.extraction.gross_amount,
                'receipt_number': self.extraction.receipt_number,
                'cash_register_number': self.extraction.cash_register_number,
                'contract_number': self.extraction.contract_number,
                'party2_nip': self.extraction.party2_nip,
            }
        }


class DocumentPipeline:
    """
    Główny pipeline przetwarzania dokumentów.

    Przykład użycia:
        pipeline = DocumentPipeline()
        result = pipeline.process("faktura.pdf")
        print(result.document_id)  # EXEF-FV-A7B3C9D2E1F04856
    """

    def __init__(
        self,
        ocr_engine: OCREngine = OCREngine.PADDLE,
        id_prefix: str = "EXEF",
        lang: str = "pl",
        use_gpu: bool = False,
    ):
        """
        Args:
            ocr_engine: Silnik OCR (PADDLE lub TESSERACT)
            id_prefix: Prefiks identyfikatorów (domyślnie EXEF)
            lang: Język dokumentów (pl, en)
            use_gpu: Czy używać GPU (domyślnie False dla CPU)
        """
        self.ocr = OCRProcessor(
            preferred_engine=ocr_engine,
            lang=lang,
            use_gpu=use_gpu,
        )
        self.extractor = DocumentExtractor()
        self.id_generator = DocumentIDGenerator(prefix=id_prefix)

        # Cache przetworzonych dokumentów (dla wykrywania duplikatów)
        self._processed_ids: Dict[str, str] = {}  # canonical_string -> document_id

    def process(
        self,
        file_path: Union[str, Path],
        force_type: Optional[DocumentType] = None,
    ) -> ProcessedDocument:
        """
        Przetwarza pojedynczy plik (obraz lub PDF).

        Args:
            file_path: Ścieżka do pliku
            force_type: Wymuś typ dokumentu (opcjonalne)

        Returns:
            ProcessedDocument z wygenerowanym ID
        """
        file_path = Path(file_path)
        logger.info(f"Processing: {file_path}")

        # 1. OCR
        ocr_result = self.ocr.process(file_path)

        # Dla PDF bierz pierwszą stronę (lub połącz)
        if isinstance(ocr_result, list):
            if len(ocr_result) == 0:
                raise ValueError(f"No pages found in PDF: {file_path}")
            # Połącz tekst ze wszystkich stron
            combined_text = "\n\n".join(r.full_text for r in ocr_result)
            combined_lines = []
            for r in ocr_result:
                combined_lines.extend(r.lines)

            ocr_result = DocumentOCRResult(
                full_text=combined_text,
                lines=combined_lines,
                average_confidence=sum(r.average_confidence for r in ocr_result) / len(ocr_result),
                engine_used=ocr_result[0].engine_used,
                source_file=str(file_path),
                detected_nips=list(set(sum((r.detected_nips for r in ocr_result), []))),
                detected_amounts=list(set(sum((r.detected_amounts for r in ocr_result), []))),
                detected_dates=list(set(sum((r.detected_dates for r in ocr_result), []))),
                detected_invoice_numbers=list(set(sum((r.detected_invoice_numbers for r in ocr_result), []))),
            )

        # 2. Ekstrakcja danych
        extraction = self.extractor.extract(ocr_result)

        # 3. Mapowanie kategorii na typ dokumentu
        doc_type = force_type or self._map_category_to_type(extraction.category)

        # 4. Generowanie ID
        document_id, canonical_string = self._generate_id(extraction, doc_type, ocr_result)

        # 5. Sprawdzenie duplikatów
        is_duplicate = False
        duplicate_of = None

        if canonical_string in self._processed_ids:
            is_duplicate = True
            duplicate_of = self._processed_ids[canonical_string]
            logger.warning(f"Duplicate detected: {document_id} is duplicate of {duplicate_of}")
        else:
            self._processed_ids[canonical_string] = document_id

        return ProcessedDocument(
            document_id=document_id,
            document_type=doc_type,
            canonical_string=canonical_string,
            extraction=extraction,
            ocr_result=ocr_result,
            ocr_confidence=ocr_result.average_confidence,
            source_file=str(file_path),
            is_duplicate=is_duplicate,
            duplicate_of=duplicate_of,
        )

    def process_batch(
        self,
        file_paths: List[Union[str, Path]],
        skip_duplicates: bool = True,
    ) -> List[ProcessedDocument]:
        """
        Przetwarza wiele plików.

        Args:
            file_paths: Lista ścieżek do plików
            skip_duplicates: Czy pomijać duplikaty w wynikach

        Returns:
            Lista ProcessedDocument
        """
        results = []

        for file_path in file_paths:
            try:
                result = self.process(file_path)

                if skip_duplicates and result.is_duplicate:
                    logger.info(f"Skipping duplicate: {file_path}")
                    continue

                results.append(result)

            except Exception as e:
                logger.error(f"Error processing {file_path}: {e}")
                continue

        return results

    def _map_category_to_type(self, category: DocumentCategory) -> DocumentType:
        """Mapuje kategorię ekstrakcji na typ dokumentu."""
        mapping = {
            DocumentCategory.INVOICE: DocumentType.INVOICE,
            DocumentCategory.RECEIPT: DocumentType.RECEIPT,
            DocumentCategory.CONTRACT: DocumentType.CONTRACT,
            DocumentCategory.BANK_STATEMENT: DocumentType.BANK_STATEMENT,
            DocumentCategory.UNKNOWN: DocumentType.OTHER,
        }
        return mapping.get(category, DocumentType.OTHER)

    def _generate_id(
        self,
        extraction: ExtractionResult,
        doc_type: DocumentType,
        ocr_result: DocumentOCRResult,
    ) -> tuple[str, str]:
        """
        Generuje ID na podstawie wyekstrahowanych danych.

        Returns:
            Tuple (document_id, canonical_string)
        """
        if doc_type == DocumentType.INVOICE:
            # Faktura: NIP | Numer | Data | Kwota
            canonical = "|".join([
                NIPValidator.normalize(extraction.issuer_nip or ""),
                (extraction.invoice_number or "").upper(),
                DateNormalizer.normalize(extraction.document_date or ""),
                AmountNormalizer.normalize(extraction.gross_amount or "0"),
            ])
            doc_id = self.id_generator.generate_invoice_id(
                seller_nip=extraction.issuer_nip or "",
                invoice_number=extraction.invoice_number or "",
                issue_date=extraction.document_date or "",
                gross_amount=extraction.gross_amount or "0",
            )

        elif doc_type == DocumentType.RECEIPT:
            # Paragon: NIP | Data | Kwota | Nr paragonu/kasy
            parts = [
                NIPValidator.normalize(extraction.issuer_nip or ""),
                DateNormalizer.normalize(extraction.document_date or ""),
                AmountNormalizer.normalize(extraction.gross_amount or "0"),
            ]
            if extraction.receipt_number:
                parts.append(extraction.receipt_number)
            if extraction.cash_register_number:
                parts.append(extraction.cash_register_number)

            canonical = "|".join(parts)
            doc_id = self.id_generator.generate_receipt_id(
                seller_nip=extraction.issuer_nip or "",
                receipt_date=extraction.document_date or "",
                gross_amount=extraction.gross_amount or "0",
                receipt_number=extraction.receipt_number,
                cash_register_number=extraction.cash_register_number,
            )

        elif doc_type == DocumentType.CONTRACT:
            # Umowa: NIP1 | NIP2 (sorted) | Data | Numer
            nips = sorted([
                NIPValidator.normalize(extraction.issuer_nip or ""),
                NIPValidator.normalize(extraction.party2_nip or ""),
            ])
            parts = [
                nips[0],
                nips[1],
                DateNormalizer.normalize(extraction.document_date or ""),
            ]
            if extraction.contract_number:
                parts.append(extraction.contract_number.upper())

            canonical = "|".join(parts)
            doc_id = self.id_generator.generate_contract_id(
                party1_nip=extraction.issuer_nip or "",
                party2_nip=extraction.party2_nip or "",
                contract_date=extraction.document_date or "",
                contract_number=extraction.contract_number,
            )

        else:
            # Nieznany dokument - hash treści
            content_hash = hashlib.sha256(ocr_result.full_text.encode()).hexdigest()
            canonical = "|".join([
                content_hash[:32],
                DateNormalizer.normalize(extraction.document_date or ""),
                NIPValidator.normalize(extraction.issuer_nip or ""),
            ])
            doc_id = self.id_generator.generate_generic_id(
                document_type=doc_type,
                content_hash=content_hash,
                document_date=extraction.document_date,
                issuer_nip=extraction.issuer_nip,
            )

        return doc_id, canonical

    def verify_document(
        self,
        file_path: Union[str, Path],
        expected_id: str,
    ) -> bool:
        """
        Weryfikuje czy dokument ma oczekiwany ID.

        Przydatne do sprawdzenia czy skan odpowiada oryginałowi.
        """
        result = self.process(file_path)
        return result.document_id == expected_id

    def get_canonical_string(
        self,
        file_path: Union[str, Path],
    ) -> str:
        """Zwraca canonical string dla dokumentu (do debugowania)."""
        result = self.process(file_path)
        return result.canonical_string


# Funkcje pomocnicze dla szybkiego użycia

_default_pipeline: Optional[DocumentPipeline] = None


def get_pipeline() -> DocumentPipeline:
    """Zwraca domyślny pipeline (lazy init)."""
    global _default_pipeline
    if _default_pipeline is None:
        _default_pipeline = DocumentPipeline()
    return _default_pipeline


def process_document(file_path: Union[str, Path]) -> ProcessedDocument:
    """
    Przetwarza dokument i zwraca wynik z ID.

    Przykład:
        result = process_document("faktura.pdf")
        print(result.document_id)
    """
    return get_pipeline().process(file_path)


def get_document_id(file_path: Union[str, Path]) -> str:
    """
    Zwraca tylko ID dokumentu.

    Przykład:
        doc_id = get_document_id("faktura.pdf")
        print(doc_id)  # EXEF-FV-A7B3C9D2E1F04856
    """
    return get_pipeline().process(file_path).document_id


def verify_document_id(file_path: Union[str, Path], expected_id: str) -> bool:
    """
    Weryfikuje czy dokument ma oczekiwany ID.

    Przykład:
        is_valid = verify_document_id("skan.jpg", "EXEF-FV-A7B3C9D2E1F04856")
    """
    return get_pipeline().verify_document(file_path, expected_id)
