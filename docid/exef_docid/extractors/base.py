"""
Ekstraktory danych z dokumentów OCR.

Każdy ekstraktor specjalizuje się w określonym typie dokumentu
i wyciąga dane kanoniczne potrzebne do generowania ID.
"""

import logging
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

from ..ocr_processor import DocumentOCRResult

logger = logging.getLogger(__name__)


class DocumentCategory(Enum):
    """Kategorie dokumentów."""
    INVOICE = "invoice"
    RECEIPT = "receipt"
    CONTRACT = "contract"
    BANK_STATEMENT = "bank_statement"
    UNKNOWN = "unknown"


@dataclass
class ExtractionResult:
    """Wynik ekstrakcji danych z dokumentu."""
    category: DocumentCategory
    confidence: float

    # Wspólne pola
    document_date: Optional[str] = None
    issuer_nip: Optional[str] = None

    # Pola faktury
    invoice_number: Optional[str] = None
    buyer_nip: Optional[str] = None
    gross_amount: Optional[str] = None
    net_amount: Optional[str] = None
    vat_amount: Optional[str] = None

    # Pola paragonu
    receipt_number: Optional[str] = None
    cash_register_number: Optional[str] = None

    # Pola umowy
    contract_number: Optional[str] = None
    party2_nip: Optional[str] = None
    contract_type: Optional[str] = None

    # Pola wyciągu
    account_number: Optional[str] = None
    statement_number: Optional[str] = None

    # Surowe dane
    raw_text: Optional[str] = None
    all_extracted: Optional[Dict[str, Any]] = None


class BaseExtractor(ABC):
    """Bazowa klasa dla ekstraktorów."""

    @abstractmethod
    def can_extract(self, ocr_result: DocumentOCRResult) -> Tuple[bool, float]:
        """
        Sprawdza czy ekstraktor może przetworzyć dokument.

        Returns:
            Tuple (can_process, confidence)
        """
        pass

    @abstractmethod
    def extract(self, ocr_result: DocumentOCRResult) -> ExtractionResult:
        """Wyciąga dane z dokumentu."""
        pass

    def _normalize_amount(self, amount: str) -> str:
        """Normalizuje kwotę do formatu X.XX"""
        if not amount:
            return ""
        cleaned = re.sub(r'[^\d,\.]', '', amount)
        cleaned = cleaned.replace(',', '.')
        # Usuń separatory tysięcy
        parts = cleaned.rsplit('.', 1)
        if len(parts) == 2 and len(parts[1]) == 2:
            cleaned = parts[0].replace('.', '') + '.' + parts[1]
        try:
            return f"{float(cleaned):.2f}"
        except ValueError:
            return ""

    def _normalize_nip(self, nip: str) -> str:
        """Normalizuje NIP do 10 cyfr."""
        if not nip:
            return ""
        return re.sub(r'[\s\-]', '', nip)

    def _normalize_date(self, date_str: str) -> str:
        """Normalizuje datę do YYYY-MM-DD."""
        if not date_str:
            return ""

        # Różne formaty
        patterns = [
            (r'(\d{4})[/\-\.](\d{2})[/\-\.](\d{2})', r'\1-\2-\3'),  # YYYY-MM-DD
            (r'(\d{2})[/\-\.](\d{2})[/\-\.](\d{4})', r'\3-\2-\1'),  # DD-MM-YYYY
            (r'(\d{2})[/\-\.](\d{2})[/\-\.](\d{2})', lambda m: f'20{m.group(3)}-{m.group(2)}-{m.group(1)}'),  # DD-MM-YY
        ]

        for pattern, replacement in patterns:
            match = re.search(pattern, date_str)
            if match:
                if callable(replacement):
                    return replacement(match)
                return re.sub(pattern, replacement, match.group())

        return date_str


