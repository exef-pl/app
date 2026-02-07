# Import dokumentów

System EXEF obsługuje automatyczny import dokumentów z wielu źródeł. Każde źródło jest obsługiwane przez dedykowany **adapter importu**.

## Jak działa import?

1. W projekcie konfiguruje się **źródła danych** (DataSource) — np. skrzynka email, konto KSeF
2. Przy tworzeniu zadania (np. "Marzec 2026") system importuje dokumenty z wszystkich źródeł
3. Adapter pobiera dokumenty, parsuje je i tworzy rekordy w bazie
4. **Deduplikacja** — system automatycznie pomija dokumenty, które już istnieją (na podstawie `doc_id`)

## Dostępne adaptery importu

| Adapter | Typ źródła | Opis |
|---------|-----------|------|
| [EmailImportAdapter](email.md) | `email` | IMAP — skanuje skrzynkę email |
| [KsefImportAdapter](ksef.md) | `ksef` | KSeF API — pobiera e-faktury |
| [CsvImportAdapter](csv.md) | `csv` | Parsuje przesłany plik CSV |
| [BankGenericImportAdapter](bank.md) | `bank` | Wyciągi bankowe (generyczny) |
| BankINGImportAdapter | `bank_ing` | Wyciągi ING Bank |
| BankMBankImportAdapter | `bank_mbank` | Wyciągi mBank |
| BankPKOImportAdapter | `bank_pko` | Wyciągi PKO BP |
| BankSantanderImportAdapter | `bank_santander` | Wyciągi Santander |
| BankPekaoImportAdapter | `bank_pekao` | Wyciągi Pekao SA |
| [ManualImportAdapter](manual.md) | `manual` | Ręczne dodawanie |
| [UploadImportAdapter](manual.md) | `upload` | Upload plików |
| [WebhookImportAdapter](manual.md) | `webhook` | Webhook z zewnątrz |

## Proces importu (krok po kroku)

```
Użytkownik klika "Importuj"
    ↓
Backend pobiera DataSource + Task
    ↓
get_import_adapter(source_type) → AdapterClass
    ↓
adapter.fetch(period_start, period_end) → List[ImportResult]
    ↓
Deduplikacja: porównanie doc_id / source_id z istniejącymi
    ↓
Tworzenie Document + DocumentMetadata + Routing
    ↓
Aktualizacja statystyk zadania (docs_total, import_status)
```

## Deduplikacja

Każdy dokument otrzymuje deterministyczny identyfikator `doc_id` na podstawie:

- **NIP kontrahenta** (znormalizowany)
- **Numer faktury** (case-insensitive)
- **Data dokumentu**
- **Kwota brutto**

Format: `DOC-FV-{hash[:16]}` (np. `DOC-FV-FA4620F557AA187C`)

Jeśli dokument z takim `doc_id` już istnieje w zadaniu — jest pomijany podczas importu.

!!! tip "Wskazówka"
    Zakładka **⚠️ Duplikaty** w prawym panelu pozwala przeglądać i usuwać duplikaty.
