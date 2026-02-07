# Testowanie

## Testy adapterów

Plik: `backend/tests/test_adapters.py` — 51 testów

### Uruchomienie

```bash
docker compose exec backend bash -c "cd /app && python -m pytest tests/test_adapters.py -v"
```

### Pokrycie

| Kategoria | Liczba testów | Opis |
|-----------|--------------|------|
| EmailImportAdapter | 9 | Połączenie, fetch, filtrowanie dat, edge cases |
| KsefImportAdapter | 8 | Połączenie, walidacja NIP, fetch, pola |
| CsvImportAdapter | 6 | Formaty CSV, mapowanie kolumn, kwoty |
| ManualAdapters | 5 | Passive adaptery (manual, upload, webhook) |
| BankImportAdapter | 3 | Parsowanie wyciągów, ekstrakcja FV |
| Export adaptery | 11 | Każdy format eksportu + test_connection |
| Rejestr adapterów | 4 | Kompletność rejestracji |
| DocId | 5 | Determinizm, normalizacja, edge cases |

### Testy E2E

Plik: `tests/test_e2e.py` — testy end-to-end przez API HTTP

```bash
cd exef3 && python -m pytest tests/test_e2e.py -v
```

## Usługi testowe Docker

| Usługa | Opis | Dane testowe |
|--------|------|-------------|
| `test-imap` | Dovecot IMAP | 7+ emaili z fakturami (CSV, XML, PDF) |
| `mock-ksef` | FastAPI KSeF | 10 faktur (I-III 2026) |
| `smtp-server` | Test SMTP | Odbiór emaili z systemu |

Usługi testowe uruchamiają się automatycznie z `docker compose up`.
