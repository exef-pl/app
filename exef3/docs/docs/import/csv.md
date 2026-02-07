# Import z CSV

Adapter `CsvImportAdapter` parsuje przesłane pliki CSV z elastycznym mapowaniem kolumn.

## Obsługiwane formaty

- Separator: automatyczna detekcja (`;` lub `,`)
- Kodowanie: UTF-8
- Nagłówki: wymagane w pierwszym wierszu

## Mapowanie kolumn

System automatycznie rozpoznaje kolumny po nazwie (case-insensitive):

| Pole | Rozpoznawane nazwy kolumn |
|------|--------------------------|
| Numer dokumentu | `number`, `numer`, `nr`, `nr_dokumentu`, `numer_faktury` |
| Kontrahent | `contractor_name`, `kontrahent`, `nazwa`, `dostawca`, `odbiorca` |
| NIP | `contractor_nip`, `nip`, `nip_kontrahenta` |
| Kwota netto | `amount_net`, `netto`, `kwota_netto` |
| VAT | `amount_vat`, `vat`, `kwota_vat` |
| Kwota brutto | `amount_gross`, `brutto`, `kwota_brutto`, `kwota` |
| Data | `document_date`, `data`, `date`, `data_dokumentu` |
| Typ | `doc_type`, `typ`, `type` |
| Opis | `description`, `opis` |
| Kategoria | `category`, `kategoria` |

## Przykładowy plik CSV

```csv
numer;kontrahent;nip;data;netto;vat;brutto;waluta
FV/001/03/2026;OVH Sp. z o.o.;5213003700;2026-03-05;1219.51;280.49;1500.00;PLN
FV/002/03/2026;Hetzner Online GmbH;;2026-03-10;2439.02;560.98;3000.00;PLN
```

## Obsługiwane formaty kwot

- `1234.56` — standardowy
- `1234,56` — polski format
- `1 234,56` — z separatorem tysięcy

## Obsługiwane formaty dat

- `2026-03-05` (YYYY-MM-DD)
- `05-03-2026` (DD-MM-YYYY)
- `05.03.2026` (DD.MM.YYYY)
- `05/03/2026` (DD/MM/YYYY)

## Jak używać

1. W zakładce **📥 Import** kliknij **Prześlij CSV**
2. Wybierz plik CSV z dysku
3. System automatycznie rozpozna kolumny i zaimportuje dokumenty

!!! warning "Deduplikacja"
    Dokumenty z identycznym `doc_id` (NIP + numer + data + kwota) zostaną pominięte jeśli już istnieją w zadaniu.
