# EXEF Document ID Generator

Deterministyczny generator identyfikatorów dokumentów z OCR. Generuje **zawsze ten sam ID** dla tego samego dokumentu, niezależnie od formatu źródłowego (skan, PDF, KSeF XML, obrazy).

## 🎯 Problem

Masz fakturę w trzech formatach:
- Skan JPG z telefonu
- PDF z emaila
- XML z KSeF

Jak uzyskać **ten sam identyfikator** dla wszystkich trzech?

## ✨ Rozwiązanie

```python
from exef_docid import get_document_id

# Wszystkie trzy zwrócą TEN SAM ID!
get_document_id("faktura_skan.jpg")    # EXEF-FV-A7B3C9D2E1F04856
get_document_id("faktura.pdf")          # EXEF-FV-A7B3C9D2E1F04856
get_document_id("faktura_ksef.xml")     # EXEF-FV-A7B3C9D2E1F04856
```

## 📦 Instalacja

### Lokalna instalacja (rekomendowana)

```bash
# Klonuj repozytorium
git clone https://github.com/softreck/exef-pl.git
cd exef-pl/app/docid

# Utwórz środowisko wirtualne
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# lub venv\Scripts\activate  # Windows

# Zainstaluj projekt
make install
```

### Z PaddleOCR (zalecane dla CPU i5+)

```bash
pip install docid[paddle]
```

### Z Tesseract (lżejsza alternatywa)

```bash
# Ubuntu/Debian
sudo apt install tesseract-ocr tesseract-ocr-pol

# Pakiet Python
pip install docid[tesseract]
```

### Wszystkie silniki OCR

```bash
pip install docid[all]
```

## 🚀 Szybki start

### Generator ID dla dokumentów biznesowych

```python
from exef_docid import generate_invoice_id, generate_receipt_id, generate_contract_id

# Faktura VAT
invoice_id = generate_invoice_id(
    seller_nip="5213017228",
    invoice_number="FV/2025/00142", 
    issue_date="2025-01-15",
    gross_amount=1230.50
)
print(invoice_id)  # EXEF-FV-F0BE35240C77B2DB

# Paragon fiskalny
receipt_id = generate_receipt_id(
    seller_nip="5213017228",
    receipt_date="2025-01-15",
    gross_amount=37.88,
    cash_register_number="001"
)
print(receipt_id)  # EXEF-PAR-8142B3FC69D7778C

# Umowa
contract_id = generate_contract_id(
    party1_nip="5213017228",
    party2_nip="1234567890", 
    contract_date="2025-01-15",
    contract_number="001/2025"
)
print(contract_id)  # EXEF-UMO-C54CB968D1342642
```

### Uniwersalny generator ID (dowolne dokumenty)

```python
from exef_docid import generate_universal_document_id

# Dowolny dokument
doc_id = generate_universal_document_id("dokument.pdf")
print(doc_id)  # UNIV-PDF-A6BECE56B7FE21DC

# Zdjęcie lub skan
doc_id = generate_universal_document_id("skan.jpg")
print(doc_id)  # UNIV-IMG-4225A473A725978D

# Dokument z grafiką/wektorami
doc_id = generate_universal_document_id("grafika.png")
print(doc_id)  # UNIV-IMG-E2E2131A335F0918
```

### Pełne przetwarzanie z OCR

```python
from exef_docid import process_document, get_document_id

# Pełne przetwarzanie z ekstrakcją danych
result = process_document("faktura.pdf")
print(result.document_id)           # EXEF-FV-F0BE35240C77B2DB
print(result.extraction.issuer_nip) # 5213017228
print(result.extraction.invoice_number) # FV/2025/00142

# Tylko wygeneruj ID
doc_id = get_document_id("paragon.jpg")
print(doc_id)  # EXEF-PAR-8142B3FC69D7778C

# Weryfikacja ID
is_valid = verify_document_id("skan.png", "EXEF-FV-F0BE35240C77B2DB")
print(is_valid)  # True/False
```

## 🖥️ Interfejs CLI (docid-universal)

Projekt dostarcza potężne narzędzie CLI `docid-universal`, które udostępnia wszystkie funkcjonalności pakietu.

### Podstawowe komendy

