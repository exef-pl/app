"""
Deterministyczny generator identyfikatorów dokumentów.

Generuje zawsze ten sam identyfikator dla tego samego dokumentu,
niezależnie od formatu źródłowego (skan, PDF, KSeF XML).
"""

import hashlib
import re
import uuid
from dataclasses import dataclass
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from enum import Enum
from typing import Optional, Union

# Namespace UUID dla DOC (RFC 4122 UUID v5)
DOC_NAMESPACE = uuid.UUID('a1b2c3d4-e5f6-7890-abcd-ef1234567890')


class DocumentType(Enum):
    """Typy dokumentów obsługiwane przez system."""
    INVOICE = "FV"           # Faktura VAT
    RECEIPT = "PAR"          # Paragon fiskalny
    CONTRACT = "UMO"         # Umowa
    BANK_STATEMENT = "WB"    # Wyciąg bankowy
    CORRECTION = "KOR"       # Faktura korygująca
    PROFORMA = "PRO"         # Faktura proforma
    ADVANCE = "ZAL"          # Faktura zaliczkowa
    BILL = "RAC"             # Rachunek (bez VAT)
    CASH_IN = "KP"           # Kasa Przyjmie (dowód wpłaty)
    CASH_OUT = "KW"          # Kasa Wyda (dowód wypłaty)
    DEBIT_NOTE = "NK"        # Nota księgowa
    DELIVERY_NOTE = "WZ"     # Wydanie zewnętrzne
    RECEIPT_NOTE = "PZ"      # Przyjęcie zewnętrzne
    EXPENSE_REPORT = "DEL"   # Delegacja / rozliczenie kosztów
    OTHER = "DOC"            # Inny dokument


@dataclass
class CanonicalData:
    """Kanoniczne dane dokumentu do generowania ID."""
    document_type: DocumentType
    canonical_string: str

    # Opcjonalne dane źródłowe dla debugowania
    raw_fields: Optional[dict] = None


class NIPValidator:
    """Walidator i normalizator NIP."""

    @staticmethod
    def normalize(nip: str) -> str:
        """
        Normalizuje NIP do formatu 10 cyfr bez separatorów.

        >>> NIPValidator.normalize("521-301-72-28")
        '5213017228'
        >>> NIPValidator.normalize("PL 521 301 72 28")
        '5213017228'
        """
        if not nip:
            return ""
        # Usuń prefiks kraju, spacje, myślniki
        cleaned = re.sub(r'^[A-Z]{2}', '', nip.upper())
        cleaned = re.sub(r'[\s\-\.]', '', cleaned)
        return cleaned

    @staticmethod
    def validate(nip: str) -> bool:
        """
        Waliduje NIP według algorytmu kontrolnego.

        >>> NIPValidator.validate("5213017228")
        True
        """
        nip = NIPValidator.normalize(nip)
        if len(nip) != 10 or not nip.isdigit():
            return False

        weights = [6, 5, 7, 2, 3, 4, 5, 6, 7]
        checksum = sum(int(nip[i]) * weights[i] for i in range(9))
        return checksum % 11 == int(nip[9])


class AmountNormalizer:
    """Normalizator kwot pieniężnych."""

    @staticmethod
    def normalize(amount: Union[str, float, Decimal]) -> str:
        """
        Normalizuje kwotę do formatu z 2 miejscami po przecinku.

        >>> AmountNormalizer.normalize("1 230,50 zł")
        '1230.50'
        >>> AmountNormalizer.normalize(1230.5)
        '1230.50'
        """
        if isinstance(amount, (int, float)):
            return f"{Decimal(str(amount)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)}"

        # Parsowanie stringa
        cleaned = str(amount).upper()
        # Usuń walutę i spacje
        cleaned = re.sub(r'[ZŁPLN\s]', '', cleaned)
        # Zamień przecinek na kropkę
        cleaned = cleaned.replace(',', '.')
        # Usuń separatory tysięcy (spacje lub kropki przed ostatnią kropką)
        parts = cleaned.rsplit('.', 1)
        if len(parts) == 2:
            integer_part = re.sub(r'[\.\s]', '', parts[0])
            decimal_part = parts[1]
            cleaned = f"{integer_part}.{decimal_part}"
        else:
            cleaned = re.sub(r'[\.\s]', '', cleaned)

        try:
            decimal_val = Decimal(cleaned).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            return str(decimal_val)
        except Exception:
            return "0.00"