class InvoiceExtractor(BaseExtractor):
    """Ekstraktor dla faktur VAT."""

    INVOICE_KEYWORDS = [
        'faktura', 'fv', 'rachunek', 'invoice',
        'sprzedawca', 'nabywca', 'nip', 'vat',
        'brutto', 'netto', 'podatek'
    ]

    def can_extract(self, ocr_result: DocumentOCRResult) -> Tuple[bool, float]:
        text_lower = ocr_result.full_text.lower()

        # Liczba słów kluczowych
        keyword_count = sum(1 for kw in self.INVOICE_KEYWORDS if kw in text_lower)

        # Czy są NIP-y i kwoty?
        has_nips = len(ocr_result.detected_nips) >= 1
        has_amounts = len(ocr_result.detected_amounts) >= 1
        has_invoice_num = len(ocr_result.detected_invoice_numbers) >= 1

        confidence = min(1.0, keyword_count * 0.15 +
                        (0.2 if has_nips else 0) +
                        (0.2 if has_amounts else 0) +
                        (0.2 if has_invoice_num else 0))

        return confidence > 0.4, confidence

    def extract(self, ocr_result: DocumentOCRResult) -> ExtractionResult:
        text = ocr_result.full_text

        # NIP sprzedawcy - zwykle pierwszy
        seller_nip = ocr_result.detected_nips[0] if ocr_result.detected_nips else None

        # NIP nabywcy - zwykle drugi
        buyer_nip = ocr_result.detected_nips[1] if len(ocr_result.detected_nips) > 1 else None

        # Numer faktury
        invoice_number = self._find_invoice_number(text, ocr_result.detected_invoice_numbers)

        # Data wystawienia
        issue_date = self._find_issue_date(text, ocr_result.detected_dates)

        # Kwoty
        gross_amount, net_amount, vat_amount = self._find_amounts(text, ocr_result.detected_amounts)

        return ExtractionResult(
            category=DocumentCategory.INVOICE,
            confidence=ocr_result.average_confidence,
            document_date=issue_date,
            issuer_nip=seller_nip,
            buyer_nip=buyer_nip,
            invoice_number=invoice_number,
            gross_amount=gross_amount,
            net_amount=net_amount,
            vat_amount=vat_amount,
            raw_text=text,
            all_extracted={
                'detected_nips': ocr_result.detected_nips,
                'detected_amounts': ocr_result.detected_amounts,
                'detected_dates': ocr_result.detected_dates,
                'detected_invoice_numbers': ocr_result.detected_invoice_numbers,
            }
        )

    def _find_invoice_number(self, text: str, detected: List[str]) -> Optional[str]:
        """Znajduje numer faktury."""
        # Szukaj w kontekście
        patterns = [
            r'(?:faktura|fv|rachunek)\s*(?:vat)?\s*(?:nr|numer)?[:\s]*([A-Z0-9\/\-]+)',
            r'(?:nr|numer)\s*(?:faktury|fv)?[:\s]*([A-Z0-9\/\-]+)',
        ]

        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1).strip().upper()

        # Fallback na wykryte numery
        return detected[0] if detected else None

    def _find_issue_date(self, text: str, detected: List[str]) -> Optional[str]:
        """Znajduje datę wystawienia."""
        patterns = [
            r'data\s*wystawienia[:\s]*(\d{2}[.\-/]\d{2}[.\-/]\d{4})',
            r'wystawion[ao]\s*(?:dnia)?[:\s]*(\d{2}[.\-/]\d{2}[.\-/]\d{4})',
            r'data[:\s]*(\d{2}[.\-/]\d{2}[.\-/]\d{4})',
        ]

        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return self._normalize_date(match.group(1))

        return self._normalize_date(detected[0]) if detected else None

    def _find_amounts(self, text: str, detected: List[str]) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        """Znajduje kwoty brutto, netto, VAT."""
        gross = None
        net = None
        vat = None

        # Szukaj kwoty brutto
        brutto_match = re.search(r'brutto[:\s]*(\d[\d\s,\.]*\d)', text, re.IGNORECASE)
        if brutto_match:
            gross = self._normalize_amount(brutto_match.group(1))

        # Szukaj kwoty netto
        netto_match = re.search(r'netto[:\s]*(\d[\d\s,\.]*\d)', text, re.IGNORECASE)
        if netto_match:
            net = self._normalize_amount(netto_match.group(1))

        # Szukaj VAT
        vat_match = re.search(r'(?:vat|podatek)[:\s]*(\d[\d\s,\.]*\d)', text, re.IGNORECASE)
        if vat_match:
            vat = self._normalize_amount(vat_match.group(1))

        # Jeśli nie znaleziono brutto, weź największą kwotę
        if not gross and detected:
            amounts = [float(self._normalize_amount(a) or 0) for a in detected]
            if amounts:
                gross = f"{max(amounts):.2f}"

        return gross, net, vat