```bash
# Generowanie ID dla faktury (dane ręczne)
docid-universal generate invoice --nip 5213017228 --number FV/2025/00142 --date 2025-01-15 --amount 1230.50

# Generowanie uniwersalnego ID dla pliku
docid-universal universal dokument.pdf

# Przetwarzanie dokumentu z OCR i ekstrakcją danych
docid-universal process samples/invoices/faktura_full.jpg --format json

# Analiza cech pliku (rozmiar, hashe, metadane)
docid-universal analyze samples/invoices/faktura_full.png

# Porównanie dwóch dokumentów
docid-universal compare samples/invoices/faktura_full.jpg samples/invoices/faktura_full.pdf
```

### Przetwarzanie wsadowe (Batch)

Możesz przetworzyć cały folder dokumentów i automatycznie wykryć duplikaty:

```bash
docid-universal batch ./scany --recursive --duplicates --output wyniki.json
```

### Testowanie determinizmu

Sprawdź, czy generator zwraca zawsze ten sam ID dla tego samego pliku:

```bash
docid-universal test faktura.pdf --iterations 10
```

## 🌐 Usługa Web (REST API)

Możesz łatwo uruchomić `docid` jako usługę webową (wymaga `fastapi` i `uvicorn`):

### Uruchomienie serwera
```bash
make run-web
# Serwer wystartuje na http://localhost:8000
```

### Przykłady CURL

**1. Generowanie ID z pliku:**
```bash
curl -X POST -F "file=@faktura.pdf" http://localhost:8000/process
```

**2. Weryfikacja ID:**
```bash
curl -X POST -F "file=@skan.jpg" -F "document_id=EXEF-FV-F0BE35240C77B2DB" http://localhost:8000/verify
```

**3. Porównywanie plików:**
```bash
curl -X POST -F "file1=@plik1.pdf" -F "file2=@plik2.png" http://localhost:8000/compare
```

## 🧪 Testy Jakości i OCR

Pakiet zawiera zaawansowane narzędzia do testowania odporności ID na zniekształcenia obrazu (szumy, kompresja stratna).

### Test odporności na szumy
```bash
# Testuje determinizm ID przy dodawaniu szumu, rozmycia i zmianie jasności
python examples/quality_test.py samples/invoices/faktura_full.png --noise --iterations 5
```

### Test formatów stratnych (JPG vs PNG)
```bash
# Sprawdza czy ID pozostaje spójne mimo kompresji stratnej
python examples/quality_test.py samples/invoices/faktura_full.png --formats
```

### Uruchomienie przez Makefile
```bash
make test-quality FILE=samples/invoices/faktura_full.png
```

## 🛠️ Makefile - Wszystkie komendy

### Instalacja i Budowanie
```bash
make install          # Instalacja projektu
make install-all      # Instalacja z wszystkimi zależnościami OCR
make build            # Budowanie paczki (wymaga 'build')
make upload           # Publikacja na PyPI (wymaga 'twine')
```

### Testy i Narzędzia
```bash
make test             # Uruchom wszystkie testy
make test-cli         # Test interfejsu CLI
make test-universal   # Test dokumentów uniwersalnych
make test-quality FILE=plik.png # Test jakości OCR
make run-web          # Uruchom serwer API
```

## 📚 Przykłady użycia

### 1. Przetwarzanie faktur

```python
from exef_docid import process_document

# Przetwarzanie faktury PDF
result = process_document("faktura.pdf")
print(f"ID: {result.document_id}")
print(f"NIP: {result.extraction.issuer_nip}")
print(f"Kwota: {result.extraction.gross_amount}")

# Przetwarzanie skanu JPG
result = process_document("skan_faktury.jpg")
print(f"ID: {result.document_id}")
```

### 2. Porównywanie dokumentów

```python
from exef_docid import compare_universal_documents

# Porównaj dwa dokumenty
comparison = compare_universal_documents("dokument1.pdf", "dokument2.png")
print(f"Identyczne ID: {comparison['identical_ids']}")
print(f"Ten sam typ: {comparison['same_type']}")
print(f"Ten sam rozmiar: {comparison['same_size']}")
```

### 3. Weryfikacja ID

