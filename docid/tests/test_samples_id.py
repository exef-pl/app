"""
Testy ID dla wszystkich próbek (samples).

Sprawdza generowanie ID dla wszystkich plików w katalogu samples,
w tym spójność ID między różnymi formatami tego samego dokumentu.
"""

import os
from pathlib import Path

import pytest

from exef_docid.document_id import DocumentIDGenerator, DocumentType
from exef_docid.pipeline import DocumentPipeline, process_document
from exef_docid.ocr_processor import OCREngine


SAMPLES_DIR = Path(__file__).parent.parent / "samples"


class TestSampleIDGeneration:
    """Testy generowania ID dla wszystkich próbek."""

    @pytest.fixture
    def pipeline(self):
        """Fixture tworzący pipeline z Tesseract OCR."""
        return DocumentPipeline(ocr_engine=OCREngine.TESSERACT)

    def get_sample_files(self, subdirectory: str) -> list[Path]:
        """Zwraca listę plików próbek z danego podkatalogu."""
        sample_dir = SAMPLES_DIR / subdirectory
        if not sample_dir.exists():
            return []
        
        files = []
        for ext in ['*.pdf', '*.jpg', '*.jpeg', '*.png', '*.xml', '*.html', '*.htm', '*.txt']:
            files.extend(sample_dir.glob(ext))
        return sorted(files)

    def test_invoice_samples_generate_id(self, pipeline):
        """Test generowania ID dla wszystkich próbek faktur."""
        invoice_files = self.get_sample_files("invoices")
        assert len(invoice_files) > 0, "Brak plików faktur w samples/invoices"
        
        results = []
        for file_path in invoice_files:
            try:
                result = pipeline.process(file_path)
                results.append({
                    'file': file_path.name,
                    'id': result.document_id,
                    'type': result.document_type.value,
                    'canonical': result.canonical_string,
                    'confidence': result.ocr_confidence,
                })
                # Sprawdź czy ID zostało wygenerowane
                assert result.document_id, f"Brak ID dla {file_path}"
                assert result.document_id.startswith("EXEF-FV"), f"Nieprawidłowy prefix ID dla faktury: {result.document_id}"
            except Exception as e:
                pytest.fail(f"Błąd przetwarzania {file_path}: {e}")
        
        # Wypisz podsumowanie
        print(f"\n=== Faktury ({len(results)} plików) ===")
        for r in results:
            print(f"  {r['file']}: {r['id']} (confidence: {r['confidence']:.2f})")

    def test_receipt_samples_generate_id(self, pipeline):
        """Test generowania ID dla wszystkich próbek paragonów."""
        receipt_files = self.get_sample_files("receipts")
        assert len(receipt_files) > 0, "Brak plików paragonów w samples/receipts"
        
        results = []
        for file_path in receipt_files:
            try:
                result = pipeline.process(file_path)
                results.append({
                    'file': file_path.name,
                    'id': result.document_id,
                    'type': result.document_type.value,
                    'confidence': result.ocr_confidence,
                })
                assert result.document_id, f"Brak ID dla {file_path}"
            except Exception as e:
                pytest.fail(f"Błąd przetwarzania {file_path}: {e}")
        
        print(f"\n=== Paragony ({len(results)} plików) ===")
        for r in results:
            print(f"  {r['file']}: {r['id']} (confidence: {r['confidence']:.2f})")

    def test_contract_samples_generate_id(self, pipeline):
        """Test generowania ID dla wszystkich próbek umów."""
        contract_files = self.get_sample_files("contracts")
        assert len(contract_files) > 0, "Brak plików umów w samples/contracts"
        
        results = []
        for file_path in contract_files:
            try:
                result = pipeline.process(file_path)
                results.append({
                    'file': file_path.name,
                    'id': result.document_id,
                    'type': result.document_type.value,
                    'confidence': result.ocr_confidence,
                })
                assert result.document_id, f"Brak ID dla {file_path}"
            except Exception as e:
                pytest.fail(f"Błąd przetwarzania {file_path}: {e}")
        
        print(f"\n=== Umowy ({len(results)} plików) ===")
        for r in results:
            print(f"  {r['file']}: {r['id']} (confidence: {r['confidence']:.2f})")

    def test_invoice_cross_format_consistency(self, pipeline):
        """Test czy różne formaty tej samej faktury mają ten sam ID."""
        invoice_dir = SAMPLES_DIR / "invoices"
        
        # Znajdź wszystkie formaty faktury (faktura_full.*)
        base_name = "faktura_full"
        formats = []
        
        for ext in ['.jpg', '.jpeg', '.png', '.pdf', '.xml', '.html', '.txt']:
            file_path = invoice_dir / f"{base_name}{ext}"
            if file_path.exists():
                formats.append(file_path)
        
        if len(formats) < 2:
            pytest.skip(f"Za mało formatów faktury do testu (znaleziono: {len(formats)})")
        
        # Przetwórz wszystkie formaty
        ids = {}
        for file_path in formats:
            try:
                result = pipeline.process(file_path)
                ids[file_path.suffix] = {
                    'id': result.document_id,
                    'canonical': result.canonical_string,
                    'confidence': result.ocr_confidence,
                }
            except Exception as e:
                pytest.fail(f"Błąd przetwarzania {file_path}: {e}")
        
        # Sprawdź czy wszystkie formaty mają ten sam ID
        unique_ids = set(r['id'] for r in ids.values())
        
        print(f"\n=== Cross-format consistency dla {base_name} ===")
        for ext, data in sorted(ids.items()):
            print(f"  {ext}: {data['id']} (confidence: {data['confidence']:.2f})")
        
        assert len(unique_ids) == 1, (
            f"Różne formaty {base_name} mają różne ID: {unique_ids}\n"
            f"Szczegóły: {ids}"
        )

    def test_receipt_cross_format_consistency(self, pipeline):
        """Test czy różne formaty tego samego paragonu mają ten sam ID."""
        receipt_dir = SAMPLES_DIR / "receipts"
        
        base_name = "paragon_full"
        formats = []
        
        for ext in ['.jpg', '.jpeg', '.png', '.pdf', '.xml', '.html', '.txt']:
            file_path = receipt_dir / f"{base_name}{ext}"
            if file_path.exists():
                formats.append(file_path)
        
        if len(formats) < 2:
            pytest.skip(f"Za mało formatów paragonu do testu (znaleziono: {len(formats)})")
        
        ids = {}
        for file_path in formats:
            try:
                result = pipeline.process(file_path)
                ids[file_path.suffix] = {
                    'id': result.document_id,
                    'canonical': result.canonical_string,
                    'confidence': result.ocr_confidence,
                }
            except Exception as e:
                pytest.fail(f"Błąd przetwarzania {file_path}: {e}")
        
        unique_ids = set(r['id'] for r in ids.values())
        
        print(f"\n=== Cross-format consistency dla {base_name} ===")
        for ext, data in sorted(ids.items()):
            print(f"  {ext}: {data['id']} (confidence: {data['confidence']:.2f})")
        
        assert len(unique_ids) == 1, (
            f"Różne formaty {base_name} mają różne ID: {unique_ids}\n"
            f"Szczegóły: {ids}"
        )

    def test_all_samples_summary(self, pipeline):
        """Podsumowanie wszystkich próbek."""
        all_results = []
        
        for subdir in ['invoices', 'receipts', 'contracts', 'universal']:
            files = self.get_sample_files(subdir)
            for file_path in files:
                try:
                    result = pipeline.process(file_path)
                    all_results.append({
                        'subdir': subdir,
                        'file': file_path.name,
                        'id': result.document_id,
                        'type': result.document_type.value,
                        'confidence': result.ocr_confidence,
                    })
                except Exception as e:
                    all_results.append({
                        'subdir': subdir,
                        'file': file_path.name,
                        'error': str(e),
                    })
        
        print(f"\n{'='*60}")
        print(f"PODSUMOWANIE WSZYSTKICH PRÓBEK ({len(all_results)} plików)")
        print(f"{'='*60}")
        
        success_count = sum(1 for r in all_results if 'error' not in r)
        error_count = sum(1 for r in all_results if 'error' in r)
        
        for r in sorted(all_results, key=lambda x: (x['subdir'], x['file'])):
            if 'error' in r:
                print(f"  [ERR] {r['subdir']}/{r['file']}: {r['error']}")
            else:
                print(f"  [OK]  {r['subdir']}/{r['file']}: {r['id']}")
        
        print(f"{'='*60}")
        print(f"Sukcesy: {success_count}/{len(all_results)}, Błędy: {error_count}/{len(all_results)}")
        print(f"{'='*60}")
        
        # Nie failujemy testu przy błędach - to tylko podsumowanie
        assert success_count > 0, "Żaden plik nie został przetworzony pomyślnie"


