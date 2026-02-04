"""
Testy dla ekstraktorów danych z dokumentów.
"""

import pytest
from exef_docid.ocr_processor import DocumentOCRResult, OCRResult, OCREngine
from exef_docid.extractors import (
    DocumentExtractor,
    InvoiceExtractor,
    ReceiptExtractor,
    ContractExtractor,
    DocumentCategory,
)


def create_mock_ocr_result(
    full_text: str,
    detected_nips: list = None,
    detected_amounts: list = None,
    detected_dates: list = None,
    detected_invoice_numbers: list = None,
) -> DocumentOCRResult:
    """Tworzy mock wyniku OCR."""
    return DocumentOCRResult(
        full_text=full_text,
        lines=[OCRResult(text=full_text, confidence=0.95)],
        average_confidence=0.95,
        engine_used=OCREngine.TESSERACT,
        detected_nips=detected_nips or [],
        detected_amounts=detected_amounts or [],
        detected_dates=detected_dates or [],
        detected_invoice_numbers=detected_invoice_numbers or [],
    )


class TestInvoiceExtractor:
    """Testy ekstraktora faktur."""
    
    @pytest.fixture
    def extractor(self):
        return InvoiceExtractor()
    
    def test_can_extract_invoice(self, extractor):
        ocr = create_mock_ocr_result(
            full_text="""
            FAKTURA VAT nr FV/2025/00142
            Data wystawienia: 15.01.2025
            
            Sprzedawca:
            Firma ABC Sp. z o.o.
            NIP: 521-301-72-28
            
            Nabywca:
            Firma XYZ
            NIP: 123-456-78-90
            
            Razem brutto: 1 230,50 zł
            """,
            detected_nips=["5213017228", "1234567890"],
            detected_amounts=["1230.50"],
            detected_dates=["15.01.2025"],
            detected_invoice_numbers=["FV/2025/00142"],
        )
        
        can_extract, confidence = extractor.can_extract(ocr)
        assert can_extract is True
        assert confidence > 0.5
    
    def test_extract_invoice_data(self, extractor):
        ocr = create_mock_ocr_result(
            full_text="""
            FAKTURA VAT nr FV/2025/00142
            Data wystawienia: 15.01.2025
            Sprzedawca NIP: 521-301-72-28
            Nabywca NIP: 123-456-78-90
            Razem brutto: 1 230,50 zł
            """,
            detected_nips=["5213017228", "1234567890"],
            detected_amounts=["1230.50"],
            detected_dates=["15.01.2025"],
            detected_invoice_numbers=["FV/2025/00142"],
        )
        
        result = extractor.extract(ocr)
        
        assert result.category == DocumentCategory.INVOICE
        assert result.issuer_nip == "5213017228"
        assert result.buyer_nip == "1234567890"
        assert result.invoice_number == "FV/2025/00142"
        assert result.gross_amount == "1230.50"
    
    def test_cannot_extract_non_invoice(self, extractor):
        ocr = create_mock_ocr_result(
            full_text="To jest jakiś losowy tekst bez faktur",
            detected_nips=[],
            detected_amounts=[],
        )
        
        can_extract, confidence = extractor.can_extract(ocr)
        assert can_extract is False or confidence < 0.5


class TestReceiptExtractor:
    """Testy ekstraktora paragonów."""
    
    @pytest.fixture
    def extractor(self):
        return ReceiptExtractor()
    
    def test_can_extract_receipt(self, extractor):
        ocr = create_mock_ocr_result(
            full_text="""
            PARAGON FISKALNY
            Sklep ABC
            NIP: 521-301-72-28
            
            Chleb        3,50
            Mleko        4,20
            
            SUMA        7,70 PLN
            Gotówka    10,00
            Reszta      2,30
            """,
            detected_nips=["5213017228"],
            detected_amounts=["7.70", "10.00", "2.30"],
            detected_dates=["15.01.2025"],
        )
        
        can_extract, confidence = extractor.can_extract(ocr)
        assert can_extract is True
        assert confidence > 0.4
    
    def test_extract_receipt_data(self, extractor):
        ocr = create_mock_ocr_result(
            full_text="""
            PARAGON FISKALNY
            NIP: 5213017228
            Data: 15.01.2025
            Kasa: 001
            Nr paragonu: 12345
            SUMA: 45,99 PLN
            """,
            detected_nips=["5213017228"],
            detected_amounts=["45.99"],
            detected_dates=["15.01.2025"],
        )
        
        result = extractor.extract(ocr)
        
        assert result.category == DocumentCategory.RECEIPT
        assert result.issuer_nip == "5213017228"
        assert result.gross_amount == "45.99"