```python
from exef_docid import verify_document_id, verify_universal_document_id

# Weryfikacja ID dokumentu biznesowego
is_valid = verify_document_id("faktura.pdf", "EXEF-FV-F0BE35240C77B2DB")

# Weryfikacja uniwersalnego ID
is_valid = verify_universal_document_id("dowolny_plik.jpg", "UNIV-IMG-4225A473A725978D")
```

### 4. Praca z kolekcją dokumentów

```python
from pathlib import Path
from exef_docid import generate_universal_document_id

# Przetwarzaj wszystkie pliki w folderze
documents_dir = Path("dokumenty")
for file_path in documents_dir.glob("*"):
    if file_path.is_file():
        doc_id = generate_universal_document_id(file_path)
        print(f"{file_path.name}: {doc_id}")
```

## 🔍 Formaty plików i przetwarzanie

### Obsługiwane formaty

| Format | Opis | Przetwarzanie | ID Generator |
|--------|------|---------------|--------------|
| **PDF** | Dokumenty PDF | ✅ Pełne | Uniwersalny |
| **PNG** | Obrazy bezstratne | ✅ OCR + Wizualne | Oba |
| **JPG/JPEG** | Obrazy stratne | ✅ OCR + Wizualne | Oba |
| **XML** | Struktura danych | ✅ Tekst | Biznesowy |
| **HTML** | Strony WWW | ✅ Tekst | Biznesowy |
| **TXT** | Czysty tekst | ✅ Tekst | Biznesowy |

### 📝 PNG i JPG - Przetwarzanie przez OCR

**TAK!** Formaty PNG i JPG są w pełni przetwarzane przez OCR:

```python
from exef_docid import process_document

# Przetwarzanie skanu PNG z OCR
result = process_document("skan_faktury.png")
print(result.document_id)  # EXEF-FV-F0BE35240C77B2DB
print(result.extraction.issuer_nip)  # 5213017228

# Przetwarzanie zdjęcia JPG z OCR
result = process_document("zdjecie_paragonu.jpg")
print(result.document_id)  # EXEF-PAR-8142B3FC69D7778C
```

#### Co jest ekstrahowane z PNG/JPG:

1. **OCR (PaddleOCR/Tesseract)**:
   - Tekst z dokumentów
   - NIP, numery faktur
   - Kwoty, daty
   - Struktura dokumentu

2. **Analiza wizualna (Uniwersalny generator)**:
   - Hash wizualny (resize 64x64)
   - Histogram kolorów
   - Wymiary obrazu
   - Metadane pliku

### Przykłady dla różnych formatów

```python
# Ten sam dokument w różnych formatach - ten sam ID biznesowy
generate_invoice_id(...)  # -> EXEF-FV-F0BE35240C77B2DB

# Przetwarzanie przez OCR daje ten sam wynik
process_document("faktura.pdf")    # -> EXEF-FV-F0BE35240C77B2DB
process_document("faktura.png")    # -> EXEF-FV-F0BE35240C77B2DB
process_document("faktura.jpg")    # -> EXEF-FV-F0BE35240C77B2DB
process_document("faktura.xml")    # -> EXEF-FV-F0BE35240C77B2DB

# Różne ID uniwersalne dla różnych formatów
generate_universal_document_id("faktura.pdf")  # -> UNIV-PDF-...
generate_universal_document_id("faktura.png")  # -> UNIV-IMG-...
generate_universal_document_id("faktura.jpg")  # -> UNIV-IMG-...
```

## 🧪 Testowanie

### Uruchomienie testów

```bash
# Wszystkie testy
make test

# Testy deterministyczności
make test-samples

# Testy formatów
make test-complete-formats

# Testy uniwersalne
make test-universal
```

### Struktura testów

```
tests/
├── test_document_id.py      # Testy generatora ID
├── test_extractors.py       # Testy ekstrakcji danych
└── conftest.py             # Konfiguracja testów
```

### Przykładowe wyniki testów

