"""
Testy dla generatora identyfikatorów dokumentów.
"""

import pytest
from exef_docid.document_id import (
    DocumentIDGenerator,
    DocumentType,
    NIPValidator,
    AmountNormalizer,
    DateNormalizer,
    InvoiceNumberNormalizer,
)


class TestNIPValidator:
    """Testy walidatora NIP."""
    
    def test_normalize_with_dashes(self):
        assert NIPValidator.normalize("521-301-72-28") == "5213017228"
    
    def test_normalize_with_spaces(self):
        assert NIPValidator.normalize("521 301 72 28") == "5213017228"
    
    def test_normalize_with_country_prefix(self):
        assert NIPValidator.normalize("PL5213017228") == "5213017228"
        assert NIPValidator.normalize("PL 521-301-72-28") == "5213017228"
    
    def test_normalize_clean(self):
        assert NIPValidator.normalize("5213017228") == "5213017228"
    
    def test_validate_valid_nip(self):
        # Rzeczywiste NIP-y do testów
        assert NIPValidator.validate("5213017228") is True
        assert NIPValidator.validate("521-301-72-28") is True
    
    def test_validate_invalid_nip(self):
        assert NIPValidator.validate("1234567890") is False
        assert NIPValidator.validate("123456789") is False  # za krótki
        assert NIPValidator.validate("12345678901") is False  # za długi


class TestAmountNormalizer:
    """Testy normalizatora kwot."""
    
    def test_normalize_float(self):
        assert AmountNormalizer.normalize(1230.5) == "1230.50"
        assert AmountNormalizer.normalize(1230.0) == "1230.00"
        assert AmountNormalizer.normalize(0.99) == "0.99"
    
    def test_normalize_string_with_comma(self):
        assert AmountNormalizer.normalize("1230,50") == "1230.50"
    
    def test_normalize_string_with_currency(self):
        assert AmountNormalizer.normalize("1230,50 zł") == "1230.50"
        assert AmountNormalizer.normalize("1230.50 PLN") == "1230.50"
    
    def test_normalize_string_with_thousands(self):
        assert AmountNormalizer.normalize("1 230,50") == "1230.50"
        assert AmountNormalizer.normalize("1 230 500,00") == "1230500.00"
    
    def test_normalize_rounding(self):
        assert AmountNormalizer.normalize(1230.555) == "1230.56"
        assert AmountNormalizer.normalize(1230.554) == "1230.55"


class TestDateNormalizer:
    """Testy normalizatora dat."""
    
    def test_normalize_iso_format(self):
        assert DateNormalizer.normalize("2025-01-15") == "2025-01-15"
    
    def test_normalize_polish_format(self):
        assert DateNormalizer.normalize("15.01.2025") == "2025-01-15"
        assert DateNormalizer.normalize("15-01-2025") == "2025-01-15"
        assert DateNormalizer.normalize("15/01/2025") == "2025-01-15"
    
    def test_normalize_compact_format(self):
        assert DateNormalizer.normalize("20250115") == "2025-01-15"
    
    def test_normalize_datetime_object(self):
        from datetime import date, datetime
        assert DateNormalizer.normalize(date(2025, 1, 15)) == "2025-01-15"
        assert DateNormalizer.normalize(datetime(2025, 1, 15, 12, 30)) == "2025-01-15"


class TestInvoiceNumberNormalizer:
    """Testy normalizatora numerów faktur."""
    
    def test_normalize_lowercase(self):
        assert InvoiceNumberNormalizer.normalize("fv/2025/00142") == "FV/2025/00142"
    
    def test_normalize_spaces(self):
        assert InvoiceNumberNormalizer.normalize("FV 2025 142") == "FV/2025/142"
    
    def test_normalize_dashes(self):
        assert InvoiceNumberNormalizer.normalize("FV-2025-142") == "FV/2025/142"
    
    def test_normalize_mixed(self):
        assert InvoiceNumberNormalizer.normalize("fv_2025-00142") == "FV/2025/00142"
    
    def test_normalize_clean(self):
        assert InvoiceNumberNormalizer.normalize("FV/2025/00142") == "FV/2025/00142"