class ReceiptExtractor(BaseExtractor):
    """Ekstraktor dla paragonów fiskalnych."""

    RECEIPT_KEYWORDS = [
        'paragon', 'fiskalny', 'kasa', 'sprzedaż',
        'gotówka', 'karta', 'reszta', 'ptu', 'suma'
    ]

    def can_extract(self, ocr_result: DocumentOCRResult) -> Tuple[bool, float]:
        text_lower = ocr_result.full_text.lower()

        keyword_count = sum(1 for kw in self.RECEIPT_KEYWORDS if kw in text_lower)

        # Paragon ma specyficzny format - brak NIP nabywcy, wiele pozycji
        has_fiscal_markers = 'fiskaln' in text_lower or 'paragon' in text_lower
        has_ptu = 'ptu' in text_lower or bool(re.search(r'\d+%', text_lower))

        confidence = min(1.0, keyword_count * 0.15 +
                        (0.3 if has_fiscal_markers else 0) +
                        (0.2 if has_ptu else 0))

        return confidence > 0.4, confidence

    def extract(self, ocr_result: DocumentOCRResult) -> ExtractionResult:
        text = ocr_result.full_text

        # NIP sprzedawcy
        seller_nip = ocr_result.detected_nips[0] if ocr_result.detected_nips else None

        # Data
        receipt_date = ocr_result.detected_dates[0] if ocr_result.detected_dates else None

        # Kwota - szukaj SUMA lub ostatniej dużej kwoty
        gross_amount = self._find_total_amount(text, ocr_result.detected_amounts)

        # Numer paragonu / kasy
        receipt_num, cash_register = self._find_receipt_identifiers(text)

        return ExtractionResult(
            category=DocumentCategory.RECEIPT,
            confidence=ocr_result.average_confidence,
            document_date=self._normalize_date(receipt_date) if receipt_date else None,
            issuer_nip=seller_nip,
            gross_amount=gross_amount,
            receipt_number=receipt_num,
            cash_register_number=cash_register,
            raw_text=text,
            all_extracted={
                'detected_nips': ocr_result.detected_nips,
                'detected_amounts': ocr_result.detected_amounts,
                'detected_dates': ocr_result.detected_dates,
            }
        )

    def _find_total_amount(self, text: str, detected: List[str]) -> Optional[str]:
        """Znajduje kwotę SUMA na paragonie."""
        patterns = [
            r'suma[:\s]*(\d[\d\s,\.]*\d)',
            r'razem[:\s]*(\d[\d\s,\.]*\d)',
            r'do zapłaty[:\s]*(\d[\d\s,\.]*\d)',
        ]

        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return self._normalize_amount(match.group(1))

        # Fallback - największa kwota
        if detected:
            amounts = [float(self._normalize_amount(a) or 0) for a in detected]
            if amounts:
                return f"{max(amounts):.2f}"

        return None

    def _find_receipt_identifiers(self, text: str) -> Tuple[Optional[str], Optional[str]]:
        """Znajduje numer paragonu i numer kasy."""
        receipt_num = None
        cash_register = None

        # Numer paragonu
        receipt_match = re.search(r'(?:nr|numer)\s*(?:paragonu)?[:\s]*(\d+)', text, re.IGNORECASE)
        if receipt_match:
            receipt_num = receipt_match.group(1)

        # Numer kasy
        cash_match = re.search(r'(?:kasa|stanowisko)[:\s]*(\d+)', text, re.IGNORECASE)
        if cash_match:
            cash_register = cash_match.group(1)

        return receipt_num, cash_register


