#!/usr/bin/env python3
"""
Adapter tests for EXEF3 — tests all import and export adapters.

Tests run against live docker-compose services:
  - test-imap (IMAP server with seeded emails)
  - mock-ksef (KSeF API mock)

Run: cd exef3 && docker compose exec backend python -m pytest tests/test_adapters.py -v
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
from datetime import date


# ═══════════════════════════════════════════════════════════════════════════════
# IMPORT ADAPTERS
# ═══════════════════════════════════════════════════════════════════════════════

class TestEmailImportAdapter:
    """Tests for EmailImportAdapter against test-imap Docker service."""

    def _adapter(self, **overrides):
        from app.adapters.import_email import EmailImportAdapter
        config = {
            "host": "test-imap", "port": 143,
            "username": "testuser", "password": "testpass",
            "folder": "INBOX", "days_back": 60,
        }
        config.update(overrides)
        return EmailImportAdapter(config)

    def test_connection_ok(self):
        a = self._adapter()
        result = a.test_connection()
        assert result["ok"] is True
        assert "INBOX" in result["message"]

    def test_connection_bad_host(self):
        a = self._adapter(host="nonexistent-host")
        result = a.test_connection()
        assert result["ok"] is False

    def test_connection_bad_credentials(self):
        a = self._adapter(username="bad", password="bad")
        result = a.test_connection()
        assert result["ok"] is False

    def test_fetch_returns_results(self):
        a = self._adapter()
        results = a.fetch(date(2026, 1, 1), date(2026, 12, 31))
        assert len(results) > 0

    def test_fetch_march_2026(self):
        a = self._adapter()
        results = a.fetch(date(2026, 3, 1), date(2026, 3, 31))
        assert len(results) >= 8  # 8 from CSV + 1 from body
        numbers = [r.number for r in results]
        assert any("FV/201/03/2026" in (n or "") for n in numbers)

    def test_fetch_date_filtering(self):
        a = self._adapter()
        results = a.fetch(date(2026, 3, 1), date(2026, 3, 10))
        for r in results:
            if r.document_date:
                assert r.document_date >= date(2026, 3, 1)
                assert r.document_date <= date(2026, 3, 10)

    def test_fetch_empty_period(self):
        a = self._adapter()
        results = a.fetch(date(2030, 1, 1), date(2030, 1, 31))
        assert len(results) == 0

    def test_result_fields(self):
        a = self._adapter()
        results = a.fetch(date(2026, 3, 1), date(2026, 3, 31))
        for r in results:
            assert r.source == "email"
            assert r.source_id is not None
            assert r.doc_type is not None

    def test_fetch_no_host_returns_empty(self):
        a = self._adapter(host="")
        results = a.fetch()
        assert results == []


class TestEmailImportFilters:
    """Tests for EmailImportAdapter filtering (subject, sender, extensions, filename, doc_type)."""

    def _adapter(self, **overrides):
        from app.adapters.import_email import EmailImportAdapter
        config = {
            "host": "test-imap", "port": 143,
            "username": "testuser", "password": "testpass",
            "folder": "INBOX", "days_back": 60,
        }
        config.update(overrides)
        return EmailImportAdapter(config)

    def test_default_doc_type_is_invoice(self):
        a = self._adapter()
        a._load_filters()
        assert a._doc_type == "invoice"

    def test_custom_doc_type(self):
        a = self._adapter(doc_type="cv")
        a._load_filters()
        assert a._doc_type == "cv"

    def test_subject_pattern_match(self):
        a = self._adapter(subject_pattern="(?i)(faktura|invoice)")
        a._load_filters()
        assert a._match_email("Faktura FV/001/2026", "test@test.com") is True
        assert a._match_email("CV kandydata - Jan Kowalski", "hr@firma.pl") is False

    def test_subject_pattern_none_passes_all(self):
        a = self._adapter()
        a._load_filters()
        assert a._match_email("anything", "anyone@any.com") is True

    def test_sender_filter_match(self):
        a = self._adapter(sender_filter="@pracuj.pl,hr@firma.pl")
        a._load_filters()
        assert a._match_email("CV", "notifications@pracuj.pl") is True
        assert a._match_email("CV", "hr@firma.pl") is True
        assert a._match_email("CV", "random@other.com") is False

    def test_sender_filter_empty_passes_all(self):
        a = self._adapter()
        a._load_filters()
        assert a._match_email("test", "anyone@anywhere.com") is True

    def test_attachment_extensions_filter(self):
        a = self._adapter(attachment_extensions=["pdf", "docx"])
        a._load_filters()
        assert a._match_attachment("CV_Jan_Kowalski.pdf") is True
        assert a._match_attachment("resume.docx") is True
        assert a._match_attachment("data.csv") is False
        assert a._match_attachment("invoice.xml") is False

    def test_attachment_extensions_none_passes_all(self):
        a = self._adapter()
        a._load_filters()
        assert a._match_attachment("anything.xyz") is True

    def test_filename_pattern_match(self):
        a = self._adapter(filename_pattern="(?i)(CV|resume)")
        a._load_filters()
        assert a._match_attachment("CV_Jan_Kowalski.pdf") is True
        assert a._match_attachment("resume_2026.docx") is True
        assert a._match_attachment("FV_001_2026.pdf") is False

    def test_combined_filters(self):
        a = self._adapter(
            attachment_extensions=["pdf", "docx"],
            filename_pattern="(?i)(CV|resume)",
        )
        a._load_filters()
        assert a._match_attachment("CV_Jan.pdf") is True
        assert a._match_attachment("CV_Jan.csv") is False  # wrong extension
        assert a._match_attachment("FV_001.pdf") is False  # wrong filename

    def test_invalid_regex_ignored(self):
        a = self._adapter(subject_pattern="[invalid(", filename_pattern="[bad(")
        a._load_filters()
        assert a._subject_pattern is None
        assert a._filename_pattern is None
        # With no valid patterns, everything passes
        assert a._match_email("test", "test@test.com") is True
        assert a._match_attachment("test.pdf") is True

    def test_fetch_with_doc_type_cv(self):
        """Fetch with doc_type=cv returns results with correct doc_type."""
        a = self._adapter(doc_type="cv")
        results = a.fetch(date(2026, 1, 1), date(2026, 12, 31))
        # All results should have doc_type="cv" instead of "invoice"
        for r in results:
            assert r.doc_type == "cv"

    def test_subject_filter_reduces_results(self):
        """Subject filter should reduce the number of results."""
        a_all = self._adapter()
        a_filtered = self._adapter(subject_pattern="(?i)ZZZZNONEXISTENT")
        all_results = a_all.fetch(date(2026, 1, 1), date(2026, 12, 31))
        filtered_results = a_filtered.fetch(date(2026, 1, 1), date(2026, 12, 31))
        assert len(all_results) > len(filtered_results)
        assert len(filtered_results) == 0

    def test_extension_filter_reduces_results(self):
        """Extension filter for docx only should return fewer or no results (test emails have csv/xml/pdf)."""
        a = self._adapter(attachment_extensions=["docx"], doc_type="cv")
        results = a.fetch(date(2026, 1, 1), date(2026, 12, 31))
        # Test IMAP has no .docx attachments, so this should return 0
        assert len(results) == 0


class TestKsefImportAdapter:
    """Tests for KsefImportAdapter against mock-ksef Docker service."""

    def _adapter(self, **overrides):
        from app.adapters.import_ksef import KsefImportAdapter
        config = {"nip": "5213003700", "environment": "mock", "token": "test"}
        config.update(overrides)
        return KsefImportAdapter(config)

    def test_connection_ok(self):
        a = self._adapter()
        result = a.test_connection()
        assert result["ok"] is True
        assert "5213003700" in result["message"]

    def test_connection_bad_nip(self):
        a = self._adapter(nip="12345")
        result = a.test_connection()
        assert result["ok"] is False

    def test_connection_no_nip(self):
        a = self._adapter(nip="")
        result = a.test_connection()
        assert result["ok"] is False

    def test_fetch_returns_results(self):
        a = self._adapter()
        results = a.fetch(date(2026, 1, 1), date(2026, 12, 31))
        assert len(results) > 0

    def test_fetch_march_2026(self):
        a = self._adapter()
        results = a.fetch(date(2026, 3, 1), date(2026, 3, 31))
        assert len(results) == 5
        for r in results:
            assert r.document_date.month == 3
            assert r.document_date.year == 2026

    def test_fetch_january_2026(self):
        a = self._adapter()
        results = a.fetch(date(2026, 1, 1), date(2026, 1, 31))
        assert len(results) >= 2  # mock has Jan invoices

    def test_result_fields(self):
        a = self._adapter()
        results = a.fetch(date(2026, 3, 1), date(2026, 3, 31))
        for r in results:
            assert r.source == "ksef"
            assert r.source_id.startswith("ksef-")
            assert r.number is not None
            assert r.contractor_name is not None
            assert r.amount_gross is not None
            assert r.document_date is not None

    def test_fetch_no_nip_returns_empty(self):
        a = self._adapter(nip="")
        results = a.fetch()
        assert results == []


class TestCsvImportAdapter:
    """Tests for CsvImportAdapter."""

    def _adapter(self, content):
        from app.adapters.import_csv import CsvImportAdapter
        return CsvImportAdapter({"_content": content})

    def test_semicolon_csv(self):
        csv = "numer;kontrahent;nip;data;netto;vat;brutto;waluta\nFV/001;Test;1234567890;2026-03-10;100;23;123;PLN"
        results = self._adapter(csv).fetch()
        assert len(results) == 1
        assert results[0].number == "FV/001"
        assert results[0].amount_gross == 123.0

    def test_comma_csv(self):
        csv = "number,contractor_name,amount_gross,document_date\nFV/002,ABC Sp.,500.50,2026-03-15"
        results = self._adapter(csv).fetch()
        assert len(results) == 1
        assert results[0].number == "FV/002"
        assert results[0].amount_gross == 500.50

    def test_polish_column_names(self):
        csv = "numer;kontrahent;kwota_brutto;data\nFV/003;XYZ;999.99;2026-03-20"
        results = self._adapter(csv).fetch()
        assert len(results) == 1
        assert results[0].contractor_name == "XYZ"

    def test_empty_content(self):
        results = self._adapter("").fetch()
        assert results == []

    def test_skip_empty_rows(self):
        csv = "numer;kontrahent;brutto\nFV/001;Test;100\n;;\nFV/002;Test2;200"
        results = self._adapter(csv).fetch()
        assert len(results) == 2

    def test_amount_with_comma(self):
        csv = "numer;brutto\nFV/001;1 234,56"
        results = self._adapter(csv).fetch()
        assert len(results) == 1
        assert results[0].amount_gross == 1234.56


class TestManualAdapters:
    """Tests for Manual/Upload/Webhook adapters (passive — always return empty)."""

    def test_manual_fetch_empty(self):
        from app.adapters.import_manual import ManualImportAdapter
        assert ManualImportAdapter({}).fetch() == []

    def test_manual_test_connection(self):
        from app.adapters.import_manual import ManualImportAdapter
        assert ManualImportAdapter({}).test_connection()["ok"] is True

    def test_upload_fetch_empty(self):
        from app.adapters.import_manual import UploadImportAdapter
        assert UploadImportAdapter({}).fetch() == []

    def test_webhook_fetch_empty(self):
        from app.adapters.import_manual import WebhookImportAdapter
        assert WebhookImportAdapter({}).fetch() == []

    def test_webhook_test_connection(self):
        from app.adapters.import_manual import WebhookImportAdapter
        assert WebhookImportAdapter({}).test_connection()["ok"] is True


class TestBankImportAdapter:
    """Tests for BankGenericImportAdapter."""

    def _adapter(self, content):
        from app.adapters.import_bank import BankGenericImportAdapter
        return BankGenericImportAdapter({"_content": content})

    def test_parse_bank_csv(self):
        csv = "data;tytul;kwota;kontrahent;nip\n2026-03-15;FV/123 Platnosc;1500.00;OVH;5213003700"
        results = self._adapter(csv).fetch()
        assert len(results) == 1
        assert results[0].amount_gross == 1500.0
        assert results[0].contractor_name == "OVH"

    def test_extract_invoice_number(self):
        csv = "data;tytul;kwota\n2026-03-15;Zaplata za FV/456/2026;2000"
        results = self._adapter(csv).fetch()
        assert len(results) == 1
        assert "FV/456" in (results[0].number or "")

    def test_empty_content(self):
        results = self._adapter("").fetch()
        assert results == []


# ═══════════════════════════════════════════════════════════════════════════════
# EXPORT ADAPTERS
# ═══════════════════════════════════════════════════════════════════════════════

class MockMeta:
    category = "Koszty operacyjne"
    description = "Test opis"
    tags = []

class MockDoc:
    def __init__(self, idx):
        self.doc_type = "invoice"
        self.number = f"FV/{idx:03d}/03/2026"
        self.contractor_name = "Test Sp. z o.o."
        self.contractor_nip = "5213003700"
        self.amount_net = 1000.00
        self.amount_vat = 230.00
        self.amount_gross = 1230.00
        self.currency = "PLN"
        self.document_date = date(2026, 3, idx * 5)
        self.document_metadata = MockMeta()


@pytest.fixture
def sample_docs():
    return [MockDoc(1), MockDoc(2), MockDoc(3)]


class TestCsvExportAdapter:
    def test_export(self, sample_docs):
        from app.adapters.export_csv import CsvExportAdapter
        result = CsvExportAdapter({}).export(sample_docs, "Test")
        assert result.docs_exported == 3
        assert result.format == "csv"
        assert "FV/001/03/2026" in result.content
        assert "Test Sp. z o.o." in result.content

    def test_connection(self):
        from app.adapters.export_csv import CsvExportAdapter
        assert CsvExportAdapter({}).test_connection()["ok"] is True


class TestWfirmaExportAdapter:
    def test_export(self, sample_docs):
        from app.adapters.export_wfirma import WfirmaExportAdapter
        result = WfirmaExportAdapter({}).export(sample_docs, "Test")
        assert result.docs_exported == 3
        assert result.format == "csv"
        assert "Faktura VAT" in result.content
        assert "wfirma" in result.filename

    def test_connection(self):
        from app.adapters.export_wfirma import WfirmaExportAdapter
        assert WfirmaExportAdapter({}).test_connection()["ok"] is True


class TestJpkPkpirExportAdapter:
    def test_export(self, sample_docs):
        from app.adapters.export_jpk import JpkPkpirExportAdapter
        result = JpkPkpirExportAdapter({"nip": "5213003700", "company_name": "Test"}).export(sample_docs, "Test")
        assert result.docs_exported == 3
        assert result.format == "xml"
        assert "JPK_PKPIR" in result.content
        assert "5213003700" in result.content

    def test_connection_ok(self):
        from app.adapters.export_jpk import JpkPkpirExportAdapter
        result = JpkPkpirExportAdapter({"nip": "123", "company_name": "Test"}).test_connection()
        assert result["ok"] is True

    def test_connection_no_nip(self):
        from app.adapters.export_jpk import JpkPkpirExportAdapter
        result = JpkPkpirExportAdapter({}).test_connection()
        assert result["ok"] is False


class TestComarchExportAdapter:
    def test_export(self, sample_docs):
        from app.adapters.export_comarch import ComarchExportAdapter
        result = ComarchExportAdapter({}).export(sample_docs, "Test")
        assert result.docs_exported == 3
        assert result.format == "xml"
        assert "REJESTR_ZAKUPOW_VAT" in result.content
        assert "comarch" in result.filename


class TestSymfoniaExportAdapter:
    def test_export(self, sample_docs):
        from app.adapters.export_symfonia import SymfoniaExportAdapter
        result = SymfoniaExportAdapter({}).export(sample_docs, "Test")
        assert result.docs_exported == 3
        assert result.format == "csv"
        assert result.encoding == "cp1250"
        assert "symfonia" in result.filename

    def test_polish_date_format(self, sample_docs):
        from app.adapters.export_symfonia import SymfoniaExportAdapter
        result = SymfoniaExportAdapter({}).export(sample_docs, "Test")
        assert "05.03.2026" in result.content  # dd.mm.yyyy


class TestEnovaExportAdapter:
    def test_export(self, sample_docs):
        from app.adapters.export_enova import EnovaExportAdapter
        result = EnovaExportAdapter({}).export(sample_docs, "Test")
        assert result.docs_exported == 3
        assert result.format == "xml"
        assert "enova" in result.filename.lower()
        assert "DokumentZakupu" in result.content


# ═══════════════════════════════════════════════════════════════════════════════
# ADAPTER REGISTRY
# ═══════════════════════════════════════════════════════════════════════════════

class TestAdapterRegistry:
    def test_all_import_types_registered(self):
        from app.adapters.registry import IMPORT_ADAPTERS
        expected = {"email", "ksef", "csv", "upload", "manual", "webhook",
                    "bank", "bank_ing", "bank_mbank", "bank_pko", "bank_santander", "bank_pekao"}
        assert set(IMPORT_ADAPTERS.keys()) == expected

    def test_all_export_types_registered(self):
        from app.adapters.registry import EXPORT_ADAPTERS
        expected = {"wfirma", "jpk_pkpir", "comarch", "symfonia", "enova", "csv"}
        assert set(EXPORT_ADAPTERS.keys()) == expected

    def test_get_import_adapter(self):
        from app.adapters import get_import_adapter
        assert get_import_adapter("email") is not None
        assert get_import_adapter("ksef") is not None
        assert get_import_adapter("nonexistent") is None

    def test_get_export_adapter(self):
        from app.adapters import get_export_adapter
        assert get_export_adapter("wfirma") is not None
        assert get_export_adapter("jpk_pkpir") is not None
        assert get_export_adapter("nonexistent") is None


# ═══════════════════════════════════════════════════════════════════════════════
# DOC ID GENERATION
# ═══════════════════════════════════════════════════════════════════════════════

class TestDocIdGeneration:
    def test_deterministic(self):
        from app.core.docid import generate_doc_id
        id1 = generate_doc_id("5213003700", "FV/001/2026", date(2026, 3, 5), 1500.0)
        id2 = generate_doc_id("5213003700", "FV/001/2026", date(2026, 3, 5), 1500.0)
        assert id1 == id2
        assert id1.startswith("DOC-FV-")

    def test_different_data_different_id(self):
        from app.core.docid import generate_doc_id
        id1 = generate_doc_id("5213003700", "FV/001/2026", date(2026, 3, 5), 1500.0)
        id2 = generate_doc_id("5213003700", "FV/002/2026", date(2026, 3, 5), 1500.0)
        assert id1 != id2

    def test_insufficient_data_returns_none(self):
        from app.core.docid import generate_doc_id
        assert generate_doc_id(None, None, None, None) is None
        assert generate_doc_id("5213003700", None, None, None) is None

    def test_normalize_nip(self):
        from app.core.docid import generate_doc_id
        id1 = generate_doc_id("5213003700", "FV/001", date(2026, 1, 1), 100.0)
        id2 = generate_doc_id("PL5213003700", "FV/001", date(2026, 1, 1), 100.0)
        assert id1 == id2

    def test_normalize_invoice_number(self):
        from app.core.docid import generate_doc_id
        id1 = generate_doc_id("5213003700", "FV/001/2026", date(2026, 1, 1), 100.0)
        id2 = generate_doc_id("5213003700", "fv/001/2026", date(2026, 1, 1), 100.0)
        assert id1 == id2