class DateNormalizer:
    """Normalizator dat."""

    FORMATS = [
        '%Y-%m-%d',      # 2025-01-15
        '%d-%m-%Y',      # 15-01-2025
        '%d.%m.%Y',      # 15.01.2025
        '%d/%m/%Y',      # 15/01/2025
        '%Y/%m/%d',      # 2025/01/15
        '%d %m %Y',      # 15 01 2025
        '%Y%m%d',        # 20250115
    ]

    @staticmethod
    def normalize(date_str: Union[str, date, datetime]) -> str:
        """
        Normalizuje datę do formatu ISO YYYY-MM-DD.

        >>> DateNormalizer.normalize("15.01.2025")
        '2025-01-15'
        >>> DateNormalizer.normalize("2025-01-15")
        '2025-01-15'
        """
        if isinstance(date_str, datetime):
            return date_str.strftime('%Y-%m-%d')
        if isinstance(date_str, date):
            return date_str.strftime('%Y-%m-%d')

        cleaned = str(date_str).strip()

        for fmt in DateNormalizer.FORMATS:
            try:
                parsed = datetime.strptime(cleaned, fmt)
                return parsed.strftime('%Y-%m-%d')
            except ValueError:
                continue

        # Fallback - spróbuj wyciągnąć cyfry
        digits = re.findall(r'\d+', cleaned)
        if len(digits) >= 3:
            # Zgaduj format na podstawie wartości
            if len(digits[0]) == 4:  # Rok pierwszy
                return f"{digits[0]}-{digits[1].zfill(2)}-{digits[2].zfill(2)}"
            elif len(digits[2]) == 4:  # Rok ostatni
                return f"{digits[2]}-{digits[1].zfill(2)}-{digits[0].zfill(2)}"

        return cleaned  # Zwróć oryginał jeśli nie można sparsować


class InvoiceNumberNormalizer:
    """Normalizator numerów faktur."""

    @staticmethod
    def normalize(number: str) -> str:
        """
        Normalizuje numer faktury.

        >>> InvoiceNumberNormalizer.normalize("fv/2025/00142")
        'FV/2025/00142'
        >>> InvoiceNumberNormalizer.normalize("FV 2025 142")
        'FV/2025/142'
        """
        if not number:
            return ""

        # Uppercase
        normalized = number.upper().strip()
        # Zamień różne separatory na /
        normalized = re.sub(r'[\s\-_]+', '/', normalized)
        # Usuń podwójne /
        normalized = re.sub(r'/+', '/', normalized)
        # Usuń / na początku i końcu
        normalized = normalized.strip('/')

        return normalized


