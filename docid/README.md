# EXEF Document ID Generator

Deterministyczny generator identyfikatorów dokumentów z OCR. Generuje **zawsze ten sam ID** dla tego samego dokumentu, niezależnie od formatu źródłowego (skan, PDF, KSeF XML).

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

### Python API

```python
from exef_docid import (
    process_document,
    get_document_id,
    verify_document_id,
    DocumentPipeline,
)

# Prosty przypadek - tylko ID
doc_id = get_document_id("faktura.pdf")
print(doc_id)  # EXEF-FV-A7B3C9D2E1F04856

# Pełne przetwarzanie
result = process_document("faktura.pdf")
print(result.document_id)                    # EXEF-FV-A7B3C9D2E1F04856
print(result.extraction.issuer_nip)          # 5213017228
print(result.extraction.invoice_number)      # FV/2025/00142
print(result.extraction.gross_amount)        # 1230.50
print(result.ocr_confidence)                 # 0.95

# Weryfikacja - czy skan to ta sama faktura?
is_same = verify_document_id("skan.jpg", "EXEF-FV-A7B3C9D2E1F04856")

# Batch processing
pipeline = DocumentPipeline()
results = pipeline.process_batch(["dok1.pdf", "dok2.jpg", "dok3.pdf"])
for r in results:
    if not r.is_duplicate:
        print(f"{r.source_file}: {r.document_id}")
```

### CLI

```bash
# Przetwórz plik
docid process faktura.pdf

# Przetwórz wiele plików
docid process *.pdf --output results.json

# Przetwórz cały katalog
docid batch ./dokumenty/ --output batch_results.json

# Weryfikacja
docid verify skan.jpg EXEF-FV-A7B3C9D2E1F04856

# Tylko OCR (bez generowania ID)
docid ocr skan.jpg --verbose

# Wygeneruj ID bez OCR (z podanych danych)
docid generate-id \
    --type invoice \
    --nip 5213017228 \
    --number "FV/2025/00142" \
    --date 2025-01-15 \
    --amount 1230.50
```

## 📄 Obsługiwane typy dokumentów

| Typ | Kod | Pola kanoniczne |
|-----|-----|-----------------|
| Faktura VAT | `FV` | NIP sprzedawcy \| Numer \| Data \| Kwota brutto |
| Paragon | `PAR` | NIP sprzedawcy \| Data \| Kwota \| Nr kasy |
| Umowa | `UMO` | NIP strona 1 \| NIP strona 2 (sorted) \| Data \| Numer |
| Faktura korygująca | `KOR` | NIP \| Nr korekty \| Data \| Nr oryginału \| Kwota |
| Wyciąg bankowy | `WB` | Nr konta \| Data \| Nr wyciągu |
| Inny dokument | `DOC` | Hash treści \| Data |

## 🔧 Jak działa?

### 1. OCR (jeśli potrzebny)

Dla skanów i obrazów - ekstrakcja tekstu z PaddleOCR lub Tesseract.

### 2. Ekstrakcja danych

Automatyczne rozpoznanie typu dokumentu i wyciągnięcie kluczowych pól:
- NIP-y (z walidacją checksum)
- Kwoty (brutto, netto, VAT)
- Daty (różne formaty)
- Numery dokumentów

### 3. Normalizacja

Standaryzacja danych przed hashowaniem:

```python
NIP: "521-301-72-28" → "5213017228"
Kwota: "1 230,50 zł" → "1230.50"
Data: "15.01.2025" → "2025-01-15"
Numer: "fv/2025/142" → "FV/2025/142"
```

### 4. Generowanie ID

```
canonical = "5213017228|FV/2025/00142|2025-01-15|1230.50"
hash = SHA256(canonical)[:16]
document_id = f"EXEF-FV-{hash}"  # EXEF-FV-A7B3C9D2E1F04856
```

## 🔒 Format identyfikatora

```
EXEF-FV-A7B3C9D2E1F04856
│    │  └── 16 znaków hex (64 bity entropii)
│    └── Typ dokumentu (FV, PAR, UMO, KOR, WB, DOC)
└── Prefiks systemu (konfigurowalny)
```

## ⚡ Wydajność (CPU i5)

| Silnik | Czas/stronę | RAM | Jakość polskiego |
|--------|-------------|-----|------------------|
| PaddleOCR | ~2s | ~1GB | ⭐⭐⭐⭐⭐ |
| Tesseract | ~0.5s | ~200MB | ⭐⭐⭐⭐ |

**Rekomendacja:** PaddleOCR dla najlepszej jakości, Tesseract gdy priorytetem jest szybkość.

## 🔌 Generowanie ID bez OCR

Jeśli masz już dane (np. z KSeF XML), możesz generować ID bezpośrednio:

```python
from exef_docid import generate_invoice_id, generate_receipt_id

# Faktura
doc_id = generate_invoice_id(
    seller_nip="5213017228",
    invoice_number="FV/2025/00142",
    issue_date="2025-01-15",
    gross_amount=1230.50,
)

# Paragon
doc_id = generate_receipt_id(
    seller_nip="5213017228",
    receipt_date="2025-01-15",
    gross_amount=45.99,
    cash_register_number="001",
)
```

## 🧪 Testowanie

```bash
# Instalacja dev dependencies
pip install -e ".[dev]"

# Uruchom testy
pytest

# Z coverage
pytest --cov=exef_docid
```

## 📋 Wymagania systemowe

- Python 3.9+
- Dla PDF: `poppler-utils` (`apt install poppler-utils`)
- Dla Tesseract: `tesseract-ocr tesseract-ocr-pol`

## 🤝 Integracja z EXEF

Ten pakiet jest częścią systemu [EXEF](https://github.com/softreck/exef) - Document Flow Engine dla polskich firm.

```python
# W systemie EXEF
from exef_docid import DocumentPipeline

pipeline = DocumentPipeline(id_prefix="EXEF")
result = pipeline.process(uploaded_file)

# Zapisz w bazie
document = Document(
    exef_id=result.document_id,
    ksef_id=None,  # Uzupełni się po wysłaniu do KSeF
    seller_nip=result.extraction.issuer_nip,
    invoice_number=result.extraction.invoice_number,
    ...
)
```

## 📜 Licencja

MIT License - używaj swobodnie w projektach komercyjnych i open source.