class TestDocumentIDGenerator:
    """Testy generatora ID."""
    
    @pytest.fixture
    def generator(self):
        return DocumentIDGenerator(prefix="EXEF")
    
    def test_generate_invoice_id_deterministic(self, generator):
        """Ten sam input = ten sam output."""
        id1 = generator.generate_invoice_id(
            seller_nip="5213017228",
            invoice_number="FV/2025/00142",
            issue_date="2025-01-15",
            gross_amount=1230.50,
        )
        id2 = generator.generate_invoice_id(
            seller_nip="5213017228",
            invoice_number="FV/2025/00142",
            issue_date="2025-01-15",
            gross_amount=1230.50,
        )
        assert id1 == id2
    
    def test_generate_invoice_id_normalized(self, generator):
        """Różne formaty tych samych danych = ten sam ID."""
        id1 = generator.generate_invoice_id(
            seller_nip="521-301-72-28",
            invoice_number="fv/2025/00142",
            issue_date="15.01.2025",
            gross_amount="1 230,50 zł",
        )
        id2 = generator.generate_invoice_id(
            seller_nip="5213017228",
            invoice_number="FV/2025/00142",
            issue_date="2025-01-15",
            gross_amount=1230.50,
        )
        assert id1 == id2
    
    def test_generate_invoice_id_format(self, generator):
        """Sprawdź format ID."""
        doc_id = generator.generate_invoice_id(
            seller_nip="5213017228",
            invoice_number="FV/2025/00142",
            issue_date="2025-01-15",
            gross_amount=1230.50,
        )
        
        assert doc_id.startswith("EXEF-FV-")
        parts = doc_id.split("-")
        assert len(parts) == 3
        assert parts[0] == "EXEF"
        assert parts[1] == "FV"
        assert len(parts[2]) == 16
        assert all(c in "0123456789ABCDEF" for c in parts[2])
    
    def test_generate_receipt_id(self, generator):
        """Test generowania ID paragonu."""
        doc_id = generator.generate_receipt_id(
            seller_nip="5213017228",
            receipt_date="2025-01-15",
            gross_amount=45.99,
        )
        
        assert doc_id.startswith("EXEF-PAR-")
    
    def test_generate_receipt_id_with_extras(self, generator):
        """Paragon z numerem kasy daje inny ID."""
        id1 = generator.generate_receipt_id(
            seller_nip="5213017228",
            receipt_date="2025-01-15",
            gross_amount=45.99,
        )
        id2 = generator.generate_receipt_id(
            seller_nip="5213017228",
            receipt_date="2025-01-15",
            gross_amount=45.99,
            cash_register_number="001",
        )
        
        assert id1 != id2
    
    def test_generate_contract_id_order_independent(self, generator):
        """Kolejność NIP-ów nie wpływa na ID umowy."""
        id1 = generator.generate_contract_id(
            party1_nip="5213017228",
            party2_nip="1234567890",
            contract_date="2025-01-15",
        )
        id2 = generator.generate_contract_id(
            party1_nip="1234567890",
            party2_nip="5213017228",
            contract_date="2025-01-15",
        )
        
        assert id1 == id2
    
    def test_different_documents_different_ids(self, generator):
        """Różne dokumenty = różne ID."""
        id1 = generator.generate_invoice_id(
            seller_nip="5213017228",
            invoice_number="FV/2025/00142",
            issue_date="2025-01-15",
            gross_amount=1230.50,
        )
        id2 = generator.generate_invoice_id(
            seller_nip="5213017228",
            invoice_number="FV/2025/00143",  # inny numer
            issue_date="2025-01-15",
            gross_amount=1230.50,
        )
        
        assert id1 != id2
    
    def test_custom_prefix(self):
        """Test z niestandardowym prefiksem."""
        generator = DocumentIDGenerator(prefix="TEST")
        doc_id = generator.generate_invoice_id(
            seller_nip="5213017228",
            invoice_number="FV/2025/00142",
            issue_date="2025-01-15",
            gross_amount=1230.50,
        )
        
        assert doc_id.startswith("TEST-FV-")
    
    def test_parse_id(self, generator):
        """Test parsowania ID."""
        doc_id = "EXEF-FV-A7B3C9D2E1F04856"
        parsed = DocumentIDGenerator.parse_id(doc_id)
        
        assert parsed['prefix'] == "EXEF"
        assert parsed['type'] == "FV"
        assert parsed['hash'] == "A7B3C9D2E1F04856"
        assert parsed['document_type'] == DocumentType.INVOICE
    
    def test_parse_id_invalid(self):
        """Test parsowania nieprawidłowego ID."""
        with pytest.raises(ValueError):
            DocumentIDGenerator.parse_id("invalid-id")


class TestDocumentTypes:
    """Testy różnych typów dokumentów."""
    
    @pytest.fixture
    def generator(self):
        return DocumentIDGenerator()
    
    def test_correction_invoice(self, generator):
        """Faktura korygująca."""
        doc_id = generator.generate_correction_id(
            seller_nip="5213017228",
            correction_number="KOR/2025/001",
            issue_date="2025-01-20",
            original_invoice_number="FV/2025/00142",
            gross_amount=-100.00,
        )
        
        assert doc_id.startswith("EXEF-KOR-")
    
    def test_bank_statement(self, generator):
        """Wyciąg bankowy."""
        doc_id = generator.generate_bank_statement_id(
            account_number="PL61 1090 1014 0000 0712 1981 2874",
            statement_date="2025-01-31",
            statement_number="001/2025",
        )
        
        assert doc_id.startswith("EXEF-WB-")
    
    def test_generic_document(self, generator):
        """Dokument generyczny."""
        import hashlib
        content = "Jakiś tekst dokumentu..."
        content_hash = hashlib.sha256(content.encode()).hexdigest()
        
        doc_id = generator.generate_generic_id(
            document_type=DocumentType.OTHER,
            content_hash=content_hash,
            document_date="2025-01-15",
        )
        
        assert doc_id.startswith("EXEF-DOC-")