class ContractExtractor(BaseExtractor):
    """Ekstraktor dla umów."""

    CONTRACT_KEYWORDS = [
        'umowa', 'kontrakt', 'porozumienie', 'zlecenie',
        'strona', 'wykonawca', 'zamawiający', 'zleceniodawca',
        'przedmiot', 'wynagrodzenie', 'termin'
    ]

    def can_extract(self, ocr_result: DocumentOCRResult) -> Tuple[bool, float]:
        text_lower = ocr_result.full_text.lower()

        keyword_count = sum(1 for kw in self.CONTRACT_KEYWORDS if kw in text_lower)

        has_contract_header = 'umowa' in text_lower or 'kontrakt' in text_lower
        has_parties = 'strona' in text_lower or 'wykonawca' in text_lower

        confidence = min(1.0, keyword_count * 0.1 +
                        (0.3 if has_contract_header else 0) +
                        (0.2 if has_parties else 0))

        return confidence > 0.4, confidence

    def extract(self, ocr_result: DocumentOCRResult) -> ExtractionResult:
        text = ocr_result.full_text

        # NIP-y stron
        party1_nip = ocr_result.detected_nips[0] if ocr_result.detected_nips else None
        party2_nip = ocr_result.detected_nips[1] if len(ocr_result.detected_nips) > 1 else None

        # Data umowy
        contract_date = self._find_contract_date(text, ocr_result.detected_dates)

        # Numer umowy
        contract_number = self._find_contract_number(text)

        # Typ umowy
        contract_type = self._find_contract_type(text)

        return ExtractionResult(
            category=DocumentCategory.CONTRACT,
            confidence=ocr_result.average_confidence,
            document_date=contract_date,
            issuer_nip=party1_nip,
            party2_nip=party2_nip,
            contract_number=contract_number,
            contract_type=contract_type,
            raw_text=text,
            all_extracted={
                'detected_nips': ocr_result.detected_nips,
                'detected_dates': ocr_result.detected_dates,
            }
        )

    def _find_contract_date(self, text: str, detected: List[str]) -> Optional[str]:
        patterns = [
            r'zawarta\s*(?:w\s*dniu)?[:\s]*(\d{2}[.\-/]\d{2}[.\-/]\d{4})',
            r'dnia[:\s]*(\d{2}[.\-/]\d{2}[.\-/]\d{4})',
            r'data[:\s]*(\d{2}[.\-/]\d{2}[.\-/]\d{4})',
        ]

        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return self._normalize_date(match.group(1))

        return self._normalize_date(detected[0]) if detected else None

    def _find_contract_number(self, text: str) -> Optional[str]:
        patterns = [
            r'umowa\s*(?:nr|numer)?[:\s]*([A-Z0-9\/\-]+)',
            r'(?:nr|numer)\s*(?:umowy)?[:\s]*([A-Z0-9\/\-]+)',
        ]

        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1).strip().upper()

        return None

    def _find_contract_type(self, text: str) -> Optional[str]:
        types = {
            'zlecenie': 'ZLECENIE',
            'o dzieło': 'DZIELO',
            'najmu': 'NAJEM',
            'sprzedaży': 'SPRZEDAZ',
            'współpracy': 'WSPOLPRACA',
            'o pracę': 'PRACA',
        }

        text_lower = text.lower()
        for keyword, contract_type in types.items():
            if keyword in text_lower:
                return contract_type

        return None


class DocumentExtractor:
    """
    Główny ekstraktor dokumentów.

    Automatycznie wybiera odpowiedni ekstraktor na podstawie treści.
    """

    def __init__(self):
        self.extractors: List[BaseExtractor] = [
            InvoiceExtractor(),
            ReceiptExtractor(),
            ContractExtractor(),
        ]

    def extract(self, ocr_result: DocumentOCRResult) -> ExtractionResult:
        """
        Wyciąga dane z dokumentu OCR.

        Automatycznie wybiera najlepszy ekstraktor.
        """
        best_extractor = None
        best_confidence = 0.0

        for extractor in self.extractors:
            can_extract, confidence = extractor.can_extract(ocr_result)
            if can_extract and confidence > best_confidence:
                best_confidence = confidence
                best_extractor = extractor

        if best_extractor:
            logger.info(f"Using {best_extractor.__class__.__name__} with confidence {best_confidence:.2f}")
            return best_extractor.extract(ocr_result)

        # Fallback - nieznany dokument
        logger.warning("Could not determine document type, returning unknown")
        return ExtractionResult(
            category=DocumentCategory.UNKNOWN,
            confidence=ocr_result.average_confidence,
            document_date=ocr_result.detected_dates[0] if ocr_result.detected_dates else None,
            issuer_nip=ocr_result.detected_nips[0] if ocr_result.detected_nips else None,
            raw_text=ocr_result.full_text,
            all_extracted={
                'detected_nips': ocr_result.detected_nips,
                'detected_amounts': ocr_result.detected_amounts,
                'detected_dates': ocr_result.detected_dates,
                'detected_invoice_numbers': ocr_result.detected_invoice_numbers,
            }
        )

    def extract_all(self, ocr_result: DocumentOCRResult) -> List[ExtractionResult]:
        """
        Wyciąga dane wszystkimi pasującymi ekstraktorami.

        Przydatne do porównania wyników.
        """
        results = []

        for extractor in self.extractors:
            can_extract, confidence = extractor.can_extract(ocr_result)
            if can_extract:
                result = extractor.extract(ocr_result)
                result.confidence = confidence  # Użyj confidence z can_extract
                results.append(result)

        return sorted(results, key=lambda r: r.confidence, reverse=True)