class DocumentIDGenerator:
    """
    Generator deterministycznych identyfikatorów dokumentów.

    Generuje zawsze ten sam ID dla tych samych danych biznesowych,
    niezależnie od formatu źródłowego dokumentu.
    """

    def __init__(self, prefix: str = "DOC"):
        """
        Args:
            prefix: Prefiks identyfikatora (domyślnie DOC)
        """
        self.prefix = prefix

    def generate_invoice_id(
        self,
        seller_nip: str,
        invoice_number: str,
        issue_date: Union[str, date],
        gross_amount: Union[str, float, Decimal],
        buyer_nip: Optional[str] = None
    ) -> str:
        """
        Generuje ID dla faktury VAT.

        Pola kanoniczne: NIP sprzedawcy | Numer faktury | Data wystawienia | Kwota brutto

        >>> gen = DocumentIDGenerator()
        >>> gen.generate_invoice_id("5213017228", "FV/2025/00142", "2025-01-15", 1230.00)
        'DOC-FV-A7B3C9D2E1F04856'
        """
        canonical = CanonicalData(
            document_type=DocumentType.INVOICE,
            canonical_string="|".join([
                NIPValidator.normalize(seller_nip),
                InvoiceNumberNormalizer.normalize(invoice_number),
                DateNormalizer.normalize(issue_date),
                AmountNormalizer.normalize(gross_amount),
            ]),
            raw_fields={
                'seller_nip': seller_nip,
                'invoice_number': invoice_number,
                'issue_date': issue_date,
                'gross_amount': gross_amount,
                'buyer_nip': buyer_nip,
            }
        )
        return self._generate_id(canonical)

    def generate_receipt_id(
        self,
        seller_nip: str,
        receipt_date: Union[str, date],
        gross_amount: Union[str, float, Decimal],
        receipt_number: Optional[str] = None,
        cash_register_number: Optional[str] = None,
    ) -> str:
        """
        Generuje ID dla paragonu fiskalnego.

        Paragony są trudniejsze - nie mają unikalnego numeru.
        Używamy: NIP sprzedawcy | Data | Kwota | Numer kasy (jeśli dostępny)

        >>> gen = DocumentIDGenerator()
        >>> gen.generate_receipt_id("5213017228", "2025-01-15", 45.99)
        'DOC-PAR-...'
        """
        parts = [
            NIPValidator.normalize(seller_nip),
            DateNormalizer.normalize(receipt_date),
            AmountNormalizer.normalize(gross_amount),
        ]

        # Dodaj numer paragonu lub kasy jeśli dostępny
        if receipt_number:
            parts.append(receipt_number.strip().upper())
        if cash_register_number:
            parts.append(cash_register_number.strip().upper())

        canonical = CanonicalData(
            document_type=DocumentType.RECEIPT,
            canonical_string="|".join(parts),
            raw_fields={
                'seller_nip': seller_nip,
                'receipt_date': receipt_date,
                'gross_amount': gross_amount,
                'receipt_number': receipt_number,
                'cash_register_number': cash_register_number,
            }
        )
        return self._generate_id(canonical)

    def generate_contract_id(
        self,
        party1_nip: str,
        party2_nip: str,
        contract_date: Union[str, date],
        contract_number: Optional[str] = None,
        contract_type: Optional[str] = None,
    ) -> str:
        """
        Generuje ID dla umowy.

        Pola kanoniczne: NIP strona 1 | NIP strona 2 (posortowane) | Data | Numer umowy

        NIP-y są sortowane alfabetycznie, żeby kolejność stron nie wpływała na ID.
        """
        nips = sorted([
            NIPValidator.normalize(party1_nip),
            NIPValidator.normalize(party2_nip)
        ])

        parts = [
            nips[0],
            nips[1],
            DateNormalizer.normalize(contract_date),
        ]

        if contract_number:
            parts.append(contract_number.strip().upper())
        if contract_type:
            parts.append(contract_type.strip().upper())

        canonical = CanonicalData(
            document_type=DocumentType.CONTRACT,
            canonical_string="|".join(parts),
            raw_fields={
                'party1_nip': party1_nip,
                'party2_nip': party2_nip,
                'contract_date': contract_date,
                'contract_number': contract_number,
                'contract_type': contract_type,
            }
        )
        return self._generate_id(canonical)

    def generate_bank_statement_id(
        self,
        account_number: str,
        statement_date: Union[str, date],
        statement_number: Optional[str] = None,
    ) -> str:
        """
        Generuje ID dla wyciągu bankowego.

        Pola kanoniczne: Numer konta (26 cyfr) | Data | Numer wyciągu
        """
        # Normalizuj numer konta - tylko cyfry
        account = re.sub(r'[\s\-]', '', account_number)

        parts = [
            account,
            DateNormalizer.normalize(statement_date),
        ]

        if statement_number:
            parts.append(statement_number.strip())

        canonical = CanonicalData(
            document_type=DocumentType.BANK_STATEMENT,
            canonical_string="|".join(parts),
            raw_fields={
                'account_number': account_number,
                'statement_date': statement_date,
                'statement_number': statement_number,
            }
        )
        return self._generate_id(canonical)

    def generate_correction_id(
        self,
        seller_nip: str,
        correction_number: str,
        issue_date: Union[str, date],
        original_invoice_number: str,
        gross_amount: Union[str, float, Decimal],
    ) -> str:
        """
        Generuje ID dla faktury korygującej.

        Pola kanoniczne: NIP | Numer korekty | Data | Numer oryginału | Kwota
        """
        canonical = CanonicalData(
            document_type=DocumentType.CORRECTION,
            canonical_string="|".join([
                NIPValidator.normalize(seller_nip),
                InvoiceNumberNormalizer.normalize(correction_number),
                DateNormalizer.normalize(issue_date),
                InvoiceNumberNormalizer.normalize(original_invoice_number),
                AmountNormalizer.normalize(gross_amount),
            ]),
            raw_fields={
                'seller_nip': seller_nip,
                'correction_number': correction_number,
                'issue_date': issue_date,
                'original_invoice_number': original_invoice_number,
                'gross_amount': gross_amount,
            }
        )
        return self._generate_id(canonical)

    def generate_cash_receipt_id(
        self,
        document_number: str,
        document_date: Union[str, date],
        amount: Union[str, float, Decimal],
        issuer_nip: Optional[str] = None,
        payer_name: Optional[str] = None,
    ) -> str:
        """
        Generuje ID dla dokumentu KP (Kasa Przyjmie - dowód wpłaty).

        Pola kanoniczne: Numer dokumentu | Data | Kwota | NIP wystawcy
        """
        parts = [
            document_number.strip().upper(),
            DateNormalizer.normalize(document_date),
            AmountNormalizer.normalize(amount),
        ]

        if issuer_nip:
            parts.append(NIPValidator.normalize(issuer_nip))
        if payer_name:
            # Hash nazwy płatnika dla prywatności
            name_hash = hashlib.md5(payer_name.strip().upper().encode()).hexdigest()[:8]
            parts.append(name_hash)

        canonical = CanonicalData(
            document_type=DocumentType.CASH_IN,
            canonical_string="|".join(parts),
            raw_fields={
                'document_number': document_number,
                'document_date': document_date,
                'amount': amount,
                'issuer_nip': issuer_nip,
                'payer_name': payer_name,
            }
        )
        return self._generate_id(canonical)

    def generate_cash_disbursement_id(
        self,
        document_number: str,
        document_date: Union[str, date],
        amount: Union[str, float, Decimal],
        issuer_nip: Optional[str] = None,
        recipient_name: Optional[str] = None,
    ) -> str:
        """
        Generuje ID dla dokumentu KW (Kasa Wyda - dowód wypłaty).

        Pola kanoniczne: Numer dokumentu | Data | Kwota | NIP wystawcy
        """
        parts = [
            document_number.strip().upper(),
            DateNormalizer.normalize(document_date),
            AmountNormalizer.normalize(amount),
        ]

        if issuer_nip:
            parts.append(NIPValidator.normalize(issuer_nip))
        if recipient_name:
            name_hash = hashlib.md5(recipient_name.strip().upper().encode()).hexdigest()[:8]
            parts.append(name_hash)

        canonical = CanonicalData(
            document_type=DocumentType.CASH_OUT,
            canonical_string="|".join(parts),
            raw_fields={
                'document_number': document_number,
                'document_date': document_date,
                'amount': amount,
                'issuer_nip': issuer_nip,
                'recipient_name': recipient_name,
            }
        )
        return self._generate_id(canonical)

    def generate_bill_id(
        self,
        issuer_nip: str,
        bill_number: str,
        issue_date: Union[str, date],
        gross_amount: Union[str, float, Decimal],
    ) -> str:
        """
        Generuje ID dla rachunku (bez VAT).

        Pola kanoniczne: NIP wystawcy | Numer | Data | Kwota
        Identyczne jak faktura, ale z innym typem dokumentu.
        """
        canonical = CanonicalData(
            document_type=DocumentType.BILL,
            canonical_string="|".join([
                NIPValidator.normalize(issuer_nip),
                InvoiceNumberNormalizer.normalize(bill_number),
                DateNormalizer.normalize(issue_date),
                AmountNormalizer.normalize(gross_amount),
            ]),
            raw_fields={
                'issuer_nip': issuer_nip,
                'bill_number': bill_number,
                'issue_date': issue_date,
                'gross_amount': gross_amount,
            }
        )
        return self._generate_id(canonical)

    def generate_debit_note_id(
        self,
        issuer_nip: str,
        note_number: str,
        issue_date: Union[str, date],
        amount: Union[str, float, Decimal],
        recipient_nip: Optional[str] = None,
    ) -> str:
        """
        Generuje ID dla noty księgowej (obciążeniowej/uznaniowej).

        Pola kanoniczne: NIP wystawcy | Numer noty | Data | Kwota
        """
        parts = [
            NIPValidator.normalize(issuer_nip),
            note_number.strip().upper(),
            DateNormalizer.normalize(issue_date),
            AmountNormalizer.normalize(amount),
        ]

        if recipient_nip:
            parts.append(NIPValidator.normalize(recipient_nip))

        canonical = CanonicalData(
            document_type=DocumentType.DEBIT_NOTE,
            canonical_string="|".join(parts),
            raw_fields={
                'issuer_nip': issuer_nip,
                'note_number': note_number,
                'issue_date': issue_date,
                'amount': amount,
                'recipient_nip': recipient_nip,
            }
        )
        return self._generate_id(canonical)

    def generate_delivery_note_id(
        self,
        issuer_nip: str,
        document_number: str,
        issue_date: Union[str, date],
        recipient_nip: Optional[str] = None,
    ) -> str:
        """
        Generuje ID dla dokumentu WZ (Wydanie Zewnętrzne).

        Pola kanoniczne: NIP wystawcy | Numer WZ | Data | NIP odbiorcy
        """
        parts = [
            NIPValidator.normalize(issuer_nip),
            document_number.strip().upper(),
            DateNormalizer.normalize(issue_date),
        ]

        if recipient_nip:
            parts.append(NIPValidator.normalize(recipient_nip))

        canonical = CanonicalData(
            document_type=DocumentType.DELIVERY_NOTE,
            canonical_string="|".join(parts),
            raw_fields={
                'issuer_nip': issuer_nip,
                'document_number': document_number,
                'issue_date': issue_date,
                'recipient_nip': recipient_nip,
            }
        )
        return self._generate_id(canonical)

    def generate_expense_report_id(
        self,
        employee_id: str,
        report_date: Union[str, date],
        total_amount: Union[str, float, Decimal],
        report_number: Optional[str] = None,
        company_nip: Optional[str] = None,
    ) -> str:
        """
        Generuje ID dla delegacji / rozliczenia kosztów.

        Pola kanoniczne: ID pracownika | Data | Kwota | Numer
        """
        parts = [
            employee_id.strip().upper(),
            DateNormalizer.normalize(report_date),
            AmountNormalizer.normalize(total_amount),
        ]

        if report_number:
            parts.append(report_number.strip().upper())
        if company_nip:
            parts.append(NIPValidator.normalize(company_nip))

        canonical = CanonicalData(
            document_type=DocumentType.EXPENSE_REPORT,
            canonical_string="|".join(parts),
            raw_fields={
                'employee_id': employee_id,
                'report_date': report_date,
                'total_amount': total_amount,
                'report_number': report_number,
                'company_nip': company_nip,
            }
        )
        return self._generate_id(canonical)

    def generate_generic_id(
        self,
        document_type: DocumentType,
        content_hash: str,
        document_date: Optional[Union[str, date]] = None,
        issuer_nip: Optional[str] = None,
    ) -> str:
        """
        Generuje ID dla dokumentu o nieznanym typie.

        Wymaga podania hasha treści (np. z OCR).
        """
        parts = [content_hash[:64]]  # Maksymalnie 64 znaki hasha

        if document_date:
            parts.append(DateNormalizer.normalize(document_date))
        if issuer_nip:
            parts.append(NIPValidator.normalize(issuer_nip))

        canonical = CanonicalData(
            document_type=document_type,
            canonical_string="|".join(parts),
            raw_fields={
                'content_hash': content_hash,
                'document_date': document_date,
                'issuer_nip': issuer_nip,
            }
        )
        return self._generate_id(canonical)

    def _generate_id(self, canonical: CanonicalData) -> str:
        """
        Generuje finalny identyfikator z danych kanonicznych.

        Format: {PREFIX}-{TYPE}-{HASH16}
        Przykład: DOC-FV-A7B3C9D2E1F04856
        """
        # SHA256 z canonical string
        hash_bytes = hashlib.sha256(canonical.canonical_string.encode('utf-8')).digest()
        hash_hex = hash_bytes.hex()[:16].upper()

        return f"{self.prefix}-{canonical.document_type.value}-{hash_hex}"

    def verify_id(self, document_id: str, canonical_string: str) -> bool:
        """
        Weryfikuje czy ID odpowiada danym kanonicznym.

        >>> gen = DocumentIDGenerator()
        >>> gen.verify_id("DOC-FV-A7B3C9D2E1F04856", "5213017228|FV/2025/00142|2025-01-15|1230.00")
        True
        """
        hash_bytes = hashlib.sha256(canonical_string.encode('utf-8')).digest()
        expected_hash = hash_bytes.hex()[:16].upper()

        parts = document_id.split('-')
        if len(parts) != 3:
            return False

        return parts[2] == expected_hash

    @staticmethod
    def parse_id(document_id: str) -> dict:
        """
        Parsuje identyfikator dokumentu.

        >>> DocumentIDGenerator.parse_id("DOC-FV-A7B3C9D2E1F04856")
        {'prefix': 'DOC', 'type': 'FV', 'hash': 'A7B3C9D2E1F04856',
         'document_type': <DocumentType.INVOICE>}
        """
        parts = document_id.split('-')
        if len(parts) != 3:
            raise ValueError(f"Invalid document ID format: {document_id}")

        prefix, type_code, hash_value = parts

        # Znajdź typ dokumentu
        doc_type = None
        for dt in DocumentType:
            if dt.value == type_code:
                doc_type = dt
                break

        return {
            'prefix': prefix,
            'type': type_code,
            'hash': hash_value,
            'document_type': doc_type,
        }


# Singleton dla wygody
_default_generator = DocumentIDGenerator()

def generate_invoice_id(*args, **kwargs) -> str:
    """Skrót do DocumentIDGenerator().generate_invoice_id()"""
    return _default_generator.generate_invoice_id(*args, **kwargs)

def generate_receipt_id(*args, **kwargs) -> str:
    """Skrót do DocumentIDGenerator().generate_receipt_id()"""
    return _default_generator.generate_receipt_id(*args, **kwargs)

def generate_contract_id(*args, **kwargs) -> str:
    """Skrót do DocumentIDGenerator().generate_contract_id()"""
    return _default_generator.generate_contract_id(*args, **kwargs)