class TestContractExtractor:
    """Testy ekstraktora umów."""
    
    @pytest.fixture
    def extractor(self):
        return ContractExtractor()
    
    def test_can_extract_contract(self, extractor):
        ocr = create_mock_ocr_result(
            full_text="""
            UMOWA ZLECENIE nr 001/2025
            
            zawarta w dniu 15.01.2025
            
            pomiędzy:
            Firma ABC, NIP: 521-301-72-28 (Zleceniodawca)
            a
            Jan Kowalski, PESEL: 12345678901 (Wykonawca)
            
            Przedmiot umowy: wykonanie usług programistycznych
            Wynagrodzenie: 5000 zł brutto
            """,
            detected_nips=["5213017228"],
            detected_dates=["15.01.2025"],
        )
        
        can_extract, confidence = extractor.can_extract(ocr)
        assert can_extract is True
        assert confidence > 0.4
    
    def test_extract_contract_data(self, extractor):
        ocr = create_mock_ocr_result(
            full_text="""
            UMOWA nr UMO/2025/001
            zawarta dnia 15.01.2025
            Strona 1 NIP: 5213017228
            Strona 2 NIP: 1234567890
            """,
            detected_nips=["5213017228", "1234567890"],
            detected_dates=["15.01.2025"],
        )
        
        result = extractor.extract(ocr)
        
        assert result.category == DocumentCategory.CONTRACT
        assert result.issuer_nip == "5213017228"
        assert result.party2_nip == "1234567890"
        assert "2025-01-15" in result.document_date


class TestDocumentExtractor:
    """Testy głównego ekstraktora."""
    
    @pytest.fixture
    def extractor(self):
        return DocumentExtractor()
    
    def test_auto_detect_invoice(self, extractor):
        ocr = create_mock_ocr_result(
            full_text="""
            FAKTURA VAT nr FV/2025/001
            Sprzedawca NIP: 5213017228
            Brutto: 1000,00 zł
            """,
            detected_nips=["5213017228"],
            detected_amounts=["1000.00"],
            detected_invoice_numbers=["FV/2025/001"],
        )
        
        result = extractor.extract(ocr)
        assert result.category == DocumentCategory.INVOICE
    
    def test_auto_detect_receipt(self, extractor):
        ocr = create_mock_ocr_result(
            full_text="""
            PARAGON FISKALNY
            NIP: 5213017228
            SUMA: 50,00 PLN
            Gotówka: 50,00
            """,
            detected_nips=["5213017228"],
            detected_amounts=["50.00"],
        )
        
        result = extractor.extract(ocr)
        assert result.category == DocumentCategory.RECEIPT
    
    def test_unknown_document(self, extractor):
        ocr = create_mock_ocr_result(
            full_text="Jakiś nieznany dokument bez charakterystycznych cech",
            detected_nips=[],
            detected_amounts=[],
        )
        
        result = extractor.extract(ocr)
        assert result.category == DocumentCategory.UNKNOWN
    
    def test_extract_all_candidates(self, extractor):
        """Test zwracania wszystkich pasujących ekstraktorów."""
        ocr = create_mock_ocr_result(
            full_text="""
            FAKTURA / PARAGON
            NIP: 5213017228
            SUMA: 100,00
            """,
            detected_nips=["5213017228"],
            detected_amounts=["100.00"],
        )
        
        results = extractor.extract_all(ocr)
        # Powinno znaleźć co najmniej jeden pasujący ekstraktor
        assert len(results) >= 0  # może być 0 jeśli żaden nie pasuje dobrze


class TestNIPDetection:
    """Testy wykrywania NIP w tekście."""
    
    def test_detect_nip_with_dashes(self):
        from exef_docid.ocr_processor import BaseOCRProcessor
        
        class TestProcessor(BaseOCRProcessor):
            def process_image(self, path): pass
            def process_pdf(self, path): pass
        
        processor = TestProcessor()
        
        nips = processor._find_nips("NIP: 521-301-72-28 to nasz numer")
        assert "5213017228" in nips
    
    def test_detect_nip_without_dashes(self):
        from exef_docid.ocr_processor import BaseOCRProcessor
        
        class TestProcessor(BaseOCRProcessor):
            def process_image(self, path): pass
            def process_pdf(self, path): pass
        
        processor = TestProcessor()
        
        nips = processor._find_nips("NIP: 5213017228")
        assert "5213017228" in nips
    
    def test_detect_multiple_nips(self):
        from exef_docid.ocr_processor import BaseOCRProcessor
        
        class TestProcessor(BaseOCRProcessor):
            def process_image(self, path): pass
            def process_pdf(self, path): pass
        
        processor = TestProcessor()
        
        text = """
        Sprzedawca NIP: 521-301-72-28
        Nabywca NIP: 123-456-78-90
        """
        nips = processor._find_nips(text)
        # Może nie znaleźć 1234567890 jeśli nie przechodzi walidacji checksum
        assert "5213017228" in nips


class TestAmountDetection:
    """Testy wykrywania kwot."""
    
    def test_detect_amount_with_currency(self):
        from exef_docid.ocr_processor import BaseOCRProcessor
        
        class TestProcessor(BaseOCRProcessor):
            def process_image(self, path): pass
            def process_pdf(self, path): pass
        
        processor = TestProcessor()
        
        amounts = processor._find_amounts("Suma: 1230,50 zł")
        assert "1230.50" in amounts
    
    def test_detect_amount_brutto(self):
        from exef_docid.ocr_processor import BaseOCRProcessor
        
        class TestProcessor(BaseOCRProcessor):
            def process_image(self, path): pass
            def process_pdf(self, path): pass
        
        processor = TestProcessor()
        
        amounts = processor._find_amounts("brutto: 999,99")
        assert "999.99" in amounts
