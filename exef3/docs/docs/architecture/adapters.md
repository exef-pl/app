# Architektura adapterów

System EXEF używa wzorca **adapter** do obsługi różnych źródeł importu i celów eksportu.

## Klasy bazowe

Plik: `backend/app/adapters/base.py`

### BaseImportAdapter

```python
class BaseImportAdapter(ABC):
    def __init__(self, config: dict, source_name: str = "")
    def fetch(self, period_start, period_end) -> List[ImportResult]
    def test_connection(self) -> dict  # {"ok": bool, "message": str}
```

### BaseExportAdapter

```python
class BaseExportAdapter(ABC):
    def __init__(self, config: dict, source_name: str = "")
    def export(self, documents, task_name) -> ExportResult
    def test_connection(self) -> dict
```

### ImportResult

Struktura danych zwracana przez adaptery importu:

- `doc_type` — typ dokumentu (invoice, correction, receipt, ...)
- `number` — numer dokumentu
- `contractor_name`, `contractor_nip` — dane kontrahenta
- `amount_net`, `amount_vat`, `amount_gross` — kwoty
- `currency` — waluta (domyślnie PLN)
- `document_date` — data dokumentu
- `source` — identyfikator źródła (email, ksef, csv, ...)
- `source_id` — unikalny ID w ramach źródła

### ExportResult

- `content` — zawartość pliku
- `filename` — nazwa pliku
- `format` — format (csv, xml)
- `docs_exported` — liczba wyeksportowanych dokumentów
- `encoding` — kodowanie pliku

## Rejestr adapterów

Plik: `backend/app/adapters/registry.py`

Mapuje typ źródła na klasę adaptera:

```python
IMPORT_ADAPTERS = {
    "email": EmailImportAdapter,
    "ksef": KsefImportAdapter,
    "csv": CsvImportAdapter,
    "upload": UploadImportAdapter,
    "manual": ManualImportAdapter,
    "webhook": WebhookImportAdapter,
    "bank": BankGenericImportAdapter,
    "bank_ing": BankINGImportAdapter,
    # ...
}

EXPORT_ADAPTERS = {
    "wfirma": WfirmaExportAdapter,
    "jpk_pkpir": JpkPkpirExportAdapter,
    "comarch": ComarchExportAdapter,
    "symfonia": SymfoniaExportAdapter,
    "enova": EnovaExportAdapter,
    "csv": CsvExportAdapter,
}
```

## Usługi Docker (lokalne)

Zamiast mocków w kodzie, EXEF używa **prawdziwych lokalnych usług** Docker:

| Usługa | Port | Opis |
|--------|------|------|
| `test-imap` | 1143→143 | Serwer Dovecot z seedowanymi emailami |
| `mock-ksef` | 8180→8080 | Serwer FastAPI symulujący KSeF API |

Te usługi zachowują się jak prawdziwe serwery — adaptery łączą się z nimi przez TCP/HTTP, tak samo jak z produkcyjnymi usługami.

## Dodawanie nowego adaptera

1. Utwórz plik `backend/app/adapters/import_xxx.py` lub `export_xxx.py`
2. Zaimplementuj klasę dziedziczącą z `BaseImportAdapter` / `BaseExportAdapter`
3. Dodaj wpis do `IMPORT_ADAPTERS` / `EXPORT_ADAPTERS` w `registry.py`
4. Dodaj testy w `backend/tests/test_adapters.py`