```
================================================================================
TEST WSZYSTKICH FORMATÓW - PDF, PNG, JPG, HTML, TXT, XML
================================================================================

FOLDER: FAKTURY (invoices/)
  📄 faktura_full.pdf          (.pdf ) [   2242B] -> EXEF-FV-F0BE35240C77B2DB
  📄 faktura_full.xml          (.xml ) [   2077B] -> EXEF-FV-F0BE35240C77B2DB
  📄 faktura_full.html         (.html) [   3334B] -> EXEF-FV-F0BE35240C77B2DB
  📄 faktura_full.jpg          (.jpg ) [  28182B] -> EXEF-FV-F0BE35240C77B2DB
  📄 faktura_full.png          (.png ) [  32325B] -> EXEF-FV-F0BE35240C77B2DB
  📄 faktura_full.txt          (.txt ) [   2839B] -> EXEF-FV-F0BE35240C77B2DB

  📊 Podsumowanie folderu invoices:
     Plików przetworzonych: 6
     Unikalnych ID: 1
     Wszystkie identyczne: True
     ✅ ID: EXEF-FV-F0BE35240C77B2DB
```

## 📁 Struktura projektu

```
docid/
├── exef_docid/              # Główny pakiet
│   ├── __init__.py         # Eksporty API
│   ├── document_id.py      # Generator ID biznesowy
│   ├── document_id_universal.py # Generator ID uniwersalny
│   ├── extractors.py       # Ekstraktory danych
│   ├── ocr_processor.py    # Przetwarzanie OCR
│   └── pipeline.py         # Główny pipeline
├── samples/                # Przykładowe dokumenty
│   ├── invoices/          # Faktury (6 formatów)
│   ├── receipts/          # Paragony (6 formatów)
│   ├── contracts/         # Umowy (6 formatów)
│   └── universal/         # Dokumenty uniwersalne
├── tests/                 # Testy jednostkowe
├── examples/              # Przykłady użycia
├── Makefile              # Komendy projektu
├── pyproject.toml        # Konfiguracja projektu
└── README.md             # Dokumentacja
```

## 🔧 Konfiguracja

### Silniki OCR

```python
from exef_docid import OCREngine, get_pipeline

# Użyj PaddleOCR (domyślnie)
pipeline = get_pipeline(ocr_engine=OCREngine.PADDLE)

# Użyj Tesseract
pipeline = get_pipeline(ocr_engine=OCREngine.TESSERACT)
```

### Custom prefix

```python
from exef_docid import UniversalDocumentIDGenerator

generator = UniversalDocumentIDGenerator(prefix="MOJA")
doc_id = generator.generate_universal_id("plik.pdf")
# Wynik: MOJA-PDF-A6BECE56B7FE21DC
```

## 📈 Wydajność

### Czas przetwarzania

| Format | Rozmiar | Czas | Metoda |
|--------|--------|------|--------|
| PDF (tekst) | 10KB | ~50ms | Bez OCR |
| PDF (skan) | 1MB | ~500ms | OCR |
| PNG (600x400) | 50KB | ~200ms | OCR |
| JPG (1200x800) | 200KB | ~300ms | OCR |

### Optymalizacja

```python
# Wyłącz OCR dla czystych PDF
result = process_document("czysty_pdf.pdf", use_ocr=False)

# Użyj cache dla wielokrotnego przetwarzania
pipeline = get_pipeline()
pipeline.enable_cache = True
```

## 🤝 Współpraca

1. Fork repozytorium
2. Utwórz branch (`git checkout -b feature/NowaFunkcja`)
3. Commit zmiany (`git commit -am 'Dodaj nową funkcję'`)
4. Push do brancha (`git push origin feature/NowaFunkcja`)
5. Otwórz Pull Request

## 📄 Licencja

MIT License - zobacz [LICENSE](LICENSE) dla szczegółów.

## 🆘 Wsparcie

- 📧 Email: info@softreck.dev
- 🐛 Issues: [GitHub Issues](https://github.com/softreck/exef-pl/issues)
- 📖 Dokumentacja: [GitHub Wiki](https://github.com/softreck/exef-pl/wiki)

## 🗺️ Roadmap

- [ ] Obsługa dodatkowych formatów (DOCX, XLSX)
- [ ] Integracja z bazami danych
- [ ] API REST
- [ ] Interfejs webowy
- [ ] Przetwarzanie wsadowe
- [ ] Chmura (AWS, Azure, GCP)

---

**EXEF Document ID Generator** - Deterministyczne identyfikatory dla każdego dokumentu! 🚀