class TestSampleIDDeterminism:
    """Testy determinizmu ID - te same dane = ten sam ID."""

    def test_invoice_deterministic_id(self):
        """Test czy faktura generuje ten sam ID przy każdym uruchomieniu."""
        invoice_dir = SAMPLES_DIR / "invoices"
        
        # Znajdź pierwszy dostępny plik faktury
        invoice_file = None
        for ext in ['.txt', '.xml', '.html']:
            candidate = invoice_dir / f"faktura_full{ext}"
            if candidate.exists():
                invoice_file = candidate
                break
        
        if not invoice_file:
            pytest.skip("Brak pliku faktury do testu determinizmu")
        
        # Generuj ID dwa razy
        id1 = process_document(invoice_file).document_id
        id2 = process_document(invoice_file).document_id
        
        assert id1 == id2, f"ID nie jest deterministyczne: {id1} != {id2}"

    def test_receipt_deterministic_id(self):
        """Test czy paragon generuje ten sam ID przy każdym uruchomieniu."""
        receipt_dir = SAMPLES_DIR / "receipts"
        
        receipt_file = None
        for ext in ['.txt', '.xml', '.html']:
            candidate = receipt_dir / f"paragon_full{ext}"
            if candidate.exists():
                receipt_file = candidate
                break
        
        if not receipt_file:
            pytest.skip("Brak pliku paragonu do testu determinizmu")
        
        id1 = process_document(receipt_file).document_id
        id2 = process_document(receipt_file).document_id
        
        assert id1 == id2, f"ID nie jest deterministyczne: {id1} != {id2}"
